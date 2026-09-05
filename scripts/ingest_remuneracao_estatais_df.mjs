// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_df.mjs — Distrito Federal.
//
// DF tem 14 empresas estatais (Casa Civil): 6 independentes (Terracap, BRB, CEB, Caesb, Ceasa-DF, DF Gestão de
// Ativos) + 6 dependentes (Metrô/DF, Codhab, TCB, Emater, Codeplan, Novacap) + 2 em liquidação (SAB, Proflora —
// excluídas). CEB é um GRUPO com 5 subsidiárias no cadastro (CEB Participações, CEB Geração, CEB Iluminação,
// CEB Lajeado, CEBGÁS) — nenhuma delas tem "Diretor Presidente"/"Presidente" formalmente na Diretoria; a mais
// próxima é o "Diretor Geral" da CEB Geração.
//
// MÉTODO: o portal central (transparencia.df.gov.br → app "Remuneração dos Servidores") é ÚNICO E EXCELENTE —
// a própria página declara as fontes agregadas: "SIGRH (SEEC) / SIAPE / FUNDO PGDF / CEB / CAESB / TERRACAP /
// BIOTIC / ETR / CEASA / BRB" — ou seja, TODAS as estatais publicam a folha no MESMO cadastro central, sem
// precisar de portal próprio por empresa (raro entre os estados já cobertos). O campo "Função" tem grafias
// inconsistentes para o mesmo cargo em empresas diferentes: "DIRETOR PRESIDENTE" (Jardim Botânico, TCB, FAP,
// SLU, IPEDF, ADASA), "DIRETOR-PRESIDENTE" (Novacap, Inas, Zoológico), "DIRETOR   PRESIDENTE" com espaço triplo
// (Codhab), "PRESIDENTE" solto (Emater, BSB Ambiental, DER, JUCIS) e "PRESIDENTE BRB" como CARGO (não função) só
// pro BRB. Cada grafia teve que ser testada separadamente.
//
// CONFIRMADOS: TCB, Novacap, Emater-DF, Codhab, BRB, CEB Geração (só "Diretor Geral", não achei "presidente"
// formal no grupo CEB).
//
// PENDENTES (não achei a grafia certa da função/cargo nesta rodada — CAESB e TERRACAP têm milhares de
// funcionários e a ordenação por coluna "Bruto" da tabela não respondeu a clique nesta sessão; precisaria paginar
// exaustivamente ou achar a grafia exata da função de presidência): CAESB, TERRACAP, CEASA-DF, Codeplan, BIOTIC,
// CEB Participações (grupo/holding), Metrô-DF, DF Gestão de Ativos.
//
// node scripts/ingest_remuneracao_estatais_df.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE = "transparencia.df.gov.br/#/servidores/remuneracao (competência 07/2026)";

await q(`create table if not exists remuneracao_dirigentes_estatais_df_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, salario_bruto numeric, salario_liquido numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const CONFIRMADOS = [
  { sigla: "TCB", nome_empresa: "Sociedade de Transportes Coletivos de Brasília Ltda.", cargo: "Diretor Presidente",
    nome: "José Ricardo Grossi de Souza", bruto: 22550.00, liquido: 16581.56, obs: null },
  { sigla: "NOVACAP", nome_empresa: "Companhia Urbanizadora da Nova Capital do Brasil", cargo: "Diretor-Presidente",
    nome: "Fernando Rodrigues Ferreira Leite", bruto: 28129.50, liquido: 21176.70, obs: null },
  { sigla: "EMATER-DF", nome_empresa: "Empresa de Assistência Técnica e Extensão Rural do Distrito Federal", cargo: "Presidente",
    nome: "Cleison Medas Duval", bruto: 60215.14, liquido: 44473.26,
    obs: "bruto inclui cargo efetivo de Extensionista Rural-NS + função de Presidente" },
  { sigla: "CODHAB", nome_empresa: "Companhia de Desenvolvimento Habitacional do Distrito Federal", cargo: "Diretor Presidente",
    nome: "Marcelo Fagundes Gomide", bruto: 24300.00, liquido: 18345.31, obs: null },
  { sigla: "BRB", nome_empresa: "BRB - Banco de Brasília S.A.", cargo: "Presidente BRB",
    nome: "Nelson Antonio de Souza", bruto: 64384.99, liquido: 46911.92, obs: null },
  { sigla: "CEB GERAÇÃO", nome_empresa: "CEB Geração S.A.", cargo: "Diretor Geral",
    nome: "Pedro Cardoso de Santana Filho", bruto: 44802.51, liquido: 34193.11,
    obs: "grupo CEB (5 subsidiárias no cadastro: Participações/Geração/Iluminação/Lajeado/CEBGÁS) não tem cargo formal de Diretor Presidente/Presidente na diretoria — Diretor Geral da Geração é o mais próximo encontrado" },
].map((r) => ({ ...r, competencia: "2026-07", fonte: FONTE }));

for (const r of CONFIRMADOS) {
  const hash = crypto.createHash("sha256").update(`DF|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_df_individual
    (empresa_sigla,empresa_nome,cargo,nome,salario_bruto,salario_liquido,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.bruto, r.liquido, r.competencia, r.fonte, r.obs, hash]);
}

const PENDENCIAS = [
  { sigla: "CAESB", nome_empresa: "Companhia de Saneamento Ambiental do Distrito Federal", motivo: "grafia_da_funcao_nao_encontrada",
    detalhe: "Milhares de funcionários no cadastro; nenhuma das grafias testadas de função (DIRETOR PRESIDENTE / DIRETOR-PRESIDENTE / DIRETOR   PRESIDENTE / PRESIDENTE) retornou resultado para este órgão, e a ordenação por coluna Bruto não respondeu ao clique nesta sessão" },
  { sigla: "TERRACAP", nome_empresa: "Companhia Imobiliária de Brasília", motivo: "nao_pesquisada",
    detalhe: "Não pesquisada nesta rodada por limite de tempo" },
  { sigla: "CEASA-DF", nome_empresa: "Centrais de Abastecimento do Distrito Federal", motivo: "grafia_da_funcao_nao_encontrada",
    detalhe: "Nenhuma das grafias de função testadas retornou resultado para este órgão" },
  { sigla: "CODEPLAN", nome_empresa: "Companhia de Planejamento do Distrito Federal", motivo: "grafia_da_funcao_nao_encontrada",
    detalhe: "Nenhuma das grafias de função testadas retornou resultado para este órgão" },
  { sigla: "BIOTIC", nome_empresa: "BIOTIC - Parque Tecnológico de Brasília", motivo: "nao_pesquisada",
    detalhe: "Empresa pública citada como fonte do cadastro central, mas não pesquisada nesta rodada" },
  { sigla: "METRÔ-DF", nome_empresa: "Companhia do Metropolitano do Distrito Federal", motivo: "nao_pesquisada",
    detalhe: "Não pesquisada nesta rodada por limite de tempo" },
  { sigla: "DF GESTÃO DE ATIVOS", nome_empresa: "DF Gestão de Ativos S/A", motivo: "nao_pesquisada",
    detalhe: "Não pesquisada nesta rodada por limite de tempo" },
  { sigla: "CEB PARTICIPAÇÕES", nome_empresa: "CEB Participações S.A. (holding do grupo)", motivo: "sem_cargo_de_presidente",
    detalhe: "Roster completo consultado (14 pessoas) — maiores cargos são Diretor Administrativo e Financeiro e Diretor Técnico, sem Diretor Presidente/Presidente do grupo" },
];
for (const p of PENDENCIAS) {
  const hash = crypto.createHash("sha256").update(`DF|${p.sigla}|${p.motivo}`).digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('DF',$1,$2,$3,$4,$5,$6) on conflict (_hash) do nothing`,
    [p.sigla, p.nome_empresa, p.motivo, p.detalhe, FONTE, hash]);
}

{
  const hash = crypto.createHash("sha256").update("DF|SAB|Proflora|em_liquidacao").digest("hex");
  await q(`insert into estatais_extintas (uf,sigla,nome,ano_extincao,destino,fonte,_hash) values
    ('DF','SAB / Proflora','Sociedade de Abastecimento de Brasília / Florestamento e Reflorestamento',null,
     'em processo de liquidação (classificação oficial da Casa Civil-DF, não extintas ainda formalmente)',$1,$2)
     on conflict (_hash) do nothing`, [FONTE, hash]);
}

console.log("=== Distrito Federal — confirmados ===");
console.table((await q(`select empresa_sigla, nome, salario_bruto, salario_liquido from remuneracao_dirigentes_estatais_df_individual order by salario_bruto desc`)).rows);
console.log("=== Distrito Federal — pendências ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='DF'`)).rows);
await db.end();
