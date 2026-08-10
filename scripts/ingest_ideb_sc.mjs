// ETL — IDEB por município (INEP) — série histórica + observado × meta (projeção) + nota SAEB.
// Fonte oficial: download.inep.gov.br/ideb/resultados/  (XLSX dentro de ZIP). Parser XLSX em node puro.
// node scripts/ingest_ideb_sc.mjs
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url"; import pg from "pg";
import { execFileSync } from "child_process";
// download.inep.gov.br serve cadeia TLS incompleta (UNABLE_TO_VERIFY_LEAF_SIGNATURE) — só download público; desabilita verificação neste processo de coleta.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const UF_PREFIX = { SC: "42", BA: "29", SP: "35" }[UF] || "42";
const BASE = `https://download.inep.gov.br/ideb/resultados`;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

// ═══ A DIVULGAÇÃO NÃO SE PRESUME, SE DESCOBRE ═══
// Estava cravado em "2023". O IDEB é BIENAL, então a cada dois anos o script silenciava: seguiria
// entregando 2023 sem erro nenhum, e a tabela ficaria velha parecendo saudável — exatamente o que o
// guardião de frescor apontou (`ideb_sc 2005–2023`, marcado ENVELHECE).
// Medido em 10/ago: o IDEB 2025 JÁ ESTÁ publicado (anos iniciais 25,3 MB, anos finais 24,4 MB, ensino
// médio 8,5 MB). A divulgação mais recente traz a série inteira, então descobrir a mais nova basta.
//
// ⚠️ UMA SONDAGEM SÓ NÃO PROVA AUSÊNCIA. Na primeira passada o arquivo de anos iniciais de 2025 não
// respondeu e eu quase o dei como não publicado; repetindo, ele veio inteiro. Por isso cada ano é testado
// com mais de uma tentativa antes de ser descartado.
// ═══ 25 MB NÃO CABEM EM `fetch` COM TETO DE 120s ═══
// Era `fetch(url, { signal: AbortSignal.timeout(120000) })` com 4 tentativas: cada estouro jogava fora
// TUDO o que já tinha vindo e recomeçava do zero. Medido em 10/ago: com a máquina ocupada (12 shards do
// reprocessamento), os 25 MB do arquivo de anos iniciais não terminavam dentro do teto e a fonte ficava
// 7 minutos sem sair do lugar — o mesmo desenho que já derrubou escolas, censo, aneel_gd e o INEP hoje.
// `curl -C -` RETOMA de onde parou, e --speed-limit aborta por ESTAGNAÇÃO, não por o arquivo ser grande.
function baixaZip(url, dest) {
  for (let t = 0; t < 3; t++) {
    try {
      execFileSync("curl", ["-sS", "--fail", "-L", "-C", "-", "-k", "--max-time", "1800", "--speed-limit", "1024",
        "--speed-time", "60", "--retry", "2", "--retry-all-errors", "-A", "Mozilla/5.0", "-o", dest, url], { stdio: "ignore" });
    } catch { /* pode ter trazido parte; a próxima tentativa retoma daí */ }
    // um zip inteiro tem o diretório central (EOCD) no fim; tamanho sozinho não prova nada
    try {
      const tam = fs.statSync(dest).size;
      if (tam > 1e5) {
        const fd = fs.openSync(dest, "r");
        const fim = Buffer.alloc(Math.min(66000, tam));
        fs.readSync(fd, fim, 0, fim.length, Math.max(0, tam - fim.length));
        fs.closeSync(fd);
        if (fim.includes(Buffer.from("PK\x05\x06"))) return fs.readFileSync(dest);
      }
    } catch { /* segue para a próxima tentativa */ }
  }
  return null;
}

const ehZipRemoto = (url) => {
  for (let t = 0; t < 3; t++) {
    try {
      const b = execFileSync("curl", ["-sL", "--max-time", "25", "-r", "0-1", "-k", "-A", "Mozilla/5.0", url], { maxBuffer: 1 << 16 });
      if (b.length >= 2 && b[0] === 0x50 && b[1] === 0x4b) return true;
    } catch { /* tenta de novo: timeout de uma requisição não é ausência do arquivo */ }
  }
  return false;
};
function descobreDivulgacao() {
  if (process.env.IDEB_ANO) return String(process.env.IDEB_ANO);
  const topo = new Date().getUTCFullYear();
  for (let a = topo; a >= topo - 5; a--) {
    if (ehZipRemoto(`${BASE}/divulgacao_anos_iniciais_municipios_${a}.zip`)) return String(a);
  }
  throw new Error(`IDEB: nenhuma divulgação encontrada entre ${topo - 5} e ${topo}`);
}
const ANO_DIV = descobreDivulgacao();
console.log(`IDEB — divulgação ${ANO_DIV} (a mais recente publicada; traz a série inteira)`);
const FILES = [
  { etapa: "AI", nome: `divulgacao_anos_iniciais_municipios_${ANO_DIV}` },
  { etapa: "AF", nome: `divulgacao_anos_finais_municipios_${ANO_DIV}` },
  { etapa: "EM", nome: `divulgacao_ensino_medio_municipios_${ANO_DIV}` },
];

// --- unzip mínimo (central directory + inflateRaw) ---
function unzipEntry(buf, nameRe) {
  // acha End of Central Directory
  let eo = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; } }
  if (eo < 0) throw new Error("EOCD não encontrado");
  let cdOff = buf.readUInt32LE(eo + 16); const cdCount = buf.readUInt16LE(eo + 10);
  let p = cdOff;
  for (let n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (nameRe.test(name)) {
      const lNameLen = buf.readUInt16LE(lho + 26), lExtraLen = buf.readUInt16LE(lho + 28);
      const dataStart = lho + 30 + lNameLen + lExtraLen;
      const comp = buf.subarray(dataStart, dataStart + compSize);
      return method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp);
    }
    p += 46 + nameLen + extraLen + commLen;
  }
  throw new Error("entrada não encontrada: " + nameRe);
}

// --- parse XLSX (sharedStrings + uma aba) ---
function parseXlsx(xlsxBuf, sheetN = 1) {
  const ssXml = unzipEntry(xlsxBuf, /xl\/sharedStrings\.xml$/).toString("utf8");
  const strings = [];
  for (const si of ssXml.split("<si>").slice(1)) {
    const ts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]);
    strings.push(ts.join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
  }
  const sheet = unzipEntry(xlsxBuf, new RegExp(`xl\\/worksheets\\/sheet${sheetN}\\.xml$`)).toString("utf8");
  const rows = [];
  for (const rs of sheet.split("<row").slice(1)) {
    const cells = {};
    for (const c of rs.matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="(\w+)")?[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([\s\S]*?)<\/t><\/is>)?/g)) {
      const col = c[1], t = c[2], v = c[3], inl = c[4];
      cells[col] = inl != null ? inl : v == null ? "" : (t === "s" ? strings[+v] : v);
    }
    rows.push(cells);
  }
  return rows;
}

function colMapDe(rows) {
  // acha a linha com os códigos de máquina (contém CO_MUNICIPIO)
  for (const r of rows) { if (Object.values(r).some((v) => v === "CO_MUNICIPIO")) { const m = {}; for (const [col, v] of Object.entries(r)) m[v] = col; return m; } }
  return null;
}
// header por VL_OBSERVADO (arquivo de UFs não tem CO_MUNICIPIO; geo=col A, rede=col B)
function colMapVL(rows) {
  for (const r of rows) { if (Object.values(r).some((v) => /^VL_OBSERVADO_\d{4}$/.test(String(v)))) { const m = {}; for (const [col, v] of Object.entries(r)) m[v] = col; return m; } }
  return null;
}
const UF_NOME = { SC: "Santa Catarina", BA: "Bahia", SP: "São Paulo" };
// IDEB do ESTADO (arquivo regioes_ufs, 3 abas = AI/AF/EM; linha da UF pelo nome na coluna A)
async function coletarEstado(q) {
  const nomeUF = UF_NOME[UF] || "Santa Catarina";
  process.stdout.write(`Baixando regiões/UFs (Estado ${UF}) ... `);
  let outer;
  outer = baixaZip(`${BASE}/divulgacao_regioes_ufs_ideb_${ANO_DIV}.zip`, path.join(process.env.TEMP || "/tmp", `ideb_ufs_${ANO_DIV}.zip`));
  if (!outer) { console.log("falhou"); return 0; }
  const xlsx = unzipEntry(outer, /\.xlsx$/);
  const ABAS = [{ s: 1, etapa: "AI" }, { s: 2, etapa: "AF" }, { s: 3, etapa: "EM" }];
  const numOk = (v) => v != null && v !== "" && v !== "-" && !isNaN(+v);
  let grav = 0;
  for (const ab of ABAS) {
    let rows; try { rows = parseXlsx(xlsx, ab.s); } catch { continue; }
    const cm = colMapVL(rows); if (!cm) continue;
    const anos = Object.keys(cm).filter((k) => /^VL_OBSERVADO_\d{4}$/.test(k)).map((k) => +k.slice(-4));
    const cell = (r, name) => (cm[name] ? r[cm[name]] : undefined);
    for (const r of rows) {
      if (String(r["A"] || "").trim() !== nomeUF) continue; // linha da UF
      const rede = String(r["B"] || "").trim(); if (!rede) continue;
      for (const ano of anos) {
        const ideb = cell(r, `VL_OBSERVADO_${ano}`); if (!numOk(ideb)) continue;
        const meta = cell(r, `VL_PROJECAO_${ano}`); const nota = cell(r, `VL_NOTA_MEDIA_${ano}`);
        await q(`INSERT INTO ideb_sc (cod_ibge,ano,etapa,rede,ideb,meta,nota_saeb) VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (cod_ibge,ano,etapa,rede) DO UPDATE SET ideb=EXCLUDED.ideb, meta=EXCLUDED.meta, nota_saeb=EXCLUDED.nota_saeb`,
          [UF_PREFIX, ano, ab.etapa, rede, +ideb, numOk(meta) ? +meta : null, numOk(nota) ? +nota : null]);
        grav++;
      }
    }
    console.log(`  Estado ${ab.etapa}: ${grav} acum.`);
  }
  return grav;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS ideb_sc (cod_ibge TEXT, ano INTEGER, etapa TEXT, rede TEXT, ideb NUMERIC, meta NUMERIC, nota_saeb NUMERIC, PRIMARY KEY (cod_ibge, ano, etapa, rede))`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  let total = 0;
  const estadoOnly = process.env.IDEB_ESTADO_ONLY === "1";
  for (const f of (estadoOnly ? [] : FILES)) {
    process.stdout.write(`Baixando ${f.nome}.zip ... `);
    let outer;
    outer = baixaZip(`${BASE}/${f.nome}.zip`, path.join(process.env.TEMP || "/tmp", `${f.nome}.zip`));
    if (!outer) { console.log("falhou"); continue; }
    const xlsx = unzipEntry(outer, /\.xlsx$/);
    const rows = parseXlsx(xlsx);
    const cm = colMapDe(rows);
    if (!cm) { console.log("sem header"); continue; }
    const anos = Object.keys(cm).filter((k) => /^VL_OBSERVADO_\d{4}$/.test(k)).map((k) => +k.slice(-4));
    const cell = (r, name) => (cm[name] ? r[cm[name]] : undefined);
    const numOk = (v) => v != null && v !== "" && v !== "-" && !isNaN(+v);
    // ═══ ERA UMA IDA AO BANCO POR MUNICÍPIO×ANO ═══
    // Medido em 10/ago: 304 tuplas por minuto — cerca de UMA HORA para as três etapas, e disputando o
    // banco com o reprocessamento que rodava em paralelo. O banco é o gargalo: o custo não é a escrita,
    // é a ida-e-volta (as conexões ficavam em `ClientRead`, o servidor esperando o cliente mandar a
    // próxima linha). Uma consulta por etapa, por unnest, faz o mesmo trabalho em segundos.
    const L = [];
    for (const r of rows) {
      const co = cell(r, "CO_MUNICIPIO"); const rede = cell(r, "REDE");
      if (!co || !String(co).startsWith(UF_PREFIX) || !rede) continue;
      for (const ano of anos) {
        const ideb = cell(r, `VL_OBSERVADO_${ano}`);
        if (!numOk(ideb)) continue;
        const meta = cell(r, `VL_PROJECAO_${ano}`); const nota = cell(r, `VL_NOTA_MEDIA_${ano}`);
        L.push([String(co), ano, String(rede), +ideb, numOk(meta) ? +meta : null, numOk(nota) ? +nota : null]);
      }
    }
    if (L.length) {
      await q(`INSERT INTO ideb_sc (cod_ibge,ano,etapa,rede,ideb,meta,nota_saeb)
        SELECT c, a, $3, rd, ib, mt, ns
        FROM unnest($1::text[], $2::int[], $4::text[], $5::numeric[], $6::numeric[], $7::numeric[]) AS z(c,a,rd,ib,mt,ns)
        ON CONFLICT (cod_ibge,ano,etapa,rede) DO UPDATE SET ideb=EXCLUDED.ideb, meta=EXCLUDED.meta, nota_saeb=EXCLUDED.nota_saeb`,
        [L.map((x) => x[0]), L.map((x) => x[1]), f.etapa, L.map((x) => x[2]),
         L.map((x) => x[3]), L.map((x) => x[4]), L.map((x) => x[5])]);
    }
    const grav = L.length;
    total += grav;
    console.log(`${f.etapa}: ${grav} registros (${anos.length} anos)`);
  }
  total += await coletarEstado(q); // Estado (cod_ibge = UF_PREFIX)
  const c = await db.query(`SELECT count(distinct cod_ibge) e, count(*) n, min(ano) a0, max(ano) a1 FROM ideb_sc`);
  console.log(`IDEB concluído: ${total} nesta rodada · ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
