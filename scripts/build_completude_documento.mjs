// ANÁLISE — COMPLETUDE LEGAL DOS DOCUMENTOS (lente do auditor). Para cada ETP/TR/PB, checa no TEXTO extraído se as
// seções que a Lei 14.133 exige estão presentes → score + o que falta. Heurística de frase-chave por inciso/alínea
// (calibrada em amostra real): sinaliza documento-casca e processo incompleto. Deriva de arquivo_texto_sc.
//   node scripts/build_completude_documento.mjs
// Régua: ETP = art.18 §1º (obrig* por §2º: I,IV,VI,VIII,XIII) · TR = art.6º XXIII · PB usa a régua do TR.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 600000 });

// [rótulo, padrão regex (~*), obrigatório?]
const ETP = [
  ["I necessidade", "descriç(ão|ao) da necessidade|necessidade da contrata", true],
  ["II PCA", "plano de contrataç|\\yPCA\\y|plano anual", false],
  ["III requisitos", "requisitos da contrata", false],
  ["IV estimativa-qtd", "estimativ.{0,15}quantidad|memória de c[áa]lculo|quantitativ", true],
  ["V levantamento-mercado", "levantamento de mercado|pesquisa de mercado|an[áa]lise de mercado", false],
  ["VI estimativa-valor", "valor estimad|estimativa.{0,20}valor|estimativa de pre[çc]", true],
  ["VII solução-todo", "soluç(ão|ao) como um todo", false],
  ["VIII parcelamento", "parcelamento", true],
  ["IX resultados", "resultados pretendidos", false],
  ["X providências", "provid[êe]ncias", false],
  ["XI correlatas", "correlat|interdependen", false],
  ["XII impacto-ambiental", "impact.{0,12}ambient", false],
  ["XIII conclusivo", "posicionamento conclusiv|declaraç(ão|ao).{0,20}viab", true],
];
const TR = [
  ["a objeto", "defini(ç|c)(ão|ao) do objeto", true],
  ["b fundamentação", "fundamenta(ç|c)(ão|ao) da contrata|estudos? t[ée]cnicos? preliminar", true],
  ["c solução-todo", "soluç(ão|ao) como um todo|descriç(ão|ao) da soluç", true],
  ["d requisitos", "requisitos da contrata", true],
  ["e modelo-execução", "modelo de execuç", true],
  ["f modelo-gestão", "modelo de gest", true],
  ["g medição-pagamento", "crit[ée]rios? de mediç|mediç(ão|ao) e.{0,6}pagamento|crit[ée]rios? de pagamento", true],
  ["h seleção-fornecedor", "sele(ç|c)(ão|ao) do fornecedor|crit[ée]rio de julgamento", true],
  ["i estimativa-valor", "valor estimad|estimativa.{0,20}valor", true],
  ["j adequação-orçamentária", "adequaç(ão|ao) orçament|dotaç(ão|ao) orçament|dispon.{0,12}orçament", true],
];
const RUBRICA = {
  "Estudo Técnico Preliminar": { base: "ETP art.18 §1º", secoes: ETP },
  "Termo de Referência": { base: "TR art.6º XXIII", secoes: TR },
  "Projeto Básico": { base: "PB (régua TR)", secoes: TR },
};

const bool = (p) => `(texto ~* '${p}')`;
const somaInt = (secoes) => secoes.map(([, p]) => `(${bool(p)})::int`).join(" + ");
const faltArr = (secoes) => `array_remove(ARRAY[${secoes.map(([r, p]) => `CASE WHEN ${bool(p)} THEN NULL ELSE '${r}' END`).join(", ")}], NULL)`;

async function main() {
  await db.query(`CREATE SCHEMA IF NOT EXISTS app`);
  await db.query(`DROP TABLE IF EXISTS app.documento_completude_sc`);
  await db.query(`CREATE TABLE app.documento_completude_sc (
    numero_controle text, sequencial_documento int, cod_ibge text, tipo_documento text, base text, chars int,
    n_total int, n_ok int, score int, faltantes text[],
    n_obrig int, n_obrig_ok int, faltantes_obrig text[])`);

  for (const [tipo, { base, secoes }] of Object.entries(RUBRICA)) {
    const obrig = secoes.filter((s) => s[2]);
    console.log(`analisando ${tipo} (${secoes.length} seções, ${obrig.length} obrigatórias)…`);
    await db.query(`
      INSERT INTO app.documento_completude_sc
      SELECT numero_controle, sequencial_documento, cod_ibge, tipo_documento, '${base}', chars,
        ${secoes.length}, (${somaInt(secoes)}), round(100.0*(${somaInt(secoes)})/${secoes.length})::int, ${faltArr(secoes)},
        ${obrig.length}, (${somaInt(obrig)}), ${faltArr(obrig)}
      FROM arquivo_texto_sc WHERE tipo_documento = '${tipo}' AND chars > 500`);
  }
  await db.query(`CREATE INDEX ix_compl_cod ON app.documento_completude_sc (cod_ibge)`);
  await db.query(`CREATE INDEX ix_compl_nc ON app.documento_completude_sc (numero_controle)`);

  // ── retrato ──
  console.log("\n═══ COMPLETUDE POR TIPO ═══");
  for (const r of (await db.query(`SELECT base, count(*) n, round(avg(score)) score_medio,
      count(*) FILTER (WHERE n_obrig_ok = n_obrig) obrig_ok, round(avg(chars)) chars
    FROM app.documento_completude_sc GROUP BY base ORDER BY 1`)).rows)
    console.log(`  ${r.base.padEnd(18)} ${Number(r.n).toLocaleString().padStart(7)} docs · score médio ${r.score_medio}% · ${((100*r.obrig_ok/r.n)).toFixed(0)}% com TODAS as obrigatórias`);

  console.log("\n═══ SEÇÕES MAIS AUSENTES (todas as réguas) ═══");
  for (const r of (await db.query(`SELECT f, count(*) n FROM app.documento_completude_sc, unnest(faltantes) f GROUP BY 1 ORDER BY 2 DESC LIMIT 10`)).rows)
    console.log(`  ${String(r.f).padEnd(26)} ausente em ${Number(r.n).toLocaleString()} docs`);

  console.log("\n═══ FAIXAS DE COMPLETUDE ═══");
  for (const r of (await db.query(`SELECT case when score>=90 then '90-100% (completo)' when score>=70 then '70-89%' when score>=50 then '50-69%' else '<50% (casca)' end faixa, count(*) n
    FROM app.documento_completude_sc GROUP BY 1 ORDER BY min(score) DESC`)).rows)
    console.log(`  ${r.faixa.padEnd(20)} ${Number(r.n).toLocaleString()} docs`);

  const casca = (await db.query(`SELECT count(*) n FROM app.documento_completude_sc WHERE n_obrig_ok < n_obrig`)).rows[0].n;
  const tot = (await db.query(`SELECT count(*) n FROM app.documento_completude_sc`)).rows[0].n;
  console.log(`\n⚠ ${Number(casca).toLocaleString()} de ${Number(tot).toLocaleString()} documentos com ALGUMA seção OBRIGATÓRIA ausente (foco do controle interno)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
