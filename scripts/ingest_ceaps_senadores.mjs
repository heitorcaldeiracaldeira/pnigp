// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_ceaps_senadores.mjs — CEAPS: verba indenizatória (Cota para Exercício da Atividade Parlamentar) de cada
// Senador, ano corrente. Diferente do subsídio (folha_senado_federal, fixo e igual para os 81), a CEAPS é
// reembolso de despesa documentada (nota fiscal/recibo) e VARIA por senador e por mês — é isso que a Constituição
// chama de "verba indenizatória", não salário.
//
// FONTE: API oficial do Senado (adm.senado.gov.br/adm-dadosabertos, achada via swagger /v3/api-docs) —
// GET /api/v1/senadores/despesas_ceaps/{ano}. Devolve um registro POR DOCUMENTO FISCAL (não por senador/mês), com
// id próprio da fonte — usado como chave primária (a fonte já garante unicidade, sem precisar de _hash).
//
// codSenador == CodigoParlamentar da lista de parlamentares em exercício (conferido: 6335 = Damares Alves nas
// duas fontes) — é a chave que liga esta tabela a folha_senado_federal.
//
// node scripts/ingest_ceaps_senadores.mjs [ano]   (default: ano corrente)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const ANO = Number(process.argv[2] || process.env.ANO || new Date().getFullYear());
const URL_CEAPS = `https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${ANO}`;

const db = pool();
const q = withRetry(db);

async function pega(url) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { if (t === 3) throw e; await new Promise((s) => setTimeout(s, 3000 * (t + 1))); }
  }
}

await q(`create table if not exists ceaps_despesas_senadores (
  id bigint primary key, tipo_documento text, ano int, mes int, cod_senador text, nome_senador text,
  tipo_despesa text, cpf_cnpj text, fornecedor text, documento text, data date, detalhamento text,
  valor_reembolsado numeric, fonte text, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_ceaps_senador on ceaps_despesas_senadores (cod_senador, ano, mes)`);

console.log(`baixando CEAPS ${ANO}...`);
const despesas = await pega(URL_CEAPS);
console.log(`registros: ${despesas.length}`);

const regs = despesas.map((d) => ({
  id: d.id, tipo_documento: d.tipoDocumento, ano: d.ano, mes: d.mes, cod_senador: String(d.codSenador),
  nome_senador: d.nomeSenador, tipo_despesa: d.tipoDespesa, cpf_cnpj: d.cpfCnpj, fornecedor: d.fornecedor,
  documento: d.documento, data: d.data, detalhamento: d.detalhamento, valor_reembolsado: d.valorReembolsado,
  fonte: URL_CEAPS,
}));

const LOTE = 2000;
for (let i = 0; i < regs.length; i += LOTE) {
  const p = regs.slice(i, i + LOTE);
  const c = (f) => p.map((x) => x[f]);
  await q(`insert into ceaps_despesas_senadores
    (id,tipo_documento,ano,mes,cod_senador,nome_senador,tipo_despesa,cpf_cnpj,fornecedor,documento,data,
     detalhamento,valor_reembolsado,fonte)
    select * from unnest($1::bigint[],$2::text[],$3::int[],$4::int[],$5::text[],$6::text[],$7::text[],$8::text[],
      $9::text[],$10::text[],$11::date[],$12::text[],$13::numeric[],$14::text[])
    on conflict (id) do update set valor_reembolsado = excluded.valor_reembolsado, detalhamento = excluded.detalhamento`,
    [c("id"), c("tipo_documento"), c("ano"), c("mes"), c("cod_senador"), c("nome_senador"), c("tipo_despesa"),
     c("cpf_cnpj"), c("fornecedor"), c("documento"), c("data"), c("detalhamento"), c("valor_reembolsado"), c("fonte")]);
  console.log(`  ${Math.min(i + LOTE, regs.length)}/${regs.length}`);
}

// enriquece folha_senado_federal com o total de verba indenizatória do ano ao lado do subsídio
await q(`alter table folha_senado_federal add column if not exists verba_indenizatoria_ano int`);
await q(`alter table folha_senado_federal add column if not exists verba_indenizatoria_total numeric`);
await q(`alter table folha_senado_federal add column if not exists verba_indenizatoria_qtd_despesas int`);
await q(`alter table folha_senado_federal add column if not exists fonte_verba_indenizatoria text`);

const { rows: totais } = await q(`
  select cod_senador, sum(valor_reembolsado) total, count(*) qtd
  from ceaps_despesas_senadores where ano = $1 group by cod_senador`, [ANO]);
console.log(`senadores com despesa CEAPS em ${ANO}: ${totais.length}`);

for (const t of totais) {
  await q(`update folha_senado_federal set verba_indenizatoria_ano=$1, verba_indenizatoria_total=$2,
    verba_indenizatoria_qtd_despesas=$3, fonte_verba_indenizatoria=$4 where codigo_parlamentar=$5`,
    [ANO, t.total, t.qtd, URL_CEAPS, t.cod_senador]);
}

const { rows: resumo } = await q(`
  select nome_parlamentar, uf, subsidio_mensal, verba_indenizatoria_total, verba_indenizatoria_qtd_despesas
  from folha_senado_federal order by verba_indenizatoria_total desc nulls last limit 5`);
console.table(resumo);
await db.end();
