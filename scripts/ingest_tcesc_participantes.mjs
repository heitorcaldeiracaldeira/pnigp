// ESPELHO FIEL do e-Sfinge (TCE-SC) — PARTICIPANTES por ITEM, que o PNCP não tem.
// O PNCP publica só o VENCEDOR; o TCE publica TODOS os licitantes, quem venceu CADA item e a ordem de classificação.
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
//   node scripts/ingest_tcesc_participantes.mjs            [CUBO=item|cnpj] [MAX_PAGINAS=n]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 300000 });
const APP = "107d8f10-9431-404d-a267-5db6011dd28d";
const MAX_PAGINAS = Number(process.env.MAX_PAGINAS || 0);
const SO_CUBO = process.env.CUBO || null;

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
             "descricao_modalidade_licitacao", "data_homologacao", "descricao_objeto_licitacao"],
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
  await db.query(`create table if not exists tcesc_item_participante(
    linha_hash text primary key, identificador_sfi_processo_licitatorio text, nome_ente text,
    nome_participante_rfb text, indicativo_vencedor text, descricao_item_licitacao text,
    numero_ordem_classificacao text, valor_orcado_item text, atualizado timestamptz default now())`);
  await db.query(`create index if not exists ix_tceip_proc on tcesc_item_participante(identificador_sfi_processo_licitatorio)`);
  await db.query(`create index if not exists ix_tceip_ente on tcesc_item_participante(nome_ente)`);
  await db.query(`create table if not exists tcesc_processo_participante(
    linha_hash text primary key, identificador_sfi_processo_licitatorio text, cpf_cnpj text,
    nome_participante_rfb text, atualizado timestamptz default now())`);
  await db.query(`create index if not exists ix_tcepp_proc on tcesc_processo_participante(identificador_sfi_processo_licitatorio)`);
  await db.query(`create index if not exists ix_tcepp_cnpj on tcesc_processo_participante(cpf_cnpj)`);
  await db.query(`create table if not exists tcesc_processo_licitatorio(
    linha_hash text primary key, identificador_sfi_processo_licitatorio text, nome_ente text, numero_edital text,
    numero_processo_licitatorio text, descricao_modalidade_licitacao text, data_homologacao text,
    descricao_objeto_licitacao text, atualizado timestamptz default now())`);
  await db.query(`create index if not exists ix_tcepl_proc on tcesc_processo_licitatorio(identificador_sfi_processo_licitatorio)`);
  await db.query(`create index if not exists ix_tcepl_ente on tcesc_processo_licitatorio(nome_ente)`);
  await db.query(`create index if not exists ix_tcepl_ed on tcesc_processo_licitatorio(numero_edital)`);
  await db.query(`create table if not exists app.tcesc_cubo_checkpoint(
    cubo text primary key, ultimo_top int, total int, linhas_gravadas bigint, atualizado timestamptz default now())`);
}

async function grava(tabela, campos, rows) {
  if (!rows.length) return 0;
  const arrays = campos.map((_, i) => rows.map((r) => r[i] ?? null));
  const hashes = rows.map((r) => r.map((x) => x ?? "").join(""));
  const ph = ["$1::text[]", ...campos.map((_, i) => `$${i + 2}::text[]`)].join(",");
  const r = await db.query(
    `insert into ${tabela}(linha_hash,${campos.join(",")})
     select md5(t.h), ${campos.map((c) => `t.${c}`).join(",")}
     from unnest(${ph}) as t(h,${campos.join(",")})
     on conflict (linha_hash) do nothing`, [hashes, ...arrays]);
  return r.rowCount;
}

async function roda(nome) {
  const { tabela, campos } = CUBOS[nome];
  const PAG = Math.floor(9800 / campos.length);
  let appH = await conecta();
  const mk = async () => {
    const o = await rpc("CreateSessionObject", appH, [{ qInfo: { qType: "tbl" },
      qHyperCubeDef: { qDimensions: campos.map((c) => ({ qDef: { qFieldDefs: [c] } })), qMeasures: [],
        qInitialDataFetch: [{ qTop: 0, qLeft: 0, qHeight: 1, qWidth: campos.length }] } }]);
    const h = o.qReturn.qHandle;
    const lay = await rpc("GetLayout", h, []);
    return { h, total: lay.qLayout.qHyperCube.qSize?.qcy || 0 };
  };
  let { h, total } = await mk();
  const ck = (await db.query(`select ultimo_top, linhas_gravadas from app.tcesc_cubo_checkpoint where cubo=$1`, [nome])).rows[0];
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
    await db.query(`insert into app.tcesc_cubo_checkpoint(cubo,ultimo_top,total,linhas_gravadas) values($1,$2,$3,$4)
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
for (const nome of SO_CUBO ? [SO_CUBO] : ["item", "cnpj"]) await roda(nome);
console.log("\n=== ESPELHO TCE-SC ===");
console.table((await db.query(`select 'tcesc_item_participante' t, count(*) linhas,
    count(distinct identificador_sfi_processo_licitatorio) processos, count(distinct nome_participante_rfb) participantes,
    count(*) filter (where indicativo_vencedor='Sim') linhas_vencedor from tcesc_item_participante
  union all select 'tcesc_processo_participante', count(*), count(distinct identificador_sfi_processo_licitatorio),
    count(distinct cpf_cnpj), 0 from tcesc_processo_participante`)).rows);
await db.end();
