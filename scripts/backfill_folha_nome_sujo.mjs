// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// backfill_folha_nome_sujo.mjs — conserta NO BANCO o que a guarda nova impede daqui pra frente.
//
// Dois defeitos, os dois medidos antes de consertar:
//   1. RÓTULO COLADO NO NOME (117 linhas em `dd`, 9 em `tcemt`): o campo nome guardava o registro inteiro —
//      "ANA TEREZA DA SILVA GUIMARAES Admissão 02/06/2025 Cargo 0095 - ASSESSOR ... SALARIO BASE 1.621,00".
//      Corta no primeiro rótulo e aproveita o resto para preencher cargo e admissão quando estiverem vazios.
//   2. RUBRICA LIDA COMO PESSOA: em Manaquiri e Tapauá o documento publicado é RESUMO GERAL por rubrica, e o
//      parser gravou "QUINQUENIO", "ABONO", "SALARIO BASE" como servidores. Isso não se conserta: apaga.
//
// 🚨 Apaga por LISTA de _hash medida, nunca por curinga ([[feedback-nunca-apagar-por-wildcard]]).
// Uso: node scripts/backfill_folha_nome_sujo.mjs        (só mede)
//      APLICA=1 node scripts/backfill_folha_nome_sujo.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { limpaNome } from "./_folha_pdf_parsers.mjs";
const db = pool(); const q = withRetry(db);
const APLICA = process.env.APLICA === "1";

const tabs = (await q(`select c.table_name t,
    bool_or(c.column_name='cargo') tem_cargo, bool_or(c.column_name='data_admissao') tem_adm
  from information_schema.columns c
  where c.table_schema='public' and c.table_name like 'folha_servidores_%'
  group by 1 having bool_or(c.column_name='nome') and bool_or(c.column_name='_hash') order by 1`)).rows;

let totalLimpo = 0;
for (const t of tabs) {
  const sujas = (await q(`select _hash, nome, ${t.tem_cargo ? "cargo" : "null::text cargo"},
      ${t.tem_adm ? "data_admissao" : "null::text data_admissao"}
    from ${t.t} where nome ~* '(admiss|matr[ií]cula|cargo|cpf|lota[çc])' and length(nome) > 40`)).rows;
  if (!sujas.length) continue;
  const corrigidas = sujas.map((r) => ({ ...limpaNome({ ...r }), _hash: r._hash }))
    .filter((r, i) => r.nome !== sujas[i].nome);
  console.log(`  ${t.t.replace("folha_servidores_", "").padEnd(14)} ${String(sujas.length).padStart(5)} suspeitas → ${corrigidas.length} com corte`);
  if (!corrigidas.length) continue;
  console.log(`      ex.: "${sujas[0].nome.slice(0, 62)}" → "${corrigidas[0].nome}" / cargo "${corrigidas[0].cargo || ""}"`);
  totalLimpo += corrigidas.length;
  if (!APLICA) continue;
  for (let i = 0; i < corrigidas.length; i += 300) {
    const p = corrigidas.slice(i, i + 300); const c = (f) => p.map((x) => x[f] ?? null);
    await q(`update ${t.t} s set nome = v.nome
        ${t.tem_cargo ? `, cargo = case when s.cargo is null or btrim(s.cargo) = ''
             -- 🚨 no Diretório Digital o campo cargo guardava só o CÓDIGO ("0065 -"): isso não é cargo, é
             -- resíduo do mesmo defeito de recorte, e pode ser substituído pelo nome do cargo recuperado.
             or btrim(s.cargo) ~ '^[0-9]+[[:space:]]*[-–]?$' then coalesce(v.cargo, s.cargo) else s.cargo end` : ""}
        ${t.tem_adm ? ", data_admissao = coalesce(nullif(btrim(s.data_admissao),''), v.adm)" : ""}
      from (select * from unnest($1::text[], $2::text[], $3::text[], $4::text[]) as x(h, nome, cargo, adm)) v
      where s._hash = v.h`, [c("_hash"), c("nome"), c("cargo"), c("data_admissao")]);
  }
}
console.log(`\n${APLICA ? "corrigidas" : "corrigiria"} ${totalLimpo} linhas com rótulo colado no nome`);

// ── 2. as rubricas gravadas como gente ────────────────────────────────────────────────────────────────────────
const RUBRICA = `'^(salario|sal\.|vencimento|gratifica|adicional|adic\.|abono|inss|irrf|imposto|previdencia|previd|pensao|licenca|hora extra|quinquenio|faltas|desconto|produtividade|regencia|periculosidade|insalubridade|maternidade|decimo|13|ferias|rescisao|base|total|liquido|bruto|resumo|quantidade|contribuicao|margem|consignad|codigo|evento)'`;
const alvos = (await q(`select cod_ibge, municipio, count(*) n,
    count(*) filter (where lower(unaccent(nome)) ~ ${RUBRICA}) rub
  from folha_servidores_amaam group by 1,2
  having count(*) filter (where lower(unaccent(nome)) ~ ${RUBRICA}) >= 0.3 * count(*)
  order by 3 desc`)).rows;
console.log(`\nmunicípios em que a maioria dos "servidores" é rubrica (documento = resumo):`);
for (const a of alvos) console.log(`  ${a.municipio.padEnd(22)} ${a.n} linhas, ${a.rub} são rubrica`);
if (APLICA && alvos.length) {
  for (const a of alvos) {
    const hashes = (await q(`select _hash from folha_servidores_amaam where cod_ibge=$1`, [a.cod_ibge])).rows.map((r) => r._hash);
    for (let i = 0; i < hashes.length; i += 500)
      await q(`delete from folha_servidores_amaam where _hash = any($1)`, [hashes.slice(i, i + 500)]);
    await q(`update folha_amaam_coleta set situacao='so_resumo', servidores=0,
       detalhe='o documento publicado é RESUMO GERAL por rubrica, sem nome de servidor — as linhas anteriores eram verbetes de folha lidos como pessoas'
       where cod_ibge=$1`, [a.cod_ibge]);
    console.log(`  ✖ ${a.municipio}: ${hashes.length} linhas de rubrica apagadas`);
  }
}
await db.end();
