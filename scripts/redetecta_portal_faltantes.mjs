// RE-DETECTA o portal real nos processos que ficaram SEM ROTA (portal_real null) — inclui o que faltou:
// Estado de Santa Catarina (e-lic.sc.gov.br / SEA-SC) e reforço dos demais. Atualiza os nulls, em lote.
import fs from "fs"; import pg from "pg";
const U=fs.readFileSync("./.env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db=new pg.Pool({connectionString:U,ssl:{rejectUnauthorized:false},max:2,statement_timeout:590000});
const LIM=Number(process.env.LIMIT||4000);
const CASE = `case
  when tx ~ 'e-?lic\.sc\.gov|portaldecompras\.sc|portal de compras.*santa catarina|secretaria de estado da administra|\melic\M' then 'Estado de Santa Catarina (e-lic)'
  when tx ~ 'portaldecompraspublicas|portal de compras p' then 'Portal de Compras Públicas'
  when tx ~ '\mbnc\M|bolsa nacional de compras' then 'BNC'
  when tx ~ '\mbll\M|bolsa de licita|bllcompras' then 'BLL'
  when tx ~ 'comprasbr|az inform' then 'ComprasBR (AZ)'
  when tx ~ 'licitanet' then 'Licitanet'
  when tx ~ 'licitar ?digital' then 'Licitar Digital'
  when tx ~ 'bbmnet|bolsa brasileira' then 'BBMNET'
  when tx ~ 'compras\.gov|comprasnet|cnetmobile|gov\.br/compras' then 'Compras.gov'
  when tx ~ 'licitacoes-?e|banco do brasil' then 'Licitações-E BB'
  when tx ~ 'ecustomize|e-custom' then 'ECustomize'
  when tx ~ 'publica ?tec|publicanet|\mpublica\M' then 'Pública Tecnologia'
  when tx ~ 'governanca ?brasil|gov ?brasil' then 'Governançabrasil'
  else null end`;
let total=0;
for(let i=0;i<80;i++){
  const r=await db.query(`
    update app.processo_portal_real p set portal_real=v.det, atualizado=now()
    from (
      select e.cnpj,e.ano,e.seq, ${CASE.replace(/tx/g,'e.tx')} det from (
        select t.cnpj,t.ano,t.seq, left(lower(t.texto),9000) tx
        from app.processo_portal_real p2
        join arquivo_texto_sc t on t.cnpj=p2.cnpj and t.ano=p2.ano and t.seq=p2.seq and t.tipo_documento='Edital' and t.chars>500
        where p2.portal_real is null
        limit ${LIM}
      ) e
    ) v
    where p.cnpj=v.cnpj and p.ano=v.ano and p.seq=v.seq and v.det is not null and p.portal_real is null`);
  total+=r.rowCount;
  process.stdout.write(`\r  atualizadas: ${total}`);
  if(r.rowCount===0){ // nada novo detectado neste lote de nulls; mas ainda há nulls não-detectáveis → parar quando um lote não muda
    // checa se ainda há nulls candidatos que casariam — se não, sai
    break;
  }
}
console.log(`\ntotal re-detectado: ${total}`);
console.log("\n=== PORTAL REAL (atualizado) ===");
console.table((await db.query(`select portal_real, count(*) procs from app.processo_portal_real where portal_real is not null group by 1 order by 2 desc`)).rows);
console.log("ainda sem rota:", (await db.query(`select count(*) n from app.processo_portal_real where portal_real is null`)).rows[0].n);
await db.end();
