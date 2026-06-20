// ETL — Déficit ATUARIAL dos RPPS (projeção de longo prazo) via CADPREV (SPREV).
// Fonte: apicadprev.trabalho.gov.br /DRAA_VALORES_COMPROMISSOS (item "Déficit Atuarial" + ativos garantidores).
// Casa nome do ente → cod_ibge. node scripts/ingest_rpps_atuarial_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const API = "https://apicadprev.trabalho.gov.br/DRAA_VALORES_COMPROMISSOS";
const ANOS = (process.env.ANOS || "2021,2022,2023,2024,2025,2026").split(",").map(Number);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

async function pagina(ano, offset) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`${API}?sg_uf=SC&dt_exercicio=${ano}&limit=5000&offset=${offset}`, { signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw 0;
      return (await r.json()).data || [];
    } catch { await sleep(2000 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS rpps_atuarial_sc (cod_ibge TEXT, exercicio INTEGER, deficit_atuarial NUMERIC, ativos NUMERIC, no_ente TEXT, PRIMARY KEY (cod_ibge, exercicio))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  // mapa nome→cod_ibge (município) + Estado
  const ents = (await db.query(`SELECT cod_ibge, nome, tipo FROM entes_sc`)).rows;
  const byName = new Map(ents.filter((e) => e.tipo === "M").map((e) => [norm(e.nome), e.cod_ibge]));
  const estado = "42";

  let gravados = 0;
  for (const ano of ANOS) {
    const acc = new Map(); // no_ente -> {deficit, ativos}
    let offset = 0, lote;
    do {
      lote = await pagina(ano, offset);
      if (lote == null) break;
      for (const r of lote) {
        const e = (acc.get(r.no_ente) || { deficit: null, ativos: null });
        if (r.ds_item_resultado === "Déficit Atuarial" && r.no_categoria_demonstrativo === "Resultado" && r.vl_geracao_atual != null) e.deficit = Number(r.vl_geracao_atual);
        if (/^ATIVOS GARANTIDORES/i.test(r.ds_item_resultado || "") && r.vl_geracao_atual != null) e.ativos = (e.ativos || 0) + Number(r.vl_geracao_atual);
        acc.set(r.no_ente, e);
      }
      offset += 5000;
    } while (lote && lote.length === 5000 && offset < 50000);
    if (lote == null) { console.log(`${ano}: falha de rede — pula`); continue; }
    let n = 0;
    for (const [nome, v] of acc) {
      if (v.deficit == null && v.ativos == null) continue;
      const cod = /governo do estado|estado de santa/i.test(nome) ? estado : byName.get(norm(nome));
      if (!cod) continue; // ente não casou (fundo com nome diferente)
      await q(`INSERT INTO rpps_atuarial_sc (cod_ibge,exercicio,deficit_atuarial,ativos,no_ente) VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (cod_ibge,exercicio) DO UPDATE SET deficit_atuarial=EXCLUDED.deficit_atuarial,ativos=EXCLUDED.ativos,no_ente=EXCLUDED.no_ente`,
        [cod, ano, v.deficit, v.ativos, nome]);
      n++; gravados++;
    }
    console.log(`Ano ${ano}: ${acc.size} entes no DRAA · ${n} casados/gravados`);
  }
  const c = await db.query(`SELECT count(distinct cod_ibge) entes, count(*) FILTER(WHERE deficit_atuarial<0) com_deficit FROM rpps_atuarial_sc`);
  console.log(`Atuarial concluído: ${gravados} registros · ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
