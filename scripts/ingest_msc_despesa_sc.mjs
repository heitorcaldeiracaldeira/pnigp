// ETL — MSC ANCORADA AO RREO. A MSC dá a FORMA (distribuição do empenhado por natureza e por fonte de recursos);
// o RREO dá a MAGNITUDE (total oficial exato). Ancoramos a forma ao total → reconcilia por construção.
// node scripts/ingest_msc_despesa_sc.mjs   (ANO opcional=2024; ENTES opcional=lista; SO_FLORIPA=1 p/ teste)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const MSC = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/msc_orcamentaria";
const ANO = Number(process.env.ANO || 2024);
const MES = Number(process.env.MES || 12); // 12 = ano fechado; para ano corrente (parcial) usar o último mês publicado
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

const GRUPO = { "1": "Pessoal e Encargos", "2": "Juros e Encargos da Dívida", "3": "Outras Despesas Correntes", "4": "Investimentos", "5": "Inversões Financeiras", "6": "Amortização da Dívida" };
// fonte de recursos — binário DEFENSÁVEL: livres × vinculados (1º dígito 5=não vinculado; 6/7=vinculado).
// Não detalhamos saúde/educação por fonte porque o código novo (Portaria STN 710/2021) exige a tabela oficial
// de-para; surfacar split impreciso quebraria a confiança. Livres×vinculados é seguro e reconcilia.
function rotuloFonte(cod) {
  const c = String(cod || "").replace(/\D/g, "");
  const d = c.length >= 4 ? c[1] : c[0]; // 1º dígito do grupo de fonte (15xx→5 livre; 16/17xx→6/7 vinculado)
  return d === "5" ? "Recursos não vinculados (livres)" : "Recursos vinculados";
}

async function mscEmpenhado(ente) {
  // soma o empenhado (Crédito Empenhado 6.2.2.1.3.04) por grupo de natureza e por fonte
  const porGrupo = {}, porFonte = {}; let total = 0, offset = 0;
  while (offset < 200000) {
    let j = null;
    for (let t = 0; t < 4; t++) { try { const r = await fetch(`${MSC}?an_referencia=${ANO}&me_referencia=${MES}&id_ente=${ente}&co_tipo_matriz=MSCC&classe_conta=6&id_tv=ending_balance&offset=${offset}&limit=5000`, { signal: AbortSignal.timeout(60000) }); if (r.ok) { j = await r.json(); break; } } catch {} await sleep(1500 * (t + 1)); }
    if (!j) return null;
    for (const x of (j.items || [])) {
      if (!String(x.conta_contabil).startsWith("6221304")) continue;
      const sinal = String(x.natureza_conta || "").toUpperCase().startsWith("D") ? 1 : -1;
      const v = sinal * (Number(x.valor) || 0); if (!v) continue;
      const nd = String(x.natureza_despesa || ""); const g = GRUPO[nd[1]] || "Outras Despesas Correntes";
      porGrupo[g] = (porGrupo[g] || 0) + v;
      const f = rotuloFonte(x.fonte_recursos); porFonte[f] = (porFonte[f] || 0) + v;
      total += v;
    }
    if (!j.hasMore) break; offset += 5000;
  }
  return { porGrupo, porFonte, total: Math.abs(total) };
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS msc_despesa_sc (cod_ibge TEXT, ano INT, tipo TEXT, categoria TEXT, valor NUMERIC, total_rreo NUMERIC, atualizado timestamptz DEFAULT now(), PRIMARY KEY (cod_ibge, ano, tipo, categoria))`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };
  let entes = (await db.query(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' AND uf='SC' ORDER BY cod_ibge`)).rows.map((r) => r.cod_ibge);
  if (process.env.SO_FLORIPA) entes = ["4205407"];
  if (process.env.ENTES) entes = process.env.ENTES.split(",");

  let ok = 0;
  for (const ente of entes) {
    let rreo = Number((await db.query(`SELECT sum(empenhado) e FROM despesa_subfuncao_sc WHERE cod_ibge=$1 AND ano=$2`, [ente, ANO])).rows[0]?.e || 0);
    if (!rreo) rreo = Number((await db.query(`SELECT despesa_empenhada e FROM acompanhamento_sc WHERE cod_ibge=$1 AND ano=$2`, [ente, ANO])).rows[0]?.e || 0); // ano corrente (parcial): âncora no empenhado do RREO do bimestre
    if (!rreo) continue;
    const msc = await mscEmpenhado(ente);
    if (!msc || !msc.total) continue;
    const fator = rreo / msc.total; // ÂNCORA: escala a forma da MSC ao total exato do RREO
    await q(`DELETE FROM msc_despesa_sc WHERE cod_ibge=$1 AND ano=$2`, [ente, ANO]);
    for (const [tipo, mapa] of [["natureza", msc.porGrupo], ["fonte", msc.porFonte]])
      for (const [cat, v] of Object.entries(mapa))
        await q(`INSERT INTO msc_despesa_sc (cod_ibge,ano,tipo,categoria,valor,total_rreo) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (cod_ibge,ano,tipo,categoria) DO UPDATE SET valor=EXCLUDED.valor,total_rreo=EXCLUDED.total_rreo,atualizado=now()`,
          [ente, ANO, tipo, cat, Math.round(Math.abs(v) * fator), rreo]);
    ok++;
    if (ok % 25 === 0) console.log(`  ${ok} municípios`);
    if (process.env.SO_FLORIPA) {
      console.log(`Floripa ${ANO} — RREO total ${(rreo / 1e6).toFixed(1)}mi · MSC total ${(msc.total / 1e6).toFixed(1)}mi · fator ${fator.toFixed(4)}`);
      console.log("  por natureza (ancorado):"); for (const [g, v] of Object.entries(msc.porGrupo).sort((a, b) => b[1] - a[1])) console.log(`    ${g}: ${(Math.abs(v) * fator / 1e6).toFixed(1)}mi`);
      console.log("  por fonte (ancorado):"); for (const [f, v] of Object.entries(msc.porFonte).sort((a, b) => b[1] - a[1])) console.log(`    ${f}: ${(Math.abs(v) * fator / 1e6).toFixed(1)}mi`);
    }
  }
  console.log(`Concluído ${ANO}: ${ok} municípios ancorados ao RREO`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
