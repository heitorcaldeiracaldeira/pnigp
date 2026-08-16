// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// backfill_folha_portaltp_totais.mjs — recupera bruto/descontos/líquido das rubricas JÁ COLETADAS do Portal TP.
//
// POR QUÊ: o leitor de rubrica do `ingest_folha_portaltp.mjs` só conhecia os nomes do PRIMEIRO portal calibrado
// (Extrema-MG: "Rendimento Bruto" / "Total Desconto" / "Rendimento Liquido"). O Portal TP é white-label e cada
// prefeitura BATIZA a rubrica como quer — em ES/BA/RJ o total se chama "Salario Bruto", "Salario Liquido",
// "Total de Descontos". Resultado: 190 mil linhas gravadas com nome, cargo e secretaria, e `bruto` NULL —
// o defeito nº 1 de [[pnigp-coletor-ok-sem-dado-sete-causas]]: coletor "ok" e dado ausente, sem um erro no log.
//
// 🚨 O valor NUNCA se perdeu: a coluna `rubricas` (jsonb) guardou a folha rubrica a rubrica. Por isso a correção é
// um UPDATE sobre o que já está no banco — zero requisição ao portal, que é host compartilhado e rate-limita.
//
// A leitura é PELO NOME e nunca por soma (somar as 40 rubricas soma os próprios totais e infla 3×). O que valida
// é a aritmética: bruto − descontos = líquido.
//
// Uso: node scripts/backfill_folha_portaltp_totais.mjs        (mede e aplica)
//      DRY=1 node scripts/backfill_folha_portaltp_totais.mjs  (só mede)
//      UF=ES ...                                              (restringe a uma UF)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const DRY = process.env.DRY === "1";
const UF = process.env.UF || null;

// 🚨 nada de `\s` no literal SQL: a conexão não está com standard_conforming_strings garantido e o `\s` chegou ao
// regex como um "s" literal — o normalizador comia a letra S de "Salario" ("alario bruto") e NADA casava.
const N = (c) => `regexp_replace(btrim(lower(unaccent(${c}))),'[[:space:]]+',' ','g')`;

// Os TOTAIS, pelo nome, cobrindo as variantes medidas nas 190 mil linhas (com e sem acento, singular/plural).
// "Vencimentos" fica DE FORA de propósito: em uns portais é o total, em outros é uma parcela — ambíguo.
const RE_BRUTO = `'^(salario|sal|remuneracao|remuneracoes|rendimento|rendimentos|total) (bruto|bruta|brutos|brutas)$|^total (de |das |dos )?(remuneracao|remuneracoes|vencimento|vencimentos)$'`;
const RE_LIQ = `'^((salario|remuneracao|rendimento|rendimentos|vencimento|valor|saldo|total) )?(liquido|liquida|liquidos|liquidas)$'`;
const RE_DESC = `'^(total|totais) (de |das |dos )?(desconto|descontos)$|^descontos$'`;

const filtroUF = UF ? `and f.uf = '${UF.replace(/'/g, "")}'` : "";

// CTE única: para cada linha, o maior valor entre as rubricas que são total daquele tipo.
// O fecho aritmético completa o que falta — quando dois dos três existem, o terceiro é determinado.
const TOTAIS = (extra = "") => `
  select f._hash, f.uf,
    max(case when ${N("e.k")} ~ ${RE_BRUTO} then (e.v)::numeric end) b,
    max(case when ${N("e.k")} ~ ${RE_LIQ}   then (e.v)::numeric end) l,
    max(case when ${N("e.k")} ~ ${RE_DESC}  then (e.v)::numeric end) d
  from folha_servidores_portaltp f, jsonb_each_text(f.rubricas) e(k, v)
  where f.rubricas <> '{}'::jsonb ${filtroUF} ${extra}
  group by 1, 2`;

const FECHA = `select _hash, uf,
    coalesce(b, case when l is not null and d is not null then l + d end) bruto,
    coalesce(d, case when b is not null and l is not null then b - l end) descontos,
    coalesce(l, case when b is not null and d is not null then b - d end) liquido,
    b b0, l l0, d d0
  from t`;

console.log("═══ ANTES ═══");
console.table((await q(`select uf, count(*) linhas, count(bruto) com_bruto,
    count(*) filter (where rubricas <> '{}'::jsonb) com_rubricas
  from folha_servidores_portaltp f where true ${filtroUF} group by 1 order by 2 desc`)).rows);

console.log("═══ O QUE A LEITURA POR NOME RECUPERA ═══");
console.table((await q(`with t as (${TOTAIS()}), x as (${FECHA})
  select uf, count(*) linhas, count(bruto) bruto, count(descontos) descontos, count(liquido) liquido,
    count(*) filter (where b0 is not null and l0 is not null and d0 is not null and abs(b0-d0-l0) < 0.02) confere_aritmetica,
    count(*) filter (where b0 is not null and l0 is not null and d0 is not null) tinha_os_tres,
    round(avg(bruto), 2) media_bruto, round(max(bruto), 2) maior_bruto
  from x group by 1 order by 2 desc`)).rows);

if (DRY) { console.log("\n[DRY] nada gravado."); await db.end(); process.exit(0); }

// UPDATE em fatias por UF para não segurar uma transação gigante no Neon ([[feedback-banco-e-o-gargalo]]).
const ufs = (await q(`select distinct uf from folha_servidores_portaltp f where uf is not null ${filtroUF} order by 1`)).rows.map((r) => r.uf);
for (const u of ufs) {
  const t0 = Date.now();
  const r = await q(`with t as (${TOTAIS("and f.uf = $1")}), x as (${FECHA})
    update folha_servidores_portaltp f
       set bruto = coalesce(f.bruto, x.bruto), descontos = coalesce(f.descontos, x.descontos),
           liquido = coalesce(f.liquido, x.liquido)
      from x where x._hash = f._hash
        and (f.bruto is null and x.bruto is not null or f.liquido is null and x.liquido is not null
             or f.descontos is null and x.descontos is not null)`, [u]);
  console.log(`  ${u}: ${r.rowCount.toLocaleString("pt-BR")} linhas atualizadas (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

console.log("═══ DEPOIS ═══");
console.table((await q(`select uf, count(distinct cod_ibge) municipios, count(*) linhas, count(bruto) com_bruto,
    round(avg(bruto) filter (where bruto > 0), 2) media_bruto
  from folha_servidores_portaltp f where true ${filtroUF} group by 1 order by 3 desc`)).rows);
await db.end();
