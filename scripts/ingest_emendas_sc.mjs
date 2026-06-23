// ETL — Emendas parlamentares por município de SC (Portal da Transparência, API de Dados). Autoritativo: empenhado×
// liquidado×pago por emenda, autor, função. Filtra localidadeDoGasto "… - SC". Idempotente. node scripts/ingest_emendas_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const KEY = env.match(/^PORTAL_TRANSPARENCIA_KEY=(.+)$/m)[1].trim().replace(/['"]/g, "");
const ANO_INI = +(process.env.ANO_INI || 2020), ANO_FIM = +(process.env.ANO_FIM || 2026);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const vlr = (s) => { const n = parseFloat(String(s || "0").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();

async function api(ano, pagina) {
  const url = `https://api.portaldatransparencia.gov.br/api-de-dados/emendas?ano=${ano}&pagina=${pagina}`;
  for (let t = 0; t < 6; t++) {
    try { const r = await fetch(url, { headers: { "chave-api-dados": KEY, Accept: "application/json" }, signal: AbortSignal.timeout(40000) });
      if (r.status === 429) { await sleep(8000); continue; }
      if (!r.ok) throw new Error("http " + r.status);
      return await r.json();
    } catch { await sleep(2500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS emendas_sc (
    codigo_emenda TEXT, ano INTEGER, cod_ibge TEXT, localidade TEXT, tipo TEXT, autor TEXT, funcao TEXT, subfuncao TEXT,
    empenhado NUMERIC, liquidado NUMERIC, pago NUMERIC, resto_inscrito NUMERIC, resto_pago NUMERIC,
    PRIMARY KEY (codigo_emenda, ano))`);
  await db.query(`CREATE TABLE IF NOT EXISTS emendas_check (ano INTEGER PRIMARY KEY, n INTEGER)`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };
  // mapa nome-município SC → cod_ibge
  const muns = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const mapMun = new Map(muns.map((m) => [norm(m.nome), m.cod_ibge]));
  const feitos = new Set((await db.query(`SELECT ano FROM emendas_check`)).rows.map((r) => +r.ano));

  let totalGrav = 0;
  for (let ano = ANO_FIM; ano >= ANO_INI; ano--) {
    if (feitos.has(ano)) { console.log(`${ano}: já coletado`); continue; }
    let pagina = 1, gravAno = 0, vistas = 0;
    while (pagina < 6000) {
      const arr = await api(ano, pagina);
      await sleep(700);
      if (!arr || !arr.length) break;
      vistas += arr.length;
      for (const e of arr) {
        const loc = String(e.localidadeDoGasto || "");
        if (!/-\s*SC\s*$/i.test(loc)) continue; // só localidade em SC
        const cidade = norm(loc.replace(/-\s*SC\s*$/i, ""));
        const cod = mapMun.get(cidade) || null;
        await q(`INSERT INTO emendas_sc (codigo_emenda,ano,cod_ibge,localidade,tipo,autor,funcao,subfuncao,empenhado,liquidado,pago,resto_inscrito,resto_pago)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                 ON CONFLICT (codigo_emenda,ano) DO UPDATE SET empenhado=EXCLUDED.empenhado, liquidado=EXCLUDED.liquidado, pago=EXCLUDED.pago, cod_ibge=EXCLUDED.cod_ibge`,
          [String(e.codigoEmenda), ano, cod, loc, e.tipoEmenda || null, e.nomeAutor || e.autor || null, e.funcao || null, e.subfuncao || null,
            vlr(e.valorEmpenhado), vlr(e.valorLiquidado), vlr(e.valorPago), vlr(e.valorRestoInscrito), vlr(e.valorRestoPago)]);
        gravAno++; totalGrav++;
      }
      if (arr.length < 15) break; // última página
      pagina++;
      if (pagina % 50 === 0) console.log(`  ${ano} pág ${pagina} · ${gravAno} SC gravadas (de ${vistas} vistas)`);
    }
    await q(`INSERT INTO emendas_check (ano,n) VALUES ($1,$2) ON CONFLICT (ano) DO UPDATE SET n=EXCLUDED.n`, [ano, gravAno]);
    console.log(`${ano}: ✓ ${gravAno} emendas SC (de ${vistas} nacionais vistas)`);
  }
  const r = await db.query(`SELECT count(*) n, count(distinct cod_ibge) entes, round(sum(pago)/1e6) pago_mi, round(sum(empenhado)/1e6) emp_mi FROM emendas_sc`);
  console.log(`Emendas SC concluído: ${JSON.stringify(r.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
