// SINAPI (Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil) — referência federal de
// preço para OBRAS E SERVIÇOS DE ENGENHARIA (Caixa Econômica Federal + IBGE). É a mesma função que
// [[pnigp-precos-servico-e-referencia-sus]] cumpre com o SIGTAP para saúde: uma referência externa, própria,
// que o Banco de Preços consulta — NÃO um arquivo gerado pela coleta do PNCP. Por isso tabela, schema de
// consulta e rota de API são todos SEPARADOS dos scripts `ingest_contratacoes_sc.mjs`/`ingest_itens_sc.mjs`.
//   node scripts/ingest_sinapi_sc.mjs
//
// ═══ A FONTE, E A RESSALVA HONESTA (03/set/2026) ═══
// A Caixa publica, por UF, todo mês, um ZIP com Insumos e Composições (preço mediano, variante Desonerado/
// Não Desonerado da folha). O site inteiro fica atrás de um WAF (Azion) que devolve 302 em looping para
// qualquer cliente sem JS — mas basta o cookie `security=true` (confirmado com um browser real via
// Playwright) para qualquer `fetch` simples passar; não precisa de browser automatizado.
//
// 🚨 O canal público está PARADO EM DEZEMBRO/2024 — medido, não suposto: testei SC e SP, as duas travam no
// mesmo mês (HEAD em 2025/01 em diante = 404; a página é renderizada inteira no servidor, sem paginação
// AJAX escondida, então não é "faltou clicar em carregar mais"). Ao mesmo tempo o IBGE cita resultado de
// jul/2026 e um site terceiro mostra série até lá — a Caixa decerto reorganizou a distribuição em algum
// momento de 2025, mas eu não achei o endereço novo (SIPCI, o sistema antigo de consulta, está com erro de
// SSL). Decisão do Heitor (03/set): ingerir dez/2024 mesmo assim, com o aviso de defasagem exposto na tela
// — trocar quando acharmos a fonte corrente.
//
// ═══ O QUE VEM NO ZIP, E O QUE ESTE SCRIPT LÊ ═══
// 8 arquivos (PDF + XLSX de cada). Lemos só os dois XLSX que dão preço por código, direto — igual ao SIGTAP,
// que também usa o layout publicado em vez de posição fixa:
//   SINAPI_Preco_Ref_Insumos_SC_<AAAAMM>_<variante>.xlsx              → 1 linha por insumo
//   SINAPI_Custo_Ref_Composicoes_Sintetico_SC_<AAAAMM>_<variante>.xlsx → 1 linha por composição (serviço)
// Fica de fora o Analítico (a memória de cálculo — cada composição aberta nos insumos que a formam): é MUITO
// mais pesado (6,9 MB × 2 variantes só p/ SC) e não muda o preço final, só a auditoria dele. Se algum dia
// isso virar necessário (mostrar "de que a composição é feita"), entra depois — ver [[pnigp-reconstruir-
// campo-so-depois-de-provar]], não adianta ingerir e não ter consumidor.
//
// Cada variante (NaoDesonerado/Desonerado) é um arquivo à parte com as MESMAS linhas na MESMA ordem — só o
// preço muda. Em vez de duplicar descrição/classificação em duas linhas, casamos pelo código e gravamos as
// duas colunas de preço juntas: quem lê escolhe qual variante se aplica ao regime do contratante, a mesma
// lógica de "dar os três métodos e deixar a escolha com o responsável" do documento de preço PNCP.
import fs from "fs"; import path from "path"; import pg from "pg"; import XLSX from "xlsx";
import { execFileSync } from "child_process";

const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 600000 });
db.on("error", () => {});

const UF = "SC";
const COMPETENCIA = "202412";
const DIR = "C:/Users/PC/pnigp/scripts/_sinapi_raw";
const H = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Cookie": "security=true" };
fs.mkdirSync(DIR, { recursive: true });

async function baixaEExtrai(variante) {
  const nomeZip = `SINAPI_ref_Insumos_Composicoes_${UF}_${COMPETENCIA}_${variante}.zip`;
  const zipPath = path.join(DIR, `${UF}_${COMPETENCIA}_${variante}.zip`);
  const marcador = path.join(DIR, `SINAPI_Preco_Ref_Insumos_${UF}_${COMPETENCIA}_${variante}.xlsx`);
  if (!fs.existsSync(marcador)) {
    if (!fs.existsSync(zipPath)) {
      const url = `https://www.caixa.gov.br/Downloads/sinapi-a-partir-jul-2009-${UF.toLowerCase()}/${nomeZip}`;
      const r = await fetch(url, { headers: H });
      if (r.status !== 200) throw new Error(`${url} → HTTP ${r.status} (o WAF pode ter mudado o cookie exigido)`);
      fs.writeFileSync(zipPath, Buffer.from(await r.arrayBuffer()));
    }
    execFileSync("powershell.exe", ["-NoProfile", "-Command",
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${DIR}' -Force`], { stdio: "ignore" });
  }
}
await baixaEExtrai("NaoDesonerado");
await baixaEExtrai("Desonerado");

// Preço brasileiro "1.234,56" → número. "-" ou vazio → null (composição sem preço apurado naquele mês).
const num = (v) => {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function leInsumos(variante) {
  const wb = XLSX.readFile(path.join(DIR, `SINAPI_Preco_Ref_Insumos_${UF}_${COMPETENCIA}_${variante}.xlsx`));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  // linha 6 (índice) é o cabeçalho: CODIGO | DESCRICAO DO INSUMO | UNIDADE DE MEDIDA | ORIGEM DO PRECO | PRECO MEDIANO R$
  const out = new Map();
  for (const r of rows) {
    const codigo = r[0];
    if (typeof codigo !== "number") continue; // pula cabeçalho, linhas em branco e "TOTAL DE INSUMOS : N"
    out.set(codigo, {
      codigo, descricao: String(r[1] || "").trim(), unidade: String(r[2] || "").trim(),
      origemPreco: String(r[3] || "").trim(), preco: num(r[4]),
    });
  }
  return out;
}

function leComposicoes(variante) {
  const wb = XLSX.readFile(path.join(DIR, `SINAPI_Custo_Ref_Composicoes_Sintetico_${UF}_${COMPETENCIA}_${variante}.xlsx`));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  // cabeçalho: DESCRICAO DA CLASSE | SIGLA DA CLASSE | DESCRICAO DO TIPO 1 | SIGLA DO TIPO 1 |
  //            CODIGO DO AGRUPADOR | DESCRICAO DO AGRUPADOR | CODIGO DA COMPOSICAO | DESCRICAO DA COMPOSICAO |
  //            UNIDADE | ORIGEM DE PREÇO | CUSTO TOTAL | VINCULO
  const out = new Map();
  for (const r of rows) {
    const codigo = r[6];
    if (codigo == null || codigo === "" || !/^\d+$/.test(String(codigo))) continue;
    out.set(Number(codigo), {
      codigo: Number(codigo), classe: String(r[0] || "").trim(), siglaClasse: String(r[1] || "").trim(),
      tipo1: String(r[2] || "").trim(), siglaTipo1: String(r[3] || "").trim(),
      codAgrupador: r[4] ? String(r[4]).trim() : null, descAgrupador: r[5] ? String(r[5]).trim() : null,
      descricao: String(r[7] || "").trim(), unidade: String(r[8] || "").trim(),
      origemPreco: String(r[9] || "").trim(), custo: num(r[10]), vinculo: String(r[11] || "").trim(),
    });
  }
  return out;
}

// ── Insumos ──────────────────────────────────────────────────────────────────────────────
const insND = leInsumos("NaoDesonerado"), insD = leInsumos("Desonerado");
await db.query(`DROP TABLE IF EXISTS sinapi_insumos_sc`);
await db.query(`CREATE TABLE sinapi_insumos_sc (
  codigo INT PRIMARY KEY, descricao TEXT, unidade TEXT, origem_preco TEXT,
  preco_nao_desonerado NUMERIC, preco_desonerado NUMERIC, competencia TEXT, localidade TEXT)`);
{
  const linhas = [...insND.values()];
  const CH = 500;
  for (let s = 0; s < linhas.length; s += CH) {
    const chunk = linhas.slice(s, s + CH), vals = [];
    const ph = chunk.map((r, ri) => {
      const b = ri * 8;
      const d = insD.get(r.codigo);
      vals.push(r.codigo, r.descricao, r.unidade, r.origemPreco, r.preco, d ? d.preco : null, COMPETENCIA, "Florianópolis");
      return `(${Array.from({ length: 8 }, (_, i) => `$${b + i + 1}`).join(",")})`;
    }).join(",");
    await db.query(`INSERT INTO sinapi_insumos_sc
      (codigo, descricao, unidade, origem_preco, preco_nao_desonerado, preco_desonerado, competencia, localidade)
      VALUES ${ph} ON CONFLICT (codigo) DO NOTHING`, vals);
  }
  console.log(`✔ sinapi_insumos_sc: ${linhas.length.toLocaleString()} insumos · competência ${COMPETENCIA}`);
}

// ── Composições ──────────────────────────────────────────────────────────────────────────
const cpND = leComposicoes("NaoDesonerado"), cpD = leComposicoes("Desonerado");
await db.query(`DROP TABLE IF EXISTS sinapi_composicoes_sc`);
await db.query(`CREATE TABLE sinapi_composicoes_sc (
  codigo INT PRIMARY KEY, descricao TEXT, unidade TEXT, classe TEXT, sigla_classe TEXT,
  tipo1 TEXT, sigla_tipo1 TEXT, cod_agrupador TEXT, desc_agrupador TEXT, origem_preco TEXT,
  vinculo TEXT, custo_nao_desonerado NUMERIC, custo_desonerado NUMERIC, competencia TEXT, localidade TEXT)`);
await db.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`).catch(() => {});
await db.query(`CREATE INDEX sinapi_composicoes_sc_desc_trgm ON sinapi_composicoes_sc USING gin (descricao gin_trgm_ops)`);
{
  const linhas = [...cpND.values()];
  const CH = 500;
  for (let s = 0; s < linhas.length; s += CH) {
    const chunk = linhas.slice(s, s + CH), vals = [];
    const ph = chunk.map((r, ri) => {
      const b = ri * 15;
      const d = cpD.get(r.codigo);
      vals.push(r.codigo, r.descricao, r.unidade, r.classe, r.siglaClasse, r.tipo1, r.siglaTipo1,
        r.codAgrupador, r.descAgrupador, r.origemPreco, r.vinculo, r.custo, d ? d.custo : null,
        COMPETENCIA, "Florianópolis");
      return `(${Array.from({ length: 15 }, (_, i) => `$${b + i + 1}`).join(",")})`;
    }).join(",");
    await db.query(`INSERT INTO sinapi_composicoes_sc
      (codigo, descricao, unidade, classe, sigla_classe, tipo1, sigla_tipo1, cod_agrupador, desc_agrupador,
       origem_preco, vinculo, custo_nao_desonerado, custo_desonerado, competencia, localidade)
      VALUES ${ph} ON CONFLICT (codigo) DO NOTHING`, vals);
  }
  console.log(`✔ sinapi_composicoes_sc: ${linhas.length.toLocaleString()} composições · competência ${COMPETENCIA}`);
}

await db.end();
