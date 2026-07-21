// RECEITAS POR PORTAL — busca o TEXTO do doc de resultado (onde vive a marca) em CADA portal cracked.
// Estrutura: resolveId(portal, docAcervo, proc) → id do processo NO portal (1º do DOC/edital que já temos; fallback
// linkSistemaOrigem do PNCP, rate-limited) → RECEITA[portal](id) → texto do doc. É o "buscar de todos os portais".
// Cada receita é a mesma provada nesta sessão ([[pnigp-portais-endpoints-publicos]]). Nada de login/navegador.
import { extractText, getDocumentProxy } from "unpdf";
import AdmZip from "adm-zip";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "user-agent": "Mozilla/5.0" };
async function pdfText(buf) { try { const u = new Uint8Array(buf); if (u[0] !== 0x25) return ""; return (await extractText(await getDocumentProxy(u), { mergePages: true })).text || ""; } catch { return ""; } }

// ---------- PCP (relatorio_gerado): id → POST relatório Vencedor + poll → PDF ----------
const GEN = "https://conteudo.api.portaldecompraspublicas.com.br/v1/arquivo/download";
const HPCP = { "content-type": "application/json", referer: "https://www.portaldecompraspublicas.com.br/" };
async function pcpVencedores(id) {
  let j = await (await fetch(GEN, { method: "POST", headers: HPCP, body: JSON.stringify({ codigoGeradorArquivo: 0, codigoTipoGerador: 2, codigoUsuarioEntidade: 10, parametros: `Vencedor,${id}`, reprocessar: false }) })).json();
  for (let i = 0; i < 12; i++) {
    await sleep(1200);
    j = await (await fetch(GEN, { method: "POST", headers: HPCP, body: JSON.stringify({ codigoGeradorArquivo: j.codigoGeradorArquivo, codigoTipoGerador: 2, codigoUsuarioEntidade: 10, parametros: `Vencedor,${id}`, reprocessar: false }) })).json();
    if (j.codigoSituacao === 4 && j.url) return await pdfText(await (await fetch(j.url, { signal: AbortSignal.timeout(30000) })).arrayBuffer());
    if (j.erro) return "";
  }
  return "";
}
// ---------- BLL/BNC (arquivo_blob): ProcessView→ProcessFiles→blob (doc de resultado, pdf ou atas.zip) ----------
function lanceEletronico(host) {
  return async (pvUrl) => {
    const html = await (await fetch(pvUrl, { headers: UA, signal: AbortSignal.timeout(25000) })).text();
    const m = html.match(/ProcessFiles'\s*,\s*\[\s*'([^']+)'/); if (!m) return "";
    const pf = `https://${host}/Process/ProcessFiles?param1=` + encodeURIComponent(m[1]);
    const t = await (await fetch(pf, { headers: { ...UA, "x-requested-with": "XMLHttpRequest" }, signal: AbortSignal.timeout(25000) })).text();
    let j = null; try { j = JSON.parse(t); } catch {}
    const body = j?.html || t;
    const arqs = [...body.matchAll(/https?:\/\/[^"'\s)]+\.(pdf|zip)/gi)].map((x) => x[0]);
    const nomes = [...body.matchAll(/>([^<>]{3,60}\.(?:pdf|zip|PDF|ZIP))</g)].map((x) => x[1]);
    let txt = "";
    for (let i = 0; i < arqs.length; i++) {
      if (!/ata|resultad|homolog|adjudic|vencedor|classific|proposta/i.test(nomes[i] || arqs[i])) continue;   // só doc de resultado
      try { const buf = Buffer.from(await (await fetch(arqs[i], { headers: UA, signal: AbortSignal.timeout(40000) })).arrayBuffer());
        if (buf[0] === 0x50 && buf[1] === 0x4b) { for (const e of new AdmZip(buf).getEntries()) if (/\.pdf$/i.test(e.entryName)) txt += " " + await pdfText(e.getData()); }
        else txt += " " + await pdfText(buf); } catch {}
    }
    return txt;
  };
}
// ---------- Licitar Digital (arquivo_blob): auctionId → listPublicGeneratedDocuments → S3 ----------
const LD = "https://manager-api.licitardigital.com.br";
async function licitarDigital(auctionId) {
  const r = await fetch(`${LD}/documents/generated/listPublicGeneratedDocuments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ params: { auctionId: Number(auctionId) } }), signal: AbortSignal.timeout(25000) });
  const j = await r.json().catch(() => null); const arr = j?.data || [];
  let txt = "";
  for (const d of arr) { if (!/ata|contrato|homolog|adjudic|resultad|vencedor/i.test(d.fileDescription || "") || !d.url) continue;
    try { txt += " " + await pdfText(await (await fetch(d.url, { headers: UA, signal: AbortSignal.timeout(40000) })).arrayBuffer()); } catch {} }
  return txt;
}
// ---------- Licitanet (relatorio_gerado): codPregao → sessao(csrf)+clientToken → POST /report → HTML ----------
const LN = "https://licitanet.com.br";
function clientToken() { // base64 "{unixSeg}|" — reproduz o clientToken-*.js (segundos, não ms; determinístico o suficiente)
  const s = Math.floor(Number(process.env.LN_TS || 0) || 1); return Buffer.from(`${s}|licitanet`).toString("base64");
}
async function licitanet(cod) {
  const shtml = await (await fetch(`${LN}/sessao/${cod}`, { headers: UA, signal: AbortSignal.timeout(25000) })).text();
  const csrf = shtml.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1] || shtml.match(/"csrfToken":"([^"]+)"/)?.[1];
  const ata = shtml.match(/"tipoAta":(\d+),"ata":(\d+)/); if (!csrf || !ata) return "";
  const rep = await (await fetch(`${LN}/report/${cod}`, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf, "x-client-token": clientToken(), ...UA }, body: JSON.stringify({ relatorio: "RELATORIO_ATA_FINAL_COMPLETO", dados: `{"tipoAta":${ata[1]},"ata":${ata[2]}}` }), signal: AbortSignal.timeout(25000) })).json().catch(() => null);
  if (!rep?.identifier) return "";
  for (let t = 1; t <= 2; t++) { const dl = await (await fetch(`${LN}/report/${rep.identifier}/download/${t}`, { headers: UA, signal: AbortSignal.timeout(25000) })).json().catch(() => null);
    if (dl?.url) { const h = await (await fetch(dl.url, { headers: UA, signal: AbortSignal.timeout(30000) })).text(); return h.replace(/<[^>]+>/g, " "); } }   // HTML → texto
  return "";
}

// ---------- RECEITAS: por portal, o id-regex (no doc do acervo) + a receita de fetch ----------
export const RECEITA = {
  "Portal de Compras Públicas": { idRe: /portaldecompraspublicas\.com[^\s"'<]*?(\d{5,})/i, idLink: /(\d{4,})\/?$/, fetch: pcpVencedores },
  "BLL": { pvRe: /https?:\/\/bllcompras\.com\/Process\/ProcessView\?param1=\[gkz\][^\s"'<)]+/i, fetch: lanceEletronico("bllcompras.com") },
  "BNC": { pvRe: /https?:\/\/bnccompras\.com\/Process\/ProcessView\?param1=\[gkz\][^\s"'<)]+/i, fetch: lanceEletronico("bnccompras.com") },
  "Licitar Digital": { idRe: /licitardigital[^\s"'<]*?\/(?:auction|pregao|processo)s?\/(\d{3,})/i, fetch: licitarDigital },
  "Licitanet": { idRe: /licitanet\.com[^\s"'<]*?\/sessao(?:-publica)?\/(\d{3,})/i, fetch: licitanet },
};

// linkSistemaOrigem do PNCP (fallback rate-limited) → URL do portal
export async function linkSistemaOrigem(cnpj, ano, seq) {
  for (let t = 0; t < 3; t++) {
    try { const r = await fetch(`https://pncp.gov.br/api/consulta/v1/orgaos/${cnpj}/compras/${ano}/${seq}`, { signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await sleep(4000 * (t + 1)); continue; }
      return (await r.json().catch(() => null))?.linkSistemaOrigem || ""; } catch { return ""; }
  }
  return "";
}

// resolve o id/URL do processo NO portal: 1º do DOC do acervo, senão do linkSistemaOrigem (PNCP)
export async function resolveId(portal, docTexto, cnpj, ano, seq, { usarPNCP = true } = {}) {
  const rec = RECEITA[portal]; if (!rec) return null;
  // Lance Eletrônico (BLL/BNC): precisa da URL ProcessView completa (encriptada) — só vem do linkSistemaOrigem
  if (rec.pvRe) {
    const noDoc = docTexto?.match(rec.pvRe)?.[0];
    if (noDoc) return noDoc;
    if (!usarPNCP) return null;
    const link = await linkSistemaOrigem(cnpj, ano, seq);
    return link.match(rec.pvRe)?.[0] || (link.includes(portal === "BNC" ? "bnccompras" : "bllcompras") ? link : null);
  }
  // demais: id numérico no doc; fallback linkSistemaOrigem
  const noDoc = docTexto?.match(rec.idRe)?.[1];
  if (noDoc) return noDoc;
  if (!usarPNCP) return null;
  const link = await linkSistemaOrigem(cnpj, ano, seq);
  return link.match(rec.idRe)?.[1] || (rec.idLink ? link.match(rec.idLink)?.[1] : null) || null;
}

// busca o doc de resultado de um portal (retorna texto) — o "buscar do portal"
export async function buscaDoPortal(portal, docTexto, cnpj, ano, seq, opts) {
  const rec = RECEITA[portal]; if (!rec) return "";
  const id = await resolveId(portal, docTexto, cnpj, ano, seq, opts);
  if (!id) return "";
  return await rec.fetch(id);
}

// domínio de disputa → portal (p/ descobrir a origem pelo linkSistemaOrigem quando não roteei)
const DOMINIO_PORTAL = [
  ["portaldecompraspublicas.com", "Portal de Compras Públicas"], ["bllcompras.com", "BLL"], ["bnccompras.com", "BNC"],
  ["licitardigital", "Licitar Digital"], ["licitanet.com", "Licitanet"],
];
// ⭐ "se não achar no PNCP, traz ONDE FOI FEITO e busca lá": linkSistemaOrigem (PNCP) → portal → receita → texto
export async function buscaPeloLink(cnpj, ano, seq) {
  const link = await linkSistemaOrigem(cnpj, ano, seq);
  if (!link) return { texto: "", portal: null, link: "" };
  const hit = DOMINIO_PORTAL.find(([d]) => link.includes(d));
  if (!hit) return { texto: "", portal: null, link };   // origem existe mas não é portal cracked (ex ERP/estado)
  const portal = hit[1];
  const texto = await buscaDoPortal(portal, link, cnpj, ano, seq, { usarPNCP: false });   // o link JÁ tem a URL/id
  return { texto, portal, link };
}
