// Lei Paulo Gustavo (LPG) — execução financeira por município: transferido, SALDO em conta, % utilizado (risco de devolução). Fonte: MinC/dados.cultura. State-agnostic (UF env).
import fs from "fs"; import pg from "pg";
const UF = process.env.UF || "SC";
const numX = (s) => parseFloat(String(s || "0").replace(/[^\d.-]/g, "")) || 0;
const url = "https://dados.cultura.gov.br/dataset/69255f1c-4ad4-4a3e-8621-3fe7ff7bc899/resource/afa83cf2-2e3b-4ea0-bae7-00b2b756dbcf/download/execucaofinanceiramunicipioslpg.csv";
const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR" } });
const txt = Buffer.from(await r.arrayBuffer()).toString("utf8");
const L = txt.split(/\r?\n/); const H = L[0].split(",");
const iIbge = 0, iUf = 1, iTransf = H.findIndex((c) => /Transferido/i.test(c)), iSaldo = H.findIndex((c) => /Saldo/i.test(c)), iUtil = H.findIndex((c) => /Utilizado \(R/i.test(c));
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by6 = new Map((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
const agg = new Map();
for (let k = 1; k < L.length; k++) { const c = L[k].split(","); if (c[iUf] !== UF) continue; const cod = by6.get(String(c[iIbge] || "").slice(0, 6)); if (!cod) continue; if (!agg.has(cod)) agg.set(cod, { transf: 0, saldo: 0, util: 0 }); const o = agg.get(cod); o.transf += numX(c[iTransf]); o.saldo += numX(c[iSaldo]); o.util += numX(c[iUtil]); }
await db.query(`CREATE TABLE IF NOT EXISTS lpg_sc (cod_ibge TEXT PRIMARY KEY, transferido NUMERIC, saldo NUMERIC, utilizado NUMERIC, pct_utilizado NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM lpg_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (const [cod, o] of agg) { const pct = o.transf > 0 ? Math.round((o.util / o.transf) * 1000) / 10 : 0; await db.query("INSERT INTO lpg_sc (cod_ibge,transferido,saldo,utilizado,pct_utilizado) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (cod_ibge) DO UPDATE SET transferido=EXCLUDED.transferido,saldo=EXCLUDED.saldo,utilizado=EXCLUDED.utilizado,pct_utilizado=EXCLUDED.pct_utilizado,atualizado=now()", [cod, o.transf, o.saldo, o.util, pct]); n++; }
const c = (await db.query("SELECT count(*) n, round(sum(transferido)/1e6,1) tr, round(sum(saldo)/1e6,1) sa FROM lpg_sc")).rows[0];
console.log(`✔ lpg_sc: ${n} munis · transferido R$ ${c.tr} mi · saldo em conta R$ ${c.sa} mi (risco de devolução)`);
await db.end();
