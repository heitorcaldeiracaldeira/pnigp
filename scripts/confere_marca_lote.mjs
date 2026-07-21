// CONFERE em lote a marca já colhida pelos parsers de portal (item_marca_sc) contra o itens_sc.
// Trava: item (numero) + VALOR (unit ≈ unit_homologado). Grava no mesmo item_marca_conferida_sc.
// (comprasnet usa CNPJ+valor — mais forte; aqui item+valor porque o parser não guardou o CNPJ do vencedor.)
import fs from "fs"; import pg from "pg";
const U=fs.readFileSync("./.env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db=new pg.Pool({connectionString:U,ssl:{rejectUnauthorized:false},max:2,statement_timeout:590000});
const GEN=`m.marca !~* '^(diversos|pr[oó]pri[oa]|marca pr[oó]pria|s/?marca|n[aã]o|sem marca|-+|conforme|importad|nacional|generic|refrigerante)$'`;
const r=await db.query(`
  insert into app.item_marca_conferida_sc(cnpj,ano,seq,numero,marca,modelo,fornecedor_cnpj,valor,marca_generica,cnpj_ok,valor_ok,portal,fonte_titulo)
  select m.cnpj,m.ano,m.seq,m.numero::text, m.marca, m.modelo, i.cnpj_fornecedor, m.valor,
         false, (i.cnpj_fornecedor is not null), true, coalesce(c.plataforma,'?'), 'parser_portal (item+valor)'
  from item_marca_sc m
  join itens_sc i on i.cnpj=m.cnpj and i.ano=m.ano and i.seq=m.seq and i.numero=m.numero
  left join contratacoes_sc c on c.cnpj=m.cnpj and c.ano=m.ano and c.seq=m.seq
  where m.marca is not null and trim(m.marca)<>'' and ${GEN}
    and i.unit_homologado is not null and abs(i.unit_homologado - m.valor) < 0.02
  on conflict (cnpj,ano,seq,numero) do nothing`);
console.log("inseridas (conferidas por item+valor):", r.rowCount);
const t=(await db.query(`select count(*) n, count(*) filter(where not marca_generica) real from app.item_marca_conferida_sc`)).rows[0];
console.log("TOTAL marca conferida agora:", t.n, "| real:", t.real);
console.log("por portal:", JSON.stringify((await db.query(`select portal, count(*) n from app.item_marca_conferida_sc group by 1 order by 2 desc limit 10`)).rows));
await db.end();
