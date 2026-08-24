// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// marca_folha_legislativo.mjs — acha e MARCA os municípios cuja folha coletada é, na verdade, do LEGISLATIVO.
//
// POR QUÊ: o veto por URL não pega tudo. Os coletores barram host com "camara" no caminho, mas o portal da
// câmara mora em IP puro ou domínio neutro (`191.253.14.107:8079` em Castilho) — o nome do host não denuncia.
// ⭐ **A prova está no DADO**: a coluna de unidade/lotação diz "CAMARA MUNICIPAL", "VEREADORES", "Legislativo".
// Sem isso, 14 municípios de SP contavam como cobertos com 11 a 43 vereadores no lugar de milhares de servidores
// ([[pnigp-entidade-espelho-infla-folha]]).
//
// NÃO APAGA: o dado da câmara é real e fica onde está. O que se grava é o RÓTULO, em `folha_entidade_legislativo`,
// para a contagem de cobertura municipal poder excluí-los e a redescoberta saber quem procurar.
//
// Uso: UF=SP node scripts/marca_folha_legislativo.mjs   ·   APLICAR=1 para gravar   ·   PCT=80 (limiar)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";
const PCT = Number(process.env.PCT || 80);
const PREF = { SP: "35", PR: "41", RS: "43", SC: "42", MG: "31", RJ: "33" }[process.env.UF || "SP"] || "35";

await q(`create table if not exists folha_entidade_legislativo (
  cod_ibge text, fonte text, municipio text, uf text, linhas int, linhas_legislativo int, pct int,
  amostra_unidade text, em timestamptz default now(), primary key (cod_ibge, fonte)
)`);

// descobre as tabelas de servidores e, em cada uma, a coluna que carrega a unidade/lotação
const RE = "c[aâ]mara|vereador|legislativ";
const achados = [];
for (const t of (await q(`select table_name t from information_schema.columns where table_schema='public'
   and table_name like 'folha_servidores_%' and column_name='cod_ibge' group by 1 order by 1`)).rows) {
  const cols = (await q(`select column_name c from information_schema.columns where table_name=$1`, [t.t])).rows.map((r) => r.c);
  const un = ["unidade", "lotacao", "secretaria", "organograma", "orgao", "departamento", "entidade", "unidade_gestora"].filter((c) => cols.includes(c));
  if (!un.length) continue;
  const expr = un.map((c) => `coalesce(s.${c},'')`).join(" || ' ' || ");
  const fonte = t.t.replace("folha_servidores_", "");
  const r = (await q(`
    select left(s.cod_ibge,6) k, min(s.municipio) municipio, count(*)::int linhas,
           count(*) filter (where ${expr} ~* '${RE}')::int leg,
           (array_agg(distinct left(${expr}, 30)) filter (where ${expr} ~* '${RE}'))[1:2] amostra
      from folha_servidores_${fonte} s where left(s.cod_ibge,2)=$1 group by 1
     having count(*) filter (where ${expr} ~* '${RE}') > 0`, [PREF])).rows;
  for (const x of r) {
    const pct = Math.round(100 * x.leg / x.linhas);
    if (pct >= PCT) achados.push({ fonte, ...x, pct });
  }
}

const rais = new Map((await q(`with a as (select max(ano) a from folha_rais_municipal)
  select lpad(cod_ibge6,6,'0') k, count(*)::int n from folha_rais_municipal, a
   where ano=a.a and esfera_grupo='municipal' and ativo_3112 and left(lpad(cod_ibge6,6,'0'),2)=$1 group by 1`, [PREF])).rows.map((r) => [r.k, r.n]));

console.log(`municípios cuja folha coletada é ≥${PCT}% do LEGISLATIVO: ${achados.length}`);
let raisTotal = 0;
for (const a of achados.sort((x, y) => (rais.get(y.k) || 0) - (rais.get(x.k) || 0))) {
  const r = rais.get(a.k) || 0; raisTotal += r;
  console.log(`  ${String(a.municipio).padEnd(24)} ${a.fonte.padEnd(9)} ${String(a.linhas).padStart(5)} linhas · ${String(a.pct).padStart(3)}% · rais=${String(r).padStart(5)}  ${(a.amostra || []).join(" | ").slice(0, 42)}`);
}
console.log(`\n${raisTotal.toLocaleString("pt-BR")} servidores na RAIS estavam representados por folha de câmara`);
if (!APLICAR) { console.log("\n(DRY — nada gravado. APLICAR=1 para marcar.)"); await db.end(); process.exit(0); }

for (const a of achados) {
  const cod = (await q(`select cod_ibge from municipios_br where cod_ibge6=$1`, [a.k])).rows[0]?.cod_ibge || a.k;
  await q(`insert into folha_entidade_legislativo (cod_ibge,fonte,municipio,uf,linhas,linhas_legislativo,pct,amostra_unidade)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (cod_ibge,fonte) do update set linhas=excluded.linhas, linhas_legislativo=excluded.linhas_legislativo,
       pct=excluded.pct, amostra_unidade=excluded.amostra_unidade, em=now()`,
    [cod, a.fonte, a.municipio, process.env.UF || "SP", a.linhas, a.leg, a.pct, (a.amostra || []).join(" | ").slice(0, 120)]);
}
console.log(`\n${achados.length} marcados em folha_entidade_legislativo (o dado da câmara NÃO foi apagado).`);
await db.end();
