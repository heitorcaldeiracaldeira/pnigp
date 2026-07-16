// EXTRAI a Lei 14.133/2021 (texto oficial do Planalto) para docs/lei-14133-compras.md — os artigos que governam
// o que fazemos: TR, edital, pesquisa de preços, descrição de material, obra, dispensa, inexigibilidade, marca.
//
// POR QUE ESTE ARQUIVO: passei 2026-07-15 DEDUZINDO do dado o que a lei diz em texto. Descobri por query, mal e
// em pedaços, que dispensa é sobre fracionamento e que na inexigibilidade a marca é a justificativa — capítulo um
// de qualquer manual. **Dado responde; ele não pergunta.** A pergunta vem da lei.
//
// Baixar antes (o WebFetch leva ECONNRESET do Planalto; curl com user-agent de navegador passa):
//   curl -sS -o "$SCRATCH/l14133.html" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
//     https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm
// node scripts/extrai_lei_14133.mjs <caminho-do-html>
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) { console.error("uso: node scripts/extrai_lei_14133.mjs <l14133.html>"); process.exit(1); }

const raw = fs.readFileSync(SRC);
let html = raw.toString("latin1");
if ((html.match(/Ã[£§©¡]/g) || []).length > 50) html = raw.toString("utf8");   // detecta a codificação pelo mojibake
const T = html
  .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&sect;/g, "§")
  .replace(/&ordm;|&deg;/g, "º").replace(/&amp;/g, "&").replace(/&[a-z]+;/gi, " ")
  // o Planalto encarta "(Vide Decreto nº X)" e "(Vigência)" no meio da frase — vira ruído no texto legal
  .replace(/\(\s*(Vide|Regulamento|Vigência|Produção de efeito)[^)]*\)/gi, " ")
  .replace(/\bVigência\b/g, " ")
  .replace(/\s+/g, " ").trim();

/** do "Art. N" até o próximo "Art. N+1" */
function artigo(n) {
  for (const prox of [n + 1, n + 2, n + 3]) {   // artigo revogado deixa buraco na numeração
    const m = new RegExp(`Art\\.\\s*${n}\\s*[ºo°]?[\\s\\S]{20,20000}?(?=Art\\.\\s*${prox}\\s*[ºo°]?[\\s.])`, "i").exec(T);
    if (m) return m[0].replace(/\s+/g, " ").trim();
  }
  return null;
}

// os artigos que governam CADA coisa que fazemos. A ordem é a do fluxo da compra.
const MAPA = [
  [6,  "DEFINIÇÕES — inclui bens/serviços COMUNS, TR, ETP, projeto básico/executivo, SRP, credenciamento, PCA"],
  [11, "OBJETIVOS do processo licitatório"],
  [18, "PLANEJAMENTO — ETP: o que o Estudo Técnico Preliminar tem que conter (§1º)"],
  [23, "🔑 VALOR ESTIMADO / PESQUISA DE PREÇOS — os parâmetros e a ORDEM de preferência (§1º)"],
  [25, "EDITAL — o que deve conter"],
  [28, "MODALIDADES de licitação"],
  [29, "PREGÃO e CONCORRÊNCIA — rito"],
  [31, "LEILÃO — é ALIENAÇÃO (o município VENDE; o sinal do preço é INVERTIDO)"],
  [33, "CRITÉRIOS DE JULGAMENTO — menor preço, maior desconto…"],
  [40, "COMPRAS — parcelamento, padronização"],
  [41, "🔑 DESCRIÇÃO DE MATERIAL / INDICAÇÃO DE MARCA — quando a marca PODE ser indicada"],
  [46, "REGIMES DE EXECUÇÃO — OBRA"],
  [74, "🔑 INEXIGIBILIDADE — competição inviável; fornecedor exclusivo (a marca É a justificativa)"],
  [75, "🔑 DISPENSA — limites de valor e o FRACIONAMENTO (o tema real da dispensa, não a disputa)"],
  [79, "CREDENCIAMENTO — contrata TODOS; o preço é FIXADO pela Administração (não há disputa por desenho)"],
  [82, "SISTEMA DE REGISTRO DE PREÇOS — o edital da ata"],
];

// ─── A LEI INTEIRA ────────────────────────────────────────────────────────────────────────────────────────────
// "De um jeito para ler tudo": o jeito NÃO é carregar 275 mil chars num contexto — é extrair a lei INTEIRA para o
// projeto, estruturada e greppável. Aí ela fica, e cada um lê o artigo que precisa, quando precisa.
// docs/lei-14133-integral.md = os 194 artigos. docs/lei-14133-compras.md = os 16 que governam o que fazemos.
{
  let all = `# Lei 14.133/2021 — íntegra\n\n**Texto oficial** (Planalto, extraído em 2026-07-15). Encartes `;
  all += `"(Vide Decreto…)"/"(Vigência)" removidos — são ruído do site, não texto legal.\n\n`;
  all += `Use \`grep\` para achar o artigo. O recorte do que governa as compras está em \`lei-14133-compras.md\`.\n\n---\n`;
  let n = 0;
  for (let i = 1; i <= 194; i++) {
    const a = artigo(i);
    if (!a) continue;
    n++;
    all += `\n## Art. ${i}\n\n> ` + a.slice(0, 12000).replace(/(§ \d+º|§ ú|[IVX]+ -|[a-z]\) )/g, "\n> $1") + "\n";
  }
  const fi = path.join(ROOT, "docs", "lei-14133-integral.md");
  fs.writeFileSync(fi, all);
  console.log(`✔ ${fi}\n  ${n} de 194 artigos · ${(all.length / 1024).toFixed(0)} KB`);
}

let md = `# Lei 14.133/2021 — os artigos que governam as compras\n\n`;
md += `**Texto oficial** (Planalto, extraído em 2026-07-15). Encartes "(Vide Decreto…)" e "(Vigência)" removidos — `;
md += `são ruído do site, não texto legal.\n\n`;
md += `> **Por que este documento existe:** em 15/07 eu passei um dia DEDUZINDO do dado o que está escrito aqui. `;
md += `Descobri por query, mal e em pedaços, que dispensa é sobre **fracionamento** e que na inexigibilidade a `;
md += `**marca é a justificativa** — capítulo um de qualquer manual. **Dado responde; ele não pergunta.** `;
md += `A pergunta vem da lei.\n\n---\n`;
let achou = 0;
for (const [n, tit] of MAPA) {
  const a = artigo(n);
  md += `\n## Art. ${n} — ${tit}\n\n`;
  if (a) { achou++; md += "> " + a.slice(0, 9000).replace(/(§ \d+º|[IVX]+ -|[a-z]\) )/g, "\n> $1") + "\n"; }
  else md += `**NÃO ENCONTRADO no texto baixado** — não inventar; conferir a fonte.\n`;
}
const out = path.join(ROOT, "docs", "lei-14133-compras.md");
fs.writeFileSync(out, md);
console.log(`✔ ${out}`);
console.log(`  ${achou} de ${MAPA.length} artigos extraídos · ${(md.length / 1024).toFixed(0)} KB`);
for (const [n] of MAPA) if (!artigo(n)) console.log(`  ⚠ Art. ${n} NÃO achado`);
