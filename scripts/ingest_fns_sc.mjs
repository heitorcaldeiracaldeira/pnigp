// ETL — Repasses federais fundo-a-fundo do FNS por bloco/área, por município de SC.
// Fonte: API REST da Consulta Consolidada do FNS (consultafns.saude.gov.br) — descoberta via app Angular.
// Estrutura: bloco 10=Custeio (APS, MAC, Farmácia, Vigilância, Gestão) · bloco 11=Investimento.
// Idempotente/resumível por (cod_ibge, ano). node scripts/ingest_fns_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const API = "https://consultafns.saude.gov.br/recursos/consulta-consolidada/repasse-bloco";
const ANO_ATUAL = new Date().getFullYear();
const ANOS = (process.env.ANOS || `2020,2021,2022,2023,2024,${ANO_ATUAL}`).split(",");
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function buscar(co6, ano) {
  const url = `${API}?ano=${ano}&coMunicipioIbge=${co6}&coTipoRepasse=M&count=50&page=1&sgUf=SC`;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { Accept: "application/json" } });
      if (!r.ok) throw 0;
      const j = await r.json();
      return j.resultado || (Array.isArray(j) ? j : []);
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS fns_repasse_sc (
    cod_ibge TEXT NOT NULL, ano INTEGER NOT NULL, bloco_cod INTEGER NOT NULL, bloco_nome TEXT,
    area_cod INTEGER NOT NULL DEFAULT 0, area_nome TEXT, vl_total NUMERIC, vl_liquido NUMERIC,
    PRIMARY KEY (cod_ibge, ano, bloco_cod, area_cod) )`);
  const q = async (s, p) => { for (let t = 0; t < 10; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };
  const munis = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' ORDER BY cod_ibge`)).rows.map((r) => r.cod_ibge);
  const feitos = new Set((await db.query(`SELECT DISTINCT cod_ibge||'-'||ano k FROM fns_repasse_sc`)).rows.map((r) => r.k));

  let proc = 0, vazios = 0;
  for (const ano of ANOS) {
    for (const cod of munis) {
      if (feitos.has(`${cod}-${ano}`) && Number(ano) < ANO_ATUAL) continue; // ano corrente sempre re-coleta (repasses crescem)
      const blocos = await buscar(cod.slice(0, 6), ano);
      if (blocos == null) { console.log(`  ${cod}/${ano}: falhou (mantém p/ retry)`); continue; }
      const linhas = [];
      blocos.forEach((b, i) => {
        // pré-2018 não tinha Custeio/Investimento: bloco-pai vem sem codigo/nome → código sintético (90+i)
        const bcod = b.codigo ?? 90 + i;
        const bnome = b.nome ?? "Repasses (estrutura pré-2018)";
        linhas.push([cod, ano, bcod, bnome, 0, null, b.vlTotal, b.vlLiquido]); // total do bloco
        (b.repasses || []).forEach((r, j) => linhas.push([cod, ano, bcod, bnome, r.codigo ?? 500 + j, r.nome ?? null, r.vlTotal, r.vlLiquido])); // áreas (filhos)
      });
      try {
        for (const l of linhas) {
          await q(`INSERT INTO fns_repasse_sc (cod_ibge,ano,bloco_cod,bloco_nome,area_cod,area_nome,vl_total,vl_liquido) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                   ON CONFLICT (cod_ibge,ano,bloco_cod,area_cod) DO UPDATE SET bloco_nome=EXCLUDED.bloco_nome,area_nome=EXCLUDED.area_nome,vl_total=EXCLUDED.vl_total,vl_liquido=EXCLUDED.vl_liquido`, l);
        }
      } catch {
        await db.query(`DELETE FROM fns_repasse_sc WHERE cod_ibge=$1 AND ano=$2`, [cod, ano]).catch(() => {}); // limpa parcial p/ rerun refazer este cod-ano
        console.log(`  ${cod}/${ano}: erro de escrita — parcial removido (rerun refaz)`);
        continue;
      }
      if (!linhas.length) vazios++;
      proc++;
      if (proc % 30 === 0) console.log(`  ${ano}: ${proc} processados...`);
      await sleep(150);
    }
    console.log(`Ano ${ano} concluído.`);
  }
  const c = await db.query(`SELECT count(DISTINCT cod_ibge) e, count(DISTINCT ano) anos, count(*) linhas, round(sum(vl_liquido) FILTER(WHERE area_cod=0)/1e9,2) bi_total FROM fns_repasse_sc`);
  console.log(`FNS concluído: ${JSON.stringify(c.rows[0])} | vazios: ${vazios}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
