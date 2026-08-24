// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// normaliza_competencia_folha.mjs — põe TODA competência de folha no padrão `AAAAMM`.
//
// ⭐ Necessário depois que o `verifica_competencia_folha.mjs` mostrou 117 divergências em 15 tabelas. A pior era o
// Betha, que gravava o MESMO mês em dois formatos (`07-2026` pelo payload do portal, `2026-07` pelo fallback) —
// municípios coletados pelos dois caminhos apareciam com a folha somada.
//
// 🚨 Isto é UPDATE em dado de produção. Por isso:
//   • só converte o que é conversível SEM ambiguidade (`AAAA-MM`, `MM-AAAA`, `AAAA/MM`, `MM/AAAA`, nome do mês+ano);
//   • NÃO toca em mês 00/13 nem em texto sem ano — esses vão para relatório, porque podem ser 13º ou anual e
//     "consertar" às cegas inventaria dado ([[feedback-nunca-apagar-por-wildcard]]);
//   • roda em SECO por padrão. `APLICAR=1` para gravar.
//
// Uso: node scripts/normaliza_competencia_folha.mjs        (simulação)
//      APLICAR=1 node scripts/normaliza_competencia_folha.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";

const MES = { janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6, julho: 7,
              agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

// devolve AAAAMM, ou null quando não dá para converter com segurança
function compNorm(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})(\d{2})$/))) return +m[2] >= 1 && +m[2] <= 12 ? s : null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})$/))) return +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}${String(m[2]).padStart(2, "0")}` : null;
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) return +m[1] >= 1 && +m[1] <= 12 ? `${m[2]}${String(m[1]).padStart(2, "0")}` : null;
  // ⭐ CERH grava `05FN-2026` — mês + tipo de folha ("FN" = Folha Normal) + ano. O tipo não cabe na competência;
  // ele já está (ou deve estar) na coluna própria de tipo de folha.
  if ((m = s.match(/^(\d{1,2})(FN|FC|F\d{1,2}|N)[-/](\d{4})$/i))) {
    return +m[1] >= 1 && +m[1] <= 12 ? `${m[3]}${String(m[1]).padStart(2, "0")}` : null;
  }
  // "julho/2026", "julho de 2026"
  if ((m = s.toLowerCase().match(/^([a-zçã]+)\s*(?:de\s*)?[-/]?\s*(\d{4})$/))) {
    const n = MES[m[1]];
    return n ? `${m[2]}${String(n).padStart(2, "0")}` : null;
  }
  return null;
}

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%' order by 1`)).rows.map((r) => r.t);

const plano = [], intocados = [];
for (const t of tabs) {
  const cols = (await q(`select column_name n from information_schema.columns where table_name=$1`, [t])).rows.map((r) => r.n);
  if (!cols.includes("competencia")) continue;
  const comps = (await q(`select competencia c, count(*)::int n from ${t}
    where competencia is not null group by 1`)).rows;
  for (const { c, n } of comps) {
    if (/^\d{6}$/.test(c) && +c.slice(4) >= 1 && +c.slice(4) <= 12) continue;  // já está bom
    const novo = compNorm(c);
    if (novo) plano.push({ tabela: t, de: c, para: novo, linhas: n });
    else intocados.push({ tabela: t, competencia: c, linhas: n });
  }
}

console.log(`${plano.length} conversões possíveis · ${intocados.length} casos que NÃO serão tocados\n`);
if (plano.length) {
  console.log("--- a converter (agrupado por tabela):");
  const porTab = {};
  for (const p of plano) (porTab[p.tabela] ??= []).push(`${p.de}→${p.para} (${p.linhas})`);
  for (const [t, v] of Object.entries(porTab)) console.log(`  ${t}: ${v.slice(0, 6).join(", ")}${v.length > 6 ? ` … +${v.length - 6}` : ""}`);
}
if (intocados.length) {
  console.log("\n--- NÃO convertidos (exigem decisão humana: 13º? anual? rótulo perdido?):");
  console.table(intocados.slice(0, 25));
}

// ⚠️ a conversão pode FUNDIR duas competências numa só (07-2026 e 2026-07 → 202607). Isso é o objetivo, mas a
// fusão revela quantas linhas eram duplicata lógica do mesmo mês — vale medir antes de aplicar.
console.log("\n--- fusões que a conversão vai provocar (mesmo destino, origens diferentes):");
const destinos = {};
for (const p of plano) (destinos[`${p.tabela}|${p.para}`] ??= []).push(p);
const fusoes = Object.entries(destinos).filter(([, v]) => v.length > 1);
if (!fusoes.length) console.log("  (nenhuma)");
for (const [k, v] of fusoes.slice(0, 20)) {
  console.log(`  ${k.split("|")[0]} → ${k.split("|")[1]}: ${v.map((x) => `${x.de}(${x.linhas})`).join(" + ")}`);
}

if (!APLICAR) { console.log("\n(SIMULAÇÃO — rode com APLICAR=1 para gravar)"); await db.end(); process.exit(0); }

let total = 0;
for (const p of plano) {
  const r = await q(`update ${p.tabela} set competencia=$1 where competencia=$2`, [p.para, p.de]);
  total += r.rowCount;
  console.log(`  ✔ ${p.tabela}: ${p.de} → ${p.para} (${r.rowCount} linhas)`);
}
console.log(`\n[normaliza] ${total.toLocaleString("pt-BR")} linhas normalizadas`);
await db.end();
