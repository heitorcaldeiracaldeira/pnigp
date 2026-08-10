// ETL — STN CAPAG (Capacidade de Pagamento) por município. Fonte: Tesouro Transparente (CKAN, XLSX).
// Nota A/B/C/D (elegibilidade a crédito com garantia da União) + 3 indicadores: endividamento, poupança corrente, liquidez.
// node scripts/ingest_capag_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const CKAN = "https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=capag-municipios";
const nn = (v) => { const n = Number(v); return Number.isFinite(n) ? +n.toFixed(3) : null; };

async function run() {
  const XLSX = (await import("xlsx")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byCod = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge));
  const dir = process.env.DIR || os.tmpdir();
  const xp = path.join(dir, "capag.xlsx");
  // ═══ DOWNLOAD TRUNCADO FICAVA PRESO NO CACHE PARA SEMPRE ═══
  // Medido em 10/ago: a fonte falhava com `Bad compressed size: 0 != 636`. O arquivo em cache tinha 17 MB
  // — passava folgado no teste `size < 1e5` — mas começava com `PK` e NÃO tinha o diretório central do ZIP
  // no fim: era um download CORTADO no meio. Um xlsx é um zip, e sem o EOCD ele não abre.
  // O cache por `existsSync` congelava esse arquivo: baixou errado uma vez, falhou todas as seguintes, e
  // nunca tentou de novo. Tamanho não prova integridade — a estrutura prova.
  const zipIntegro = (p) => {
    try {
      const fd = fs.openSync(p, "r"); const tam = fs.statSync(p).size;
      const ini = Buffer.alloc(4); fs.readSync(fd, ini, 0, 4, 0);
      const fim = Buffer.alloc(Math.min(66000, tam)); fs.readSync(fd, fim, 0, fim.length, Math.max(0, tam - fim.length));
      fs.closeSync(fd);
      return ini.toString("latin1", 0, 2) === "PK" && fim.includes(Buffer.from("PK\x05\x06"));  // EOCD
    } catch { return false; }
  };
  if (!fs.existsSync(xp) || fs.statSync(xp).size < 1e5 || !zipIntegro(xp)) {
    try { fs.rmSync(xp, { force: true }); } catch { /* ignora */ }
    const j = JSON.parse(execFileSync("curl", ["-s", "-L", "--max-time", "40", "-A", "Mozilla/5.0", CKAN], { encoding: "utf8" }));
    const res = (j.result?.resources || []).filter((r) => /xls/i.test(r.format));
    // --retry + --fail: baixar 17 MB truncado e chamar de sucesso foi exatamente o que criou o cache podre
    execFileSync("curl", ["-sSL", "--fail", "--max-time", "300", "--retry", "3", "--retry-all-errors",
      "-A", "Mozilla/5.0", "-o", xp, res[res.length - 1].url], { stdio: "ignore" });
    if (!zipIntegro(xp)) throw new Error(`CAPAG: download veio truncado (${fs.statSync(xp).size} bytes, sem EOCD)`);
  }
  const wb = XLSX.readFile(xp);
  const ws = wb.Sheets["Prévia da CAPAG"] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const M = new Map();
  for (const r of rows) {
    const cod = String(r[0] || "").trim(); if (!byCod.has(cod)) continue;
    if (String(r[2] || "").trim().toUpperCase() !== UF) continue;
    // Prévia da CAPAG: 0=cod,1=nome,2=uf,3=NOTA,4=endiv,5=nota_endiv,6=poup,7=nota_poup,8=liq,9=nota_liq
    M.set(cod, { nota: String(r[3] || "").trim().toUpperCase().slice(0, 1), endiv: nn(r[4]), endiv_nota: String(r[5] || "").trim().slice(0, 1), poup: nn(r[6]), poup_nota: String(r[7] || "").trim().slice(0, 1), liq: nn(r[8]), liq_nota: String(r[9] || "").trim().slice(0, 1) });
  }

  await db.query(`CREATE TABLE IF NOT EXISTS capag_sc (cod_ibge TEXT PRIMARY KEY, nota TEXT, endividamento NUMERIC, endiv_nota TEXT, poupanca NUMERIC, poup_nota TEXT, liquidez NUMERIC, liq_nota TEXT, atualizado TIMESTAMPTZ DEFAULT now())`);
  await db.query(`TRUNCATE capag_sc`);
  for (const [cod, d] of M) {
    if (!/^[ABCD]$/.test(d.nota)) continue;
    await db.query(`INSERT INTO capag_sc (cod_ibge,nota,endividamento,endiv_nota,poupanca,poup_nota,liquidez,liq_nota,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [cod, d.nota, d.endiv, d.endiv_nota, d.poup, d.poup_nota, d.liq, d.liq_nota]);
  }
  const chk = (await db.query(`SELECT nota, count(*) n FROM capag_sc GROUP BY nota ORDER BY nota`)).rows;
  console.log(`✔ capag_sc: ${chk.reduce((s, r) => s + Number(r.n), 0)} municípios · ` + chk.map((r) => `${r.nota}:${r.n}`).join(" "));
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
