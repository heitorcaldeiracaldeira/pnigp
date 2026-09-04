// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_ceap_deputados.mjs — CEAP (Cota para o Exercício da Atividade Parlamentar) de cada Deputado Federal,
// ano corrente. Espelho de ingest_ceaps_senadores.mjs: reembolso de despesa documentada, varia por deputado e
// por mês — não é salário (isso é o subsídio, em folha_camara_federal).
//
// FONTE: bulk CSV oficial (zip), um arquivo por ano — https://www.camara.leg.br/cotas/Ano-{ano}.csv.zip.
// Não achei API JSON equivalente à do Senado (a API v2 da Câmara só dá despesa por deputado, um por um: 513
// chamadas); o bulk é a mesma fonte, mais barato.
//
// JOIN COM folha_camara_federal: a coluna `ideCadastro` do CSV é o MESMO `id` da lista de deputados (conferido:
// Danilo Forte = ideCadastro 62881 = id 62881 na API v2) — NÃO é `nuDeputadoId`, que é um id legado diferente.
//
// node scripts/ingest_ceap_deputados.mjs [ano]   (default: ano corrente)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { execFileSync } from "child_process";
import { pool, withRetry } from "./_cadprev.mjs";

const ANO = Number(process.argv[2] || process.env.ANO || new Date().getFullYear());
const URL_ZIP = `https://www.camara.leg.br/cotas/Ano-${ANO}.csv.zip`;
const TMP = process.env.TEMP || process.env.TMP || ".";
const ZIP_PATH = `${TMP}\\camara_ceap_${ANO}.zip`;
const CSV_NAME = `Ano-${ANO}.csv`;

const db = pool();
const q = withRetry(db);

console.log(`baixando ${URL_ZIP} ...`);
const r = await fetch(URL_ZIP, { signal: AbortSignal.timeout(180000) });
if (!r.ok) throw new Error("HTTP " + r.status);
const buf = Buffer.from(await r.arrayBuffer());
const fs = await import("fs");
fs.writeFileSync(ZIP_PATH, buf);
console.log(`baixado: ${(buf.length / 1e6).toFixed(1)} MB`);

// extrai com unzip (git-bash) para /tmp e lê o CSV — mais simples que reimplementar zip em node
const extractDir = process.env.TEMP ? `${process.env.TEMP}\\ceap_extract_${ANO}` : `.\\ceap_extract_${ANO}`;
fs.mkdirSync(extractDir, { recursive: true });
execFileSync("C:\\Program Files\\Git\\usr\\bin\\unzip.exe", ["-o", ZIP_PATH, "-d", extractDir]);
const csvPath = `${extractDir}\\${CSV_NAME}`;
const txt = new TextDecoder("iso-8859-1").decode(fs.readFileSync(csvPath));

const linhas = txt.split(/\r?\n/).filter(Boolean);
const header = linhas[0].split(";").map((h) => h.replace(/^"|"$/g, ""));
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
console.log(`linhas: ${linhas.length - 1}`);

// parser que respeita aspas — alguns campos (ex.: txtPassageiro com múltiplos nomes) têm ";" DENTRO das aspas
// (linha 333 do arquivo 2026: "RENATO SIMÕES;"), o que quebra um split(";") ingênuo (32 campos viram 33+).
function parseLinha(line) {
  const out = [];
  let cur = "", dentroAspas = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { dentroAspas = !dentroAspas; continue; }
    if (ch === ";" && !dentroAspas) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

await q(`create table if not exists ceap_despesas_deputados (
  id_deputado text, nome_parlamentar text, cpf text, uf text, partido text, num_sub_cota text,
  descricao_despesa text, especificacao_sub_cota text, fornecedor text, cnpj_cpf_fornecedor text,
  num_documento text, tipo_documento text, data_emissao date, valor_documento numeric, valor_glosa numeric,
  valor_liquido numeric, mes int, ano int, num_parcela text, passageiro text, trecho text, num_lote text,
  num_ressarcimento text, data_pagamento_restituicao date, valor_restituicao numeric, url_documento text,
  fonte text, _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_ceap_deputado on ceap_despesas_deputados (id_deputado, ano, mes)`);

const toNum = (s) => { const n = Number(String(s || "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const toDate = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

const regs = [];
for (let i = 1; i < linhas.length; i++) {
  const c = parseLinha(linhas[i]);
  if (c.length < header.length) continue;
  const g = (nome) => c[idx[nome]];
  const reg = {
    id_deputado: g("ideCadastro") || null,
    nome_parlamentar: g("txNomeParlamentar") || null,
    cpf: g("cpf") || null,
    uf: g("sgUF") || null,
    partido: g("sgPartido") || null,
    num_sub_cota: g("numSubCota") || null,
    descricao_despesa: g("txtDescricao") || null,
    especificacao_sub_cota: g("txtDescricaoEspecificacao") || null,
    fornecedor: g("txtFornecedor") || null,
    cnpj_cpf_fornecedor: g("txtCNPJCPF") || null,
    num_documento: g("txtNumero") || null,
    tipo_documento: g("indTipoDocumento") || null,
    data_emissao: toDate(g("datEmissao")),
    valor_documento: toNum(g("vlrDocumento")),
    valor_glosa: toNum(g("vlrGlosa")),
    valor_liquido: toNum(g("vlrLiquido")),
    mes: Number(g("numMes")) || null,
    ano: Number(g("numAno")) || null,
    num_parcela: g("numParcela") || null,
    passageiro: g("txtPassageiro") || null,
    trecho: g("txtTrecho") || null,
    num_lote: g("numLote") || null,
    num_ressarcimento: g("numRessarcimento") || null,
    data_pagamento_restituicao: toDate(g("datPagamentoRestituicao")),
    valor_restituicao: toNum(g("vlrRestituicao")),
    url_documento: g("urlDocumento") || null,
    fonte: URL_ZIP,
  };
  reg._hash = crypto.createHash("sha256").update(linhas[i]).digest("hex");
  regs.push(reg);
}
console.log(`registros parseados: ${regs.length}`);

const CAMPOS = ["id_deputado","nome_parlamentar","cpf","uf","partido","num_sub_cota","descricao_despesa",
  "especificacao_sub_cota","fornecedor","cnpj_cpf_fornecedor","num_documento","tipo_documento","data_emissao",
  "valor_documento","valor_glosa","valor_liquido","mes","ano","num_parcela","passageiro","trecho","num_lote",
  "num_ressarcimento","data_pagamento_restituicao","valor_restituicao","url_documento","fonte","_hash"];
const TIPOS = ["text","text","text","text","text","text","text","text","text","text","text","text","date",
  "numeric","numeric","numeric","int","int","text","text","text","text","text","date","numeric","text","text","text"];

const LOTE = 3000;
for (let i = 0; i < regs.length; i += LOTE) {
  const p = regs.slice(i, i + LOTE);
  const c = (f) => p.map((x) => x[f]);
  const placeholders = CAMPOS.map((_, j) => `$${j + 1}::${TIPOS[j]}[]`).join(",");
  await q(`insert into ceap_despesas_deputados (${CAMPOS.join(",")})
    select * from unnest(${placeholders})
    on conflict (_hash) do nothing`, CAMPOS.map((f) => c(f)));
  console.log(`  ${Math.min(i + LOTE, regs.length)}/${regs.length}`);
}

// enriquece folha_camara_federal com o total de verba indenizatória do ano ao lado do subsídio — por parlamentar
await q(`alter table folha_camara_federal add column if not exists verba_indenizatoria_ano int`);
await q(`alter table folha_camara_federal add column if not exists verba_indenizatoria_total numeric`);
await q(`alter table folha_camara_federal add column if not exists verba_indenizatoria_qtd_despesas int`);
await q(`alter table folha_camara_federal add column if not exists fonte_verba_indenizatoria text`);

const { rows: totais } = await q(`
  select id_deputado, sum(valor_liquido) total, count(*) qtd
  from ceap_despesas_deputados where ano = $1 and id_deputado is not null group by id_deputado`, [ANO]);
console.log(`deputados com despesa CEAP em ${ANO}: ${totais.length}`);

for (const t of totais) {
  await q(`update folha_camara_federal set verba_indenizatoria_ano=$1, verba_indenizatoria_total=$2,
    verba_indenizatoria_qtd_despesas=$3, fonte_verba_indenizatoria=$4 where id_deputado=$5`,
    [ANO, t.total, t.qtd, URL_ZIP, t.id_deputado]);
}

const { rows: resumo } = await q(`
  select nome, uf, partido, subsidio_mensal, verba_indenizatoria_total, verba_indenizatoria_qtd_despesas
  from folha_camara_federal order by verba_indenizatoria_total desc nulls last limit 5`);
console.table(resumo);
await db.end();
