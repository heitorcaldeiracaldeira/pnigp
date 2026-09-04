// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_ba.mjs — Bahia: 4ª maior fonte estadual sondada nesta frente, e a mais trabalhosa —
// usa um painel Power BI incorporado (não um formulário simples como SP/RJ/MG/PR), exigindo engenharia reversa
// da consulta DAX (achado o campo certo: Remuneracao.nom_orgao_empresa_exercicio).
//
// MÉTODO: 1) baixei o dataset aberto "dados-de-servidores" (dados.ba.gov.br, CSV de 330 mil linhas, ANO 2026) pra
// achar QUEM ocupa "Diretor Presidente" em cada estatal (o campo certo é "Função", não "Cargo" — achado por
// tentativa). 2) usei a matrícula de cada um pra consultar o VALOR direto na tabela Remuneracao do Power BI via
// requisição HTTP replicando o token de sessão capturado do próprio browser (MWCToken, curto prazo de validade —
// não reutilizável depois, script documenta o método, não um cron reprodutível).
//
// Estatais achadas no dataset de servidores: CBPM, CTB, CONDER, PRODEB, CAR, EGBA, Bahiapesca, CERB — DESENBAHIA e
// EMBASA (as duas maiores) NÃO aparecem — indício de que são regidas por CLT fora deste cadastro de "servidor
// público" (mesmo padrão de lacuna já visto em EPAGRI/CEASA-PR: diretoria de estatal pode não estar no cadastro
// de servidor efetivo/comissionado quando a empresa opera em regime totalmente privado de pessoal).
//
// CAR e EGBA: nenhum cargo de Diretor/Presidente apareceu na Função de ninguém — o topo real é "Gerente"/"Chefe
// de Setor". Não é lacuna de busca, é o que a fonte tem.
// Bahiapesca e CERB: nome do Diretor Presidente confirmado, mas o valor mais recente veio num formato comprimido
// (DSR do Power BI, codificação por delta/bitmask) que não consegui decodificar com segurança suficiente pra
// gravar sem risco de errar o número — registrado como pendência de valor, não inventado.
//
// node scripts/ingest_remuneracao_estatais_ba.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE = "dados.ba.gov.br/dataset/dados-de-servidores (nome/cargo) + transparencia.ba.gov.br Power BI (valor, mês atual = ago/2026)";

const CONFIRMADOS = [
  { sigla: "CBPM", nome_empresa: "Companhia Baiana de Pesquisa Mineral", nome: "Henrique Santana Carballal", valor: 47658.18 },
  { sigla: "CTB", nome_empresa: "Companhia de Transportes da Bahia", nome: "Eracy Lafuente Pereira Maciel", valor: 35788.32 },
  { sigla: "CONDER", nome_empresa: "Companhia de Desenvolvimento Urbano do Estado da Bahia", nome: "Jose Goncalves Trindade", valor: 48651.54 },
  { sigla: "PRODEB", nome_empresa: "Companhia de Processamento de Dados do Estado da Bahia", nome: "Jose Muniz Reboucas", valor: 61364.86 },
].map((r) => ({ ...r, cargo: "Diretor Presidente", competencia: "2026 (mês atual do painel)", fonte: FONTE }));

await q(`create table if not exists remuneracao_dirigentes_estatais_ba_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, proventos numeric, descontos numeric,
  liquido numeric, competencia text, fonte text, observacao text, _hash text primary key,
  _coletado_em timestamptz default now()
)`);

for (const r of CONFIRMADOS) {
  const hash = crypto.createHash("sha256").update(`BA|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_ba_individual
    (empresa_sigla,empresa_nome,cargo,nome,proventos,descontos,liquido,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,null,null,$6,$7,null,$8) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, hash]);
}

// pendências (nome sem valor confiável, e órgãos sem diretor na folha)
const PENDENCIAS = [
  { sigla: "Bahiapesca", nome_empresa: "Bahiapesca S.A.", motivo: "valor_nao_decodificado",
    detalhe: "Diretor Presidente: Daniel Benicio dos Santos Meirelles Victoria (nome confirmado, matrícula 92088667) — valor mais recente veio em formato comprimido do Power BI (DSR) que não decodifiquei com segurança suficiente para gravar" },
  { sigla: "CERB", nome_empresa: "Companhia de Engenharia Ambiental e Recursos Hídricos da Bahia", motivo: "valor_nao_decodificado",
    detalhe: "Diretor Presidente: Jayme de Souza Vieira Lima Filho (nome confirmado, matrícula 92125796) — mesmo problema de decodificação do Bahiapesca" },
  { sigla: "CAR", nome_empresa: "Companhia de Desenvolvimento e Ação Regional", motivo: "sem_dirigente_na_folha",
    detalhe: "Nenhuma Função de Diretor/Presidente encontrada nos 251 registros da empresa no cadastro de servidores — o cargo de topo ali é Gerente Administrativo Financeiro" },
  { sigla: "EGBA", nome_empresa: "Empresa Gráfica da Bahia", motivo: "sem_dirigente_na_folha",
    detalhe: "Nenhuma Função de Diretor/Presidente encontrada no cadastro de servidores — o cargo de topo ali é Gerente/Chefe de Setor" },
  { sigla: "DESENBAHIA/EMBASA", nome_empresa: "Agência de Fomento do Estado da Bahia / Empresa Baiana de Águas e Saneamento", motivo: "fora_do_cadastro",
    detalhe: "As duas maiores estatais da Bahia NÃO aparecem no cadastro de servidores (dados-de-servidores) — provavelmente regidas 100% por CLT fora desse cadastro; precisam de fonte própria não investigada nesta rodada" },
];
for (const p of PENDENCIAS) {
  const hash = crypto.createHash("sha256").update(`BA|${p.sigla}|${p.motivo}`).digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('BA',$1,$2,$3,$4,$5,$6) on conflict (_hash) do nothing`,
    [p.sigla, p.nome_empresa, p.motivo, p.detalhe, FONTE, hash]);
}

console.log("=== Bahia confirmados ===");
console.table((await q(`select empresa_sigla, nome, proventos from remuneracao_dirigentes_estatais_ba_individual order by proventos desc`)).rows);
console.log("=== Bahia pendências ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='BA'`)).rows);
await db.end();
