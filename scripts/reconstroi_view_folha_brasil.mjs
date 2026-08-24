// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// reconstroi_view_folha_brasil.mjs — faz `vw_folha_municipal_brasil` enxergar TODA tabela `folha_servidores_*`.
//
// 🚨 O defeito que este script existe para corrigir já aconteceu duas vezes. Em 18/ago/2026 a view unia **65 de
// 95** fontes: 30 tabelas, **730 municípios e 5,5 milhões de linhas**, estavam coletadas e invisíveis no produto
// ([[pnigp-view-folha-nao-enxerga-coletores]]). Coletar sem ligar à view é trabalho que não chega ao usuário.
//
// Como funciona: PRESERVA a definição atual (as fontes já ligadas ficam intactas) e ANEXA um bloco por tabela
// ausente, mapeando as colunas para o contrato da view. Rodar de novo é seguro — recalcula o que falta.
//
// 🚨 GUARDAS POR FONTE (sem elas a view mente, e mente para MAIS):
//   • `sc`  — a base do TCE-SC traz os três poderes e consórcios juntos. Sem `poder='Executivo'` e
//             `tipo_ente='municipio'`, entram 141.355 linhas do LEGISLATIVO e 41.453 de consórcios somadas à
//             prefeitura ([[pnigp-entidade-espelho-infla-folha]]).
//   • `gpecloud` — a mesma pessoa aparece uma vez por tipo de cálculo. Em Coronel Murta, jul/2026: 761 em
//             `Vencimento` e 760 em `Adiantamento 13º`. Sem o filtro, o município dobra.
//   • `abo_mg` / `transphd` — idem, via `tipo_pagamento` / `tipo_folha`: fora "mensal" vêm 13º, férias e rescisão.
//   • `portalfacil` — ver nota no coletor: o rótulo do tipo varia por instalação ("Salário", "Folha do Mês",
//             "Folha Mensal"), então a guarda é por EXCLUSÃO do que comprovadamente não é mês fechado.
//
// ⚠️ `salario_bruto` é o campo do contrato, mas nem toda fonte publica bruto. A ordem de preferência é
// bruto → proventos → salário/valor → líquido, e `tipo_folha` registra QUAL campo entrou quando não é o bruto —
// quem soma massa salarial precisa saber que ali há líquido ([[pnigp-cpf-no-credor-nao-e-salario]] é o mesmo
// cuidado: um número que parece salário e não é).
//
// Uso: node scripts/reconstroi_view_folha_brasil.mjs        (mostra o que falta e o SQL)
//      APLICAR=1 node scripts/reconstroi_view_folha_brasil.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { MAPA, VALOR, GUARDAS } from "./_folha_contrato.mjs";

const db = pool();
const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";

// ── guardas: filtro extra por fonte, e o rótulo que explica por quê ────────────────────────────────────────────
// ⭐ 21/ago/2026: GUARDAS, MAPA e VALOR mudaram-se para `_folha_contrato.mjs` — a camada das CÂMARAS
//    (`fix_view_folha_camara.mjs`) mapeia as MESMAS tabelas para o MESMO contrato, e duas cópias do mapa
//    voltariam a divergir ([[pnigp-view-folha-nao-enxerga-coletores]]).

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%' order by 1`)).rows.map((r) => r.t);
const def = (await q(`select pg_get_viewdef('vw_folha_municipal_brasil'::regclass, true) v`)).rows[0].v;
const jaNaView = new Set([...def.matchAll(/folha_servidores_(\w+)/g)].map((x) => x[1]));

const blocos = [], relatorio = [];
for (const t of tabs) {
  const fonte = t.replace("folha_servidores_", "");
  if (jaNaView.has(fonte)) continue;
  const cols = new Set((await q(`select column_name n from information_schema.columns where table_name=$1`, [t])).rows.map((r) => r.n));
  const n = (await q(`select count(*)::int x from ${t}`)).rows[0].x;
  if (!n) { relatorio.push({ fonte, linhas: 0, situacao: "tabela vazia — fora da view" }); continue; }
  if (!cols.has("cod_ibge")) { relatorio.push({ fonte, linhas: n, situacao: "🚨 sem cod_ibge — não entra" }); continue; }

  const pega = (lista) => lista.find((c) => cols.has(c)) ?? null;
  const cval = pega(VALOR);
  if (!cval) { relatorio.push({ fonte, linhas: n, situacao: "🚨 nenhuma coluna de valor — não entra" }); continue; }

  // competência: quase toda fonte usa `competencia`; o TCE-SC usa `anomes`
  const ccomp = cols.has("competencia") ? "competencia" : (cols.has("anomes") ? "anomes" : null);
  if (!ccomp) { relatorio.push({ fonte, linhas: n, situacao: "🚨 sem competência — não entra" }); continue; }

  const g = GUARDAS[fonte];
  const campo = (alvo) => { const c = pega(MAPA[alvo]); return c ? `t.${c}` : `NULL::text`; };
  // ⚠️ quando o valor não é o bruto, `tipo_folha` diz qual campo entrou
  const rotuloValor = cval === "bruto" ? (cols.has("tipo_folha") ? "t.tipo_folha" : "NULL::text")
    : `'valor = ${cval}'::text`;
  const uf = cols.has("uf") ? `COALESCE(t.uf, uf_por_ibge(t.cod_ibge))` : `uf_por_ibge(t.cod_ibge)`;

  blocos.push(`SELECT '${fonte}'::text AS fonte,
    'folha oficial'::text AS natureza,
    ${uf} AS uf,
    folha_comp_norm(t.${ccomp}::text, t._coletado_em) AS competencia,
    t.cod_ibge, ${cols.has("municipio") ? "t.municipio" : "NULL::text AS municipio"},
    ${campo("orgao")} AS orgao, ${campo("secretaria")} AS secretaria,
    ${campo("lotacao_fonte")} AS lotacao_fonte, ${campo("cargo")} AS cargo,
    ${campo("funcao")} AS funcao, ${campo("situacao")} AS situacao, ${campo("nome")} AS nome,
    t.${cval} AS salario_bruto, ${rotuloValor} AS tipo_folha, t.${ccomp}::text AS competencia_origem
  FROM ${t} t${g ? `\n  WHERE ${g.onde}` : ""}`);

  relatorio.push({ fonte, linhas: n, valor: cval, guarda: g ? g.porque : "—" });
}

console.table(relatorio);
if (!blocos.length) { console.log("✔ a view já une todas as fontes com dado"); await db.end(); process.exit(0); }
console.log(`\n${blocos.length} fonte(s) a acrescentar`);

if (!APLICAR) { console.log("\n(dry-run — rode com APLICAR=1 para gravar)"); await db.end(); process.exit(0); }

const antes = (await q(`select count(*)::int n, count(distinct cod_ibge)::int m from vw_folha_municipal_brasil`)).rows[0];
// `_coletado_em` não existe em toda tabela — o `folha_comp_norm` aceita nulo
const sql = `create or replace view vw_folha_municipal_brasil as\n${def.trim().replace(/;$/, "")}\nUNION ALL\n${blocos.join("\nUNION ALL\n")}`;
await q(sql);
const depois = (await q(`select count(*)::int n, count(distinct cod_ibge)::int m from vw_folha_municipal_brasil`)).rows[0];
console.log(`\n✔ view recriada`);
console.log(`   antes:  ${antes.m} municípios · ${antes.n.toLocaleString("pt-BR")} linhas`);
console.log(`   depois: ${depois.m} municípios · ${depois.n.toLocaleString("pt-BR")} linhas`);
await db.end();
