// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_pe_completa.mjs — Pernambuco, segunda rodada: resolve EMPETUR e PERPART, que na
// rodada 1 tinham "liderança incerta" por dois nomes concorrentes na imprensa.
//
// EMPETUR: Eduardo José Carneiro da Cunha Loyo — CONFIRMADO por Portaria nº 112 de 31/08/2026 (assinada
// eletronicamente em 01/09/2026, há apenas 3 dias) — o nome concorrente (Antonio Neves) era imprensa desatualizada.
// PERPART: Francisco de Assis de Souza Amaral (Francisco Amaral) — confirmado em fonte primária
// (perpart.pe.gov.br/institucional/estrutura-administrativa) e notícia recente (31/07/2026). O "Francisco Amaral"
// achado antes na folha da Secretaria de Saúde era um homônimo — pessoa diferente.
//
// Nenhum valor de remuneração encontrado nesta rodada (o cargo pode não estar no cadastro central de servidor
// público, comum em empresas menores/holdings estaduais).
//
// node scripts/ingest_remuneracao_estatais_pe_completa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const REGS = [
  { sigla: "EMPETUR", nome_empresa: "Empresa de Turismo de Pernambuco", cargo: "Diretor Presidente",
    nome: "Eduardo José Carneiro da Cunha Loyo",
    fonte: "Portaria nº 112 de 31/08/2026 (empetur.pe.gov.br), assinada eletronicamente em 01/09/2026" },
  { sigla: "PERPART", nome_empresa: "Pernambuco Participações e Investimentos S/A", cargo: "Diretor Presidente",
    nome: "Francisco de Assis de Souza Amaral",
    fonte: "perpart.pe.gov.br/institucional/estrutura-administrativa (mandato desde nov/2023)" },
].map((r) => ({ ...r, valor: null, competencia: null }));

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`PE|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_pe_individual
    (empresa_sigla,empresa_nome,cargo,nome,total_vantagens,competencia,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, hash]);
}

await q(`delete from estatais_pendencias where uf='PE' and empresa_sigla in ('EMPETUR','PERPART')`);

console.log("=== Pernambuco — completo (rodada 2) ===");
console.table((await q(`select empresa_sigla, nome, total_vantagens from remuneracao_dirigentes_estatais_pe_individual order by empresa_sigla`)).rows);
await db.end();
