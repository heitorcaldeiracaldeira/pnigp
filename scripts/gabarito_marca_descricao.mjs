// GABARITO — A MARCA ESTÁ NA DESCRIÇÃO DO ITEM? (amostra rotulada; método do CATMAT, ver [[pnigp-catmat-classificacao]])
//
// ═══ POR QUE ESTE SCRIPT EXISTE ═══
// Medir presença de marca em texto livre com DICIONÁRIO de marcas é NÃO-CONFIÁVEL: basta que 3 entradas sejam palavra
// comum ("obra", "nylon", "geral") p/ casar com qualquer descrição. Foi feito e deu 18,2% — 100% falso positivo
// ("SERVIÇO MÃO DE OBRA PRENSAR MANGUEIRA" não tem marca). Gabarito é o método honesto: amostra rotulada + controle.
//
// ═══ A PERGUNTA ═══
// PREGÃO: a resposta JÁ É CONHECIDA por uma âncora independente (sem LLM) — a ata dá a marca VERDADEIRA do item e o
//   itens_sc dá a descrição do MESMO item; em 2.392 pares, só ~3% das descrições contêm a marca da ata. Faz sentido:
//   a descrição é ESPEC e o art. 41 da Lei 14.133 VEDA indicar marca no edital ("Vidro liso incolor 3mm" quando a ata
//   diz VIDREX). A marca só nasce quando o fornecedor OFERTA.
// DISPENSA: a âncora NÃO cobre (dispensa quase não publica ata de resultado: Betha 1,7%, IPM 0,3%). E dispensa é
//   compra DIRETA, sem competição — o art. 41 não morde e o comprador pode escrever o produto exato ("peça p/
//   retroescavadeira JCB 3CX"). É a pergunta em aberto, e é o que este gabarito responde.
//
// ═══ 4 SALVAGUARDAS (o que faz o número valer) ═══
//  1. CONTROLE + ÂNCORA AUTOMÁTICA: o script recalcula a âncora (marca da ata × descrição) e compara com o que o LLM
//     diz no grupo de controle. Se divergirem, o INSTRUMENTO está errado e o nº da dispensa NÃO vale — o script avisa.
//  2. ANTI-ALUCINAÇÃO com FRONTEIRA DE PALAVRA: o LLM devolve o trecho literal e ele tem que existir na descrição
//     como PALAVRA INTEIRA. `includes()` era o defeito anterior: "ABB" casava dentro de "GABBIANO", "GM" dentro de
//     "SIGMA" — inflava sigla curta, que é justo a marca mais comum.
//  3. AMOSTRA FIXA (ORDER BY md5, não random()) + cache → reproduzível; sem viés de "rodar até dar certo".
//  4. IC95 SEMPRE IMPRESSO: com n pequeno o intervalo é largo e afirmar diferença é ilusão (n=100 deu IC 2–12%).
//
// EFICIÊNCIA: INSERT em LOTE (unnest) — 1 query por lote, não 1 por linha. Era 300 roundtrips × ~150ms até us-east-1
// = ~45s de latência pura (o Neon estava ocioso: 2 conexões de 901; o gargalo era o DESENHO). Grava incremental, então
// interromper não perde trabalho. Erro de dado/schema falha na hora (retry cego esconde bug — lição do byte NUL).
//
// node scripts/gabarito_marca_descricao.mjs   (env: N_DISPENSA=700 N_CONTROLE=500 CONC=6 LOTE=200)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { z } from "zod";
import { generateObject } from "ai";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
if (!process.env.ANTHROPIC_API_KEY) { const k = env.match(/^ANTHROPIC_API_KEY=(.+)$/m); if (k) process.env.ANTHROPIC_API_KEY = k[1].trim(); }
const N_DISPENSA = Number(process.env.N_DISPENSA || 700);
const N_CONTROLE = Number(process.env.N_CONTROLE || 500);
const CONC = Number(process.env.CONC || 6);
const LOTE = Number(process.env.LOTE || 200);
const CACHE_FILE = path.join(__dirname, "_gabarito_marca_cache.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { anthropic } = await import("@ai-sdk/anthropic");
const MODEL = anthropic(process.env.GABARITO_MODEL || "claude-haiku-4-5");
console.log(`credencial: ${process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY" : "NENHUMA"} · modelo: claude-haiku-4-5 · conc ${CONC}\n`);

const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};
const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
// normaliza p/ comparar: minúscula + sem acento (a descrição do PNCP mistura "AÇÃO"/"ACAO")
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// PALAVRA INTEIRA, não substring. `\b` no fim não funciona se a marca terminar em símbolo (ex. "3M+") → usa lookaround.
const contemPalavra = (texto, termo) => {
  const t = norm(termo).trim();
  if (!t) return false;
  try { return new RegExp("(^|[^a-z0-9])" + esc(t) + "([^a-z0-9]|$)", "i").test(norm(texto)); } catch { return false; }
};
// IC95 binomial (Wald) — com n pequeno o intervalo é largo e TEM que aparecer, senão a diferença é ilusão
const ic95 = (k, n) => { if (!n) return [0, 0]; const p = k / n, se = Math.sqrt(p * (1 - p) / n); return [Math.max(0, (p - 1.96 * se) * 100), Math.min(100, (p + 1.96 * se) * 100)]; };
const pct = (k, n) => { const [lo, hi] = ic95(k, n); return `${((k / n) * 100).toFixed(1)}% (IC95 ${lo.toFixed(1)}–${hi.toFixed(1)})`; };

const Schema = z.object({
  tem_marca: z.boolean().describe("true SÓ se a descrição nomear uma marca comercial/fabricante de produto"),
  marca: z.string().describe("o nome da marca EXATAMENTE como escrito na descrição; vazio se tem_marca=false"),
  confianca: z.number().min(0).max(1),
});
const SYSTEM = `Você audita descrições de itens de compra pública municipal brasileira.
Responda APENAS: a descrição NOMEIA uma MARCA COMERCIAL (fabricante) do produto?

É MARCA: fabricante/marca registrada. Ex.: Intelbras, 3M, Caterpillar, Sigvaris, Nestlé, Tramontina, JCB, New Holland.
NÃO É MARCA (responda false):
- nome/tipo do produto ("mangueira", "cadeira", "pasta escolar", "vidro liso")
- material, cor, medida, norma ("nylon", "inox", "incolor", "3mm", "ABNT", "PVC")
- tipo de serviço ("mão de obra", "manutenção", "obra")
- nome de órgão/município/programa/setor ("PROERD", "FNDE", "Prefeitura", "Almoxarifado")
- "similar", "equivalente", "de primeira linha" SEM nomear a marca

Se tem_marca=true, copie a marca EXATAMENTE como aparece no texto (não normalize, não invente, não deduza do produto).
Se a marca não estiver escrita no texto, é false — mesmo que você saiba quem fabrica esse produto.`;

async function rotula(desc) {
  const k = norm(desc).slice(0, 300);
  if (cache[k]) return cache[k];
  for (let t = 0; t < 4; t++) {
    try {
      const { object } = await generateObject({ model: MODEL, schema: Schema, system: SYSTEM,
        prompt: `DESCRIÇÃO DO ITEM:\n"""${String(desc).slice(0, 1200)}"""`, temperature: 0 });
      cache[k] = object; return object;
    } catch (e) { if (t === 3) return { tem_marca: false, marca: "", confianca: 0, _erro: String(e.message).slice(0, 60) }; await sleep(2000 * (t + 1)); }
  }
}

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 180000 });
db.on("error", () => {});
const FATAL = new Set(["22P05", "22021", "23505", "23502", "42703", "42P10"]);   // erro de dado/schema: falha NA HORA
const q = async (s, p) => {
  let u; for (let i = 0; i < 12; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (FATAL.has(e.code)) throw e; await sleep(1500 * (i + 1)); } }
  throw new Error(`db (${u?.code}): ${u?.message}`);
};
await q(`CREATE TABLE IF NOT EXISTS item_marca_gabarito_sc (
  cnpj TEXT, ano INT, seq INT, numero INT, grupo TEXT, modalidade TEXT, descricao TEXT,
  tem_marca BOOLEAN, marca_llm TEXT, confianca NUMERIC, verificada BOOLEAN, atualizado timestamptz DEFAULT now(),
  PRIMARY KEY (cnpj,ano,seq,numero))`);

// ═══ ÂNCORA AUTOMÁTICA (sem LLM): a verdade independente contra a qual o instrumento é aferido ═══
const anc = (await q(`SELECT m.marca, i.descricao FROM item_marca_sc m
  JOIN itens_sc i ON i.cnpj=m.cnpj AND i.ano=m.ano AND i.seq=m.seq AND i.numero=m.numero
  JOIN contratacoes_sc c ON c.cnpj=m.cnpj AND c.ano=m.ano AND c.seq=m.seq
  WHERE m.marca IS NOT NULL AND length(m.marca)>=3 AND i.descricao IS NOT NULL AND length(i.descricao)>12
    AND c.modalidade ILIKE '%pregão%'`)).rows;
const ancSim = anc.filter((r) => contemPalavra(r.descricao, r.marca)).length;
console.log(`ÂNCORA (pregão, sem LLM): ${anc.length} pares · descrição contém a marca da ata em ${pct(ancSim, anc.length)}`);
console.log(`  -> é a VERDADE contra a qual o grupo de controle sera aferido\n`);

// AMOSTRA FIXA: md5 do identificador = ordem estável, independente de inserções novas (≠ random()).
const amostra = (cond, n, grupo) => q(`SELECT i.cnpj,i.ano,i.seq,i.numero,i.descricao,c.modalidade,'${grupo}' grupo
  FROM itens_sc i JOIN contratacoes_sc c ON c.cnpj=i.cnpj AND c.ano=i.ano AND c.seq=i.seq
  WHERE ${cond} AND i.descricao IS NOT NULL AND length(i.descricao) BETWEEN 20 AND 600
  ORDER BY md5(i.cnpj||i.ano||i.seq||i.numero) LIMIT ${n}`).then((r) => r.rows);
const itens = [
  ...(await amostra("c.modalidade ILIKE '%dispensa%'", N_DISPENSA, "dispensa")),
  ...(await amostra("c.modalidade ILIKE '%pregão - eletrônico%'", N_CONTROLE, "controle_pregao")),
];
console.log(`amostra: ${itens.length} itens (${N_DISPENSA} dispensa + ${N_CONTROLE} controle-pregão)\n`);

// grava em LOTE (1 query/lote) e INCREMENTAL (interromper não perde trabalho)
async function gravaLote(rs) {
  if (!rs.length) return;
  const C = { cnpj: [], ano: [], seq: [], num: [], gr: [], mod: [], desc: [], tem: [], mar: [], conf: [], ver: [] };
  for (const r of rs) {
    C.cnpj.push(r.cnpj); C.ano.push(r.ano); C.seq.push(r.seq); C.num.push(r.numero); C.gr.push(r.grupo);
    C.mod.push(r.modalidade); C.desc.push(String(r.descricao).slice(0, 600)); C.tem.push(!!r.tem_marca);
    C.mar.push(r.marca || null); C.conf.push(r.confianca ?? 0); C.ver.push(!!r.verificada);
  }
  await q(`INSERT INTO item_marca_gabarito_sc (cnpj,ano,seq,numero,grupo,modalidade,descricao,tem_marca,marca_llm,confianca,verificada)
    SELECT * FROM unnest($1::text[],$2::int[],$3::int[],$4::int[],$5::text[],$6::text[],$7::text[],$8::bool[],$9::text[],$10::numeric[],$11::bool[])
    ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET grupo=EXCLUDED.grupo, tem_marca=EXCLUDED.tem_marca,
      marca_llm=EXCLUDED.marca_llm, confianca=EXCLUDED.confianca, verificada=EXCLUDED.verificada, atualizado=now()`,
    [C.cnpj, C.ano, C.seq, C.num, C.gr, C.mod, C.desc, C.tem, C.mar, C.conf, C.ver]);
}

let i = 0, feitos = 0, buf = [];
const res = [];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < itens.length) {
    const it = itens[i++];
    const o = await rotula(it.descricao);
    const verificada = !!(o.tem_marca && o.marca && contemPalavra(it.descricao, o.marca));
    const r = { ...it, ...o, verificada };
    res.push(r); buf.push(r);
    if (buf.length >= LOTE) { const b = buf; buf = []; await gravaLote(b); saveCache(); }
    if (++feitos % 50 === 0) process.stdout.write(`  ${feitos}/${itens.length}\r`);
  }
}));
await gravaLote(buf); saveCache();

console.log("\n=== RESULTADO ===");
const stat = {};
for (const g of ["controle_pregao", "dispensa"]) {
  const s = res.filter((r) => r.grupo === g);
  const v = s.filter((r) => r.verificada).length;
  stat[g] = { n: s.length, v };
  console.log(`  ${g.padEnd(16)} n=${String(s.length).padStart(4)} · marca VERIFICADA: ${String(v).padStart(3)} = ${pct(v, s.length)}`);
}
const alu = res.filter((r) => r.tem_marca && !r.verificada).length;
console.log(`\n  alucinação descartada (marca não está no texto como palavra): ${alu}`);

// ═══ AFERIÇÃO DO INSTRUMENTO ═══
const [aLo, aHi] = ic95(ancSim, anc.length);
const [cLo, cHi] = ic95(stat.controle_pregao.v, stat.controle_pregao.n);
const bate = cHi >= aLo && cLo <= aHi;   // os IC95 se tocam?
console.log(`\n  AFERIÇÃO: âncora ${pct(ancSim, anc.length)} × controle-LLM ${pct(stat.controle_pregao.v, stat.controle_pregao.n)}`);
console.log(`  ${bate ? "✅ os IC95 se sobrepõem — o instrumento reproduz a verdade conhecida; o nº da dispensa VALE."
                     : "❌ os IC95 NÃO se sobrepõem — o INSTRUMENTO está viesado; o nº da dispensa NÃO vale."}`);

// ═══ A DIFERENÇA DISPENSA×PREGÃO É REAL? ═══
const [dLo, dHi] = ic95(stat.dispensa.v, stat.dispensa.n);
const separado = dLo > cHi;
console.log(`\n  DISPENSA × PREGÃO: ${separado ? "✅ IC95 SEPARADOS — a diferença é real" : "⚠ IC95 SE SOBREPÕEM — a diferença NÃO pode ser afirmada com este n"}`);
console.log(`     dispensa ${dLo.toFixed(1)}–${dHi.toFixed(1)}%  ×  pregão ${cLo.toFixed(1)}–${cHi.toFixed(1)}%`);

// ═══ PROJEÇÃO DE VOLUME, COM O INTERVALO (nunca o número solto) ═══
const vol = Number((await q(`SELECT count(*) n FROM itens_sc i JOIN contratacoes_sc c ON c.cnpj=i.cnpj AND c.ano=i.ano AND c.seq=i.seq
  WHERE (c.modalidade ILIKE '%dispensa%' OR c.modalidade ILIKE '%inexigibilidade%')
    AND i.descricao IS NOT NULL AND length(i.descricao) BETWEEN 20 AND 600`)).rows[0].n);
console.log(`\n  VOLUME: ${vol.toLocaleString()} itens de dispensa+inexigibilidade com descrição útil`);
console.log(`     a ${((stat.dispensa.v / stat.dispensa.n) * 100).toFixed(1)}% -> ~${Math.round(vol * stat.dispensa.v / stat.dispensa.n).toLocaleString()} itens com marca na descrição`);
console.log(`     intervalo honesto: ${Math.round(vol * dLo / 100).toLocaleString()} a ${Math.round(vol * dHi / 100).toLocaleString()}`);

console.log("\n--- DISPENSA com marca verificada ---");
for (const r of res.filter((x) => x.grupo === "dispensa" && x.verificada).slice(0, 10))
  console.log(`   [${String(r.marca).slice(0, 15).padEnd(15)}] "${String(r.descricao).replace(/\s+/g, " ").slice(0, 64)}"`);
await db.end();
