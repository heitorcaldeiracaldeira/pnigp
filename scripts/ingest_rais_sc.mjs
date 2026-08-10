// ETL — RAIS 2024: estoque de emprego formal por município. Fonte: FTP MTE/PDET (RAIS_VINC_PUB_SUL.7z ~680MB + RAIS_ESTAB_PUB.7z).
// Formato: CSV com campos entre ASPAS separados por VÍRGULA, decimal com PONTO, latin1. Arquivo interno .COMT.
// Agrega por município: vínculos ATIVOS 31/12 (estoque), massa salarial, remun média, por SETOR (IBGE subsetor) e
// estabelecimentos por PORTE. Pipeline curl-FTP → 7zip-min → stream. node scripts/ingest_rais_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF_PREF = process.env.UF_PREF || "42";
const FTP = "ftp://ftp.mtps.gov.br/pdet/microdados/RAIS";

// ═══ ESTE SCRIPT NÃO TINHA DOWNLOAD ═══
// O cabeçalho prometia "curl-FTP → 7zip-min → stream", mas a etapa de curl nunca foi escrita: ele só lia um
// .7z que alguém teria de colocar no tmpdir à mão. Agendado, nunca pôde funcionar — o erro que aparecia era
// `arquivo não existe: rais_vinc_sul.7z`, que é o sintoma, não a causa.
// E o ANO estava cravado em "2024" enquanto o MTE já publicava 2025 (13/05/2026). Mesma lei do IBGE e do
// INEP: procurar o dado novo, não presumir a versão.
const cmdFtp = (args, buf = 1 << 24) => execFileSync("curl", args, { encoding: "latin1", maxBuffer: buf });
const nomesFtp = (dir) => cmdFtp(["-sl", "--max-time", "90", "--ftp-pasv", dir.endsWith("/") ? dir : dir + "/"]).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
/** listagem longa do FTP → Map(nome → bytes). O tamanho declarado é o que prova o download inteiro. */
function tamanhosFtp(dir) {
  const m = new Map();
  for (const l of cmdFtp(["-s", "--max-time", "90", "--ftp-pasv", dir.endsWith("/") ? dir : dir + "/"]).split(/\r?\n/)) {
    const g = l.match(/\s(\d+)\s+(\S.*)$/); if (g) m.set(g[2].trim(), Number(g[1]));
  }
  return m;
}
function descobreAno() {
  if (process.env.ANO) return String(process.env.ANO);
  const anos = nomesFtp(FTP).filter((n) => /^\d{4}$/.test(n)).map(Number).sort((a, b) => b - a);
  // ano existir como pasta não basta: a pasta do ano corrente às vezes aparece antes dos arquivos entrarem
  for (const a of anos) { try { if (nomesFtp(`${FTP}/${a}`).includes("RAIS_VINC_PUB_SUL.7z")) return String(a); } catch { /* tenta o anterior */ } }
  throw new Error("RAIS: nenhum ano no FTP tem RAIS_VINC_PUB_SUL.7z");
}
const ehSeteZip = (p) => { try { const fd = fs.openSync(p, "r"); const b = Buffer.alloc(6); const n = fs.readSync(fd, b, 0, 6, 0); fs.closeSync(fd); return n === 6 && b.toString("hex") === "377abcaf271c"; } catch { return false; } };
/**
 * Baixa do FTP RETOMANDO de onde parou (-C -). São ~800 MB a ~412 KB/s: perto de 33 minutos, e uma queda
 * no meio não pode significar recomeçar do zero. O tamanho declarado pelo FTP é o critério de completude —
 * arquivo grande não é arquivo inteiro, como já custou caro na CAPAG.
 */
function baixaFtp(url, dest, esperado) {
  for (let tent = 1; tent <= 4; tent++) {
    const tem = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    if (esperado && tem === esperado && ehSeteZip(dest)) return;
    if (esperado && tem > esperado) { try { fs.rmSync(dest, { force: true }); } catch { /* ignora */ } }  // sobra de outro ano
    console.log(`  baixando ${path.basename(dest)} (${(esperado / 1e6).toFixed(0)} MB, tenho ${(tem / 1e6).toFixed(0)} MB) tentativa ${tent}…`);
    try {
      execFileSync("curl", ["-sS", "--fail", "--ftp-pasv", "-C", "-", "--max-time", "7200",
        "--speed-limit", "2048", "--speed-time", "120", "-o", dest, url], { stdio: "ignore" });
    } catch { /* pode ter trazido parte; a próxima tentativa retoma daí */ }
  }
  const fim = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
  if (esperado && fim !== esperado) throw new Error(`RAIS: ${path.basename(dest)} veio incompleto (${fim} de ${esperado} bytes)`);
  if (!ehSeteZip(dest)) throw new Error(`RAIS: ${path.basename(dest)} não é um .7z válido`);
}
const parseCSV = (l) => { const o = []; let c = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') q = false; else c += ch; } else { if (ch === '"') q = true; else if (ch === ",") { o.push(c); c = ""; } else c += ch; } } o.push(c); return o; };
const SETOR = (c) => { const n = +c; if (n === 25) return "Agropecuária"; if (n >= 2 && n <= 13) return "Indústria"; if (n === 15) return "Construção civil"; if (n === 16 || n === 17) return "Comércio"; if (n === 24) return "Administração pública"; return "Serviços"; };
const PORTE = (c) => { const n = +c; if (n <= 1) return "Sem vínculo"; if (n <= 4) return "Micro (até 19)"; if (n <= 6) return "Pequena (20-99)"; if (n <= 8) return "Média (100-499)"; return "Grande (500+)"; };

async function stream7z(zPath, cols, onRow) {
  // descompacta.mjs: tar -xf nativo do Windows, com fallback. 7zip-min saia com "code 2".
  const { extrai } = await import("./descompacta.mjs");
  const out = zPath + "_out";
  // ⚠️ extraía para `path.dirname(out)` — o diretório PAI — então `out` nunca era criado e o readdirSync
  // logo abaixo estourava com ENOENT apontando para uma pasta que o próprio script deveria ter feito.
  // O destino é `out`, não o pai de `out`.
  if (!fs.existsSync(out)) extrai(zPath, out);
  const data = fs.readdirSync(out).filter((f) => fs.statSync(path.join(out, f)).size > 1e5); // arquivo grande (.COMT/.txt)
  for (const f of data) {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(out, f), { encoding: "latin1" }), crlfDelay: Infinity });
    let ix = null;
    for await (const line of rl) {
      const c = parseCSV(line);
      if (!ix) { ix = {}; for (const [k, name] of Object.entries(cols)) ix[k] = c.indexOf(name); console.log(`  ${f}: índices ${JSON.stringify(ix)}`); continue; }
      onRow(c, ix);
    }
  }
  try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) {}
}

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const by6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
  const dir = process.env.DIR || os.tmpdir();
  const ANO = descobreAno();
  const tam = tamanhosFtp(`${FTP}/${ANO}`);
  console.log(`RAIS ${ANO} (ano mais novo publicado no FTP do MTE)`);
  baixaFtp(`${FTP}/${ANO}/RAIS_VINC_PUB_SUL.7z`, path.join(dir, "rais_vinc_sul.7z"), tam.get("RAIS_VINC_PUB_SUL.7z"));
  baixaFtp(`${FTP}/${ANO}/RAIS_ESTAB_PUB.7z`, path.join(dir, "rais_estab.7z"), tam.get("RAIS_ESTAB_PUB.7z"));
  const M = new Map();
  const get = (cod) => { if (!M.has(cod)) M.set(cod, { estoque: 0, massa: 0, setores: new Map(), estab: 0, portes: new Map() }); return M.get(cod); };

  // === VÍNCULOS (SUL) ===
  await stream7z(path.join(dir, "rais_vinc_sul.7z"), { mun: "Município - Código", ativo: "Ind Vínculo Ativo 31/12 - Código", rem: "Vl Rem Média Nom", sub: "IBGE Subsetor - Código" }, (c, ix) => {
    if (ix.mun < 0) return;
    const cod = by6.get((c[ix.mun] || "").trim().slice(0, 6)); if (!cod) return;
    if (String(c[ix.ativo]).trim() !== "1") return;
    const rem = Number(c[ix.rem]); // decimal com ponto
    const g = get(cod); g.estoque++; if (Number.isFinite(rem)) g.massa += rem;
    const s = SETOR(c[ix.sub]); g.setores.set(s, (g.setores.get(s) || 0) + 1);
  });
  console.log(`vínculos: ${M.size} municípios com estoque`);

  // === ESTABELECIMENTOS (nacional, filtra UF) ===
  await stream7z(path.join(dir, "rais_estab.7z"), { mun: "Município - Código", tam: "Tamanho Estabelecimento - Código", ativ: "Ind Atividade Ano - Código" }, (c, ix) => {
    if (ix.mun < 0) return;
    const mun = (c[ix.mun] || "").trim(); if (!mun.startsWith(UF_PREF)) return;
    const cod = by6.get(mun.slice(0, 6)); if (!cod) return;
    if (ix.ativ >= 0 && String(c[ix.ativ]).trim() === "0") return;
    const g = get(cod); g.estab++;
    const p = PORTE(c[ix.tam]); g.portes.set(p, (g.portes.get(p) || 0) + 1);
  });

  await db.query(`CREATE TABLE IF NOT EXISTS rais_sc (cod_ibge TEXT, ano INTEGER, estoque INTEGER, massa_salarial NUMERIC, remun_media NUMERIC, por_setor JSONB, estabelecimentos INTEGER, por_porte JSONB, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  // uma ida ao banco por município para gravar 295 linhas; o banco é o gargalo, então vai em lote só
  const L = [...M.entries()].map(([cod, g]) => [cod, g.estoque, Math.round(g.massa), g.estoque ? Math.round(g.massa / g.estoque) : 0,
    JSON.stringify([...g.setores.entries()].sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ setor: nome, n }))),
    g.estab, JSON.stringify([...g.portes.entries()].sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ porte: nome, n })))]);
  if (L.length) {
    await db.query(`INSERT INTO rais_sc (cod_ibge,ano,estoque,massa_salarial,remun_media,por_setor,estabelecimentos,por_porte,atualizado)
      SELECT c, $2, e, ms, rm, st::jsonb, eb, pt::jsonb, now()
      FROM unnest($1::text[], $3::int[], $4::numeric[], $5::numeric[], $6::text[], $7::int[], $8::text[]) AS t(c,e,ms,rm,st,eb,pt)
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET estoque=EXCLUDED.estoque,massa_salarial=EXCLUDED.massa_salarial,remun_media=EXCLUDED.remun_media,por_setor=EXCLUDED.por_setor,estabelecimentos=EXCLUDED.estabelecimentos,por_porte=EXCLUDED.por_porte,atualizado=now()`,
      [L.map((x) => x[0]), +ANO, L.map((x) => x[1]), L.map((x) => x[2]), L.map((x) => x[3]), L.map((x) => x[4]), L.map((x) => x[5]), L.map((x) => x[6])]);
  }
  const chk = (await db.query(`SELECT count(*) l, sum(estoque) est, sum(estabelecimentos) estab, round(avg(remun_media)) rem FROM rais_sc WHERE ano=${+ANO}`)).rows[0];
  console.log(`✔ rais_sc ${ANO}: ${chk.l} munis · ${chk.est} empregos formais · ${chk.estab} estabelecimentos · remun média R$${chk.rem}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
