// NORMALIZA marca_visao — determinístico, sem API. Separa marca REAL de fornecedor-no-campo e genérico.
import fs from "fs"; import pg from "pg";
const U=fs.readFileSync(".env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db=new pg.Pool({connectionString:U,ssl:{rejectUnauthorized:false},max:2});
await db.query(`alter table app.item_marca_visao_sc add column if not exists marca_norm text`);
await db.query(`alter table app.item_marca_visao_sc add column if not exists classe text`);
const rows=(await db.query(`select ctid, marca, fornecedor from app.item_marca_visao_sc`)).rows;
const GEN=/n[aã]o\s*especif|^\s*pr[oó]pri[oa]\s*$|^\s*servi[cç]o\s*$|^\s*diversos?\s*$|^\s*-+\s*$|^\s*n\/?a\s*$|sem\s*marca|^\s*$/i;
const MANUF=/farmac|laborat|fresenius|kabi|multilaser|siemens|nestl|\bind[uú]stria\b|\b(fiat|vw|gm|chev|ford|toyota|hyundai|renault|honda|peugeot|citro[eë]n|jeep)\b|[A-Z]{2,}\/[A-Z]/i;
const FORN=/\b(ltda|eireli|epp|cnpj|cpf|com[eé]rcio|comercio|servi[cç]os|distribu|atacad|represent|neg[oó]cios)\b/i;
let R={real:0,fornecedor:0,generico:0};
for(const r of rows){
  const m=(r.marca||"").trim(), f=(r.fornecedor||"").trim();
  let classe, norm=null;
  if(GEN.test(m)) classe="generico";
  else if(f && m.toLowerCase()===f.toLowerCase()) classe="fornecedor_no_campo";
  else if(MANUF.test(m)){ classe="real"; norm=m; }
  else if(FORN.test(m)) classe="fornecedor_no_campo";
  else { classe="real"; norm=m; }
  R[classe==="fornecedor_no_campo"?"fornecedor":classe]++;
  await db.query(`update app.item_marca_visao_sc set marca_norm=$1, classe=$2 where ctid=$3`,[norm,classe,r.ctid]);
}
console.log("classificação:", JSON.stringify(R));
console.log("\n=== MARCAS REAIS limpas (distintas) ===");
(await db.query(`select marca_norm m,count(*) n from app.item_marca_visao_sc where classe='real' group by 1 order by 2 desc,1 limit 40`)).rows.forEach(x=>console.log(`  ${String(x.n).padStart(2)}× ${x.m}`));
console.log("\n=== por PORTAL (só marca real) ===");
console.table((await db.query(`select portal,count(*) marcas_reais,count(distinct cnpj||ano||seq) proc from app.item_marca_visao_sc where classe='real' group by 1 order by 2 desc`)).rows);
await db.end();
