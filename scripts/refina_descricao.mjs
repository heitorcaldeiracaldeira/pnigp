// REFINO da descrição enriquecida — passe LEVE sobre app.item_enriquecimento (não re-varre os 12GB):
//  1) descricao_refinada = isola o segmento de SPEC que casa com o item, cortando preço/qtd/marca (cauda tabular);
//  2) unidade_norm       = normaliza a unidade (Unidade/UNIDADE/UN/UND/… → "unidade"; KG→"kg"; etc.).
// Idempotente (só onde descricao_refinada IS NULL). Batch update. node scripts/refina_descricao.mjs
import fs from "fs"; import pg from "pg";
const U = fs.readFileSync("./.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const LOTE = Number(process.env.LOTE || 5000);
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// vocabulário canônico de unidade
function normUnidade(u) {
  const s = norm(u).replace(/[()./,]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const T = [
    ["unidade", /\bunidades?\b|\bunid\b|\bun\b|\bund\b|\bund?e?\b/],
    ["kg", /\bkg\b|\bkgs\b|quilo|kilo/], ["grama", /\bgramas?\b|\bgr?\b/],
    ["litro", /\blitros?\b|\blt?s?\b/], ["ml", /\bml\b|mililitro/],
    ["metro", /\bmetros?\b|\bmts?\b|\bm\b/], ["m2", /\bm2\b|metro quadrado/], ["m3", /\bm3\b|metro cubico/],
    ["peça", /\bpe[cç]as?\b|\bpc\b/], ["caixa", /\bcaixas?\b|\bcx\b/], ["pacote", /\bpacotes?\b|\bpct\b|\bpct\b/],
    ["comprimido", /\bcomprimidos?\b|\bcp\b|c[aá]psulas?|\bcaps?\b/], ["frasco", /\bfrascos?\b|\bfr\b/],
    ["ampola", /\bampolas?\b|\bamp\b/], ["par", /\bpares?\b|\bpar\b/], ["kit", /\bkits?\b|\bconjuntos?\b|\bcj\b/],
    ["rolo", /\brolos?\b|\brl\b/], ["saco", /\bsacos?\b|\bsc\b/], ["fardo", /\bfardos?\b/],
    ["mês", /\bmes(es)?\b/], ["hora", /\bhoras?\b|\bh\b/], ["dia", /\bdias?\b/], ["dose", /\bdoses?\b/],
    ["resma", /\bresmas?\b/], ["galão", /\bgal[aã]o\b|\bgl\b/], ["tonelada", /\btoneladas?\b|\bton?\b/],
    ["serviço", /\bservi[cç]os?\b|\bserv\b/], ["verba", /\bverba\b|\bvb\b/],
  ];
  for (const [canon, re] of T) if (re.test(s)) return canon;
  return s.split(" ")[0]; // fallback: 1ª palavra
}

// limpa ruído tabular: preço (r/R$), códigos de catálogo, marca/modelo, runs de números, nº do item no início
function limpaNoise(s) {
  return (" " + s + " ")
    .replace(/\br\s*\$?\s*[\d.,]+/gi, " ")                       // r 240 00 / R$ 5,89
    .replace(/\b(cim|cin|cir|cat|cod|pdm)\s*\d+\b/gi, " ")       // códigos de catálogo (cim2614, cin20109)
    .replace(/\bmarca\b[\s:]*\S+/gi, " ").replace(/\bmodelo\b[\s:]*\S*/gi, " ")
    .replace(/valor\s+(inicial|final|unit\w*|total)/gi, " ").replace(/itens do lote|quantidade/gi, " ")
    .replace(/\b\d[\d.,]*\b(?:\s+\b\d[\d.,]*\b)+/g, " ")         // runs de 2+ grupos numéricos (coluna de preço/qtd)
    .replace(/\b\d{3,}\b/g, " ")                                 // códigos numéricos longos
    .replace(/\s+/g, " ").trim()
    .replace(/^[\d\s.,;:|()-]+/, "").replace(/[\s.,;:|()-]+$/, "").trim(); // nº do item no início + pontuação nas pontas
}
// isola a SPEC pela JANELA de maior densidade de tokens do item, aperta do 1º ao último token e limpa o ruído
function refina(api, doc) {
  if (!doc) return null;
  const apiSet = new Set(norm(api).split(/\s+/).filter((t) => t.length > 2));
  if (!apiSet.size) { const c = limpaNoise(doc); return c.length >= 8 ? c.slice(0, 400) : null; }
  const words = doc.split(/\s+/), nw = words.map(norm);
  const W = Math.max(10, Math.min(45, apiSet.size * 2 + 8));
  let bStart = 0, bSc = -1;
  for (let i = 0; i <= Math.max(0, words.length - 1); i++) { let sc = 0; for (let j = i; j < Math.min(words.length, i + W); j++) if (apiSet.has(nw[j])) sc++; if (sc > bSc) { bSc = sc; bStart = i; } }
  const hit = []; for (let j = bStart; j < Math.min(words.length, bStart + W); j++) if (apiSet.has(nw[j])) hit.push(j);
  const s = hit.length ? hit[0] : bStart, e = hit.length ? Math.min(words.length, hit[hit.length - 1] + 2) : bStart + W;
  const c = limpaNoise(words.slice(s, e).join(" "));
  return c.length >= 8 ? c : null;
}

const REFINO_V = 2; // bump ao melhorar a heurística → reprocessa
async function main() {
  await db.query(`ALTER TABLE app.item_enriquecimento ADD COLUMN IF NOT EXISTS descricao_refinada text`);
  await db.query(`ALTER TABLE app.item_enriquecimento ADD COLUMN IF NOT EXISTS unidade_norm text`);
  await db.query(`ALTER TABLE app.item_enriquecimento ADD COLUMN IF NOT EXISTS refino_v int`);

  // (a) unidade_norm — só se faltar (idempotente)
  let tu = 0;
  for (;;) {
    const rows = (await db.query(`SELECT cnpj,ano,seq,numero,unidade_api FROM app.item_enriquecimento WHERE unidade_norm IS NULL LIMIT ${LOTE}`)).rows;
    if (!rows.length) break;
    const k = [], uni = [];
    for (const r of rows) { k.push(`${r.cnpj}|${r.ano}|${r.seq}|${r.numero}`); uni.push(normUnidade(r.unidade_api) || ""); }
    await db.query(`UPDATE app.item_enriquecimento e SET unidade_norm = coalesce(nullif(v.uni,''),'unidade')
      FROM (SELECT unnest($1::text[]) k, unnest($2::text[]) uni) v
      WHERE e.cnpj=split_part(v.k,'|',1) AND e.ano=split_part(v.k,'|',2)::int AND e.seq=split_part(v.k,'|',3)::int AND e.numero=split_part(v.k,'|',4)::int`, [k, uni]);
    tu += rows.length; process.stdout.write(`  unidade: ${tu}\r`);
  }

  // (b) descricao_refinada — (re)processa spec items abaixo da versão atual (heurística de janela + limpeza)
  let tr = 0;
  for (;;) {
    const rows = (await db.query(`SELECT cnpj,ano,seq,numero,descricao_api,descricao_documento
      FROM app.item_enriquecimento
      WHERE descricao_e_spec AND descricao_documento IS NOT NULL AND coalesce(refino_v,0) < ${REFINO_V} LIMIT ${LOTE}`)).rows;
    if (!rows.length) break;
    const k = [], ref = [];
    for (const r of rows) { k.push(`${r.cnpj}|${r.ano}|${r.seq}|${r.numero}`); ref.push(refina(r.descricao_api, r.descricao_documento) || ""); }
    await db.query(`UPDATE app.item_enriquecimento e SET descricao_refinada = nullif(v.ref,''), refino_v = ${REFINO_V}
      FROM (SELECT unnest($1::text[]) k, unnest($2::text[]) ref) v
      WHERE e.cnpj=split_part(v.k,'|',1) AND e.ano=split_part(v.k,'|',2)::int AND e.seq=split_part(v.k,'|',3)::int AND e.numero=split_part(v.k,'|',4)::int`, [k, ref]);
    tr += rows.length; process.stdout.write(`  descrição refinada v${REFINO_V}: ${tr}\r`);
  }
  console.log(`\n✔ refino v${REFINO_V}: unidade +${tu} · descrição ${tr}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
