// ENRIQUECEDOR — consome o corpus JÁ GUARDADO (arquivo_texto_sc + itens_sc) e, por item, percorre TODOS os
// documentos da construção DO PRIMEIRO AO ÚLTIMO (DFD→ETP→TR→Edital…), localiza a descrição do item em CADA um e
// grava a comparação. Duas tabelas (ANDAR 2, derivadas — Lei 1):
//   · app.item_enriquecimento          — 1 linha/item: O QUE TÍNHAMOS (API) · O QUE ENRIQUECEMOS · COMO CHEGAMOS
//   · app.item_documento_evidencia     — 1 linha/(item×documento): a descrição em CADA doc, na ordem da construção
// NÃO toca no PNCP e NÃO toca no motor do CATMAT. Resumível, idempotente. node scripts/enriquece_item_documento.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { casa } from "./casa_itens.mjs";
import { recortaBloco } from "./recorte_bloco.mjs";
import { casaPorCelula } from "./casa_por_celula.mjs";
import { escolheRecorte } from "./escolhe_recorte.mjs";
import { ehEspecificacao } from "./classifica_especificacao.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LIMIT = Number(process.env.LIMIT || 0);
const CONC = Number(process.env.CONC || 4);
// PARALELISMO POR NÚCLEO: cada processo pega uma FATIA disjunta (shard) por hash do processo. NSHARD=nº de cores.
const NSHARD = Number(process.env.NSHARD || 1);
const SHARD = Number(process.env.SHARD || 0);
const RANK = { alta: 3, media: 2, baixa: 1 };
// ORDEM DA CONSTRUÇÃO (fase preparatória → publicação) — o "primeiro ao último documento"
const FASE = { 10: "DFD", 7: "ETP", 5: "Anteprojeto", 6: "Projeto Básico", 8: "Projeto Executivo", 4: "TR",
  9: "Mapa de Riscos", 3: "Minuta do Contrato", 1: "Aviso de Contratação Direta", 2: "Edital", 20: "Ato de Contratação Direta", 16: "Outros" };
const ORDER = [10, 7, 5, 6, 8, 4, 9, 3, 1, 2, 20, 16];
const CRIACAO = ORDER;
const PRIO_CAT = [4, 2, 6, 7];   // código de catálogo: TR, Edital, PB, ETP primeiro
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function catalogo(docNorm, off) {
  if (off == null) return null;
  const nums = [...docNorm.slice(Math.max(0, off - 45), off + 5).matchAll(/\b\d{5,9}\b/g)].map((m) => m[0]);
  return nums.length ? nums[nums.length - 1] : null;
}
// BLOCO de spec = do anchor do item ATÉ o anchor do próximo item no MESMO doc (capado)
const BLOCO_CAP = Number(process.env.BLOCO_CAP || 2500); // teto do bloco de spec (era 600 → truncava multi-atributo)
const RECUO = Number(process.env.RECUO || 60);           // contexto antes da âncora (nº do item, unidade)

// A fronteira do recorte vive em recorte_bloco.mjs, com o histórico do defeito e o teste que o trava.
const bloco = (docNorm, off, offs, cap = BLOCO_CAP) => recortaBloco(docNorm, off, offs, cap, RECUO);
// ⚠️ TENTATIVA REVERTIDA EM 08/ago — o teto de confiança pelo grau do recorte PIOROU, e fica registrado
// para não ser refeito. A hipótese era boa: convergência de documentos com o MESMO defeito não é
// evidência (edital, TR e ETP repetem a mesma tabela, e o mesmo recorte errado aparece nos três).
// Só que a premissa que a sustentava era FALSA. Eu havia medido "929.298 alta com descrição truncada"
// usando o percentual de descrições que começam com letra minúscula — e `norm()` faz toLowerCase, então
// 100% começa minúsculo. A métrica não media truncamento nenhum.
// Medido do jeito certo (a descrição contém as palavras significativas do item), em 1.760.783 linhas:
//                        itens      contém o item
//   antigo / alta       925.252         81,5%
//   antigo / media      510.089         86,7%
//   novo (com teto) / alta  212.582     77,7%
//   novo (com teto) / media   5.742     73,6%
// O carimbo antigo já acertava 81,5% no `alta`; o teto derrubou para 77,7% ao rebaixar linhas que estavam
// certas. O que fica em aberto — e NÃO se conserta com teto — é que no antigo `media` acerta MAIS que
// `alta` (86,7% × 81,5%): a escala está invertida, e isso pede outro tratamento, com medição própria.
// ⭐ REGRA R2 (25/ago/2026) — a confiança vem da QUALIDADE do melhor documento (`conf_base`), nunca da
// contagem. A regra antiga promovia a `alta` por convergência (n>=3), e a convergência mede o CONTRÁRIO:
// edital, TR e ETP repetem a mesma tabela, então o mesmo recorte errado aparece nos três. Medido em amostra
// de 6% (cobertura = palavras do item achadas no bloco):
//         regra                          alta    media   baixa   monotônico?
//   R0    atual (promove por contagem)   65,8%   70,3%   43,6%   NÃO — invertida
//   R1    base pura                      68,7%   68,1%   37,6%   sim, por 0,6pp (fraco)
//   R2    base, rebaixa se >=4 docs      71,0%   66,5%   37,6%   SIM, 4,5pp  <-- adotada
// `alta` encolhe ~38% em volume e sobe de 65,8% para 71,0% de acerto: o rótulo passa a valer.
// A tentativa de 08/ago falhou por medir truncamento com "começa em minúscula" — e `norm()` faz toLowerCase,
// então media 100%. A régua desta vez é a cobertura das palavras do item, e está em mede_escala_confianca.mjs.
const consolida = (n, base) => (n === 0 ? "ausente" : (n >= 4 && base === "alta") ? "media" : base);

async function main() {
  // ⏱️ TIMEOUTS DE CLIENTE (02/set/2026) — sem eles o shard PENDURA PARA SEMPRE.
  // Medido em 02/set: 11 dos 12 shards saíram e o shard 6 ficou VIVO por 2 h — sem CPU, sem consulta em
  // `pg_stat_activity`, sem gravar nada. Estava bloqueado num socket morto: TCP que não fecha, resposta que
  // não vem. O `Promise.all` do lançador nunca resolveu, a cadeia nunca terminou, e a trava seguiu batendo —
  // ou seja, do lado de fora parecia trabalho em curso.
  // `statement_timeout` NÃO cobre isso: é limite do SERVIDOR para uma query que ele está executando. Se a
  // resposta nunca chega ao cliente, quem espera é o cliente, e ele espera sem prazo.
  //   query_timeout ............. prazo do CLIENTE para a resposta de uma query
  //   connectionTimeoutMillis ... prazo para o handshake (o `q()` deste arquivo já tem 5 retentativas,
  //                               então falhar rápido é melhor que pendurar: a retentativa reconecta)
  // Mesma correção aplicada ao roda.mjs no mesmo dia, pelo mesmo sintoma em outro ponto.
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3,
    statement_timeout: 120000, query_timeout: 150000, connectionTimeoutMillis: 20000 });
  db.on("error", () => {});
  const q = async (s, p) => { let u; for (let i = 0; i < 5; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (["22P05", "23502", "42703", "42P10"].includes(e.code)) throw e; await sleep(1000 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };
  // INSERT EM LOTE (multi-row) — 1 round-trip por bloco em vez de 1 por linha (destrava o Neon)
  const bulk = async (table, cols, rows, conflict, upd) => {
    if (!rows.length) return;
    const CH = 500;
    for (let s = 0; s < rows.length; s += CH) {
      const chunk = rows.slice(s, s + CH); const vals = [];
      const ph = chunk.map((r, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(",")})`).join(",");
      chunk.forEach((r) => cols.forEach((c) => vals.push(r[c])));
      const setC = upd.map((c) => `${c}=EXCLUDED.${c}`).join(",");
      await q(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${ph} ON CONFLICT (${conflict}) DO UPDATE SET ${setC}, atualizado=now()`, vals);
    }
  };
  const COLS_EV = ["cnpj","ano","seq","numero","cod_ibge","ordem","fase","tipo_id","sequencial_documento","descricao_no_documento","eh_spec","spec_score","score","conf"];
  const COLS_EN = ["cnpj","ano","seq","numero","cod_ibge","material_servico","descricao_api","unidade_api","catalogo_api","descricao_documento","descricao_e_spec","catalogo_codigo","confianca","conf_base","fonte_documento","fonte_tipo_id","n_docs","docs","metodo","trecho_ancora"];

  await q(`CREATE SCHEMA IF NOT EXISTS app`);
  await q(`CREATE TABLE IF NOT EXISTS app.item_enriquecimento (
    cnpj TEXT, ano INT, seq INT, numero INT, cod_ibge TEXT, material_servico TEXT,
    descricao_api TEXT, unidade_api TEXT, catalogo_api TEXT,
    descricao_documento TEXT, descricao_e_spec BOOLEAN, catalogo_codigo TEXT,
    confianca TEXT, fonte_documento TEXT, fonte_tipo_id INT, n_docs INT, docs TEXT, metodo TEXT, trecho_ancora TEXT,
    atualizado timestamptz DEFAULT now(), PRIMARY KEY (cnpj, ano, seq, numero))`);
  await q(`ALTER TABLE app.item_enriquecimento ADD COLUMN IF NOT EXISTS descricao_e_spec BOOLEAN`);
  // conf_base = a confianca do MELHOR documento, ANTES de `consolida` promover por contagem. Sem ela nao ha
  // como testar regra alternativa de escala sem re-rodar o motor inteiro. Aditiva: nao muda veredito nenhum.
  await q(`ALTER TABLE app.item_enriquecimento ADD COLUMN IF NOT EXISTS conf_base TEXT`);
  await q(`CREATE TABLE IF NOT EXISTS app.item_documento_evidencia (
    cnpj TEXT, ano INT, seq INT, numero INT, cod_ibge TEXT,
    ordem INT, fase TEXT, tipo_id INT, sequencial_documento INT,
    descricao_no_documento TEXT, eh_spec BOOLEAN, spec_score NUMERIC, score NUMERIC, conf TEXT,
    atualizado timestamptz DEFAULT now(),
    PRIMARY KEY (cnpj, ano, seq, numero, tipo_id, sequencial_documento))`);
  await q(`ALTER TABLE app.item_documento_evidencia ADD COLUMN IF NOT EXISTS eh_spec BOOLEAN`);
  await q(`ALTER TABLE app.item_documento_evidencia ADD COLUMN IF NOT EXISTS spec_score NUMERIC`);
  await q(`CREATE INDEX IF NOT EXISTS ix_ienr_cod ON app.item_enriquecimento (cod_ibge)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_ienr_conf ON app.item_enriquecimento (confianca)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_iev_item ON app.item_documento_evidencia (cnpj,ano,seq,numero)`);

  // FILA MATERIALIZADA (app.fila_enriquecimento) — construída 1× por scripts/constroi_fila_enriquecimento.mjs.
  // Aqui é só um SELECT LEVE numa tabela pequena (231k linhas) + anti-join no pkey; nada de varrer os 344MB de texto.
  const lim = LIMIT ? `LIMIT ${LIMIT}` : "";
  const shardW = NSHARD > 1 ? `AND (abs(hashtext(f.cnpj||'-'||f.ano||'-'||f.seq)) % ${NSHARD}) = ${SHARD}` : "";
  // ═══ REFAZ=1 — REPROCESSA O QUE JÁ FOI ENRIQUECIDO ═══
  // O anti-join padrão só traz processo INÉDITO, e isso está certo para o ciclo diário. Mas quando o
  // MÉTODO muda — e mudou em 08/ago, com o casamento por linha de tabela — não havia como remedir sem
  // apagar a tabela. REFAZ=1 troca o anti-join por um filtro de GEOMETRIA: só processos cujo texto-fonte
  // já foi re-extraído (`layout_v=1`), que é a fatia onde o método novo tem efeito.
  const REFAZ = process.env.REFAZ === "1";
  // REFAZ=todos — re-processa a fila INTEIRA. Necessario quando muda o que se GRAVA (e nao so o metodo):
  // o REFAZ=1 filtra por layout_v=1 e alcanca 133k de 239k, entao deixaria coluna nova pela metade.
  const REFAZ_TODOS = process.env.REFAZ === "todos";
  const filtro = REFAZ_TODOS ? "TRUE" : REFAZ
    ? `EXISTS (SELECT 1 FROM public.arquivo_texto_sc t
                WHERE t.cnpj=f.cnpj AND t.ano=f.ano AND t.seq=f.seq AND t.layout_v=1)`
    // ═══ FILA DIÁRIA — INÉDITO **OU** TEXTO RE-EXTRAÍDO DEPOIS (mudado em 31/ago/2026) ═══
    // Até aqui o filtro era só o anti-join `NOT EXISTS`, e isso deixava um vão silencioso: a
    // `PNIGP - Reextrai Layout` roda todo dia e melhora a GEOMETRIA do texto — que é justamente o que
    // decide a qualidade do recorte (70,8% × 49,0%, medido em 10/ago) — mas processo já enriquecido nunca
    // voltava. Produtor na cadeia, consumidor fora. Medido em 31/ago: 228 processos com texto mais novo
    // que o próprio enriquecimento, parados para sempre.
    //
    // As duas datas são MATERIALIZADAS pelo constroi_fila (`texto_em`, `enriq_em`), então aqui não há
    // subconsulta nenhuma — só a comparação de duas colunas numa tabela de 239 k:
    //   enriq_em IS NULL     → inédito, entra (é o `NOT EXISTS` de antes, agora de graça)
    //   texto_em > enriq_em  → re-extraído depois de enriquecido, volta
    // A 1ª versão disto perguntava direto em `item_enriquecimento` por linha da fila e **passou de 120 s**,
    // vezes 12 shards; o porquê da materialização está no comentário do constroi_fila.
    // Não há laço: ao re-enriquecer, `atualizado` vira now(), o próximo constroi_fila recarimba `enriq_em`
    // acima de `texto_em` e o processo sai da fila sozinho.
    //
    // ⚠️ O `atualizado` NÃO é confiável como "data em que este processo foi enriquecido" para nada anterior
    // a 25/ago/2026: o conserto da escala de confiança carimbou now() em 2,23 M de linhas de uma vez. Este
    // filtro só enxerga re-extração posterior a essa data. O passivo antigo (133.819 processos já
    // enriquecidos que hoje têm texto com geometria) é do REFAZ=1, não daqui.
    : `f.enriq_em IS NULL OR f.texto_em > f.enriq_em`;
  const procs = (await q(`
    SELECT f.cnpj, f.ano, f.seq, f.nfases, (f.enriq_em IS NULL) AS inedito
    FROM app.fila_enriquecimento f
    WHERE ${filtro} ${shardW}
    ORDER BY f.nfases DESC ${lim}`)).rows;
  if (REFAZ_TODOS) console.log(`REFAZ=todos - reprocessando a fila inteira`);
  else if (REFAZ) console.log(`REFAZ=1 - reprocessando processos com texto ja re-extraido (layout_v=1)`);
  // O SPLIT é de propósito: "re-extraído" é a fatia nova de 31/ago, e é a que pode virar churn se algum dia
  // a re-extração passar a carimbar `atualizado` sem mudar o texto. Deixar o número à vista é o que faz
  // esse defeito aparecer no log em vez de virar custo silencioso de Neon.
  const nIneditos = procs.filter((p) => p.inedito).length;
  console.log(`[shard ${SHARD}/${NSHARD}] enriquecer: ${procs.length.toLocaleString()} processos ` +
    `(${nIneditos.toLocaleString()} inéditos · ${(procs.length - nIneditos).toLocaleString()} re-extraídos) · conc ${CONC}`);

  let i = 0, done = 0, itensOk = 0, comDesc = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < procs.length) {
      const p = procs[i++];
      try {
        const itens = (await q(`SELECT numero, descricao, unidade, catmat, material_ou_servico FROM itens_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3 ORDER BY numero`, [p.cnpj, p.ano, p.seq]))
          .rows.map((r) => ({ numeroItem: r.numero, descricao: r.descricao, unidade: r.unidade, catmat: r.catmat, material_ou_servico: r.material_ou_servico }));
        if (!itens.length) continue;
        // documentos da construção COM texto, ORDENADOS do primeiro ao último
        const docs = (await q(`SELECT a.tipo_documento_id tid, t.sequencial_documento sd, t.texto, t.cod_ibge FROM arquivo_texto_sc t
          JOIN arquivos_sc a USING (cnpj, ano, seq, sequencial_documento)
          WHERE t.cnpj=$1 AND t.ano=$2 AND t.seq=$3 AND t.chars>500 AND t.excluido_em IS NULL AND a.tipo_documento_id = ANY($4)`, [p.cnpj, p.ano, p.seq, CRIACAO])).rows
          .sort((a, b) => ORDER.indexOf(a.tid) - ORDER.indexOf(b.tid));
        if (!docs.length) continue;
        const cod_ibge = docs[0].cod_ibge;
        // `casa` dá a âncora por TF-IDF; `casaPorCelula` dá a âncora pelo NÚMERO DO ITEM na linha da
        // tabela, que é chave e não heurística. As duas convivem: a segunda tem precedência onde confirma,
        // a primeira cobre o documento sem geometria.
        const porDoc = docs.map((d) => {
          const c = casa(itens, d.texto);
          const itensNum = itens.map((it) => ({ numero: it.numeroItem, descricao: it.descricao }));
          return { tid: d.tid, sd: d.sd, ...c, celulas: casaPorCelula(itensNum, c.docNorm) };
        });
        const evidRows = [], enrRows = [];   // acumula tudo do processo p/ gravar EM LOTE (1 ida ao banco por tabela)

        for (let k = 0; k < itens.length; k++) {
          // EVIDÊNCIA POR DOCUMENTO — a descrição do item em CADA doc (1º ao último); DEDUPE por texto (obras têm
          // dezenas de docs iguais) e CLASSIFICA o bloco (é especificação × cláusula × planilha-pobre) pelo portão.
          const evid = []; const vistos = new Set();
          for (const D of porDoc) {
            const r = D.res[k]; if (!r || r.off == null) continue;
            // ═══ O CASAMENTO POR LINHA DE TABELA TEM PRECEDÊNCIA ═══
            // Quando o documento declara o número do item numa célula própria (`pdf_layout` marcou a coluna
            // com TAB), isso é CHAVE: `itens_sc.numero` vem da mesma origem que gerou o PDF. Medido em 250
            // editais / 683 itens, contra a janela do TF-IDF:
            //   começa no item certo 35,6% → 58,0%   ·   contém ≥2 palavras 60,5% → 61,1%
            //   não contém nada      20,6% → 17,9%   ·   cobertura: 61,3% dos itens
            // Os 38,7% que a via nova não confirma ela RECUSA em vez de chutar — descrição do item vizinho
            // contamina preço normalizado e CATMAT em silêncio, e silêncio é o que mais custou aqui.
            // ⚠️ SÓ COM CONFIRMAÇÃO ALTA (>=2 palavras significativas do item na própria célula).
            // Medido: com confirmação fraca (1 palavra) a via piora o conjunto, porque ela roda sobre TODOS
            // os documentos da construção — DFD, ETP, minuta — e em documento que não é a tabela de itens
            // "linha que começa com número" casa com cláusula, anexo, cronograma. Uma palavra não separa.
            // Isolada em editais e com confirmação alta, esta via mede 58,0% de acerto no começo contra
            // 35,6% da janela; solta, arrasta o conjunto para baixo. Onde não confirma, a janela assume.
            // ═══ TODOS OS MÉTODOS CONCORREM; VENCE O QUE MEDE MELHOR NESTE DOCUMENTO ═══
            // Nenhum método ganha em tudo, e forçar um só derruba o conjunto — medido. `escolheRecorte`
            // gera um candidato por método (célula confirmada pelo nº do item, célula pela âncora, linha,
            // janela), pontua cada um contra a descrição que a API declara e devolve o vencedor com o nome
            // do método. Se NENHUM contém uma palavra do item, devolve null: o item não está neste
            // documento, e "menos ruim" com carimbo de confiança é o que contamina em silêncio.
            const esc = escolheRecorte(D.docNorm, r.off, D.res.map((x) => x && x.off),
              itens[k].descricao, D.celulas?.get(String(itens[k].numeroItem)));
            if (!esc) continue;
            const desc = esc.desc;
            const metodoRecorte = esc.metodo;
            // grau medido do recorte: NÃO entra mais na confiança (o teto foi revertido — piorou), mas
            // segue disponível na evidência para quem for atacar a escala invertida do carimbo.
            const grauRecorte = esc.grau;
            const key = desc.slice(0, 140);
            if (vistos.has(key)) continue;   // colapsa documentos repetidos com o mesmo bloco
            vistos.add(key);
            const cls = ehEspecificacao(desc);
            evid.push({ tid: D.tid, sd: D.sd, ordem: ORDER.indexOf(D.tid), fase: FASE[D.tid] || `tipo ${D.tid}`, desc, score: r.score ?? null, conf: r.conf, docNorm: D.docNorm, off: r.off, ehSpec: cls.ok, specScore: cls.score, metodoRecorte, grauRecorte });
            evidRows.push({ cnpj: p.cnpj, ano: p.ano, seq: p.seq, numero: itens[k].numeroItem, cod_ibge, ordem: ORDER.indexOf(D.tid), fase: FASE[D.tid] || `tipo ${D.tid}`, tipo_id: D.tid, sequencial_documento: D.sd, descricao_no_documento: desc, eh_spec: cls.ok, spec_score: cls.score, score: r.score ?? null, conf: r.conf });
          }
          // CONSOLIDADO — PREFERE um bloco que É especificação (portão); convergência eleva a confiança
          const specs = evid.filter((e) => e.ehSpec);
          const pool_ = specs.length ? specs : evid;
          const best = [...pool_].sort((a, b) => (b.specScore || 0) - (a.specScore || 0) || RANK[b.conf] - RANK[a.conf] || (b.score || 0) - (a.score || 0))[0];
          const conf = consolida(evid.length, best ? best.conf : "baixa");
          let cat = null;
          for (const h of [...evid].sort((a, b) => (PRIO_CAT.indexOf(a.tid) + 99) % 99 - (PRIO_CAT.indexOf(b.tid) + 99) % 99)) { cat = catalogo(h.docNorm, h.off); if (cat) break; }
          // O método do RECORTE vencedor entra no carimbo: sem ele, não há como saber qual estratégia serve
          // a qual tipo de edital — e a pergunta "qual é o melhor para cada tipo" vira suposição de novo.
          const recorteVenc = best?.metodoRecorte ? ` · recorte:${best.metodoRecorte}` : "";
          const metodo = (!best ? "sem acerto" : evid.length >= 2 ? `convergência (${evid.length} docs)` : "conteúdo") + recorteVenc;
          const trecho = best ? best.docNorm.slice(Math.max(0, best.off - 12), best.off + 48).replace(/\s+/g, " ").trim() : null;
          const fasesDistintas = [...new Set(evid.slice().sort((a, b) => a.ordem - b.ordem).map((e) => e.fase))].join(" → ");

          enrRows.push({ cnpj: p.cnpj, ano: p.ano, seq: p.seq, numero: itens[k].numeroItem, cod_ibge, material_servico: itens[k].material_ou_servico,
            descricao_api: itens[k].descricao, unidade_api: itens[k].unidade, catalogo_api: itens[k].catmat,
            descricao_documento: best ? best.desc : null, descricao_e_spec: best ? best.ehSpec : null, catalogo_codigo: cat,
            confianca: conf, conf_base: best ? best.conf : null, fonte_documento: best ? best.fase : null, fonte_tipo_id: best ? best.tid : null, n_docs: evid.length,
            docs: fasesDistintas, metodo, trecho_ancora: trecho });
          itensOk++; if (best && best.ehSpec) comDesc++;
        }
        // GRAVA EM LOTE. A DESCRIÇÃO (item_enriquecimento, 1 linha/item) é o objetivo — grava sempre.
        // A evidência (item×doc, ~milhares de linhas/processo) é auditoria — só grava se EVID=1 (senão estrangula o banco).
        await bulk("app.item_enriquecimento", COLS_EN, enrRows, "cnpj,ano,seq,numero", ["descricao_api","unidade_api","catalogo_api","descricao_documento","descricao_e_spec","catalogo_codigo","confianca","conf_base","fonte_documento","fonte_tipo_id","n_docs","docs","metodo","trecho_ancora"]);
        if (process.env.EVID === "1")
          await bulk("app.item_documento_evidencia", COLS_EV, evidRows, "cnpj,ano,seq,numero,tipo_id,sequencial_documento", ["descricao_no_documento","eh_spec","spec_score","score","conf","ordem","fase"]);
      } catch { /* deixa p/ o próximo run */ }
      if (++done % 20 === 0) process.stdout.write(`  ${done}/${procs.length} · ${itensOk} itens · ${comDesc} c/descrição\r`);
    }
  }));

  // SUMÁRIO CARO (count FILTER full-scaneia 2,1M) — SÓ quando houve trabalho. Sem isso a task de 15min gastava ~12s/rodada à toa.
  if (procs.length > 0) {
    const s = (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE descricao_documento IS NOT NULL)::int d,
      count(*) FILTER (WHERE descricao_e_spec)::int sp, count(*) FILTER (WHERE confianca='alta')::int a FROM app.item_enriquecimento`)).rows[0];
    const e = (await q(`SELECT count(*)::int n FROM app.item_documento_evidencia`)).rows[0];
    console.log(`\n✔ item_enriquecimento: ${s.n.toLocaleString()} itens · ${s.d.toLocaleString()} c/ descrição do doc · ${s.sp.toLocaleString()} que É especificação · ${s.a.toLocaleString()} conf alta`);
    console.log(`✔ item_documento_evidencia: ${e.n.toLocaleString()} linhas (item × documento, ordem da construção)`);
  } else console.log(`\n✔ nada novo p/ enriquecer (0 procs) — sem sumário caro`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
