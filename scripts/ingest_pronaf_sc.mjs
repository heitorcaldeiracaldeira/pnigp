// ETL — PRONAF / Crédito Rural por município de SC.
// Fonte: BCB SICOR (Olinda OData v2). Entitysets agregados CusteioMunicipioProduto (VlCusteio+codIbge) e
// InvestMunicipioProduto (VlInvest, casado por nome). Filtro eficiente: cdEstado='25' (SC) — a granular
// "SemFiltros" faz full-scan e estoura timeout; estas paginam por cdEstado em ~18s/2000 linhas.
// Valor por município/ano (R$ contratado). nº de contratos não é exposto nestas entitysets agregadas.
// node scripts/ingest_pronaf_sc.mjs   (ANOS=2024,2025 opcional)
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CDESTADO = process.env.CDESTADO || "25"; // SC no código BCB do SICOR
const PROG = "0001"; // PRONAF
const ANOS = (process.env.ANOS || "2023,2024,2025").split(",");
const ROOT = "https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/";
const PAGE = Number(process.env.PAGE || 500); // páginas pequenas respondem rápido (~0,4s); $top grande estoura no Olinda
const numf = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function pagina(es, ano, skip) {
  const filt = `cdEstado eq '${CDESTADO}' and AnoEmissao eq '${ano}' and cdPrograma eq '${PROG}'`.replace(/ /g, "%20");
  const url = `${ROOT}${es}?$top=${PAGE}&$format=json&$filter=${filt}&$skip=${skip}`;
  for (let t = 0; t < 8; t++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(150000), headers: { "User-Agent": "Mozilla/5.0" } }); if (!r.ok) throw r.status; const j = await r.json(); return j.value || []; }
    catch { await new Promise((s) => setTimeout(s, 5000 * (t + 1))); }
  }
  return null;
}
async function coleta(es, ano, onRow) {
  let skip = 0, n = 0;
  while (true) {
    const batch = await pagina(es, ano, skip);
    if (batch === null) { console.log(`    ! ${es} ${ano} skip=${skip} falhou após retries`); break; }
    if (!batch.length) break;
    for (const r of batch) onRow(r);
    n += batch.length; skip += batch.length;
    if (batch.length < PAGE) break;
  }
  return n;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS pronaf_sc (cod_ibge TEXT, ano INT, vl_custeio NUMERIC, vl_investimento NUMERIC, vl_total NUMERIC, area_ha NUMERIC, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };
  const ent = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((x) => x.cod_ibge));
  console.log(`PRONAF/SICOR — cdEstado ${CDESTADO}, anos ${ANOS.join(",")}`);
  for (const ano of ANOS) {
    const cust = new Map(); // codIbge -> {vc, area}
    const nameToIbge = new Map();
    const inv = new Map(); // nomeNorm -> vl
    const nC = await coleta("CusteioMunicipioProduto", ano, (r) => {
      const c = String(r.codIbge || "").trim(); if (c.length !== 7) return;
      const a = cust.get(c) || { vc: 0, area: 0 }; a.vc += numf(r.VlCusteio); a.area += numf(r.AreaCusteio); cust.set(c, a);
      nameToIbge.set(norm(r.Municipio), c);
    });
    const nI = await coleta("InvestMunicipioProduto", ano, (r) => {
      const k = norm(r.Municipio); inv.set(k, (inv.get(k) || 0) + numf(r.VlInvest));
    });
    // merge: investimento casado por nome → IBGE
    const codes = new Set(cust.keys());
    let invCasado = 0, invOrfao = 0;
    const invByIbge = new Map();
    for (const [nm, vl] of inv) { const c = nameToIbge.get(nm); if (c) { invByIbge.set(c, vl); codes.add(c); invCasado++; } else { invOrfao += vl; } }
    let ok = 0;
    for (const c of codes) {
      if (!ent.has(c)) continue;
      const vc = (cust.get(c) || { vc: 0 }).vc, area = (cust.get(c) || { area: 0 }).area, vi = invByIbge.get(c) || 0;
      await q(`INSERT INTO pronaf_sc (cod_ibge,ano,vl_custeio,vl_investimento,vl_total,area_ha) VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (cod_ibge,ano) DO UPDATE SET vl_custeio=EXCLUDED.vl_custeio,vl_investimento=EXCLUDED.vl_investimento,vl_total=EXCLUDED.vl_total,area_ha=EXCLUDED.area_ha,atualizado=now()`,
        [c, Number(ano), vc, vi, vc + vi, area]);
      ok++;
    }
    console.log(`  ${ano}: custeio ${nC} linhas · invest ${nI} linhas (${invCasado} nomes casados) → ${ok} municípios${invOrfao ? ` · R$ ${Math.round(invOrfao).toLocaleString("pt-BR")} invest. sem match de nome` : ""}`);
  }
  const x = (await db.query(`SELECT ano, count(*) m, round(sum(vl_total)) vl FROM pronaf_sc GROUP BY ano ORDER BY ano`)).rows;
  for (const r of x) console.log(`  => ${r.ano}: ${r.m} munis · R$ ${Number(r.vl).toLocaleString("pt-BR")} contratado (PRONAF)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
