// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _erp_receitas.mjs — as RECEITAS de descoberta de portal por ERP.
//
// POR QUE existe: cada ERP novo que aparece custava a mesma sondagem manual (achar o padrão de domínio, a rota da
// folha, os filtros). Aqui o padrão vira DADO: uma linha por ERP, e o varredor testa todas contra os 5.570
// municípios. Responder "qual ERP cada município usa, por estado" passa a ser uma query, e um ERP novo é uma
// linha — não uma sessão inteira ([[feedback-varios-metodos-um-por-tipo]]).
//
// `dominio(slug, mun)` devolve as URLs candidatas — algumas famílias usam prefixo pm/cm (prefeitura/câmara).
// `confirma` é opcional: quando o 200 não basta (soft-404), checa o corpo. Ver [[pnigp-sonda-soft404-falso-positivo]].
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

export const slugDe = (nome) => String(nome).normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/['´`]/g, "").replace(/[^a-z0-9]/g, "");

export const RECEITAS = [
  {
    erp: "ipm",
    nome: "IPM Sistemas (Atende.net)",
    folha: "Relação Funcionário x Salário — nome, cargo, lotação, provento; série desde 2013",
    urls: (s) => [`https://${s}.atende.net/transparencia`],
    metodo: "HEAD",
  },
  {
    erp: "geosiap",
    nome: "Grupo Embras (GeoSIAP)",
    folha: "LAI Remunerações (lai_remuneracoes) — entidade + competência, dados por AJAX",
    // o slug do GeoSIAP às vezes leva o prefixo do tipo de ente
    urls: (s) => [`https://${s}.geosiap.net.br/portal-transparencia/home`,
                  `https://pm${s}.geosiap.net.br/portal-transparencia/home`],
    metodo: "HEAD",
  },
  {
    erp: "smarapd",
    nome: "SMAR APD (PAI - Portal de Acesso à Informação)",
    folha: "a mapear (SPA)",
    urls: (s) => [`https://transparencia-${s}.smarapd.com.br/`],
    metodo: "GET",
    confirma: (corpo) => /SMARAPD|Portal de Acesso/i.test(corpo),
  },
  {
    erp: "epublica",
    nome: "e-Pública (Pública Tecnologia)",
    folha: "Gestão de Pessoal — REST /rest/{slug}/gestaoDePessoal/servidores/listAll; traz campo SECRETARIA próprio",
    // ⚠️ SOFT-404: a home e o headerExplorer respondem 200 IGUAL para município inexistente. O que discrimina é
    // o listAll TER LINHAS ([[pnigp-sonda-soft404-falso-positivo]]).
    urls: (s) => [`https://transparencia.e-publica.net/epublica-portal/rest/${s}/gestaoDePessoal/servidores/listAll`],
    metodo: "POST",
    confirma: (corpo) => {
      try { const j = JSON.parse(corpo); return Array.isArray(j.rows) && j.rows.length > 0; } catch { return false; }
    },
  },
  {
    erp: "portaltp",
    nome: "Portal TP",
    folha: "consultas/pessoal/servidores.aspx — HTML puro: matrícula, nome, CPF, LOTAÇÃO, vínculo, CARGO, nível salarial",
    // o slug leva a UF ("extrema-mg"); aqui o DNS é o discriminador — município sem portal nem resolve
    urls: (s, mun, uf) => [`https://${s}-${String(uf || "").toLowerCase()}.portaltp.com.br/consultas/pessoal/servidores.aspx`],
    // HEAD de propósito: a página tem 205 KB e baixá-la estourava o timeout de 20 s — o "não achou" era LENTIDÃO,
    // não ausência. Aqui o DNS é o discriminador (município sem portal não resolve), então o 200 já prova.
    // (Se um dia precisar do corpo: ele é ISO-8859-1, e "Lotação" acentuado não casa depois do decode UTF-8.)
    metodo: "HEAD",
    timeoutMs: 50000,
  },
  {
    erp: "elotech",
    nome: "Elotech",
    folha: "a mapear",
    urls: (s) => [`https://${s}.elotech.com.br/transparencia`, `https://transparencia.${s}.pr.gov.br/`],
    metodo: "HEAD",
  },
  {
    erp: "fiorilli",
    nome: "Fiorilli (SIP)",
    folha: "a mapear",
    urls: (s) => [`https://${s}.fiorilli.com.br:8079/transparencia`, `https://transparencia.${s}.sp.gov.br/`],
    metodo: "HEAD",
  },
];

// testa uma receita para um município; devolve a URL que respondeu ou null
export async function testa(receita, nomeMunicipio, uf) {
  const s = slugDe(nomeMunicipio);
  for (const url of receita.urls(s, nomeMunicipio, uf)) {
    try {
      const r = await fetch(url, {
        method: receita.metodo || "HEAD",
        body: receita.metodo === "POST" ? "{}" : undefined,
        // ⚠️ timeout POR RECEITA: o portalTP leva 24 s para responder e um teto fixo de 20 s transformava
        // servidor LENTO em "município não usa esse ERP" — falso negativo silencioso, em massa.
        redirect: "follow", signal: AbortSignal.timeout(receita.timeoutMs || 25000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)",
                   ...(receita.metodo === "POST" ? { "content-type": "application/json" } : {}) },
      });
      if (!r.ok) continue;
      if (receita.confirma) {
        const corpo = receita.metodo === "HEAD" ? "" : await r.text();
        if (!receita.confirma(corpo)) continue;
      }
      return { url, slug: s };
    } catch { /* proximo candidato */ }
  }
  return null;
}
