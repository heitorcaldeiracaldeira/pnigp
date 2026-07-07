// Scraper JSF dedicado do SISAB RelValidacao — produção por EQUIPE (INE) e por ficha, POR MUNICÍPIO.
// Replica a sequência ViewState/AJAX: GET → ajax unidGeo=municipio → ajax estadoMunicipio=UF → POST full (verTela).
// Uso: node scripts/scrape_sisab_equipe.mjs 420540 202512 4    (municipio, competencia, ficha)
const BASE = "https://sisab.saude.gov.br";
const PATH = "/paginas/acessoRestrito/relatorio/federal/envio/RelValidacao.xhtml";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36";

let COOKIE = "";
function mergeCookie(res) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of sc) { const kv = c.split(";")[0]; if (kv) { const k = kv.split("=")[0];
    const parts = COOKIE ? COOKIE.split("; ").filter(x => !x.startsWith(k + "=")) : []; parts.push(kv); COOKIE = parts.join("; "); } }
}
function vsFromHtml(html) { const m = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/); return m ? m[1] : null; }
function vsFromXml(xml) { const m = xml.match(/<update id="[^"]*ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]><\/update>/) || xml.match(/ViewState[^>]*><!\[CDATA\[([^\]]+)\]\]/); return m ? m[1] : null; }

async function get(url) { const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: COOKIE } }); mergeCookie(res); return await res.text(); }
async function post(url, body, ajax) {
  const headers = { "User-Agent": UA, Cookie: COOKIE, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Referer": BASE + PATH };
  if (ajax) { headers["Faces-Request"] = "partial/ajax"; headers["X-Requested-With"] = "XMLHttpRequest"; }
  const res = await fetch(url, { method: "POST", headers, body, redirect: "manual" });
  mergeCookie(res); return await res.text();
}

function ajaxBody(vs, source, extra) {
  const p = new URLSearchParams();
  p.set("j_idt44", "j_idt44");
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  p.set("javax.faces.ViewState", vs);
  p.set("javax.faces.source", source);
  p.set("javax.faces.partial.event", "change");
  p.set("javax.faces.partial.execute", source + " " + source);
  p.set("javax.faces.partial.render", "regioes script");
  p.set("javax.faces.behavior.event", "valueChange");
  p.set("javax.faces.partial.ajax", "true");
  return p.toString();
}

function parseTabela(html) {
  // pega linhas da tabela de resultado: células, primeira = IBGE (6-7 díg) OU CNES
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi; let m;
  while ((m = trRe.exec(html))) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => c[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim());
    if (cells.length >= 2 && /^\d{6,7}$/.test(cells[0])) rows.push(cells);
  }
  return rows;
}

async function main() {
  const municipio = process.argv[2] || "420540";
  const comp = process.argv[3] || "202512";
  const ficha = process.argv[4] || "4"; // 4=Atend Individual, 8=Visita Domiciliar
  const uf = municipio.slice(0, 2);

  const html0 = await get(BASE + PATH);
  let vs = vsFromHtml(html0);
  console.log("GET ok · cookie:", COOKIE.slice(0, 30), "· VS:", vs ? vs.slice(0, 20) : "NULL");
  if (!vs) throw new Error("sem ViewState no GET");

  // ajax 1: unidGeo=municipio
  const x1 = await post(BASE + PATH, ajaxBody(vs, "unidGeo", { unidGeo: "municipio", periodo: "producao", j_idt70: comp }), true);
  vs = vsFromXml(x1) || vs;
  console.log("ajax unidGeo ok · VS:", vs.slice(0, 20), "· temEstadoMunicipio:", /estadoMunicipio/.test(x1));

  // ajax 2: estadoMunicipio=UF
  const x2 = await post(BASE + PATH, ajaxBody(vs, "estadoMunicipio", { unidGeo: "municipio", estadoMunicipio: uf, periodo: "producao", j_idt70: comp }), true);
  vs = vsFromXml(x2) || vs;
  console.log("ajax estadoMunicipio ok · VS:", vs.slice(0, 20), "· temMunicipio" + municipio + ":", x2.includes(municipio));

  // POST full: verTela
  const p = new URLSearchParams();
  p.set("j_idt44", "j_idt44");
  p.set("unidGeo", "municipio");
  p.set("estadoMunicipio", uf);
  p.set("municipios", municipio);
  p.set("periodo", "producao");
  p.set("j_idt70", comp);
  for (const c of ["municipio", "cnes", "ine"]) p.append("colunas", c);
  p.append("j_idt87", ficha);
  p.set("verTela", "Ver em tela");
  p.set("javax.faces.ViewState", vs);
  const full = await post(BASE + PATH, p.toString(), false);
  console.log("POST verTela ok · bytes:", full.length, "· temTabela:", /<table/i.test(full));

  const rows = parseTabela(full);
  console.log("LINHAS PARSEADAS:", rows.length);
  console.log(rows.slice(0, 12).map(r => r.join(" | ")).join("\n"));
  // salva o HTML pra inspeção se vazio
  if (!rows.length) { const fs = await import("fs"); fs.writeFileSync("scripts/_dados/_sisab_debug.html", full); console.log("HTML salvo em scripts/_dados/_sisab_debug.html"); }
}
main().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
