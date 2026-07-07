// Scraper JSF do SISAB indicadorPainel — ISF + 7 indicadores Previne por município. Replica ViewState/AJAX.
// Uso: node scripts/scrape_sisab_indicadores.mjs [uf] [quadrimestre]   ex: node ... SC 202404
import fs from "fs";
const BASE = "https://sisab.saude.gov.br";
const PATH = "/paginas/acessoRestrito/relatorio/federal/indicadores/indicadorPainel.xhtml";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36";
let COOKIE = "";
function mergeCookie(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : []; for (const c of sc) { const kv = c.split(";")[0]; if (kv) { const k = kv.split("=")[0]; const parts = COOKIE ? COOKIE.split("; ").filter(x => !x.startsWith(k + "=")) : []; parts.push(kv); COOKIE = parts.join("; "); } } }
const vsHtml = (h) => (h.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/) || [])[1] || null;
const vsXml = (x) => (x.match(/<update id="[^"]*ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]/) || [])[1] || null;
async function get(u) { const r = await fetch(u, { headers: { "User-Agent": UA, Cookie: COOKIE } }); mergeCookie(r); return await r.text(); }
async function post(u, body, ajax) { const h = { "User-Agent": UA, Cookie: COOKIE, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: BASE + PATH }; if (ajax) { h["Faces-Request"] = "partial/ajax"; h["X-Requested-With"] = "XMLHttpRequest"; } const r = await fetch(u, { method: "POST", headers: h, body }); mergeCookie(r); return await r.text(); }
function ajaxBody(vs, source, extra) { const p = new URLSearchParams({ j_idt51: "j_idt51", ...extra, "javax.faces.ViewState": vs, "javax.faces.source": source, "javax.faces.partial.event": "change", "javax.faces.partial.execute": source + " " + source, "javax.faces.partial.render": "regioes script", "javax.faces.behavior.event": "valueChange", "javax.faces.partial.ajax": "true" }); return p.toString(); }
function parseRows(html) { const rows = []; const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi; let m; while ((m = trRe.exec(html))) { const c = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()); if (c.length >= 3 && /^\d{6,7}$/.test(c[0])) rows.push(c); } return rows; }

async function main() {
  const uf = process.argv[2] || "SC"; const uf2 = { SC: "42" }[uf] || "42";
  const quad = process.argv[3] || "202404";
  const h0 = await get(BASE + PATH); let vs = vsHtml(h0); if (!vs) throw new Error("sem VS");
  console.log("GET ok · VS:", vs.slice(0, 16));
  const x1 = await post(BASE + PATH, ajaxBody(vs, "selectLinha", { coIndicador: "", selectLinha: "ibge", quadrimestre: quad, visaoEquipe: "" }), true);
  vs = vsXml(x1) || vs; console.log("ajax selectLinha ok · temEstadoMunicipio:", /estadoMunicipio/.test(x1));
  const x2 = await post(BASE + PATH, ajaxBody(vs, "estadoMunicipio", { coIndicador: "", selectLinha: "ibge", estadoMunicipio: uf2, quadrimestre: quad, visaoEquipe: "" }), true);
  vs = vsXml(x2) || vs; console.log("ajax estadoMunicipio ok");
  const p = new URLSearchParams();
  const muni = process.argv[4] || "420540";
  p.set("j_idt51", "j_idt51"); p.set("coIndicador", ""); p.set("selectLinha", "ibge"); p.set("estadoMunicipio", uf2); p.set("municipios", muni); p.set("quadrimestre", quad); p.set("visaoEquipe", ""); p.set("verTela", "Ver em tela"); p.set("javax.faces.ViewState", vs);
  const full = await post(BASE + PATH, p.toString(), false);
  console.log("POST verTela ok · bytes:", full.length, "· temTabela:", /<table/i.test(full));
  // cabeçalho
  const headTr = (full.match(/<thead[\s\S]*?<\/thead>/i) || [])[0] || "";
  const heads = [...headTr.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(x => x[1].replace(/<[^>]+>/g, "").trim());
  console.log("COLUNAS:", heads.join(" | "));
  const rows = parseRows(full);
  console.log("LINHAS:", rows.length);
  console.log(rows.slice(0, 6).map(r => r.join(" | ")).join("\n"));
  if (!rows.length) { fs.writeFileSync("scripts/_dados/_indic_debug.html", full); console.log("HTML salvo _indic_debug.html"); }
}
main().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
