// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// sonda_tc_download_aberto.mjs — o TCE-PB fechou a Paraíba inteira com um ZIP público em `download.tce.pb.gov.br`
// ([[pnigp-tcepb-dados-abertos-servidores]]). Esta sonda pergunta o mesmo aos demais tribunais: existe uma porta
// de DOWNLOAD/dados abertos, sem captcha e sem login, com dataset de SERVIDORES/PESSOAL?
//
// Medição, não catálogo: a prova é o arquivo responder, não o site citar "transparência".
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

// estados com buraco grande na folha, na ordem do buraco
const TCS = [
  ["PI", ["tce.pi.gov.br"]],
  ["CE", ["tce.ce.gov.br"]],
  ["MA", ["tce.ma.gov.br"]],
  ["PE", ["tcepe.tc.br"]],
  ["AL", ["tceal.tc.br"]],
  ["RN", ["tce.rn.gov.br"]],
  ["SE", ["tce.se.gov.br"]],
  ["PA", ["tcm.pa.gov.br", "tce.pa.gov.br"]],
  ["RO", ["tcero.tc.br"]],
  ["AC", ["tceac.tc.br"]],
  ["AP", ["tce.ap.gov.br"]],
  ["RR", ["tcerr.tc.br"]],
  ["TO", ["tceto.tc.br"]],
  ["AM", ["tce.am.gov.br"]],
];
const PREFIXOS = ["download.", "dados-abertos.", "dadosabertos.", "dados.", "api.", "transparencia."];

const testa = async (u) => {
  try {
    const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    return { s: r.status, n: t.length, t,
      tit: (t.match(/<title[^>]*>([^<]{2,80})</i) || [])[1]?.replace(/\s+/g, " ").trim() };
  } catch { return null; }
};

for (const [uf, hosts] of TCS) {
  const achados = [];
  for (const h of hosts) {
    for (const p of PREFIXOS) {
      const r = await testa(`https://${p}${h}/`);
      if (!r || r.s >= 400) continue;
      const captcha = /captcha|turnstile|challenges\.cloudflare/i.test(r.t);
      const login = /senha|login|autentic/i.test(r.t);
      const pessoal = /servidor|folha|remunera|pessoal|agente p[úu]blico/i.test(r.t);
      achados.push(`${p}${h} [${r.s}] "${(r.tit || "-").slice(0, 34)}"${pessoal ? " ⭐pessoal" : ""}${captcha ? " ⛔captcha" : ""}${login ? " 🔒login" : ""}`);
    }
  }
  console.log(`${uf}: ${achados.length ? achados.join("\n     ") : "— nenhuma porta de download/dados abertos"}`);
}
