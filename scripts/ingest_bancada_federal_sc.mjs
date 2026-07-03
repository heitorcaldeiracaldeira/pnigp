// ETL — Bancada federal do estado (deputados federais + senadores) para o módulo de Captação de Emendas.
// Fontes abertas: Câmara (dadosabertos.camara.leg.br) e Senado (legis.senado.leg.br/dadosabertos). State-agnostic (UF).
// node scripts/ingest_bancada_federal_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
async function getJSON(url) {
  for (let t = 0; t < 4; t++) {
    try { const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw r.status; return await r.json(); }
    catch { await sleep(1500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS bancada_federal_sc (
    id TEXT PRIMARY KEY, casa TEXT, cod_externo TEXT, nome TEXT, partido TEXT, uf TEXT,
    email TEXT, telefone TEXT, foto_url TEXT, pagina_url TEXT, atualizado timestamptz DEFAULT now())`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(800 * (t + 1)); } } throw new Error("db"); };
  const registros = [];

  // 1) DEPUTADOS FEDERAIS (Câmara) — com detalhe de gabinete (telefone)
  const dep = await getJSON(`https://dadosabertos.camara.leg.br/api/v2/deputados?siglaUf=${UF}&ordem=ASC&ordenarPor=nome&itens=100`);
  for (const d of (dep?.dados || [])) {
    let tel = null;
    const det = await getJSON(`https://dadosabertos.camara.leg.br/api/v2/deputados/${d.id}`);
    const gab = det?.dados?.ultimoStatus?.gabinete; if (gab?.telefone) tel = String(gab.telefone).trim();
    registros.push({ id: `camara-${d.id}`, casa: "camara", cod: String(d.id), nome: d.nome, partido: d.siglaPartido || "", uf: d.siglaUf || UF, email: d.email || null, tel, foto: d.urlFoto || null, pagina: `https://www.camara.leg.br/deputados/${d.id}` });
    await sleep(300);
  }

  // 2) SENADORES em exercício (Senado) — filtra por UF no cliente (o ?uf= é ignorado pela API)
  const sen = await getJSON(`https://legis.senado.leg.br/dadosabertos/senador/lista/atual`);
  const lst = sen?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar || [];
  for (const p of lst) {
    const i = p.IdentificacaoParlamentar || {};
    if ((i.UfParlamentar || "").toUpperCase() !== UF.toUpperCase()) continue;
    let tel = null;
    const det = await getJSON(`https://legis.senado.leg.br/dadosabertos/senador/${i.CodigoParlamentar}`);
    const tels = det?.DetalheParlamentar?.Parlamentar?.Telefones?.Telefone;
    if (tels) tel = (Array.isArray(tels) ? tels[0] : tels)?.NumeroTelefone || null;
    registros.push({ id: `senado-${i.CodigoParlamentar}`, casa: "senado", cod: String(i.CodigoParlamentar), nome: i.NomeParlamentar, partido: i.SiglaPartidoParlamentar || "", uf: i.UfParlamentar || UF, email: i.EmailParlamentar || null, tel, foto: i.UrlFotoParlamentar || null, pagina: i.UrlPaginaParlamentar || null });
    await sleep(300);
  }

  for (const r of registros) {
    await q(`INSERT INTO bancada_federal_sc (id,casa,cod_externo,nome,partido,uf,email,telefone,foto_url,pagina_url,atualizado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
             ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome,partido=EXCLUDED.partido,email=EXCLUDED.email,telefone=EXCLUDED.telefone,foto_url=EXCLUDED.foto_url,pagina_url=EXCLUDED.pagina_url,atualizado=now()`,
      [r.id, r.casa, r.cod, r.nome, r.partido, r.uf, r.email, r.tel, r.foto, r.pagina]);
  }
  const x = (await db.query(`SELECT casa, count(*) n FROM bancada_federal_sc WHERE uf=$1 GROUP BY casa`, [UF])).rows;
  console.log(`Bancada ${UF}: ${registros.length} parlamentares · ${JSON.stringify(x)}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
