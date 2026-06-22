// ETL — Radar de Captação (Transferegov/SICONV): PROGRAMAS que cada município pode captar (elegibilidade) +
// janela de proposta aberta. Fonte: repositorio.dados.gov.br/seges/detru (CSV ;). Programa→Proponente→Município.
// node scripts/ingest_radar_captacao_sc.mjs
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const BASE = "https://repositorio.dados.gov.br/seges/detru";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => String(s || "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

function unzipFirst(buf) {
  // extrai a 1ª entrada do zip (central directory + inflateRaw)
  let eo = -1; for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; }
  const cdOff = buf.readUInt32LE(eo + 16); const p = cdOff;
  const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20);
  const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30);
  const lho = buf.readUInt32LE(p + 42);
  const lN = buf.readUInt16LE(lho + 26), lE = buf.readUInt16LE(lho + 28);
  const ds = lho + 30 + lN + lE; const comp = buf.subarray(ds, ds + compSize);
  return (method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp)).toString("utf8");
}
async function baixar(nome) {
  for (let t = 0; t < 4; t++) { try { const r = await fetch(`${BASE}/${nome}.csv.zip`, { signal: AbortSignal.timeout(120000) }); if (!r.ok) throw 0; return unzipFirst(Buffer.from(await r.arrayBuffer())); } catch { await sleep(2000 * (t + 1)); } }
  throw new Error("download falhou: " + nome);
}
function parseCsv(txt) {
  const linhas = txt.split(/\r?\n/).filter((l) => l.length); const head = linhas[0].replace(/^﻿/, "").split(";");
  return { head, linhas, idx: (c) => head.indexOf(c) };
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS radar_captacao_sc (cod_ibge TEXT, id_programa TEXT, nome_programa TEXT, orgao TEXT, modalidade TEXT, dt_ini_prop DATE, dt_fim_prop DATE, situacao TEXT, PRIMARY KEY (cod_ibge, id_programa))`);
  // catálogo de programas (todos os relevantes a municípios/SC) — base do "poderá acessar" (abertos) e "poderia ter acessado" (encerrados)
  await db.query(`CREATE TABLE IF NOT EXISTS programas_catalogo (id_programa TEXT PRIMARY KEY, nome_programa TEXT, orgao TEXT, modalidade TEXT, natureza TEXT, uf TEXT, ano INTEGER, dt_ini_prop DATE, dt_fim_prop DATE, situacao TEXT)`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };

  // mapa nome do município -> cod_ibge (SC)
  const entes = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const nomeToCod = new Map(entes.map((e) => [norm(e.nome), e.cod_ibge]));

  console.log("Baixando proponentes…");
  const prop = parseCsv(await baixar("siconv_proponentes"));
  const iUf = prop.idx("UF_PROPONENTE"), iMun = prop.idx("MUNICIPIO_PROPONENTE"), iId = prop.idx("ID_PROPONENTE"), iNm = prop.idx("NM_PROPONENTE");
  // proponentes públicos de SC (prefeitura/município/fundo/câmara) -> cod_ibge
  const propToCod = new Map();
  for (let i = 1; i < prop.linhas.length; i++) {
    const c = prop.linhas[i].split(";"); if (c[iUf] !== UF) continue;
    const nm = norm(c[iNm]); if (!/PREFEITURA|MUNICIPIO|FUNDO MUNICIPAL|CAMARA MUNICIPAL|GOVERNO DO ESTADO|SECRETARIA (MUNICIPAL|DE ESTADO)/.test(nm)) continue;
    const cod = nomeToCod.get(norm(c[iMun])); if (cod) propToCod.set(c[iId], cod);
  }
  console.log(`proponentes públicos SC mapeados: ${propToCod.size}`);

  console.log("Baixando programa_proponentes (elegibilidade)…");
  const pp = parseCsv(await baixar("siconv_programa_proponentes"));
  const ppIdProg = pp.idx("ID_PROGRAMA"), ppIdProp = pp.idx("ID_PROPONENTE");
  const elig = new Map(); // id_programa -> Set(cod_ibge)
  const progNeeded = new Set();
  for (let i = 1; i < pp.linhas.length; i++) {
    const c = pp.linhas[i].split(";"); const cod = propToCod.get(c[ppIdProp]); if (!cod) continue;
    const prog = c[ppIdProg]; if (!elig.has(prog)) elig.set(prog, new Set()); elig.get(prog).add(cod); progNeeded.add(prog);
  }
  console.log(`programas elegíveis (distintos) p/ SC: ${progNeeded.size}`);

  console.log("Baixando programa (detalhe + janela)…");
  const pg2 = parseCsv(await baixar("siconv_programa"));
  const gi = (c) => pg2.idx(c);
  const cId = gi("ID_PROGRAMA"), cNome = gi("NOME_PROGRAMA"), cOrg = gi("DESC_ORGAO_SUP_PROGRAMA"), cMod = gi("MODALIDADE_PROGRAMA"), cSit = gi("SIT_PROGRAMA"), cIni = gi("DT_PROG_INI_RECEB_PROP"), cFim = gi("DT_PROG_FIM_RECEB_PROP"), cNat = gi("NATUREZA_JURIDICA_PROGRAMA"), cUf = gi("UF_PROGRAMA"), cAno = gi("ANO_DISPONIBILIZACAO");
  const dataBR = (s) => { const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
  let grav = 0, cat = 0;
  for (let i = 1; i < pg2.linhas.length; i++) {
    const c = pg2.linhas[i].split(";"); const id = c[cId]; if (!id) continue;
    const nome = c[cNome], org = c[cOrg], mod = c[cMod], sit = c[cSit], ini = dataBR(c[cIni]), fim = dataBR(c[cFim]);
    const nat = c[cNat] || "", uf = (c[cUf] || "").trim(), ano = parseInt(c[cAno], 10) || null;
    // CATÁLOGO: programas relevantes a municípios de SC (UF = SC ou nacional/branco) e natureza que inclui municípios/administração
    const relevanteMunicipio = /munic|administra|estado|distrito|consorci/i.test(nat) || nat === "";
    if (relevanteMunicipio && (uf === UF || uf === "" || uf === "NA")) {
      await q(`INSERT INTO programas_catalogo (id_programa,nome_programa,orgao,modalidade,natureza,uf,ano,dt_ini_prop,dt_fim_prop,situacao)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id_programa) DO UPDATE SET nome_programa=EXCLUDED.nome_programa, orgao=EXCLUDED.orgao, modalidade=EXCLUDED.modalidade, natureza=EXCLUDED.natureza, uf=EXCLUDED.uf, ano=EXCLUDED.ano, dt_ini_prop=EXCLUDED.dt_ini_prop, dt_fim_prop=EXCLUDED.dt_fim_prop, situacao=EXCLUDED.situacao`,
        [id, nome, org, mod, nat, uf, ano, ini, fim, sit]);
      cat++;
    }
    // ELEGIBILIDADE explícita (proponente restrito)
    const cods = progNeeded.has(id) ? elig.get(id) : null;
    if (cods) for (const cod of cods) {
      await q(`INSERT INTO radar_captacao_sc (cod_ibge,id_programa,nome_programa,orgao,modalidade,dt_ini_prop,dt_fim_prop,situacao)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (cod_ibge,id_programa) DO UPDATE SET nome_programa=EXCLUDED.nome_programa, orgao=EXCLUDED.orgao, modalidade=EXCLUDED.modalidade, dt_ini_prop=EXCLUDED.dt_ini_prop, dt_fim_prop=EXCLUDED.dt_fim_prop, situacao=EXCLUDED.situacao`,
        [cod, id, nome, org, mod, ini, fim, sit]);
      grav++;
    }
  }
  const r = await db.query(`SELECT count(*) n, count(*) FILTER (WHERE dt_fim_prop >= CURRENT_DATE) abertos, count(*) FILTER (WHERE dt_fim_prop < CURRENT_DATE) encerrados FROM programas_catalogo`);
  console.log(`Catálogo: ${cat} programas · ${JSON.stringify(r.rows[0])} · elegibilidade restrita: ${grav}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
