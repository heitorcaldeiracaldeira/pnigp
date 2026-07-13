// CONSOLIDAÇÃO espelhando o PNCP: compra_raiox_sc → contratacoes_sc (entidade Contratação canônica do PNCP), com a
// chave canônica numero_controle (numeroControlePNCP) como coluna gerada. Absorve processos_sc, que vira uma VIEW de
// compatibilidade sobre contratacoes_sc (as 2 queries que a usam seguem funcionando sem tocar). Idempotente. Reconciliado:
// processos_sc (79.535) está 100% contido no raio-x (241k) → nada se perde. node scripts/migra_contratacoes_pncp.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 });
  db.on("error", () => {});
  const q = (s, p) => db.query(s, p);
  const existe = async (rel) => (await q(`SELECT to_regclass($1) r`, [rel])).rows[0].r != null;

  // 1) renomeia a tabela do raio-x para o nome canônico do PNCP (idempotente)
  if (await existe("public.compra_raiox_sc") && !(await existe("public.contratacoes_sc"))) {
    await q(`ALTER TABLE compra_raiox_sc RENAME TO contratacoes_sc`);
    console.log("✔ compra_raiox_sc → contratacoes_sc");
  } else console.log("· contratacoes_sc já existe (pulado)");

  // 2) chave canônica do PNCP como coluna GERADA (cnpj-1-seq6/ano) + índice
  const temNC = (await q(`SELECT 1 FROM information_schema.columns WHERE table_name='contratacoes_sc' AND column_name='numero_controle'`)).rowCount;
  if (!temNC) {
    await q(`ALTER TABLE contratacoes_sc ADD COLUMN numero_controle TEXT
             GENERATED ALWAYS AS (cnpj || '-1-' || lpad(seq::text, 6, '0') || '/' || ano) STORED`);
    console.log("✔ coluna gerada numero_controle");
  } else console.log("· numero_controle já existe (pulado)");
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS ix_contratacoes_nc ON contratacoes_sc (numero_controle)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_contratacoes_modal ON contratacoes_sc (modalidade_id)`);

  // 3) absorve processos_sc → VIEW de compatibilidade (as 2 queries usam cnpj_orgao/ano/sequencial/numero_controle/modalidade)
  if (await existe("public.processos_sc")) {
    const ehTabela = (await q(`SELECT table_type FROM information_schema.tables WHERE table_name='processos_sc'`)).rows[0]?.table_type;
    if (ehTabela === "BASE TABLE") { await q(`DROP TABLE processos_sc`); console.log("✔ tabela processos_sc removida (absorvida)"); }
    else await q(`DROP VIEW IF EXISTS processos_sc`);
  }
  await q(`CREATE VIEW processos_sc AS
    SELECT cnpj AS cnpj_orgao, ano, seq AS sequencial, cod_ibge, numero_controle,
           modalidade_id, modalidade, objeto, valor_estimado, situacao, data_publicacao AS data_pub
    FROM contratacoes_sc`);
  console.log("✔ VIEW processos_sc → contratacoes_sc");

  // 4) verificação
  const nc = (await q(`SELECT count(*) n FROM contratacoes_sc`)).rows[0].n;
  const pv = (await q(`SELECT count(*) n FROM processos_sc`)).rows[0].n;
  const amostra = (await q(`SELECT numero_controle, modalidade FROM processos_sc LIMIT 2`)).rows;
  console.log(`\n✔ contratacoes_sc: ${Number(nc).toLocaleString()} · view processos_sc: ${Number(pv).toLocaleString()}`);
  console.log("amostra view:", amostra.map((r) => r.numero_controle + " (" + r.modalidade + ")").join(" · "));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
