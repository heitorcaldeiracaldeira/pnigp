// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// conta_folha.mjs — quantos municípios têm folha, por camada. Descobre as tabelas `folha_servidores_*` sozinho,
// para não esquecer fonte nova (foi o que aconteceu com tenosoft e equiplano no primeiro contador).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 🚨 18/ago: este contador também lia as tabelas CRUAS e ignorava os vetos da view (câmara coletada como se
// fosse prefeitura, 13º, poder≠executivo). Terceiro consumidor do MESMO mapa — os vetos moram em
// `_folha_filtros.mjs` ([[pnigp-view-folha-nao-enxerga-coletores]]).
import { pool, withRetry } from "./_cadprev.mjs";
import { filtroDaTabela } from "./_folha_filtros.mjs";
const db = pool();
const q = withRetry(db);

const tabs = (await q(`select table_name t from information_schema.tables
  where table_schema='public' and table_name like 'folha_servidores_%' order by 1`)).rows.map((r) => r.t);
const comIbge = [];
for (const t of tabs) {
  const tem = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (tem) comIbge.push(t);
}
console.log(`${tabs.length} tabelas de servidores · ${comIbge.length} com cod_ibge`);
console.log("sem cod_ibge (resolvidas por nome):", tabs.filter((t) => !comIbge.includes(t)).join(", ") || "(nenhuma)");

const uni = comIbge.map((t) => { const v = filtroDaTabela(t); return `select cod_ibge from ${t}${v ? ` where ${v}` : ""}`; }).join(" union all ");
const nominal = (await q(`select count(distinct cod_ibge)::int n from (${uni}) x where cod_ibge is not null`)).rows[0].n;

// PE e MA guardam o município por nome
const norm = (c) => `upper(translate(${c},'ÁÀÂÃÄÉÊÈËÍÎÌÏÓÔÕÒÖÚÛÙÜÇáàâãäéêèëíîìïóôõòöúûùüç','AAAAAEEEEIIIIOOOOOUUUUCAAAAAEEEEIIIIOOOOOUUUUC'))`;
const extra = `
  select m.cod_ibge from folha_servidores_pe f join municipios_br m
    on ${norm("m.nome")}=${norm("trim(f.municipio)")} and m.uf='PE'
  union all
  select m.cod_ibge from folha_servidores_ma f join municipios_br m
    on ${norm("m.nome")}=${norm("regexp_replace(trim(f.ente),'^(PREFEITURA MUNICIPAL DE |MUNICIPIO DE |CAMARA MUNICIPAL DE )','','i')")} and m.uf='MA'`;
const total = (await q(`select count(distinct cod_ibge)::int n from (${uni} union all ${extra}) x where cod_ibge is not null`)).rows[0].n;
const comAgreg = (await q(`select count(distinct cod_ibge)::int n from (${uni} union all ${extra}
  union all select cod_ibge from folha_aspec_secretaria
  union all select cod_ibge from folha_rs_secretaria) x where cod_ibge is not null`)).rows[0].n;

console.log(`\nNOMINAL (tabelas com cod_ibge): ${nominal}`);
console.log(`NOMINAL + PE/MA por nome:      ${total}  (${(total / 5570 * 100).toFixed(1)}% dos 5.570)`);
console.log(`COM AGREGADO (ASPEC+RS):       ${comAgreg}  (${(comAgreg / 5570 * 100).toFixed(1)}%)`);

console.log("\npor fonte (municípios distintos):");
const linhas = [];
for (const t of comIbge) {
  const r = (await q(`select count(distinct cod_ibge)::int m, count(*)::int n from ${t}`)).rows[0];
  linhas.push({ t: t.replace("folha_servidores_", ""), m: r.m, n: r.n });
}
for (const x of linhas.sort((a, b) => b.m - a.m)) {
  console.log(`  ${x.t.padEnd(12)} ${String(x.m).padStart(4)} mun · ${x.n.toLocaleString("pt-BR").padStart(10)} linhas`);
}
await db.end();
