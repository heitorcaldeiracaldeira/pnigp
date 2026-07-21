// DETECTA o portal REAL da compra (a bolsa onde a disputa rodou) a partir do EDITAL — não do rótulo `plataforma`
// (que é o ERP/relay). É o roteador: sabendo o portal real × modalidade, aplica-se o analisador de padrão certo.
// Grava app.processo_portal_real. Idempotente. Server-side (CASE sobre o início do edital).
import fs from "fs"; import pg from "pg";
const U=fs.readFileSync("./.env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db=new pg.Pool({connectionString:U,ssl:{rejectUnauthorized:false},max:2,statement_timeout:590000});
const LIM=Number(process.env.LIMIT||400);
await db.query(`create table if not exists app.processo_portal_real(
  cnpj text, ano int, seq int, portal_real text, modalidade text, plataforma_rotulo text,
  atualizado timestamptz default now(), primary key(cnpj,ano,seq))`);
// CASE de detecção (ordem = prioridade; primeiro forte vence)
const CASE = `case
  when tx ~ 'portaldecompraspublicas|portal de compras p'          then 'Portal de Compras Públicas'
  when tx ~ '\mbnc\M|bolsa nacional de compras'                   then 'BNC'
  when tx ~ '\mbll\M|bolsa de licita|bllcompras'                  then 'BLL'
  when tx ~ 'comprasbr|az inform'                                  then 'ComprasBR (AZ)'
  when tx ~ 'licitanet'                                            then 'Licitanet'
  when tx ~ 'licitar ?digital'                                     then 'Licitar Digital'
  when tx ~ 'bbmnet|bolsa brasileira'                              then 'BBMNET'
  when tx ~ 'compras\.gov|comprasnet|cnetmobile|gov\.br/compras'  then 'Compras.gov'
  when tx ~ 'licitacoes-?e|banco do brasil'                        then 'Licitações-E BB'
  else null end`;
const r=await db.query(`
  insert into app.processo_portal_real(cnpj,ano,seq,portal_real,modalidade,plataforma_rotulo)
  select x.cnpj,x.ano,x.seq, ${CASE.replace(/tx/g,'x.tx')}, x.modalidade, x.plataforma
  from (
    select c.cnpj,c.ano,c.seq,c.modalidade,c.plataforma, left(lower(t.texto),9000) tx
    from contratacoes_sc c
    join arquivo_texto_sc t on t.cnpj=c.cnpj and t.ano=c.ano and t.seq=c.seq and t.tipo_documento='Edital' and t.chars>500
    where not exists(select 1 from app.processo_portal_real p where p.cnpj=c.cnpj and p.ano=c.ano and p.seq=c.seq)
    limit ${LIM}
  ) x
  on conflict(cnpj,ano,seq) do nothing`);
console.log("processos detectados nesta leva:", r.rowCount);
console.log("\n=== PORTAL REAL × modalidade (detectado) ===");
console.table((await db.query(`select portal_real, modalidade, count(*) n from app.processo_portal_real where portal_real is not null group by 1,2 order by 3 desc limit 20`)).rows);
console.log("sem detecção (portal_real null):", (await db.query(`select count(*) n from app.processo_portal_real where portal_real is null`)).rows[0].n);
await db.end();
