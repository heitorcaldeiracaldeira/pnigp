// SIE-SC — Referencial de Preços de Obras de Edificações, da Secretaria de Infraestrutura e Mobilidade de
// Santa Catarina. Terceira régua de obra do Banco de Preços, ao lado de SINAPI (federal, "demais obras") e
// SICRO (DNIT, infraestrutura de transportes): esta é a ÚNICA das três com preço calibrado para EDIFICAÇÃO
// especificamente pelo próprio estado. Tabela e rota próprias — nada disto toca o que a coleta do PNCP gera.
//   node scripts/ingest_siesc_edificacoes_sc.mjs
//
// ═══ A FONTE, E A RESSALVA HONESTA (03/set/2026) ═══
// sie.sc.gov.br/referencial-de-precos só publica em **PDF** (sem planilha) e a versão mais nova de
// Edificações é **janeiro/2021** — 5 anos e meio defasada. Por decisão do Heitor, ficou de fora o irmão
// "Obras Rodoviárias" daquela mesma página: a própria página diz "Fonte: DNIT" e a versão lá (ago/2023) é
// mais VELHA que o SICRO que já trazemos direto do DNIT (abr/2026) — ingerir seria adicionar uma cópia pior
// do que já se tem, não uma referência nova.
//
// ═══ PDF COM TEXTO REAL, NÃO ESCANEADO — MAS SEM TABELA ESTRUTURADA ═══
// 51 páginas, lidas com `unpdf` (já é dependência do projeto). Cada linha de serviço tem código, descrição,
// unidade e 3 componentes de custo (execução/material/sub-serviço-transporte) — mas o PDF não preserva
// COLUNAS: a extração devolve texto corrido, e uma descrição comprida QUEBRA em 2+ linhas antes dos números
// aparecerem (uma curta fica tudo numa linha só). Por isso o parser não separa por posição, separa por
// FORMATO: acumula texto até bater uma sequência "<unidade> <nº>,<nº> <nº>,<nº> <nº>,<nº> <nº>,<nº>" no fim
// da linha — os 4 números SEMPRE fecham a linha da descrição, curta ou longa. Validado nas 1.584 linhas:
// 0 código duplicado, 0 sobra no buffer ao fim da página 51, e a conta bate — preço unitário é sempre
// (execução+material+sub-serviço) × 1,25, a bonificação de 25% que o cabeçalho do PDF declara.
import fs from "fs"; import pg from "pg";
import { extractText, getDocumentProxy } from "unpdf";

const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 600000 });
db.on("error", () => {});

const COMPETENCIA = "202101"; // janeiro/2021 — a versão mais recente publicada (03/set/2026)
const URL_PDF = "https://www.sie.sc.gov.br/site-deinfra/download/1510/2/6";
const DIR = "C:/Users/PC/pnigp/scripts/_siesc_raw";
fs.mkdirSync(DIR, { recursive: true });
const pdfPath = `${DIR}/edificacoes_${COMPETENCIA}.pdf`;
if (!fs.existsSync(pdfPath)) {
  const r = await fetch(URL_PDF, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (r.status !== 200) throw new Error(`${URL_PDF} → HTTP ${r.status}`);
  fs.writeFileSync(pdfPath, Buffer.from(await r.arrayBuffer()));
}

const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(pdfPath)));
const { text: pages } = await extractText(pdf, { mergePages: false });

const reNum = "[\\d.]+,\\d{2}";
// Não-guloso no início para casar tanto "UNIDADE nº nº nº nº" sozinha (continuação de descrição que já
// quebrou linha) quanto "CÓDIGO DESCRIÇÃO UNIDADE nº nº nº nº" inteira numa linha só (descrição curta).
const reLinhaFinal = new RegExp(`^(.*?)\\s*(\\S+)\\s+(${reNum})\\s+(${reNum})\\s+(${reNum})\\s+(${reNum})\\s*$`);
const reGrupo = /^\d{2} - .+/;
const num = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));

const linhas = [];
let grupo = "";
let buffer = [];
for (const pageText of pages) {
  for (const raw of pageText.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    if (/^ESTADO DE SANTA CATARINA/.test(l) || /^Preço Referencial/.test(l) || /^Tabela:/.test(l)
      || /^Cód\. Auxiliar/.test(l) || l === ")" || l === "Transporte"
      || /^Sistema Integrado/.test(l) || /^Emitido em:/.test(l)) continue;
    if (reGrupo.test(l)) { grupo = l; buffer = []; continue; } // troca de seção não deixa lixo entre páginas
    const m = l.match(reLinhaFinal);
    if (m) {
      if (m[1]) buffer.push(m[1]);
      const texto = buffer.join(" ").trim();
      const cm = texto.match(/^(\S+)\s+(.*)$/s);
      linhas.push({
        grupo, codigo: cm ? cm[1] : texto, descricao: cm ? cm[2] : "",
        unidade: m[2], custoExecucao: num(m[3]), custoMaterial: num(m[4]), custoSubservico: num(m[5]), precoUnitario: num(m[6]),
      });
      buffer = [];
    } else buffer.push(l);
  }
}
if (buffer.length) throw new Error(`sobrou texto não fechado no fim do PDF (layout mudou?): ${JSON.stringify(buffer)}`);
if (new Set(linhas.map((l) => l.codigo)).size !== linhas.length) throw new Error("código duplicado — o parser confundiu duas linhas");

// 🚨 O pooler do Neon (pgBouncer) às vezes entrega uma conexão com `search_path` vazado de outra sessão
// (visto na prática: veio como `pg_catalog`, e CREATE TABLE sem esquema tentava criar EM pg_catalog e
// levava "permission denied"). Fixar aqui não é estilo, é a diferença entre rodar e falhar.
await db.query(`SET search_path TO public`);
await db.query(`DROP TABLE IF EXISTS siesc_edificacoes_sc`);
await db.query(`CREATE TABLE siesc_edificacoes_sc (
  codigo TEXT PRIMARY KEY, grupo TEXT, descricao TEXT, unidade TEXT,
  custo_execucao NUMERIC, custo_material NUMERIC, custo_subservico NUMERIC, preco_unitario NUMERIC, competencia TEXT)`);
await db.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`).catch(() => {});
await db.query(`CREATE INDEX siesc_edificacoes_sc_desc_trgm ON siesc_edificacoes_sc USING gin (descricao gin_trgm_ops)`);
const CH = 500;
for (let s = 0; s < linhas.length; s += CH) {
  const chunk = linhas.slice(s, s + CH), vals = [];
  const ph = chunk.map((r, ri) => {
    const b = ri * 9;
    vals.push(r.codigo, r.grupo, r.descricao, r.unidade, r.custoExecucao, r.custoMaterial, r.custoSubservico, r.precoUnitario, COMPETENCIA);
    return `(${Array.from({ length: 9 }, (_, i) => `$${b + i + 1}`).join(",")})`;
  }).join(",");
  await db.query(`INSERT INTO siesc_edificacoes_sc
    (codigo, grupo, descricao, unidade, custo_execucao, custo_material, custo_subservico, preco_unitario, competencia)
    VALUES ${ph} ON CONFLICT (codigo) DO NOTHING`, vals);
}
console.log(`✔ siesc_edificacoes_sc: ${linhas.length.toLocaleString()} serviços · competência ${COMPETENCIA}`);
await db.end();
