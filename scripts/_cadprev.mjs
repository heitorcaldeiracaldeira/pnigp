// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _cadprev.mjs — infraestrutura compartilhada dos ETLs do CADPREV/SPREV (apicadprev.trabalho.gov.br).
//
// POR QUÊ este arquivo existe: ingest_cadprev.mjs (espelho genérico dos 37 recursos) e ingest_rpps_crp.mjs (ETL
// tipado do CRP) precisam do MESMO acesso a banco e do MESMO cliente HTTP paginado com backoff. Em vez de duplicar,
// vive aqui. Exporta: pool, withRetry, carregarEntes, fetchAll, sleep.
//
// HISTÓRICO: apagado no `rm _*.mjs` (sessão de jul) e RECONSTRUÍDO a partir do uso exato nos dois ingests e no
// probe_cadprev.mjs (que documenta a superfície da API: /RECURSO?sg_uf=..&dt_exercicio=..&limit=..&offset=..,
// resposta { data:[...], count }, throttle no HTTP 420).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { SG_UF } from "./_uf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DATABASE_URL — mesma resolução dos outros scripts: env explícita ou .env.local na raiz (../ a partir de scripts/).
const DATABASE_URL = (
  process.env.DATABASE_URL || process.env.NEON_DB_URL ||
  fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1]
).trim();

export const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

// pool() — Pool do Neon com o mesmo perfil dos ETLs (SSL sem verificação, poucas conexões, statement_timeout largo).
export function pool() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1800000 });
  db.on("error", () => {}); // Neon hiberna e derruba conexões idle — não deixar isso derrubar o processo
  return db;
}

// withRetry(db) — devolve q(sql, params) que reexecuta em erros TRANSITÓRIOS de rede/pool (conexão derrubada pelo
// Neon). Erros de SQL de verdade (sintaxe, constraint) sobem na hora. Espaçamento progressivo entre tentativas.
export function withRetry(db, tentativas = 5) {
  return async (sql, params) => {
    let ultimo;
    for (let t = 0; t < tentativas; t++) {
      try { return await db.query(sql, params); }
      catch (e) {
        ultimo = e;
        const transitorio = /ECONNRESET|ETIMEDOUT|Connection terminated|timeout|termination|EPIPE|socket hang up|Client has encountered/i.test(e.message || "");
        if (!transitorio || t === tentativas - 1) throw e;
        await sleep(1500 * (t + 1));
      }
    }
    throw ultimo;
  };
}

// carregarEntes(db) — carrega os municípios da UF (entes_sc tipo='M') e devolve { codDe } que casa no_ente → cod_ibge.
// O no_ente do CADPREV vem como "Prefeitura Municipal de X", "Município de X", "Fundo de Previdência ... de X" ou só
// "X". Normaliza (maiúsculas, sem acento, só A-Z0-9) e, se não casar direto, tira o prefixo institucional e tenta de
// novo. NÃO adivinha (sem fuzzy): quem não casar é reportado pelo chamador (diretriz "privilegiar os dados").
export async function carregarEntes(db) {
  const q = withRetry(db);
  const { rows } = await q(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M' AND uf=$1`, [SG_UF]);
  const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  // prefixos institucionais que podem preceder o nome do município no no_ente
  const PREFIXOS = /^(PREFEITURA MUNICIPAL DE |PREFEITURA DE |MUNICIPIO DE |CAMARA MUNICIPAL DE |FUNDO (MUNICIPAL )?DE PREVIDENCIA( SOCIAL)?( DOS SERVIDORES)?( PUBLICOS)?( MUNICIPAIS)?( DE| DO| DA)? |INSTITUTO (DE )?PREVIDENCIA( SOCIAL)?( DOS SERVIDORES)?( MUNICIPAL)?( DE| DO| DA)? |REGIME PROPRIO DE PREVIDENCIA SOCIAL( DE| DO| DA)? )/;
  const enxuga = (s) => norm(s).replace(PREFIXOS, "").trim();

  const byNome = new Map();
  for (const e of rows) byNome.set(norm(e.nome), e.cod_ibge);

  const codDe = (noEnte) => {
    if (!noEnte) return null;
    const n = norm(noEnte);
    if (byNome.has(n)) return byNome.get(n);   // no_ente já é o nome do município
    const e = enxuga(noEnte);                   // tira "Prefeitura Municipal de …" etc. e tenta o miolo
    if (e && byNome.has(e)) return byNome.get(e);
    return null;
  };
  return { codDe, total: rows.length };
}

// ── Cliente HTTP paginado do CADPREV ──────────────────────────────────────────────────────────────────────────────
const API_BASE = "https://apicadprev.trabalho.gov.br";
const LIMIT = 1000;

// 1 GET com backoff progressivo p/ throttle (420/429) e 5xx/rede. Retorna { status, body|null }.
async function getJson(url) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (r.status === 420 || r.status === 429 || r.status >= 500) { await sleep(2500 * (t + 1)); continue; }
      let body = null; try { body = await r.json(); } catch {}
      return { status: r.status, body };
    } catch { await sleep(2500 * (t + 1)); }
  }
  return { status: 0, body: null };
}

// pagina um recurso (opcionalmente por exercício) via offset até a última página. { data:[...], erro:boolean }.
async function paginar(rec, uf, exercicio) {
  const out = []; let offset = 0; let redeErro = false;
  for (let pag = 0; pag < 5000; pag++) { // trava de segurança contra loop
    const ex = exercicio ? `&dt_exercicio=${exercicio}` : "";
    const url = `${API_BASE}/${rec}?sg_uf=${uf}${ex}&limit=${LIMIT}&offset=${offset}`;
    const { status, body } = await getJson(url);
    if (status !== 200) { redeErro = true; break; }
    const data = Array.isArray(body?.data) ? body.data : [];
    out.push(...data);
    if (data.length < LIMIT) break; // última página
    offset += LIMIT;
    await sleep(300); // espaçamento anti-throttle entre páginas
  }
  return { data: out, erro: redeErro };
}

// fetchAll(rec, uf, {log}) — espelha TODOS os registros do recurso para a UF. Retorna { data:[...], erro:boolean }.
// Estratégia: tenta sem exercício (a maioria devolve a UF inteira). Se vier vazio, é recurso que EXIGE dt_exercicio
// (ver probe_cadprev/manifesto): varre os últimos anos e concatena — espelho fiel do que a API expõe. `erro:true`
// sinaliza falha de REDE (não "0 registros") p/ o chamador NÃO apagar a tabela existente por engano.
export async function fetchAll(rec, uf, { log = () => {} } = {}) {
  let { data, erro } = await paginar(rec, uf, null);
  if (erro) return { data: [], erro: true };
  if (data.length) return { data, erro: false };

  const anoFim = Number(process.env.ANO_FIM || new Date().getFullYear());
  const anoIni = Number(process.env.ANO_INI || anoFim - 6);
  const todos = [];
  for (let ano = anoFim; ano >= anoIni; ano--) {
    const { data: d, erro: e } = await paginar(rec, uf, ano);
    if (e) return { data: todos, erro: true };
    if (d.length) { todos.push(...d); log(`  ${rec} exercício ${ano}: +${d.length}`); }
    await sleep(400);
  }
  return { data: todos, erro: false };
}
