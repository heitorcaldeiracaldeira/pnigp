// ETL — RAIS 2024: estoque de emprego formal por município. Fonte: FTP MTE/PDET (RAIS_VINC_PUB_SUL.7z ~680MB + RAIS_ESTAB_PUB.7z).
// Formato: CSV com campos entre ASPAS separados por VÍRGULA, decimal com PONTO, latin1. Arquivo interno .COMT.
// Agrega por município: vínculos ATIVOS 31/12 (estoque), massa salarial, remun média, por SETOR (IBGE subsetor) e
// estabelecimentos por PORTE. Pipeline curl-FTP → 7zip-min → stream. node scripts/ingest_rais_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF_PREF = process.env.UF_PREF || "42";
const ANO = process.env.ANO || "2024";
const parseCSV = (l) => { const o = []; let c = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') q = false; else c += ch; } else { if (ch === '"') q = true; else if (ch === ",") { o.push(c); c = ""; } else c += ch; } } o.push(c); return o; };
const SETOR = (c) => { const n = +c; if (n === 25) return "Agropecuária"; if (n >= 2 && n <= 13) return "Indústria"; if (n === 15) return "Construção civil"; if (n === 16 || n === 17) return "Comércio"; if (n === 24) return "Administração pública"; return "Serviços"; };
const PORTE = (c) => { const n = +c; if (n <= 1) return "Sem vínculo"; if (n <= 4) return "Micro (até 19)"; if (n <= 6) return "Pequena (20-99)"; if (n <= 8) return "Média (100-499)"; return "Grande (500+)"; };

async function stream7z(zPath, cols, onRow) {
  const _7z = await import("7zip-min"); const unpack = _7z.default?.unpack || _7z.unpack;
  const out = zPath + "_out";
  if (!fs.existsSync(out)) await new Promise((res, rej) => unpack(zPath, out, (e) => e ? rej(e) : res()));
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
  for (const [cod, g] of M) {
    const setor = [...g.setores.entries()].sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ setor: nome, n }));
    const porte = [...g.portes.entries()].sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ porte: nome, n }));
    await db.query(`INSERT INTO rais_sc (cod_ibge,ano,estoque,massa_salarial,remun_media,por_setor,estabelecimentos,por_porte,atualizado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET estoque=EXCLUDED.estoque,massa_salarial=EXCLUDED.massa_salarial,remun_media=EXCLUDED.remun_media,por_setor=EXCLUDED.por_setor,estabelecimentos=EXCLUDED.estabelecimentos,por_porte=EXCLUDED.por_porte,atualizado=now()`,
      [cod, +ANO, g.estoque, Math.round(g.massa), g.estoque ? Math.round(g.massa / g.estoque) : 0, JSON.stringify(setor), g.estab, JSON.stringify(porte)]);
  }
  const chk = (await db.query(`SELECT count(*) l, sum(estoque) est, sum(estabelecimentos) estab, round(avg(remun_media)) rem FROM rais_sc WHERE ano=${+ANO}`)).rows[0];
  console.log(`✔ rais_sc ${ANO}: ${chk.l} munis · ${chk.est} empregos formais · ${chk.estab} estabelecimentos · remun média R$${chk.rem}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
