// Ingere a série histórica de produção da APS (SISAB) → producao_aps_serie_sc. Insert EM LOTE (rápido).
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by6 = new Map((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
const data = JSON.parse(fs.readFileSync("C:/Users/PC/pnigp/scripts/_dados/producao_aps_serie_SC.json", "utf8"));
await db.query(`CREATE TABLE IF NOT EXISTS producao_aps_serie_sc (cod_ibge TEXT, competencia TEXT, aprovadas BIGINT, total BIGINT, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, competencia))`);
await db.query("TRUNCATE producao_aps_serie_sc");
// monta todas as linhas
const linhas = [];
for (const [cod6, series] of Object.entries(data)) { const cod = by6.get(cod6); if (!cod) continue; for (const [comp, o] of Object.entries(series)) linhas.push([cod, comp, o.aprov || 0, o.total || 0]); }
// insert em lote de 500
const CH = 500;
for (let i = 0; i < linhas.length; i += CH) {
  const batch = linhas.slice(i, i + CH);
  const vals = []; const ph = [];
  batch.forEach((r, j) => { const b = j * 4; ph.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4})`); vals.push(...r); });
  await db.query(`INSERT INTO producao_aps_serie_sc (cod_ibge,competencia,aprovadas,total) VALUES ${ph.join(",")}`, vals);
}
const c = (await db.query("SELECT count(DISTINCT cod_ibge) munis, count(DISTINCT competencia) comps, count(*) linhas FROM producao_aps_serie_sc")).rows[0];
const anos = (await db.query("SELECT left(competencia,4) ano, round(sum(aprovadas)/1e6,1) mi FROM producao_aps_serie_sc GROUP BY 1 ORDER BY 1")).rows;
console.log(`✔ producao_aps_serie_sc: ${c.munis} munis · ${c.comps} competências · ${c.linhas} linhas`);
console.log("  por ano (mi aprovadas): " + anos.map(a => `${a.ano}=${a.mi}`).join(" "));
await db.end();
