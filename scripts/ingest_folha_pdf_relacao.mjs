// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_pdf_relacao.mjs — folha nominal publicada como PDF de RELATÓRIO ("Relação de Cargos e Salários"),
// não como portal de consulta.
//
// ⭐ Achado em 17/ago/2026 em Santa Margarida do Sul/RS: o município não tem portal de folha nenhum — publica um
// PDF por competência numa CATEGORIA DE DOWNLOAD do site em WordPress (`/download-category/servidores-municipais/`).
// Nenhuma varredura de host acha isso, porque não há host de fornecedor: o arquivo mora no próprio site.
//
// O relatório é o `FPRE560.COL` — um formulário de ERP com cabeçalho e rodapé fixos. O rodapé traz
// `Total Geral 00278 875.365,34`, que é a DECLARAÇÃO do próprio município: dá para provar `coletado == declarado`
// no nome e no dinheiro ([[pnigp-sonda-folha-prova-e-a-coleta]]).
//
// 🚨 O valor é SALÁRIO DO CARGO, não remuneração bruta paga: não tem hora extra, adicional nem desconto. Gravo em
// `salario_base` e deixo `bruto` NULO — carimbar isso como bruto inflaria o município no comparativo e mentiria
// sobre o que a fonte diz ([[pnigp-folha-municipal-cinco-campos]]).
//
// Uso: node scripts/ingest_folha_pdf_relacao.mjs            (todos os alvos)
//      SO=4316972 node scripts/ingest_folha_pdf_relacao.mjs (um município)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36";

// Alvos: municípios cuja folha só existe como PDF de relatório numa página de downloads.
const ALVOS = [
  { cod_ibge: "4316972", municipio: "Santa Margarida do Sul", uf: "RS",
    url: "https://www.santamargaridadosul.rs.gov.br/index.php/download-category/servidores-municipais/" },
];

await q(`create table if not exists folha_servidores_pdfrelacao (
  cod_ibge text, municipio text, uf text, competencia text,
  matricula text, nome text, cargo text, classe text, admissao text, demissao text,
  salario_base numeric, bruto numeric,
  fonte_arquivo text, _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_pdfrel_mun on folha_servidores_pdfrelacao (cod_ibge, competencia)`);
await q(`create table if not exists folha_pdfrelacao_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text,
  linhas int, declarado int, soma numeric, soma_declarada numeric,
  situacao text, detalhe text, em timestamptz default now()
)`);

const num = (s) => { if (s == null) return null; const n = +String(s).replace(/\./g, "").replace(",", "."); return Number.isFinite(n) ? n : null; };
// `571 Mariângela … 02/05/2012 [demissão] 7.738,03Advogado P12 / C`
// o extrator de PDF cola o salário no cargo (colunas vizinhas sem espaço) — a vírgula decimal é a fronteira
const RE_LINHA = /^(\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s*(\d{2}\/\d{2}\/\d{4})?\s*([\d.]*\d,\d{2})(.*)$/;
const RE_TOTAL = /Total\s+Geral\s+(\d+)\s+([\d.]*\d,\d{2})/i;
const RE_REF = /Data\s+Refer[êe]ncia:\s*(\d{2})\/(\d{2})\/(\d{4})/i;

// 🚨 o cargo e a classe vêm grudados no fim da linha ("Advogado P12 / C"): a classe é o padrão salarial no
// rabo — letra/número com barra. Sem separar, o cargo vira chave suja e o mesmo cargo aparece como N cargos.
function partirCargo(resto) {
  const t = String(resto).trim();
  const m = t.match(/^(.*?)\s+([A-Z]?\d{0,3}[A-Za-z]?\s*\/\s*[A-Za-z0-9]+)$/);
  return m ? { cargo: m[1].trim(), classe: m[2].replace(/\s+/g, " ").trim() } : { cargo: t, classe: null };
}

async function textoDoPdf(caminho) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(fs.readFileSync(caminho)));
  const { text } = await extractText(doc, { mergePages: true });
  return text;
}

function parse(texto) {
  const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const ref = texto.match(RE_REF);
  // 🚨 AAAAMM, o padrão das demais tabelas de folha. Eu mesmo escrevi "AAAA-MM" aqui hoje e o
  // `verifica_competencia_folha.mjs` pegou — é exatamente o tipo de divergência que faz o mesmo mês virar duas
  // competências distintas numa agregação ([[pnigp-filtro-que-nao-aplica-confira-pelo-dado]]).
  const competencia = ref ? `${ref[3]}${ref[2]}` : null;
  const tot = texto.match(RE_TOTAL);
  const pessoas = [];
  for (const l of linhas) {
    const m = l.match(RE_LINHA);
    if (!m) continue;
    const { cargo, classe } = partirCargo(m[6]);
    pessoas.push({ matricula: m[1], nome: m[2].trim(), admissao: m[3], demissao: m[4] || null,
      salario_base: num(m[5]), cargo, classe });
  }
  return { competencia, pessoas,
    declarado: tot ? Number(tot[1]) : null, soma_declarada: tot ? num(tot[2]) : null };
}

// baixa TODOS os arquivos da categoria: a competência mais RECENTE não é necessariamente a mais CHEIA
// ([[pnigp-competencia-mais-cheia-nao-a-recente]]) — só dá para escolher depois de ler todas.
async function baixaTudo(alvo, tmp) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true, userAgent: UA });
  const page = await ctx.newPage();
  await page.goto(alvo.url, { waitUntil: "networkidle", timeout: 90000 });
  const n = await page.evaluate(() =>
    [...document.querySelectorAll("a,button")].filter((e) => /^download$/i.test((e.innerText || "").trim())).length);
  console.log(`   ${n} arquivos na categoria`);
  const arquivos = [];
  for (let i = 0; i < n; i++) {
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 90000 }).catch(() => null),
      page.evaluate((k) => {
        const bs = [...document.querySelectorAll("a,button")].filter((e) => /^download$/i.test((e.innerText || "").trim()));
        bs[k]?.click();
      }, i),
    ]);
    if (!dl) continue;
    const p = path.join(tmp, `${i}_${dl.suggestedFilename()}`);
    try { await dl.saveAs(p); arquivos.push(p); } catch { /* arquivo indisponível */ }
  }
  await browser.close();
  return arquivos;
}

for (const alvo of ALVOS) {
  if (SO && alvo.cod_ibge !== SO) continue;
  console.log(`\n[pdf-relacao] ${alvo.municipio}/${alvo.uf}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pdfrel-"));
  let arquivos = [];
  try { arquivos = await baixaTudo(alvo, tmp); } catch (e) {
    console.log(`   ✖ falha ao abrir a categoria: ${e.message}`);
    await q(`insert into folha_pdfrelacao_coleta (cod_ibge, municipio, uf, situacao, detalhe, em)
      values ($1,$2,$3,'erro',$4,now()) on conflict (cod_ibge) do update set situacao='erro', detalhe=excluded.detalhe, em=now()`,
      [alvo.cod_ibge, alvo.municipio, alvo.uf, e.message.slice(0, 300)]);
    continue;
  }

  const versoes = [];
  for (const f of arquivos) {
    if (!/\.pdf$/i.test(f)) continue;
    try {
      const r = parse(await textoDoPdf(f));
      if (r.pessoas.length) versoes.push({ ...r, arquivo: path.basename(f) });
    } catch { /* PDF ilegível */ }
  }
  if (!versoes.length) {
    console.log("   ✖ nenhum PDF legível com linhas de servidor");
    await q(`insert into folha_pdfrelacao_coleta (cod_ibge, municipio, uf, linhas, situacao, detalhe, em)
      values ($1,$2,$3,0,'vazio','baixou os arquivos mas nenhum tinha linha de servidor reconhecível',now())
      on conflict (cod_ibge) do update set situacao='vazio', detalhe=excluded.detalhe, em=now()`,
      [alvo.cod_ibge, alvo.municipio, alvo.uf]);
    continue;
  }
  versoes.sort((a, b) => b.pessoas.length - a.pessoas.length || String(b.competencia).localeCompare(String(a.competencia)));
  const v = versoes[0];
  console.log(`   ${versoes.length} competências lidas; a mais cheia é ${v.competencia} com ${v.pessoas.length}`
    + ` (${versoes.slice(0, 5).map((x) => `${x.competencia}:${x.pessoas.length}`).join(" ")})`);

  let gravadas = 0, soma = 0;
  for (const p of v.pessoas) {
    const _hash = crypto.createHash("sha1")
      .update([alvo.cod_ibge, v.competencia, p.matricula, p.nome, p.cargo, p.salario_base].join("|")).digest("hex");
    await q(`insert into folha_servidores_pdfrelacao
      (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, classe, admissao, demissao,
       salario_base, bruto, fonte_arquivo, _hash)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null,$12,$13) on conflict (_hash) do nothing`,
      [alvo.cod_ibge, alvo.municipio, alvo.uf, v.competencia, p.matricula, p.nome, p.cargo, p.classe,
       p.admissao, p.demissao, p.salario_base, v.arquivo, _hash]);
    gravadas++; soma += p.salario_base || 0;
  }
  const bateN = v.declarado != null && v.declarado === v.pessoas.length;
  const bateR = v.soma_declarada != null && Math.abs(soma - v.soma_declarada) < 1;
  const detalhe = `PDF ${v.arquivo}: ${gravadas} servidores, soma ${soma.toFixed(2)}`
    + (v.declarado != null ? ` · declarado ${v.declarado} / ${v.soma_declarada?.toFixed(2)}` : " · sem total declarado");
  console.log(`   ${bateN && bateR ? "✔" : "⚠"} ${detalhe}`);
  await q(`insert into folha_pdfrelacao_coleta
    (cod_ibge, municipio, uf, competencia, linhas, declarado, soma, soma_declarada, situacao, detalhe, em)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
    on conflict (cod_ibge) do update set competencia=excluded.competencia, linhas=excluded.linhas,
      declarado=excluded.declarado, soma=excluded.soma, soma_declarada=excluded.soma_declarada,
      situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [alvo.cod_ibge, alvo.municipio, alvo.uf, v.competencia, gravadas, v.declarado, soma, v.soma_declarada,
     bateN && bateR ? "ok" : "ok_sem_conferencia", detalhe.slice(0, 400)]);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp já sumiu */ }
}
await db.end();
