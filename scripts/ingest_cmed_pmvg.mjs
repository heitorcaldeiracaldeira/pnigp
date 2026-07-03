// ETL — CMED/Anvisa PMVG (Preço Máximo de Venda ao Governo): o TETO LEGAL de preço de medicamentos.
// Referência nacional p/ detectar sobrepreço em compras de saúde. SC = alíquota ICMS 17%.
// Baixe o xlsx "Conformidade Gov" da Anvisa e passe em FILE=, ou deixe o script baixar (URL=).
// node scripts/ingest_cmed_pmvg.mjs
import fs from "fs"; import pg from "pg"; import xlsx from "xlsx";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const num = (v) => { if (typeof v === "number") return v > 0 ? v : null; const s = String(v || "").trim().replace(/\./g, "").replace(",", "."); const n = Number(s); return Number.isFinite(n) && n > 0 ? n : null; };

async function main() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0";
  let buf;
  if (process.env.FILE) buf = fs.readFileSync(process.env.FILE);
  else {
    let url = process.env.URL;
    if (!url) {
      // auto-descobre o link atual do "Conformidade Gov" (PMVG) na página da Anvisa
      const pg = await fetch("https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
      const html = await pg.text();
      const m = html.match(/https?:\/\/[^"']*xls_conformidade_gov[^"']*\.xlsx[^"']*/i);
      if (!m) throw new Error("link do Conformidade Gov não encontrado na página da Anvisa");
      url = m[0].replace(/&amp;/g, "&");
      console.log("URL descoberta:", url.slice(0, 90));
    }
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(180000) });
    if (!r.ok) throw new Error("download " + r.status); buf = Buffer.from(await r.arrayBuffer());
  }
  const wb = xlsx.read(buf, { type: "buffer" });
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false });
  // acha o cabeçalho (linha com APRESENTAÇÃO + PMVG)
  let h = -1;
  for (let i = 0; i < Math.min(80, rows.length); i++) { const r = (rows[i] || []).map((x) => String(x || "").trim()); if (r.some((c) => /^apresenta/i.test(c)) && r.some((c) => /PMVG/i.test(c) && c.length < 25)) { h = i; break; } }
  if (h < 0) throw new Error("cabeçalho não encontrado");
  const head = rows[h].map((x) => String(x || "").trim());
  const col = (re) => head.findIndex((c) => re.test(c));
  const iSub = 0, iLab = col(/^LABORAT/i), iProd = col(/^PRODUTO/i), iApr = col(/^APRESENTA/i), iClasse = col(/CLASSE TERAP/i), iRegime = col(/REGIME DE PRE/i), iGgrem = col(/GGREM/i), iRestr = col(/RESTRI..O HOSPITALAR/i);
  const iPmvg0 = head.findIndex((c) => /^PMVG 0\s*%/i.test(c)), iPmvg17 = head.findIndex((c) => /^PMVG 17\s*%$/i.test(c));
  if (iPmvg0 < 0 || iPmvg17 < 0) throw new Error("colunas PMVG não encontradas");

  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS cmed_pmvg (ggrem TEXT PRIMARY KEY, substancia TEXT, laboratorio TEXT, produto TEXT, apresentacao TEXT, classe TEXT, regime TEXT, pmvg_0 NUMERIC, pmvg_17 NUMERIC, restricao_hospitalar BOOLEAN, atualizado timestamptz DEFAULT now())`);
  await db.query(`TRUNCATE cmed_pmvg`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };

  // bulk insert em lotes via UNNEST
  const lote = { g: [], s: [], l: [], pr: [], a: [], c: [], re: [], p0: [], p17: [], rh: [] };
  let ok = 0;
  const flush = async () => {
    if (!lote.g.length) return;
    await q(`INSERT INTO cmed_pmvg (ggrem,substancia,laboratorio,produto,apresentacao,classe,regime,pmvg_0,pmvg_17,restricao_hospitalar)
             SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::numeric[],$9::numeric[],$10::bool[])
             ON CONFLICT (ggrem) DO NOTHING`, [lote.g, lote.s, lote.l, lote.pr, lote.a, lote.c, lote.re, lote.p0, lote.p17, lote.rh]);
    ok += lote.g.length; for (const k in lote) lote[k] = [];
  };
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || []; const ggrem = String(r[iGgrem] || "").trim(); const apr = String(r[iApr] || "").trim();
    if (!ggrem || !apr) continue;
    lote.g.push(ggrem); lote.s.push(String(r[iSub] || "").slice(0, 200)); lote.l.push(String(r[iLab] || "").slice(0, 120)); lote.pr.push(String(r[iProd] || "").slice(0, 200));
    lote.a.push(apr.slice(0, 250)); lote.c.push(String(r[iClasse] || "").slice(0, 120)); lote.re.push(String(r[iRegime] || "").slice(0, 60));
    lote.p0.push(num(r[iPmvg0])); lote.p17.push(num(r[iPmvg17])); lote.rh.push(/^sim/i.test(String(r[iRestr] || "")));
    if (lote.g.length >= 1000) await flush();
  }
  await flush();
  const t = await db.query(`SELECT count(*) n, count(*) FILTER (WHERE pmvg_17 IS NOT NULL) com17, count(distinct substancia) subs FROM cmed_pmvg`);
  console.log(`Concluído: ${ok} medicamentos · ${t.rows[0].com17} com PMVG 17% (SC) · ${t.rows[0].subs} substâncias`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
