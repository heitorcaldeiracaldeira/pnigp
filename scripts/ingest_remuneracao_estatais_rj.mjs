// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_rj.mjs — salário dos dirigentes das estatais do ESTADO DO RIO DE JANEIRO, por nome.
//
// FONTE: Consulta Remuneração do RJ (rj.gov.br/remuneracao, API própria em /remuneracao/api/rest/remuneracoes) —
// cobre TODO o funcionalismo estadual, direto e indireto. O endpoint /hades/empresas classifica cada órgão com um
// campo `tipo` — usei exatamente esse campo para separar as estatais de verdade ("SOCIEDADE DE ECONOMIA MISTA" e
// "EMPRESA PUBLICA") de autarquia/fundação/administração direta, sem depender de lista externa.
//
// POR QUÊ filtrar client-side por cargo: o endpoint /remuneracoes/cargos devolve o catálogo GLOBAL de cargos do
// estado inteiro (milhares, sem filtro por órgão que funcione) — não dá pra pedir só "Presidente" no servidor.
// Em vez disso, pagina-se cada estatal inteira (tamanho de página máximo aceito pela API: 50, confirmado por
// tentativa — 60+ devolve 400) e filtra-se localmente por funcaoCargo contendo presidente/diretor/conselheiro.
//
// mesRef: usei o mês mais recente com dado carregado (o mês corrente costuma vir vazio até a folha fechar —
// confirmado: ago/2026 e jul/2026 vazios para a CEDAE, mai/2026 tinha 3.058 registros).
//
// node scripts/ingest_remuneracao_estatais_rj.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const BASE = "https://www.rj.gov.br/remuneracao/api/rest";
const ANO = 2026, MES = "05";
const RE_GOVERNANCA = /presidente|diretor|conselh|liquidante/i;

async function pega(url) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { if (t === 3) throw e; await new Promise((s) => setTimeout(s, 2000 * (t + 1))); }
  }
}

const db = pool();
const q = withRetry(db);

await q(`create table if not exists remuneracao_dirigentes_estatais_rj (
  empresa_sigla text, empresa_nome text, cargo text, nome text, cpf_mascarado text,
  total_vantagens numeric, valor_liquido numeric, ano_ref int, mes_ref int, lotacao text, fonte text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);

const empresas = await pega(`${BASE}/hades/empresas`);
const estatais = empresas.filter((e) => e.tipo === "SOCIEDADE DE ECONOMIA MISTA" || e.tipo === "EMPRESA PUBLICA");
console.log(`estatais encontradas: ${estatais.length}`);

const todos = [];
for (const emp of estatais) {
  const empCodigo = emp.id.empCodigo, subempCodigo = emp.id.subempCodigo;
  let page = 0, totalPages = 1, achados = 0, totalRegistros = 0;
  while (page < totalPages) {
    const url = `${BASE}/remuneracoes?page=${page}&size=50&ano=${ANO}&mes=${MES}&empCodigo=${empCodigo}&subempCodigo=${subempCodigo}&situacao=ATIVO`;
    const resp = await pega(url);
    totalPages = resp.totalPages || 0;
    totalRegistros = resp.totalElements || 0;
    for (const r of resp.remuneracoes || []) {
      if (RE_GOVERNANCA.test(r.funcaoCargo || "")) {
        achados++;
        todos.push({
          empresa_sigla: emp.fantasia, empresa_nome: emp.nome, cargo: r.funcaoCargo, nome: r.nomeServidor,
          cpf_mascarado: r.cpf, total_vantagens: r.totalVantagens, valor_liquido: r.valorLiquido,
          ano_ref: r.anoRef, mes_ref: r.mesRef, lotacao: r.lotacao || null,
          fonte: "https://www.rj.gov.br/remuneracao/",
        });
      }
    }
    page++;
  }
  console.log(`${emp.fantasia}: ${achados} de governança em ${totalRegistros} registros (${totalPages} páginas)`);
}
console.log(`total de registros de governança: ${todos.length}`);

const CAMPOS = ["empresa_sigla","empresa_nome","cargo","nome","cpf_mascarado","total_vantagens","valor_liquido",
  "ano_ref","mes_ref","lotacao","fonte"];
const TIPOS = ["text","text","text","text","text","numeric","numeric","int","int","text","text"];
const regs = todos.map((r) => ({ ...r, _hash: crypto.createHash("sha256")
  .update(`${r.empresa_sigla}|${r.cargo}|${r.nome}|${r.ano_ref}-${r.mes_ref}`).digest("hex") }));

if (regs.length) {
  const c = (f) => regs.map((x) => x[f]);
  const placeholders = CAMPOS.map((_, j) => `$${j + 1}::${TIPOS[j]}[]`).join(",");
  await q(`insert into remuneracao_dirigentes_estatais_rj (${CAMPOS.join(",")}, _hash)
    select * from unnest(${placeholders}, $${CAMPOS.length + 1}::text[]) on conflict (_hash) do nothing`,
    [...CAMPOS.map((f) => c(f)), c("_hash")]);
}

const { rows } = await q(`select empresa_sigla, cargo, nome, valor_liquido from remuneracao_dirigentes_estatais_rj where ano_ref=$1 and mes_ref=$2 order by valor_liquido desc limit 15`, [ANO, Number(MES)]);
console.table(rows);
await db.end();
