// ESPELHO FIEL do e-Sfinge (TCE-SC) — o MODELO INTEIRO (17 tabelas, 205 campos, 36,2M linhas).
// O PNCP publica só o VENCEDOR; o TCE publica TODOS os licitantes, quem venceu CADA item, a ordem de classificação,
// a cadeia de contratos (preço unitário CONTRATADO, medição mês a mês, aditivos) e as TRILHAS DE AUDITORIA do
// próprio tribunal. Inventário completo em docs/modelo-esfinge-tcesc.md.
//
// GRÃO (medido no modelo Qlik, 03/ago/2026): a `LinkTable` (11.737.085 linhas) é o fato central e é ESPARSA —
// `cpf_cnpj` e `indicativo_vencedor` NÃO coexistem na mesma linha (grãos diferentes: participante-do-processo ×
// item×participante). Um hipercubo misturando os dois devolve união esparsa e o dado sai inútil. Os dois cubos densos:
//   ITEM  = identificador_sfi_processo_licitatorio + nome_ente + nome_participante_rfb + indicativo_vencedor
//           + descricao_item_licitacao + numero_ordem_classificacao + valor_orcado_item     (~10,5M linhas)
//   CNPJ  = identificador_sfi_processo_licitatorio + cpf_cnpj + nome_participante_rfb        (amarra CNPJ↔nome)
//
// Lei 1: aqui só ESPELHO, nomenclatura da fonte (`tcesc_*`). Casamento com o PNCP e métrica de competição = derivadas.
// Paginação direta por qTop (sem seleção por ente: a busca do Qlik é por substring e contamina o recorte).
// Resumível por checkpoint de página. Dedupe por hash da linha → re-run é idempotente.
//   node scripts/ingest_tcesc_esfinge.mjs                    # todos os blocos (backfill)
//   CUBO=item_contrato node scripts/ingest_tcesc_esfinge.mjs  # um bloco só
//   MODO=incremental node scripts/ingest_tcesc_esfinge.mjs    # só o que mudou desde o watermark
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 300000 });
const APP = "107d8f10-9431-404d-a267-5db6011dd28d";
const MAX_PAGINAS = Number(process.env.MAX_PAGINAS || 0);
const SO_CUBO = process.env.CUBO || null;
const MODO = (process.env.MODO || "full").toLowerCase();          // full = backfill · incremental = só o que mudou
const DIAS_JANELA = Number(process.env.DIAS_JANELA || 7);          // rede de segurança: reprocessa os últimos N dias
const CAMPO_WM = "data_atualizacao_sigma";                         // carimbo de atualização do e-Sfinge

const CUBOS = {
  item: {
    tabela: "tcesc_item_participante",
    campos: ["identificador_sfi_processo_licitatorio", "nome_ente", "nome_participante_rfb", "indicativo_vencedor",
             "descricao_item_licitacao", "numero_ordem_classificacao", "valor_orcado_item"],
  },
  cnpj: {
    tabela: "tcesc_processo_participante",
    campos: ["identificador_sfi_processo_licitatorio", "cpf_cnpj", "nome_participante_rfb"],
  },
  // dimensão do processo — traz `numero_edital`, que é a CHAVE de casamento com o PNCP (o TCE indexa por
  // edital+ente; nós por cnpj+ano+seq). Sem ela o espelho não conversa com a nossa base.
  processo: {
    tabela: "tcesc_processo_licitatorio",
    campos: ["identificador_sfi_processo_licitatorio", "nome_ente", "numero_edital", "numero_processo_licitatorio",
             "descricao_modalidade_licitacao", "data_homologacao", "descricao_objeto_licitacao",
             // DATA DE REALIZAÇÃO — desempata objeto idêntico dentro do mesmo município e ano (7,1% dos
             // casamentos por texto tinham empate no topo, um deles com 38 candidatos iguais).
             "data_abertura_certame", "data_limite_entrega_propostas"],
  },
  // ─── CONTRATOS (a cadeia que o PNCP não fecha) ───────────────────────────────────────────────────────────────
  // ponte: liga contrato ↔ processo ↔ município. Os 3 campos são da LinkTable, então o cubo vem denso.
  link_contrato: {
    tabela: "tcesc_link_contrato",
    campos: ["identificador_sfi_processo_licitatorio", "idcontrato", "nome_ente"],
  },
  contrato: {
    tabela: "tcesc_contrato",
    campos: ["idcontrato", "numero_contrato", "data_assinatura", "data_vencimento", "descricao_objetivo",
             "codigo_registro_contrato", "contrato_com_despesa", "ultima_situacao_obra"],
  },
  // ⭐ preço unitário EFETIVAMENTE CONTRATADO, item a item — banco de preços da fonte de controle
  item_contrato: {
    tabela: "tcesc_item_contrato",
    campos: ["idcontrato", "id_item_contratado", "descricao_item_contratado", "descricao_unidade_medida_contratado",
             "valor_unitario_contratado", "quantidade_item_contratado", "valor_total_contratado",
             "numero_sequencial_item_contratado", "tipo_item"],
  },
  // a obra andou? valor medido por mês contra o contratado
  medicao: {
    tabela: "tcesc_medicao",
    campos: ["idcontrato", "ano_mes", "data_medicao", "numero_medicao", "valor_medicao"],
  },
  aditivo: {
    tabela: "tcesc_contrato_aditivo",
    campos: ["idContratoPai", "numero_contrato_superior", "valor_contrato_superior", "data_assinatura_superior",
             "data_vencimento_superior", "descricao_objetivo_superior", "descricao_tipo_unidade_contrato"],
  },
  situacao_obra: {
    tabela: "tcesc_situacao_obra",
    campos: ["idcontrato", "ano_mes_situacao", "descricao_tipo_situacao_obra_servico_engenharia", "ultimo_mes"],
  },
  // ─── CONTROLE (o que o próprio TCE marcou) ──────────────────────────────────────────────────────────────────
  // ponte OBRIGATÓRIA p/ a trilha: `Trilhas` é chaveada por idparticipante e NÃO tem município. O vínculo
  // participante→ente vive na LinkTable. Sem esta ponte, apontamento do TCE não chega ao município.
  link_participante: {
    tabela: "tcesc_link_participante",
    campos: ["idparticipante", "nome_ente", "identificador_sfi_processo_licitatorio"],
  },
  // 22 tipologias de trilha sobre participantes: é o tribunal dizendo o que considerou atípico
  trilha: {
    tabela: "tcesc_trilha",
    campos: ["idparticipante", "tipologia", "numero_tipologia", "observacao", "cpf_cnpj_trilha", "nome_trilha"],
  },
  tipologia_contrato: {
    tabela: "tcesc_tipologia_contrato",
    campos: ["idcontrato", "tipologia_contrato", "numero_tipologia_contrato", "observacao_contrato",
             "cpf_cnpj_trilha_contratos", "valor_contrato_tipologia", "nome_ente_tipologia_contrato"],
  },
  ocorrencia: {
    tabela: "tcesc_ocorrencia",
    campos: ["identificador_sfi_processo_licitatorio", "data_ocorrencia_licitacao",
             "descricao_tipo_ocorrencia_licitacao", "descricao_justificativa_ocorrencia_licitacao"],
  },
  // ─── PUBLICIDADE (mede o art. 174 de verdade: onde foi publicado, em que veículo) ────────────────────────────
  publicidade: {
    tabela: "tcesc_publicidade",
    campos: ["identificador_sfi_processo_licitatorio", "data_publicacao", "descricao_tipo_meio_comunicacao",
             "nome_veiculo_comunicacao"],
  },
  // ─── QUADRO PAR-A-PAR (quem encontra quem: insumo de rodízio/cartel) ─────────────────────────────────────────
  quadro: {
    tabela: "tcesc_quadro_participantes",
    campos: ["chave", "participante1_cpf_cnpj", "participante1_nome", "participante1_venceu_itens",
             "participante1_perdeu_itens", "participante2_cpf_cnpj", "participante2_nome",
             "participante2_venceu_itens", "participante2_perdeu_itens", "quantidade_total_itens",
             "quantidade_total_licitacoes"],
  },
};

let ws, pend = new Map(), id = 0;
const rpc = (m, h, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
  ws.send(JSON.stringify({ jsonrpc: "2.0", method: m, handle: h, params: p, id: i }));
  setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error("timeout " + m)); } }, 120000); });
async function conecta() {
  ws = new WebSocket(`wss://paineistransparencia.tce.sc.gov.br/app/${APP}`);
  pend = new Map(); id = 0;
  ws.addEventListener("message", (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id != null && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result); } });
  await new Promise((r, j) => { ws.addEventListener("open", () => setTimeout(r, 600)); ws.addEventListener("error", () => j(new Error("WS erro"))); });
  return (await rpc("OpenDoc", -1, [APP, "", "", "", false])).qReturn.qHandle;
}

async function ddl() {
  // DDL GENÉRICO: a tabela sai da definição do cubo. Adicionar um bloco do modelo = uma entrada em CUBOS, e o
  // espelho se cria sozinho — sem DDL manual que envelhece fora de sincronia com os campos.
  for (const [nome, { tabela, campos }] of Object.entries(CUBOS)) {
    await db.query(`create table if not exists ${tabela}(
      linha_hash text primary key, ${campos.map((c) => `"${c}" text`).join(", ")}, atualizado timestamptz default now())`);
    // índice nos 2 primeiros campos (são as chaves do grão em todos os blocos do modelo)
    for (const c of campos.slice(0, 2))
      await db.query(`create index if not exists ix_${tabela}_${c.slice(0, 22)} on ${tabela}("${c}")`).catch(() => {});
  }
  await db.query(`create table if not exists app.tcesc_cubo_checkpoint(
    cubo text primary key, ultimo_top int, total int, linhas_gravadas bigint, atualizado timestamptz default now())`);
  await db.query(`create table if not exists app.tcesc_watermark(
    chave text primary key, valor text, atualizado timestamptz default now())`);
}

async function grava(tabela, campos, rows) {
  if (!rows.length) return 0;
  const arrays = campos.map((_, i) => rows.map((r) => r[i] ?? null));
  const hashes = rows.map((r) => r.map((x) => x ?? "").join(""));
  const ph = ["$1::text[]", ...campos.map((_, i) => `$${i + 2}::text[]`)].join(",");
  const r = await db.query(
    // ⚠️ aspas OBRIGATÓRIAS: o modelo do TCE tem campo em camelCase (idContratoPai). Sem aspas o Postgres
    // rebaixa para minúsculas e não acha a coluna que o DDL criou com aspas.
    `insert into ${tabela}(linha_hash,${campos.map((c) => `"${c}"`).join(",")})
     select md5(t.h), ${campos.map((c) => `t."${c}"`).join(",")}
     from unnest(${ph}) as t(h,${campos.map((c) => `"${c}"`).join(",")})
     on conflict (linha_hash) do nothing`, [hashes, ...arrays]);
  return r.rowCount;
}

// ─── INCREMENTAL: seleciona no Qlik só os processos atualizados desde o watermark ────────────────────────────
// O e-Sfinge carimba `data_atualizacao_sigma` na ProcessoLicitatorio. Selecionando esses valores, o modelo
// ASSOCIATIVO propaga o filtro para LinkTable, contratos, medições e trilhas — um filtro só recorta tudo.
// Não uso SearchListObjectFor (busca por substring, contamina); seleciono os ELEMENTOS exatos por número.
function normData(t) {                       // aceita dd/mm/aaaa e aaaa-mm-dd → aaaammdd (comparável como número)
  if (!t) return null;
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t); if (m) return +(m[3] + m[2] + m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);        if (m) return +(m[1] + m[2] + m[3]);
  return null;
}
async function selecionaDesde(appH, desde) {
  const lb = await rpc("CreateSessionObject", appH, [{ qInfo: { qType: "lb" },
    qListObjectDef: { qDef: { qFieldDefs: [CAMPO_WM] }, qInitialDataFetch: [{ qTop: 0, qLeft: 0, qHeight: 10000, qWidth: 1 }] } }]);
  const h = lb.qReturn.qHandle;
  const lay = await rpc("GetLayout", h, []);
  const linhas = lay.qLayout.qListObject.qDataPages?.[0]?.qMatrix || [];
  const alvo = linhas.filter((r) => { const d = normData(r[0].qText); return d != null && d >= desde; });
  const maior = linhas.reduce((a, r) => Math.max(a, normData(r[0].qText) || 0), 0);
  if (!alvo.length) return { n: 0, maior };
  await rpc("SelectListObjectValues", h, ["/qListObjectDef", alvo.map((r) => r[0].qElemNumber), false]);
  return { n: alvo.length, maior };
}

async function roda(nome) {
  const { tabela, campos } = CUBOS[nome];
  const PAG = Math.floor(9800 / campos.length);
  let appH = await conecta();
  if (MODO === "incremental") {
    const r = await selecionaDesde(appH, globalThis.DESDE);
    if (!r.n) { console.log(`
=== cubo ${nome}: nada atualizado desde ${DESDE} — pulado`); try { ws.close(); } catch {} return; }
    console.log(`
=== cubo ${nome} → ${tabela} · INCREMENTAL: ${r.n} datas selecionadas (>= ${DESDE})`);
  }
  const mk = async () => {
    const o = await rpc("CreateSessionObject", appH, [{ qInfo: { qType: "tbl" },
      qHyperCubeDef: { qDimensions: campos.map((c) => ({ qDef: { qFieldDefs: [c] } })), qMeasures: [],
        qInitialDataFetch: [{ qTop: 0, qLeft: 0, qHeight: 1, qWidth: campos.length }] } }]);
    const h = o.qReturn.qHandle;
    const lay = await rpc("GetLayout", h, []);
    return { h, total: lay.qLayout.qHyperCube.qSize?.qcy || 0 };
  };
  let { h, total } = await mk();
  // no incremental o recorte muda a cada rodada: retomar por página de uma varredura anterior não faz sentido
  const ck = MODO === "incremental" ? null
    : (await db.query(`select ultimo_top, linhas_gravadas from app.tcesc_cubo_checkpoint where cubo=$1`, [nome])).rows[0];
  let top = ck ? Number(ck.ultimo_top) : 0;
  let gravadas = ck ? Number(ck.linhas_gravadas) : 0;
  console.log(`\n=== cubo ${nome} → ${tabela} · ${total.toLocaleString()} linhas · página ${PAG} · retomando em ${top.toLocaleString()} ===`);
  const t0 = Date.now(); let pag = 0;
  while (top < total) {
    let mat;
    try {
      const p = await rpc("GetHyperCubeData", h, ["/qHyperCubeDef", [{ qTop: top, qLeft: 0, qHeight: Math.min(PAG, total - top), qWidth: campos.length }]]);
      mat = p.qDataPages?.[0]?.qMatrix || [];
    } catch (e) {                       // sessão caiu → reconecta e refaz o cubo, retoma no mesmo top
      console.log(`\n  ! ${e.message.slice(0, 80)} — reconectando`);
      try { ws.close(); } catch {}
      appH = await conecta(); ({ h, total } = await mk()); continue;
    }
    const rows = mat.map((r) => r.map((c) => (c.qText === "-" || c.qText === "" ? null : c.qText)));
    for (let i = 0; i < rows.length; i += 2000) gravadas += await grava(tabela, campos, rows.slice(i, i + 2000));
    top += mat.length || PAG;
    if (MODO !== "incremental") await db.query(`insert into app.tcesc_cubo_checkpoint(cubo,ultimo_top,total,linhas_gravadas) values($1,$2,$3,$4)
      on conflict(cubo) do update set ultimo_top=excluded.ultimo_top, total=excluded.total, linhas_gravadas=excluded.linhas_gravadas, atualizado=now()`,
      [nome, top, total, gravadas]);
    if (++pag % 10 === 0) {
      const min = (Date.now() - t0) / 60000;
      process.stdout.write(`\r  ${top.toLocaleString()}/${total.toLocaleString()} (${(100 * top / total).toFixed(1)}%) · ${gravadas.toLocaleString()} gravadas · ${(top / Math.max(min, 0.01) / 1000).toFixed(0)}k linhas/min`);
    }
    if (MAX_PAGINAS && pag >= MAX_PAGINAS) { console.log(`\n  parou em MAX_PAGINAS=${MAX_PAGINAS}`); break; }
  }
  console.log(`\n✔ cubo ${nome}: ${gravadas.toLocaleString()} linhas gravadas`);
  try { ws.close(); } catch {}
}

await ddl();
// WATERMARK do incremental: a última data já espelhada, recuada em DIAS_JANELA como rede de segurança (a remessa
// municipal chega atrasada e o TCE reprocessa; reler alguns dias é barato e o hash da linha impede duplicata).
const hoje = new Date();
const comoNum = (d) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
globalThis.DESDE = comoNum(new Date(hoje.getTime() - DIAS_JANELA * 86400000));
if (MODO === "incremental") {
  const wm = (await db.query(`select valor from app.tcesc_watermark where chave='esfinge'`)).rows[0];
  if (wm?.valor) globalThis.DESDE = Math.min(Number(wm.valor), globalThis.DESDE);   // nunca pula período
  console.log(`INCREMENTAL · tudo atualizado a partir de ${globalThis.DESDE} (watermark ${wm?.valor || "vazio"} · janela ${DIAS_JANELA}d)`);
}
const t0Geral = Date.now();
for (const nome of SO_CUBO ? [SO_CUBO] : Object.keys(CUBOS)) {
  try { await roda(nome); }
  catch (e) { console.log(`
! cubo ${nome} falhou: ${e.message.slice(0, 120)} — segue para o proximo`); }
}
if (MODO === "incremental") {
  await db.query(`insert into app.tcesc_watermark(chave,valor) values('esfinge',$1)
    on conflict(chave) do update set valor=excluded.valor, atualizado=now()`, [String(comoNum(hoje))]);
  console.log(`watermark avancado para ${comoNum(hoje)}`);
}
console.log(`
=== ESPELHO TCE-SC · ${((Date.now() - t0Geral) / 60000).toFixed(1)} min ===`);
const _tabs = [...new Set(Object.values(CUBOS).map((c) => c.tabela))];
console.table((await db.query(_tabs.map((t) => `select '${t}' tabela, count(*) linhas from ${t}`).join(" union all ") + " order by 2 desc")).rows);
console.log("\n=== ESPELHO TCE-SC ===");
await db.end();
