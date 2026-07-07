// Loop: ISF + 7 indicadores Previne por município (SISAB indicadorPainel), todos os municípios de uma UF, um quadrimestre.
// Uso: node scripts/scrape_sisab_indicadores_todos.mjs SC 202404
import fs from "fs"; import pg from "pg";
const BASE = "https://sisab.saude.gov.br";
const PATH = "/paginas/acessoRestrito/relatorio/federal/indicadores/indicadorPainel.xhtml";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36";
let COOKIE = "";
function mergeCookie(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : []; for (const c of sc) { const kv = c.split(";")[0]; if (kv) { const k = kv.split("=")[0]; const parts = COOKIE ? COOKIE.split("; ").filter(x => !x.startsWith(k + "=")) : []; parts.push(kv); COOKIE = parts.join("; "); } } }
const vsHtml = (h) => (h.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/) || [])[1] || null;
const vsXml = (x) => (x.match(/<update id="[^"]*ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]/) || [])[1] || null;
async function get(u) { const r = await fetch(u, { headers: { "User-Agent": UA, Cookie: COOKIE } }); mergeCookie(r); return await r.text(); }
async function post(u, body, ajax) { const h = { "User-Agent": UA, Cookie: COOKIE, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: BASE + PATH }; if (ajax) { h["Faces-Request"] = "partial/ajax"; h["X-Requested-With"] = "XMLHttpRequest"; } const r = await fetch(u, { method: "POST", headers: h, body }); mergeCookie(r); return await r.text(); }
function ajaxBody(vs, source, extra) { return new URLSearchParams({ j_idt51: "j_idt51", ...extra, "javax.faces.ViewState": vs, "javax.faces.source": source, "javax.faces.partial.event": "change", "javax.faces.partial.execute": source + " " + source, "javax.faces.partial.render": "regioes script", "javax.faces.behavior.event": "valueChange", "javax.faces.partial.ajax": "true" }).toString(); }
function parseRow(html, cod6) {
  const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const m of trs) { if (m[1].includes(cod6)) { const c = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()); if (c.length >= 10) return c.slice(3, 10).map(v => parseFloat((v || "").replace("%", "").replace(",", ".")) || 0); } }
  return null;
}
async function estabelece(uf2, quad) {
  const h0 = await get(BASE + PATH); let vs = vsHtml(h0); if (!vs) throw new Error("sem VS");
  const x1 = await post(BASE + PATH, ajaxBody(vs, "selectLinha", { coIndicador: "", selectLinha: "ibge", quadrimestre: quad, visaoEquipe: "" }), true); vs = vsXml(x1) || vs;
  const x2 = await post(BASE + PATH, ajaxBody(vs, "estadoMunicipio", { coIndicador: "", selectLinha: "ibge", estadoMunicipio: uf2, quadrimestre: quad, visaoEquipe: "" }), true); vs = vsXml(x2) || vs;
  return vs;
}
async function relatorio(uf2, cod6, quad, vs) {
  const p = new URLSearchParams({ j_idt51: "j_idt51", coIndicador: "", selectLinha: "ibge", estadoMunicipio: uf2, municipios: cod6, quadrimestre: quad, visaoEquipe: "", verTela: "Ver em tela", "javax.faces.ViewState": vs });
  const html = await post(BASE + PATH, p.toString(), false);
  return { vs: vsHtml(html) || vs, ind: parseRow(html, cod6) };
}

async function main() {
  const uf = process.argv[2] || "SC"; const uf2 = { SC: "42" }[uf] || "42";
  const quad = process.argv[3] || "202404";
  const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
  const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2 }); db.on("error", () => {});
  const munis = (await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M' ORDER BY cod_ibge")).rows.map(r => r.cod_ibge.slice(0, 6));
  await db.end();
  console.log(`${munis.length} municípios · quadrimestre ${quad}`);
  let vs = await estabelece(uf2, quad);
  const out = {}; let ok = 0, fail = 0;
  for (let i = 0; i < munis.length; i++) {
    const cod = munis[i];
    try {
      let r = await relatorio(uf2, cod, quad, vs); vs = r.vs;
      if (!r.ind) { vs = await estabelece(uf2, quad); r = await relatorio(uf2, cod, quad, vs); vs = r.vs; }
      if (r.ind) { out[cod] = r.ind; ok++; } else fail++;
    } catch (e) { fail++; try { vs = await estabelece(uf2, quad); } catch {} }
    if ((i + 1) % 30 === 0) console.log(`  ${i + 1}/${munis.length} · ok=${ok} fail=${fail}`);
  }
  fs.writeFileSync(`scripts/_dados/indicadores_${uf}_${quad}.json`, JSON.stringify(out));
  console.log(`✔ salvo indicadores_${uf}_${quad}.json · ${ok} municípios (fail ${fail})`);
}
main().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
