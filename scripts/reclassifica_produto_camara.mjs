// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// reclassifica_produto_camara.mjs — reconhece o produto pela URL JÁ VISITADA, sem tocar na rede.
//
// POR QUÊ: o `diagnostica_faltantes.mjs` carrega uma lista de assinaturas de 2026-07 e o projeto crackeou vários
// produtos depois dela. Resultado: câmaras com dados caíram como "(não identificado)" tendo coletor pronto —
// `web.qualitysistemas.com.br` (6), `transparenciacidadao.com.br` (2), `sgpcloud.net:9317` (SCPI)…
// A ROTA identifica o produto, e a rota já está gravada ([[pnigp-rota-identifica-o-produto-nao-o-host]]).
//
// ⚠️ Só reclassifica quem está SEM produto — nunca sobrescreve veredito de produto já dado.
//
// Uso: node scripts/reclassifica_produto_camara.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);

// cada linha: [regex sobre a URL, produto]. A ordem importa: o mais específico primeiro.
const PRODUTOS = [
  ["portaltransparencia\\.app\\.br", "itsolucoes"],
  ["qualitysistemas", "quality"],
  ["transparenciacidadao", "transpcidadao"],
  ["sgpcloud|dcfiorilli|-scpi\\.|:(8079|5656|879)/|aossoftware|transparenciacm", "scpi"],
  ["megasoft", "megasoft"],
  ["portaltp\\.com\\.br", "portaltp"],
  ["acessoainformacao|nucleogov", "nucleogov"],
  ["atende\\.net", "ipm"],
  ["eloweb|elotech|oxy\\.", "elotech"],
  ["betha|e-gov\\.betha", "betha"],
  ["ilai\\.memory|lai\\.memory|memory\\.com\\.br", "memory"],
  ["folha\\.governotransparente|portalcr2", "cr2"],
  ["governotransparente|aspec\\.com\\.br|portaldoservidor\\.aspec", "aspec"],
  ["equiplano", "equiplano"],
  ["multi24", "multi24"],
  ["abase\\.com\\.br", "abase"],
  ["cittaweb|/citta/", "citta"],
  ["sinsoft", "sinsoft"],
  ["digifred", "digifred"],
  ["sys523|cecam", "cecam"],
  ["publicsoft|elmar", "publicsoft"],
  ["gpecloud", "gpecloud"],
  ["siplanweb", "siplanweb"],
  ["geosiap", "geosiap"],
  ["smarapd", "smarapd"],
  ["tenosoft", "tenosoft"],
  ["hardsoft", "hardsoft"],
  ["cidadesmg", "cidadesmg"],
  ["agili", "agili"],
  ["sai2\\.io\\.org\\.br", "saiio"],
  ["eddydata", "eddydata"],
  // blocos NOVOS, ainda sem coletor — nomear é o primeiro passo para agrupar
  ["transparencia-am\\.com\\.br", "transparencia-am (novo)"],
  ["quadrofuncional\\.faces", "jsf-quadrofuncional (novo)"],
  ["flsistemas", "flsistemas (novo)"],
  ["transparencia\\.[a-z0-9-]+\\.pe\\.leg\\.br", "pe-leg-whitelabel (novo)"],
];

let total = 0;
for (const [re, produto] of PRODUTOS) {
  const r = await q(`update folha_diagnostico_camara set produto = $2
     where produto is null and coalesce(url_pessoal, url_visitada) ~* $1`, [re, produto]);
  if (r.rowCount) { console.log(`  ${produto.padEnd(26)} ${r.rowCount}`); total += r.rowCount; }
}
console.log(`\n${total} câmaras reclassificadas pela URL (sem uma requisição sequer)`);

console.table((await q(`select coalesce(produto,'(ainda sem produto)') produto,
    count(*)::int camaras, count(*) filter (where veredito='tem_dados')::int com_dados
  from folha_diagnostico_camara group by 1 order by 3 desc, 2 desc limit 18`)).rows);
await db.end();
