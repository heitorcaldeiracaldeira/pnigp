// ETL — Infraestrutura esportiva por município (equipamentos, georreferenciados). Fonte: Ministério do Esporte
// (dados abertos, XLSX SharePoint mdsgov). Guarda cada equipamento (nome/tipo/lat/lon) → alimenta mapa + contagem
// por município. State-agnostic (UF env). node scripts/ingest_infra_esporte_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const URL = "https://mdsgov.sharepoint.com/sites/cgti.dadosabertos.mesp/_layouts/15/download.aspx?share=IQCnw6lF_igpSIhVdIQnjNvrAY3fuDaxyGySKUfyxnuP7Dc";
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const coord = (s) => { const x = Number(String(s || "").replace(",", ".")); return Number.isFinite(x) && x !== 0 ? x : null; };

async function run() {
  const XLSX = (await import("xlsx")).default;
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byName = new Map((await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [norm(e.nome), e.cod_ibge]));

  const xl = path.join(os.tmpdir(), "infra_esporte.xlsx");
  if (!fs.existsSync(xl) || fs.statSync(xl).size < 1e4) { try { execFileSync("curl", ["-s", "-L", "--max-time", "120", "-A", "Mozilla/5.0", "-o", xl, URL], { stdio: "ignore" }); } catch (e) {} }
  const wb = XLSX.readFile(xl);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

  await db.query(`CREATE TABLE IF NOT EXISTS equip_esporte_sc (cod_ibge TEXT, nome TEXT, tipo TEXT, entidade TEXT, natureza TEXT, bairro TEXT, latitude NUMERIC, longitude NUMERIC, atualizado TIMESTAMPTZ DEFAULT now())`);
  await db.query(`DELETE FROM equip_esporte_sc`); // tabela derivada — reconstrução idempotente
  let n = 0, geo = 0;
  for (const r of rows) {
    if (String(r["ESTADO"] || "").trim().toUpperCase() !== UF) continue;
    const cod = byName.get(norm(r["CIDADE"])); if (!cod) continue;
    const lat = coord(r["LATITUDE"]), lon = coord(r["LONGITUDE"]);
    await db.query(`INSERT INTO equip_esporte_sc (cod_ibge,nome,tipo,entidade,natureza,bairro,latitude,longitude,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [cod, String(r["NOME DA INFRAESTRUTURA"] || "").slice(0, 200), String(r["TIPO DE INFRAESTUTURA"] || "").slice(0, 120), String(r["ENTIDADE RESPONSAVEL"] || "").slice(0, 160), String(r["TIPO DE PROPRIEDADE"] || "").slice(0, 60), String(r["BAIRRO"] || "").slice(0, 80), lat, lon]);
    n++; if (lat && lon) geo++;
  }
  const chk = (await db.query(`SELECT count(*) l, count(distinct cod_ibge) m FROM equip_esporte_sc`)).rows[0];
  console.log(`✔ equip_esporte_sc: ${chk.l} equipamentos · ${chk.m} municípios · ${geo} geolocalizados`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
