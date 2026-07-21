// AUDITORIA · ledger — linha do tempo de AÇÕES de um processo/item: "campo ← ação ← fonte ← data/hora".
// Lê a view app.item_auditoria_${uf} (criada por cria_view_auditoria.mjs). SÓ LEITURA.
//   node scripts/auditoria/ledger.mjs <cnpj> <ano> <seq> [numero]
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "sc").toLowerCase();
const [cnpj, ano, seq, numero] = process.argv.slice(2);
if (!cnpj || !ano || !seq) { console.error("uso: node scripts/auditoria/ledger.mjs <cnpj> <ano> <seq> [numero]"); process.exit(1); }
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, statement_timeout: 60000 });
const filtroItem = numero ? `AND (numero=$4 OR numero IS NULL)` : ``;
const p = numero ? [cnpj, +ano, +seq, numero] : [cnpj, +ano, +seq];
const r = (await db.query(`SELECT to_char(ts,'YYYY-MM-DD HH24:MI') quando, numero, acao, campo, left(valor,60) valor, fonte
  FROM app.item_auditoria_${UF} WHERE cnpj=$1 AND ano=$2 AND seq=$3 ${filtroItem}
  ORDER BY ts NULLS LAST, numero`, p)).rows;
console.log(`== livro-razão ${cnpj}/${ano}/${seq}${numero ? " item " + numero : ""} (${r.length} ações) ==`);
console.table(r);
await db.end();
