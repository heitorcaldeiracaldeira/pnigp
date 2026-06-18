// Validação de consistência/integridade dos dados oficiais (SC) após os ETLs.
// Cobertura por base, duplicatas (vazamento de CNPJ compartilhado), conexões, e amostra planejado × contratado.
// node scripts/validar_consistencia.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const mi = (n) => "R$ " + (Number(n || 0) / 1e6).toFixed(1) + "mi";
const ok = (b) => (b ? "✓" : "✗ ATENÇÃO");

async function main() {
  console.log("===== VALIDAÇÃO DE CONSISTÊNCIA — dados oficiais SC =====\n");

  // 1) Cobertura por base
  const cov = (await db.query(`SELECT
      (SELECT count(*) FROM entes_sc WHERE tipo='M') munis,
      (SELECT count(DISTINCT cod_ibge) FROM financas_sc) fin,
      (SELECT count(DISTINCT cod_ibge) FROM compras_sc) comp,
      (SELECT count(DISTINCT cod_ibge) FROM contratos_sc) ctr,
      (SELECT count(*) FROM contratos_sc_feitos) ctr_proc,
      (SELECT count(DISTINCT cod_ibge) FROM pca_sc) pca,
      (SELECT count(*) FROM pca_sc_feitos) pca_proc,
      (SELECT count(DISTINCT cod_ibge) FROM transferencias_sc) tr`)).rows[0];
  console.log("1) COBERTURA (de " + cov.munis + " municípios)");
  console.log(`   Finanças: ${cov.fin} | Compras: ${cov.comp} | Contratos: ${cov.ctr} (proc ${cov.ctr_proc}/295) | PCA: ${cov.pca} (proc ${cov.pca_proc}/295) | Transferências: ${cov.tr}\n`);

  // 2) Duplicatas exatas no PCA (vazamento de CNPJ compartilhado)
  const dup = (await db.query(`SELECT n_itens, valor_total, count(*) c FROM pca_sc GROUP BY n_itens, valor_total HAVING count(*)>1 ORDER BY c DESC LIMIT 5`)).rows;
  console.log("2) PCA — duplicatas exatas entre municípios: " + ok(dup.length === 0));
  dup.forEach((d) => console.log(`   ! ${d.c}x mesmo (n=${d.n_itens}, ${mi(d.valor_total)})`));
  console.log();

  // 3) CNPJs compartilhados (atas/consórcios)
  const sh = (await db.query(`SELECT count(*) n FROM (SELECT cnpj_compra FROM contratos_sc WHERE cnpj_compra IS NOT NULL GROUP BY cnpj_compra HAVING count(DISTINCT cod_ibge)>1) t`)).rows[0].n;
  console.log("3) CNPJs compartilhados detectados (atas/consórcios, excluídos do PCA): " + sh + "\n");

  // 4) Conexão contrato → processo
  const lk = (await db.query(`SELECT count(*) t, count(*) FILTER (WHERE cnpj_compra IS NOT NULL AND seq_compra IS NOT NULL) com FROM contratos_sc`)).rows[0];
  const pct = lk.t > 0 ? ((Number(lk.com) / Number(lk.t)) * 100).toFixed(1) : "0";
  console.log("4) Conexão contrato→processo: " + lk.com + "/" + lk.t + " (" + pct + "%) " + ok(Number(pct) > 90) + "\n");

  // 5) Anomalias de valor
  const neg = (await db.query(`SELECT (SELECT count(*) FROM contratos_sc WHERE valor_global<0) c, (SELECT count(*) FROM pca_sc WHERE valor_total<0) p`)).rows[0];
  console.log("5) Valores negativos (contratos/PCA): " + neg.c + "/" + neg.p + " " + ok(Number(neg.c) === 0 && Number(neg.p) === 0) + "\n");

  // 6) Amostra: planejado (PCA) × contratado (contratos) × homologado (compras) — top 6 por PCA
  console.log("6) AMOSTRA — planejado × contratado × homologado");
  const amostra = (await db.query(`
    SELECT e.nome, p.cod_ibge, p.valor_total planejado,
           (SELECT COALESCE(sum(valor_global),0) FROM contratos_sc c WHERE c.cod_ibge=p.cod_ibge) contratado
      FROM pca_sc p JOIN entes_sc e ON e.cod_ibge=p.cod_ibge
     ORDER BY p.valor_total DESC LIMIT 6`)).rows;
  amostra.forEach((r) => {
    const ratio = Number(r.planejado) > 0 ? ((Number(r.contratado) / Number(r.planejado)) * 100).toFixed(0) + "%" : "—";
    console.log(`   ${r.nome}: planejado ${mi(r.planejado)} | contratado ${mi(r.contratado)} | execução ${ratio}`);
  });

  console.log("\n===== FIM =====");
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
