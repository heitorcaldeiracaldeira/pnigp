// Referência NACIONAL de preços por CATMAT (Painel de Preços / Compras.gov.br), casada por UNIDADE, para os PDMs
// que classificamos (precos_referencia_sc.catmat_cod). Só unidades SIMPLES (unidade/kg/litro/comprimido…) — evita a
// armadilha da "caixa com 100". Stats: mediana/p25/p75/média/desvio/CV. node scripts/ingest_precos_nacional.mjs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs"; import pg from "pg";
const H = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
// canon de UNIDADE BASE (a unidade "de dentro"); null se desconhecida
const canonBase = (s) => {
  s = String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (/^(un|unidade|und|unid|uni|pc|peca|pç)$/.test(s)) return "unidade";
  if (/^(kg|quilograma|quilo|kilograma)$/.test(s)) return "quilograma";
  if (/^(l|litro|lt)$/.test(s)) return "litro";
  if (/^(ml|mililitro)$/.test(s)) return "mililitro";
  if (/^(g|grama|gr)$/.test(s)) return "grama";
  if (/^(m|metro|mt)$/.test(s)) return "metro";
  if (/^(cp|comprimido|comp|drágea|dragea)$/.test(s)) return "comprimido";
  if (/^(amp|ampola)$/.test(s)) return "ampola";
  if (/^(fr|frasco|fco)$/.test(s)) return "frasco";
  if (/^(par|pares)$/.test(s)) return "par";
  return null;
};
// NORMALIZA por unidade base: se a fornecimento tem capacidade>1 (ex.: caixa c/ 100), valor unitário = preço / capacidade
// (ideia do usuário). Retorna {unit, factor} — o preço será dividido por factor. Base = medida, ou 'unidade' por padrão.
const normUn = (fSigla, fNome, cap, mSigla, mNome) => {
  const c = cap ? +cap : 0;
  if (c > 1) { const base = canonBase(mNome || mSigla) || "unidade"; return { unit: base, factor: c, forma: "escala" }; }
  const u = canonBase(fNome || fSigla); return u ? { unit: u, factor: 1, forma: "avulso" } : null;
};
const stats = (arr) => { const a = arr.slice().sort((x, y) => x - y); const n = a.length; const q = (p) => a[Math.min(n - 1, Math.floor(p * n))]; const media = a.reduce((s, v) => s + v, 0) / n; const dv = Math.sqrt(a.reduce((s, v) => s + (v - media) ** 2, 0) / n); return { mediana: q(0.5), p25: q(0.25), p75: q(0.75), media, desvio: dv, cv: media ? dv / media : 0, n }; };

await db.query("DROP TABLE IF EXISTS precos_nacional_ref");
await db.query(`CREATE TABLE precos_nacional_ref (codigo_pdm INTEGER, unidade TEXT, forma TEXT, mediana NUMERIC, p25 NUMERIC, p75 NUMERIC, media NUMERIC, desvio NUMERIC, cv NUMERIC, n_obs INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (codigo_pdm, unidade, forma))`);
const pdms = (await db.query("SELECT DISTINCT catmat_cod FROM precos_referencia_sc WHERE catmat_cod IS NOT NULL AND catmat_sim >= 0.5")).rows.map((r) => r.catmat_cod);
console.log(`${pdms.length} PDMs classificados a buscar no Painel de Preços…`);
// ═══ A API MUDOU DE FORMA, E O SCRIPT FALHAVA EM SILÊNCIO (consertado em 02/set/2026) ═══
// A chamada antiga era `?codigoItemCatalogo=X`. Esse parâmetro NÃO EXISTE MAIS: a API refatorou o antigo
// NOME de parâmetro em VALOR de um novo par obrigatório — `tipo` (enum codigoItemCatalogo|codigoPdm) +
// `codigo`. Sem eles a rota devolve 404.
// O `catch` abaixo engolia esse 404, tentava 3 vezes e devolvia lista vazia. Resultado medido em 02/set:
// `precos_nacional_ref` VAZIA, o orquestrador re-disparando o script todo ciclo (o `devido` dele dispara
// justamente quando a tabela está vazia) e ~4.220 chamadas por rodada para não gravar nada — sem UMA
// mensagem de erro. Retentativa que termina em lista vazia transforma rota morta em resultado legítimo.
// ⚠️ Um `catch` que devolve vazio precisa DISTINGUIR "não há dado" de "não consegui perguntar".
// AGORA CONSULTA POR PDM DIRETO. Antes o script pegava 4 itens do catálogo como aproximação do PDM; a API
// aceita `tipo=codigoPdm`, então é 1 chamada em vez de 4, com cobertura maior e sem a aproximação.
// tamanhoPagina=500 (o máximo) em vez de 100: mesma chamada, 5× a amostra.
// ⚠️ Continua sendo a PRIMEIRA página, não o universo — PDM comum tem milhares de registros (FILTRO AR:
// 6.789). É amostra por ordem da API, e isso limita o que a mediana representa.
let httpErros = 0;
const getP = async (pdm) => {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial?pagina=1&tamanhoPagina=500&tipo=codigoPdm&codigo=${pdm}`, { headers: H });
      if (!r.ok) { if (t === 2) httpErros++; throw new Error(`HTTP ${r.status}`); }
      return (await r.json()).resultado || [];
    } catch { await sleep(1000 * (t + 1)); }
  }
  return [];
};
let nRef = 0, done = 0;
for (const pdm of pdms) {
  const porUn = {};
  const rows = await getP(pdm); await sleep(80);
  for (const x of rows) { const nu = normUn(x.siglaUnidadeFornecimento, x.nomeUnidadeFornecimento, x.capacidadeUnidadeFornecimento, x.siglaUnidadeMedida, x.nomeUnidadeMedida); const v = +x.precoUnitario; if (!nu || !(v > 0)) continue; (porUn[nu.unit + "||" + nu.forma] ||= []).push(v / nu.factor); }
  for (const [k, arr] of Object.entries(porUn)) {
    if (arr.length < 5) continue; // mínimo de observações
    const [un, forma] = k.split("||"); const s = stats(arr);
    await db.query("INSERT INTO precos_nacional_ref (codigo_pdm,unidade,forma,mediana,p25,p75,media,desvio,cv,n_obs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (codigo_pdm,unidade,forma) DO UPDATE SET mediana=EXCLUDED.mediana,n_obs=EXCLUDED.n_obs,atualizado=now()", [pdm, un, forma, s.mediana.toFixed(4), s.p25.toFixed(4), s.p75.toFixed(4), s.media.toFixed(4), s.desvio.toFixed(4), s.cv.toFixed(4), s.n]);
    nRef++;
  }
  if (++done % 100 === 0) console.log(`  ${done}/${pdms.length} PDMs · ${nRef} referências nacionais`);
}
const c = (await db.query("SELECT count(*) n, count(DISTINCT codigo_pdm) p FROM precos_nacional_ref")).rows[0];
console.log(`✔ precos_nacional_ref: ${c.n} referências (PDM×unidade) · ${c.p} PDMs`);

// ═══ "NÃO HÁ DADO" ≠ "NÃO CONSEGUI PERGUNTAR" (02/set/2026) ═══
// Foi essa confusão que deixou a tabela vazia sem ninguém ver: a rota morreu, o retry devolveu lista
// vazia, e zero resultado passou por resposta legítima da fonte. Contar as falhas de HTTP e SAIR COM 1
// quando elas dominam é o que transforma rota quebrada em erro visível — e faz a cadeia parar em vez de
// seguir escrevendo nada com cara de sucesso.
await db.end();
if (httpErros > 0) {
  const pct = (100 * httpErros / Math.max(1, pdms.length)).toFixed(1);
  console.error(`\n🚨 ${httpErros} de ${pdms.length} PDMs (${pct}%) falharam no HTTP após 3 tentativas.`);
  if (httpErros > pdms.length * 0.5) {
    console.error("   Mais da METADE falhou: isto não é fonte sem dado, é fonte fora do ar ou rota mudada.");
    console.error("   Rota atual e parâmetros obrigatórios: https://dadosabertos.compras.gov.br/v3/api-docs");
    process.exit(1);
  }
}
