// Taxa de EVASÃO escolar por município e etapa (Fund AI/AF, Médio) — Indicadores de Fluxo do INEP (Taxas de Transição). State-agnostic.
import fs from "fs"; import pg from "pg"; import XLSX from "xlsx";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
const XLS = process.argv[2];
const flt = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; };
const wb = XLSX.readFile(XLS);
const rows = XLSX.utils.sheet_to_json(wb.Sheets["MUNICÍPIO"], { header: 1, raw: false });
const I = { cod: 3, loc: 5, dep: 6, evFund: 39, evAI: 40, evAF: 41, evMed: 51 };
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by7 = new Set((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => e.cod_ibge));
await db.query(`CREATE TABLE IF NOT EXISTS taxa_evasao_sc (cod_ibge TEXT, periodo TEXT, dependencia TEXT, ev_fund NUMERIC, ev_fund_ai NUMERIC, ev_fund_af NUMERIC, ev_medio NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, dependencia))`);
await db.query("DELETE FROM taxa_evasao_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (let k = 8; k < rows.length; k++) { const c = rows[k]; if (!c) continue; const cod = String(c[I.cod] || "").trim(); if (cod.slice(0, 2) !== UFC || !by7.has(cod)) continue; if (String(c[I.loc]).trim() !== "Total") continue; const dep = String(c[I.dep] || "").trim(); if (!["Total", "Municipal", "Estadual"].includes(dep)) continue; await db.query("INSERT INTO taxa_evasao_sc (cod_ibge,periodo,dependencia,ev_fund,ev_fund_ai,ev_fund_af,ev_medio) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (cod_ibge,dependencia) DO UPDATE SET ev_fund=EXCLUDED.ev_fund,ev_fund_ai=EXCLUDED.ev_fund_ai,ev_fund_af=EXCLUDED.ev_fund_af,ev_medio=EXCLUDED.ev_medio,atualizado=now()", [cod, "2021/2022", dep, flt(c[I.evFund]), flt(c[I.evAI]), flt(c[I.evAF]), flt(c[I.evMed])]); n++; }
const cc = (await db.query("SELECT count(*) linhas, count(DISTINCT cod_ibge) munis FROM taxa_evasao_sc")).rows[0];
console.log(`✔ taxa_evasao_sc: ${cc.linhas} linhas · ${cc.munis} municípios (evasão por etapa, rede Total/Municipal/Estadual)`);
await db.end();
