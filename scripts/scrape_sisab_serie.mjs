// Série histórica de produção da APS (SISAB RelValidacao) por município — modo Estado, todas as competências.
// Estado mode: unidGeo=estado + estados=SC + colunas=ibge+municipio (todas as fichas). 1 POST por competência (paginação é client-side → tudo vem).
// Uso: node scripts/scrape_sisab_serie.mjs [uf] [compInicial]   ex: node scripts/scrape_sisab_serie.mjs SC 202101
import fs from "fs";
const BASE = "https://sisab.saude.gov.br";
const PATH = "/paginas/acessoRestrito/relatorio/federal/envio/RelValidacao.xhtml";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36";

let COOKIE = "";
function mergeCookie(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : []; for (const c of sc) { const kv = c.split(";")[0]; if (kv) { const k = kv.split("=")[0]; const parts = COOKIE ? COOKIE.split("; ").filter(x => !x.startsWith(k + "=")) : []; parts.push(kv); COOKIE = parts.join("; "); } } }
const vsHtml = (h) => (h.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/) || [])[1] || null;
const vsXml = (x) => (x.match(/<update id="[^"]*ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]/) || [])[1] || null;
async function get(u) { const r = await fetch(u, { headers: { "User-Agent": UA, Cookie: COOKIE } }); mergeCookie(r); return await r.text(); }
async function post(u, body, ajax) { const h = { "User-Agent": UA, Cookie: COOKIE, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: BASE + PATH }; if (ajax) { h["Faces-Request"] = "partial/ajax"; h["X-Requested-With"] = "XMLHttpRequest"; } const r = await fetch(u, { method: "POST", headers: h, body }); mergeCookie(r); return await r.text(); }

function parseRows(html) {
  const rows = []; const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi; let m;
  while ((m = trRe.exec(html))) { const c = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()); if (c.length >= 4 && /^\d{6,7}$/.test(c[0])) rows.push(c); }
  return rows;
}
const numBR = (s) => parseInt((s || "0").replace(/\./g, "").replace(/\D/g, "")) || 0;

async function estadoAjax(uf, comp) {
  // (re)estabelece o estado e retorna VS válido para o POST full
  const h0 = await get(BASE + PATH); let vs = vsHtml(h0); if (!vs) throw new Error("sem VS");
  const p = new URLSearchParams({ j_idt44: "j_idt44", unidGeo: "estado", periodo: "producao", j_idt70: comp, "javax.faces.ViewState": vs, "javax.faces.source": "unidGeo", "javax.faces.partial.event": "change", "javax.faces.partial.execute": "unidGeo unidGeo", "javax.faces.partial.render": "regioes script", "javax.faces.behavior.event": "valueChange", "javax.faces.partial.ajax": "true" });
  const x = await post(BASE + PATH, p.toString(), true); vs = vsXml(x) || vs;
  return vs;
}
async function relatorio(uf, comp, vs) {
  const p = new URLSearchParams();
  p.set("j_idt44", "j_idt44"); p.set("unidGeo", "estado"); p.append("estados", uf); p.set("periodo", "producao"); p.set("j_idt70", comp);
  p.append("colunas", "ibge"); p.append("colunas", "municipio"); p.set("verTela", "Ver em tela"); p.set("javax.faces.ViewState", vs);
  const html = await post(BASE + PATH, p.toString(), false);
  return { html, vs: vsHtml(html) || vs, rows: parseRows(html) };
}

async function main() {
  const uf = process.argv[2] || "SC";
  const compIni = process.argv[3] || "202101";
  // gera lista de competências de compIni até 202606
  const comps = []; let y = +compIni.slice(0, 4), mo = +compIni.slice(4);
  while (y < 2026 || (y === 2026 && mo <= 6)) { comps.push(`${y}${String(mo).padStart(2, "0")}`); mo++; if (mo > 12) { mo = 1; y++; } }
  console.log(`Competências: ${comps.length} (${comps[0]}..${comps[comps.length - 1]})`);

  let vs = await estadoAjax(uf, comps[0]);
  const out = {}; // cod6 -> { comp -> {aprov, total} }
  for (const comp of comps) {
    let r;
    try { r = await relatorio(uf, comp, vs); } catch (e) { console.log(comp, "ERRO", e.message); vs = await estadoAjax(uf, comp); continue; }
    if (!r.rows.length) { // VS pode ter expirado — re-estabelece 1x
      vs = await estadoAjax(uf, comp); r = await relatorio(uf, comp, vs);
    }
    vs = r.vs;
    const agg = {};
    for (const c of r.rows) { const cod = c[0].padStart(6, "0").slice(0, 6); const status = c[2] || ""; const v = numBR(c[3]); if (!agg[cod]) agg[cod] = { aprov: 0, total: 0 }; agg[cod].total += v; if (/aprovado/i.test(status) && !/reprovado/i.test(status)) agg[cod].aprov += v; }
    for (const [cod, o] of Object.entries(agg)) { if (!out[cod]) out[cod] = {}; out[cod][comp] = o; }
    const tot = Object.values(agg).reduce((s, o) => s + o.aprov, 0);
    console.log(`${comp}: ${Object.keys(agg).length} munis · ${(tot / 1e6).toFixed(2)}mi aprovadas`);
  }
  fs.writeFileSync(`scripts/_dados/producao_aps_serie_${uf}.json`, JSON.stringify(out));
  console.log(`\n✔ salvo producao_aps_serie_${uf}.json · ${Object.keys(out).length} municípios`);
}
main().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
