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
      if (r.status === 404) return { ok: true, naoExiste: true }; // CNPJ inexistente — marca p/ não retentar
      if (r.status === 429) { await sleep(3000 * (t + 1)); continue; }
      if (!r.ok) throw 0;
      const j = await r.json();
      return { ok: true, municipio: j.municipio || null, uf: j.uf || null, razao: j.razao_social || j.nome || null,
        situacao: j.descricao_situacao_cadastral || null, motivo: j.descricao_motivo_situacao_cadastral || null,
        abertura: j.data_inicio_atividade || null, cnae: j.cnae_fiscal_descricao || null, porte: j.porte || null };
    } catch { await sleep(1500 * (t + 1)); }
  }
  return { ok: false };
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS cnpj_loc (cnpj TEXT PRIMARY KEY, razao_social TEXT, municipio TEXT, uf TEXT, atualizado timestamptz DEFAULT now())`);
  for (const c of ["situacao TEXT", "situacao_motivo TEXT", "abertura DATE", "cnae TEXT", "porte TEXT"]) await db.query(`ALTER TABLE cnpj_loc ADD COLUMN IF NOT EXISTS ${c}`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  // CNPJs de fornecedores vencedores — contratos + itens (cada fonte com catch próprio; itens pode não existir ainda)
  const ct = (await db.query(`SELECT DISTINCT regexp_replace(ni_fornecedor,'\\D','','g') cnpj FROM contratos_sc WHERE ni_fornecedor IS NOT NULL`).catch(() => ({ rows: [] }))).rows;
  const it = (await db.query(`SELECT DISTINCT regexp_replace(cnpj_fornecedor,'\\D','','g') cnpj FROM itens_sc WHERE cnpj_fornecedor IS NOT NULL`).catch(() => ({ rows: [] }))).rows;
  const alvo = [...new Set([...ct, ...it].map((r) => r.cnpj))].filter((c) => c && c.length === 14);
  // já resolvidos COM situação cadastral (os antigos sem situação são re-resolvidos p/ backfill)
  const cache = new Set((await db.query(`SELECT cnpj FROM cnpj_loc WHERE situacao IS NOT NULL`)).rows.map((r) => r.cnpj));
  const pend = alvo.filter((c) => !cache.has(c));
  console.log(`CNPJs de fornecedores: ${alvo.length} | já em cache: ${cache.size} | a resolver: ${pend.length}`);
  let ok = 0, falha = 0;
  for (const cnpj of pend) {
    const res = await resolver(cnpj);
    if (!res.ok) { falha++; continue; } // mantém p/ próximo run
    const sit = res.naoExiste ? "INEXISTENTE" : res.situacao;
    await q(`INSERT INTO cnpj_loc (cnpj,razao_social,municipio,uf,situacao,situacao_motivo,abertura,cnae,porte) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (cnpj) DO UPDATE SET razao_social=EXCLUDED.razao_social,municipio=EXCLUDED.municipio,uf=EXCLUDED.uf,situacao=EXCLUDED.situacao,situacao_motivo=EXCLUDED.situacao_motivo,abertura=EXCLUDED.abertura,cnae=EXCLUDED.cnae,porte=EXCLUDED.porte,atualizado=now()`,
      [cnpj, res.razao || null, res.municipio || null, res.uf || null, sit, res.motivo || null, res.abertura || null, res.cnae || null, res.porte || null]);
    ok++;
    if (ok % 25 === 0) console.log(`  …${ok}/${pend.length} resolvidos`);
    await sleep(350); // gentil com o serviço público
  }
  const c = await db.query(`SELECT count(*) total, count(*) FILTER(WHERE uf='SC') sc, count(*) FILTER(WHERE uf IS NOT NULL AND uf<>'SC') fora FROM cnpj_loc`);
  console.log(`Concluído: ${ok} resolvidos, ${falha} falhas. Cache: ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
