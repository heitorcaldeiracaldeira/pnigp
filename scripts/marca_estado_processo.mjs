// ESTADO da marca por processo (homologado c/ itens) — roteado pelo portal REAL. Mata o falso negativo:
// nunca "sem marca"; sempre CONFERIDA / doc-no-acervo / a-buscar[portal] / sem-rota. É a fila de trabalho.
import fs from "fs"; import pg from "pg";
const U=fs.readFileSync("./.env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db=new pg.Pool({connectionString:U,ssl:{rejectUnauthorized:false},max:2,statement_timeout:590000});
const RES=`a.titulo ~* '(homolog|ata de realiz|ata de sess|resultado|adjudica|vencedor|termo de julg)'`;
const CRACK=`('Portal de Compras Públicas','BLL','BNC','Compras.gov')`;
await db.query(`drop table if exists app.marca_estado_processo`);
await db.query(`
  create table app.marca_estado_processo as
  with base as (
    select distinct c.cnpj,c.ano,c.seq, c.modalidade from contratacoes_sc c
    where c.valor_homologado is not null and exists(select 1 from itens_sc i where i.cnpj=c.cnpj and i.ano=c.ano and i.seq=c.seq))
  select b.cnpj,b.ano,b.seq,b.modalidade, pr.portal_real,
    case
      when exists(select 1 from app.item_marca_conferida_sc x where x.cnpj=b.cnpj and x.ano=b.ano and x.seq=b.seq) then 'conferida'
      when exists(select 1 from arquivos_sc a where a.cnpj=b.cnpj and a.ano=b.ano and a.seq=b.seq and ${RES}) then 'doc_no_acervo'
      when pr.portal_real in ${CRACK} then 'buscar_crackado'
      when pr.portal_real is not null then 'buscar_naocrackado'
      else 'sem_rota'
    end estado
  from base b left join app.processo_portal_real pr using(cnpj,ano,seq)`);
await db.query(`create index if not exists ix_mep on app.marca_estado_processo(estado, portal_real)`);
console.log("estado materializado. fila 'doc_no_acervo' e 'buscar_crackado' por portal × modalidade:");
console.table((await db.query(`select estado, portal_real, count(*) procs from app.marca_estado_processo where estado in ('doc_no_acervo','buscar_crackado') group by 1,2 order by 3 desc limit 15`)).rows);
await db.end();
