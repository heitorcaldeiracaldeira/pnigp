// APRESENTAÇÃO — Camada LLM (Haiku): extrai a QUANTIDADE DO CONTEÚDO das descrições-resíduo que a Camada 2 determinística
// não resolveu (container sem qtd / rótulo desconhecido) MAS que TÊM dígito+unidade no texto (ambíguo: concentração vs
// conteúdo, número que é dimensão, etc.). Retrieve-then-extract com ABSTENÇÃO: se a quantidade de conteúdo não está
// declarada, o modelo abstém (quantidade=0) e o item fica discreto. Grava em item_apresentacao_desc_sc (metodo='llm').
// Envelope "não-inventa": só adota conf>=APPLY_TH. Cache próprio. MODE=test LIMIT=50 valida o prompt antes do full.
// node scripts/build_apresentacao_llm.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { z } from "zod"; import { generateObject } from "ai";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE_FILE = path.join(__dirname, "_apresentacao_llm_cache.json");
const CONC = Number(process.env.CONC || 5);
const APPLY_TH = Number(process.env.APPLY_TH || 0.7);
const LIMIT = Number(process.env.LIMIT || 0);
const MODE = (process.env.MODE || "test").toLowerCase();

for (const f of [path.join(ROOT, ".env.ai"), path.join(ROOT, ".env.local")])
  try { for (const l of fs.readFileSync(f, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); } } catch {}
const { anthropic } = await import("@ai-sdk/anthropic");
const MODEL = anthropic(process.env.RERANK_MODEL_ANTHROPIC || "claude-haiku-4-5");
console.log("credencial: ANTHROPIC_API_KEY · modelo: claude-haiku-4-5 · MODE=" + MODE + (LIMIT ? " LIMIT=" + LIMIT : ""));

// conversão do que o modelo devolve (unidade + quantidade) p/ base canônica + fator
const U = { ml: ["ml", 1], l: ["ml", 1000], litro: ["ml", 1000], g: ["g", 1], grama: ["g", 1], kg: ["g", 1000], mg: ["g", 0.001], mcg: ["g", 0.000001],
  m: ["m", 1], cm: ["m", 0.01], mm: ["m", 0.001], metro: ["m", 1], unidade: ["unidade", 1], un: ["unidade", 1],
  comprimido: ["comprimido", 1], capsula: ["capsula", 1], folha: ["folha", 1], dose: ["dose", 1], ampola: ["ampola", 1] };

const Schema = z.object({
  unidade: z.enum(["ml", "l", "g", "kg", "mg", "m", "cm", "mm", "unidade", "comprimido", "capsula", "folha", "dose", "ampola", "nenhum"]).describe("unidade básica do CONTEÚDO da embalagem, ou 'nenhum' se não declarada"),
  quantidade: z.number().describe("quantas <unidade> há em UMA embalagem vendida; 0 se não declarada"),
  confianca: z.number().min(0).max(1),
});
const SYSTEM = `Você lê a descrição de um item de compra pública vendido POR EMBALAGEM (frasco, caixa, pacote, kit, rolo…) e extrai a QUANTIDADE DE CONTEÚDO de UMA embalagem.
Regras rígidas:
- Devolva a UNIDADE BÁSICA do conteúdo (ml, g, metro, unidade, comprimido…) e QUANTOS há em UMA embalagem.
- CONTEÚDO ≠ CONCENTRAÇÃO: "10 mg/ml" ou "0,5%" é concentração — IGNORE. "frasco 500 ml" → unidade=ml, quantidade=500.
- Se a embalagem contém N sub-embalagens de M cada ("caixa com 12 frascos de 1000 ml"), multiplique: unidade=ml, quantidade=12000.
- Se a quantidade de conteúdo NÃO está declarada no texto, responda unidade='nenhum', quantidade=0 (NÃO invente).
- Números que são DIMENSÃO do produto (espessura "1,55 mm", diâmetro) NÃO são conteúdo → 'nenhum'.`;

const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};
const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

async function extract(desc) {
  const key = norm(desc); if (cache[key]) return cache[key];
  const { object } = await generateObject({ model: MODEL, schema: Schema, temperature: 0, system: SYSTEM,
    prompt: `DESCRIÇÃO: ${desc}\n\nQuantidade de conteúdo de UMA embalagem?` });
  const e = U[object.unidade]; const res = (object.unidade === "nenhum" || !e || object.quantidade <= 0)
    ? { base: null, fator: 0, conf: object.confianca }
    : { base: e[0], fator: object.quantidade * e[1], conf: object.confianca };
  cache[key] = res; return res;
}
async function pool(items, fn) {
  const out = new Array(items.length); let idx = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < items.length) { const i = idx++; try { out[i] = await fn(items[i]); } catch (e) { out[i] = { _err: e.message }; }
      if (++done % 20 === 0) { saveCache(); process.stdout.write(`  ${done}/${items.length}\r`); } }
  }));
  saveCache(); return out;
}

const { default: pg } = await import("pg");
const DB = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: DB, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 1800000 });
db.on("error", () => {});
const q = async (s, p) => { for (let i = 0; ; i++) { try { return await db.query(s, p); } catch (e) { if (i >= 2) throw e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); } } };
const FILTRO = `i.unit_homologado BETWEEN 0.5 AND 100000 AND i.quantidade>0 AND i.descricao IS NOT NULL AND i.descricao !~* 'obra|constru|servi|loca[çc]|reforma|manuten|consultoria|projeto|implanta|treinamento' AND i.unidade !~* 'serv|m[êe]s|mes|diaria|verba|global|hora'`;
const NORM = `lower(btrim(regexp_replace(regexp_replace(i.descricao,'<[^>]*>','','g'),'\\s+',' ','g')))`;

// resíduo com dígito+unidade no texto (candidatas reais)
const rows = (await q(`SELECT ${NORM} chave, min(i.descricao) descricao, count(*) n
  FROM itens_sc i LEFT JOIN item_apresentacao_sc a1 ON a1.unidade=lower(btrim(i.unidade))
  LEFT JOIN item_apresentacao_desc_sc a2 ON a2.chave=${NORM}
  WHERE ${FILTRO} AND ((a1.metodo='rotulo_container' AND a2.chave IS NULL) OR a1.metodo IS NULL)
    AND i.descricao ~* '[0-9]+ *(ml|l|g|kg|mg|un|unid|folha|metro|comprimido|caps|dose)'
  GROUP BY 1 ORDER BY n DESC ${LIMIT ? "LIMIT " + LIMIT : ""}`)).rows;
console.log(`${rows.length.toLocaleString()} descrições-resíduo com qtd candidata`);

const res = await pool(rows, (r) => extract(r.descricao));
let adot = 0, abst = 0; const A = { c: [], b: [], f: [], cf: [] };
for (let i = 0; i < rows.length; i++) {
  const e = res[i]; if (!e || e._err) continue;
  if (e.base && e.fator > 0 && (e.conf ?? 0) >= APPLY_TH) { adot++; A.c.push(rows[i].chave); A.b.push(e.base); A.f.push(e.fator); A.cf.push(e.conf); }
  else abst++;
}
console.log(`\nadotadas ${adot.toLocaleString()} · abstenções ${abst.toLocaleString()}`);

if (MODE === "test") {
  console.log("\nAMOSTRA (adotadas):");
  let shown = 0;
  for (let i = 0; i < rows.length && shown < 16; i++) { const e = res[i]; if (e && e.base && e.fator > 0 && (e.conf ?? 0) >= APPLY_TH) { console.log("  " + `${e.base}×${e.fator}`.padEnd(16) + "c=" + e.conf + " :: " + String(rows[i].descricao).slice(0, 62)); shown++; } }
  console.log("\nAMOSTRA (abstenções):");
  shown = 0;
  for (let i = 0; i < rows.length && shown < 8; i++) { const e = res[i]; if (e && !(e.base && e.fator > 0 && (e.conf ?? 0) >= APPLY_TH) && !e._err) { console.log("  (sem qtd) :: " + String(rows[i].descricao).slice(0, 70)); shown++; } }
} else {
  for (let i = 0; i < A.c.length; i += 5000)
    await q(`INSERT INTO item_apresentacao_desc_sc (chave, unidade_basica, fator, conf, metodo, n_itens)
      SELECT * FROM unnest($1::text[],$2::text[],$3::numeric[],$4::numeric[]) AS t(chave,ub,f,cf), LATERAL (SELECT 'llm'::text, 1) x(m,n)
      ON CONFLICT (chave) DO UPDATE SET unidade_basica=EXCLUDED.unidade_basica, fator=EXCLUDED.fator, conf=EXCLUDED.conf, metodo='llm'`,
      [A.c.slice(i, i + 5000), A.b.slice(i, i + 5000), A.f.slice(i, i + 5000), A.cf.slice(i, i + 5000)]);
  console.log(`gravadas ${adot.toLocaleString()} extrações LLM em item_apresentacao_desc_sc`);
}
await db.end();
