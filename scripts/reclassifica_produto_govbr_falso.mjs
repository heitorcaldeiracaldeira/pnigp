// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// reclassifica_produto_govbr_falso.mjs — conserta o PRODUTO no radar de quem está marcado `govbr` e não é.
//
// POR QUÊ (23/ago/2026): o coletor de dados abertos do GovBR fechou 227 municípios como `sem_api`. Parte era
// host errado — resolvido por `descobre_host_govbr.mjs`. A outra parte é mais séria: **o município não usa
// GovBR**. Lendo o site de 312 deles: 146 são GovBR de verdade, e os demais apontam para Habeas Data, RHWeb,
// portaldeservicos, IPM, SCPI… O radar os classificou errado e o coletor foi mandado procurar API que não existe.
//
// ⭐ A pergunta que este script responde é a barata: **quantos deles já têm coletor pronto?** Reclassificar não
//    é o fim — é o que faz o município cair na fila do coletor certo ([[pnigp-catalogo-ja-tinha-a-camara]]).
//
// 🚨 SÓ RECLASSIFICA COM ASSINATURA ÚNICA. Se o HTML casa com dois produtos, não dá para saber qual serve a
//    folha — fica de fora e entra no relatório. Chutar aqui é como o radar chegou a apontar site institucional
//    como portal de sistema ([[pnigp-fornecedor-e-host-nao-erp]], [[pnigp-portal-real-vs-remetente-erp]]).
//
// Uso: node scripts/reclassifica_produto_govbr_falso.mjs           (só relata)
//      APLICAR=1 node scripts/reclassifica_produto_govbr_falso.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";
const CONC = Number(process.env.CONC || 6);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" };

// assinatura → produto. A ordem não importa: exige-se casamento ÚNICO.
const MARCAS = [
  [/cidade360\.cloud|govbr\.cloud/i, "govbr"],
  [/transparencia-hd\.com\.br|habeasdata/i, "transphd"],
  [/dcfiorilli|[a-z0-9-]+-scpi\.|:8079\/|:5656\//i, "scpi"],
  [/atende\.net/i, "ipm"],
  [/i?lai\.memory\.com\.br/i, "memory"],
  [/e-gov\.betha\.com\.br|betha\.com\.br\/transparencia/i, "betha"],
  [/siplanweb/i, "siplanweb"],
  [/portaltp\.com\.br/i, "portaltp"],
  [/megasofttransparencia/i, "megasoft"],
  [/nucleogov/i, "nucleogov"],
  [/publicsoft/i, "publicsoft"],
  [/portaldeservicos\.app/i, "portaldeservicos"],
  [/rhweb/i, "rhweb"],
  // ⭐ 23-24/ago: assinaturas aprendidas ao investigar os 36 portais com folha provada e produto desconhecido.
  //    Cada uma destas já tem coletor no projeto — reconhecer a marca é o que põe o município na fila certa.
  [/transparenciacidadao\.com\.br/i, "transpcidadao"],
  [/cidadesmg\.com\.br/i,            "cidadesmg"],
  [/transparenciafacil\.com\.br/i,   "transpfacil"],
  [/rpmsolucoes\.com\.br/i,          "rpm"],
  [/e-publica\.net/i,                "epublica"],
  [/agilirn\.com\.br/i,              "agili"],
  [/governotransparente\.com\.br/i,  "aspec_nom"],
  [/eloweb|elotech/i,                "elotech"],
  [/municipioonline/i,               "municipioonline"],
  [/multi24h?/i,                     "multi24"],
  [/sgpcloud\.net/i,                 "scpi"],
  [/asp\.srv\.br|etransparencia/i,   "etransparencia"],
  [/gpcloud|gpecloud/i,              "gpecloud"],
  [/tcgestao/i,                      "tcgestao"],
  [/consfolha/i,                     "consfolha"],
  [/dbseller/i,                      "dbseller"],
  [/portaltransparencia\.tech|transparenciaweb/i, "transparenciaweb"],
];

const alvos = (await q(`select distinct on (cod_ibge) cod_ibge, municipio, uf, detalhe
   from folha_govbrda_coleta where situacao = 'sem_api' order by cod_ibge, em desc`)).rows;
console.log(`[reclassifica] ${alvos.length} municípios marcados govbr com sem_api · concorrência ${CONC}`);

const unicos = [], ambiguos = [], nenhum = [];
for (let i = 0; i < alvos.length; i += CONC) {
  await Promise.all(alvos.slice(i, i + CONC).map(async (a) => {
    const base = String(a.detalhe || "").match(/https?:\/\/[^\s]+/);
    if (!base) return;
    try {
      const r = await fetch(base[0], { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
      if (!r.ok) return;
      const t = await r.text();
      const casou = [...new Set(MARCAS.filter(([re]) => re.test(t)).map(([, n]) => n))];
      if (casou.length === 1) unicos.push({ ...a, produto: casou[0] });
      else if (casou.length > 1) ambiguos.push({ ...a, produtos: casou.join(" + ") });
      else nenhum.push(a);
    } catch { /* site fora do ar não é ausência de produto */ }
  }));
  if (i % (CONC * 10) === 0) process.stdout.write(`   ${i}/${alvos.length}\r`);
}

const naoGovbr = unicos.filter((x) => x.produto !== "govbr");
console.log(`\n${unicos.length} com assinatura ÚNICA · ${ambiguos.length} ambíguos · ${nenhum.length} sem assinatura conhecida`);
console.log(`⭐ ${naoGovbr.length} estão classificados como govbr e NÃO são:`);
console.table(Object.entries(naoGovbr.reduce((a, x) => { a[x.produto] = (a[x.produto] || 0) + 1; return a; }, {}))
  .map(([produto, n]) => ({ produto, municipios: n })).sort((a, b) => b.municipios - a.municipios));
if (ambiguos.length) {
  console.log(`\n⚠️ ambíguos (dois produtos no mesmo site) — NÃO reclassificados:`);
  console.table(ambiguos.slice(0, 10).map((x) => ({ uf: x.uf, municipio: x.municipio, produtos: x.produtos })));
}

if (!APLICAR) { console.log("\n(só relatório — APLICAR=1 grava erp em radar_portal)"); await db.end(); process.exit(0); }
let n = 0;
for (const a of naoGovbr) {
  const r = await q(`update radar_portal set erp = $2,
       erp_via = 'assinatura única lida no site do município (reclassifica_produto_govbr_falso)'
     where cod_ibge = $1 and unidade_gestora ilike 'Prefeitura%' and erp = 'govbr'`, [a.cod_ibge, a.produto]);
  n += r.rowCount;
}
console.log(`\n✅ ${n} linhas do radar reclassificadas`);
await db.end();
