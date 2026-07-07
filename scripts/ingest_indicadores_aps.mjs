// Ingere os 7 indicadores Previne + ISF calculado → indicadores_aps_sc. Pesos/metas oficiais (NT 3/2022-DESF/SAPS/MS).
import fs from "fs"; import pg from "pg";
const quad = process.argv[2] || "202404";
// ordem = colunas 3..9 do relatório (coIndicador 10,20,30,40,50,60,70)
export const IND = [
  { cod: 10, meta: 45, peso: 1 }, { cod: 20, meta: 60, peso: 1 }, { cod: 30, meta: 60, peso: 2 },
  { cod: 40, meta: 40, peso: 1 }, { cod: 50, meta: 95, peso: 2 }, { cod: 60, meta: 50, peso: 2 }, { cod: 70, meta: 50, peso: 1 },
];
function isf(vals) { let soma = 0; IND.forEach((ind, i) => { const nota = Math.min(10, (vals[i] / ind.meta) * 10); soma += nota * ind.peso; }); return soma / 10; }

const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by6 = new Map((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
const data = JSON.parse(fs.readFileSync(`C:/Users/PC/pnigp/scripts/_dados/indicadores_SC_${quad}.json`, "utf8"));
await db.query(`CREATE TABLE IF NOT EXISTS indicadores_aps_sc (cod_ibge TEXT, quadrimestre TEXT, ind1 NUMERIC, ind2 NUMERIC, ind3 NUMERIC, ind4 NUMERIC, ind5 NUMERIC, ind6 NUMERIC, ind7 NUMERIC, isf NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, quadrimestre))`);
await db.query("DELETE FROM indicadores_aps_sc WHERE quadrimestre=$1", [quad]);
let n = 0;
for (const [cod6, vals] of Object.entries(data)) {
  const cod = by6.get(cod6); if (!cod || !Array.isArray(vals) || vals.length < 7) continue;
  const s = isf(vals);
  await db.query("INSERT INTO indicadores_aps_sc (cod_ibge,quadrimestre,ind1,ind2,ind3,ind4,ind5,ind6,ind7,isf) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [cod, quad, ...vals, s]);
  n++;
}
const c = (await db.query("SELECT count(*) n, round(avg(isf),2) isf FROM indicadores_aps_sc WHERE quadrimestre=$1", [quad])).rows[0];
const fl = (await db.query("SELECT isf, ind1, ind5 FROM indicadores_aps_sc WHERE cod_ibge='4205407' AND quadrimestre=$1", [quad])).rows[0];
console.log(`✔ indicadores_aps_sc: ${n} munis · ISF médio SC ${c.isf} · Floripa ISF ${fl?.isf} (ind1=${fl?.ind1}% ind5=${fl?.ind5}%)`);
await db.end();
