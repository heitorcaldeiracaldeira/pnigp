// Auditoria de COMPLETUDE e INTEGRIDADE dos dados de SC (leitura pura, não altera nada).
// Cobertura por dataset/ano + anomalias que ameaçam a fidelidade. node scripts/auditoria_dados_sc.mjs
import fs from "fs"; import pg from "pg";
const db = new pg.Pool({ connectionString: fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim(), ssl: { rejectUnauthorized: false }, max: 3, query_timeout: 60000 });
const rows = (s, p) => db.query(s, p).then((r) => r.rows).catch((e) => [{ ERRO: String(e).slice(0, 60) }]);
const one = async (s, p) => (await rows(s, p))[0] || {};
const TOTAL = 296;

console.log("══════════ AUDITORIA DE DADOS — SC ══════════\n");

console.log("1) COBERTURA POR DATASET (entes distintos / 296)");
const cov = [
  ["financas_sc", "financas_sc"],
  ["metas_fiscais_sc", "metas_fiscais_sc"],
  ["compras_sc", "compras_sc"],
  ["contratos_sc", "contratos_sc"],
  ["transferencias_sc", "transferencias_sc"],
  ["pca_sc", "pca_sc"],
  ["indicadores_sc", "indicadores_sc"],
];
for (const [label, t] of cov) {
  const r = await one(`SELECT count(DISTINCT cod_ibge) e FROM ${t}`);
  const pct = r.e != null ? Math.round((Number(r.e) / TOTAL) * 100) : "?";
  console.log(`   ${label.padEnd(20)} ${String(r.e ?? r.ERRO).padStart(4)} / ${TOTAL}  (${pct}%)`);
}

console.log("\n2) COBERTURA TEMPORAL (entes por ano)");
for (const [label, t, col] of [["financas", "financas_sc", "ano"], ["metas", "metas_fiscais_sc", "ano"], ["compras", "compras_sc", "ano"], ["contratos", "contratos_sc", "ano_compra"], ["indicadores", "indicadores_sc", "ano"]]) {
  const r = await rows(`SELECT ${col} ano, count(DISTINCT cod_ibge) e FROM ${t} GROUP BY ${col} ORDER BY ${col}`);
  console.log(`   ${label.padEnd(12)} ${r.map((x) => `${x.ano}:${x.e}`).join("  ")}`);
}

console.log("\n3) CHAVES PARA O ICE");
const semPop = await one(`SELECT count(*) n FROM entes_sc WHERE populacao IS NULL OR populacao=0`);
console.log(`   entes sem população (quebra peer-group do ICE): ${semPop.n}`);
const indCob = await rows(`SELECT codigo, count(DISTINCT cod_ibge) e FROM indicadores_sc GROUP BY codigo ORDER BY codigo`);
console.log(`   indicadores por código:`);
indCob.forEach((x) => console.log(`     ${String(x.codigo).padEnd(28)} ${x.e}/${TOTAL}`));

console.log("\n4) ENTES ÓRFÃOS (em entes_sc mas sem dado fiscal)");
const orf = await rows(`SELECT e.cod_ibge, e.nome FROM entes_sc e LEFT JOIN financas_sc f ON f.cod_ibge=e.cod_ibge WHERE f.cod_ibge IS NULL`);
console.log(`   sem nenhuma linha em financas_sc: ${orf.length}${orf.length ? " → " + orf.slice(0, 10).map((x) => x.nome || x.cod_ibge).join(", ") + (orf.length > 10 ? "…" : "") : ""}`);

console.log("\n5) ANOMALIAS — FINANÇAS (valores impossíveis/suspeitos)");
const fa = await one(`SELECT
   count(*) FILTER (WHERE receita<=0) receita_zero,
   count(*) FILTER (WHERE despesa<=0) despesa_zero,
   count(*) FILTER (WHERE pessoal>receita AND receita>0) pessoal_gt_receita,
   count(*) FILTER (WHERE investimento<0) investimento_neg,
   count(*) FILTER (WHERE divida<0) divida_neg,
   count(*) FILTER (WHERE tributaria>receita AND receita>0) trib_gt_receita
   FROM financas_sc`);
console.log("   " + JSON.stringify(fa));

console.log("\n6) ANOMALIAS — COMPRAS (percentuais fora de faixa)");
const ca = await one(`SELECT
   count(*) FILTER (WHERE economia_pct<0) economia_neg,
   count(*) FILTER (WHERE economia_pct>100) economia_gt100,
   count(*) FILTER (WHERE dispensa_pct<0 OR dispensa_pct>100) dispensa_fora,
   count(*) FILTER (WHERE valor_homologado<0) valor_neg,
   count(*) FILTER (WHERE n_contratos=0 AND valor_homologado>0) zero_contr_com_valor
   FROM compras_sc`);
console.log("   " + JSON.stringify(ca));

console.log("\n7) ANOMALIAS — METAS / CONTRATOS / TRANSFERÊNCIAS");
const ma = await one(`SELECT count(*) FILTER (WHERE meta_primario IS NULL AND resultado_primario IS NULL) ambos_null, count(*) total FROM metas_fiscais_sc`);
console.log(`   metas sem meta nem resultado: ${ma.ambos_null}/${ma.total}`);
const cta = await one(`SELECT count(*) FILTER (WHERE valor_global<0) valor_neg, count(*) FILTER (WHERE cnpj_compra IS NULL) sem_link FROM contratos_sc`);
console.log(`   contratos valor<0: ${cta.valor_neg} | sem link p/ processo: ${cta.sem_link}`);
const ta = await one(`SELECT count(*) FILTER (WHERE valor_total<0) valor_neg FROM transferencias_sc`);
console.log(`   transferências valor<0: ${ta.valor_neg}`);

console.log("\n══════════ FIM ══════════");
await db.end();
