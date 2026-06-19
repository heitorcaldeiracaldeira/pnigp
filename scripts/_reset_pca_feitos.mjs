// Limpa pca_sc_feitos p/ re-rodar PCA 2024-2027 em todos os entes (dados em pca_sc são preservados via UPSERT).
import fs from "fs"; import pg from "pg";
const db = new pg.Pool({ connectionString: fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim(), ssl: { rejectUnauthorized: false } });
const n = (await db.query(`SELECT count(*) n FROM pca_sc_feitos`)).rows[0].n;
await db.query(`TRUNCATE pca_sc_feitos`);
console.log(`pca_sc_feitos limpo (${n} marcas removidas) — PCA re-rodará todos os 296 com 2024-2027`);
await db.end();
