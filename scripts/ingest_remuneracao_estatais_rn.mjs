// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_rn.mjs — Rio Grande do Norte: lista de "Administração Indireta" do governo (rn.gov.br)
// mistura autarquias/fundações com as verdadeiras estatais — as sociedades de economia mista/empresas públicas
// identificadas nesta rodada: CAERN (água/esgoto), POTIGÁS (gás), CEHAB (habitação), DATANORTE (informática),
// AGN (agência de fomento). COSERN (energia) já é privada há décadas — corretamente fora do escopo.
//
// POTIGÁS: portal de transparência PRÓPRIO (potigas.com.br/pessoal/remuneracoes) publica CSV mensal
// individualizado de "Administradores" — Diretora Presidente MARINA MELO ALVES confirmada com valor exato
// (competência 06/2026, arquivo pot-202606-administradores.csv).
//
// CAERN: também tem portal de transparência próprio (transparencia.caern.com.br), mas é uma aplicação
// inteiramente client-side (Vue/Nuxt) — o HTML inicial não carrega nenhum dado, e a página de governança
// ("Diretoria, Conselho e Comitês") não pôde ser renderizada sem JS completo nesta rodada. Achei uma referência
// a "Remuneração da Administração" na estrutura da página, mas o ID de arquivo que testei (via API MZiQ) apontou
// para um documento errado (Política de Proteção de Dados) — não adivinhei o valor certo. Nome do dirigente
// atual e valor ficam pendentes.
//
// CEHAB, DATANORTE, AGN: não pesquisados a fundo nesta rodada — DATANORTE e CEHAB tiveram ECONNRESET nas
// tentativas de acesso; WebSearch já estava esgotado (limite de 200 buscas da sessão atingido durante MT).
//
// node scripts/ingest_remuneracao_estatais_rn.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

await q(`create table if not exists remuneracao_dirigentes_estatais_rn_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, remuneracao_bruta numeric, remuneracao_liquida numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

{
  const r = { sigla: "POTIGÁS", nome_empresa: "Companhia Potiguar de Gás", cargo: "Diretor Presidente",
    nome: "Marina Melo Alves", bruta: 22262.52, liquida: 16176.77, competencia: "2026-06",
    fonte: "potigas.com.br/storage/docs/remuneracao/adm/2026/pot-202606-administradores.csv",
    obs: "IR 4.852,80 (27,5%), INSS 932,31 — cargo iniciado em 2025 (matrícula 010425)" };
  const hash = crypto.createHash("sha256").update(`RN|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_rn_individual
    (empresa_sigla,empresa_nome,cargo,nome,remuneracao_bruta,remuneracao_liquida,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.bruta, r.liquida, r.competencia, r.fonte, r.obs, hash]);
}

const PENDENCIAS = [
  { sigla: "CAERN", nome_empresa: "Companhia de Águas e Esgotos do Rio Grande do Norte", motivo: "nome_e_valor_nao_confirmados",
    detalhe: "Portal de transparência próprio (transparencia.caern.com.br) é aplicação inteiramente client-side (Vue/Nuxt); página de governança e seção 'Remuneração da Administração' não renderizaram sem execução completa de JS nesta rodada — um ID de arquivo testado via API MZiQ apontou para documento errado (Política de Proteção de Dados)" },
  { sigla: "CEHAB", nome_empresa: "Companhia Estadual de Habitação (RN)", motivo: "nao_pesquisado",
    detalhe: "cehab.rn.gov.br apresentou ECONNRESET nas tentativas desta rodada" },
  { sigla: "DATANORTE", nome_empresa: "Companhia de Processamento de Dados do Rio Grande do Norte", motivo: "nao_pesquisado",
    detalhe: "datanorte.rn.gov.br apresentou ECONNRESET nas tentativas desta rodada" },
  { sigla: "AGN", nome_empresa: "Agência de Fomento do Rio Grande do Norte", motivo: "nao_pesquisado",
    detalhe: "Não pesquisado nesta rodada — WebSearch esgotado (limite de 200 buscas da sessão atingido durante o estado anterior)" },
];
for (const p of PENDENCIAS) {
  const hash = crypto.createHash("sha256").update(`RN|${p.sigla}|${p.motivo}`).digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('RN',$1,$2,$3,$4,$5,$6) on conflict (_hash) do nothing`,
    [p.sigla, p.nome_empresa, p.motivo, p.detalhe, "rn.gov.br (administração indireta)", hash]);
}

console.log("=== Rio Grande do Norte — confirmados ===");
console.table((await q(`select empresa_sigla, nome, remuneracao_bruta, remuneracao_liquida from remuneracao_dirigentes_estatais_rn_individual`)).rows);
console.log("=== Rio Grande do Norte — pendências ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='RN'`)).rows);
await db.end();
