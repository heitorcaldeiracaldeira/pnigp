import fs from "fs"; import pg from "pg";
const db=new pg.Pool({connectionString:fs.readFileSync(".env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim(),ssl:{rejectUnauthorized:false},max:1});
const API="https://consultafns.saude.gov.br/recursos/consulta-consolidada/repasse-bloco";
// município 4200051 (Abdon Batista), ano 2010
const r=await fetch(`${API}?ano=2010&coMunicipioIbge=420005&coTipoRepasse=M&count=50&page=1&sgUf=SC`,{signal:AbortSignal.timeout(40000)});
const j=await r.json(); const blocos=j.resultado||[];
console.log("blocos 2010:", blocos.length);
if(blocos.length){const b=blocos[0];console.log("amostra:", JSON.stringify({codigo:b.codigo,nome:b.nome,vlTotal:b.vlTotal,vlLiquido:b.vlLiquido}));}
// tentar 1 insert REAL e mostrar o erro
try {
  const b=blocos[0]||{codigo:10,nome:"teste",vlTotal:1,vlLiquido:1};
  await db.query(`INSERT INTO fns_repasse_sc (cod_ibge,ano,bloco_cod,bloco_nome,area_cod,area_nome,vl_total,vl_liquido) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (cod_ibge,ano,bloco_cod,area_cod) DO UPDATE SET vl_liquido=EXCLUDED.vl_liquido`,
    ["4200051",2010,b.codigo,b.nome,0,null,b.vlTotal,b.vlLiquido]);
  console.log("INSERT OK ✓");
  await db.query(`DELETE FROM fns_repasse_sc WHERE cod_ibge='4200051' AND ano=2010`);
} catch(e){ console.log("ERRO REAL DO INSERT:", e.message); }
await db.end();
