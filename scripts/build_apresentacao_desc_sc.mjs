// APRESENTAÇÃO — Camada 2 (descrição): p/ itens cujo RÓTULO é container sem número (frasco/caixa/pacote — Camada 1
// só deu conf 0.5), extrai a QUANTIDADE do CONTEÚDO que está no TEXTO da descrição ("pacote com 1 kg", "gotas 20ml",
// "caixa com 500 unidades", "rolo 50 m") → unidade básica + fator. Grava `item_apresentacao_desc_sc` (chave = descrição
// normalizada). Conservador: só aceita conteúdo inequívoco; ignora CONCENTRAÇÃO ("10mg/ml", "1%") e atributos de contagem
// ("12 cores"). Combina com a Camada 1 no build da referência. node scripts/build_apresentacao_desc_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

// base canônica por token (igual à Camada 1): volume→ml · massa→g · comprimento→m · contagem→unidade
const U = {
  ml: ["ml", 1], l: ["ml", 1000], lt: ["ml", 1000], litro: ["ml", 1000], litros: ["ml", 1000],
  g: ["g", 1], gr: ["g", 1], grama: ["g", 1], gramas: ["g", 1], kg: ["g", 1000], quilo: ["g", 1000], quilos: ["g", 1000], quilograma: ["g", 1000], kilo: ["g", 1000],
  mg: ["g", 0.001], mcg: ["g", 0.000001],
  m: ["m", 1], mt: ["m", 1], metro: ["m", 1], metros: ["m", 1], cm: ["m", 0.01], mm: ["m", 0.001],
  un: ["unidade", 1], und: ["unidade", 1], unid: ["unidade", 1], unidade: ["unidade", 1], unidades: ["unidade", 1],
  folha: ["folha", 1], folhas: ["folha", 1], comprimido: ["comprimido", 1], comprimidos: ["comprimido", 1], caps: ["capsula", 1], capsula: ["capsula", 1], capsulas: ["capsula", 1],
};
const UNIT_RX = "ml|litros?|lt|l|kg|quilos?|quilograma|kilo|gramas?|gr|mg|mcg|g|metros?|mt|cm|mm|m|unidades?|unid|und|un|folhas?|comprimidos?|caps(?:ula)?s?";
const clean = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().replace(/(\d),(\d)/g, "$1.$2");
const conv = (num, tok) => { const e = U[tok]; return e ? { base: e[0], fator: num * e[1] } : null; };

// remove trechos de CONCENTRAÇÃO/TAXA p/ não confundir com conteúdo: "10 mg/ml", "5 mg / ml", "1 %"
const stripConc = (s) => s.replace(/\d+(?:\.\d+)?\s*(?:mg|mcg|g|ui|%)\s*\/\s*(?:ml|l|g|kg|dose|comp\w*)/g, " ").replace(/\d+(?:\.\d+)?\s*%/g, " ");

function parseDesc(descRaw) {
  const s0 = clean(descRaw); const s = stripConc(s0);
  // A) "com/contendo/c/ N <unit>" — conteúdo explícito (alta confiança)
  let m = s.match(new RegExp(`(?:com|contendo|c/)\\s+(\\d+(?:\\.\\d+)?)\\s*(${UNIT_RX})\\b`, "i"));
  if (m) { const c = conv(parseFloat(m[1]), m[2]); if (c && c.fator > 0) return { ...c, metodo: "desc_com", conf: 0.85 }; }
  // B) dimensão "N x N [unit]" → área m2 (ex.: 60cmx60cm, 20cm x 1,8m). Cada lado tem sua PRÓPRIA unidade;
  // se o 1º lado não traz unidade, herda a do 2º ("50 x 50 cm").
  m = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(cm|mm|m)?\\s*x\\s*(\\d+(?:\\.\\d+)?)\\s*(cm|mm|m)\\b`, "i"));
  if (m) { const u2 = m[4], u1 = m[2] || u2, k1 = U[u1] ? U[u1][1] : 0.01, k2 = U[u2] ? U[u2][1] : 0.01;
    const area = parseFloat(m[1]) * k1 * parseFloat(m[3]) * k2; if (area > 0) return { base: "m2", fator: area, metodo: "desc_dim", conf: 0.7 }; }
  // C) medida avulsa "N <unit>" — pega a ÚLTIMA (tipicamente o tamanho da embalagem no fim: "gotas 20ml", "açúcar 5kg").
  // CONSERVADOR: conteúdo só VOLUME (ml/l) e MASSA MACRO (g/kg) — NUNCA mg/mcg (é dose) nem comprimento avulso (é
  // dimensão/spec do produto: "tubo 1,55mm", "instrumento 25mm"). Comprimento só p/ bem-vendido-por-metro no texto.
  const lenGood = /\b(rolo|bobina|fita|cabo|mangueira|fio|arame|corda|lona|tnt|feltro|lencol|papel toalha|cordao)\b/.test(s);
  const macro = new Set(["ml", "l", "litro", "litros", "lt", "g", "kg", "grama", "gramas", "quilo", "quilos", "quilograma", "kilo"]);
  const all = [...s.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_RX})\\b`, "gi"))];
  const cont = all.filter((x) => macro.has(x[2]) || (lenGood && U[x[2]] && U[x[2]][0] === "m"));
  if (cont.length) { const last = cont[cont.length - 1]; const c = conv(parseFloat(last[1]), last[2]); if (c && c.fator > 0) return { ...c, metodo: "desc_medida", conf: cont.length === 1 ? 0.7 : 0.55 }; }
  return null;
}

const FILTRO = `i.unit_homologado BETWEEN 0.5 AND 100000 AND i.quantidade>0 AND i.descricao IS NOT NULL`;
const NORM = `lower(btrim(regexp_replace(regexp_replace(i.descricao,'<[^>]*>','','g'),'\\s+',' ','g')))`;

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 600000 });
  db.on("error", () => {});
  const q = (s, p) => db.query(s, p);
  // universo: itens cujo rótulo caiu em container (Camada 1 fraca) — distinct por descrição normalizada
  console.log("carregando descrições de itens-container…");
  const rows = (await q(`SELECT ${NORM} chave, count(*) n, min(i.descricao) descricao
    FROM itens_sc i JOIN item_apresentacao_sc a ON a.unidade=lower(btrim(i.unidade))
    WHERE ${FILTRO} AND a.metodo='rotulo_container' GROUP BY 1`)).rows;
  const totItens = rows.reduce((a, b) => a + Number(b.n), 0);
  console.log(`  ${rows.length.toLocaleString()} descrições distintas · ${totItens.toLocaleString()} itens-container`);

  await q(`CREATE TABLE IF NOT EXISTS item_apresentacao_desc_sc (
    chave TEXT PRIMARY KEY, unidade_basica TEXT, fator NUMERIC, conf NUMERIC, metodo TEXT, n_itens INT, atualizado TIMESTAMPTZ DEFAULT now())`);
  await q(`TRUNCATE item_apresentacao_desc_sc`);

  const A = { c: [], b: [], f: [], cf: [], m: [], n: [] };
  let cov = 0; const porMetodo = {};
  for (const r of rows) {
    const p = parseDesc(r.descricao); const n = Number(r.n);
    if (!p) continue;
    cov += n; porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + n;
    A.c.push(r.chave); A.b.push(p.base); A.f.push(p.fator); A.cf.push(p.conf); A.m.push(p.metodo); A.n.push(n);
  }
  for (let i = 0; i < A.c.length; i += 5000)
    await q(`INSERT INTO item_apresentacao_desc_sc (chave, unidade_basica, fator, conf, metodo, n_itens)
      SELECT * FROM unnest($1::text[],$2::text[],$3::numeric[],$4::numeric[],$5::text[],$6::int[]) ON CONFLICT (chave) DO NOTHING`,
      [A.c.slice(i, i + 5000), A.b.slice(i, i + 5000), A.f.slice(i, i + 5000), A.cf.slice(i, i + 5000), A.m.slice(i, i + 5000), A.n.slice(i, i + 5000)]);

  console.log(`\n✔ item_apresentacao_desc_sc · resgatou ${cov.toLocaleString()}/${totItens.toLocaleString()} itens-container (${(100 * cov / totItens).toFixed(1)}%) do texto`);
  console.log("por método (itens):"); for (const [k, v] of Object.entries(porMetodo).sort((a, b) => b[1] - a[1])) console.log("  " + k.padEnd(14) + v.toLocaleString());
  // amostra p/ eyeball
  console.log("\nAMOSTRA (base × fator · método · descrição):");
  const smp = (await q(`SELECT d.unidade_basica b, d.fator f, d.metodo m, left(i.descricao,64) desc
    FROM item_apresentacao_desc_sc d JOIN itens_sc i ON ${NORM}=d.chave WHERE ${FILTRO} GROUP BY 1,2,3,4 ORDER BY random() LIMIT 14`)).rows;
  smp.forEach(x => console.log("  " + `${x.b}×${x.f}`.padEnd(14) + String(x.m).padEnd(13) + " :: " + x.desc));
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
