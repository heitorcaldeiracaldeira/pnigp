// ETL — PNLD reserva técnica (remanejamento de livros) por MUNICÍPIO de SC (rede municipal).
// Fonte: FNDE, Plataforma Antonieta de Barros, produto "PDA_PNLD" (id 48) — oferta/demanda de volumes entre escolas.
// NÃO é captação (o PNLD principal é distribuição universal, id 49 = 1,3 GB). Aqui capturamos a DEMANDA de livros da
// reserva técnica: sinal de ADEQUAÇÃO de material didático (livro que faltou na escola). Grão = volume × entidade.
// Honesto: enquanto o ciclo está aberto, qtd_atendimento=0 (timing, não recusa) → exibir como "ciclo em andamento".
// Download via curl (node fetch estagna no FNDE). node scripts/ingest_pnld_sc.mjs
import fs from "fs"; import os from "os"; import path from "path"; import zlib from "zlib"; import { execFileSync } from "child_process"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const ID = 48; // PDA_PNLD (reserva técnica)
const API = `https://www.fnde.gov.br/plataforma-antonieta-de-barros-api/products/data-products/${ID}/artifact`;
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const n = (v) => Number(String(v || "").replace(",", ".")) || 0;

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const ents = (await db.query(`SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'`)).rows;
  const byName = new Map(ents.map((e) => [norm(e.nome), e.cod_ibge]));

  const gz = path.join(os.tmpdir(), `pnld_${ID}.txt.gz`);
  execFileSync("curl", ["-s", "-L", "--max-time", "500", "-A", "Mozilla/5.0", "-o", gz, API], { stdio: "ignore" });
  const buf = fs.readFileSync(gz);
  if (buf.length < 1000) throw new Error(`download vazio (${buf.length}b)`);
  const linhas = zlib.gunzipSync(buf).toString("utf8").split(/\r?\n/);
  fs.unlinkSync(gz);
  const head = linhas[0].split(";").map((c) => c.trim());
  const ix = (name) => head.indexOf(name);
  const iAno = ix("ANO"), iUF = ix("uf_demandante"), iMun = ix("municipio_demandante"), iEsf = ix("esfera_demandante"),
    iDem = ix("qtd_demandada"), iAut = ix("qtd_autorizada"), iAt = ix("qtd_atendimento");

  // agrega por (cod_ibge, ano): demanda, autorizada, atendimento, nº de volumes distintos
  const agg = new Map(); let semMatch = 0;
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(";");
    if (c.length < head.length) continue;
    if (c[iUF] !== UF || !/MUNICIPAL/i.test(c[iEsf] || "")) continue;
    const cod = byName.get(norm(c[iMun]));
    if (!cod) { semMatch++; continue; }
    const ano = parseInt(c[iAno], 10); if (!ano) continue;
    const k = cod + "|" + ano;
    if (!agg.has(k)) agg.set(k, { cod, ano, dem: 0, aut: 0, at: 0, vol: 0 });
    const a = agg.get(k); a.dem += n(c[iDem]); a.aut += n(c[iAut]); a.at += n(c[iAt]); a.vol++;
  }

  await db.query(`CREATE TABLE IF NOT EXISTS pnld_reserva_sc (cod_ibge TEXT, ano INTEGER, qtd_demandada INTEGER, qtd_autorizada INTEGER, qtd_atendimento INTEGER, n_volumes INTEGER, PRIMARY KEY (cod_ibge, ano))`);
  for (const a of agg.values()) {
    await db.query(
      `INSERT INTO pnld_reserva_sc (cod_ibge, ano, qtd_demandada, qtd_autorizada, qtd_atendimento, n_volumes) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (cod_ibge, ano) DO UPDATE SET qtd_demandada=EXCLUDED.qtd_demandada, qtd_autorizada=EXCLUDED.qtd_autorizada, qtd_atendimento=EXCLUDED.qtd_atendimento, n_volumes=EXCLUDED.n_volumes`,
      [a.cod, a.ano, Math.round(a.dem), Math.round(a.aut), Math.round(a.at), a.vol]);
  }
  const chk = (await db.query(`SELECT count(*) linhas, count(distinct cod_ibge) munis, min(ano) mi, max(ano) ma, sum(qtd_demandada) dem, sum(qtd_atendimento) at FROM pnld_reserva_sc`)).rows[0];
  console.log(`✔ pnld_reserva_sc: ${JSON.stringify(chk)} · sem match de nome: ${semMatch}`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
