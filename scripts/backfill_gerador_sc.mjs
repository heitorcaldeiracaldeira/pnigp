// BACKFILL do arquivo_texto_sc.gerador nos textos ja baixados. Idempotente (so quem esta NULL) e resumivel.
// O gerador (assinatura NO TEXTO) e o que roteia o parser — a plataforma do PNCP e so quem PUBLICOU.
// node scripts/backfill_gerador_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { detectaGerador } from "./mapa_atas_plataformas.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LOTE = Number(process.env.LOTE || 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 180000 });
db.on("error", () => {});
const FATAL = new Set(["22P05", "22021", "23505", "23502", "42703", "42P10"]);
const q = async (s, p) => {
  let u; for (let i = 0; i < 12; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (FATAL.has(e.code)) throw e; await sleep(1500 * (i + 1)); } }
  throw new Error(`db (${u?.code}): ${u?.message}`);
};
await q(`ALTER TABLE arquivo_texto_sc ADD COLUMN IF NOT EXISTS gerador TEXT`);
await q(`CREATE INDEX IF NOT EXISTS ix_arqtexto_gerador ON arquivo_texto_sc (gerador)`);

let total = 0;
const cont = {};
for (;;) {
  const rs = (await q(`SELECT cnpj,ano,seq,sequencial_documento,texto FROM arquivo_texto_sc
    WHERE gerador IS NULL ORDER BY cnpj,ano,seq,sequencial_documento LIMIT ${LOTE}`)).rows;
  if (!rs.length) break;
  // 1 UPDATE por lote (unnest) — Neon nao gosta de bombardeio linha-a-linha
  const K = { c: [], a: [], s: [], d: [], g: [] };
  for (const r of rs) {
    const g = detectaGerador(r.texto) || "outro";
    cont[g] = (cont[g] || 0) + 1;
    K.c.push(r.cnpj); K.a.push(r.ano); K.s.push(r.seq); K.d.push(r.sequencial_documento); K.g.push(g);
  }
  await q(`UPDATE arquivo_texto_sc t SET gerador = x.g
    FROM unnest($1::text[],$2::int[],$3::int[],$4::int[],$5::text[]) AS x(c,a,s,d,g)
    WHERE t.cnpj=x.c AND t.ano=x.a AND t.seq=x.s AND t.sequencial_documento=x.d`, [K.c, K.a, K.s, K.d, K.g]);
  total += rs.length;
  process.stdout.write(`  ${total} carimbados\r`);
}
console.log(`\n✔ backfill: ${total} textos carimbados`);
const r = (await q(`SELECT coalesce(gerador,'(null)') gerador, count(*) n FROM arquivo_texto_sc GROUP BY 1 ORDER BY 2 DESC`)).rows;
for (const x of r) console.log(`   ${String(x.gerador).padEnd(24)} ${x.n}`);
await db.end();
