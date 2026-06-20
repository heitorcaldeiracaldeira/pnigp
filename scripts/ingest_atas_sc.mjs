// ETL — Atas de Registro de Preço (PNCP, API de Consulta /v1/atas) por órgão de SC.
// Traz preços registrados + vínculo à compra (numeroControlePNCPCompra). Idempotente/resumível por órgão.
// node scripts/ingest_atas_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ANO = new Date().getFullYear();
const DI = `${process.env.ANO_MIN || ANO - 2}0101`, DF = `${ANO}1231`;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const d10 = (s) => (s ? String(s).slice(0, 10) : null);

async function pagina(cnpj, pg_) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://pncp.gov.br/api/consulta/v1/atas?dataInicial=${DI}&dataFinal=${DF}&cnpj=${cnpj}&pagina=${pg_}&tamanhoPagina=50`, { signal: AbortSignal.timeout(25000) });
      if (r.status === 404 || r.status === 204) return { data: [], totalPaginas: 0 };
      if (!r.ok) throw 0;
      return await r.json();
    } catch { await sleep(1200 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS atas_sc (
    numero_controle_ata TEXT PRIMARY KEY, cod_ibge TEXT, cnpj_orgao TEXT, ano_ata INTEGER, numero_ata TEXT,
    numero_controle_compra TEXT, vigencia_inicio DATE, vigencia_fim DATE, assinatura DATE, objeto TEXT, cancelado BOOLEAN, atualizado timestamptz DEFAULT now() )`);
  await db.query(`CREATE TABLE IF NOT EXISTS atas_check (cnpj_orgao TEXT PRIMARY KEY, checado timestamptz DEFAULT now(), n INTEGER DEFAULT 0)`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  // órgão -> município (cod_ibge mais frequente por cnpj)
  const mapRows = (await db.query(`SELECT DISTINCT ON (cnpj_compra) cnpj_compra cnpj, cod_ibge FROM contratos_sc WHERE cnpj_compra IS NOT NULL ORDER BY cnpj_compra, cod_ibge`)).rows;
  const cod = Object.fromEntries(mapRows.map((r) => [r.cnpj, r.cod_ibge]));
  const orgaos = Object.keys(cod);
  const feitos = new Set((await db.query(`SELECT cnpj_orgao FROM atas_check WHERE checado > now() - interval '20 days'`)).rows.map((r) => r.cnpj_orgao));
  const pend = orgaos.filter((c) => !feitos.has(c));
  console.log(`Atas: ${pend.length} órgãos a verificar (de ${orgaos.length})...`);
  let comAtas = 0, totalAtas = 0, proc = 0;
  for (const cnpj of pend) {
    let p = 1, totalPag = 1, n = 0;
    do {
      const j = await pagina(cnpj, p);
      if (j == null) break;
      totalPag = Number(j.totalPaginas) || 1;
      for (const a of (j.data || [])) {
        await q(`INSERT INTO atas_sc (numero_controle_ata,cod_ibge,cnpj_orgao,ano_ata,numero_ata,numero_controle_compra,vigencia_inicio,vigencia_fim,assinatura,objeto,cancelado)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 ON CONFLICT (numero_controle_ata) DO UPDATE SET vigencia_fim=EXCLUDED.vigencia_fim,cancelado=EXCLUDED.cancelado,objeto=EXCLUDED.objeto,atualizado=now()`,
          [a.numeroControlePNCPAta, cod[cnpj], cnpj, Number(a.anoAta) || null, String(a.numeroAtaRegistroPreco || ""), a.numeroControlePNCPCompra || null,
           d10(a.vigenciaInicio), d10(a.vigenciaFim), d10(a.dataAssinatura), String(a.objetoContratacao || "").slice(0, 300), !!a.cancelado]);
        n++;
      }
      p++;
    } while (p <= totalPag && p <= 40);
    if (n) { comAtas++; totalAtas += n; }
    await q(`INSERT INTO atas_check (cnpj_orgao,checado,n) VALUES ($1,now(),$2) ON CONFLICT (cnpj_orgao) DO UPDATE SET checado=now(), n=EXCLUDED.n`, [cnpj, n]);
    proc++;
    if (proc % 50 === 0) console.log(`  …${proc}/${pend.length} (órgãos com atas: ${comAtas}, atas: ${totalAtas})`);
    await sleep(150);
  }
  console.log(`Concluído: ${proc} órgãos · ${comAtas} com atas · ${totalAtas} atas gravadas.`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
