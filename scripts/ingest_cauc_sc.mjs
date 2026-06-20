// ETL — CAUC (Sistema de Informações sobre Requisitos Fiscais) por município/Estado de SC.
// Fonte: CSV oficial do Tesouro Transparente (CAUC lê o CADIN diariamente). Mostra se o ente está
// APTO a receber transferências voluntárias e quais requisitos estão pendentes. node scripts/ingest_cauc_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CKAN = "https://www.tesourotransparente.gov.br/ckan/dataset/72b5f371-0c35-4613-8076-c99c821a6410/resource";
const URLS = {
  M: `${CKAN}/07af297a-5e59-494a-a88a-55ddfd2f4b01/download/relatorio-situacao-de-varios-entes---municipios---uf-todas---abrangencia-1.csv`,
  E: `${CKAN}/b7ea8b15-208a-40eb-8256-a9a18d7e4f0d/download/relatorio-situacao-de-varios-entes---estados-e-df---uf-todas---abrangencia-1.csv`,
};
// grupos dos requisitos CAUC (1º dígito do código)
const GRUPO = { "1": "Regularidade tributária federal (Receita/PGFN/FGTS)", "2": "Regularidade previdenciária", "3": "Envio de contas e relatórios fiscais (RREO/RGF/SICONFI)", "4": "Aplicação mínima (saúde/educação)", "5": "Dívida e demais requisitos" };
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const splitCsv = (l) => l.split(";").map((x) => x.replace(/^"|"$/g, "").trim());

async function baixar(url) {
  for (let t = 0; t < 4; t++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(90000) }); if (!r.ok) throw 0; return new TextDecoder("latin1").decode(await r.arrayBuffer()); } catch { await sleep(2000 * (t + 1)); } }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS cauc_sc (
    cod_ibge TEXT PRIMARY KEY, data_pesquisa DATE, apto BOOLEAN, n_pendencias INTEGER,
    pendencias TEXT[], grupos_pendentes TEXT[], atualizado timestamptz DEFAULT now() )`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  const cod6 = new Map((await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M'`)).rows.map((r) => [r.cod_ibge.slice(0, 6), r.cod_ibge]));

  let total = 0;
  for (const esfera of ["M", "E"]) {
    const csv = await baixar(URLS[esfera]);
    if (!csv) { console.log(`${esfera}: falhou`); continue; }
    const lines = csv.split(/\r?\n/);
    const hi = lines.findIndex((l) => /"UF";"Nome do Ente/.test(l));
    if (hi < 0) { console.log(`${esfera}: header não encontrado`); continue; }
    const head = splitCsv(lines[hi]);
    const codCols = head.map((h, i) => (/^\d+(\.\d+)*$/.test(h) ? { i, code: h } : null)).filter(Boolean);
    const dataM = lines[0].match(/(\d{2}\/\d{2}\/\d{4})/);
    const dataPesq = dataM ? dataM[1].split("/").reverse().join("-") : null;
    for (let r = hi + 1; r < lines.length; r++) {
      const c = splitCsv(lines[r]);
      if (c[0] !== "SC") continue;
      const ibge = (c[2] || "").replace(/\D/g, "");
      const cod = esfera === "E" ? "42" : cod6.get(ibge.slice(0, 6));
      if (!cod) continue;
      const pend = codCols.filter((cc) => c[cc.i] === "!").map((cc) => cc.code);
      const grupos = [...new Set(pend.map((p) => GRUPO[p[0]] || "Outros"))];
      await q(`INSERT INTO cauc_sc (cod_ibge,data_pesquisa,apto,n_pendencias,pendencias,grupos_pendentes) VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (cod_ibge) DO UPDATE SET data_pesquisa=EXCLUDED.data_pesquisa,apto=EXCLUDED.apto,n_pendencias=EXCLUDED.n_pendencias,pendencias=EXCLUDED.pendencias,grupos_pendentes=EXCLUDED.grupos_pendentes,atualizado=now()`,
        [cod, dataPesq, pend.length === 0, pend.length, pend, grupos]);
      total++;
    }
    console.log(`${esfera}: ${total} entes SC gravados (acum.)`);
  }
  const c = await db.query(`SELECT count(*) t, count(*) FILTER(WHERE apto) aptos, count(*) FILTER(WHERE NOT apto) pend FROM cauc_sc`);
  console.log(`CAUC concluído: ${JSON.stringify(c.rows[0])}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
