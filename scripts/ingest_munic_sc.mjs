// ETL — IBGE MUNIC (Pesquisa de Informações Básicas Municipais): instrumentos de gestão por município.
// "tem/não tem" planos e conselhos municipais (vários são pré-requisito p/ transferências federais → captação).
// Truque: tabelas SIDRA "Municípios COM X" só retornam quem TEM → presença = tem. node scripts/ingest_munic_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

// indicadores = tabelas MUNIC do tipo "Municípios COM X" (universo já filtrado). grupo p/ exibição.
const IND = [
  { ch: "plano_saude", tab: 9466, grupo: "Planos", label: "Plano Municipal de Saúde" },
  { ch: "plano_assist", tab: 9993, grupo: "Planos", label: "Plano Municipal de Assistência Social" },
  { ch: "plano_habitacao", tab: 8433, grupo: "Planos", label: "Plano Municipal de Habitação" },
  { ch: "plano_transporte", tab: 8453, grupo: "Planos", label: "Plano Municipal de Transporte" },
  { ch: "plano_prim_infancia", tab: 10044, grupo: "Planos", label: "Plano Municipal pela Primeira Infância" },
  { ch: "conselho_tutelar", tab: 10037, grupo: "Conselhos", label: "Conselho Tutelar" },
  { ch: "conselho_assist", tab: 9995, grupo: "Conselhos", label: "Conselho Municipal de Assistência Social (ativo)" },
  { ch: "conselho_mulher", tab: 10020, grupo: "Conselhos", label: "Conselho Municipal de Direitos da Mulher" },
];

// metadados: variável "Municípios com X" + classificações da tabela (cada tabela MUNIC tem estrutura própria)
async function metaTabela(tab) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`https://servicodados.ibge.gov.br/api/v3/agregados/${tab}/metadados`, { signal: AbortSignal.timeout(40000) });
      if (!r.ok) throw 0;
      const j = await r.json();
      return { varid: j.variaveis[0].id, classif: (j.classificacoes || []).map((c) => c.id) };
    } catch { await sleep(2000 * (t + 1)); }
  }
  return null;
}
async function municipiosCom(tab) {
  // ROBUSTO: quebra por TODAS as classificações da tabela (c/all) e marca "tem" se o município aparece com
  // valor numérico > 0 em QUALQUER categoria (resolve as tabelas que trazem ".." sem total — ex.: 9466 por ano).
  const meta = await metaTabela(tab);
  if (!meta) return null;
  const cpart = meta.classif.map((c) => `/c${c}/all`).join("");
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`https://apisidra.ibge.gov.br/values/t/${tab}/n6/in%20n3%2042/v/${meta.varid}/p/last${cpart}`, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) { await sleep(3000 * (t + 1)); continue; }
      const j = await r.json();
      return new Set(j.slice(1).filter((x) => { const v = Number(String(x.V).replace(",", ".")); return Number.isFinite(v) && v > 0; }).map((x) => String(x.D1C)));
    } catch { await sleep(2000 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS munic_sc (cod_ibge TEXT, indicador TEXT, grupo TEXT, label TEXT, tem BOOLEAN, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cod_ibge, indicador))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const muns = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' AND uf='SC'`)).rows.map((r) => r.cod_ibge);
  for (const ind of IND) {
    const com = await municipiosCom(ind.tab);
    if (!com) { console.log(`  [falha] ${ind.ch} (t/${ind.tab})`); continue; }
    if (com.size >= 295) console.log(`  ⚠ ${ind.ch}: ${com.size} (tabela pode ser "total e com" — checar)`);
    let n = 0;
    for (const cod of muns) {
      await q(`INSERT INTO munic_sc (cod_ibge,indicador,grupo,label,tem) VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (cod_ibge,indicador) DO UPDATE SET grupo=EXCLUDED.grupo,label=EXCLUDED.label,tem=EXCLUDED.tem,atualizado=now()`,
        [cod, ind.ch, ind.grupo, ind.label, com.has(cod)]);
      if (com.has(cod)) n++;
    }
    console.log(`  ${ind.ch.padEnd(20)} ${ind.label} → ${n}/${muns.length} municípios têm`);
    await sleep(400);
  }
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
