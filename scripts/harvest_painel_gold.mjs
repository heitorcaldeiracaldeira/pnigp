// COLETOR DE GABARITO — Painel de Preços federal (dadosabertos.compras.gov.br) como corpus rotulado real.
// Resolve a raiz do problema de classificação: SC não publica CATMAT (0 rótulos), e o catálogo está em linguagem
// formal ≠ da compra real. A API federal, consultada por codigoItemCatalogo, devolve a descrição QUE O COMPRADOR
// DIGITOU (descricaoItem) já casada com o CATMAT verdadeiro (codigoPdm/codigoClasse). Cada registro é um par
// rotulado (descrição coloquial → PDM) em escala nacional — treino E gabarito de teste para medir acurácia honesta.
// Amostra os PDMs de MAIOR volume de compra em SC (peso por item_catmat_map.n_itens) → gabarito representativo.
//   node scripts/harvest_painel_gold.mjs           (piloto: N_PDM=800)
//   N_PDM=4090 node scripts/harvest_painel_gold.mjs (varredura completa dos PDMs relevantes a SC)
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const N_PDM = Number(process.env.N_PDM || 800);       // quantos PDMs (por volume SC) coletar
const PAG = Number(process.env.TAM_PAGINA || 100);     // registros por item (10..500)
const MAX_ITENS_PDM = 3;                               // tenta até 3 itens do PDM até obter registros
const H = { "Accept": "application/json", "User-Agent": "Mozilla/5.0 (compatible; PNIGP/1.0)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getRecs(item) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial?pagina=1&tamanhoPagina=${PAG}&codigoItemCatalogo=${item}`, { headers: H });
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (t + 1)); continue; }
      if (!r.ok) return [];
      return (await r.json()).resultado || [];
    } catch { await sleep(1000 * (t + 1)); }
  }
  return [];
}

async function main() {
  const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 });
  db.on("error", () => {});
  const c = await db.connect();
  await c.query(`CREATE TABLE IF NOT EXISTS painel_gold (
    id_compra_item TEXT PRIMARY KEY, descricao_item TEXT, descricao_detalhada TEXT,
    codigo_item BIGINT, codigo_pdm INT, nome_pdm TEXT, codigo_classe INT, nome_classe TEXT,
    marca TEXT, unidade TEXT, preco_unitario NUMERIC, uf TEXT, coletado TIMESTAMPTZ DEFAULT now())`);

  // PDMs de maior volume de compra em SC (o gabarito deve super-representar o que SC compra)
  const pdms = (await c.query(
    `SELECT codigo_pdm, sum(n_itens) vol FROM item_catmat_map WHERE codigo_pdm IS NOT NULL
     GROUP BY 1 ORDER BY vol DESC LIMIT ${N_PDM}`)).rows;
  console.log(`alvo: ${pdms.length} PDMs (top volume SC) · ${PAG} regs/item · até ${MAX_ITENS_PDM} itens/PDM`);

  let nRec = 0, nPdmOk = 0, t0 = Date.now();
  for (let i = 0; i < pdms.length; i++) {
    const pdm = pdms[i].codigo_pdm;
    const itens = (await c.query(`SELECT codigo_item FROM catmat_catalogo WHERE codigo_pdm=$1 ORDER BY codigo_item LIMIT ${MAX_ITENS_PDM}`, [pdm])).rows.map((r) => r.codigo_item);
    let got = 0;
    for (const item of itens) {
      const recs = await getRecs(item);
      await sleep(250);
      if (!recs.length) continue;
      const vals = [], ph = [];
      recs.forEach((x) => {
        if (x.idCompraItem == null || !x.descricaoItem) return;
        const o = ph.length * 12;
        ph.push(`($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9},$${o+10},$${o+11},$${o+12})`);
        vals.push(String(x.idCompraItem), x.descricaoItem, x.descricaoDetalhadaItem || null, x.codigoItemCatalogo || item,
          x.codigoPdm ?? pdm, x.nomePdm || null, x.codigoClasse || null, x.nomeClasse || null, x.marca || null,
          x.nomeUnidadeMedida || x.siglaUnidadeMedida || null, x.precoUnitario ?? null, x.estado || null);
      });
      if (!ph.length) continue;
      const sql = `INSERT INTO painel_gold (id_compra_item,descricao_item,descricao_detalhada,codigo_item,codigo_pdm,nome_pdm,codigo_classe,nome_classe,marca,unidade,preco_unitario,uf)
        VALUES ${ph.join(",")} ON CONFLICT (id_compra_item) DO NOTHING`;
      const res = await c.query(sql, vals);
      nRec += res.rowCount; got += res.rowCount;
      if (got >= 10) break; // já temos exemplos suficientes desse PDM
    }
    if (got) nPdmOk++;
    if (i % 25 === 0 || i === pdms.length - 1) {
      const dt = Math.round((Date.now() - t0) / 1000);
      console.log(`  ${i + 1}/${pdms.length} PDMs · ${nPdmOk} com dados · ${nRec.toLocaleString()} pares · ${dt}s`);
    }
  }
  const s = (await c.query(`SELECT count(*) n, count(DISTINCT codigo_pdm) pdms, count(DISTINCT codigo_classe) classes FROM painel_gold`)).rows[0];
  console.log(`\n✔ painel_gold: ${(+s.n).toLocaleString()} pares · ${s.pdms} PDMs · ${s.classes} classes`);
  c.release(); await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
