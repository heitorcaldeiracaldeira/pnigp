// GABARITO: a MARCA está na DESCRIÇÃO do item? (amostra rotulada por LLM, método do CATMAT — ver [[pnigp-catmat-classificacao]])
//
// POR QUE: medir isso com DICIONÁRIO de marcas é NÃO-CONFIÁVEL — bastam 3 entradas que sejam palavra comum
// ("obra", "nylon", "geral") p/ casar com qualquer descrição e inflar o número (deu 18,2% falso). Gabarito é o
// método honesto: amostra rotulada, com controle e verificação.
//
// 3 SALVAGUARDAS (o que faz este número valer):
//  1. GRUPO DE CONTROLE (pregão): a âncora independente (marca da ATA × descrição do MESMO item, 2.392 pares) já
//     provou que só ~3% das descrições de pregão contêm a marca — a descrição é ESPEC e o art. 41 da Lei 14.133 VEDA
//     indicar marca. Se o LLM não reproduzir ~3% no controle, o INSTRUMENTO está errado e o nº da dispensa não vale.
//  2. ANTI-ALUCINAÇÃO: o LLM devolve o trecho LITERAL; se a "marca" não existir no texto, a resposta é DESCARTADA.
//  3. AMOSTRA FIXA (ORDER BY hash determinístico) + cache → reproduzível, sem viés de "rodar até dar certo".
//
// node scripts/gabarito_marca_descricao.mjs   (env: N_DISPENSA=200 N_CONTROLE=100 CONC=5)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { z } from "zod";
import { generateObject } from "ai";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
if (!process.env.ANTHROPIC_API_KEY) { const k = env.match(/^ANTHROPIC_API_KEY=(.+)$/m); if (k) process.env.ANTHROPIC_API_KEY = k[1].trim(); }
const N_DISPENSA = Number(process.env.N_DISPENSA || 200);
const N_CONTROLE = Number(process.env.N_CONTROLE || 100);
const CONC = Number(process.env.CONC || 5);
const CACHE_FILE = path.join(__dirname, "_gabarito_marca_cache.json");

const { anthropic } = await import("@ai-sdk/anthropic");
const MODEL = anthropic(process.env.GABARITO_MODEL || "claude-haiku-4-5");
console.log("credencial:", process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY" : "NENHUMA", "· modelo: claude-haiku-4-5\n");

const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};
const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const Schema = z.object({
  tem_marca: z.boolean().describe("true SÓ se a descrição nomear uma marca comercial/fabricante de produto"),
  marca: z.string().describe("o nome da marca EXATAMENTE como escrito na descrição; string vazia se tem_marca=false"),
  confianca: z.number().min(0).max(1),
});
const SYSTEM = `Você audita descrições de itens de compra pública municipal brasileira.
Responda APENAS: a descrição NOMEIA uma MARCA COMERCIAL (fabricante) do produto?

É MARCA: nome de fabricante/marca registrada. Ex.: Intelbras, 3M, Caterpillar, Sigvaris, Nestlé, Tramontina, Ambev.
NÃO É MARCA (responda false):
- nome/tipo do produto ("mangueira", "cadeira", "pasta escolar", "vidro liso")
- material, cor, medida, norma ("nylon", "inox", "incolor", "3mm", "ABNT")
- tipo de serviço ("mão de obra", "manutenção", "obra")
- nome do órgão/município/programa ("PROERD", "FNDE", "Prefeitura")
- referência a norma ou a "similar"/"equivalente" SEM nomear a marca

ATENÇÃO: a lei brasileira (art. 41 da Lei 14.133) VEDA indicar marca no edital, então a MAIORIA das descrições é
especificação genérica SEM marca. Não force: na dúvida, responda false.
Se tem_marca=true, copie a marca EXATAMENTE como aparece no texto (não normalize, não invente).`;

async function rotula(desc) {
  const k = norm(desc).slice(0, 300);
  if (cache[k]) return cache[k];
  for (let t = 0; t < 4; t++) {
    try {
      const { object } = await generateObject({ model: MODEL, schema: Schema, system: SYSTEM,
        prompt: `DESCRIÇÃO DO ITEM:\n"""${String(desc).slice(0, 1200)}"""`, temperature: 0 });
      cache[k] = object; return object;
    } catch (e) { if (t === 3) return { tem_marca: false, marca: "", confianca: 0, _erro: e.message }; await new Promise((r) => setTimeout(r, 2000 * (t + 1))); }
  }
}

const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 300000 });
await db.connect();
await db.query(`CREATE TABLE IF NOT EXISTS item_marca_gabarito_sc (
  cnpj TEXT, ano INT, seq INT, numero INT, grupo TEXT, modalidade TEXT, descricao TEXT,
  tem_marca BOOLEAN, marca_llm TEXT, confianca NUMERIC, verificada BOOLEAN, atualizado timestamptz DEFAULT now(),
  PRIMARY KEY (cnpj,ano,seq,numero))`);

// AMOSTRA FIXA: md5 do identificador = ordem estável e independente de inserções novas (não é random()).
async function amostra(cond, n, grupo) {
  return (await db.query(`SELECT i.cnpj,i.ano,i.seq,i.numero,i.descricao,c.modalidade,'${grupo}' grupo
    FROM itens_sc i JOIN contratacoes_sc c ON c.cnpj=i.cnpj AND c.ano=i.ano AND c.seq=i.seq
    WHERE ${cond} AND i.descricao IS NOT NULL AND length(i.descricao) BETWEEN 20 AND 600
    ORDER BY md5(i.cnpj||i.ano||i.seq||i.numero) LIMIT ${n}`)).rows;
}
const itens = [
  ...(await amostra("c.modalidade ILIKE '%dispensa%'", N_DISPENSA, "dispensa")),
  ...(await amostra("c.modalidade ILIKE '%pregão - eletrônico%'", N_CONTROLE, "controle_pregao")),
];
console.log(`amostra: ${itens.length} itens (${N_DISPENSA} dispensa + ${N_CONTROLE} controle-pregão)\n`);

let i = 0, feitos = 0;
const res = [];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < itens.length) {
    const it = itens[i++];
    const o = await rotula(it.descricao);
    // ANTI-ALUCINAÇÃO: a marca tem que existir LITERALMENTE no texto, senão não conta
    const verificada = !!(o.tem_marca && o.marca && norm(it.descricao).includes(norm(o.marca)));
    res.push({ ...it, ...o, verificada });
    if (++feitos % 25 === 0) { process.stdout.write(`  ${feitos}/${itens.length}\r`); saveCache(); }
  }
}));
saveCache();

for (const r of res) {
  await db.query(`INSERT INTO item_marca_gabarito_sc (cnpj,ano,seq,numero,grupo,modalidade,descricao,tem_marca,marca_llm,confianca,verificada)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET
      grupo=EXCLUDED.grupo, tem_marca=EXCLUDED.tem_marca, marca_llm=EXCLUDED.marca_llm,
      confianca=EXCLUDED.confianca, verificada=EXCLUDED.verificada, atualizado=now()`,
    [r.cnpj, r.ano, r.seq, r.numero, r.grupo, r.modalidade, String(r.descricao).slice(0, 600), r.tem_marca, r.marca || null, r.confianca, r.verificada]);
}

console.log("\n=== RESULTADO ===");
for (const g of ["controle_pregao", "dispensa"]) {
  const s = res.filter((r) => r.grupo === g);
  const v = s.filter((r) => r.verificada).length;
  const bruto = s.filter((r) => r.tem_marca).length;
  console.log(`  ${g.padEnd(16)} n=${String(s.length).padStart(4)} · LLM diz marca: ${String(bruto).padStart(3)} (${((bruto/s.length)*100).toFixed(1)}%) · VERIFICADA no texto: ${String(v).padStart(3)} (${((v/s.length)*100).toFixed(1)}%)`);
}
const alu = res.filter((r) => r.tem_marca && !r.verificada).length;
console.log(`\n  alucinacao (LLM deu marca que NAO esta no texto): ${alu} — descartadas`);
console.log(`  ⚠ VALIDACAO DO INSTRUMENTO: o controle-pregão tem que dar ~3% (a âncora independente deu 3,3%).`);
console.log(`     Se der muito diferente, o LLM não é confiável aqui e o nº da dispensa NÃO vale.`);

console.log("\n--- dispensa COM marca (verificada) ---");
for (const r of res.filter((x) => x.grupo === "dispensa" && x.verificada).slice(0, 10))
  console.log(`   [${String(r.marca).slice(0,16).padEnd(16)}] "${String(r.descricao).replace(/\s+/g," ").slice(0,66)}"`);
console.log("\n--- dispensa SEM marca ---");
for (const r of res.filter((x) => x.grupo === "dispensa" && !x.tem_marca).slice(0, 5))
  console.log(`   "${String(r.descricao).replace(/\s+/g," ").slice(0,74)}"`);
await db.end();
