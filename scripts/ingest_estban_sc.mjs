// ETL — ESTBAN (Estatística Bancária Mensal por município, BCB) — SÉRIE HISTÓRICA. Volumes bancários por município.
// Verbetes-chave: crédito total(160)/rural(163)/agroindustrial(167)/imobiliário(169), poupança(420), prazo(432),
// à vista(401-419), ativo total(399). Grão do arquivo = município × instituição → agrega por município.
// Download: /content/estatisticas/estatistica_bancaria_estban/municipio/{YYYYMM}_ESTBAN.csv.zip (curl + adm-zip).
// Casa por (UF, nome do município) → cod_ibge. State-agnostic (UF env). node scripts/ingest_estban_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import AdmZip from "adm-zip"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const N_MESES = Number(process.env.MESES || 18);
const BASE = "https://www.bcb.gov.br/content/estatisticas/estatistica_bancaria_estban/municipio";
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const nn = (v) => { const x = Number(String(v || "").replace(/\s/g, "")); return Number.isFinite(x) ? x : 0; };

function baixarMes(ym) {
  const zipPath = path.join(os.tmpdir(), `estban_${ym}.zip`);
  try { execFileSync("curl", ["-s", "-L", "--max-time", "120", "-f", "-A", "Mozilla/5.0", "-o", zipPath, `${BASE}/${ym}_ESTBAN.csv.zip`], { stdio: "ignore" }); } catch { return null; }
  const buf = fs.existsSync(zipPath) ? fs.readFileSync(zipPath) : null;
  if (!buf || buf.length < 5000) { try { fs.unlinkSync(zipPath); } catch {} return null; }
  let csv = null;
  try { const zip = new AdmZip(buf); const e = zip.getEntries().find((x) => /\.csv$/i.test(x.entryName)); if (e) csv = e.getData().toString("latin1"); } catch {}
  try { fs.unlinkSync(zipPath); } catch {}
  return csv;
}

function parseMes(csv, byName, ym) {
  const linhas = csv.split(/\r?\n/);
  const hi = linhas.findIndex((l) => l.startsWith("#DATA_BASE"));
  if (hi < 0) return [];
  const head = linhas[hi].replace(/^#/, "").split(";");
  const ix = (frag) => head.findIndex((h) => h.toUpperCase().includes(frag));
  const iUF = ix("UF"), iMun = head.indexOf("MUNICIPIO");
  const cols = { credito: ix("160_OPERACOES_DE_CREDITO"), rural: ix("163_FIN_RURAIS"), agroind: ix("167_FINANCIAMENTOS_AGROINDUSTRIAIS"), imob: ix("169_FINANCIAMENTOS_IMOBILIARIOS"), poupanca: ix("420_DEPOSITOS_DE_POUPANCA"), prazo: ix("432_DEPOSITOS_A_PRAZO"), vista: ix("401_SERVICOS_PUBLICOS"), ativo: ix("399_TOTAL_DO_ATIVO") };
  const M = new Map();
  for (let i = hi + 1; i < linhas.length; i++) {
    const c = linhas[i].split(";");
    if (c.length < head.length || c[iUF] !== UF) continue;
    const cod = byName.get(norm(c[iMun])); if (!cod) continue;
    if (!M.has(cod)) M.set(cod, { credito: 0, rural: 0, agroind: 0, imob: 0, poupanca: 0, prazo: 0, vista: 0, ativo: 0 });
    const m = M.get(cod);
    for (const k of Object.keys(cols)) if (cols[k] >= 0) m[k] += nn(c[cols[k]]);
  }
  return [...M.entries()].map(([cod, m]) => ({ cod, ym, ...m }));
}

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M' AND left(cod_ibge,2)=(SELECT left(cod_ibge,2) FROM entes_sc WHERE tipo='M' LIMIT 1)`)).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));
  await db.query(`CREATE TABLE IF NOT EXISTS estban_sc (cod_ibge TEXT, ano_mes INTEGER, credito NUMERIC, credito_rural NUMERIC, credito_agroind NUMERIC, credito_imob NUMERIC, poupanca NUMERIC, prazo NUMERIC, a_vista NUMERIC, ativo NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano_mes))`);
  const jaTem = new Set((await db.query(`SELECT cod_ibge||'-'||ano_mes k FROM estban_sc`)).rows.map((r) => r.k));

  // meses candidatos: últimos N a partir de ~3 meses atrás (lag do ESTBAN)
  const hoje = new Date(); const cand = [];
  for (let back = 2; back < 2 + N_MESES; back++) { const d = new Date(hoje.getFullYear(), hoje.getMonth() - back, 1); cand.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`); }
  let meses = 0, linhas = 0;
  for (const ym of cand) {
    const ymN = Number(ym);
    // se TODOS os municípios já têm esse mês, pula o download
    const csv = baixarMes(ym); if (!csv) { continue; }
    const rows = parseMes(csv, byName, ym); if (!rows.length) continue;
    meses++;
    const novas = rows.filter((r) => !jaTem.has(r.cod + "-" + ymN));
    if (novas.length) { // insert em LOTE (um INSERT por mês)
      const vals = [], params = [];
      novas.forEach((r, i) => { const b = i * 10; vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`); params.push(r.cod, ymN, Math.round(r.credito), Math.round(r.rural), Math.round(r.agroind), Math.round(r.imob), Math.round(r.poupanca), Math.round(r.prazo), Math.round(r.vista), Math.round(r.ativo)); });
      await db.query(`INSERT INTO estban_sc (cod_ibge,ano_mes,credito,credito_rural,credito_agroind,credito_imob,poupanca,prazo,a_vista,ativo) VALUES ${vals.join(",")}
        ON CONFLICT (cod_ibge,ano_mes) DO UPDATE SET credito=EXCLUDED.credito,credito_rural=EXCLUDED.credito_rural,credito_agroind=EXCLUDED.credito_agroind,credito_imob=EXCLUDED.credito_imob,poupanca=EXCLUDED.poupanca,prazo=EXCLUDED.prazo,a_vista=EXCLUDED.a_vista,ativo=EXCLUDED.ativo`, params);
      linhas += novas.length;
    }
    process.stdout.write(`  ${ym}: ${rows.length} municípios\n`);
  }
  const chk = (await db.query(`SELECT count(distinct cod_ibge) munis, count(distinct ano_mes) meses, min(ano_mes) mi, max(ano_mes) ma FROM estban_sc`)).rows[0];
  console.log(`✔ estban_sc: ${chk.munis} municípios · ${chk.meses} meses (${chk.mi}–${chk.ma}) · +${linhas} linhas`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
