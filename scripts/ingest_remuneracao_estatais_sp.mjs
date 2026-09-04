// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_sp.mjs — salário (remuneração) dos dirigentes das estatais do ESTADO DE SÃO PAULO,
// POR NOME (não por cargo agregado como no federal) — a fonte aqui permite isso direto.
//
// FONTE: Portal da Transparência de SP (transparencia.sp.gov.br/Remuneracaomensal) — API própria
// (POST /Remuneracao/Buscar), a MESMA ferramenta usada para todo o funcionalismo estadual (direto e indireto),
// filtrada pelos órgãos que são efetivamente estatais (sociedade de economia mista/empresa pública), não
// autarquia nem fundação. Achado navegando o site de verdade (Playwright) — não é endpoint documentado, achado
// pela rede do browser.
//
// POR QUÊ é melhor que o federal: aqui o dado é por PESSOA (nome + CPF mascarado + cargo + remuneração bruta e
// líquida), mês a mês, e É CORRENTE (mesAno mais recente disponível) — não uma foto de 2022/2023.
//
// COBERTURA: só as estatais de fato (Sabesp e CESP já foram privatizadas, por isso NÃO estão na lista abaixo,
// nem aparecem no dropdown de órgãos do próprio portal). EMTU está em LIQUIDAÇÃO — por isso o cargo de topo lá
// é "Liquidante", não "Diretor Presidente".
//
// node scripts/ingest_remuneracao_estatais_sp.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const BASE = "https://www.transparencia.sp.gov.br/Remuneracao";
const MES_ANO = 202607; // mais recente disponível no portal (jul/2026)

const ORGAOS = [
  { id: 17, sigla: "METRO", nome: "Companhia do Metropolitano de São Paulo" },
  { id: 24, sigla: "CPTM", nome: "Companhia Paulista de Trens Metropolitanos" },
  { id: 14, sigla: "CDHU", nome: "Companhia de Desenvolvimento Habitacional e Urbano do Estado de SP" },
  { id: 67, sigla: "Desenvolve SP", nome: "Desenvolve SP - Agência de Fomento do Estado de São Paulo" },
  { id: 27, sigla: "EMTU-SP", nome: "Empresa Metropolitana de Transportes Urbanos de SP (em liquidação)" },
  { id: 25, sigla: "Prodesp", nome: "Companhia de Processamento de Dados do Estado de São Paulo" },
  { id: 34, sigla: "Docas SS", nome: "Companhia Docas de São Sebastião" },
  { id: 26, sigla: "CETESB", nome: "Companhia Ambiental do Estado de São Paulo" },
  { id: 60, sigla: "CPP", nome: "Companhia Paulista de Parcerias" },
  { id: 59, sigla: "CPSEC", nome: "Companhia Paulista de Securitização" },
];

const RE_GOVERNANCA = /diretor|presidente|conselh|liquidante|superintendente/i;

async function pega(url, opts) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000), ...opts });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { if (t === 3) throw e; await new Promise((s) => setTimeout(s, 2000 * (t + 1))); }
  }
}

const db = pool();
const q = withRetry(db);

await q(`create table if not exists remuneracao_dirigentes_estatais_sp (
  empresa_sigla text, empresa_nome text, cargo text, nome text, cpf_mascarado text,
  remuneracao_bruta numeric, remuneracao_liquida numeric, mes_ano int, fonte text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);

const todos = [];
for (const org of ORGAOS) {
  const cargos = await pega(`${BASE}/CargosPorOrgao?orgaoId=${org.id}`);
  const cargosGovernanca = cargos.filter((c) => RE_GOVERNANCA.test(c.nome));
  console.log(`${org.sigla}: ${cargosGovernanca.length} cargos de governança de ${cargos.length} totais`);
  for (const cargo of cargosGovernanca) {
    const resp = await pega(`${BASE}/Buscar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ nome: "", orgaoId: String(org.id), cargoId: cargo.id, situacao: null, mesAno: MES_ANO, page: 1, pageSize: 100 }),
    });
    for (const it of resp.items || []) {
      todos.push({
        empresa_sigla: org.sigla, empresa_nome: org.nome, cargo: it.cargo?.trim(), nome: it.nome?.trim(),
        cpf_mascarado: it.cpfMascarado, remuneracao_bruta: it.remuneracaoMes, remuneracao_liquida: it.totalLiquido,
        mes_ano: MES_ANO, fonte: "https://www.transparencia.sp.gov.br/Remuneracaomensal/Index",
      });
    }
  }
}
console.log(`total de registros de governança: ${todos.length}`);

const CAMPOS = ["empresa_sigla","empresa_nome","cargo","nome","cpf_mascarado","remuneracao_bruta",
  "remuneracao_liquida","mes_ano","fonte"];
const TIPOS = ["text","text","text","text","text","numeric","numeric","int","text"];
const regs = todos.map((r) => ({ ...r, _hash: crypto.createHash("sha256")
  .update(`${r.empresa_sigla}|${r.cargo}|${r.nome}|${r.mes_ano}`).digest("hex") }));

const c = (f) => regs.map((x) => x[f]);
const placeholders = CAMPOS.map((_, j) => `$${j + 1}::${TIPOS[j]}[]`).join(",");
await q(`insert into remuneracao_dirigentes_estatais_sp (${CAMPOS.join(",")}, _hash)
  select * from unnest(${placeholders}, $${CAMPOS.length + 1}::text[]) on conflict (_hash) do nothing`,
  [...CAMPOS.map((f) => c(f)), c("_hash")]);

const { rows } = await q(`select empresa_sigla, cargo, nome, remuneracao_bruta from remuneracao_dirigentes_estatais_sp where mes_ano=$1 order by remuneracao_bruta desc limit 12`, [MES_ANO]);
console.table(rows);
await db.end();
