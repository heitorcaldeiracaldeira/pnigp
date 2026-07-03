// ETL — Saneamento por município (SC), Censo 2022 IBGE via SIDRA: % de domicílios com água (rede geral),
// esgotamento adequado (rede/pluvial/fossa ligada) e lixo coletado. Casa com déficit → captação federal.
// node scripts/ingest_saneamento_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

// classif ALVO + categoria Total + categorias "atendido" (soma). Demais classifs da tabela → fixadas no Total.
const IND = [
  { ch: "agua_rede", tab: 10103, alvo: 301, total: 72053, targets: [31471], label: "Água por rede geral de distribuição" },
  { ch: "esgoto_adeq", tab: 10105, alvo: 11558, total: 46292, targets: [46290], label: "Esgotamento sanitário adequado (rede/pluvial/fossa ligada)" },
  { ch: "lixo_coletado", tab: 10109, alvo: 67, total: 10972, targets: [72120, 72121], label: "Lixo coletado por serviço de limpeza" },
];

async function meta(tab) { for (let t = 0; t < 4; t++) { try { const r = await fetch(`https://servicodados.ibge.gov.br/api/v3/agregados/${tab}/metadados`, { signal: AbortSignal.timeout(35000) }); if (r.ok) return await r.json(); } catch {} await sleep(2000 * (t + 1)); } return null; }
async function sidra(url) { for (let t = 0; t < 4; t++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(50000) }); if (r.ok) return await r.json(); } catch {} await sleep(2500 * (t + 1)); } return null; }

// soma V por município (D1C) numa consulta SIDRA
function somaPorMun(j) { const out = {}; if (!Array.isArray(j)) return out; for (const r of j.slice(1)) { const v = Number(String(r.V).replace(",", ".")); if (Number.isFinite(v)) out[r.D1C] = (out[r.D1C] || 0) + v; } return out; }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS saneamento_sc (
    cod_ibge TEXT, indicador TEXT, label TEXT, domicilios INT, atendidos INT, pct NUMERIC, fonte TEXT, ano INT, atualizado timestamptz DEFAULT now(),
    PRIMARY KEY (cod_ibge, indicador) )`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };

  for (const ind of IND) {
    const m = await meta(ind.tab);
    if (!m) { console.log(`  [meta falhou] ${ind.ch}`); continue; }
    // fixa as demais classificações no Total (1ª categoria = "Total")
    const outras = (m.classificacoes || []).filter((c) => c.id !== ind.alvo).map((c) => { const tot = (c.categorias || []).find((x) => /^total$/i.test(x.nome)) || c.categorias[0]; return `c${c.id}/${tot.id}`; }).join("/");
    const base = `https://apisidra.ibge.gov.br/values/t/${ind.tab}/n6/in%20n3%2042/v/381/p/last`;
    const totJ = await sidra(`${base}/c${ind.alvo}/${ind.total}${outras ? "/" + outras : ""}`);
    const atdJ = await sidra(`${base}/c${ind.alvo}/${ind.targets.join(",")}${outras ? "/" + outras : ""}`);
    const tot = somaPorMun(totJ), atd = somaPorMun(atdJ);
    const ano = Number((totJ?.[1]?.D3N || totJ?.[1]?.D2N || "2022").toString().match(/\d{4}/)?.[0]) || 2022;
    let n = 0;
    for (const cod of Object.keys(tot)) {
      const d = tot[cod], a = atd[cod] || 0;
      if (!d) continue;
      await q(`INSERT INTO saneamento_sc (cod_ibge,indicador,label,domicilios,atendidos,pct,fonte,ano) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT (cod_ibge,indicador) DO UPDATE SET label=EXCLUDED.label,domicilios=EXCLUDED.domicilios,atendidos=EXCLUDED.atendidos,pct=EXCLUDED.pct,fonte=EXCLUDED.fonte,ano=EXCLUDED.ano,atualizado=now()`,
        [cod, ind.ch, ind.label, Math.round(d), Math.round(a), Math.round((1000 * a) / d) / 10, "IBGE Censo 2022", ano]);
      n++;
    }
    console.log(`  ${ind.ch.padEnd(14)} ${n} municípios · ${ind.label}`);
    await sleep(500);
  }
  const r = await db.query(`SELECT indicador, round(avg(pct),1) media, min(pct) pior, max(pct) melhor FROM saneamento_sc GROUP BY 1`);
  console.log("Concluído (média SC):", JSON.stringify(r.rows));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
