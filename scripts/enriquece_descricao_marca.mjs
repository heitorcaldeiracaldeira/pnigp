// ENRIQUECE a descrição do item com o que aprendemos do doc de resultado:
// marca VENCEDORA (conferida, trava dupla) + marcas CANDIDATAS (concorreram) + preço homologado.
// Junta itens_sc + item_marca_conferida_sc + item_marca_candidata_sc. Derivada (app, Lei 1).
import fs from "fs"; import pg from "pg";
const U=fs.readFileSync("./.env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db=new pg.Pool({connectionString:U,ssl:{rejectUnauthorized:false},max:2,statement_timeout:180000});
await db.query(`drop table if exists app.item_descricao_enriquecida_sc`);
await db.query(`
  create table app.item_descricao_enriquecida_sc as
  with base as (
    select distinct cnpj,ano,seq,numero from app.item_marca_candidata_sc
    union select cnpj,ano,seq,numero from app.item_marca_conferida_sc)
  select b.cnpj,b.ano,b.seq,b.numero,
    left(i.descricao, 400) descricao_api,
    i.unit_homologado valor_homologado, i.fornecedor, i.catmat,
    conf.marca marca_vencedora, conf.marca_generica venc_generica,
    (select array_agg(distinct c.marca order by c.marca)
       from app.item_marca_candidata_sc c
       where c.cnpj=b.cnpj and c.ano=b.ano and c.seq=b.seq and c.numero=b.numero) marcas_candidatas,
    (select count(distinct c.marca)
       from app.item_marca_candidata_sc c
       where c.cnpj=b.cnpj and c.ano=b.ano and c.seq=b.seq and c.numero=b.numero) n_candidatas
  from base b
  join itens_sc i on i.cnpj=b.cnpj and i.ano=b.ano and i.seq=b.seq and i.numero::text=b.numero
  left join app.item_marca_conferida_sc conf on conf.cnpj=b.cnpj and conf.ano=b.ano and conf.seq=b.seq and conf.numero=b.numero`);
// campo texto legível: descrição + marca vencedora + concorrentes
await db.query(`alter table app.item_descricao_enriquecida_sc add column if not exists descricao_enriquecida text`);
await db.query(`update app.item_descricao_enriquecida_sc set descricao_enriquecida =
  trim(descricao_api)
  || case when marca_vencedora is not null and not coalesce(venc_generica,true)
       then E'\n• Marca vencedora: '||marca_vencedora||coalesce(' (R$ '||valor_homologado||')','') else '' end
  || case when array_length(marcas_candidatas,1)>0
       then E'\n• Marcas que concorreram: '||array_to_string(marcas_candidatas,', ') else '' end`);
const st=(await db.query(`select count(*) itens,
  count(*) filter(where marca_vencedora is not null and not coalesce(venc_generica,true)) com_venc_real,
  count(*) filter(where n_candidatas>0) com_candidatas, round(avg(n_candidatas),1) media_cand
  from app.item_descricao_enriquecida_sc`)).rows[0];
console.log(`itens enriquecidos: ${st.itens} | com marca vencedora real: ${st.com_venc_real} | com candidatas: ${st.com_candidatas} | média candidatas/item: ${st.media_cand}`);
console.log("\n=== amostra de descrição ENRIQUECIDA ===");
(await db.query(`select descricao_enriquecida from app.item_descricao_enriquecida_sc where marca_vencedora is not null and not coalesce(venc_generica,true) and n_candidatas>=3 order by n_candidatas desc limit 3`)).rows.forEach((r,i)=>console.log(`\n[${i+1}] `+r.descricao_enriquecida.slice(0,420)));
await db.end();
