// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_am.mjs — Amazonas.
//
// AVISO IMPORTANTE DE MÉTODO: o orçamento de WebSearch da sessão esgotou (200/200) bem no início desta rodada.
// Um agente de pesquisa em segundo plano (lançado antes do esgotamento) ficou rodando sozinho por >35min e, ao
// perceber a falha do WebSearch, contornou por conta própria com WebFetch/CSV/PDF direto nas fontes primárias —
// e JÁ CRIOU e POPULOU a tabela remuneracao_dirigentes_estatais_am_individual com PRODAM, CIAMA e CIGÁS (schema
// com remuneracao_bruta/remuneracao_liquida, competência mensal e fonte primária por linha — qualidade boa,
// inclusive achou uma API/CSV melhor do que a interface que eu estava tentando raspar). CONFERI o conteúdo antes
// de mexer (lei do projeto: checar antes de lançar) — está consistente e bem documentado, inclusive já flagra
// CIGÁS como sociedade de economia mista ainda ativa (51%+17% do capital com o Estado) sem valor de dirigente
// publicado em nenhuma fonte oficial.
//
// ACHADO QUE CORRIGIU meu próprio levantamento: eu tinha achado "Lincoln Nunes da Silva" como Diretor-Presidente
// da PRODAM pela Carta Anual de Governança de 2024 (PDF) — o agente, consultando a API viva do portal
// (wp-json/transparencia/v1/remuneracoes), achou que o cargo já mudou de mãos: Renato Borges de Souza, admitido
// 07/05/2026. Prevaleceu o dado mais recente (lei: não usar dado antigo) — descartei meu achado de 2024.
//
// Este script SÓ complementa o que falta: COSAMA (achado por mim via página de governança própria da empresa,
// não coberto pelo agente) + pendências das estatais que ninguém pesquisou ainda nesta rodada.
//
// node scripts/ingest_remuneracao_estatais_am.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE_PORTAL = "transparencia.am.gov.br/pessoal (cadastro central — só cobre PRODAM e ADS entre as estatais)";

await q(`create table if not exists remuneracao_dirigentes_estatais_am_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, remuneracao_bruta numeric, remuneracao_liquida numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const INDIVIDUAL = [
  { sigla: "COSAMA", nome_empresa: "Companhia de Saneamento do Amazonas", cargo: "Diretora Presidente",
    nome: "Deisiane Erculano de Souza", bruto: null, liquido: null, competencia: null,
    fonte: "cosama.am.gov.br/institucional/gestao-e-governanca",
    obs: "primeira mulher no cargo, desde 06/2025; diretoria/conselho/fiscal inteiros confirmados na própria página de governança; empresa NÃO aparece no cadastro central de folha e não achei valor de remuneração publicado nesta rodada" },
];

for (const r of INDIVIDUAL) {
  const hash = crypto.createHash("sha256").update(`AM|${r.sigla}|${r.cargo}|${r.nome}|cosama-governanca`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_am_individual
    (empresa_sigla,empresa_nome,cargo,nome,remuneracao_bruta,remuneracao_liquida,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.bruto, r.liquido, r.competencia, r.fonte, r.obs, hash]);
}

const PENDENCIAS = [
  { sigla: "CADA", nome_empresa: "Companhia Amazonense de Desenvolvimento e Mobilização de Ativos", motivo: "nao_pesquisada",
    detalhe: "Não pesquisada nesta rodada por limite de tempo/orçamento de busca" },
  { sigla: "AFEAM", nome_empresa: "Agência de Fomento do Estado do Amazonas", motivo: "nao_pesquisada",
    detalhe: "Não pesquisada nesta rodada; empresa pública, não aparece no cadastro central de folha" },
  { sigla: "AMAZONASTUR", nome_empresa: "Empresa Estadual de Turismo do Amazonas", motivo: "nao_pesquisada",
    detalhe: "Não pesquisada nesta rodada; empresa pública, não aparece no cadastro central de folha" },
  { sigla: "ADS", nome_empresa: "Agência de Desenvolvimento Sustentável do Amazonas", motivo: "nao_pesquisada",
    detalhe: "Empresa pública que APARECE no cadastro central de folha (transparencia.am.gov.br/pessoal) — só não deu tempo de buscar o cargo de dirigente nesta rodada" },
];
for (const p of PENDENCIAS) {
  const hash = crypto.createHash("sha256").update(`AM|${p.sigla}|${p.motivo}`).digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('AM',$1,$2,$3,$4,$5,$6) on conflict (_hash) do nothing`,
    [p.sigla, p.nome_empresa, p.motivo, p.detalhe, FONTE_PORTAL, hash]);
}

console.log("=== Amazonas — individual ===");
console.table((await q(`select empresa_sigla, nome, remuneracao_bruta, remuneracao_liquida, observacao from remuneracao_dirigentes_estatais_am_individual order by empresa_sigla`)).rows);
console.log("=== Amazonas — pendências ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='AM'`)).rows);
await db.end();
