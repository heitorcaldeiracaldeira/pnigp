import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({connectionString:U, ssl:{rejectUnauthorized:false}, max:3}); db.on("error",()=>{});
const by6 = new Map((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e=>[e.cod_ibge.slice(0,6), e.cod_ibge]));
const data = JSON.parse(fs.readFileSync("C:/Users/PC/pnigp/scripts/_dados/vinculo_cvat_SC.json","utf8"));
await db.query(`CREATE TABLE IF NOT EXISTS cvat_aps_sc (cod_ibge TEXT, quadrimestre TEXT, equipe TEXT, otimo INT, bom INT, suficiente INT, regular INT, total INT, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, quadrimestre, equipe))`);
await db.query("TRUNCATE cvat_aps_sc");
const linhas=[];
for(const [c6,quads] of Object.entries(data)){ const cod=by6.get(c6); if(!cod)continue; for(const [q,eqs] of Object.entries(quads)) for(const [eq,v] of Object.entries(eqs)) linhas.push([cod,q,eq,v.otimo,v.bom,v.suf,v.reg,v.total]); }
for(let i=0;i<linhas.length;i+=300){ const b=linhas.slice(i,i+300); const ph=[]; const vals=[]; b.forEach((r,j)=>{const o=j*8; ph.push(`($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8})`); vals.push(...r);}); if(b.length) await db.query(`INSERT INTO cvat_aps_sc (cod_ibge,quadrimestre,equipe,otimo,bom,suficiente,regular,total) VALUES ${ph.join(",")}`,vals); }
const c=(await db.query("SELECT count(DISTINCT cod_ibge) m, count(*) n FROM cvat_aps_sc")).rows[0];
console.log(`✔ cvat_aps_sc: ${c.m} munis · ${c.n} linhas`);
await db.end();
