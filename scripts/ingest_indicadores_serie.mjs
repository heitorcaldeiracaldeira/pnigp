// Ingere TODOS os indicadores_SC_<quad>.json → indicadores_aps_sc (série de quadrimestres) com ISF calculado.
import fs from "fs"; import pg from "pg";
const IND = [{ meta: 45, peso: 1 }, { meta: 60, peso: 1 }, { meta: 60, peso: 2 }, { meta: 40, peso: 1 }, { meta: 95, peso: 2 }, { meta: 50, peso: 2 }, { meta: 50, peso: 1 }];
const isf = (v) => IND.reduce((s, ind, i) => s + Math.min(10, (v[i] / ind.meta) * 10) * ind.peso, 0) / 10;
const dir = "C:/Users/PC/pnigp/scripts/_dados";
const files = fs.readdirSync(dir).filter((f) => /^indicadores_SC_\d{6}\.json$/.test(f));
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by6 = new Map((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
await db.query(`CREATE TABLE IF NOT EXISTS indicadores_aps_sc (cod_ibge TEXT, quadrimestre TEXT, ind1 NUMERIC, ind2 NUMERIC, ind3 NUMERIC, ind4 NUMERIC, ind5 NUMERIC, ind6 NUMERIC, ind7 NUMERIC, isf NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, quadrimestre))`);
for (const f of files) {
  const quad = f.match(/(\d{6})/)[1];
  const data = JSON.parse(fs.readFileSync(dir + "/" + f, "utf8"));
  await db.query("DELETE FROM indicadores_aps_sc WHERE quadrimestre=$1", [quad]);
  const linhas = [];
  for (const [c6, v] of Object.entries(data)) { const cod = by6.get(c6); if (!cod || !Array.isArray(v) || v.length < 7) continue; linhas.push([cod, quad, ...v, isf(v)]); }
  for (let i = 0; i < linhas.length; i += 200) {
    const b = linhas.slice(i, i + 200); const ph = []; const vals = [];
    b.forEach((r, j) => { const o = j * 10; ph.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10})`); vals.push(...r); });
    if (b.length) await db.query(`INSERT INTO indicadores_aps_sc (cod_ibge,quadrimestre,ind1,ind2,ind3,ind4,ind5,ind6,ind7,isf) VALUES ${ph.join(",")}`, vals);
  }
  console.log(`  ${quad}: ${linhas.length} munis`);
}
const c = (await db.query("SELECT count(DISTINCT quadrimestre) q, count(DISTINCT cod_ibge) m FROM indicadores_aps_sc")).rows[0];
const serie = (await db.query("SELECT quadrimestre, round(avg(isf),2) isf FROM indicadores_aps_sc GROUP BY 1 ORDER BY 1")).rows;
console.log(`✔ indicadores_aps_sc: ${c.q} quadrimestres · ${c.m} munis`);
console.log("  ISF médio SC: " + serie.map(s => `${s.quadrimestre}=${s.isf}`).join(" "));
await db.end();
