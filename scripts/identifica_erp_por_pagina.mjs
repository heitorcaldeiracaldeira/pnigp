// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// identifica_erp_por_pagina.mjs — para cada portal do Radar, VISITA a página e identifica o ERP pela assinatura.
//
// POR QUE, e não classificar só pelo host: o Radar cadastra o domínio INSTITUCIONAL do município
// (`acrelandia.ac.gov.br`), não o do ERP. A home, porém, LINKA o portal de transparência real — e o link entrega
// o fornecedor: `transparencia.betha.cloud/#/{hash}`, `{slug}.atende.net`, `geosiap.net.br`, `portaltp.com.br`…
// ⭐ Achado de calibração: municípios que a varredura do IPM marcou (atende.net respondeu) tinham, na verdade, a
// folha na BETHA — o site institucional aponta para lá. O link manda, não a sonda de subdomínio
// ([[pnigp-link-sistema-origem-fonte-do-portal]]).
//
// Prioriza pelo SELO do Radar: Diamante/Ouro/Prata primeiro — são os que publicam folha de fato.
// Grava o ERP e a URL REAL do portal em radar_portal (colunas erp e url_erp), sem tocar no cadastro original.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { NOME_ESTADO } from "./_uf.mjs";

const db = pool();
const q = withRetry(db);
const CONC = Number(process.env.CONC || 10);
// os selos com acento chegam SEM acento pelo .cmd (ASCII puro) — de-para para o valor real do banco.
// SELO=TODOS varre o país inteiro independente do selo (inclui Não Avaliado/Inexistente que têm portal).
const SELO_MAP = { intermediario: "Intermediário", basico: "Básico", inicial: "Inicial",
  "nao avaliado": "Não Avaliado", inexistente: "Inexistente" };
const TODOS = String(process.env.SELO || "").toUpperCase() === "TODOS";
const SO_SELO = (process.env.SELO ?? "Diamante,Ouro,Prata,Elevado").split(",")
  .map((s) => s.trim()).map((s) => SELO_MAP[s.toLowerCase()] || s);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

await q(`alter table radar_portal add column if not exists url_erp text`);
await q(`alter table radar_portal add column if not exists erp_via text`);   // 'host' | 'link' | 'assinatura'
await q(`alter table radar_portal add column if not exists checado_em timestamptz`);

// Assinaturas por fornecedor: um regex para o LINK do portal (mais forte) e um para menção solta no HTML.
// A ordem importa: o link do portal de transparência vence a menção genérica.
const FORNECEDORES = [
  { erp: "betha",    link: /transparencia\.betha\.cloud\/#\/([A-Za-z0-9+/=_-]+)/i,   texto: /betha\.cloud|betha sistemas/i },
  { erp: "ipm",      link: /https?:\/\/([a-z0-9-]+)\.atende\.net/i,                   texto: /atende\.net|ipm sistemas/i },
  { erp: "geosiap",  link: /https?:\/\/([a-z0-9-]+)\.geosiap\.net\.br/i,              texto: /geosiap|grupo embras/i },
  { erp: "portaltp", link: /https?:\/\/([a-z0-9-]+)\.portaltp\.com\.br/i,            texto: /portaltp/i },
  // 🚨 O slug do e-Pública usa UNDERSCORE (`bela_vista_caroba`, `bom_jesus_sul`) e a classe [a-z0-9-] parava no
  // primeiro `_` — o Radar guardava "bela"/"bom" e o coletor batia num portal que não existe (rows:[] com HTTP 200,
  // o soft-404 de [[pnigp-sonda-soft404-falso-positivo]]). Corrigido em 15/ago/2026.
  { erp: "epublica", link: /e-publica\.net\/epublica-portal\/#\/([a-z0-9_-]+)/i,     texto: /e-publica\.net/i },
  { erp: "smarapd",  link: /transparencia-([a-z0-9-]+)\.smarapd\.com\.br/i,          texto: /smarapd/i },
  { erp: "aspec",    link: /governotransparente\.com\.br/i,                          texto: /aspec inform|governotransparente/i },
  { erp: "elotech",  link: /([a-z0-9-]+)\.elotech\.com\.br/i,                        texto: /elotech/i },
  { erp: "fiorilli", link: /([a-z0-9-]+)\.fiorilli\.com\.br/i,                       texto: /fiorilli/i },
  { erp: "memory",   link: /([a-z0-9-]+)\.memory\.com\.br/i,                         texto: /memory\.com\.br/i },
  { erp: "instar",   link: /([a-z0-9-]+)\.instarmob\.com\.br|instar\.com\.br/i,      texto: /instar/i },
  { erp: "equiplano",link: /([a-z0-9-]+)\.equiplano/i,                               texto: /equiplano/i },
  { erp: "publicsoft",link: /publicsoft\.com\.br|([a-z0-9-]+)\.elmartecnologia\.com\.br|transparencia\.elmartecnologia\.com\.br/i, texto: /publicsoft|elmar tecnologia/i },
  { erp: "govbr",    link: /(webapp\d*-?[a-z0-9-]*\.cidade360\.cloud|[a-z0-9-]+\.govbr\.cloud|\/pronimtb\/)/i, texto: /governan[çc]a\s*brasil|govbr|cidade\s*360|pronim/i },
  { erp: "rpm",      link: /([a-z0-9-]+\.)?rpmsolucoes\.com\.br/i,                     texto: /rpm solu[çc]|rpmsolucoes/i },
  { erp: "cr2",      link: /([a-z0-9-]+)\.cr2transparencia\.com\.br/i,               texto: /cr2transparencia|cr2\.co/i },
  { erp: "el",       link: /https?:\/\/transparencia\.[a-z0-9.-]+\/el\//i,           texto: /el produ|elonline/i },
  // ERPs regionais do Norte/Nordeste, revelados pela varredura dos Diamante não-identificados
  { erp: "portabilis",link:/([a-z0-9-]+)\.portabilis\.com\.br/i,                     texto: /portabilis|ieducar/i },
  { erp: "megasoft", link: /([a-z0-9-]+)\.megasoft(transparencia|arrecadanet|servicos)?\.com\.br/i, texto: /megasoft|grupomegas/i },
  { erp: "nucleogov",link: /([a-z0-9-]+\.)?nucleogov\.com\.br/i,                     texto: /nucleogov/i },
  { erp: "prodata",  link: /([a-z0-9-]+)\.prodataweb\.inf\.br/i,                     texto: /prodata/i },
  { erp: "prefmoderna",link:/([a-z0-9-]+)\.prefeituramoderna\.com\.br/i,             texto: /prefeitura moderna/i },
  { erp: "layout",   link: /layout(online|sistemas)\.[a-z.]+/i,                      texto: /layout sistemas|layout brasil/i },
  { erp: "mpweb",    link: /([a-z0-9-]+)\.mpweb\.com\.br/i,                          texto: /mpweb/i },
  { erp: "eliemes",  link: /([a-z0-9-]+)\.eliemesystem\.com\.br/i,                   texto: /eliemesystem/i },
  { erp: "7focus",   link: /([a-z0-9-]+)\.7focus\.inf\.br/i,                         texto: /7focus/i },
  { erp: "publicaro",link: /([a-z0-9-]+)?publica-ro\.com\.br/i,                      texto: /publica-ro/i },
  { erp: "abaco",    link: /([a-z0-9-]+)\.abaco\.com\.br|abaco\.pa\.gov/i,           texto: /[áa]baco/i },
  // 2ª leva de fornecedores regionais, revelados na amostra dos não-identificados
  { erp: "forgov",   link: /([a-z0-9-]+)?forgov\.com\.br/i,                          texto: /forgov/i },
  { erp: "pentagono",link: /([a-z0-9-]+)?pentagonosistemas\.com\.br/i,               texto: /pentagono sistemas/i },
  { erp: "portaldc", link: /([a-z0-9-]+)?portaldcsolucoes\.com\.br/i,                texto: /dc solu[çc]/i },
  { erp: "tenosoft", link: /([a-z0-9-]+)?tenosoft\.com\.br/i,                        texto: /tenosoft/i },
  { erp: "conect",   link: /([a-z0-9-]+)?conectsistemas\.com\.br/i,                  texto: /conect sistemas/i },
  { erp: "drh",      link: /drhtransparencia\.com\.br/i,                             texto: /drhtransparencia/i },
  { erp: "cecam2",   link: /([a-z0-9-]+)\.transparencia\.inf\.br|cecamtransp/i,      texto: /cecam/i },
];

// identifica pelo HTML; devolve {erp, urlErp, via}
function identifica(html) {
  for (const f of FORNECEDORES) {
    const m = html.match(f.link);
    if (m) return { erp: f.erp, urlErp: m[0], via: "link" };
  }
  for (const f of FORNECEDORES) {
    if (f.texto.test(html)) return { erp: f.erp, urlErp: null, via: "assinatura" };
  }
  return { erp: null, urlErp: null, via: null };
}

// ⭐ O portal de transparência raramente está na HOME — vive num subdomínio próprio
// (`transparencia.{município}.gov.br`) ou numa página interna, e é LÁ que o ERP se revela. Extrai o link de
// transparência da home para dar um segundo salto quando a home não bastou.
function linkTransparencia(html, base) {
  const m = html.match(/href=["']([^"']*transpar[^"']*)["']/i);
  if (!m) return null;
  try { return new URL(m[1], base).href; } catch { return null; }
}

async function baixa(url) {
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000), headers: UA });
      if (!r.ok) return null;
      return await r.text();
    } catch { await new Promise((s) => setTimeout(s, 1500)); }
  }
  return null;
}

// alvos: prefeituras com portal, ainda não checadas. TODOS varre o país inteiro; senão filtra pelos selos.
// UF fecha o recorte num estado: env pela SIGLA (convenção de _uf.mjs), traduzida para o nome POR EXTENSO, que é
// como o Radar grava a coluna. Só filtra se a sigla veio no ambiente — sem env, segue nacional (o default SC de
// _uf.mjs não pode virar filtro escondido).
const UF = process.env.UF ? NOME_ESTADO : null;
const params = TODOS ? [] : [SO_SELO];
const filtroSelo = TODOS ? "" : "and nivel_transparencia = any($1::text[])";
const filtroUf = UF ? `and uf = $${params.push(UF)}` : "";
const ordem = TODOS ? "uf, municipio" : "array_position($1::text[], nivel_transparencia), uf, municipio";
const alvos = (await q(`select cod_ibge, unidade_gestora, municipio, uf, url_portal, nivel_transparencia
  from radar_portal
 where unidade_gestora ilike 'Prefeitura%' and url_portal is not null and url_portal <> '-'
   and checado_em is null and (erp is null or erp_via = 'host') ${filtroSelo} ${filtroUf}
 order by ${ordem}`, params)).rows;
console.log(`[erp/assinatura] ${alvos.length} portais a checar (${TODOS ? "TODOS os selos" : SO_SELO.join(", ")}${UF ? " · UF " + UF : ""}) · concorrência ${CONC}`);

let checados = 0, achados = 0;
for (let i = 0; i < alvos.length; i += CONC) {
  const bloco = alvos.slice(i, i + CONC);
  const res = await Promise.all(bloco.map(async (a) => {
    const url = a.url_portal.startsWith("http") ? a.url_portal : "https://" + a.url_portal;
    const html = await baixa(url);
    if (!html) return { a, erp: null, urlErp: null, via: "sem_resposta" };
    let ident = identifica(html);
    // 2º salto: se a home não revelou, segue o link de transparência (subdomínio próprio) e tenta lá
    if (!ident.erp) {
      const alvo = linkTransparencia(html, url);
      if (alvo && !/\.gov\.br\/?$/i.test(alvo)) {
        const h2 = await baixa(alvo);
        if (h2) { const i2 = identifica(h2); if (i2.erp) ident = { ...i2, via: i2.via + "-2salto" }; }
      }
    }
    return { a, ...ident };
  }));
  for (const r of res) {
    await q(`update radar_portal set erp = coalesce($1, erp), url_erp = $2, erp_via = $3, checado_em = now()
             where cod_ibge = $4 and unidade_gestora = $5`,
      [r.erp, r.urlErp, r.via, r.a.cod_ibge, r.a.unidade_gestora]);
    if (r.erp) achados++;
  }
  checados += bloco.length;
  if (i % (CONC * 20) === 0) process.stdout.write(`   ${checados}/${alvos.length} · ${achados} com ERP\r`);
}
console.log(`\n[erp/assinatura] ${checados} checados · ${achados} com ERP identificado`);

console.log("\n═══ ERP por município (identificado pela página), só prefeituras ═══");
console.table((await q(`select coalesce(erp,'(não identificado)') erp, erp_via,
  count(distinct cod_ibge) municipios
  from radar_portal where unidade_gestora ilike 'Prefeitura%' and checado_em is not null
  group by 1,2 order by 3 desc limit 20`)).rows);

await db.end();
