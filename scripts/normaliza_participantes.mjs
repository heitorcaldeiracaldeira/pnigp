import fs from "fs"; import pg from "pg";
const U=fs.readFileSync("./.env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db=new pg.Pool({connectionString:U,ssl:{rejectUnauthorized:false},max:2,statement_timeout:180000});
const NOISE=/^(CONFORME.*|.*\bEDITAL$|IMPORTAD[OA]|NACIONAL|DIVERSOS?|PR[OÓ]PRI[OA]|MARCA PR[OÓ]PRIA|COMPAT[IÍ]VEL|SIMILAR|EQUIVALENTE|S\/?MARCA|N\/?A|SEM MARCA|-+|GEN[EÉ]RIC[OA]|A COMBINAR|N[AÃ]O INFORMAD.*|A DEFINIR|VARIAD[OA]S?|SIM|N[AÃ]O|NENHUM[AO]?|NOTEBOOK|MICROCOMPUTADOR|COMPUTADOR|OBJETO|MARCA|MODELO|PLACA|SINAL)$/;
const SPEC=/\b(CONCRETO|USINAD[OA]|COMPONENTES|CIMENTO|SINALIZ|DIMENS|MATERIAL|CONFORME|ESPECIFIC)\b/;
function norm(s){ if(!s) return null;
  let x=s.normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase();
  x=x.split("/")[0].replace(/[.,;:*"'()\[\]]+/g," ").replace(/\s+/g," ").trim();
  x=x.replace(/\s*-\s*(ME|EPP|LTDA|EIRELI|S\/?A)\b.*$/,"").trim();
  if(x.length<2 || NOISE.test(x) || /^\d+$/.test(x)) return null;
  if(x.split(" ").length>4 || SPEC.test(x)) return null;   // echo de descrição/spec, não marca
  return x.slice(0,40); }
await db.query(`alter table app.item_marca_participante_sc add column if not exists marca_norm text`);
const dist=(await db.query(`select distinct marca from app.item_marca_participante_sc`)).rows.map(r=>r.marca);
const src=dist, dst=dist.map(norm);
await db.query(`update app.item_marca_participante_sc t set marca_norm=m.n
  from (select unnest($1::text[]) marca, unnest($2::text[]) n) m where t.marca=m.marca`,[src,dst]);
await db.query(`drop table if exists app.item_marca_candidata_sc`);
await db.query(`create table app.item_marca_candidata_sc as
  select cnpj,ano,seq,numero, max(descricao_item) descricao_item, marca_norm marca,
         bool_or(vencedor) foi_vencedora, min(valor) menor_valor, count(*) n_propostas, max(portal) portal
  from app.item_marca_participante_sc where marca_norm is not null
  group by cnpj,ano,seq,numero,marca_norm`);
const st=(await db.query(`select
  (select count(distinct marca) from app.item_marca_participante_sc) brutas,
  (select count(distinct marca_norm) from app.item_marca_participante_sc where marca_norm is not null) norm,
  (select count(*) from app.item_marca_participante_sc where marca_norm is null) ruido,
  (select count(*) from app.item_marca_candidata_sc) dedup`)).rows[0];
console.log(`brutas: ${st.brutas} → normalizadas distintas: ${st.norm} | ruído descartado: ${st.ruido} linhas | dedup(item×marca): ${st.dedup}`);
console.log("\n=== catálogo: marcas mais frequentes (deduplicadas) ===");
(await db.query(`select marca, count(distinct cnpj||ano||seq||numero) itens, count(*) filter(where foi_vencedora) venceu from app.item_marca_candidata_sc group by 1 order by 2 desc limit 25`)).rows.forEach(r=>console.log(`  ${String(r.itens).padStart(4)} itens (${String(r.venceu).padStart(3)} venceu) | ${r.marca}`));
await db.end();
