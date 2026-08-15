// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_portal_real.mjs — para municípios cujo `erp` do Radar é o fornecedor do SITE (não do portal de folha),
// descobre o PORTAL DE TRANSPARÊNCIA de verdade e agrupa por fornecedor.
//
// POR QUÊ: "instar" aparece no Radar com 181 municípios sem folha, o que sugere um ERP grande a crackear. Mas a
// Instar faz o CMS do site institucional — o portal de transparência de cada um desses municípios é de outra
// empresa (portaldatransparencia.info, transparencia-hd, acessoainformacao.org…). Tratar o rótulo como ERP levaria
// a escrever um coletor para algo que não existe. Ver [[pnigp-plataforma-rotulo-vs-sistema]].
//
// Uso: ERP=instar node scripts/descobre_portal_real.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { NOME_ESTADO } from "./_uf.mjs";

const db = pool();
const q = withRetry(db);
const ERP = process.env.ERP || "instar";
// ERP=NULO ataca quem o identificador de assinatura NÃO classificou — é o caso mais numeroso num estado ainda
// cru, e é exatamente onde mora o ERP regional desconhecido. UF (sigla) fecha o recorte no estado.
const SEM_ERP = ERP.toUpperCase() === "NULO";
const UF = process.env.UF ? NOME_ESTADO : null;
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

await q(`create table if not exists portal_real_descoberto (
  cod_ibge text, erp_radar text, municipio text, uf text, url_site text, url_portal_real text, fornecedor text,
  em timestamptz default now(), primary key (cod_ibge, erp_radar)
)`);

// domínios que NÃO são portal de transparência municipal
// cdnjs/jsdelivr entraram como "portal" em 51 municípios do fiorilli só porque a URL do CDN contém "cloud"
const RUIDO = /facebook|instagram|twitter|youtube|whatsapp|google|gov\.br\/?$|w3\.org|jquery|bootstrap|fontawesome|radardatransparencia|atricon|tce\.|tcm\.|planalto|receita\.fazenda|cdnjs|jsdelivr|unpkg|cloudflare\.com/i;
const params = SEM_ERP ? [] : [ERP];
const filtroErp = SEM_ERP ? "erp is null" : "erp=$1";
const filtroUf = UF ? `and uf = $${params.push(UF)}` : "";
// prefere a linha da PREFEITURA quando o município tem várias UGs com portal — sem excluir os que só têm câmara,
// que continuam sendo um caminho até o portal do ente.
const alvos = (await q(`select distinct on (cod_ibge) cod_ibge, municipio, uf, url_portal from radar_portal
  where ${filtroErp} and url_portal is not null and url_portal <> '-' ${filtroUf}
  order by cod_ibge, (unidade_gestora ilike 'Prefeitura%') desc`, params)).rows;
console.log(`[${ERP}${UF ? "/" + UF : ""}] ${alvos.length} municípios a investigar`);

const porFornecedor = new Map();
let achou = 0;
for (let i = 0; i < alvos.length; i++) {
  const a = alvos[i];
  let url = null, forn = null;
  try {
    const r = await fetch(a.url_portal, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(35000) });
    const t = new TextDecoder("utf-8").decode(await r.arrayBuffer());
    // links cujo texto OU href fala de transparência
    const cands = [...new Set([...t.matchAll(/https?:\/\/[^"'<>\s]{10,120}/gi)].map((m) => m[0]))]
      .filter((h) => /transpar|portaltransp|acessoainformacao|e-?cidade|govbr|equiplano|betha|elotech|fiorilli|memory|publicsoft|siplanweb|cloud/i.test(h))
      .filter((h) => !RUIDO.test(h));
    // prioriza o que não é o próprio domínio do município
    const host = (() => { try { return new URL(a.url_portal).host.replace(/^www\./, ""); } catch { return ""; } })();
    url = cands.find((h) => !h.includes(host)) || cands[0] || null;
    if (url) { forn = new URL(url).host.replace(/^www\./, ""); achou++; }
  } catch { /* site fora do ar */ }
  await q(`insert into portal_real_descoberto (cod_ibge,erp_radar,municipio,uf,url_site,url_portal_real,fornecedor,em)
    values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge,erp_radar) do update set
    url_portal_real=excluded.url_portal_real, fornecedor=excluded.fornecedor, em=now()`,
    [a.cod_ibge, ERP, a.municipio, a.uf, a.url_portal, url, forn]);
  if (forn) porFornecedor.set(forn, (porFornecedor.get(forn) || 0) + 1);
  if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${alvos.length} · ${achou} com portal`);
}

console.log(`\n[${ERP}] ${achou}/${alvos.length} com portal identificado\n`);
console.log("FORNECEDORES (municípios):");
for (const [f, n] of [...porFornecedor.entries()].sort((x, y) => y[1] - x[1]).slice(0, 25)) {
  console.log(`  ${String(n).padStart(4)}  ${f}`);
}
await db.end();
