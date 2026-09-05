// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_ce.mjs — Ceará: portal com formulário simples e completo (cearatransparente.ce.gov.br
// /portal-da-transparencia/servidores), individualizado por nome/cargo/órgão/salário bruto e líquido.
//
// ACHADO DE MÉTODO: filtrar só por ÓRGÃO nunca mostra a lista individualizada — só aparecem os painéis agregados.
// A tabela "Servidor" só aparece filtrando por CARGO (funciona pra QUALQUER órgão de uma vez, já que o cargo
// "Diretor Presidente"/"Presidente" é raro o bastante pra devolver poucas linhas). O select de cargo é DEPENDENTE
// do órgão selecionado (atributo data-dependent-select-child) — selecionar antes um órgão FILTRA os cargos
// disponíveis, o que foi como confirmei que a CEGÁS não tem nenhum cargo de Diretor/Presidente nesse cadastro.
//
// Estatais candidatas (dropdown Órgão): METROFOR, CEGÁS, ETICE, EMATERCE — 4 no total.
// CEGÁS: SEM cargo de Diretor/Presidente neste cadastro de servidor público — parceria com capital privado
// (Cambuhy Investimentos comprou fatia em 2020) pode significar que a diretoria não é "servidor público" aqui.
// Não é lacuna de busca — testei e confirmei a ausência do cargo na lista dependente do próprio órgão.
//
// node scripts/ingest_remuneracao_estatais_ce.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE = "cearatransparente.ce.gov.br/portal-da-transparencia/servidores (busca por cargo, competência 08/2026)";

await q(`create table if not exists remuneracao_dirigentes_estatais_ce_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, salario_bruto numeric, salario_liquido numeric,
  competencia text, fonte text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const CONFIRMADOS = [
  { sigla: "METROFOR", nome_empresa: "Companhia Cearense de Transportes Metropolitanos", cargo: "Diretor Presidente",
    nome: "Plinio Pompeu de Saboya Magalhaes Neto", bruto: 44259.82, liquido: 3179.43,
    obs: "Líquido bem abaixo do bruto (desconto pesado no mês) — vale conferir competência seguinte se for usar de forma sensível" },
  { sigla: "ETICE", nome_empresa: "Empresa de Tecnologia da Informação do Ceará", cargo: "Presidente",
    nome: "Hugo Santana de Figueiredo Junior", bruto: 21420.62, liquido: 12854.93, obs: null },
  { sigla: "EMATERCE", nome_empresa: "Empresa de Assistência Técnica e Extensão Rural do Ceará", cargo: "Presidente",
    nome: "Inacio Mariano da Costa", bruto: 22093.89, liquido: 16210.45, obs: null },
].map((r) => ({ ...r, competencia: "2026-08", fonte: FONTE }));

for (const r of CONFIRMADOS) {
  const hash = crypto.createHash("sha256").update(`CE|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_ce_individual
    (empresa_sigla,empresa_nome,cargo,nome,salario_bruto,salario_liquido,competencia,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.bruto, r.liquido, r.competencia, r.fonte, hash]);
}

{
  const hash = crypto.createHash("sha256").update("CE|CEGAS|sem_cargo_no_cadastro").digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('CE','CEGÁS','Companhia de Gás do Ceará','fora_do_cadastro',
     'Nenhum cargo de Diretor/Presidente disponível na lista de cargos dependente do órgão (confirmado, não é falta de busca) — possível efeito da entrada de capital privado (Cambuhy Investimentos, 2020)',
     $1, $2) on conflict (_hash) do nothing`, [FONTE, hash]);
}

console.log("=== Ceará confirmados ===");
console.table((await q(`select empresa_sigla, nome, salario_bruto, salario_liquido from remuneracao_dirigentes_estatais_ce_individual order by salario_bruto desc`)).rows);
await db.end();
