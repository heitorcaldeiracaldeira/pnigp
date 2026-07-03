// ETL — Emendas parlamentares por município SC: INDICAÇÃO (SICONV/Transferegov, repositório público detru). Quem
// destinou e quanto: parlamentar, impositivo, valor (+ execução do convênio quando há). Join: emenda.BENEFICIARIO(CNPJ)
// →proponente SC; emenda.ID_PROPOSTA→convenio. Tabela emendas_indicacao_sc (a execução orçamentária federal vem do
// coletor Portal em emendas_execucao_sc — tabelas SEPARADAS, sem clobber). Idempotente. node scripts/ingest_emendas_siconv_sc.mjs
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const BASE = "https://repositorio.dados.gov.br/seges/detru";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const dig = (s) => String(s || "").replace(/\D/g, "");
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
const vlr = (s) => { s = String(s || "").trim(); if (!s) return 0; if (/,\d{1,2}$/.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0; return parseFloat(s.replace(/,/g, "")) || 0; };

async function baixarCsv(arq, enc = "utf8") {
  const r = await fetch(`${BASE}/${arq}`, { signal: AbortSignal.timeout(240000) });
  const buf = Buffer.from(await r.arrayBuffer());
  // unzip 1ª entrada via DIRETÓRIO CENTRAL (compSize confiável; local header pode ter data descriptor)
  let eo = -1; for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; }
  const cd = buf.readUInt32LE(eo + 16);
  const method = buf.readUInt16LE(cd + 10), compSize = buf.readUInt32LE(cd + 20), lho = buf.readUInt32LE(cd + 42);
  const lN = buf.readUInt16LE(lho + 26), lE = buf.readUInt16LE(lho + 28), ds = lho + 30 + lN + lE;
  const comp = buf.subarray(ds, ds + compSize);
  return (method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp)).toString(enc); // arquivos SICONV são UTF-8
}
function parse(csv) { const linhas = csv.split(/\r?\n/); const head = linhas[0].replace(/^﻿/, "").split(";").map((h) => h.replace(/^"|"$/g, "").trim()); return { head, linhas }; }
const ix = (head, ...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  // Tabela própria de INDICAÇÃO — sem DROP (não destrói a execução do coletor Portal). UPSERT idempotente.
  await db.query(`CREATE TABLE IF NOT EXISTS emendas_indicacao_sc (
    id_proposta TEXT, nr_emenda TEXT, cod_ibge TEXT, municipio TEXT, parlamentar TEXT, tipo_parlamentar TEXT, impositivo BOOLEAN,
    programa TEXT, situacao TEXT, ano INTEGER, valor_emenda NUMERIC, vl_global NUMERIC, vl_repasse NUMERIC, empenhado NUMERIC, desembolsado NUMERIC,
    PRIMARY KEY (id_proposta, nr_emenda))`);
  for (const col of ["cod_programa TEXT", "orgao TEXT", "modalidade TEXT", "acao_orcamentaria TEXT"])
    await db.query(`ALTER TABLE emendas_indicacao_sc ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
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
  const cel = (c, i) => (i >= 0 ? (c[i] || "").replace(/^"|"$/g, "").trim() : "");
  // 1ª passada: coleta emendas com beneficiário em SC + junta os códigos de programa a resolver
  const scEmendas = []; const codsNeeded = new Set();
  for (let i = 1; i < em.linhas.length; i++) {
    if (!em.linhas[i]) continue; const c = em.linhas[i].split(";");
    const sc = cnpjSC.get(dig(c[eBen])); if (!sc) continue;
    const cod = cel(c, eProg);
    scEmendas.push({ idp: dig(c[eProp]), nr: cel(c, eNr) || "—", cod, cod_ibge: sc.cod, municipio: sc.municipio, parlamentar: cel(c, ePar), tipo: cel(c, eTipo), impositivo: /SIM/i.test(c[eImp] || ""), valor: vlr(c[eVal]) });
    if (cod) codsNeeded.add(cod);
  }
  console.log(`emendas SC: ${scEmendas.length} · códigos de programa a resolver: ${codsNeeded.size}`);

  // resolve COD_PROGRAMA -> nome/órgão/modalidade/ação (siconv_programa; só os códigos usados)
  console.log("baixando programas (resolver código→nome)…");
  const pg2 = parse(await baixarCsv("siconv_programa.csv.zip"));
  const gCod = ix(pg2.head, "COD_PROGRAMA"), gNome = ix(pg2.head, "NOME_PROGRAMA"), gOrg = ix(pg2.head, "DESC_ORGAO_SUP_PROGRAMA"), gMod = ix(pg2.head, "MODALIDADE_PROGRAMA"), gAcao = ix(pg2.head, "ACAO_ORCAMENTARIA"), gSit = ix(pg2.head, "SIT_PROGRAMA");
  const progMap = new Map();
  for (let i = 1; i < pg2.linhas.length; i++) {
    if (!pg2.linhas[i]) continue; const c = pg2.linhas[i].split(";"); const cod = cel(c, gCod);
    if (!cod || progMap.has(cod) || !codsNeeded.has(cod)) continue;
    progMap.set(cod, { nome: cel(c, gNome), orgao: cel(c, gOrg), mod: cel(c, gMod), acao: cel(c, gAcao), sit: cel(c, gSit) });
  }
  console.log(`programas resolvidos: ${progMap.size}/${codsNeeded.size}`);

  // 2ª passada: insere já com programa legível, ano (embutido no código), órgão, modalidade e situação com fallback
  let n = 0;
  for (const e of scEmendas) {
    const conv = convByProp.get(e.idp) || {}; const p = progMap.get(e.cod) || {};
    const anoCod = /^\d{9,}/.test(e.cod) ? parseInt(e.cod.slice(5, 9), 10) : NaN; // ÓRGÃO(5)+ANO(4)+SEQ(4)
    const ano = conv.ano || (anoCod >= 2000 && anoCod <= 2035 ? anoCod : null);
    const situacao = conv.sit || (p.nome ? "Indicada (sem convênio formalizado)" : null);
    await q(`INSERT INTO emendas_indicacao_sc (id_proposta,nr_emenda,cod_ibge,municipio,parlamentar,tipo_parlamentar,impositivo,programa,situacao,ano,valor_emenda,vl_global,vl_repasse,empenhado,desembolsado,cod_programa,orgao,modalidade,acao_orcamentaria)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             ON CONFLICT (id_proposta,nr_emenda) DO UPDATE SET empenhado=EXCLUDED.empenhado, desembolsado=EXCLUDED.desembolsado, situacao=EXCLUDED.situacao, ano=EXCLUDED.ano, programa=EXCLUDED.programa, cod_programa=EXCLUDED.cod_programa, orgao=EXCLUDED.orgao, modalidade=EXCLUDED.modalidade, acao_orcamentaria=EXCLUDED.acao_orcamentaria`,
      [e.idp, e.nr, e.cod_ibge, e.municipio, e.parlamentar, e.tipo, e.impositivo, p.nome || null, situacao, ano, e.valor, conv.glob || 0, conv.rep || 0, conv.emp || 0, conv.des || 0, e.cod || null, p.orgao || null, p.mod || null, p.acao || null]);
    n++;
  }
  const r = await db.query(`SELECT count(*) n, count(distinct cod_ibge) entes, count(*) FILTER(WHERE programa IS NOT NULL) com_prog, count(*) FILTER(WHERE ano IS NOT NULL) com_ano, round(sum(valor_emenda)/1e6) emenda_mi FROM emendas_indicacao_sc`);
  console.log(`Emendas SICONV (indicação) SC concluído: ${n} gravadas · ${JSON.stringify(r.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
