// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_radar_atricon.mjs — o cadastro NACIONAL de portais de transparência, do Radar da ATRICON (PNTP).
//
// POR QUE muda o jogo: até aqui, descobrir o portal/ERP de um município era SONDAGEM (testar {slug}.atende.net,
// {slug}.geosiap.net.br…). O Radar já traz a URL REAL do portal de cada uma das 11.697 unidades gestoras do país,
// avaliadas pelos Tribunais de Contas, com o selo de transparência. Classificar por ERP vira LEITURA DE DOMÍNIO,
// não adivinhação ([[pnigp-plataforma-rotulo-vs-sistema]] — aqui o link é o do PORTAL, não o rótulo do PNCP).
//
// FONTE: Qlik Sense do Radar (app c8fbd71a-…, servido por radar.tce.mt.gov.br). O WebSocket direto é recusado
// (Enterprise, exige sessão), mas o hypercube foi extraído pela sessão autenticada da página (enigmaModel) e
// salvo em TSV. Campos: cod_ibge · município · uf · unidade gestora · site · link portal · nível transparência.
//
// A classificação por ERP casa o HOST do link com os padrões conhecidos das receitas ([[pnigp-ipm-atende-folha]],
// [[pnigp-portaltp-epublica-folha]], [[pnigp-geosiap-...]]). Domínio .gov.br próprio = portal do próprio município
// (pode ser qualquer ERP por trás); os que batem com atende.net/geosiap/portaltp/e-publica/betha são coletáveis já.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const ARQ = process.env.ARQ || "C:/Users/PC/radar_atricon.tsv";

await q(`create table if not exists radar_portal (
  cod_ibge text, municipio text, uf text, unidade_gestora text,
  site text, url_portal text, nivel_transparencia text,
  host text, erp text,
  _coletado_em timestamptz default now(),
  primary key (cod_ibge, unidade_gestora)
)`);
await q(`create index if not exists ix_radar_uf on radar_portal (uf)`);
await q(`create index if not exists ix_radar_erp on radar_portal (erp)`);

// classifica o ERP pelo host do link do portal — o domínio denuncia o fornecedor
function erpDoHost(host) {
  if (!host) return null;
  const h = host.toLowerCase();
  if (h.includes("atende.net")) return "ipm";
  if (h.includes("geosiap.net.br")) return "geosiap";
  if (h.includes("portaltp.com.br")) return "portaltp";
  if (h.includes("e-publica.net") || h.includes("epublica")) return "epublica";
  if (h.includes("betha.cloud") || h.includes("betha.com.br")) return "betha";
  if (h.includes("smarapd.com.br")) return "smarapd";
  if (h.includes("governotransparente")) return "aspec";
  if (h.includes("elotech")) return "elotech";
  if (h.includes("fiorilli")) return "fiorilli";
  if (h.includes("publicsoft")) return "publicsoft";
  if (h.includes("memory.com.br")) return "memory";
  if (h.includes("siplanweb") || h.includes("cecam")) return "cecam";
  if (h.includes("layout") || h.includes("instarmob")) return "instar";
  return null; // .gov.br próprio ou desconhecido
}
const hostDe = (url) => { try { return new URL(url.startsWith("http") ? url : "https://" + url).host; } catch { return null; } };

// o arquivo veio como UMA linha JSON com \t e \n literais — desescapa
let bruto = fs.readFileSync(ARQ, "utf8").trim();
if (bruto.startsWith('"')) bruto = JSON.parse(bruto);          // era um JSON-string
const linhas = bruto.split("\n").map((l) => l.split("\t")).filter((c) => c.length >= 7 && /^\d{7}$/.test(c[0]));
console.log(`[radar] ${linhas.length} unidades gestoras no arquivo`);

const LOTE = 1000;
let gravadas = 0;
for (let i = 0; i < linhas.length; i += LOTE) {
  const p = linhas.slice(i, i + LOTE).map((c) => {
    const [cod, mun, uf, ug, site, link, nivel] = c;
    const url = (link && link !== "-") ? link : (site && site !== "-" ? site : null);
    const host = url ? hostDe(url) : null;
    return { cod, mun, uf, ug, site: site === "-" ? null : site, url, nivel, host, erp: erpDoHost(host) };
  });
  await q(`insert into radar_portal (cod_ibge,municipio,uf,unidade_gestora,site,url_portal,nivel_transparencia,host,erp)
    select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],$9::text[])
    on conflict (cod_ibge, unidade_gestora) do update set url_portal=excluded.url_portal,
      nivel_transparencia=excluded.nivel_transparencia, host=excluded.host, erp=excluded.erp, _coletado_em=now()`,
    [p.map((x) => x.cod), p.map((x) => x.mun), p.map((x) => x.uf), p.map((x) => x.ug), p.map((x) => x.site),
     p.map((x) => x.url), p.map((x) => x.nivel), p.map((x) => x.host), p.map((x) => x.erp)]);
  gravadas += p.length;
}
console.log(`[radar] ${gravadas} gravadas`);

console.log("\n═══ ERP identificado pelo domínio do portal (só prefeituras) ═══");
console.table((await q(`select coalesce(erp,'(portal próprio/desconhecido)') erp,
  count(*) unidades, count(distinct cod_ibge) municipios
  from radar_portal where unidade_gestora ilike 'Prefeitura%' group by 1 order by 2 desc limit 20`)).rows);

console.log("═══ os ERPs que já sabemos coletar ═══");
console.table((await q(`select erp, count(distinct cod_ibge) municipios, count(distinct uf) ufs
  from radar_portal where erp is not null group by 1 order by 2 desc`)).rows);

console.log("═══ cobertura do Radar por selo ═══");
console.table((await q(`select nivel_transparencia, count(*) unidades from radar_portal group by 1 order by 2 desc`)).rows);

await db.end();
