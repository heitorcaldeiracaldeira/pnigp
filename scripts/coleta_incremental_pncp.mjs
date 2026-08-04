// COLETA INCREMENTAL DO PNCP — pergunta "o que mudou?" em vez de varrer tudo.
//
// ═══ O PROBLEMA (medido 2026-07-15) ═══
// A varredura completa custa ~1,1 MILHÃO de GETs (241.302 processos × 1 /itens + 1 /resultados por item premiado)
// = ~16h a 250 processos/min. Rodar isso todo dia para descobrir que quase nada mudou é o desperdício.
// A memória do projeto registra a "Busca diaria PNCP" DESATIVADA justamente por isso: virou refresh completo de
// ~12h e morria no limite de 3h. Este script é o conserto.
//
// ═══ AS TRÊS PEÇAS (todas MEDIDAS antes de escrever, não supostas) ═══
// 1. `/contratacoes/atualizacao` diz QUEM mudou. Medido em SC: Pregão-E 451/dia, Dispensa 365/dia. Somando as 13
//    modalidades, a ordem é ~1.000 processos/dia — não 241 mil.
// 2. `dataAtualizacao` (vem na contratação E em cada item) diz SE mudou. Igual ao gravado → NÃO busca /resultados,
//    NÃO escreve. O caro não é o INSERT: é o GET que eu faço para descobrir que está igual.
// 3. `/historico` diz O QUE mudou, em 1 chamada por processo: categoria 4=Item, 5=Resultado, 6=Documento;
//    ação 0=Inclusão, 1=Retificação. Em vez de N GETs por item para descobrir se mexeu, 1 GET diz onde mexer.
//    🔑 E é o MESMO evento que dispara a notificação: "categoria 5, ação 0" = o item acabou de homologar.
//    Detector de mudança e fonte de notificação são a mesma coisa. Ver docs/notificacoes-pncp.md.
//
// ═══ ARMADILHAS MEDIDAS (nenhuma seria adivinhada) ═══
//  · `codigoModalidadeContratacao` é OBRIGATÓRIO (400 sem ele) → varrer as 13. NÃO existe "todas".
//  · `tamanhoPagina` default é 10 → 46 páginas p/ 451 registros. Subir p/ 50 (máx medido em /publicacao).
//  · `/pca/atualizacao` usa `dataInicio`, NÃO `dataInicial` — nome diferente dos outros três.
//  · janela de 90 dias funciona (8.540 registros) → dá para recuperar buraco sem varredura completa.
//  · `/atas/atualizacao` e `/contratos/atualizacao` NÃO filtram por uf → filtrar depois, por cod_ibge.
//
// MODO NORMAL: node scripts/coleta_incremental_pncp.mjs           (últimas 48h)
// RECUPERAR BURACO: DIAS=90 node scripts/coleta_incremental_pncp.mjs
// SÓ VER, SEM GRAVAR: DRY=1 node scripts/coleta_incremental_pncp.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { upsertContratacao } from "./lib_contratacao_upsert.mjs";   // mapeamento único, compartilhado com a varredura
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CONSULTA = "https://pncp.gov.br/api/consulta/v1";
const UF = (process.env.UF || "SC").toUpperCase();          // state-agnostic: SP roda igual
const DIAS = Number(process.env.DIAS || 2);                  // 2 = ontem+hoje; até 90 (medido)
const DRY = process.env.DRY === "1";
const MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];   // §5.2 — obrigatória, não existe "todas"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 120000 });
db.on("error", () => {});
const q = async (s, p) => { let u; for (let i = 0; i < 10; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (["22P05","23505","23502","42703","42P10"].includes(e.code)) throw e; await sleep(1500 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };

async function get(url) {
  for (let t = 0; t < 6; t++) {
    try {
      const r = await fetch(url, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(30000) });
      if (r.status === 204) return { data: [], totalPaginas: 0 };
      if (r.status === 429) { await sleep(4000 + t * 4000); continue; }   // 429 agressivo: backoff longo
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1000 * (t + 1)); }
  }
  return null;
}

/** todas as páginas de um endpoint da API de consulta */
async function todas(base) {
  const out = []; let p = 1;
  for (;;) {
    const j = await get(`${base}&pagina=${p}&tamanhoPagina=50`);
    if (!j || !j.data?.length) break;
    out.push(...j.data);
    if (p >= (j.totalPaginas || 1)) break;
    p++;
    if (p > 400) { console.log(`  ⚠ parou em 400 páginas: ${base.slice(0, 70)}`); break; }   // sem corte silencioso
  }
  return out;
}

const hoje = new Date(), ini = new Date(); ini.setDate(hoje.getDate() - DIAS);
const D0 = ymd(ini), D1 = ymd(hoje);
console.log(`COLETA INCREMENTAL · ${UF} · janela ${D0}→${D1} (${DIAS}d)${DRY ? " · DRY-RUN" : ""}\n`);

await q(`ALTER TABLE contratacoes_sc ADD COLUMN IF NOT EXISTS data_atualizacao timestamptz`);
await q(`CREATE TABLE IF NOT EXISTS coleta_incremental_log (
  rodada_em timestamptz DEFAULT now(), uf TEXT, janela_ini TEXT, janela_fim TEXT,
  vistos INT, mudaram INT, iguais INT, novos INT, gets INT)`);

// ─── pncp_evento — O LOG DO PNCP ESPELHADO. É a peça central. ─────────────────────────────────────────────────
// O PNCP é um LOG (só Inclusão/Retificação): aqui ele vira fila. O evento chega → fica gravado → e CADA consumidor
// pega a sua fatia no seu tempo. Ninguém varre nada; ninguém pergunta "mudou?" — o log já disse.
//
// 🔑 UM EVENTO, DOIS CONSUMIDORES: "categoria 5, ação 0" = o resultado deste item foi publicado agora.
//    → `consumido_dado`     : preenche item_resultado_sc (a fatia, não o banco todo)
//    → `consumido_notif`    : avisa o fornecedor ("este item homologou")
//    Não são dois sistemas com integração no meio. É o mesmo evento, lido duas vezes.
//
// Chave = a do PNCP + o carimbo do evento. Idempotente: reprocessar a janela não duplica.
// Categorias (§/historico, medido em 221 eventos): 1=Contratação · 4=Item · 5=Resultado · 6=Documento
// Ações: 0=Inclusão · 1=Retificação · **2=EXCLUSÃO** (achado no dado, não no manual — ver nota abaixo)
//
// 🔴 A AÇÃO 2 = EXCLUSÃO é OBRIGATÓRIA no consumo. Eu afirmei "só 2 verbos" depois de ver 221 eventos de 9
// processos; bastaram 544 de 80 p/ o terceiro aparecer. O `tipoLogManutencaoNome` diz "Exclusão" — estava no JSON
// o tempo todo. Justificativas REAIS: "Arquivo excluído pelo sistema para inclusão de um novo arquivo"
// (Compras.gov.br) e "Arquivo sem registro de sincronização local" (ECustomize, 9 docs no mesmo segundo).
// CONSEQUÊNCIA: documento pode ser excluído e SUBSTITUÍDO. Quem só consome Inclusão baixa a ata, ela é trocada,
// e a base fica com a versão MORTA sem nunca saber. Categoria 6 + ação 2 = INVALIDE o que você tem.
await q(`CREATE TABLE IF NOT EXISTS pncp_evento (
  cnpj TEXT, ano INT, seq INT, cod_ibge TEXT,
  categoria INT, acao INT, item_numero INT, resultado_sequencial INT,
  documento_tipo TEXT, documento_titulo TEXT, documento_sequencial INT,
  usuario_nome TEXT, justificativa TEXT,
  ocorrido_em timestamptz,
  visto_em timestamptz DEFAULT now(),
  consumido_dado timestamptz,      -- quando a FATIA do dado foi preenchida (NULL = pendente)
  consumido_notif timestamptz,     -- quando a notificação saiu (NULL = pendente)
  PRIMARY KEY (cnpj, ano, seq, categoria, acao, ocorrido_em, item_numero, resultado_sequencial, documento_sequencial))`);
await q(`CREATE INDEX IF NOT EXISTS ix_evento_dado  ON pncp_evento (categoria, ocorrido_em) WHERE consumido_dado IS NULL`);
await q(`CREATE INDEX IF NOT EXISTS ix_evento_notif ON pncp_evento (categoria, ocorrido_em) WHERE consumido_notif IS NULL`);
await q(`CREATE INDEX IF NOT EXISTS ix_evento_proc  ON pncp_evento (cnpj, ano, seq)`);

// ─── 1. QUEM mudou (as 13 modalidades) ────────────────────────────────────────────────────────────────────────
let vistos = 0, gets = 0;
const mudou = [];   // {numeroControle, cnpj, ano, seq, cod_ibge, dataAtualizacao}
for (const m of MODALIDADES) {
  const rs = await todas(`${CONSULTA}/contratacoes/atualizacao?dataInicial=${D0}&dataFinal=${D1}&codigoModalidadeContratacao=${m}&uf=${UF}`);
  gets += Math.ceil(rs.length / 50) + 1;
  vistos += rs.length;
  for (const c of rs) {
    const ibge = c.unidadeOrgao?.codigoIbge != null ? String(c.unidadeOrgao.codigoIbge) : null;
    // só MUNICIPAL: cod_ibge de 7 dígitos. Unidade do Estado vaza p/ o município-sede se não filtrar.
    if (!ibge || ibge.length !== 7) continue;
    // guarda o PAYLOAD INTEIRO: ele já é a contratação completa (mesma forma de /publicacao). Sem isso, o processo
    // novo era detectado e nunca gravado — só entrava na varredura de 20 em 20 dias.
    mudou.push({ nc: c.numeroControlePNCP, cnpj: c.orgaoEntidade?.cnpj, ano: c.anoCompra,
      seq: c.sequencialCompra, ibge, dt: c.dataAtualizacao, raw: c });
  }
  if (rs.length) console.log(`  modalidade ${String(m).padStart(2)}: ${String(rs.length).padStart(5)} mudaram`);
}
console.log(`\n${vistos} registros na janela · ${mudou.length} municipais · ${gets} GETs p/ descobrir\n`);

// ─── 2. SE mudou de verdade: dataAtualizacao × o que está gravado ─────────────────────────────────────────────
// É AQUI que a economia acontece: quem não mudou não gera NENHUM GET de /itens nem de /resultados.
const conhecidos = new Map();
for (const r of (await q(`SELECT numero_controle_pncp nc, data_atualizacao dt FROM contratacoes_sc
  WHERE numero_controle_pncp = ANY($1)`, [mudou.map((x) => x.nc)])).rows) conhecidos.set(r.nc, r.dt);

const paraRefrescar = [], iguais = [], novos = [];
for (const x of mudou) {
  if (!conhecidos.has(x.nc)) { novos.push(x); paraRefrescar.push(x); continue; }
  const gravado = conhecidos.get(x.nc);
  if (gravado && x.dt && new Date(x.dt) <= new Date(gravado)) { iguais.push(x); continue; }   // NÃO mexeu
  paraRefrescar.push(x);
}
console.log(`  ${novos.length} novos · ${paraRefrescar.length - novos.length} mudaram de verdade · ${iguais.length} iguais (PULADOS, 0 GET)`);

// ─── 2b. GRAVA A CONTRATAÇÃO — o refetch incremental de verdade ────────────────────────────────────────────────
// O payload de /contratacoes/atualizacao JÁ É a contratação completa: gravar aqui custa ZERO GET a mais.
// Antes deste passo, contratacoes_sc só era alimentada pela varredura por janela (a cada 20 dias, `devido` do
// etl_orquestrador) — e o consumidor de evento, na categoria 1, apenas marcava o evento como consumido sem
// escrever. Resultado: processo novo levava até 20 dias para existir na base, enquanto seus itens e resultados
// já chegavam de hora em hora. Mesmo mapeamento da varredura (lib_contratacao_upsert) para não divergirem.
{
  const codByCnpj = new Map((await q(`SELECT DISTINCT cnpj, cod_ibge FROM itens_sc WHERE cod_ibge IS NOT NULL`)).rows.map((r) => [r.cnpj, r.cod_ibge]));
  let grav = 0, falhas = 0;
  for (const x of paraRefrescar) {
    if (!x.raw) continue;
    try { if (await upsertContratacao(q, x.raw, codByCnpj)) grav++; } catch (e) { falhas++; if (falhas <= 3) console.log(`   ⚠ ${x.nc}: ${e.message.slice(0, 70)}`); }
  }
  console.log(`  contratações gravadas na hora: ${grav} (${novos.length} novas) · falhas ${falhas} · 0 GET extra`);
}

// ─── 3. O QUE mudou: 1 GET de /historico por processo diz onde mexer ──────────────────────────────────────────
// Sem isto seria 1 GET por item p/ descobrir. Com isto, 1 por processo.
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const eventos = { item: 0, resultado: 0, documento: 0, contratacao: 0 };
let gravados = 0;
const itensMexidos = new Map();   // "cnpj/ano/seq" -> Set(numeroItem) que mudaram
for (const x of paraRefrescar.slice(0, Number(process.env.CAP || 500))) {
  const h = await get(`${PNCP}/orgaos/${x.cnpj}/compras/${x.ano}/${x.seq}/historico`);
  gets++;
  if (!Array.isArray(h)) continue;
  const chave = `${x.cnpj}/${x.ano}/${x.seq}`;
  const E = { cat: [], ac: [], it: [], rs: [], dt: [], dtit: [], dsq: [], us: [], ju: [], oc: [] };
  for (const e of h) {
    // só o que entrou DENTRO da janela — o histórico traz a vida TODA do processo (o Piçarras tem 22 eventos)
    if (e.logManutencaoDataInclusao && e.logManutencaoDataInclusao.slice(0, 10).replace(/-/g, "") < D0) continue;
    if (e.categoriaLogManutencao === 1) eventos.contratacao++;
    if (e.categoriaLogManutencao === 6) eventos.documento++;
    if (e.categoriaLogManutencao === 4 || e.categoriaLogManutencao === 5) {
      eventos[e.categoriaLogManutencao === 4 ? "item" : "resultado"]++;
      if (e.itemNumero != null) {
        if (!itensMexidos.has(chave)) itensMexidos.set(chave, new Set());
        itensMexidos.get(chave).add(e.itemNumero);
      }
    }
    // -1 no lugar de NULL nas colunas da PK: no Postgres, NULL nunca conflita com NULL — o ON CONFLICT não
    // pegaria e a mesma janela duplicaria a cada re-run. É a diferença entre fila idempotente e lixo acumulado.
    E.cat.push(e.categoriaLogManutencao ?? -1); E.ac.push(e.tipoLogManutencao ?? -1);
    E.it.push(e.itemNumero ?? -1); E.rs.push(e.itemResultadoSequencial ?? -1);
    E.dt.push(e.documentoTipo ? String(e.documentoTipo).slice(0, 60) : null);
    E.dtit.push(e.documentoTitulo ? String(e.documentoTitulo).slice(0, 200) : null);
    E.dsq.push(e.documentoSequencial ?? -1);
    E.us.push(e.usuarioNome ? String(e.usuarioNome).slice(0, 120) : null);
    E.ju.push(e.justificativa ? String(e.justificativa).slice(0, 500) : null);
    E.oc.push(e.logManutencaoDataInclusao ? String(e.logManutencaoDataInclusao).slice(0, 19) : null);
  }
  if (E.cat.length && !DRY) {
    await q(`INSERT INTO pncp_evento (cnpj,ano,seq,cod_ibge,categoria,acao,item_numero,resultado_sequencial,
        documento_tipo,documento_titulo,documento_sequencial,usuario_nome,justificativa,ocorrido_em)
      SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::int[],$7::int[],$8::int[],$9::text[],$10::text[],
        $11::int[],$12::text[],$13::text[],$14::timestamptz[])
        AS t(categoria,acao,item_numero,resultado_sequencial,documento_tipo,documento_titulo,
             documento_sequencial,usuario_nome,justificativa,ocorrido_em)
      ON CONFLICT DO NOTHING`,
      [x.cnpj, x.ano, x.seq, x.ibge, E.cat, E.ac, E.it, E.rs, E.dt, E.dtit, E.dsq, E.us, E.ju, E.oc]);
    gravados += E.cat.length;
  }
}
const totItens = [...itensMexidos.values()].reduce((a, s) => a + s.size, 0);
console.log(`\n  eventos na janela: ${eventos.contratacao} contratação · ${eventos.item} item · ${eventos.resultado} RESULTADO · ${eventos.documento} documento`);
console.log(`  → ${totItens} itens a rebuscar (em vez de TODOS os itens dos ${paraRefrescar.length} processos)`);

// ─── 4. Balanço: o que isto economiza ─────────────────────────────────────────────────────────────────────────
const CHEIA = 241302 * 5;   // ordem de grandeza da varredura completa (1 /itens + ~4 /resultados por processo)
console.log(`\n${"═".repeat(78)}`);
console.log(`  GETs desta rodada:        ${gets.toLocaleString("pt-BR").padStart(9)}`);
console.log(`  GETs da varredura cheia:  ${CHEIA.toLocaleString("pt-BR").padStart(9)}   (~16h)`);
console.log(`  economia:                 ${(100 - 100 * gets / CHEIA).toFixed(2)}%`);
console.log(`${"═".repeat(78)}`);
console.log(`\n🔑 os ${eventos.resultado} eventos de RESULTADO são, ao mesmo tempo, a lista de itens a rebuscar E a`);
console.log(`   fila de notificação ("este item homologou"). Detector e notificação são o MESMO evento.`);

if (!DRY) await q(`INSERT INTO coleta_incremental_log (uf,janela_ini,janela_fim,vistos,mudaram,iguais,novos,gets)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [UF, D0, D1, vistos, paraRefrescar.length, iguais.length, novos.length, gets]);
else console.log(`\n(DRY-RUN: nada gravado)`);
await db.end();
