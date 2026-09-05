// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_pe.mjs — Pernambuco: painel Pentaho (não PowerBI) em transparencia.pe.gov.br,
// individualizado por nome — mas SEM coluna de cargo visível na tabela principal, então o método foi: achar o
// nome do Diretor-Presidente atual por busca externa, depois localizar o valor dele pelo campo "Nome do
// Servidor" (busca por nome funcionou de forma confiável; busca por cargo/"Pesquisar" ficou "Sem dados" em toda
// tentativa — provavelmente exige grafia exata que não descobri).
//
// Estatais candidatas (dropdown "Órgão" do painel): CEPE, CEHAB, EMPETUR, PERPART, EPC — 5 no total.
//
// EMPETUR: dois nomes concorrentes na imprensa (Eduardo Loyo, Antonio Neves) — NENHUM apareceu na folha.
// PERPART: dois nomes concorrentes (Thiago Ângelus, Francisco Amaral) — nenhum bateu no órgão certo (o "Francisco
// Amaral" que apareceu na folha está lotado na Secretaria de Saúde, pessoa diferente).
// Ambos ficam pendentes — não é lacuna de busca, é troca de comando real e recente demais para a fonte de nome
// (imprensa) e a fonte de valor (folha) concordarem.
//
// node scripts/ingest_remuneracao_estatais_pe.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE = "transparencia.pe.gov.br/recursos-humanos/remuneracoes (painel Pentaho, busca por nome) — mês mais recente disponível (jul/2026)";

await q(`create table if not exists remuneracao_dirigentes_estatais_pe_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, total_vantagens numeric,
  competencia text, fonte text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const CONFIRMADOS = [
  { sigla: "CEPE", nome_empresa: "Companhia Editora de Pernambuco", nome: "João Baltar Freire", valor: 23871.97 },
  { sigla: "CEHAB", nome_empresa: "Companhia Estadual de Habitação e Obras", nome: "Paulo Fernando de Lira Junior", valor: 20521.71 },
  { sigla: "EPC", nome_empresa: "Empresa Pernambuco de Comunicação S/A", nome: "Thamires Otilia da Silva", valor: 15601.30 },
].map((r) => ({ ...r, cargo: "Diretor Presidente", competencia: "2026-07", fonte: FONTE }));

for (const r of CONFIRMADOS) {
  const hash = crypto.createHash("sha256").update(`PE|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_pe_individual
    (empresa_sigla,empresa_nome,cargo,nome,total_vantagens,competencia,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, hash]);
}

const PENDENCIAS = [
  { sigla: "EMPETUR", nome_empresa: "Empresa de Turismo de Pernambuco", motivo: "lideranca_incerta",
    detalhe: "Imprensa cita dois nomes concorrentes para presidente (Eduardo Loyo, Antonio Neves) — nenhum encontrado na folha de pagamento sob esse órgão" },
  { sigla: "PERPART", nome_empresa: "Pernambuco Participações e Investimentos S/A", motivo: "lideranca_incerta",
    detalhe: "Imprensa cita dois nomes concorrentes (Thiago Ângelus - maio/2026, Francisco Amaral - ago/2026) — o 'Francisco Amaral' achado na folha está lotado na Secretaria de Saúde, pessoa diferente" },
];
for (const p of PENDENCIAS) {
  const hash = crypto.createHash("sha256").update(`PE|${p.sigla}|${p.motivo}`).digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('PE',$1,$2,$3,$4,$5,$6) on conflict (_hash) do nothing`,
    [p.sigla, p.nome_empresa, p.motivo, p.detalhe, FONTE, hash]);
}

console.log("=== Pernambuco confirmados ===");
console.table((await q(`select empresa_sigla, nome, total_vantagens from remuneracao_dirigentes_estatais_pe_individual order by total_vantagens desc`)).rows);
console.log("=== Pernambuco pendências ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='PE'`)).rows);
await db.end();
