// Ingere o conceito por indicador do Componente de Qualidade → qualidade_indicadores_sc.
import fs from "fs"; import pg from "pg";
const categoria = (co) => co <= 110 ? "eSF e eAP" : co <= 116 ? "Saúde Bucal (eSB)" : co <= 118 ? "eMulti" : co <= 124 ? "eCR" : co <= 130 ? "eAPP" : "eSFR";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by6 = new Map((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
const data = JSON.parse(fs.readFileSync("C:/Users/PC/pnigp/scripts/_dados/qualidade_indicadores_SC.json", "utf8"));
await db.query(`CREATE TABLE IF NOT EXISTS qualidade_indicadores_sc (cod_ibge TEXT, quadrimestre TEXT, co_indicador INT, nome TEXT, categoria TEXT, otimo INT, bom INT, suficiente INT, regular INT, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, quadrimestre, co_indicador))`);
await db.query("TRUNCATE qualidade_indicadores_sc");
const linhas = [];
for (const [c6, quads] of Object.entries(data)) { const cod = by6.get(c6); if (!cod) continue; for (const [q, inds] of Object.entries(quads)) for (const [co, v] of Object.entries(inds)) linhas.push([cod, q, +co, v.nome, categoria(+co), v.otimo, v.bom, v.suf, v.reg]); }
for (let i = 0; i < linhas.length; i += 250) {
  const b = linhas.slice(i, i + 250); const ph = []; const vals = [];
  b.forEach((r, j) => { const o = j * 9; ph.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9})`); vals.push(...r); });
  if (b.length) await db.query(`INSERT INTO qualidade_indicadores_sc (cod_ibge,quadrimestre,co_indicador,nome,categoria,otimo,bom,suficiente,regular) VALUES ${ph.join(",")}`, vals);
}
const c = (await db.query("SELECT count(DISTINCT cod_ibge) m, count(DISTINCT quadrimestre) q, count(DISTINCT co_indicador) ind, count(*) n FROM qualidade_indicadores_sc")).rows[0];
console.log(`✔ qualidade_indicadores_sc: ${c.m} munis · ${c.q} quadrimestres · ${c.ind} indicadores · ${c.n} linhas`);
await db.end();
