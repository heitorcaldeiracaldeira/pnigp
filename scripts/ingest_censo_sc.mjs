// ETL — Censo Escolar (INEP): matrículas por município/etapa. Fonte: Sinopse Estatística da Educação Básica.
// Tabela 1.1 (sheet7): Matrículas da Educação Básica por Etapa, segundo UF e Município. Parser XLSX node puro, só a aba 7.
// node scripts/ingest_censo_sc.mjs
import fs from "fs"; import path from "path"; import zlib from "zlib"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // download.inep.gov.br tem cadeia TLS incompleta (download público)
const UF = process.env.UF || "SC";
const UF_PREFIX = { SC: "42", BA: "29", SP: "35" }[UF] || "42";
const UF_NOME = { SC: "Santa Catarina", BA: "Bahia", SP: "São Paulo" }[UF] || "Santa Catarina";
// ═══ A URL MUDOU DE NOME, E O ANO ESTAVA CRAVADO ═══
// Medido em 10/ago: `sinopses_estatisticas_censo_escolar_2024.zip` devolve 404 (página de erro de 3.050
// bytes) — o INEP passou a publicar no SINGULAR: `sinopse_estatistica_censo_escolar_2024.zip`. E já existe
// 2025, enquanto o script pedia 2024 fixo. Duas coisas que só a sondagem mostra, porque o erro que chegava
// ao catálogo era só "falhou".
const SINOPSE = (a) => [
  `https://download.inep.gov.br/dados_abertos/sinopses_estatisticas/sinopse_estatistica_censo_escolar_${a}.zip`,
  `https://download.inep.gov.br/dados_abertos/sinopses_estatisticas/sinopses_estatisticas_censo_escolar_${a}.zip`,  // nome antigo
];
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
// colunas da Tabela 1.1 (verificadas): E=Total Ed. Básica · etapas
const COLS = { E: "Total", F: "Educação Infantil", G: "Creche", H: "Pré-Escola", I: "Ensino Fundamental", J: "Anos Iniciais", K: "Anos Finais", L: "Ensino Médio", P: "Educação Profissional", X: "EJA", AA: "Educação Especial" };

function unzipEntry(buf, nameRe) {
  let eo = -1; for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; } }
  if (eo < 0) throw new Error("EOCD");
  let cdOff = buf.readUInt32LE(eo + 16); const cdCount = buf.readUInt16LE(eo + 10); let p = cdOff;
  for (let n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42); const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (nameRe.test(name)) { const lN = buf.readUInt16LE(lho + 26), lE = buf.readUInt16LE(lho + 28); const ds = lho + 30 + lN + lE; const comp = buf.subarray(ds, ds + compSize); return method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp); }
    p += 46 + nameLen + extraLen + commLen;
  }
  throw new Error("não achou " + nameRe);
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS censo_matricula_sc (cod_ibge TEXT, ano INTEGER, etapa TEXT, matriculas INTEGER, PRIMARY KEY (cod_ibge, ano, etapa))`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };

  // ═══ 144 MB NÃO CABEM EM 240 SEGUNDOS NUMA ORIGEM QUE ENTREGA ~450 KB/s ═══
  // Era `fetch(..., timeout 240s)`, sem retomada: estourava, jogava fora tudo e recomeçava do zero nas
  // quatro tentativas. `curl -C -` retoma; --speed-limit aborta se ESTAGNAR, não por ser grande e lento.
  const { execFileSync } = await import("child_process");
  const { zipIntegro } = await import("./descompacta.mjs");
  const os = (await import("os")).default;
  const topo = process.env.CENSO_ANO ? Number(process.env.CENSO_ANO) : new Date().getFullYear();
  const piso = process.env.CENSO_ANO ? Number(process.env.CENSO_ANO) : topo - 3;
  let ANO = null, zip = null;
  for (let a = topo; a >= piso && !zip; a--) {
    for (const url of SINOPSE(a)) {
      const dest = path.join(os.tmpdir(), `sinopse_censo_${a}.zip`);
      if (zipIntegro(dest)) { ANO = a; zip = dest; break; }
      process.stdout.write(`Baixando Sinopse Censo ${a} ... `);
      try {
        execFileSync("curl", ["-sS", "--fail", "-L", "-C", "-", "--max-time", "3600", "--speed-limit", "1024",
          "--speed-time", "60", "--retry", "3", "--retry-all-errors", "-A", "Mozilla/5.0", "-o", dest, url], { stdio: "ignore" });
      } catch { console.log("não publicado nesta URL"); continue; }
      if (zipIntegro(dest)) { console.log("ok"); ANO = a; zip = dest; break; }
      console.log("veio truncado");
    }
  }
  if (!zip) { console.log(`Sinopse: nenhum ano de ${piso} a ${topo} disponível`); process.exit(1); }
  const outer = fs.readFileSync(zip);
  console.log(`Sinopse do Censo ${ANO} (${(outer.length / 1e6).toFixed(0)} MB)`);
  const xlsx = unzipEntry(outer, /\.xlsx$/);
  const ssXml = unzipEntry(xlsx, /xl\/sharedStrings\.xml$/).toString("utf8");
  const strings = []; for (const si of ssXml.split("<si>").slice(1)) strings.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("").replace(/&amp;/g, "&"));
  const sheet = unzipEntry(xlsx, /xl\/worksheets\/sheet7\.xml$/).toString("utf8");
  const num = (v) => { const n = parseInt(String(v).replace(/\D/g, ""), 10); return isNaN(n) ? null : n; };
  let grav = 0, entes = 0;
  for (const rs of sheet.split("<row").slice(1)) {
    const c = {}; for (const m of rs.matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="(\w+)")?[^>]*>(?:<v>([^<]*)<\/v>)?/g)) c[m[1]] = m[3] == null ? "" : (m[2] === "s" ? strings[+m[3]] : m[3]);
    const cod = String(c.D || "").trim(); const uf = String(c.B || "").trim(); const mun = String(c.C || "").trim();
    let codIbge = null;
    if (/^\d{7}$/.test(cod) && cod.startsWith(UF_PREFIX)) codIbge = cod;           // município
    else if (uf === UF_NOME && !mun && !cod) codIbge = UF_PREFIX;                   // linha da UF = Estado
    if (!codIbge) continue;
    for (const [col, etapa] of Object.entries(COLS)) {
      const v = num(c[col]); if (v == null) continue;
      await q(`INSERT INTO censo_matricula_sc (cod_ibge,ano,etapa,matriculas) VALUES ($1,$2,$3,$4)
               ON CONFLICT (cod_ibge,ano,etapa) DO UPDATE SET matriculas=EXCLUDED.matriculas`, [codIbge, +ANO, etapa, v]);
      grav++;
    }
    entes++;
  }
  const r = await db.query(`SELECT count(distinct cod_ibge) e, count(*) n FROM censo_matricula_sc`);
  console.log(`Censo concluído: ${entes} entes nesta rodada, ${grav} registros · total ${JSON.stringify(r.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
