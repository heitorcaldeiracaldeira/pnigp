// ETL — ANEEL Geração Distribuída por município. Fonte: dadosabertos.aneel.gov.br (CSV ~1,5GB, latin1, ;).
// Agrega por município: nº de empreendimentos + potência instalada (kW) + fontes (solar/eólica…). Eixo Infraestrutura/energia.
// node scripts/ingest_aneel_gd_sc.mjs (espera o CSV já extraído em DIR/aneel_gd_out; senão baixa+extrai)
import fs from "fs"; import os from "os"; import path from "path"; import readline from "readline"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ZURL = "https://dadosabertos.aneel.gov.br/dataset/5e0fafd2-21b9-4d5b-b622-40438d40aba2/resource/b1bd71e7-d0ad-4214-9053-cbd58e9564a7/download/empreendimento-geracao-distribuida.zip";
const nBR = (s) => { const x = Number(String(s || "").replace(/"/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const cel = (l) => l.split(";").map((x) => x.replace(/^"|"$/g, ""));

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const byCod = new Set((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((e) => e.cod_ibge));
  const dir = process.env.DIR || os.tmpdir();
  let outDir = path.join(dir, "aneel_gd_out");
  // ⚠️ O CACHE ERA PELA PASTA, NÃO PELO CONTEÚDO. `existsSync(outDir)` dava true para uma pasta VAZIA
  // deixada por uma tentativa que falhou — e aí o download inteiro era pulado, para sempre. O sintoma era
  // "nenhum .csv depois de extrair", três passos depois da causa. Pasta existir não é o mesmo que ter dado.
  const temCsv = (d) => { try { return fs.readdirSync(d).some((f) => /\.csv$/i.test(f)); } catch { return false; } };
  if (!temCsv(outDir)) {
    const zp = path.join(dir, "aneel_gd.zip");
    // ═══ O DOWNLOAD NÃO CABIA NO TEMPO, E A FALHA ERA MUDA ═══
    // Medido em 10/ago: a URL responde HTTP 200 e o arquivo existe, mas o servidor da ANEEL entrega ~53 MB
    // por minuto — num arquivo de ~110 MB, o `--max-time 300` corta no meio. E `curl -s` sem `--fail`
    // deixava arquivo parcial (ou nenhum) sem dizer nada: o script seguia, o diretório saía vazio, e o
    // erro que aparecia era `ERR_INVALID_ARG_TYPE` lá adiante — sintoma três passos depois da causa.
    // `--speed-limit/--speed-time` é melhor que um teto fixo: aborta se a transferência ESTAGNAR (menos de
    // 1 KB/s por 60 s), e não porque o arquivo é grande e a origem é lenta.
    if (!fs.existsSync(zp) || fs.statSync(zp).size < 1e6) {
      console.log("baixando ANEEL GD (~110MB, origem lenta)…");
      try {
        execFileSync("curl", ["-sSL", "--fail", "--max-time", "1800", "--speed-limit", "1024", "--speed-time", "60",
          "--retry", "3", "--retry-all-errors", "-A", "Mozilla/5.0", "-o", zp, ZURL], { stdio: "ignore" });
      } catch (e) { throw new Error(`ANEEL GD: download falhou — ${String(e.message).slice(0, 120)}`); }
      const tam = fs.existsSync(zp) ? fs.statSync(zp).size : 0;
      if (tam < 1e6) throw new Error(`ANEEL GD: download veio incompleto (${tam} bytes)`);
      console.log(`  baixado: ${(tam / 1e6).toFixed(1)} MB`);
    }
    // 7zip-min falhava com "exited with code 2" e deixava o diretorio VAZIO -- e o readdirSync().find()
    // logo abaixo entao devolvia undefined, virando ERR_INVALID_ARG_TYPE. O erro visivel era consequencia.
    // extraiPlano ACHATA (como `unzip -j`): a linha abaixo faz `readdirSync(outDir).find(...)`, que NÃO é
    // recursivo — com a estrutura preservada o csv cai numa subpasta, o find devolve undefined e vira
    // ERR_INVALID_ARG_TYPE. Foi assim que o erro apareceu: consequência, não causa.
    { const { extraiPlano } = await import("./descompacta.mjs"); extraiPlano(zp, outDir); }
  }
  const achado = fs.readdirSync(outDir).find((f) => /\.csv$/i.test(f));
  if (!achado) throw new Error(`ANEEL GD: nenhum .csv em ${outDir} depois de extrair — o zip veio vazio ou truncado`);
  const csv = path.join(outDir, achado);

  const rl = readline.createInterface({ input: fs.createReadStream(csv, { encoding: "latin1" }), crlfDelay: Infinity });
  let H = null, ix = {}; const M = new Map();
  for await (const line of rl) {
    if (!H) { H = cel(line); const at = (n) => H.indexOf(n); ix = { uf: at("SigUF"), cod: at("CodMunicipioIbge"), pot: at("MdaPotenciaInstaladaKW"), fonte: at("DscFonteGeracao"), dt: at("DthAtualizaCadastralEmpreend") }; continue; }
    const c = cel(line); if (c.length < H.length - 3) continue;
    if ((c[ix.uf] || "") !== UF) continue;
    const cod = (c[ix.cod] || "").trim(); if (!byCod.has(cod)) continue;
    if (!M.has(cod)) M.set(cod, { n: 0, pot: 0, fontes: new Map(), anos: new Map() });
    const m = M.get(cod); m.n++; const p = nBR(c[ix.pot]); m.pot += p;
    const f = (c[ix.fonte] || "").trim(); if (f) m.fontes.set(f, (m.fontes.get(f) || 0) + 1);
    const ano = +(String(c[ix.dt] || "").match(/(19|20)\d{2}/)?.[0] || 0); // ano de atualização cadastral (proxy de entrada)
    if (ano >= 2008 && ano <= 2026) { const a = m.anos.get(ano) || { n: 0, kw: 0 }; a.n++; a.kw += p; m.anos.set(ano, a); }
  }

  await db.query(`CREATE TABLE IF NOT EXISTS aneel_gd_sc (cod_ibge TEXT PRIMARY KEY, n_empreendimentos INTEGER, potencia_kw NUMERIC, top_fontes JSONB, serie JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
  for (const [cod, m] of M) {
    const top = [...m.fontes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([fonte, n]) => ({ fonte, n }));
    // série CUMULATIVA de potência (MW) por ano — o estoque de GD cresce ano a ano
    const anos = [...m.anos.entries()].sort((a, b) => a[0] - b[0]); let acc = 0;
    const serie = anos.map(([ano, a]) => { acc += a.kw; return { ano, valor: +(acc / 1000).toFixed(2) }; });
    await db.query(`INSERT INTO aneel_gd_sc (cod_ibge,n_empreendimentos,potencia_kw,top_fontes,serie,atualizado) VALUES ($1,$2,$3,$4,$5,now())
      ON CONFLICT (cod_ibge) DO UPDATE SET n_empreendimentos=EXCLUDED.n_empreendimentos,potencia_kw=EXCLUDED.potencia_kw,top_fontes=EXCLUDED.top_fontes,serie=EXCLUDED.serie,atualizado=now()`,
      [cod, m.n, Math.round(m.pot), JSON.stringify(top), JSON.stringify(serie)]);
  }
  const chk = (await db.query(`SELECT count(*) m, sum(n_empreendimentos) n, round(sum(potencia_kw)/1000,1) mw FROM aneel_gd_sc`)).rows[0];
  console.log(`✔ aneel_gd_sc: ${chk.m} municípios · ${Number(chk.n).toLocaleString("pt-BR")} empreendimentos · ${chk.mw} MW instalados`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
