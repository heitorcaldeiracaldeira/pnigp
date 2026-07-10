// SAEB — proficiência em Língua Portuguesa e Matemática (escala SAEB) por município/etapa/rede, série 2005-2023.
// Fonte: mesmos arquivos do IDEB (download.inep.gov.br/ideb/resultados), colunas VL_NOTA_PORTUGUES/MATEMATICA. State-agnostic.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs"; import os from "os"; import path from "path"; import zlib from "zlib"; import { execFileSync } from "child_process"; import pg from "pg";
const UF = process.env.UF || "SC"; const UFC = { SC: "42", SP: "35", BA: "29" }[UF] || "42";
const SCR = "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad";
const BASE = "https://download.inep.gov.br/ideb/resultados";
const FILES = [{ etapa: "AI", f: "divulgacao_anos_iniciais_municipios_2023" }, { etapa: "AF", f: "divulgacao_anos_finais_municipios_2023" }, { etapa: "EM", f: "divulgacao_ensino_medio_municipios_2023" }];
function unzipEntry(buf, nameRe) { let eo = -1; for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; } } let cdOff = buf.readUInt32LE(eo + 16); const cdCount = buf.readUInt16LE(eo + 10); let p = cdOff; for (let n = 0; n < cdCount; n++) { if (buf.readUInt32LE(p) !== 0x02014b50) break; const method = buf.readUInt16LE(p + 10); const compSize = buf.readUInt32LE(p + 20); const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commLen = buf.readUInt16LE(p + 32); const lho = buf.readUInt32LE(p + 42); const name = buf.toString("utf8", p + 46, p + 46 + nameLen); if (nameRe.test(name)) { const lNameLen = buf.readUInt16LE(lho + 26), lExtraLen = buf.readUInt16LE(lho + 28); const dataStart = lho + 30 + lNameLen + lExtraLen; const comp = buf.subarray(dataStart, dataStart + compSize); return method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp); } p += 46 + nameLen + extraLen + commLen; } throw new Error("entry"); }
function parseXlsx(x, s = 1) { const ss = unzipEntry(x, /xl\/sharedStrings\.xml$/).toString("utf8"); const st = []; for (const si of ss.split("<si>").slice(1)) st.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")); const sh = unzipEntry(x, new RegExp(`xl\\/worksheets\\/sheet${s}\\.xml$`)).toString("utf8"); const rows = []; for (const rs of sh.split("<row").slice(1)) { const c = {}; for (const m of rs.matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="(\w+)")?[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([\s\S]*?)<\/t><\/is>)?/g)) c[m[1]] = m[4] != null ? m[4] : m[3] == null ? "" : (m[2] === "s" ? st[+m[3]] : m[3]); rows.push(c); } return rows; }
const nOk = (v) => v != null && v !== "" && v !== "-" && !isNaN(+v);
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
await db.query(`CREATE TABLE IF NOT EXISTS saeb_sc (cod_ibge TEXT, ano INTEGER, etapa TEXT, rede TEXT, matematica NUMERIC, portugues NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano, etapa, rede))`);
await db.query("DELETE FROM saeb_sc WHERE cod_ibge LIKE $1", [UFC + "%"]);
let total = 0;
for (const { etapa, f } of FILES) {
  const zip = path.join(SCR, `saeb_${f}.zip`);
  if (!fs.existsSync(zip) || fs.statSync(zip).size < 100000) { try { execFileSync("curl", ["-sk", "-L", "--retry", "5", "--retry-all-errors", "--max-time", "200", "-A", "Mozilla/5.0", "-o", zip, `${BASE}/${f}.zip`], { stdio: "ignore" }); } catch { console.log(`${etapa}: download falhou`); continue; } }
  if (!fs.existsSync(zip) || fs.statSync(zip).size < 100000) { console.log(`${etapa}: zip vazio`); continue; }
  const rows = parseXlsx(unzipEntry(fs.readFileSync(zip), /\.xlsx$/));
  const hr = rows.find((r) => Object.values(r).some((v) => v === "CO_MUNICIPIO")); if (!hr) { console.log(`${etapa}: sem header`); continue; }
  const cm = {}; for (const [col, v] of Object.entries(hr)) cm[v] = col;
  const anos = Object.keys(cm).filter((k) => /^VL_NOTA_MEDIA_\d{4}$/.test(k)).map((k) => +k.slice(-4));
  const cel = (r, name) => (cm[name] ? r[cm[name]] : undefined);
  let n = 0;
  for (const r of rows) { const co = cel(r, "CO_MUNICIPIO"); const rede = cel(r, "REDE"); if (!co || !String(co).startsWith(UFC) || !rede) continue;
    for (const ano of anos) { const mat = cel(r, `VL_NOTA_MATEMATICA_${ano}`), port = cel(r, `VL_NOTA_PORTUGUES_${ano}`); if (!nOk(mat) && !nOk(port)) continue;
      await db.query("INSERT INTO saeb_sc (cod_ibge,ano,etapa,rede,matematica,portugues) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (cod_ibge,ano,etapa,rede) DO UPDATE SET matematica=EXCLUDED.matematica,portugues=EXCLUDED.portugues,atualizado=now()", [String(co), ano, etapa, String(rede), nOk(mat) ? +mat : null, nOk(port) ? +port : null]); n++; } }
  total += n; console.log(`✔ ${etapa}: ${n} registros (${anos.length} anos)`);
}
const c = (await db.query("SELECT count(DISTINCT cod_ibge) m, count(*) l, max(ano) a FROM saeb_sc")).rows[0];
console.log(`✔ saeb_sc: ${c.m} municípios · ${c.l} linhas · até ${c.a}`);
await db.end();
