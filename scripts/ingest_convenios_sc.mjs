// ETL — Convênios captados pelos municípios (Portal da Transparência, dado do Transferegov).
// "Quanto cada prefeitura captou" → base p/ benchmark vs pares (o ponto cego da captação). API com chave + rate limit.
// node scripts/ingest_convenios_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const KEY = env.match(/^PORTAL_TRANSPARENCIA_KEY=(.+)$/m)[1].trim();
const API = "https://api.portaldatransparencia.gov.br/api-de-dados/convenios";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const ehMunicipal = (t) => /Municipal/i.test(String(t || "")); // prefeitura/autarquia municipal

async function fetchPag(cod, pag) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(`${API}?codigoIBGE=${cod}&pagina=${pag}`, { headers: { "chave-api-dados": KEY, "Accept": "application/json" }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await sleep(8000); continue; }
      if (!r.ok) throw 0;
      return await r.json();
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS convenios_captados_sc (cod_ibge TEXT, id BIGINT, numero TEXT, objeto TEXT, orgao TEXT, situacao TEXT, valor NUMERIC, valor_liberado NUMERIC, dt_inicio DATE, dt_fim DATE, ano INTEGER, convenente TEXT, PRIMARY KEY (cod_ibge, id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS convenios_check (cod_ibge TEXT PRIMARY KEY)`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };
  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' ORDER BY cod_ibge`)).rows;
  const feitos = new Set((await db.query(`SELECT cod_ibge FROM convenios_check`)).rows.map((r) => r.cod_ibge));
  let proc = 0, grav = 0;
  for (const e of entes) {
    if (feitos.has(e.cod_ibge)) continue;
    let pag = 1, total = 0;
    while (pag <= 50) {
      const arr = await fetchPag(e.cod_ibge, pag);
      await sleep(750); // ~80 req/min (limite 90/min)
      if (!arr || !arr.length) break;
      for (const c of arr) {
        if (!ehMunicipal(c.convenente?.tipo)) continue; // só prefeitura/adm municipal
        const dt = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
        const ini = dt(c.dataInicioVigencia);
        await q(`INSERT INTO convenios_captados_sc (cod_ibge,id,numero,objeto,orgao,situacao,valor,valor_liberado,dt_inicio,dt_fim,ano,convenente)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (cod_ibge,id) DO UPDATE SET valor=EXCLUDED.valor, valor_liberado=EXCLUDED.valor_liberado, situacao=EXCLUDED.situacao`,
          [e.cod_ibge, c.id, c.dimConvenio?.numero || null, c.dimConvenio?.objeto || null, c.orgao?.nome || c.orgao?.sigla || null, c.situacao || null, num(c.valor), num(c.valorLiberado), ini, dt(c.dataFinalVigencia), ini ? +ini.slice(0, 4) : null, c.convenente?.nome || null]);
        total++; grav++;
      }
      if (arr.length < 15) break; // última página
      pag++;
    }
    await q(`INSERT INTO convenios_check (cod_ibge) VALUES ($1) ON CONFLICT DO NOTHING`, [e.cod_ibge]);
    proc++;
    if (proc % 30 === 0) console.log(`  ${proc}/${entes.length} municípios · ${grav} convênios municipais`);
  }
  const r = await db.query(`SELECT count(distinct cod_ibge) e, count(*) n, round(sum(valor)/1e6) mi FROM convenios_captados_sc`);
  console.log(`Convênios concluído: ${grav} nesta rodada · ${JSON.stringify(r.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
