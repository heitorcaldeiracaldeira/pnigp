// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// verifica_competencia_folha.mjs — invariantes da COLUNA COMPETÊNCIA em todas as tabelas `folha_servidores_*`.
//
// ⭐ Nasceu em 17/ago/2026, depois de dois defeitos que passaram por toda conferência de volume:
//   • Canoas gravou JANEIRO rotulado como JULHO (o `<select>` não aplicava sem clicar em Buscar);
//   • gxrh fabricava o mês como `ANO + (nº de opções do combo)`;
//   • genexus gravava `AAAA-MM` com o ano fixo em string, fora do padrão das demais tabelas.
// Nenhum apareceu na contagem de servidores — só olhando a competência ([[pnigp-filtro-que-nao-aplica-confira-pelo-dado]]).
//
// O que checa, por tabela:
//   1. FORMATO — tudo deve ser `AAAAMM`; `AAAA-MM`, `AAAA` ou texto livre acusam coletor fora do padrão
//   2. MÊS VÁLIDO — 01..12; um "00" ou "13" é competência inventada
//   3. ANO PLAUSÍVEL — entre 2000 e o ano corrente + 1
//   4. COMPETÊNCIA ÚNICA POR MUNICÍPIO — quando um coletor grava um mês só, todos os municípios com o MESMO mês é
//      sinal de default não filtrado (era o retrato do gxrh: 7 municípios, todos `202601`)
//
// Uso: node scripts/verifica_competencia_folha.mjs        · UF=RS para restringir
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const ANO_MAX = new Date().getFullYear() + 1;

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%' order by 1`)).rows.map((r) => r.t);

const achados = [], décimos = [], conhecidos = [];

// ── casos APURADOS que não são defeito (17/ago/2026) ──────────────────────────────────────────────────────────
// Ficam listados à parte para não afogar o relatório — mas continuam visíveis, porque quem soma folha por
// competência precisa saber que estas linhas não são um mês fechado.
const ACEITOS = {
  "folha_servidores_digifred|null": "quadro de cargos e salários (piso/teto por cargo), não folha mensal — não tem competência por natureza",
  "folha_servidores_tcemt|2025": "Radar Pessoal do TCE-MT: base ANUAL, a competência é o exercício",
  "folha_servidores_ipm|null": "Farroupilha/Rolante/Bom Progresso: coleta anterior em que o item não devolvia `odomesano`; a recoleta responde HTTP 500, então ficam NULAS em vez de receberem competência inventada",
};
const RE_ACEITO_MES00 = /^folha_servidores_agape\|\d{4}00$/;   // agape: linhas de DEMITIDOS, sem folha mensal
for (const t of tabs) {
  const cols = (await q(`select column_name n from information_schema.columns where table_name=$1`, [t])).rows.map((r) => r.n);
  if (!cols.includes("competencia") || !cols.includes("cod_ibge")) continue;
  const filtro = UF && cols.includes("uf") ? `where uf = '${UF.replace(/'/g, "")}'` : "";

  const comps = (await q(`select competencia c, count(*)::int n, count(distinct cod_ibge)::int mun
    from ${t} ${filtro} group by 1 order by 2 desc`)).rows;
  if (!comps.length) continue;
  const total = comps.reduce((s, x) => s + x.n, 0);

  for (const { c, n } of comps) {
    const chave = `${t}|${c ?? "null"}`;
    if (ACEITOS[chave] || RE_ACEITO_MES00.test(chave)) {
      conhecidos.push({ tabela: t, competencia: c ?? "(nula)", linhas: n,
        porque: ACEITOS[chave] || "agape: linhas de servidores DEMITIDOS, sem folha mensal" });
      continue;
    }
    if (c == null) { achados.push({ tabela: t, problema: "competência NULA", detalhe: `${n} linhas` }); continue; }
    if (!/^\d{6}$/.test(String(c))) {
      achados.push({ tabela: t, problema: "formato fora do padrão AAAAMM", detalhe: `"${c}" em ${n} linhas` });
      continue;
    }
    const ano = Number(String(c).slice(0, 4)), mes = Number(String(c).slice(4, 6));
    // ⭐ mês 13 é convenção legítima para 13º SALÁRIO (o ASPEC usa: 202313, 201613…). Não é defeito — mas fica
    // registrado no resumo, porque quem soma folha por competência precisa saber que essa linha não é um mês.
    if (mes === 13) { décimos.push({ tabela: t, competencia: c, linhas: n }); continue; }
    if (mes < 1 || mes > 12) achados.push({ tabela: t, problema: "mês inválido", detalhe: `"${c}" em ${n} linhas` });
    if (ano < 2000 || ano > ANO_MAX) achados.push({ tabela: t, problema: "ano implausível", detalhe: `"${c}" em ${n} linhas` });
  }

  // ⚠️ sinal (não prova) de filtro não aplicado: MUITOS municípios e UMA competência só
  const municipios = (await q(`select count(distinct cod_ibge)::int m from ${t} ${filtro}`)).rows[0].m;
  const soAceito = comps.every(({ c }) => ACEITOS[`${t}|${c ?? "null"}`] || RE_ACEITO_MES00.test(`${t}|${c ?? "null"}`));
  if (comps.length === 1 && municipios >= 5 && !soAceito) {
    achados.push({ tabela: t, problema: "competência ÚNICA para muitos municípios",
      detalhe: `${municipios} municípios, todos em ${comps[0].c} — conferir se o filtro está sendo aplicado` });
  }
  console.log(`${t.padEnd(38)} ${String(total).padStart(8)} linhas · ${municipios} mun. · ${comps.length} competência(s)`
    + (comps.length <= 4 ? `: ${comps.map((x) => x.c).join(", ")}` : ""));
}

console.log("\n" + "═".repeat(100));
if (décimos.length) {
  console.log(`ℹ️  ${décimos.length} competência(s) de 13º SALÁRIO (mês 13) — convenção aceita, não é defeito:`);
  console.table(décimos);
}
if (conhecidos.length) {
  console.log(`ℹ️  ${conhecidos.length} caso(s) APURADOS que não são folha mensal:`);
  console.table(conhecidos);
}
if (!achados.length) console.log("✔ nenhuma competência fora do padrão");
else { console.log(`🚨 ${achados.length} achado(s):`); console.table(achados); }
await db.end();
