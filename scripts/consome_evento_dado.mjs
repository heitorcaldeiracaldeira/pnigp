// CONSUMIDOR DE DADO — lê a fila `pncp_evento` e preenche SÓ A FATIA que o evento aponta.
//
// ═══ O CONCEITO (validado 2026-07-15) ═══
// O PNCP é um LOG (Inclusão/Retificação/Exclusão sobre 4 categorias), não um banco de estado. O evento já diz
// QUAL processo, QUAL item, QUAL resultado, QUAL tipo de documento e QUEM publicou. **Não se pergunta "mudou?" —
// o log já disse.** Aqui a busca é CONSEQUÊNCIA do evento, nunca investigação.
//
// Isto substitui a varredura: 1.206.510 GETs (~16h) → ~1.000/dia. E dispensa a máquina de estado
// (`itens_proc_feitos`, `marca_ata_feitas`, `*_versao`), que só existia p/ responder "já processei isso?" —
// pergunta que num log com posição não existe: a posição é a flag `consumido_dado`.
//
// ═══ O QUE CADA EVENTO MANDA FAZER ═══
//   cat 5 (Resultado)     → GET /itens/{n}/resultados → item_resultado_sc  [+ itens_sc: vencedor/preço]
//   cat 4 (Item)          → GET /itens/{n}            → itens_sc
//   cat 1 (Contratação)   → GET /compras/{ano}/{seq}  → contratacoes_sc
//   cat 6 (Documento)     → NÃO baixa aqui. O evento já traz `documento_tipo`: só o tipo 16 ("Outros Documentos")
//                           interessa (é onde a ata mora). Marca p/ o baixador — 1 chamada a menos.
//   cat 6 + AÇÃO 2        → 🔴 EXCLUSÃO. INVALIDA o texto que temos. Sem isto a base guarda ata que o PNCP já
//                           apagou, e ninguém descobre. Justificativa real: "Arquivo excluído pelo sistema para
//                           inclusão de um novo arquivo". Achado no dado — o manual não diz.
//
// node scripts/consome_evento_dado.mjs        (LOTE=200 CONC=6 DRY=1 opcionais)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { pegaTrava } from "./trava_processo.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const LOTE = Number(process.env.LOTE || 200), CONC = Number(process.env.CONC || 6);
const DRY = process.env.DRY === "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (x) => (x == null || x === "" ? null : (Number(x) || 0));
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
db.on("error", () => {});
const q = async (s, p) => { let u; for (let i = 0; i < 10; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (["22P05","23505","23502","42703","42P10"].includes(e.code)) throw e; await sleep(1500 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };
async function get(url) {
  for (let t = 0; t < 6; t++) {
    try {
      const r = await fetch(url, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(25000) });
      if (r.status === 204) return [];
      if (r.status === 429) { await sleep(4000 + t * 4000); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1000 * (t + 1)); }
  }
  return null;   // esgotou → NÃO marca consumido: o evento fica na fila e volta no próximo ciclo
}

// ═══ TRAVA — A EXCLUSÃO TEM QUE MORAR AQUI, NÃO EM QUEM CHAMA ═══
// Este consumidor é alcançável por QUATRO portas: a tarefa horária "PNIGP - Itens API", a fonte `eventos_dado`
// do orquestrador (que o chama com LOTE=300), o run_enriquecimento_diario.cmd (LOTE=15000) e o runner. Uma
// trava posta em qualquer uma delas deixaria as outras três passando por baixo.
// E a fila NÃO se protege sozinha: o SELECT pega `consumido_dado IS NULL ... LIMIT LOTE` sem FOR UPDATE SKIP
// LOCKED, então dois consumidores simultâneos escolhem exatamente os MESMOS eventos e fazem o mesmo trabalho
// duas vezes contra a API do PNCP. Enquanto a fila não tiver claim próprio, a exclusão vive aqui.
// Sair com 0 quando não pega: não é falha, é "tem alguém drenando agora".
const trava = await pegaTrava(db, "cadeia_itens", { toleranciaMin: 30 });
if (!trava.ok) {
  console.log(`já há um consumidor de evento em curso (${trava.donoAtual}, há ${trava.minRodando} min) — saindo sem tocar na fila`);
  await db.end();
  process.exit(0);
}

// coluna p/ o baixador de PDF saber o que vale a pena (o evento já disse o tipo — não precisa listar /arquivos)
await q(`ALTER TABLE pncp_evento ADD COLUMN IF NOT EXISTS alvo_download bool`);
await q(`ALTER TABLE arquivo_texto_sc ADD COLUMN IF NOT EXISTS excluido_em timestamptz`);

// ═══ DEAD-LETTER: O EVENTO QUE SEMPRE FALHA NÃO PODE FICAR NA FILA PARA SEMPRE ═══
// Até aqui, falha era `continue` sem marcar nada: o evento voltava no lote seguinte, e no seguinte, sem
// limite e sem contador. Um punhado de eventos insistentes come vaga de lote todo dia e nunca sai.
// Agora cada falha incrementa `tentativas`; ao chegar em MAX_TENT o evento ESTACIONA e sai da fila.
// Estacionar NÃO é apagar e NÃO é "consumir": fica em `estacionado_em` com o `ultimo_erro` que o matou,
// e o rodapé desta rodada diz quantos estão parados ali. A lição do vigia de 06/ago vale aqui: sumir em
// silêncio é pior que falhar alto. Para reprocessar, basta zerar estacionado_em.
await q(`ALTER TABLE pncp_evento ADD COLUMN IF NOT EXISTS tentativas int NOT NULL DEFAULT 0`);
await q(`ALTER TABLE pncp_evento ADD COLUMN IF NOT EXISTS ultimo_erro text`);
await q(`ALTER TABLE pncp_evento ADD COLUMN IF NOT EXISTS estacionado_em timestamptz`);
const MAX_TENT = Number(process.env.MAX_TENT || 5);

const fila = (await q(`SELECT ctid, * FROM pncp_evento WHERE consumido_dado IS NULL AND estacionado_em IS NULL
  ORDER BY ocorrido_em LIMIT ${LOTE}`)).rows;
console.log(`fila: ${fila.length} eventos a consumir${DRY ? " · DRY-RUN" : ""}\n`);
const feito = { res: 0, item: 0, contr: 0, doc: 0, excl: 0, erro: 0, estacionados: 0 };
let i = 0;

// conta a falha e estaciona quem esgotou as tentativas. Devolve nada: quem chama segue para o próximo.
async function falhou(e, motivo) {
  feito.erro++;
  if (DRY) return;
  const n = (e.tentativas || 0) + 1;
  const parar = n >= MAX_TENT;
  if (parar) feito.estacionados++;
  await q(`UPDATE pncp_evento SET tentativas=$1, ultimo_erro=$2, estacionado_em=$3 WHERE ctid=$4`,
    [n, String(motivo || "").slice(0, 500), parar ? new Date() : null, e.ctid]).catch(() => {});
}

await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < fila.length) {
    const e = fila[i++];
    const base = `${PNCP}/orgaos/${e.cnpj}/compras/${e.ano}/${e.seq}`;
    try {
      // ── cat 6 + ação 2: EXCLUSÃO. Nenhuma chamada — o evento basta. Invalida o que temos.
      if (e.categoria === 6 && e.acao === 2) {
        if (!DRY && e.documento_sequencial > 0)
          await q(`UPDATE arquivo_texto_sc SET excluido_em=now() WHERE cnpj=$1 AND ano=$2 AND seq=$3
            AND sequencial_documento=$4 AND excluido_em IS NULL`, [e.cnpj, e.ano, e.seq, e.documento_sequencial]);
        feito.excl++;
      }
      // ── cat 6 (Inclusão/Retificação): o evento JÁ TRAZ o tipo. Só o 16 ("Outros Documentos") tem ata.
      else if (e.categoria === 6) {
        const vale = /outros documentos/i.test(String(e.documento_tipo || ""));
        // marca alvo_download E consumido_dado NA MESMA UPDATE: a UPDATE move a linha (novo ctid), então a marcação
        // genérica lá embaixo (WHERE ctid=<antigo>) erraria o alvo e o evento voltaria eterno na fila. Aqui já resolve.
        if (!DRY) await q(`UPDATE pncp_evento SET alvo_download=$1, consumido_dado=now() WHERE ctid=$2`, [vale, e.ctid]);
        feito.doc++;
      }
      // ── cat 5: RESULTADO publicado → busca só ESTE item. É o evento que mais vale.
      else if (e.categoria === 5 && e.item_numero > 0) {
        const rs = await get(`${base}/itens/${e.item_numero}/resultados`);
        if (rs === null) { await falhou(e, "resultado: sem resposta do PNCP"); continue; }   // volta na fila até esgotar
        if (Array.isArray(rs) && rs.length && !DRY) {
          const B = { sr: [], ni: [], no: [], tp: [], qh: [], vu: [], vt: [], pd: [], po: [], nj: [], or: [], si: [], dr: [] };
          for (const r of rs) {
            B.sr.push(Number(r.sequencialResultado) || 1); B.ni.push(r.niFornecedor || null);
            B.no.push(String(r.nomeRazaoSocialFornecedor || "").slice(0, 160) || null); B.tp.push(r.tipoPessoa || null);
            B.qh.push(num(r.quantidadeHomologada)); B.vu.push(num(r.valorUnitarioHomologado));
            B.vt.push(num(r.valorTotalHomologado)); B.pd.push(num(r.percentualDesconto));
            B.po.push(r.porteFornecedorNome || null); B.nj.push(String(r.naturezaJuridicaNome || "").slice(0, 120) || null);
            B.or.push(r.ordemClassificacaoSrp != null ? Number(r.ordemClassificacaoSrp) : null);
            B.si.push(r.situacaoCompraItemResultadoNome || null); B.dr.push(r.dataResultado || null);
          }
          await q(`INSERT INTO item_resultado_sc (cod_ibge,cnpj,ano,seq,numero,sequencial_resultado,ni_fornecedor,
              nome_razao_social_fornecedor,tipo_pessoa,quantidade_homologada,valor_unitario_homologado,
              valor_total_homologado,percentual_desconto,porte_fornecedor_nome,natureza_juridica_nome,
              ordem_classificacao_srp,situacao_resultado,data_resultado)
            SELECT $1,$2,$3,$4,$5, t.* FROM unnest($6::int[],$7::text[],$8::text[],$9::text[],$10::numeric[],
              $11::numeric[],$12::numeric[],$13::numeric[],$14::text[],$15::text[],$16::int[],$17::text[],$18::date[])
              AS t(sequencial_resultado,ni_fornecedor,nome_razao_social_fornecedor,tipo_pessoa,quantidade_homologada,
                   valor_unitario_homologado,valor_total_homologado,percentual_desconto,porte_fornecedor_nome,
                   natureza_juridica_nome,ordem_classificacao_srp,situacao_resultado,data_resultado)
            ON CONFLICT (cnpj,ano,seq,numero,sequencial_resultado) DO UPDATE SET
              ni_fornecedor=EXCLUDED.ni_fornecedor, nome_razao_social_fornecedor=EXCLUDED.nome_razao_social_fornecedor,
              valor_unitario_homologado=EXCLUDED.valor_unitario_homologado, valor_total_homologado=EXCLUDED.valor_total_homologado,
              quantidade_homologada=EXCLUDED.quantidade_homologada, ordem_classificacao_srp=EXCLUDED.ordem_classificacao_srp,
              situacao_resultado=EXCLUDED.situacao_resultado, atualizado=now()`,
            [e.cod_ibge, e.cnpj, e.ano, e.seq, e.item_numero, B.sr, B.ni, B.no, B.tp, B.qh, B.vu, B.vt, B.pd, B.po, B.nj, B.or, B.si, B.dr]);
          // achata o 1º em itens_sc (o vencedor), como as queries de produção esperam
          const r0 = rs[0];
          await q(`UPDATE itens_sc SET unit_homologado=$5, fornecedor=$6, cnpj_fornecedor=$7, porte_fornecedor=$8
            WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND numero=$4`,
            [e.cnpj, e.ano, e.seq, e.item_numero, num(r0.valorUnitarioHomologado),
             String(r0.nomeRazaoSocialFornecedor || "").slice(0, 160) || null, r0.niFornecedor || null, r0.porteFornecedorNome || null]);
        }
        feito.res++;
      }
      // ── cat 4: ITEM incluído/retificado → rebusca só ESTE item
      else if (e.categoria === 4 && e.item_numero > 0) {
        const it = await get(`${base}/itens/${e.item_numero}`);
        if (it === null) { await falhou(e, "item: sem resposta do PNCP"); continue; }
        const o = Array.isArray(it) ? it[0] : it;
        if (o && !DRY)
          await q(`UPDATE itens_sc SET descricao=$5, quantidade=$6, unit_estimado=$7, situacao=$8,
              situacao_id=$9, tem_resultado=$10, tipo_beneficio_id=$11, criterio_julgamento_id=$12,
              orcamento_sigiloso=$13, informacao_complementar=$14, data_atualizacao=$15
            WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND numero=$4`,
            [e.cnpj, e.ano, e.seq, e.item_numero, String(o.descricao || "").slice(0, 2048) || null,
             num(o.quantidade), num(o.valorUnitarioEstimado), o.situacaoCompraItemNome || null,
             num(o.situacaoCompraItem), o.temResultado === true, num(o.tipoBeneficio),
             num(o.criterioJulgamentoId), o.orcamentoSigiloso === true,
             String(o.informacaoComplementar || "").slice(0, 2048) || null,
             o.dataAtualizacao ? String(o.dataAtualizacao).slice(0, 19) : null]);
        feito.item++;
      }
      // ── cat 1: CONTRATAÇÃO → só marca o evento consumido, NÃO escreve contratacoes_sc.
      //    `data_atualizacao` é o ESPELHO FIEL do campo oficial `dataAtualizacao` do PNCP (LEI 1), dono = ingest_contratacoes_sc.
      //    Escrever aqui o `ocorrido_em` (proxy) contamina o espelho; buscar o valor oficial trava (/pncp=301 morto, /consulta=429).
      //    O dado da contratação já vem fiel do ingest_contratacoes_sc — o evento cat 1 aqui só limpa a fila.
      else if (e.categoria === 1) {
        feito.contr++;
      }
      if (!DRY) await q(`UPDATE pncp_evento SET consumido_dado=now() WHERE ctid=$1`, [e.ctid]);
    } catch (err) { await falhou(e, err.message); if (feito.erro <= 5) console.log(`  ⚠ ${e.ano}/${e.seq} cat${e.categoria}: ${err.message.slice(0, 70)}`); }
  }
}));

console.log(`✔ consumidos: ${feito.res} resultado · ${feito.item} item · ${feito.contr} contratação · ${feito.doc} documento · ${feito.excl} EXCLUSÃO · ${feito.erro} erros`);
const p = (await q(`SELECT count(*) FILTER (WHERE consumido_dado IS NULL AND estacionado_em IS NULL) pend,
  count(*) FILTER (WHERE alvo_download) baixar,
  count(*) FILTER (WHERE estacionado_em IS NOT NULL) parados FROM pncp_evento`)).rows[0];
console.log(`  fila restante: ${p.pend} · documentos tipo 16 a baixar: ${p.baixar}`);
if (feito.estacionados) console.log(`  ⏹ ${feito.estacionados} evento(s) ESTACIONADOS agora (${MAX_TENT} tentativas sem passar)`);
if (Number(p.parados) > 0) {
  console.log(`  ⏹ dead-letter: ${p.parados} evento(s) parados no total — não voltam sozinhos.`);
  const top = (await q(`SELECT ultimo_erro, count(*) n FROM pncp_evento WHERE estacionado_em IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 3`)).rows;
  for (const t of top) console.log(`     ${t.n}× ${String(t.ultimo_erro || "?").slice(0, 90)}`);
}
await trava.solta();
await db.end();
