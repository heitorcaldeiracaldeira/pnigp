// ETL — Precatórios por município de SC, via API do TJSC (sistema de Regime Especial de Precatórios).
// Lista entes devedores → soma/qtde de precatórios por ente → agrega por município (casamento por nome).
// Replicável por UF (cada TJ tem o seu — CNJ Res. 303). node scripts/ingest_precatorios_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const BASE = "https://app.tjsc.jus.br/tjsc-precregespecial/rest/listaunificadaprecatorios";
const UA = "Mozilla/5.0 (pnigp-i10; institutoi10)";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");

async function getJSON(url, opts, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json", ...(opts?.body ? { "Content-Type": "application/json" } : {}) }, ...opts, signal: AbortSignal.timeout(40000) });
      if (r.status >= 500) { await sleep(2000 * (t + 1)); continue; }
      if (!r.ok) return null;
      const txt = await r.text();
      return txt ? JSON.parse(txt) : null;
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}
const soma = (cd) => getJSON(`${BASE}/somaprecatorios/`, { method: "POST", body: JSON.stringify({ entidadeDevedora: { cdEntidade: cd } }) });
const qtde = (cd) => getJSON(`${BASE}/qtdeprecatorios/`, { method: "POST", body: JSON.stringify({ entidadeDevedora: { cdEntidade: cd } }) });

async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS precatorios_entes_sc (cd_entidade BIGINT PRIMARY KEY, de_entidade TEXT, cod_ibge TEXT, regime TEXT, valor NUMERIC, qtde INT, atualizado timestamptz DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS precatorios_sc (cod_ibge TEXT PRIMARY KEY, total_valor NUMERIC, total_qtde INT, n_entes INT, atualizado timestamptz DEFAULT now())`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };

  // municípios p/ casamento (longest-match do nome dentro do nome do ente)
  const muns = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M' AND uf='SC'`)).rows.map((r) => ({ cod: r.cod_ibge, nome: r.nome, n: norm(r.nome) })).sort((a, b) => b.n.length - a.n.length);
  const casar = (deEntidade) => { const d = norm(deEntidade); for (const m of muns) if (m.n.length >= 4 && d.includes(m.n)) return m.cod; return null; };

  const entes = await getJSON(`${BASE}/entidadesdevedoras/`);
  if (!Array.isArray(entes)) { console.log("falha ao listar entes"); await db.end(); return; }
  console.log(`entes devedores: ${entes.length}`);

  let semMun = 0, comValor = 0;
  await pool(entes, 6, async (e) => {
    const cd = e.cdEntidade;
    const [s, qt] = await Promise.all([soma(cd), qtde(cd)]);
    const valor = typeof s === "number" ? s : Number(s) || 0;
    const quant = typeof qt === "number" ? qt : Number(qt) || 0;
    const cod = casar(e.deEntidade);
    if (!cod) semMun++;
    if (valor > 0) comValor++;
    await q(`INSERT INTO precatorios_entes_sc (cd_entidade,de_entidade,cod_ibge,regime,valor,qtde) VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (cd_entidade) DO UPDATE SET de_entidade=EXCLUDED.de_entidade,cod_ibge=EXCLUDED.cod_ibge,regime=EXCLUDED.regime,valor=EXCLUDED.valor,qtde=EXCLUDED.qtde,atualizado=now()`,
      [cd, e.deEntidade, cod, e.nomeTipoRegime || null, valor, quant]);
  });

  // agrega por município
  await q(`INSERT INTO precatorios_sc (cod_ibge,total_valor,total_qtde,n_entes,atualizado)
           SELECT cod_ibge, sum(valor), sum(qtde), count(*) FILTER (WHERE valor>0), now() FROM precatorios_entes_sc WHERE cod_ibge IS NOT NULL GROUP BY cod_ibge
           ON CONFLICT (cod_ibge) DO UPDATE SET total_valor=EXCLUDED.total_valor,total_qtde=EXCLUDED.total_qtde,n_entes=EXCLUDED.n_entes,atualizado=now()`);
  const r = await db.query(`SELECT count(*) munis, sum(total_valor)::numeric(18,2) valor_uf, sum(total_qtde) qtde_uf FROM precatorios_sc`);
  console.log(`Concluído: ${entes.length} entes (${comValor} c/ precatório, ${semMun} sem município casado) → ${r.rows[0].munis} municípios · estoque UF R$ ${r.rows[0].valor_uf} (${r.rows[0].qtde_uf} precatórios)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
