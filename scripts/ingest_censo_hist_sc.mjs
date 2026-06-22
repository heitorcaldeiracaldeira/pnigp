// ETL — Censo Escolar ESCOLA A ESCOLA, ANO A ANO (SC, TODAS as dependências), 2007→atual. Grão máximo p/ B2G e estudos B2B.
// Por (co_entidade, ano): matrículas + modalidade (tipo de aluno) + perfil (sexo/raça/idade/inclusão/integral) + docentes
// + colaboradores (QT_PROF_*) + transporte + infraestrutura (item a item) + geo. Lida com formato antigo (arquivo único
// microdados_ed_basica) e novo (tabelas Escola/Matricula/Docente/Turma). Idempotente (UPSERT) + resumível (pula anos prontos).
// node scripts/ingest_censo_hist_sc.mjs   [ANO_INI=2007 ANO_FIM=2025]
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url"; import pg from "pg";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO_INI = +(process.env.ANO_INI || 2007), ANO_FIM = +(process.env.ANO_FIM || 2025);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const um = (v) => String(v).trim() === "1";
const flt = (v) => { const n = parseFloat(String(v || "").replace(",", ".")); return isNaN(n) ? null : n; };
const MOD = { creche: "QT_MAT_INF_CRE", pre: "QT_MAT_INF_PRE", fund_ai: "QT_MAT_FUND_AI", fund_af: "QT_MAT_FUND_AF", medio: "QT_MAT_MED", eja: "QT_MAT_EJA", prof: "QT_MAT_PROF", especial: "QT_MAT_ESP" };
const PERFIL = { fem: "QT_MAT_BAS_FEM", masc: "QT_MAT_BAS_MASC", branca: "QT_MAT_BAS_BRANCA", preta: "QT_MAT_BAS_PRETA", parda: "QT_MAT_BAS_PARDA", amarela: "QT_MAT_BAS_AMARELA", indigena: "QT_MAT_BAS_INDIGENA", i0_3: "QT_MAT_BAS_0_3", i4_5: "QT_MAT_BAS_4_5", i6_10: "QT_MAT_BAS_6_10", i11_14: "QT_MAT_BAS_11_14", i15_17: "QT_MAT_BAS_15_17", i18: "QT_MAT_BAS_18_MAIS", integral: "QT_MAT_INTEGRAL" };
const INFRA_ITEMS = [
  { k: "internet", col: "IN_INTERNET" }, { k: "internet_aluno", col: "IN_INTERNET_ALUNOS" }, { k: "banda_larga", col: "IN_BANDA_LARGA" },
  { k: "biblioteca", col: "IN_BIBLIOTECA" }, { k: "sala_leitura", col: "IN_BIBLIOTECA_SALA_LEITURA" }, { k: "lab_info", col: "IN_LABORATORIO_INFORMATICA" },
  { k: "lab_ciencias", col: "IN_LABORATORIO_CIENCIAS" }, { k: "quadra", col: "IN_QUADRA_ESPORTES" }, { k: "quadra_coberta", col: "IN_QUADRA_ESPORTES_COBERTA" },
  { k: "refeitorio", col: "IN_REFEITORIO" }, { k: "cozinha", col: "IN_COZINHA" }, { k: "patio_coberto", col: "IN_PATIO_COBERTO" },
  { k: "parque_infantil", col: "IN_PARQUE_INFANTIL" }, { k: "auditorio", col: "IN_AUDITORIO" }, { k: "sala_atendimento_especial", col: "IN_SALA_ATENDIMENTO_ESPECIAL" },
  { k: "banheiro_pne", col: "IN_BANHEIRO_PNE" }, { k: "agua", col: "IN_AGUA_INEXISTENTE", neg: true }, { k: "energia", col: "IN_ENERGIA_INEXISTENTE", neg: true },
  { k: "esgoto", col: "IN_ESGOTO_INEXISTENTE", neg: true }, { k: "acessibilidade", col: "IN_ACESSIBILIDADE_INEXISTENTE", neg: true },
];

function zipEntries(buf) {
  let eo = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; }
  let p = buf.readUInt32LE(eo + 16); const n = buf.readUInt16LE(eo + 10); const out = [];
  for (let k = 0; k < n; k++) {
    const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commLen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    out.push({ name: buf.toString("latin1", p + 46, p + 46 + nameLen), method, compSize, lho });
    p += 46 + nameLen + extraLen + commLen;
  }
  return out;
}
const inflate = (buf, e) => { const lN = buf.readUInt16LE(e.lho + 26), lE = buf.readUInt16LE(e.lho + 28), ds = e.lho + 30 + lN + lE; const comp = buf.subarray(ds, ds + e.compSize); return (e.method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp)).toString("latin1"); };
const findCsv = (entries, ...subs) => entries.find((e) => { const n = e.name.toLowerCase(); return n.endsWith(".csv") && subs.some((s) => n.includes(s.toLowerCase())); });
const idxMap = (head, def) => Object.fromEntries(Object.entries(def).map(([k, n]) => [k, head.indexOf(n)]));
const extractObj = (c, im) => { const o = {}; for (const k in im) if (im[k] >= 0) { const v = parseInt(c[im[k]], 10); if (!isNaN(v) && v !== 0) o[k] = v; } return o; };
async function baixar(ano) {
  const urls = [`https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_${ano}_.zip`, `https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_${ano}.zip`, `https://download.inep.gov.br/microdados/microdados_censo_escolar_${ano}.zip`];
  for (const u of urls) { try { const r = await fetch(u, { signal: AbortSignal.timeout(240000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch { /* próxima */ } }
  return null;
}
// mapa CO_ENTIDADE → registro, de uma tabela agregada por escola (Matricula/Docente)
function porEscola(csv, build) {
  const head = csv.slice(0, csv.indexOf("\n")).split(";").map((h) => h.replace(/^"|"$/g, "").trim());
  const ci = head.indexOf("CO_ENTIDADE"); if (ci < 0) return null;
  const ctx = build(head); const m = new Map(); const linhas = csv.split(/\r?\n/);
  for (let i = 1; i < linhas.length; i++) { if (!linhas[i]) continue; const c = linhas[i].split(";"); const co = c[ci]?.replace(/"/g, ""); if (co) m.set(co, ctx(c)); }
  return m;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS escolas_hist_sc (
    co_entidade TEXT, ano INTEGER, cod_ibge TEXT, dependencia SMALLINT, nome TEXT, localizacao SMALLINT,
    matriculas INTEGER, docentes INTEGER, profissionais INTEGER, transp_publico INTEGER, transp_mun INTEGER,
    modalidade JSONB, perfil JSONB, infra JSONB, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
    PRIMARY KEY (co_entidade, ano))`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };
  const feitos = new Set((await db.query(`SELECT DISTINCT ano FROM escolas_hist_sc`)).rows.map((r) => +r.ano));
  const ibgeCache = new Map();
  const ibge7 = async (cod6) => { if (!ibgeCache.has(cod6)) ibgeCache.set(cod6, (await db.query(`SELECT cod_ibge FROM entes_sc WHERE substring(cod_ibge,1,6)=$1 AND tipo='M' LIMIT 1`, [cod6])).rows[0]?.cod_ibge || cod6); return ibgeCache.get(cod6); };

  for (let ano = ANO_FIM; ano >= ANO_INI; ano--) {
    if (feitos.has(ano)) { console.log(`${ano}: já coletado, pulando`); continue; }
    console.log(`${ano}: baixando…`);
    const buf = await baixar(ano);
    if (!buf) { console.log(`${ano}: ⚠️ download falhou`); continue; }
    const entries = zipEntries(buf);
    const escE = findCsv(entries, `tabela_escola_${ano}`, `ed_basica_${ano}`, "escolas.csv");
    if (!escE) { console.log(`${ano}: ⚠️ arquivo de escola não encontrado`); continue; }
    const escCsv = inflate(buf, escE);
    const H = escCsv.slice(0, escCsv.indexOf("\n")).split(";").map((h) => h.replace(/^"|"$/g, "").trim());
    const ix = (n) => H.indexOf(n);
    const cUF = ix("CO_UF"), cMun = ix("CO_MUNICIPIO"), cEnt = ix("CO_ENTIDADE"), cDep = ix("TP_DEPENDENCIA"), cSit = ix("TP_SITUACAO_FUNCIONAMENTO"), cNome = ix("NO_ENTIDADE"), cLoc = ix("TP_LOCALIZACAO"), cLat = ix("LATITUDE"), cLon = ix("LONGITUDE"), cDoc = ix("QT_DOC_BAS"), cMat = ix("QT_MAT_BAS");
    const profCols = H.map((h, i) => (/^QT_PROF_/.test(h) ? i : -1)).filter((i) => i >= 0);
    const infraDef = INFRA_ITEMS.map((it) => ({ ...it, ix: ix(it.col) })).filter((it) => it.ix >= 0);
    const modIx = idxMap(H, MOD), perfIx = idxMap(H, PERFIL), tpPub = ix("QT_TRANSP_PUBLICO"), tpMun = ix("QT_TRANSP_RESP_MUN");
    const single = cMat >= 0; // matrículas no próprio arquivo → formato antigo

    // formato novo: mapas por escola das tabelas separadas
    let matMap = null, docMap = null;
    if (!single) {
      const mE = findCsv(entries, `tabela_matricula_${ano}`), dE = findCsv(entries, `tabela_docente_${ano}`);
      if (mE) matMap = porEscola(inflate(buf, mE), (h) => { const qi = h.indexOf("QT_MAT_BAS"), mI = idxMap(h, MOD), pI = idxMap(h, PERFIL), tP = h.indexOf("QT_TRANSP_PUBLICO"), tM = h.indexOf("QT_TRANSP_RESP_MUN"); return (c) => ({ mat: parseInt(c[qi], 10) || 0, mod: extractObj(c, mI), perfil: extractObj(c, pI), tp: tP >= 0 ? (parseInt(c[tP], 10) || 0) : 0, tm: tM >= 0 ? (parseInt(c[tM], 10) || 0) : 0 }); });
      if (dE) docMap = porEscola(inflate(buf, dE), (h) => { const qi = h.indexOf("QT_DOC_BAS"); return (c) => parseInt(c[qi], 10) || 0; });
    }

    let grav = 0; const linhas = escCsv.split(/\r?\n/);
    for (let i = 1; i < linhas.length; i++) {
      if (!linhas[i]) continue; const c = linhas[i].split(";");
      if (c[cUF] !== "42") continue; if (cSit >= 0 && c[cSit] !== "1") continue;
      const co = c[cEnt]?.replace(/"/g, ""); const cod6 = c[cMun]; if (!co || !cod6) continue;
      const prof = profCols.reduce((s, j) => s + (parseInt(c[j], 10) || 0), 0);
      const infra = {}; for (const it of infraDef) { const has = it.neg ? !um(c[it.ix]) : um(c[it.ix]); if (has) infra[it.k] = 1; }
      let mat = null, doc = null, mod = {}, perfil = {}, tp = 0, tm = 0;
      if (single) { mat = parseInt(c[cMat], 10); if (isNaN(mat)) mat = null; if (cDoc >= 0) doc = parseInt(c[cDoc], 10) || 0; mod = extractObj(c, modIx); perfil = extractObj(c, perfIx); tp = tpPub >= 0 ? (parseInt(c[tpPub], 10) || 0) : 0; tm = tpMun >= 0 ? (parseInt(c[tpMun], 10) || 0) : 0; }
      else { const r = matMap?.get(co); if (r) { mat = r.mat; mod = r.mod; perfil = r.perfil; tp = r.tp; tm = r.tm; } doc = docMap?.get(co) ?? null; }
      await q(`INSERT INTO escolas_hist_sc (co_entidade,ano,cod_ibge,dependencia,nome,localizacao,matriculas,docentes,profissionais,transp_publico,transp_mun,modalidade,perfil,infra,latitude,longitude)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
               ON CONFLICT (co_entidade,ano) DO UPDATE SET matriculas=EXCLUDED.matriculas, docentes=EXCLUDED.docentes, profissionais=EXCLUDED.profissionais, transp_publico=EXCLUDED.transp_publico, transp_mun=EXCLUDED.transp_mun, modalidade=EXCLUDED.modalidade, perfil=EXCLUDED.perfil, infra=EXCLUDED.infra, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude`,
        [co, ano, await ibge7(cod6), parseInt(c[cDep], 10) || null, c[cNome] || null, cLoc >= 0 ? (parseInt(c[cLoc], 10) || null) : null, mat, doc, prof || null, tp || null, tm || null,
          Object.keys(mod).length ? JSON.stringify(mod) : null, Object.keys(perfil).length ? JSON.stringify(perfil) : null, Object.keys(infra).length ? JSON.stringify(infra) : null,
          cLat >= 0 ? flt(c[cLat]) : null, cLon >= 0 ? flt(c[cLon]) : null]);
      grav++;
    }
    console.log(`${ano}: ✓ ${grav} escolas (${single ? "arquivo único" : "tabelas separadas"})`);
  }
  const r = await db.query(`SELECT min(ano) min, max(ano) max, count(distinct ano) anos, count(*) linhas FROM escolas_hist_sc`);
  console.log(`Censo histórico (escola×ano) concluído: ${JSON.stringify(r.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
