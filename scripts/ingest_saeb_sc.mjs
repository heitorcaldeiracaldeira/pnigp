// SAEB — proficiência em Língua Portuguesa e Matemática (escala SAEB) por município/etapa/rede, série 2005-2023.
// Fonte: mesmos arquivos do IDEB (download.inep.gov.br/ideb/resultados), colunas VL_NOTA_PORTUGUES/MATEMATICA. State-agnostic.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs"; import os from "os"; import path from "path"; import zlib from "zlib"; import { execFileSync } from "child_process"; import pg from "pg";
const UF = process.env.UF || "SC"; const UFC = { SC: "42", SP: "35", BA: "29" }[UF] || "42";
// ⚠️ DOIS DEFEITOS QUE VINHAM JUNTOS, os mesmos do IDEB (o SAEB sai dos MESMOS arquivos):
//   1. `SCR` apontava para o scratchpad de uma sessão antiga (`.../ba9cc77b-.../scratchpad`), que já não
//      existe — o zip era baixado à mão uma vez e o caminho ficou cravado;
//   2. a divulgação estava cravada em 2023, e o SAEB é BIENAL: a cada dois anos o script silenciava,
//      seguiria entregando 2023 sem erro e a tabela envelheceria parecendo saudável.
// Medido em 10/ago: a divulgação 2025 saiu em 05/ago/2026 e já está publicada.
// O diretório passa a ser o TEMP e o nome do zip é o MESMO que o `ingest_ideb_sc` usa — assim as duas
// fontes aproveitam um download só, em vez de puxar 58 MB duas vezes.
const SCR = process.env.DIR || os.tmpdir();
const BASE = "https://download.inep.gov.br/ideb/resultados";
const ehZipRemoto = (url) => {
  // uma sondagem só não prova ausência: um timeout isolado já me fez dar por não publicado um arquivo
  // de 25 MB que existia. Três tentativas antes de descartar o ano.
  for (let t = 0; t < 3; t++) {
    try {
      const b = execFileSync("curl", ["-sL", "--max-time", "25", "-r", "0-1", "-k", "-A", "Mozilla/5.0", url], { maxBuffer: 1 << 16 });
      if (b.length >= 2 && b[0] === 0x50 && b[1] === 0x4b) return true;
    } catch { /* tenta de novo */ }
  }
  return false;
};
function descobreDivulgacao() {
  if (process.env.IDEB_ANO) return String(process.env.IDEB_ANO);
  const topo = new Date().getUTCFullYear();
  for (let a = topo; a >= topo - 5; a--) if (ehZipRemoto(`${BASE}/divulgacao_anos_iniciais_municipios_${a}.zip`)) return String(a);
  throw new Error(`SAEB: nenhuma divulgação encontrada entre ${topo - 5} e ${topo}`);
}
const ANO_DIV = descobreDivulgacao();
console.log(`SAEB — divulgação ${ANO_DIV} (mesmos arquivos do IDEB; traz a série inteira)`);
const FILES = [
  { etapa: "AI", f: `divulgacao_anos_iniciais_municipios_${ANO_DIV}` },
  { etapa: "AF", f: `divulgacao_anos_finais_municipios_${ANO_DIV}` },
  { etapa: "EM", f: `divulgacao_ensino_medio_municipios_${ANO_DIV}` },
];
function unzipEntry(buf, nameRe) { let eo = -1; for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; } } let cdOff = buf.readUInt32LE(eo + 16); const cdCount = buf.readUInt16LE(eo + 10); let p = cdOff; for (let n = 0; n < cdCount; n++) { if (buf.readUInt32LE(p) !== 0x02014b50) break; const method = buf.readUInt16LE(p + 10); const compSize = buf.readUInt32LE(p + 20); const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commLen = buf.readUInt16LE(p + 32); const lho = buf.readUInt32LE(p + 42); const name = buf.toString("utf8", p + 46, p + 46 + nameLen); if (nameRe.test(name)) { const lNameLen = buf.readUInt16LE(lho + 26), lExtraLen = buf.readUInt16LE(lho + 28); const dataStart = lho + 30 + lNameLen + lExtraLen; const comp = buf.subarray(dataStart, dataStart + compSize); return method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp); } p += 46 + nameLen + extraLen + commLen; } throw new Error("entry"); }
function parseXlsx(x, s = 1) { const ss = unzipEntry(x, /xl\/sharedStrings\.xml$/).toString("utf8"); const st = []; for (const si of ss.split("<si>").slice(1)) st.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")); const sh = unzipEntry(x, new RegExp(`xl\\/worksheets\\/sheet${s}\\.xml$`)).toString("utf8"); const rows = []; for (const rs of sh.split("<row").slice(1)) { const c = {}; for (const m of rs.matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="(\w+)")?[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([\s\S]*?)<\/t><\/is>)?/g)) c[m[1]] = m[4] != null ? m[4] : m[3] == null ? "" : (m[2] === "s" ? st[+m[3]] : m[3]); rows.push(c); } return rows; }
const nOk = (v) => v != null && v !== "" && v !== "-" && !isNaN(+v);
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
await db.query(`CREATE TABLE IF NOT EXISTS saeb_sc (cod_ibge TEXT, ano INTEGER, etapa TEXT, rede TEXT, matematica NUMERIC, portugues NUMERIC, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano, etapa, rede))`);
await db.query("DELETE FROM saeb_sc WHERE cod_ibge LIKE $1", [UFC + "%"]);
let total = 0;
for (const { etapa, f } of FILES) {
  // MESMO nome de arquivo que o ingest_ideb usa: um download serve as duas fontes
  const zip = path.join(SCR, `${f}.zip`);
  // `--max-time 200` para 25 MB é aposta na velocidade da origem — com a máquina ocupada, não cabe.
  // `-C -` retoma de onde parou; --speed-limit aborta por ESTAGNAÇÃO, não por o arquivo ser grande.
  const inteiro = () => {
    try {
      const tam = fs.statSync(zip).size; if (tam < 1e5) return false;
      const fd = fs.openSync(zip, "r"); const fim = Buffer.alloc(Math.min(66000, tam));
      fs.readSync(fd, fim, 0, fim.length, Math.max(0, tam - fim.length)); fs.closeSync(fd);
      return fim.includes(Buffer.from("PK\x05\x06"));   // diretório central: tamanho não prova integridade
    } catch { return false; }
  };
  for (let t = 0; t < 3 && !inteiro(); t++) {
    try {
      execFileSync("curl", ["-sS", "--fail", "-L", "-C", "-", "-k", "--max-time", "1800", "--speed-limit", "1024",
        "--speed-time", "60", "--retry", "2", "--retry-all-errors", "-A", "Mozilla/5.0", "-o", zip, `${BASE}/${f}.zip`], { stdio: "ignore" });
    } catch { /* pode ter trazido parte; a próxima tentativa retoma */ }
  }
  if (!inteiro()) { console.log(`${etapa}: zip incompleto ou truncado`); continue; }
  const rows = parseXlsx(unzipEntry(fs.readFileSync(zip), /\.xlsx$/));
  const hr = rows.find((r) => Object.values(r).some((v) => v === "CO_MUNICIPIO")); if (!hr) { console.log(`${etapa}: sem header`); continue; }
  const cm = {}; for (const [col, v] of Object.entries(hr)) cm[v] = col;
  const anos = Object.keys(cm).filter((k) => /^VL_NOTA_MEDIA_\d{4}$/.test(k)).map((k) => +k.slice(-4));
  const cel = (r, name) => (cm[name] ? r[cm[name]] : undefined);
  // era uma ida ao banco por município×ano. Medido no IDEB, que tinha o mesmo desenho: 304 tuplas por
  // minuto, cerca de uma HORA para as três etapas. O custo não é a escrita, é a ida-e-volta. Uma consulta
  // por etapa, por unnest, faz o mesmo em segundos.
  const L = [];
  for (const r of rows) { const co = cel(r, "CO_MUNICIPIO"); const rede = cel(r, "REDE"); if (!co || !String(co).startsWith(UFC) || !rede) continue;
    for (const ano of anos) { const mat = cel(r, `VL_NOTA_MATEMATICA_${ano}`), port = cel(r, `VL_NOTA_PORTUGUES_${ano}`); if (!nOk(mat) && !nOk(port)) continue;
      L.push([String(co), ano, String(rede), nOk(mat) ? +mat : null, nOk(port) ? +port : null]); } }
  if (L.length) {
    await db.query(`INSERT INTO saeb_sc (cod_ibge,ano,etapa,rede,matematica,portugues,atualizado)
      SELECT c, a, $3, rd, mt, pt, now()
      FROM unnest($1::text[], $2::int[], $4::text[], $5::numeric[], $6::numeric[]) AS z(c,a,rd,mt,pt)
      ON CONFLICT (cod_ibge,ano,etapa,rede) DO UPDATE SET matematica=EXCLUDED.matematica,portugues=EXCLUDED.portugues,atualizado=now()`,
      [L.map((x) => x[0]), L.map((x) => x[1]), etapa, L.map((x) => x[2]), L.map((x) => x[3]), L.map((x) => x[4])]);
  }
  const n = L.length;
  total += n; console.log(`✔ ${etapa}: ${n} registros (${anos.length} anos)`);
}
const c = (await db.query("SELECT count(DISTINCT cod_ibge) m, count(*) l, max(ano) a FROM saeb_sc")).rows[0];
console.log(`✔ saeb_sc: ${c.m} municípios · ${c.l} linhas · até ${c.a}`);
await db.end();
