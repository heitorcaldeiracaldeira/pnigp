// ETL — RFB Arrecadação por município. Fonte: Receita Federal (dados abertos, XLSX por ano). Abas GPS (previdenciária), DARF (demais), TOTAL.
// Total arrecadado + previdenciária por município/ano. Casa por NOME (o xlsx não traz IBGE). node scripts/ingest_rfb_arrecadacao_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ANOS = (process.env.ANOS || "2019,2020,2021,2022,2023,2024,2025").split(",").map(Number);
const B = "https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/dados-abertos/receitadata/arrecadacao/copy_of_arrecadacao-das-receitas-administradas-pela-rfb-por-municipio/arrecadacao-das-receitas-administradas-pela-rfb";
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();

async function run() {
  const XLSX = (await import("xlsx")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const M = new Map(); // cod -> Map(ano -> {total, prev})
  // lê uma aba (município na col0, UF col1, valor col2) → Map(cod->valor)
  const readSheet = (ws) => { const out = new Map(); if (!ws) return out; const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }); for (const r of rows) { if (String(r[1] || "").trim().toUpperCase() !== UF) continue; const cod = byName.get(norm(r[0])); const v = Number(r[2]); if (cod && Number.isFinite(v)) out.set(cod, (out.get(cod) || 0) + v); } return out; };

  const carregados = [];   // anos que REALMENTE vieram — ver carga_fatiada.mjs
  for (const ano of ANOS) {
    const xp = path.join(dir, `rfb_${ano}.xlsx`);
    if (!fs.existsSync(xp) || fs.statSync(xp).size < 5e4) { try { execFileSync("curl", ["-s", "-L", "--max-time", "90", "-A", "Mozilla/5.0", "-o", xp, `${B}/arrecadacao-da-receita-administrada-pela-rfb-por-municipio-${ano}.xlsx`], { stdio: "ignore" }); } catch (e) {} }
    if (!fs.existsSync(xp) || fs.statSync(xp).size < 5e4) { console.log(`  ⚠ ${ano}: sem arquivo`); continue; }
    let wb; try { wb = XLSX.readFile(xp); } catch (e) { console.log(`  ⚠ ${ano}: xlsx inválido`); continue; }
    const total = readSheet(wb.Sheets["TOTAL"] || wb.Sheets[wb.SheetNames[2]]);
    const prev = readSheet(wb.Sheets["GPS"] || wb.Sheets[wb.SheetNames[0]]);
    for (const [cod, v] of total) { if (!M.has(cod)) M.set(cod, new Map()); M.get(cod).set(ano, { total: v, prev: prev.get(cod) || 0 }); }
    carregados.push(ano);
    console.log(`  ✓ ${ano}: ${total.size} municípios ${UF}`);
  }

  await db.query(`CREATE TABLE IF NOT EXISTS rfb_arrecadacao_sc (cod_ibge TEXT, ano INTEGER, total NUMERIC, previdenciaria NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  // ⚠️ Era TRUNCATE + insert do que veio: um ano falho levava junto os anos já corretos.
  const { substituiFatias, relata } = await import("./carga_fatiada.mjs");
  const L = [];
  for (const [cod, anos] of M) for (const [ano, v] of anos) L.push([cod, ano, Math.round(v.total), Math.round(v.prev)]);
  const up = await substituiFatias(db, { tabela: "rfb_arrecadacao_sc", fatiaCols: ["ano"],
    fatias: carregados.map((a) => [a]), colunas: ["cod_ibge", "ano", "total", "previdenciaria"],
    tipos: ["text", "int", "numeric", "numeric"], linhas: L });
  relata("rfb_arrecadacao_sc", carregados, ANOS);
  const chk = (await db.query(`SELECT count(distinct cod_ibge) m, max(ano) ma, round(sum(total) FILTER (WHERE ano=(SELECT max(ano) FROM rfb_arrecadacao_sc))/1e9,2) bi FROM rfb_arrecadacao_sc`)).rows[0];
  console.log(`✔ rfb_arrecadacao_sc: ${chk.m} municípios · ${up} linhas · ${chk.ma}: R$ ${chk.bi} bi arrecadados em ${UF}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
