// ETL — Convênios/Contratos de Repasse por município SC (SICONV/Transferegov, repositório detru). Lê os CSVs já extraídos
// em $CLAUDE_JOB_DIR/tmp via readline (streaming, sem OOM). proposta(714MB)→ID_PROPOSTA SC; convenio→valores/execução.
// node scripts/ingest_convenios_siconv_sc.mjs
import fs from "fs"; import path from "path"; import readline from "readline"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const TMP = process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, "tmp") : ".";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const vlr = (s) => { s = String(s || "").trim(); if (!s) return 0; if (/,\d{1,2}$/.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0; return parseFloat(s.replace(/,/g, "")) || 0; };
const ix = (head, ...n) => { for (const x of n) { const i = head.indexOf(x); if (i >= 0) return i; } return -1; };

async function header(file) { const rl = readline.createInterface({ input: fs.createReadStream(file, "latin1") }); for await (const l of rl) { rl.close(); return l.replace(/^﻿/, "").split(";").map((h) => h.replace(/^"|"$/g, "").trim()); } return []; }

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS convenios_sc (
    nr_convenio TEXT PRIMARY KEY, id_proposta TEXT, cod_ibge TEXT, municipio TEXT, ano INTEGER, situacao TEXT,
    vl_global NUMERIC, vl_repasse NUMERIC, vl_empenhado NUMERIC, vl_desembolsado NUMERIC)`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };
  // mapa cod_ibge6 → cod_ibge7 (entes SC)
  const ibge = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((r) => [String(r.cod_ibge).slice(0, 6), r.cod_ibge]));

  const fProp = path.join(TMP, "siconv_proposta.csv"), fConv = path.join(TMP, "siconv_convenio.csv");
  if (!fs.existsSync(fProp) || !fs.existsSync(fConv)) { console.error("CSVs não encontrados em " + TMP); process.exit(1); }

  // 1) proposta SC → ID_PROPOSTA → {cod_ibge, municipio}
  const ph = await header(fProp); const pId = ix(ph, "ID_PROPOSTA"), pUf = ix(ph, "UF_PROPONENTE"), pMun = ix(ph, "MUNIC_PROPONENTE"), pIbge = ix(ph, "COD_MUNIC_IBGE");
  const propSC = new Map(); let pl = 0;
  { const rl = readline.createInterface({ input: fs.createReadStream(fProp, "latin1") }); let first = true;
    for await (const line of rl) { if (first) { first = false; continue; } if (!line) continue; const c = line.split(";"); if ((c[pUf] || "").replace(/"/g, "").trim() !== "SC") continue;
      const cod = ibge.get(String(c[pIbge] || "").replace(/\D/g, "").slice(0, 6)) || null;
      propSC.set((c[pId] || "").replace(/"/g, "").trim(), { cod, mun: (c[pMun] || "").replace(/"/g, "").trim() }); pl++; } }
  console.log(`propostas SC: ${propSC.size}`);

  // 2) convenio → filtra ID_PROPOSTA SC → grava
  const ch = await header(fConv); const cId = ix(ch, "ID_PROPOSTA"), cNr = ix(ch, "NR_CONVENIO"), cAno = ix(ch, "ANO"), cSit = ix(ch, "SIT_CONVENIO"), cG = ix(ch, "VL_GLOBAL_CONV"), cR = ix(ch, "VL_REPASSE_CONV"), cE = ix(ch, "VL_EMPENHADO_CONV"), cD = ix(ch, "VL_DESEMBOLSADO_CONV");
  let n = 0; { const rl = readline.createInterface({ input: fs.createReadStream(fConv, "latin1") }); let first = true;
    for await (const line of rl) { if (first) { first = false; continue; } if (!line) continue; const c = line.split(";"); const idp = (c[cId] || "").replace(/"/g, "").trim(); const p = propSC.get(idp); if (!p) continue;
      await q(`INSERT INTO convenios_sc (nr_convenio,id_proposta,cod_ibge,municipio,ano,situacao,vl_global,vl_repasse,vl_empenhado,vl_desembolsado)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (nr_convenio) DO UPDATE SET vl_empenhado=EXCLUDED.vl_empenhado, vl_desembolsado=EXCLUDED.vl_desembolsado, situacao=EXCLUDED.situacao`,
        [(c[cNr] || "").replace(/"/g, "").trim(), idp, p.cod, p.mun, parseInt(c[cAno], 10) || null, (c[cSit] || "").replace(/"/g, "").trim(), vlr(c[cG]), vlr(c[cR]), vlr(c[cE]), vlr(c[cD])]); n++; if (n % 2000 === 0) console.log(`  ${n} convênios SC…`); } }
  const r = await db.query(`SELECT count(*) n, count(distinct cod_ibge) entes, round(sum(vl_repasse)/1e6) repasse_mi, round(sum(vl_desembolsado)/1e6) pago_mi FROM convenios_sc`);
  console.log(`Convênios SC concluído: ${JSON.stringify(r.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
