// ETL — HABITAÇÃO via MCMV (Minha Casa Minha Vida), base de dados oficial do Ministério das Cidades (gov.br/cidades).
// Unidades habitacionais financiadas por município (FGTS sintético). Alimenta o casamento oportunidade×necessidade (habitação).
// node scripts/ingest_mcmv_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const URL = process.env.URL || "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/habitacao/programa-minha-casa-minha-vida/arquivos/dados_abertos_FGTS_SINTETICO_202512.csv";
const UF = process.env.UF || "SC";
const numBR = (s) => { const x = String(s || "").replace(/\./g, "").replace(",", "."); const n = Number(x); return Number.isFinite(n) ? n : 0; };

async function main() {
  let buf;
  if (process.env.FILE) { console.log("lendo arquivo local…"); buf = fs.readFileSync(process.env.FILE); }
  else {
    console.log("baixando MCMV…");
    const r = await fetch(URL, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0" }, signal: AbortSignal.timeout(180000) });
    if (!r.ok) throw new Error("download " + r.status);
    buf = Buffer.from(await r.arrayBuffer());
  }
  const txt = new TextDecoder("iso-8859-1").decode(buf);
  const linhas = txt.split(/\r?\n/);
  const head = linhas[0].split(";").map((h) => h.trim());
  const iCod = head.indexOf("cod_ibge"), iUf = head.indexOf("txt_uf"), iUh = head.indexOf("qtd_uh_financiadas"), iFin = head.indexOf("vlr_financiamento"), iSub = head.indexOf("vlr_subsidio"), iAno = head.indexOf("num_ano_financiamento");
  // agrega por código de 6 dígitos do município (SC)
  const agg = new Map();
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(";"); if (c.length < head.length) continue;
    if (String(c[iUf] || "").trim().toUpperCase() !== UF) continue;
    const cod6 = String(c[iCod] || "").replace(/\D/g, "").padStart(6, "0").slice(0, 6);
    if (cod6.length !== 6) continue;
    const a = agg.get(cod6) || { uh: 0, fin: 0, sub: 0, anos: new Set() };
    a.uh += numBR(c[iUh]); a.fin += numBR(c[iFin]); a.sub += numBR(c[iSub]); a.anos.add(Number(numBR(c[iAno])));
    agg.set(cod6, a);
  }
  console.log(`  ${agg.size} municípios ${UF} com MCMV`);

  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS mcmv_sc (cod_ibge TEXT PRIMARY KEY, uh_financiadas NUMERIC, vlr_financiamento NUMERIC, vlr_subsidio NUMERIC, ano_min INT, ano_max INT, atualizado timestamptz DEFAULT now())`);
  await db.query(`TRUNCATE mcmv_sc`);
  // mapeia 6 dígitos -> 7 dígitos via entes_sc (left(cod_ibge,6))
  const entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' AND uf=$1`, [UF])).rows;
  const map6 = new Map(entes.map((e) => [String(e.cod_ibge).slice(0, 6), e.cod_ibge]));
  let ok = 0;
  for (const [cod6, a] of agg) {
    const cod7 = map6.get(cod6); if (!cod7) continue;
    const anos = [...a.anos].filter((x) => x > 1990);
    await db.query(`INSERT INTO mcmv_sc (cod_ibge,uh_financiadas,vlr_financiamento,vlr_subsidio,ano_min,ano_max) VALUES ($1,$2,$3,$4,$5,$6)
                    ON CONFLICT (cod_ibge) DO UPDATE SET uh_financiadas=EXCLUDED.uh_financiadas,vlr_financiamento=EXCLUDED.vlr_financiamento,vlr_subsidio=EXCLUDED.vlr_subsidio,ano_min=EXCLUDED.ano_min,ano_max=EXCLUDED.ano_max,atualizado=now()`,
      [cod7, Math.round(a.uh), Math.round(a.fin), Math.round(a.sub), Math.min(...anos) || null, Math.max(...anos) || null]);
    ok++;
  }
  const tot = await db.query(`SELECT count(*) m, sum(uh_financiadas) uh, round(avg(uh_financiadas)) media FROM mcmv_sc`);
  console.log(`Concluído: ${ok} municípios mapeados · ${tot.rows[0].uh} unidades · média ${tot.rows[0].media}/município`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
