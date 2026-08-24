// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// mede_folha_uf.mjs — quanto de uma UF já tem folha nominal, em municípios E em servidores.
//
// Régua única da campanha: percorre TODAS as tabelas `folha_servidores_*` que tenham `cod_ibge`, junta os
// municípios cobertos e compara com a RAIS, que é o denominador externo ([[pnigp-conferidor-rais-denominador-folha]]).
//
// 🚨 `where cod_ibge is not null` não é zelo: um único NULL na lista faz o `not in` devolver ZERO linhas, e o
// levantamento inteiro sai dizendo que não falta nada.
//
// ⚠️ O denominador RAIS "esfera municipal" inclui CÂMARA, autarquias e fundações. Um município cuja prefeitura
// publica tudo pode aparecer com razão 0,8 só por isso — foi o caso de Canoas (4.311 coletados contra 4.304 do
// recorte "Município", mas 5.571 no total da esfera). Use DETALHE=1 para ver a decomposição por natureza.
//
// Uso: UF=RS node scripts/mede_folha_uf.mjs       · DETALHE=1 para abrir a RAIS por natureza jurídica
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const DETALHE = process.env.DETALHE === "1";

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const F = partes.join(" union ");

const r = (await q(`
  with rais as (select cod_ibge6, count(*)::int v from folha_rais_municipal
                 where esfera_grupo ilike '%munic%' and ativo_3112 group by 1)
  select count(*)::int total,
         count(*) filter (where left(m.cod_ibge,6) in (${F}))::int com,
         sum(coalesce(r.v,0))::int rais_total,
         sum(coalesce(r.v,0)) filter (where left(m.cod_ibge,6) in (${F}))::int rais_com
    from municipios_br m left join rais r on r.cod_ibge6=left(m.cod_ibge,6) where m.uf=$1`, [UF])).rows[0];
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : "0.0");
console.log(`\n${UF}: ${r.com}/${r.total} municípios (${pct(r.com, r.total)}%) · `
  + `${r.rais_com.toLocaleString("pt-BR")}/${r.rais_total.toLocaleString("pt-BR")} servidores (${pct(r.rais_com, r.rais_total)}%)\n`);

const faltam = (await q(`select m.nome, coalesce(r.v,0) rais,
    (select classe from folha_lai_pendencia p where p.cod_ibge=m.cod_ibge) classe
  from municipios_br m
  left join (select cod_ibge6, count(*)::int v from folha_rais_municipal
              where esfera_grupo ilike '%munic%' and ativo_3112 group by 1) r on r.cod_ibge6=left(m.cod_ibge,6)
  where m.uf=$1 and left(m.cod_ibge,6) not in (${F}) order by coalesce(r.v,0) desc`, [UF])).rows;
console.log(`--- ${faltam.length} faltantes:`);
console.table(faltam);

if (DETALHE) {
  console.log("\n--- RAIS por natureza jurídica (o denominador não é só a prefeitura):");
  console.table((await q(`select coalesce(natureza_desc,'(sem)') natureza, count(*)::int vinculos
    from folha_rais_municipal r join municipios_br m on left(m.cod_ibge,6)=r.cod_ibge6
    where m.uf=$1 and r.esfera_grupo ilike '%munic%' and r.ativo_3112
    group by 1 order by 2 desc limit 10`, [UF])).rows);
}
await db.end();
