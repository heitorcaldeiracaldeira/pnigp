// Reclassifica `folha_host_candidato` pela URL COMPLETA, agora que ela está gravada inteira.
//
// ⭐ A prova costuma estar na própria URL — só é preciso lê-la com a assinatura certa:
//    `AcessoIndividual=` em qualquer caminho  → SCPI ([[pnigp-varredura-host-porta-onpremise]])
//    `/ssfolha/`                              → SS Transparência (módulo de FOLHA)
//    `/datapublic/`                           → DataPublic
// 🚨 E o inverso também: `/login`, `/contracheque`, `trabalhador` e webmail (:2096) são PORTAL DO SERVIDOR ou
//    outra coisa — não transparência. Marcar como tal evita gastar coletor com porta errada
//    ([[pnigp-rotulo-erp-nao-e-o-portal-da-folha]]).
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RN";

const REGRAS = [
  [/AcessoIndividual=/i, "scpi"],
  [/\/ssfolha\/|sstransparenciamunicipal/i, "sstransparencia"],
  [/\/datapublic\//i, "datapublic"],
  [/elmartecnologia|publicsoft/i, "publicsoft"],
  [/e-publica|portaltp/i, "portaltp"],
  [/municipioonline/i, "municipioonline"],
  [/elotech/i, "elotech"],
  [/atende\.net/i, "ipm"],
  // ⛔ não são transparência
  [/:2096|webmail|\/roundcube/i, "webmail (falso positivo)"],
  [/\/login|trabalhador\/login|\/contracheque\//i, "portal do servidor (login)"],
  [/ProtocoloPortal|\/protocolo/i, "protocolo (não é folha)"],
];

const linhas = (await q(`select cod_ibge, municipio, produto, url from folha_host_candidato where uf = $1`, [UF])).rows;
let mudou = 0;
for (const l of linhas) {
  const novo = (REGRAS.find(([re]) => re.test(String(l.url))) || [])[1];
  if (!novo || novo === l.produto) continue;
  // só sobrescreve 'desconhecido' — não desfaz classificação já provada
  if (l.produto !== "desconhecido") continue;
  await q(`update folha_host_candidato set produto = $2, achado_via = 'reclassificado pela URL completa', em = now()
           where cod_ibge = $1`, [l.cod_ibge, novo]);
  console.log(`   ${l.municipio.padEnd(24)} desconhecido → ${novo}`);
  mudou++;
}
console.log(`\n${mudou} reclassificados`);
console.table((await q(`select produto, count(*)::int municipios from folha_host_candidato
  where uf = $1 group by 1 order by 2 desc`, [UF])).rows);
await db.end();
