// O QUE A ROTA DESTRAVA — quanto de MARCA passa a ser alcançável depois do roteador v3.
// Separa o que é extraível JÁ (doc de resultado no acervo, custo zero, sem rede) do que vira FILA de coleta
// por portal (precisa buscar o doc). Sempre com a `via` junto: fato do documento ≠ rótulo da API.
//   node scripts/marca_destravada_por_rota.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
const q = async (s) => (await db.query(s)).rows;
const RES = `a.titulo ~* '(homolog|ata de realiz|ata de sess|ata final|resultado|adjudica|vencedor|termo de julg|registro de pre)'`;
// portais com coletor pronto no repo (scripts/auditoria/coletor_*.mjs)
const CRACK = `('Portal de Compras Públicas','BLL','BNC','Compras.gov','ComprasBR (AZ)','BBMNET','Estado de Santa Catarina (e-lic)','Licitações-E BB')`;

console.log("== 1) COBERTURA DE ROTA por via (processos homologados) ==");
console.table(await q(`
  select coalesce(p.via,'(sem rota)') via, count(*) procs,
         round(100.0*count(*)/sum(count(*)) over (),1) pct_procs,
         count(*) filter (where p.portal_real in ${CRACK}) em_portal_com_coletor
  from app.processo_portal_real p
  where exists(select 1 from itens_sc i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado>0)
  group by 1 order by 2 desc`));

console.log("== 2) PORTAL × via ==");
console.table(await q(`
  select coalesce(p.portal_real,'(sem rota)') portal, coalesce(p.via,'—') via, count(*) procs
  from app.processo_portal_real p
  where exists(select 1 from itens_sc i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado>0)
  group by 1,2 order by 3 desc limit 30`));

console.log("== 3) O QUE DESTRAVA: processos roteados AGORA (via <> doc_bolsa_v2), por situação do documento ==");
console.table(await q(`
  with h as (
    select p.cnpj,p.ano,p.seq,p.via,p.portal_real
    from app.processo_portal_real p
    where p.portal_real is not null and coalesce(p.via,'')<>'doc_bolsa_v2'
      and exists(select 1 from itens_sc i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado>0))
  select h.via,
    count(*) procs_roteados,
    count(*) filter (where exists(select 1 from arquivos_sc a where a.cnpj=h.cnpj and a.ano=h.ano and a.seq=h.seq and ${RES})) extraivel_ja,
    count(*) filter (where not exists(select 1 from arquivos_sc a where a.cnpj=h.cnpj and a.ano=h.ano and a.seq=h.seq and ${RES})
                       and h.portal_real in ${CRACK}) fila_coletor_pronto,
    count(*) filter (where not exists(select 1 from arquivos_sc a where a.cnpj=h.cnpj and a.ano=h.ano and a.seq=h.seq and ${RES})
                       and h.portal_real not in ${CRACK}) fila_sem_coletor
  from h group by 1 order by 2 desc`));

console.log("== 4) ITENS homologados (o denominador da marca) por situação ==");
console.table(await q(`
  with h as (
    select p.cnpj,p.ano,p.seq,p.portal_real, coalesce(p.via,'(sem rota)') via from app.processo_portal_real p),
  it as (
    select i.cnpj,i.ano,i.seq,count(*) n from itens_sc i where i.unit_homologado>0 group by 1,2,3)
  select case when h.portal_real is null then '3 · ainda sem rota'
              when exists(select 1 from arquivos_sc a where a.cnpj=it.cnpj and a.ano=it.ano and a.seq=it.seq and ${RES}) then '1 · doc de resultado NO ACERVO (extraivel ja)'
              when h.portal_real in ${CRACK} then '2 · fila: coletor pronto p/ esse portal'
              else '2b · fila: portal sem coletor' end situacao,
         count(*) procs, sum(it.n) itens
  from it left join h using(cnpj,ano,seq) group by 1 order by 1`));

console.log("== 5) MARCA HOJE vs ALCANÇÁVEL (itens) ==");
console.table(await q(`
  with it as (select cnpj,ano,seq,count(*) n from itens_sc where unit_homologado>0 group by 1,2,3),
  comdoc as (select distinct a.cnpj,a.ano,a.seq from arquivos_sc a where ${RES}),
  comrota as (select cnpj,ano,seq from app.processo_portal_real where portal_real is not null)
  select sum(it.n) itens_homologados,
         sum(it.n) filter (where exists(select 1 from comdoc d where d.cnpj=it.cnpj and d.ano=it.ano and d.seq=it.seq)) itens_com_doc_resultado,
         sum(it.n) filter (where exists(select 1 from comrota r where r.cnpj=it.cnpj and r.ano=it.ano and r.seq=it.seq)) itens_com_rota,
         (select count(*) from app.item_marca_conferida_sc) itens_com_marca_hoje
  from it`));

await db.end();
