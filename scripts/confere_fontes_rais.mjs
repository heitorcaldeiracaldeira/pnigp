// Revisão por FONTE contra a RAIS, direto nas tabelas cruas (mais rápido que pela view e mostra o coletor).
// ⭐ O sinal de defeito NÃO é um município abaixo do denominador — é uma FONTE com cobertura média muito
// abaixo das vizinhas. Foi assim que o NucleoGov (52% contra 88% do megasoft) revelou que coletava um só
// órgão por município. Ver [[pnigp-conferidor-rais-denominador-folha]].
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);
const CORTE = Number(process.env.CORTE || 0.35);
const MIN_RAIS = Number(process.env.MIN_RAIS || 150);

const tabs = (await q(`select c.table_name t
  from information_schema.columns c
 where c.table_schema='public' and c.table_name like 'folha_servidores_%' and c.column_name='cod_ibge'
 group by 1 order by 1`)).rows.map((r) => r.t);

const out = [];
for (const t of tabs) {
  try {
    const r = (await q(`
      with f as (select cod_ibge, count(*) n from ${t}
                  where cod_ibge is not null and length(cod_ibge)=7 group by 1),
      r as (select left(cod_ibge6::text,6) c, count(*) v from folha_rais_municipal group by 1)
      select count(*)::int municipios,
             count(*) filter (where f.n < r.v*${CORTE})::int subcoletados,
             round(avg(100.0*f.n/nullif(r.v,0))::numeric,1) cobertura_media
        from f join r on r.c = left(f.cod_ibge,6) where r.v >= ${MIN_RAIS}`)).rows[0];
    if (r.municipios >= 5) out.push({ fonte: t.replace("folha_servidores_", ""), ...r,
      pct_suspeito: Math.round(1000 * r.subcoletados / r.municipios) / 10 });
  } catch { /* tabela sem cod_ibge de 7 dígitos */ }
}
out.sort((a, b) => (a.cobertura_media ?? 999) - (b.cobertura_media ?? 999));
console.log("\n═══ COBERTURA MÉDIA POR FONTE (RAIS = denominador) — as de baixo são as suspeitas ═══\n");
console.table(out);
console.log(`\nTotal de fontes avaliadas: ${out.length}. Corte de suspeita: <${Math.round(CORTE * 100)}% da RAIS.`);
console.log("⚠️ Cobertura baixa NÃO prova defeito: câmara e autarquia estão fora do escopo em várias fontes,");
console.log("   e fonte de cadastro sem valor conta pessoa sem folha. O sinal é a DIFERENÇA entre fontes.");
await db.end();
