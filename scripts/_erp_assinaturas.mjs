// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _erp_assinaturas.mjs — o dicionário de ASSINATURAS de ERP e a leitura de uma página até o fornecedor.
//
// POR QUE saiu de dentro de identifica_erp_por_pagina.mjs: a mesma leitura passou a ser necessária em mais de um
// ponto de entrada — o Radar traz a URL de uns municípios e NÃO traz a de outros (no RS, 107 prefeituras sem
// `url_portal` nem `site`), e esses precisam de um script que derive o domínio antes de identificar. Duplicar 35
// regex em dois arquivos é garantir que um deles envelheça sozinho: ERP novo entra AQUI, e os dois enxergam.
//
// A regra que rege este arquivo: o LINK manda, a menção textual é o segundo melhor ([[pnigp-link-sistema-origem-fonte-do-portal]]).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

export const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

// Assinaturas por fornecedor: um regex para o LINK do portal (mais forte) e um para menção solta no HTML.
// A ordem importa: o link do portal de transparência vence a menção genérica.
export const FORNECEDORES = [
  { erp: "betha",    link: /transparencia\.betha\.cloud\/#\/([A-Za-z0-9+/=_-]+)/i,   texto: /betha\.cloud|betha sistemas/i },
  { erp: "ipm",      link: /https?:\/\/([a-z0-9-]+)\.atende\.net/i,                   texto: /atende\.net|ipm sistemas/i },
  { erp: "geosiap",  link: /https?:\/\/([a-z0-9-]+)\.geosiap\.net\.br/i,              texto: /geosiap|grupo embras/i },
  { erp: "portaltp", link: /https?:\/\/([a-z0-9-]+)\.portaltp\.com\.br/i,            texto: /portaltp/i },
  { erp: "epublica", link: /e-publica\.net\/epublica-portal\/#\/([a-z0-9-]+)/i,      texto: /e-publica\.net/i },
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
  // ⭐ 3ª leva — fornecedores vistos nos portais REAIS já descobertos no RS, que a sonda de subdomínio não pega
  // porque o portal fica hospedado em domínio do próprio município ou em porta alta.
  { erp: "msgestao", link: /([a-z0-9-]+)\.msgestaopublica\.app\.br/i,                texto: /ms gest[ãa]o p[úu]blica|msgestaopublica/i },
  { erp: "valereal", link: /([a-z0-9-]+)?valereal\.[a-z.]+/i,                        texto: /vale real (sistemas|inform)/i },
];

// identifica pelo HTML; devolve {erp, urlErp, via}
export function identifica(html) {
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
export function linkTransparencia(html, base) {
  const m = html.match(/href=["']([^"']*transpar[^"']*)["']/i);
  if (!m) return null;
  try { return new URL(m[1], base).href; } catch { return null; }
}

export async function baixa(url, timeoutMs = 30000) {
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs), headers: UA });
      if (!r.ok) return null;
      return await r.text();
    } catch { await new Promise((s) => setTimeout(s, 1500)); }
  }
  return null;
}
