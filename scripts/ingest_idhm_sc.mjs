// IDHM municipal (Atlas Brasil / PNUD-IPEA-FJP) — IDHM + subíndices (renda/longevidade/educação). Último oficial municipal: Censo 2010. State-agnostic (UF env).
import fs from "fs"; import pg from "pg"; import XLSX from "xlsx";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
const url = "https://www.atlasbrasil.org.br/cockpit/storage/uploads/dados/censo_total_1991_2010.xlsx";
const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
const wb = XLSX.read(Buffer.from(await r.arrayBuffer()), { type: "buffer" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["MUN 91-00-10"], { header: 1, raw: false });
const H = rows[0];
const iAno = H.indexOf("ANO"), iCod = H.indexOf("Codmun7"), iIdhm = H.indexOf("IDHM"), iL = H.indexOf("IDHM_L"), iE = H.indexOf("IDHM_E"), iR = H.indexOf("IDHM_R");
const flt = (v) => parseFloat(String(v || "").replace(",", ".")) || 0;
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by7 = new Set((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => e.cod_ibge));
await db.query(`CREATE TABLE IF NOT EXISTS idhm_sc (cod_ibge TEXT PRIMARY KEY, ano TEXT, idhm NUMERIC, idhm_renda NUMERIC, idhm_long NUMERIC, idhm_educ NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM idhm_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (let k = 1; k < rows.length; k++) { const c = rows[k]; if (!c || String(c[iAno]) !== "2010") continue; const cod = String(c[iCod] || ""); if (cod.slice(0, 2) !== UFC || !by7.has(cod)) continue; await db.query("INSERT INTO idhm_sc (cod_ibge,ano,idhm,idhm_renda,idhm_long,idhm_educ) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (cod_ibge) DO UPDATE SET ano=EXCLUDED.ano,idhm=EXCLUDED.idhm,idhm_renda=EXCLUDED.idhm_renda,idhm_long=EXCLUDED.idhm_long,idhm_educ=EXCLUDED.idhm_educ,atualizado=now()", [cod, "2010", flt(c[iIdhm]), flt(c[iR]), flt(c[iL]), flt(c[iE])]); n++; }
const cc = (await db.query("SELECT count(*) n, round(avg(idhm),3) m, max(idhm) mx FROM idhm_sc")).rows[0];
console.log(`✔ idhm_sc: ${cc.n} munis · IDHM médio ${cc.m} · máx ${cc.mx} (Censo 2010, último oficial municipal)`);
await db.end();
