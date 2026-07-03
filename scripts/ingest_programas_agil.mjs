// ETL — programas "gestão ágil" do Transferegov (fundoafundo/programa_gestao_agil), somados ao catálogo programas_transferegov.
// Complementa fundoafundo/programa. node scripts/ingest_programas_agil.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const API = "https://api.transferegov.gestao.gov.br";

async function main() {
  const r = await fetch(`${API}/fundoafundo/programa_gestao_agil?limit=2000`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error("api " + r.status);
  const arr = await r.json();
  console.log(`gestão ágil recebidos: ${arr.length}`);
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((x) => setTimeout(x, 800 * (t + 1))); } } throw new Error("db"); };
  let ok = 0;
  for (const p of arr) {
    const id = "agil-" + (p.id_programa_agil ?? p.codigo_programa_agil);
    const nome = String(p.nome_programa_agil || "").trim(); if (!nome) continue;
    await q(`INSERT INTO programas_transferegov (id_programa, modulo, nome, orgao, modalidade, situacao)
             VALUES ($1,'fundoafundo_agil',$2,$3,'GESTAO_AGIL','ATIVO')
             ON CONFLICT (id_programa) DO UPDATE SET nome=EXCLUDED.nome, orgao=EXCLUDED.orgao, modalidade=EXCLUDED.modalidade`,
      [id, nome, p.nome_orgao_programa_agil || p.sigla_orgao_programa_agil || null]);
    ok++;
  }
  const t = await db.query(`SELECT count(*) total, count(*) FILTER (WHERE modalidade='GESTAO_AGIL') agil, count(distinct orgao) orgaos FROM programas_transferegov`);
  console.log(`Concluído: ${ok} gestão ágil gravados · catálogo total ${t.rows[0].total} (${t.rows[0].agil} ágil) · ${t.rows[0].orgaos} órgãos`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
