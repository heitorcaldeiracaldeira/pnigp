// ETL — Emendas parlamentares por município SC (SICONV/Transferegov, repositório público detru). Emenda → convênio:
// parlamentar, impositivo, valor + execução (empenhado/desembolsado). Join: emenda.BENEFICIARIO(CNPJ)→proponente SC;
// emenda.ID_PROPOSTA→convenio. Idempotente. node scripts/ingest_emendas_siconv_sc.mjs
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const BASE = "https://repositorio.dados.gov.br/seges/detru";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const dig = (s) => String(s || "").replace(/\D/g, "");
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
const vlr = (s) => { s = String(s || "").trim(); if (!s) return 0; if (/,\d{1,2}$/.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0; return parseFloat(s.replace(/,/g, "")) || 0; };

async function baixarCsv(arq) {
  const r = await fetch(`${BASE}/${arq}`, { signal: AbortSignal.timeout(240000) });
  const buf = Buffer.from(await r.arrayBuffer());
  // unzip 1ª entrada via DIRETÓRIO CENTRAL (compSize confiável; local header pode ter data descriptor)
  let eo = -1; for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; }
  const cd = buf.readUInt32LE(eo + 16);
  const method = buf.readUInt16LE(cd + 10), compSize = buf.readUInt32LE(cd + 20), lho = buf.readUInt32LE(cd + 42);
  const lN = buf.readUInt16LE(lho + 26), lE = buf.readUInt16LE(lho + 28), ds = lho + 30 + lN + lE;
  const comp = buf.subarray(ds, ds + compSize);
  return (method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp)).toString("latin1");
}
function parse(csv) { const linhas = csv.split(/\r?\n/); const head = linhas[0].replace(/^﻿/, "").split(";").map((h) => h.replace(/^"|"$/g, "").trim()); return { head, linhas }; }
const ix = (head, ...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`DROP TABLE IF EXISTS emendas_sc`); // schema antigo (coletor Portal) → recria no novo formato SICONV
  await db.query(`CREATE TABLE IF NOT EXISTS emendas_sc (
    id_proposta TEXT, nr_emenda TEXT, cod_ibge TEXT, municipio TEXT, parlamentar TEXT, tipo_parlamentar TEXT, impositivo BOOLEAN,
    programa TEXT, situacao TEXT, ano INTEGER, valor_emenda NUMERIC, vl_global NUMERIC, vl_repasse NUMERIC, empenhado NUMERIC, desembolsado NUMERIC,
    PRIMARY KEY (id_proposta, nr_emenda))`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };

  // mapa nome-município SC → cod_ibge
  const muns = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const mapMun = new Map(muns.map((m) => [norm(m.nome), m.cod_ibge]));

  console.log("baixando proponentes…");
  const pr = parse(await baixarCsv("siconv_proponentes.csv.zip"));
  const pCnpj = ix(pr.head, "IDENTIF_PROPONENTE"), pUf = ix(pr.head, "UF_PROPONENTE"), pMun = ix(pr.head, "MUNICIPIO_PROPONENTE");
  const cnpjSC = new Map(); // CNPJ → {cod_ibge, municipio}
  for (let i = 1; i < pr.linhas.length; i++) { if (!pr.linhas[i]) continue; const c = pr.linhas[i].split(";"); if ((c[pUf] || "").replace(/"/g, "").trim() !== "SC") continue; const cnpj = dig(c[pCnpj]); const mun = (c[pMun] || "").replace(/"/g, "").trim(); cnpjSC.set(cnpj, { cod: mapMun.get(norm(mun)) || null, municipio: mun }); }
  console.log(`proponentes SC: ${cnpjSC.size}`);

  console.log("baixando convênios…");
  const cv = parse(await baixarCsv("siconv_convenio.csv.zip"));
  const cProp = ix(cv.head, "ID_PROPOSTA"), cAno = ix(cv.head, "ANO"), cSit = ix(cv.head, "SIT_CONVENIO"), cGlob = ix(cv.head, "VL_GLOBAL_CONV"), cRep = ix(cv.head, "VL_REPASSE_CONV"), cEmp = ix(cv.head, "VL_EMPENHADO_CONV"), cDes = ix(cv.head, "VL_DESEMBOLSADO_CONV");
  const convByProp = new Map();
  for (let i = 1; i < cv.linhas.length; i++) { if (!cv.linhas[i]) continue; const c = cv.linhas[i].split(";"); const idp = dig(c[cProp]); if (!idp) continue; convByProp.set(idp, { ano: parseInt(c[cAno], 10) || null, sit: (c[cSit] || "").replace(/"/g, "").trim(), glob: vlr(c[cGlob]), rep: vlr(c[cRep]), emp: vlr(c[cEmp]), des: vlr(c[cDes]) }); }
  console.log(`convênios indexados: ${convByProp.size}`);

  console.log("baixando emendas…");
  const em = parse(await baixarCsv("siconv_emenda.csv.zip"));
  const eProp = ix(em.head, "ID_PROPOSTA"), eProg = ix(em.head, "COD_PROGRAMA_EMENDA"), eNr = ix(em.head, "NR_EMENDA"), ePar = ix(em.head, "NOME_PARLAMENTAR"), eBen = ix(em.head, "BENEFICIARIO_EMENDA"), eImp = ix(em.head, "IND_IMPOSITIVO"), eTipo = ix(em.head, "TIPO_PARLAMENTAR"), eVal = ix(em.head, "VALOR_REPASSE_EMENDA");
  let n = 0;
  for (let i = 1; i < em.linhas.length; i++) {
    if (!em.linhas[i]) continue; const c = em.linhas[i].split(";");
    const benef = dig(c[eBen]); const sc = cnpjSC.get(benef); if (!sc) continue; // só beneficiário em SC
    const idp = dig(c[eProp]); const conv = convByProp.get(idp) || {};
    await q(`INSERT INTO emendas_sc (id_proposta,nr_emenda,cod_ibge,municipio,parlamentar,tipo_parlamentar,impositivo,programa,situacao,ano,valor_emenda,vl_global,vl_repasse,empenhado,desembolsado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (id_proposta,nr_emenda) DO UPDATE SET empenhado=EXCLUDED.empenhado, desembolsado=EXCLUDED.desembolsado, situacao=EXCLUDED.situacao`,
      [idp, (c[eNr] || "").replace(/"/g, "").trim() || "—", sc.cod, sc.municipio, (c[ePar] || "").replace(/"/g, "").trim(), (c[eTipo] || "").replace(/"/g, "").trim(), /SIM/i.test(c[eImp] || ""), (c[eProg] || "").replace(/"/g, "").trim() || null, conv.sit || null, conv.ano || null, vlr(c[eVal]), conv.glob || 0, conv.rep || 0, conv.emp || 0, conv.des || 0]);
    n++;
  }
  const r = await db.query(`SELECT count(*) n, count(distinct cod_ibge) entes, round(sum(valor_emenda)/1e6) emenda_mi, round(sum(desembolsado)/1e6) pago_mi FROM emendas_sc`);
  console.log(`Emendas SICONV SC concluído: ${n} gravadas · ${JSON.stringify(r.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
