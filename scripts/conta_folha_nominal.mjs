// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// conta_folha_nominal.mjs — a contagem nacional pela régua CERTA: município só conta quando tem linha com NOME.
//
// 🚨 A união simples das `folha_servidores_*` conta 38 municípios a mais: há portais que publicam a folha
// ANONIMIZADA (cargo, vínculo, lotação e valores, sem o servidor) — [[pnigp-scpi-sgpcloud-publica-sem-nome]].
// Folha sem nome é dado útil, mas não é folha NOMINAL, que é o que foi pedido.
//
// Uso: node scripts/conta_folha_nominal.mjs [UF]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.argv[2] || null;

const tabs = [];
for (const r of (await q(`select table_name t from information_schema.tables
  where table_schema='public' and table_name like 'folha_servidores_%' order by 1`)).rows) {
  const c = (await q(`select column_name x from information_schema.columns where table_name=$1`, [r.t])).rows.map((x) => x.x);
  if (c.includes("cod_ibge")) tabs.push({ t: r.t, nome: c.includes("nome") });
}
const uni = (comNome) => tabs
  .filter((x) => !comNome || x.nome)
  .map((x) => `select distinct left(cod_ibge::text,6) i from ${x.t} where cod_ibge is not null` +
    (comNome ? ` and nome is not null and btrim(nome) <> ''` : ""))
  .join(" union ");

const filtro = UF ? `and m.uf = '${UF}'` : "";
const linha = async (rot, sql) => {
  const r = (await q(`select count(*) n from municipios_br m where left(m.cod_ibge,6) in (${sql}) ${filtro}`)).rows[0].n;
  console.log(`  ${rot.padEnd(34)} ${String(r).padStart(5)}`);
  return +r;
};
const total = (await q(`select count(*) n from municipios_br m where true ${filtro}`)).rows[0].n;
console.log(`\n═══ FOLHA MUNICIPAL${UF ? " — " + UF : " — BRASIL"} · ${total} municípios · ${tabs.length} fontes ═══`);
const comQualquer = await linha("com QUALQUER linha", uni(false));
const comNome = await linha("com linha NOMINAL (com nome)", uni(true));
console.log(`  ${"só anonimizada (não conta)".padEnd(34)} ${String(comQualquer - comNome).padStart(5)}`);
console.log(`\n  cobertura NOMINAL: ${(100 * comNome / total).toFixed(1)}%`);
await db.end();
