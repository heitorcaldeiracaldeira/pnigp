// ETL — Transferências obrigatórias da União por município (OFICIAL, STN/Tesouro Transparente CSV).
// FPM, FUNDEB, ITR, Lei Kandir (LC 87/96), CIDE, FEX, IOF-Ouro, LC 176. Soma os 12 meses → total anual.
// node scripts/ingest_transferencias_stn.mjs   (state-agnostic: filtra a UF de UF_ALVO, default SC)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF_ALVO = (process.env.UF || "SC").toUpperCase();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");
const numBR = (s) => { const t = String(s || "").trim().replace(/\s/g, "").replace(/\./g, "").replace(",", "."); const n = Number(t); return Number.isFinite(n) ? n : 0; };
const BASE = "https://www.tesourotransparente.gov.br/ckan/dataset/3b5a779d-78f5-4602-a6b7-23ece6d60f27/resource";
const FONTES = [
  { item: "FPM", res: "d69ff32a-6681-4114-81f0-233bb6b17f58", file: "fpm-por-municipio.csv" },
  { item: "FUNDEB", res: "18d5b0ae-8037-461e-8685-3f0d7752a287", file: "fundeb-por-municipio.csv" },
  { item: "ITR", res: "f6ad4e51-fc7e-40bb-b35a-3686da7fde2d", file: "itr-por-municipio.csv" },
  { item: "Lei Kandir (LC 87/96)", res: "06aed495-8f46-4852-97f1-ae49822aa179", file: "lc-8796-por-municipio.csv" },
  { item: "CIDE-Combustíveis", res: "18820d64-95fd-4475-b391-e07d62a376ae", file: "cide-por-municipio.csv" },
  { item: "FEX", res: "4ca6aad2-fa9d-48e1-a608-5614578d7df2", file: "fex-por-municipio.csv" },
  { item: "IOF-Ouro", res: "4248cd95-6d79-4520-9e17-48322eab6259", file: "iof-por-municipio.csv" },
  { item: "LC 176/2020", res: "c833631a-0933-4e43-a0a5-f77c2fa2267d", file: "lc-176-por-municipio.csv" },
];

async function baixar(f) {
  for (let t = 0; t < 8; t++) {
    try {
      const r = await fetch(`${BASE}/${f.res}/download/${f.file}`, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/csv,*/*" }, signal: AbortSignal.timeout(180000) });
      if (!r.ok) { console.log(`    ${f.item}: HTTP ${r.status} (tentativa ${t + 1}) — backoff`); await sleep(10000 * (t + 1)); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000) { await sleep(10000 * (t + 1)); continue; } // resposta vazia/erro
      return buf.toString("latin1"); // CSV é ISO-8859-1
    } catch (e) { console.log(`    ${f.item}: ${e.cause?.code || e.name} (tentativa ${t + 1})`); await sleep(8000 * (t + 1)); }
  }
  return null;
}

const ANO_MIN = Number(process.env.ANO_MIN || 2015); // mensal a partir de (comportamento dos repasses)
async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  // MENSAL: base p/ mostrar repasse mês a mês + total anual + soma de todos
  await db.query(`CREATE TABLE IF NOT EXISTS transferencias_stn_sc (cod_ibge TEXT, item TEXT, ano INT, mes INT, valor NUMERIC, fonte TEXT DEFAULT 'STN', PRIMARY KEY (cod_ibge, item, ano, mes))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const byName = new Map((await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M' AND uf=$1`, [UF_ALVO])).rows.map((r) => [norm(r.nome), r.cod_ibge]));

  const filtro = process.env.ITENS ? process.env.ITENS.split(",").map((x) => x.trim().toUpperCase()) : null;
  for (const f of FONTES) {
    if (filtro && !filtro.some((x) => f.item.toUpperCase().includes(x))) continue;
    const txt = await baixar(f);
    if (!txt) { console.log(`  [falha download] ${f.item}`); continue; }
    const linhas = txt.split(/\r?\n/);
    const head = linhas[0].split(";");
    const anoCols = head.map((h, i) => ({ i, ano: Number(String(h).trim()) })).filter((x) => x.ano >= ANO_MIN && x.ano <= 2100);
    const batch = []; let n = 0; const semMap = new Set();
    const flush = async () => { if (!batch.length) return; const vals = [], ps = []; let k = 0; for (const row of batch) { ps.push(`($${++k},$${++k},$${++k},$${++k},$${++k})`); vals.push(...row); } await q(`INSERT INTO transferencias_stn_sc (cod_ibge,item,ano,mes,valor) VALUES ${ps.join(",")} ON CONFLICT (cod_ibge,item,ano,mes) DO UPDATE SET valor=EXCLUDED.valor`, vals); n += batch.length; batch.length = 0; };
    for (let li = 1; li < linhas.length; li++) {
      const c = linhas[li].split(";");
      if (c.length < 6 || (c[2] || "").trim().toUpperCase() !== UF_ALVO) continue;
      const cod = byName.get(norm(c[1]));
      if (!cod) { if (c[1]) semMap.add(c[1].trim()); continue; }
      const mes = Number(String(c[4]).trim()); if (!(mes >= 1 && mes <= 12)) continue;
      for (const { i, ano } of anoCols) { const v = numBR(c[i]); if (v) { batch.push([cod, f.item, ano, mes, Math.round(v * 100) / 100]); if (batch.length >= 1000) await flush(); } }
    }
    await flush();
    console.log(`  ${f.item.padEnd(22)} ${n} (município×ano×mês)${semMap.size ? ` · ${semMap.size} nomes sem match: ${[...semMap].slice(0, 3).join(", ")}` : ""}`);
  }
  const c = await db.query(`SELECT item, count(distinct cod_ibge) munis, count(*) linhas, min(ano) mn, max(ano) mx FROM transferencias_stn_sc GROUP BY 1 ORDER BY 1`);
  console.log("Concluído:", JSON.stringify(c.rows));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
