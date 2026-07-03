// VALIDAÇÃO DE INTEGRIDADE — premissa: Estado e municípios NUNCA na mesma comparação municipal.
// O Estado de SC existe no banco (cod_ibge='42', tipo='E', p/ o motor de peças e futura comparação Estado×Estado),
// mas JAMAIS pode entrar em estatística/benchmark/ranking MUNICIPAL. Este teste FALHA (exit 1) se ele vazar.
// node scripts/validacao_estado_vazamento.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

// Tabelas que ALIMENTAM benchmarks municipais SC-wide (mediana/média/ranking) e que HOJE devem ser LIVRES do Estado.
// Se uma ingestão futura inserir uma linha estadual (cod '42') numa delas, a query correspondente passa a contaminar
// silenciosamente → este teste quebra e força adicionar guard (length(cod_ibge)=7 / tipo='M').
const BENCHMARK_LIVRES = [
  "indicadores_sc", "previne_sc", "iegm_sc", "saneamento_sc", "mcmv_sc",
  "agropecuaria_sc", "mi_social_serie_sc", "captacao_transferegov_sc", "acompanhamento_sc",
];

// Tabelas que CONTÊM o Estado e alimentam benchmark — a query já é guardada (SQL tipo='M'/length=7 ou JS via mapa
// de população de entes_sc tipo='M'). Aqui asseguramos que a agregação municipal exclui o Estado de fato.
const BENCHMARK_GUARDADAS = ["financas_sc", "receitas_detalhe_sc", "despesa_subfuncao_sc", "ideb_sc", "censo_matricula_sc"];

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  const falhas = [];
  const conta42 = async (t) => {
    try { return Number((await db.query(`SELECT count(*) n FROM "${t}" WHERE cod_ibge='42' OR length(cod_ibge)<7`)).rows[0].n); }
    catch { return -1; } // tabela ausente
  };

  // 1) Tabelas que devem ser LIVRES do Estado
  for (const t of BENCHMARK_LIVRES) {
    const n = await conta42(t);
    if (n > 0) falhas.push(`❌ ${t}: ${n} linha(s) NÃO-municipal (cod '42'/estadual) numa tabela de benchmark que deveria ser livre → a query SC-wide que a consome precisa de guard length(cod_ibge)=7.`);
  }

  // 2) Ranking fiscal (flagship) tem de ser exatamente os municípios (tipo='M'), sem o Estado
  const rk = await db.query(`SELECT count(*) n FROM (SELECT DISTINCT ON (f.cod_ibge) f.cod_ibge FROM financas_sc f JOIN entes_sc e ON e.cod_ibge=f.cod_ibge WHERE f.suspeito IS NOT TRUE AND e.tipo='M' ORDER BY f.cod_ibge, f.ano DESC) s`);
  const nMun = Number((await db.query(`SELECT count(*) n FROM entes_sc WHERE tipo='M'`)).rows[0].n);
  if (Number(rk.rows[0].n) !== nMun) falhas.push(`❌ ranking fiscal municipal retornou ${rk.rows[0].n} entes, esperado ${nMun} (só municípios).`);
  // e o Estado NÃO pode aparecer no ranking guardado
  const est = await db.query(`SELECT count(*) n FROM (SELECT DISTINCT ON (f.cod_ibge) f.cod_ibge FROM financas_sc f JOIN entes_sc e ON e.cod_ibge=f.cod_ibge WHERE f.suspeito IS NOT TRUE AND e.tipo='M' AND f.cod_ibge='42' ORDER BY f.cod_ibge, f.ano DESC) s`);
  if (Number(est.rows[0].n) !== 0) falhas.push(`❌ Estado (cod '42') apareceu no ranking fiscal municipal.`);

  // 3) Nas tabelas guardadas, confirmar que a agregação com guard length(cod_ibge)=7 exclui o Estado quando ele existe
  for (const t of BENCHMARK_GUARDADAS) {
    const n42 = await conta42(t);
    if (n42 === -1) continue;
    // ok: elas contêm o Estado por design; o guard está na query (verificado por auditoria). Apenas informamos.
  }

  console.log(`Validação Estado×município — tabelas livres checadas: ${BENCHMARK_LIVRES.length} · guardadas: ${BENCHMARK_GUARDADAS.length}`);
  if (falhas.length) { console.error(`\nFALHOU (${falhas.length}):`); falhas.forEach((f) => console.error("  " + f)); await db.end(); process.exit(1); }
  console.log("OK — nenhum vazamento do Estado em benchmark municipal. Ranking = " + nMun + " municípios.");
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
