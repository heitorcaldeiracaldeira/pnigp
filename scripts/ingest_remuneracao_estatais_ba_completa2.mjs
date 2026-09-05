// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_ba_completa2.mjs — Bahia, terceira rodada: CERB e Bahiapesca.
//
// CORREÇÃO: os nomes de CERB/Bahiapesca (Jayme de Souza Vieira Lima Filho e Daniel Benicio dos Santos Meirelles
// Victoria) tinham sido documentados só no CAMPO DE TEXTO da tabela estatais_pendencias na rodada 1 — nunca
// tinham virado linha na tabela individual. Corrigindo isso agora e já incluindo o que se achou de valor.
//
// CERB: valor GLOBAL anual (não individualizado por cargo) fixado para o conjunto Diretoria Executiva + Conselho
// de Administração + Conselho Fiscal: R$ 900.000,00 em 2025 (R$ 869.000,00 em 2024). Fonte: cerb.ba.gov.br (via
// busca — site respondeu ERR_CONNECTION_REFUSED em acesso direto nesta rodada).
//
// Bahiapesca: achei tabela INDIVIDUALIZADA por cargo em "Remuneração dos Administradores" (ba.gov.br/bahiapesca),
// mas datada de 15/05/2024, sob o titular ANTERIOR do cargo (José George Santana da Hora Júnior) — o Diretor
// Presidente ATUAL é Daniel Benicio dos Santos Meirelles Victoria (achado na rodada 1 via cadastro de servidores
// mais recente). Registrando o valor como taxa do CARGO (mesma lógica de CODEMIG/BANDES/DESENBAHIA), com ressalva
// explícita de que não foi confirmado se a taxa foi revista após a troca de titular.
//
// node scripts/ingest_remuneracao_estatais_ba_completa2.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const REGS = [
  { sigla: "CERB", nome_empresa: "Companhia de Engenharia Hídrica e de Saneamento da Bahia", cargo: "Diretor Presidente",
    nome: "Jayme de Souza Vieira Lima Filho", proventos: null,
    fonte: "cadastro de servidores (matrícula 92125796) + cerb.ba.gov.br (valor global via busca)",
    obs: "Valor individual não decodificado (formato Power BI/DSR). Valor GLOBAL anual (não por cargo) fixado para toda a Diretoria + Conselho de Administração + Conselho Fiscal em 2025: R$ 900.000,00 (R$ 869.000,00 em 2024) — não dá para derivar o valor individual do Diretor-Presidente sem saber a proporção de rateio entre os cargos." },
  { sigla: "Bahiapesca", nome_empresa: "Bahia Pesca S.A.", cargo: "Diretor Presidente",
    nome: "Daniel Benicio dos Santos Meirelles Victoria", proventos: 29792.62,
    fonte: "cadastro de servidores (matrícula 92088667) + ba.gov.br/bahiapesca 'Remuneração dos Administradores' (datada 15/05/2024)",
    obs: "Valor individual (folha) não decodificado (formato Power BI/DSR). Valor de R$ 29.792,62/mês achado na página 'Remuneração dos Administradores', mas sob o titular ANTERIOR do cargo (José George Santana da Hora Júnior) — registrado como taxa do CARGO (mesma lógica de CODEMIG/BANDES/DESENBAHIA), não confirmado se foi revista após a troca para o titular atual." },
];

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`BA|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_ba_individual
    (empresa_sigla,empresa_nome,cargo,nome,proventos,descontos,liquido,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,null,null,null,$6,$7,$8) on conflict (_hash) do update set proventos=excluded.proventos, observacao=excluded.observacao`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.proventos, r.fonte, r.obs, hash]);
}

await q(`delete from estatais_pendencias where uf='BA' and empresa_sigla in ('CERB','Bahiapesca')`);
await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
  ('BA','CERB','Companhia de Engenharia Hídrica e de Saneamento da Bahia','valor_individual_nao_decodificado','Só valor global anual da diretoria+conselhos (R$ 900.000,00/2025); valor individual do Diretor-Presidente exigiria decodificar o Power BI (DSR) ou achar o rateio por cargo','cerb.ba.gov.br','ba_cerb_v2') on conflict (_hash) do nothing`);
await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
  ('BA','Bahiapesca','Bahia Pesca S.A.','valor_desatualizado_por_troca_titular','Valor de R$29.792,62/mes achado é de tabela de 2024, sob titular anterior (Jose George); nao confirmado se foi revisto apos a troca para Daniel Benicio','ba.gov.br/bahiapesca','ba_bahiapesca_v2') on conflict (_hash) do nothing`);

console.log("=== Bahia — CERB e Bahiapesca (rodada 3, corrigido) ===");
console.table((await q(`select empresa_sigla, nome, proventos from remuneracao_dirigentes_estatais_ba_individual where empresa_sigla in ('CERB','Bahiapesca')`)).rows);
await db.end();
