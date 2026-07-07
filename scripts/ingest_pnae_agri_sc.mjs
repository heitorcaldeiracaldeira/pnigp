// PNAE — % de compra da agricultura familiar (mínimo legal 30%, Lei 11.947/2009) por município. Fonte: FNDE. State-agnostic (UF env).
import fs from "fs"; import pg from "pg"; import XLSX from "xlsx";
const UF = process.env.UF || "SC";
const ANO = process.env.ANO || "2022";
const u = `https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/pnae/consultas/dados-agricultura-familiar-planilhas/Planilha${ANO}_04_3_24.xlsx`;
const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
if (r.status !== 200) { console.error("HTTP " + r.status + " p/ " + ANO); process.exit(1); }
const wb = XLSX.read(Buffer.from(await r.arrayBuffer()), { type: "buffer" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
const hi = rows.findIndex((x) => Array.isArray(x) && x.includes("IBGE"));
const H = rows[hi]; const iUf = H.indexOf("UF"), iEsf = H.indexOf("ESFERA"), iIbge = H.indexOf("IBGE"), iPct = H.indexOf("Percentual"), iVt = H.findIndex((c) => /Valor Transferido/i.test(c)), iVa = H.findIndex((c) => /agricultura familiar/i.test(c));
const money = (s) => parseFloat(String(s || "").replace(/[R$\s]/g, "").replace(/,/g, "")) || 0;
const pct = (s) => parseFloat(String(s || "").replace("%", "").replace(",", ".")) || 0;
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by6 = new Map((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
await db.query(`CREATE TABLE IF NOT EXISTS pnae_agri_sc (cod_ibge TEXT PRIMARY KEY, ano TEXT, valor_transferido NUMERIC, valor_agri NUMERIC, percentual NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM pnae_agri_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (let k = hi + 1; k < rows.length; k++) { const c = rows[k]; if (!Array.isArray(c) || c[iUf] !== UF || !/MUNICIPAL/i.test(c[iEsf] || "")) continue; const cod = by6.get(String(c[iIbge] || "").slice(0, 6)); if (!cod) continue; await db.query("INSERT INTO pnae_agri_sc (cod_ibge,ano,valor_transferido,valor_agri,percentual) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (cod_ibge) DO UPDATE SET ano=EXCLUDED.ano,valor_transferido=EXCLUDED.valor_transferido,valor_agri=EXCLUDED.valor_agri,percentual=EXCLUDED.percentual,atualizado=now()", [cod, ANO, money(c[iVt]), money(c[iVa]), pct(c[iPct])]); n++; }
const s = (await db.query("SELECT count(*) n, count(*) FILTER (WHERE percentual<30) abaixo, round(avg(percentual),1) media FROM pnae_agri_sc")).rows[0];
console.log(`✔ pnae_agri_sc: ${n} munis · ano ${ANO} · média ${s.media}% · ${s.abaixo} abaixo do mínimo legal de 30%`);
await db.end();
