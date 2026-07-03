// PROVA REAL — o motor federal (getCaptacaoEmendasSC) não "esquece" dado?
// Concilia a BASE (emendas_execucao_sc / emendas_indicacao_sc) com o que o MOTOR projeta,
// linha a linha e valor a valor, e denuncia todo drop silencioso (filtros, colunas não exibidas).
// node scripts/prova_real_emendas_fed.mjs           (município com mais dados)
// COD=4205407 node scripts/prova_real_emendas_fed.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2 }); db.on("error", () => {});
const brl = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const ok = (b) => (b ? "✓" : "✗ DIVERGE");

let COD = process.env.COD;
if (!COD) COD = (await db.query("SELECT cod_ibge FROM emendas_execucao_sc GROUP BY 1 ORDER BY count(*) DESC LIMIT 1")).rows[0].cod_ibge;
const nome = (await db.query("SELECT nome FROM entes_sc WHERE cod_ibge=$1", [COD])).rows[0]?.nome || COD;
console.log(`\n=== PROVA REAL · Emendas Federais · ${nome} (${COD}) ===\n`);

// ---------- EXECUÇÃO ----------
// BASE = todas as linhas, sem nenhum filtro
const base = (await db.query(`SELECT count(*) n, coalesce(sum(empenhado),0) emp, coalesce(sum(pago),0) pago,
  coalesce(sum(greatest(empenhado-pago,0)),0) namesa, coalesce(sum(resto_inscrito),0) ri, coalesce(sum(resto_pago),0) rp,
  count(*) FILTER (WHERE coalesce(autor,'')='') sem_autor FROM emendas_execucao_sc WHERE cod_ibge=$1`, [COD])).rows[0];
// MOTOR = replica exatamente o que getCaptacaoEmendasSC faz (jaRecebido = sum(pago) sobre autor<>''; recursoNaMesa idem)
const motor = (await db.query(`SELECT coalesce(sum(pago),0) pago, coalesce(sum(greatest(empenhado-pago,0)),0) namesa
  FROM emendas_execucao_sc WHERE cod_ibge=$1 AND coalesce(autor,'')<>''`, [COD])).rows[0];

console.log("EXECUÇÃO — base (tudo) × motor (o que exibe)");
console.log(`  linhas na base: ${base.n}  (com autor vazio: ${base.sem_autor})`);
console.log(`  já recebido (pago):   base ${brl(base.pago)}  ×  motor ${brl(motor.pago)}   ${ok(base.pago === motor.pago)}`);
console.log(`  recurso na mesa:      base ${brl(base.namesa)}  ×  motor ${brl(motor.namesa)}   ${ok(base.namesa === motor.namesa)}`);
if (base.sem_autor > 0) console.log(`  ⚠️ ${base.sem_autor} linha(s) com AUTOR VAZIO são descartadas pelo filtro autor<>'' → pago/na-mesa dessas some do total exibido.`);
console.log(`  colunas na base NÃO exibidas: função, subfunção, localidade, liquidado, resto_inscrito (${brl(base.ri)}), resto_pago (${brl(base.rp)})`);

// ---------- INDICAÇÃO ----------
const bi = (await db.query(`SELECT count(*) n, coalesce(sum(valor_emenda),0) ve, coalesce(sum(desembolsado),0) desemb, coalesce(sum(empenhado),0) emp,
  count(*) FILTER (WHERE impositivo) impos, count(*) FILTER (WHERE coalesce(situacao,'')='') sem_sit,
  count(*) FILTER (WHERE ano IS NULL) sem_ano FROM emendas_indicacao_sc WHERE cod_ibge=$1`, [COD])).rows[0];
console.log(`\nINDICAÇÃO — base × motor`);
console.log(`  linhas na base: ${bi.n} · total indicado ${brl(bi.ve)} · empenhado ${brl(bi.emp)} · desembolsado ${brl(bi.desemb)} · impositivas ${bi.impos}`);
console.log(`  ⛔ BUG DO MOTOR: a query da indicação (queries.ts) faz sum(pago), mas a coluna é 'desembolsado' → a query QUEBRA e o .catch zera tudo → o motor exibe indicado=0, impositivas=0 SEMPRE.`);
console.log(`  colunas por-emenda NÃO exibidas: programa, situação, nr_emenda, vl_global, vl_repasse, empenhado, desembolsado`);
if (bi.sem_sit === bi.n && bi.n > 0) console.log(`  ⚠️ situação vazia em ${bi.sem_sit}/${bi.n} · ano nulo em ${bi.sem_ano}/${bi.n} — base incompleta na origem.`);

// ---------- COBERTURA GERAL (SC) ----------
const cov = (await db.query(`SELECT
  (SELECT count(distinct cod_ibge) FROM emendas_execucao_sc) ex,
  (SELECT count(distinct cod_ibge) FROM emendas_indicacao_sc) ind,
  (SELECT count(*) FROM entes_sc WHERE tipo='M') tot`)).rows[0];
console.log(`\nCOBERTURA SC: execução em ${cov.ex}/${cov.tot} municípios · indicação em ${cov.ind}/${cov.tot}`);
console.log(`\nVEREDITO: os agregados que o motor exibe ${base.pago === motor.pago && base.namesa === motor.namesa ? "batem com a base (nada perdido na agregação)" : "DIVERGEM da base"}` +
  (base.sem_autor > 0 ? ", EXCETO as linhas de autor vazio (drop silencioso a corrigir)." : ".") +
  " Dimensões coletadas e não exibidas: função/subfunção (execução) e todo o detalhe por-emenda (indicação).");
await db.end();
