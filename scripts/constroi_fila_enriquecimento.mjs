// CONSTRÓI a fila materializada do enriquecimento — 1 VARREDURA (não 12). Os shards depois leem fatias LEVES daqui,
// em vez de cada um varrer os 344MB de arquivo_texto_sc. É o ajuste de DBA: materializar o work-list caro UMA vez.
// app.fila_enriquecimento(cnpj,ano,seq,nfases). Reexecutável (TRUNCATE+recarrega). node scripts/constroi_fila_enriquecimento.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CRIACAO = [10, 7, 5, 6, 8, 4, 9, 3, 1, 2, 20, 16];

export async function constroiFila(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS app.fila_enriquecimento(cnpj text, ano int, seq int, nfases int, PRIMARY KEY(cnpj,ano,seq))`);
  await db.query(`TRUNCATE app.fila_enriquecimento`);
  const t = Date.now();
  const r = await db.query(`INSERT INTO app.fila_enriquecimento(cnpj,ano,seq,nfases)
    SELECT t.cnpj,t.ano,t.seq, count(DISTINCT a.tipo_documento_id)
    FROM arquivo_texto_sc t JOIN arquivos_sc a USING(cnpj,ano,seq,sequencial_documento)
    WHERE t.chars>500 AND t.excluido_em IS NULL AND a.tipo_documento_id = ANY($1)
    GROUP BY t.cnpj,t.ano,t.seq`, [CRIACAO]);
  await db.query(`CREATE INDEX IF NOT EXISTS ix_fila_nfases ON app.fila_enriquecimento(nfases DESC)`);
  console.log(`[fila] ${r.rowCount} processos em ${((Date.now() - t) / 1000).toFixed(0)}s (1 varredura)`);
  return r.rowCount;
}

if (process.argv[1] && process.argv[1].includes("constroi_fila_enriquecimento")) {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
  await constroiFila(db); await db.end();
}
