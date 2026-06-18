// ETL — Indicadores setoriais REAIS (infraestrutura extensível). Inicia com ECONOMIA via IBGE (PIB per capita).
// Tabela genérica indicadores_sc (cod_ibge, ano, codigo, area, valor, unidade, fonte).
// node scripts/ingest_indicadores_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CGU_KEY = (env.match(/^PORTAL_TRANSPARENCIA_KEY=(.+)$/m)?.[1] || "").trim();
const MES_BPC = process.env.MES_BPC || "202412";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function getCGU(url) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json", "chave-api-dados": CGU_KEY }, signal: AbortSignal.timeout(25000) });
      if (r.status === 429) { await sleep(3000 + t * 3000); continue; }
      if (r.status === 204 || !r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch { await sleep(800 * (t + 1)); }
  }
  return [];
}
async function poolRun(items, conc, fn) { let i = 0, done = 0; await Promise.all(Array.from({ length: conc }, async () => { while (i < items.length) { await fn(items[i++]); if (++done % 30 === 0) console.log(`  …${done}/${items.length}`); } })); }

async function getJson(url) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(40000) });
      if (r.status === 429 || r.status >= 500) { await sleep(3000 + t * 3000); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1000 * (t + 1)); }
  }
  return null;
}

// IBGE — mapa cod_ibge -> valor (agregado/ano/variável) p/ todos os municípios de SC
async function ibgeMap(agregado, ano, variavel) {
  const j = await getJson(`https://servicodados.ibge.gov.br/api/v3/agregados/${agregado}/periodos/${ano}/variaveis/${variavel}?localidades=N6%5BN3%5B42%5D%5D`);
  const series = j?.[0]?.resultados?.[0]?.series || [];
  const m = {};
  for (const s of series) { const v = Number(Object.values(s.serie)[0]); if (s.localidade?.id && Number.isFinite(v)) m[s.localidade.id] = v; }
  return m;
}
const pibIBGE = (ano) => ibgeMap(5938, ano, 37); // PIB a preços correntes (mil reais)

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
  db.on("error", () => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS indicadores_sc (
      cod_ibge TEXT, ano INTEGER, codigo TEXT, area TEXT, valor NUMERIC, unidade TEXT, fonte TEXT,
      PRIMARY KEY (cod_ibge, ano, codigo) );`);
  const q = async (sql, params) => { for (let t = 0; t < 6; t++) { try { return await db.query(sql, params); } catch { await sleep(900 * (t + 1)); } } throw new Error("db indisponível"); };
  const entes = (await db.query(`SELECT cod_ibge, populacao FROM entes_sc WHERE tipo='M'`)).rows;
  const pop = Object.fromEntries(entes.map((e) => [e.cod_ibge, Number(e.populacao) || 0]));

  // ECONOMIA — PIB per capita (IBGE), SÉRIE histórica
  for (const ano of [2017, 2018, 2019, 2020, 2021]) {
    const pib = await pibIBGE(ano);
    let n = 0;
    for (const [cod, pibMil] of Object.entries(pib)) {
      const p = pop[cod]; if (!p) continue;
      await q(`INSERT INTO indicadores_sc (cod_ibge,ano,codigo,area,valor,unidade,fonte) VALUES ($1,$2,'pib_per_capita','economia',$3,'R$/hab','IBGE')
               ON CONFLICT (cod_ibge,ano,codigo) DO UPDATE SET valor=EXCLUDED.valor`, [cod, ano, Math.round((pibMil * 1000) / p)]);
      n++;
    }
    console.log(`  ✓ PIB per capita ${ano}: ${n} municípios`);
  }

  // EDUCAÇÃO — Taxa de alfabetização (IBGE Censo 2022, agregado 9543 var 2513, %)
  console.log(`EDUCAÇÃO — taxa de alfabetização (IBGE Censo 2022)...`);
  {
    const j = await getJson(`https://servicodados.ibge.gov.br/api/v3/agregados/9543/periodos/2022/variaveis/2513?localidades=N6%5BN3%5B42%5D%5D`);
    const series = j?.[0]?.resultados?.[0]?.series || [];
    let n = 0;
    for (const s of series) {
      const v = Number(Object.values(s.serie)[0]); const cod = s.localidade?.id;
      if (!cod || !Number.isFinite(v)) continue;
      await q(`INSERT INTO indicadores_sc (cod_ibge,ano,codigo,area,valor,unidade,fonte) VALUES ($1,2022,'taxa_alfabetizacao','educacao',$2,'%','IBGE/Censo')
               ON CONFLICT (cod_ibge,ano,codigo) DO UPDATE SET valor=EXCLUDED.valor`, [cod, Math.round(v * 100) / 100]);
      n++;
    }
    console.log(`  ✓ educação: ${n} municípios c/ alfabetização`);
  }

  // DEMOGRAFIA — população (censo 2010+2022, série), área territorial e densidade (IBGE)
  console.log(`DEMOGRAFIA — população (série), área, densidade (IBGE)...`);
  {
    const pop2010 = await ibgeMap(1378, 2010, 93);
    const pop2022 = await ibgeMap(4709, 2022, 93);
    const area = await ibgeMap(1301, 2010, 615);
    let n = 0;
    const ins = async (cod, ano, codigo, valor, un) => q(
      `INSERT INTO indicadores_sc (cod_ibge,ano,codigo,area,valor,unidade,fonte) VALUES ($1,$2,$3,'demografia',$4,$5,'IBGE')
       ON CONFLICT (cod_ibge,ano,codigo) DO UPDATE SET valor=EXCLUDED.valor`, [cod, ano, codigo, valor, un]);
    for (const e of entes) {
      const cod = e.cod_ibge; let teve = false;
      if (pop2010[cod]) { await ins(cod, 2010, "populacao", pop2010[cod], "hab"); teve = true; }
      if (pop2022[cod]) { await ins(cod, 2022, "populacao", pop2022[cod], "hab"); teve = true; }
      if (area[cod]) await ins(cod, 2022, "area_km2", Math.round(area[cod] * 10) / 10, "km²");
      if (pop2022[cod] && area[cod]) await ins(cod, 2022, "densidade_hab_km2", Math.round((pop2022[cod] / area[cod]) * 10) / 10, "hab/km²");
      if (teve) n++;
    }
    console.log(`  ✓ demografia: ${n} municípios`);
  }

  // SOCIAL — programas sociais por município (CGU): beneficiários por mil hab
  const PROGRAMAS = [
    { codigo: "bpc_por_mil_hab", ep: "bpc-por-municipio", mes: "202412" },
    { codigo: "seguro_defeso_por_mil_hab", ep: "seguro-defeso-por-municipio", mes: "202306" },
  ];
  // série histórica da transferência de renda (Bolsa Família → Auxílio Brasil → Novo Bolsa Família)
  const RENDA = [
    { ano: 2019, ep: "bolsa-familia-por-municipio", mes: "201912" },
    { ano: 2020, ep: "bolsa-familia-por-municipio", mes: "202012" },
    { ano: 2021, ep: "auxilio-brasil-por-municipio", mes: "202112" },
    { ano: 2022, ep: "auxilio-brasil-por-municipio", mes: "202212" },
    { ano: 2023, ep: "novo-bolsa-familia-por-municipio", mes: "202312" },
    { ano: 2024, ep: "novo-bolsa-familia-por-municipio", mes: "202412" },
  ];
  if (CGU_KEY) {
    await q(`DELETE FROM indicadores_sc WHERE codigo='novo_bolsa_familia_por_mil_hab'`).catch(() => {});
    for (const prog of PROGRAMAS) {
      console.log(`SOCIAL — ${prog.codigo} (CGU ${prog.mes})...`);
      const ano = Number(prog.mes.slice(0, 4));
      let sn = 0;
      await poolRun(entes, 4, async (e) => {
        const p = pop[e.cod_ibge]; if (!p) return;
        const arr = await getCGU(`https://api.portaldatransparencia.gov.br/api-de-dados/${prog.ep}?mesAno=${prog.mes}&codigoIbge=${e.cod_ibge}&pagina=1`);
        const benef = arr.reduce((s, x) => s + (Number(x.quantidadeBeneficiados) || 0), 0);
        if (!benef) return;
        const porMil = Math.round((benef / p) * 1000 * 10) / 10;
        await q(`INSERT INTO indicadores_sc (cod_ibge,ano,codigo,area,valor,unidade,fonte) VALUES ($1,$2,$3,'social',$4,'benef./mil hab','CGU/Transparência')
                 ON CONFLICT (cod_ibge,ano,codigo) DO UPDATE SET valor=EXCLUDED.valor`, [e.cod_ibge, ano, prog.codigo, porMil]);
        sn++;
      });
      console.log(`  ✓ ${prog.codigo}: ${sn} municípios`);
    }
    // série histórica de renda → codigo unificado 'transferencia_renda_por_mil_hab'
    for (const yr of RENDA) {
      console.log(`SOCIAL — transferência de renda ${yr.ano} (${yr.ep})...`);
      let sn = 0;
      await poolRun(entes, 4, async (e) => {
        const p = pop[e.cod_ibge]; if (!p) return;
        const arr = await getCGU(`https://api.portaldatransparencia.gov.br/api-de-dados/${yr.ep}?mesAno=${yr.mes}&codigoIbge=${e.cod_ibge}&pagina=1`);
        const benef = arr.reduce((s, x) => s + (Number(x.quantidadeBeneficiados) || 0), 0);
        if (!benef) return;
        const porMil = Math.round((benef / p) * 1000 * 10) / 10;
        await q(`INSERT INTO indicadores_sc (cod_ibge,ano,codigo,area,valor,unidade,fonte) VALUES ($1,$2,'transferencia_renda_por_mil_hab','social',$3,'benef./mil hab','CGU/Transparência')
                 ON CONFLICT (cod_ibge,ano,codigo) DO UPDATE SET valor=EXCLUDED.valor`, [e.cod_ibge, yr.ano, porMil]);
        sn++;
      });
      console.log(`  ✓ renda ${yr.ano}: ${sn} municípios`);
    }
  } else { console.log("SOCIAL pulado (sem chave CGU)"); }

  const c = await db.query(`SELECT area, count(*) n, count(DISTINCT cod_ibge) e FROM indicadores_sc GROUP BY area`);
  c.rows.forEach((r) => console.log(`  [${r.area}] ${r.n} registros em ${r.e} entes`));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
