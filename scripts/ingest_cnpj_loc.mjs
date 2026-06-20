// ETL — resolve UF/município dos FORNECEDORES vencedores (PNCP não fornece; usamos o CNPJ).
// Fonte: minhareceita.org (base Receita Federal). Cache em cnpj_loc, idempotente/resumível, rate-limited.
// node scripts/ingest_cnpj_loc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function resolver(cnpj) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`https://minhareceita.org/${cnpj}`, { signal: AbortSignal.timeout(25000) });
      if (r.status === 404) return { municipio: null, uf: null, razao: null, ok: true }; // CNPJ inexistente — não retentar
      if (r.status === 429) { await sleep(3000 * (t + 1)); continue; }
      if (!r.ok) throw 0;
      const j = await r.json();
      return { municipio: j.municipio || null, uf: j.uf || null, razao: j.razao_social || j.nome || null, ok: true };
    } catch { await sleep(1500 * (t + 1)); }
  }
  return { ok: false };
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS cnpj_loc (cnpj TEXT PRIMARY KEY, razao_social TEXT, municipio TEXT, uf TEXT, atualizado timestamptz DEFAULT now())`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  // CNPJs de fornecedores vencedores — contratos + itens (cada fonte com catch próprio; itens pode não existir ainda)
  const ct = (await db.query(`SELECT DISTINCT regexp_replace(ni_fornecedor,'\\D','','g') cnpj FROM contratos_sc WHERE ni_fornecedor IS NOT NULL`).catch(() => ({ rows: [] }))).rows;
  const it = (await db.query(`SELECT DISTINCT regexp_replace(cnpj_fornecedor,'\\D','','g') cnpj FROM itens_sc WHERE cnpj_fornecedor IS NOT NULL`).catch(() => ({ rows: [] }))).rows;
  const alvo = [...new Set([...ct, ...it].map((r) => r.cnpj))].filter((c) => c && c.length === 14);
  const cache = new Set((await db.query(`SELECT cnpj FROM cnpj_loc`)).rows.map((r) => r.cnpj));
  const pend = alvo.filter((c) => !cache.has(c));
  console.log(`CNPJs de fornecedores: ${alvo.length} | já em cache: ${cache.size} | a resolver: ${pend.length}`);
  let ok = 0, falha = 0;
  for (const cnpj of pend) {
    const res = await resolver(cnpj);
    if (!res.ok) { falha++; continue; } // mantém p/ próximo run
    await q(`INSERT INTO cnpj_loc (cnpj,razao_social,municipio,uf) VALUES ($1,$2,$3,$4) ON CONFLICT (cnpj) DO UPDATE SET razao_social=EXCLUDED.razao_social,municipio=EXCLUDED.municipio,uf=EXCLUDED.uf,atualizado=now()`,
      [cnpj, res.razao, res.municipio, res.uf]);
    ok++;
    if (ok % 25 === 0) console.log(`  …${ok}/${pend.length} resolvidos`);
    await sleep(350); // gentil com o serviço público
  }
  const c = await db.query(`SELECT count(*) total, count(*) FILTER(WHERE uf='SC') sc, count(*) FILTER(WHERE uf IS NOT NULL AND uf<>'SC') fora FROM cnpj_loc`);
  console.log(`Concluído: ${ok} resolvidos, ${falha} falhas. Cache: ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
