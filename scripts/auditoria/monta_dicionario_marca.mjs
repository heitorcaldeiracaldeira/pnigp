// DICIONÁRIO DE MARCAS (allowlist) — app.marca_dicionario. Uma marca é REAL se aparece em MUITOS órgãos
// (diversidade) e/ou COM MODELO — o que separa marca de fornecedor/descritor/truncada. Fontes: conferida
// (vencedores) + participantes (concorreram). Confiança: alta (≥3 órgãos ou ≥3 c/ modelo) · media (≥3 itens) · baixa.
// Só alta/media entram na allowlist das análises. Set-based (tabelas pequenas). node scripts/auditoria/monta_dicionario_marca.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 });
const UF = (process.env.UF || "sc").toLowerCase();
const CONF = `app.item_marca_conferida_${UF}`, PART = `app.item_marca_participante_${UF}`, DIC = `app.marca_dicionario_${UF}`;
const q = (s) => db.query(s);

await q(`CREATE TABLE IF NOT EXISTS ${DIC}(marca text PRIMARY KEY, n_itens int, n_orgaos int, n_com_modelo int, n_venceu int, confianca text, atualizado timestamptz DEFAULT now())`);
const t = Date.now();
await q(`
  BEGIN;
  TRUNCATE ${DIC};
  INSERT INTO ${DIC}(marca,n_itens,n_orgaos,n_com_modelo,n_venceu,confianca)
  SELECT s.m, sum(s.n)::int, count(*)::int, sum(s.cm)::int, sum(s.vn)::int,
    CASE WHEN length(s.m)<=3 AND sum(s.cm)=0 THEN 'baixa'   -- curta SEM modelo = suspeita de truncada (PR/PRO) → fora
         WHEN count(*)>=3 OR sum(s.cm)>=3 THEN 'alta'
         WHEN sum(s.n)>=3 THEN 'media' ELSE 'baixa' END
  FROM (
    SELECT m, cnpj, sum(n) n, sum(cm) cm, sum(vn) vn FROM (
      SELECT marca_norm m, cnpj, count(*) n, count(modelo_norm) cm, count(*) vn
        FROM ${CONF} WHERE marca_norm IS NOT NULL AND NOT coalesce(marca_suspeita,false) GROUP BY 1,2
      UNION ALL
      SELECT upper(btrim(marca_norm)) m, cnpj, count(*) n, count(nullif(btrim(modelo),'')) cm, count(*) FILTER (WHERE vencedor) vn
        FROM ${PART} WHERE marca_norm IS NOT NULL AND length(btrim(marca_norm))>=2 GROUP BY 1,2
    ) u GROUP BY m, cnpj
  ) s
  WHERE length(s.m)>=2
  GROUP BY s.m;
  COMMIT;`);

const tot = (await q(`SELECT confianca, count(*) n FROM ${DIC} GROUP BY 1 ORDER BY 1`)).rows;
const all = (await q(`SELECT count(*) n FROM ${DIC} WHERE confianca IN ('alta','media')`)).rows[0].n;
console.log(`dicionário montado em ${((Date.now() - t) / 1000).toFixed(1)}s`);
console.log(`allowlist (alta+media): ${all} marcas`);
console.table(tot);
console.log("\nTOP marcas do dicionário (alta confiança):");
console.table((await q(`SELECT marca, n_itens, n_orgaos, n_com_modelo FROM ${DIC} WHERE confianca='alta' ORDER BY n_orgaos DESC, n_itens DESC LIMIT 15`)).rows);
await db.end();
