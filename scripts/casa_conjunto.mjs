// CASADOR DE CONJUNTO — roda o casador endurecido contra CADA documento da construção e CONSOLIDA por item:
//  · melhor acerto (a fonte certa por item — o "union" que o estudo dos 200 mediu: TR∪Edital∪ETP → 0,92)
//  · CONVERGÊNCIA eleva a confiança: item que ≥2 documentos localizam vira ALTA (resolve o serviço, que é
//    "média" em cada doc isolado mas concorda entre eles)
//  · CÓDIGO DE CATÁLOGO (Caminho A) pescado da janela do acerto — o código que a API não dá, no texto do doc
// node scripts/casa_conjunto.mjs [CNPJ ANO SEQ]   (default: Videira/IPM 10432684000154 2025 8)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { casa, norm, loteDe, getTexto } from "./casa_itens.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const FASE = { 10: "DFD", 7: "ETP", 5: "Anteproj", 6: "ProjBás", 8: "ProjExec", 4: "TR", 9: "MapaRisco", 3: "MinContr", 1: "Aviso", 2: "Edital", 20: "AtoAut", 16: "Outros" };
const ORDER = [10, 7, 5, 6, 8, 4, 9, 3, 1, 2, 20, 16];
const RANK = { alta: 3, media: 2, baixa: 1 };

// código de catálogo (5–9 díg.) na janela ANTES do acerto: "1 127811 alcool..." / "01 2502 14974018 sacola..."
function catalogo(docNorm, off) {
  if (off == null) return null;
  const jan = docNorm.slice(Math.max(0, off - 45), off + 5);
  const nums = [...jan.matchAll(/\b\d{5,9}\b/g)].map((m) => m[0]);
  return nums.length ? nums[nums.length - 1] : null;   // o mais próximo do início do item
}
// consolida a confiança: convergência de ≥2 docs (base ≥ média) → alta
function consolida(matchedIn, bestConf) {
  if (matchedIn === 0) return "ausente";
  if (matchedIn >= 3) return "alta";
  if (matchedIn >= 2 && RANK[bestConf] >= 2) return "alta";
  return bestConf;
}

async function main() {
  const [CNPJ, ANO, SEQ] = [process.argv[2] || "10432684000154", +(process.argv[3] || 2025), +(process.argv[4] || 8)];
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  const rows = (await db.query(`select tipo_documento_id tid, uri from arquivos_sc
    where cnpj=$1 and ano=$2 and seq=$3 and tipo_documento_id = any($4) and uri is not null`, [CNPJ, ANO, SEQ, ORDER])).rows;
  await db.end();
  // ordena pela construção; no máx 2 por tipo (evita 13 "Outros")
  const porTid = {}; const docsMeta = [];
  for (const r of rows.sort((a, b) => ORDER.indexOf(a.tid) - ORDER.indexOf(b.tid))) {
    porTid[r.tid] = (porTid[r.tid] || 0) + 1; if (porTid[r.tid] <= 2) docsMeta.push(r);
  }
  const j = await (await fetch(`${PNCP}/orgaos/${CNPJ}/compras/${ANO}/${SEQ}/itens?pagina=1&tamanhoPagina=500`, { headers: { accept: "*/*" }, signal: AbortSignal.timeout(30000) })).json();
  const itens = (Array.isArray(j) ? j : j.data || []).sort((a, b) => a.numeroItem - b.numeroItem).slice(0, 60);
  console.log(`processo ${CNPJ} ${ANO}/${SEQ} · ${itens.length} itens · ${docsMeta.length} documentos: ${docsMeta.map((d) => FASE[d.tid]).join(" ")}\n`);

  // roda o casador contra cada documento
  const porDoc = [];
  for (const d of docsMeta) { const txt = await getTexto(d.uri); const { res, docNorm } = casa(itens, txt); porDoc.push({ tid: d.tid, res, docNorm }); }

  // consolida por item
  const cons = [];
  for (let k = 0; k < itens.length; k++) {
    const hits = porDoc.map((D) => ({ tid: D.tid, ...D.res[k], docNorm: D.docNorm })).filter((h) => h.off != null && h.conf !== "baixa" || (h.off != null && h.motivo !== "sem candidato"));
    const val = hits.filter((h) => h.off != null);
    val.sort((a, b) => RANK[b.conf] - RANK[a.conf] || (b.score || 0) - (a.score || 0));
    const best = val[0];
    const conf = consolida(val.length, best ? best.conf : "baixa");
    // código de catálogo: prefere TR/Edital; senão qualquer doc que tenha
    let cat = null;
    for (const h of [...val].sort((a, b) => ([4, 2, 6, 7].indexOf(a.tid) + 99) % 99 - ([4, 2, 6, 7].indexOf(b.tid) + 99) % 99)) { cat = catalogo(h.docNorm, h.off); if (cat) break; }
    cons.push({ it: itens[k], matchedIn: val.length, docs: val.map((h) => FASE[h.tid]), conf, cat, best });
  }

  const N = Math.min(cons.length, 12);
  for (let k = 0; k < N; k++) {
    const c = cons[k], it = c.it, ms = it.materialOuServicoNome || it.materialOuServico || "";
    const pass = c.best ? c.best.docNorm.slice(Math.max(0, c.best.off - 5), c.best.off + 55).replace(/\s+/g, " ") : "—";
    console.log(`it ${String(it.numeroItem).padStart(3)}${loteDe(it.descricao) ? " L" + loteDe(it.descricao) : ""} [${c.conf.padEnd(6)} ${String(c.matchedIn)}doc${c.cat ? " cat=" + c.cat : "".padEnd(11)}] ${ms[0] || "?"} · ${(it.descricao || "").replace(/\s+/g, " ").slice(0, 34).padEnd(34)} → ${c.docs.join(",").padEnd(18)} ${pass.slice(0, 40)}`);
  }
  const cc = { alta: 0, media: 0, baixa: 0, ausente: 0 }; let comCat = 0;
  for (const c of cons) { cc[c.conf]++; if (c.cat) comCat++; }
  const medDocs = (cons.reduce((s, c) => s + c.matchedIn, 0) / cons.length).toFixed(1);
  console.log(`\nconsolidado (${cons.length} itens): alta ${cc.alta} · média ${cc.media} · baixa ${cc.baixa} · ausente ${cc.ausente}`);
  console.log(`convergência: ${medDocs} documentos/item em média · com código de catálogo: ${comCat}/${cons.length}`);
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
