// SICRO (Sistema de Custos Referenciais de Obras) — a referência do DNIT para OBRAS E SERVIÇOS DE
// INFRAESTRUTURA DE TRANSPORTES (Lei 14.133, art. 23 §2º), irmã do SINAPI: SINAPI cobre "as demais obras",
// SICRO cobre estrada, ferrovia, porto, aeroporto. Mesma função de referência externa que
// [[pnigp-precos-servico-e-referencia-sus]] cumpre com o SIGTAP — tabela, rota e componente PRÓPRIOS,
// separados do que a coleta do PNCP gera. Ver scripts/ingest_sinapi_sc.mjs para o par direto.
//   node scripts/ingest_sicro_sc.mjs
//
// ═══ A FONTE — E POR QUE ESTA É MELHOR QUE A DO SINAPI (03/set/2026) ═══
// O portal é gov.br/dnit (Plone comum, SEM WAF — `curl` liso funciona, ao contrário da Caixa). E ao
// contrário do SINAPI (parado em dez/2024 no canal público), o SICRO de Santa Catarina está em
// **abril/2026** — mês mais recente publicado (gerado 28/jun/2026). Ainda assim não é o mês corrente:
// mantenha o aviso de defasagem na tela e atualize `COMPETENCIA`/a URL do 7z quando publicar mês novo.
// A página de cada mês (`.../relatorios-sicro/sul/santa-catarina/<ano>/<mes>/<mes>-<ano>`) tem o link do
// arquivo só depois de aceitar o banner de cookies (client-side) — por isso o link do .7z foi obtido com
// um browser real e está fixado abaixo; não há padrão de URL previsível (o nome do arquivo não é
// `sc-MM-AAAA.7z` garantido — CONFERIR na página ao trocar de mês).
//
// ═══ O QUE VEM NO .7z, E O QUE ESTE SCRIPT LÊ ═══
// 24 arquivos (PDF+XLSX × 12 relatórios). Não é ZIP, é **7-Zip** — lido com o binário que já está em
// node_modules/7zip-bin (dependência transitiva; nenhuma dependência nova). Ficam de fora os Analíticos
// (memória de cálculo, muito mais pesados) e os Relatórios de Encargos Sociais/Origem de Preços — mesma
// lógica do SINAPI: entra o que tem consumidor na tela, o resto espera um pedido.
//   Relatório Sintético de Composições de Custos.xlsx        → 1 linha por composição (o preço final)
//   Relatório Sintético de Materiais.xlsx                    → 1 linha por insumo material
//   Relatório Sintético de Mão de Obra[.xlsx / - com desoneração.xlsx] → 1 linha por categoria de mão de obra, 2 variantes
//   Relatório Sintético de Equipamentos.xlsx                 → 1 linha por equipamento, com a composição do custo/hora
//     (SEM variante de desoneração — só mão de obra tem folha a desonerar)
import fs from "fs"; import path from "path"; import pg from "pg"; import XLSX from "xlsx";
import { execFileSync } from "child_process";

const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 600000 });
db.on("error", () => {});

const COMPETENCIA = "202604"; // abril/2026 — o mais recente publicado para SC (03/set/2026)
const URL_7Z = "https://www.gov.br/dnit/pt-br/assuntos/planejamento-e-pesquisa/custos-referenciais/sistemas-de-custos/sicro/relatorios/relatorios-sicro/sul/santa-catarina/2026/abril/sc-04-2026.7z";
const DIR = "C:/Users/PC/pnigp/scripts/_sicro_raw";
const X = path.join(DIR, "x");
const SETE_ZIP = "C:/Users/PC/pnigp/node_modules/7zip-bin/win/x64/7za.exe";

fs.mkdirSync(DIR, { recursive: true });
const zipPath = path.join(DIR, "sc.7z");
if (!fs.existsSync(path.join(X, "SC 04-2026 Relatório Sintético de Composições de Custos.xlsx"))) {
  if (!fs.existsSync(zipPath)) {
    const r = await fetch(URL_7Z, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (r.status !== 200) throw new Error(`${URL_7Z} → HTTP ${r.status}`);
    fs.writeFileSync(zipPath, Buffer.from(await r.arrayBuffer()));
  }
  execFileSync(SETE_ZIP, ["x", "-y", `-o${X}`, zipPath], { stdio: "ignore" });
}

const arq = (nome) => path.join(X, `SC 04-2026 ${nome}.xlsx`);
function leXlsx(nome) {
  const wb = XLSX.readFile(arq(nome));
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
}
const num = (v) => (v == null || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

// ── Composições ──────────────────────────────────────────────────────────────────────────
{
  const rows = leXlsx("Relatório Sintético de Composições de Custos").slice(1).filter((r) => r[0]);
  await db.query(`DROP TABLE IF EXISTS sicro_composicoes_sc`);
  await db.query(`CREATE TABLE sicro_composicoes_sc (
    codigo TEXT PRIMARY KEY, descricao TEXT, unidade TEXT, custo NUMERIC, competencia TEXT)`);
  await db.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`).catch(() => {});
  await db.query(`CREATE INDEX sicro_composicoes_sc_desc_trgm ON sicro_composicoes_sc USING gin (descricao gin_trgm_ops)`);
  const CH = 500;
  for (let s = 0; s < rows.length; s += CH) {
    const chunk = rows.slice(s, s + CH), vals = [];
    const ph = chunk.map((r, ri) => {
      const b = ri * 5;
      vals.push(String(r[0]).trim(), String(r[1] || "").trim(), String(r[2] || "").trim(), num(r[3]), COMPETENCIA);
      return `(${Array.from({ length: 5 }, (_, i) => `$${b + i + 1}`).join(",")})`;
    }).join(",");
    await db.query(`INSERT INTO sicro_composicoes_sc (codigo, descricao, unidade, custo, competencia)
      VALUES ${ph} ON CONFLICT (codigo) DO NOTHING`, vals);
  }
  console.log(`✔ sicro_composicoes_sc: ${rows.length.toLocaleString()} composições · competência ${COMPETENCIA}`);
}

// ── Insumos: materiais + mão de obra (2 variantes), unificados por tipo ────────────────────
{
  const materiais = leXlsx("Relatório Sintético de Materiais").slice(1).filter((r) => r[0])
    .map((r) => ({ codigo: String(r[0]).trim(), descricao: String(r[1] || "").trim(), tipo: "material",
      unidade: String(r[2] || "").trim(), precoND: num(r[3]), precoD: null }));
  const maoND = leXlsx("Relatório Sintético de Mão de Obra").slice(1).filter((r) => r[0]);
  const maoDMap = new Map(leXlsx("Relatório Sintético de Mão de Obra - com desoneração").slice(1)
    .filter((r) => r[0]).map((r) => [String(r[0]).trim(), num(r[3])]));
  const maoDeObra = maoND.map((r) => {
    const codigo = String(r[0]).trim();
    return { codigo, descricao: String(r[1] || "").trim(), tipo: "mao_de_obra",
      unidade: String(r[2] || "").trim(), precoND: num(r[3]), precoD: maoDMap.get(codigo) ?? null };
  });
  const todos = [...materiais, ...maoDeObra];
  await db.query(`DROP TABLE IF EXISTS sicro_insumos_sc`);
  await db.query(`CREATE TABLE sicro_insumos_sc (
    codigo TEXT PRIMARY KEY, descricao TEXT, tipo TEXT, unidade TEXT,
    preco_nao_desonerado NUMERIC, preco_desonerado NUMERIC, competencia TEXT)`);
  const CH = 500;
  for (let s = 0; s < todos.length; s += CH) {
    const chunk = todos.slice(s, s + CH), vals = [];
    const ph = chunk.map((r, ri) => {
      const b = ri * 7;
      vals.push(r.codigo, r.descricao, r.tipo, r.unidade, r.precoND, r.precoD, COMPETENCIA);
      return `(${Array.from({ length: 7 }, (_, i) => `$${b + i + 1}`).join(",")})`;
    }).join(",");
    await db.query(`INSERT INTO sicro_insumos_sc
      (codigo, descricao, tipo, unidade, preco_nao_desonerado, preco_desonerado, competencia)
      VALUES ${ph} ON CONFLICT (codigo) DO NOTHING`, vals);
  }
  console.log(`✔ sicro_insumos_sc: ${materiais.length.toLocaleString()} materiais + ${maoDeObra.length.toLocaleString()} mão de obra · competência ${COMPETENCIA}`);
}

// ── Equipamentos: estrutura própria (custo/hora aberto em 8 componentes) ───────────────────
{
  const rows = leXlsx("Relatório Sintético de Equipamentos").slice(1).filter((r) => r[0]);
  await db.query(`DROP TABLE IF EXISTS sicro_equipamentos_sc`);
  await db.query(`CREATE TABLE sicro_equipamentos_sc (
    codigo TEXT PRIMARY KEY, descricao TEXT, valor_aquisicao NUMERIC, depreciacao_hora NUMERIC,
    oportunidade_capital_hora NUMERIC, seguros_impostos_hora NUMERIC, manutencao_hora NUMERIC,
    operacao_hora NUMERIC, mao_obra_operacao_hora NUMERIC, custo_produtivo_hora NUMERIC,
    custo_improdutivo_hora NUMERIC, competencia TEXT)`);
  const CH = 500;
  for (let s = 0; s < rows.length; s += CH) {
    const chunk = rows.slice(s, s + CH), vals = [];
    const ph = chunk.map((r, ri) => {
      const b = ri * 12;
      vals.push(String(r[0]).trim(), String(r[1] || "").trim(), num(r[2]), num(r[3]), num(r[4]), num(r[5]),
        num(r[6]), num(r[7]), num(r[8]), num(r[9]), num(r[10]), COMPETENCIA);
      return `(${Array.from({ length: 12 }, (_, i) => `$${b + i + 1}`).join(",")})`;
    }).join(",");
    await db.query(`INSERT INTO sicro_equipamentos_sc
      (codigo, descricao, valor_aquisicao, depreciacao_hora, oportunidade_capital_hora, seguros_impostos_hora,
       manutencao_hora, operacao_hora, mao_obra_operacao_hora, custo_produtivo_hora, custo_improdutivo_hora, competencia)
      VALUES ${ph} ON CONFLICT (codigo) DO NOTHING`, vals);
  }
  console.log(`✔ sicro_equipamentos_sc: ${rows.length.toLocaleString()} equipamentos · competência ${COMPETENCIA}`);
}

await db.end();
