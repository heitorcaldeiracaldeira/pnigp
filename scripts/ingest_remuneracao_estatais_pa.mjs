// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_pa.mjs — Pará: API REST limpa por trás do portal (api-servidores-publicos.
// sistemas.pa.gov.br), achada pela rede do browser depois que a interface Vue/BootstrapVue resistiu a interação
// automatizada (os <select> nativos ficam ocultos atrás de um widget customizado — mesmo com force:true, a
// aplicação não reagia). Consultei a API direto: GET /funcionarios/filtro?ano=2026&mes=8&orgao=<id>&quantidade=300.
//
// ACHADO IMPORTANTE: os nomes que a IMPRENSA dava como atuais (Márcio Tavares de Sousa na CPH, Ozório Juvenil na
// COHAB) NÃO SÃO quem está na folha de agosto/2026 — a folha (fonte primária, mês corrente) mostra Anderson Rocha
// de Araujo (CPH) e Artur Mateus Santos de Menezes (COHAB). Prevaleceu a folha sobre a imprensa desatualizada.
//
// Estatais candidatas (dropdown Órgão): CODEC, COHAB, CPH, EMATER, PRODEPA, CEASA — 6 no total.
// CEASA: o nome achado na imprensa (Raimundo José Pinheiro dos Santos Junior, nomeado fev/2026) NÃO aparece na
// folha de agosto/2026 — só apareceu "Diretor Técnico" e "Diretor Operacional", sem "Diretor Presidente"/
// "Presidente" (fora do conselho). Não é falha de busca, é ausência confirmada na folha do mês.
//
// node scripts/ingest_remuneracao_estatais_pa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE = "api-servidores-publicos.sistemas.pa.gov.br/dados-transparencias/funcionarios/filtro (ano=2026, mes=08)";

await q(`create table if not exists remuneracao_dirigentes_estatais_pa_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, salario_bruto numeric, salario_liquido numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const CONFIRMADOS = [
  { sigla: "CODEC", nome_empresa: "Companhia de Desenvolvimento Econômico do Pará", cargo: "Presidente",
    nome: "Lutfala de Castro Bitar", bruto: 25049.49, liquido: 12885.45, obs: null },
  { sigla: "COHAB", nome_empresa: "Companhia de Habitação do Estado do Pará", cargo: "Diretor Presidente",
    nome: "Artur Mateus Santos de Menezes", bruto: 18536.00, liquido: 14051.12, obs: null },
  { sigla: "CPH", nome_empresa: "Companhia de Portos e Hidrovias do Estado do Pará", cargo: "Diretor Presidente",
    nome: "Anderson Rocha de Araujo", bruto: 25283.92, liquido: 18697.88, obs: null },
  { sigla: "EMATER-PA", nome_empresa: "Empresa de Assistência Técnica e Extensão Rural (Pará)", cargo: "Diretor Presidente",
    nome: "Joniel Vieira de Abreu", bruto: 26593.82, liquido: 1719.45,
    obs: "Líquido muito abaixo do bruto (desconto pesado no mês) — conferir competência seguinte se for usar de forma sensível" },
  { sigla: "PRODEPA", nome_empresa: "Empresa de Tecnologia da Informação e Comunicação do Pará", cargo: "Presidente",
    nome: "Fernando Mario Marroquim Junior", bruto: 28989.11, liquido: 14626.54, obs: null },
].map((r) => ({ ...r, competencia: "2026-08", fonte: FONTE }));

for (const r of CONFIRMADOS) {
  const hash = crypto.createHash("sha256").update(`PA|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_pa_individual
    (empresa_sigla,empresa_nome,cargo,nome,salario_bruto,salario_liquido,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.bruto, r.liquido, r.competencia, r.fonte, r.obs, hash]);
}

{
  const hash = crypto.createHash("sha256").update("PA|CEASA|sem_diretor_na_folha").digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('PA','CEASA','Centrais de Abastecimento do Pará','sem_dirigente_na_folha',
     'Raimundo José Pinheiro dos Santos Junior (nomeado presidente em fev/2026 segundo o Diário Oficial) não aparece na folha de agosto/2026 — só Diretor Técnico e Diretor Operacional, sem cargo de Diretor Presidente/Presidente fora do conselho',
     $1, $2) on conflict (_hash) do nothing`, [FONTE, hash]);
}

console.log("=== Pará confirmados ===");
console.table((await q(`select empresa_sigla, nome, salario_bruto, salario_liquido from remuneracao_dirigentes_estatais_pa_individual order by salario_bruto desc`)).rows);
await db.end();
