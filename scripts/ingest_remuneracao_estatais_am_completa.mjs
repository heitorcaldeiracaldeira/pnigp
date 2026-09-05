// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_am_completa.mjs — Amazonas, terceira rodada: resolve as 4 pendências "não
// pesquisada" restantes (AFEAM, ADS, AMAZONASTUR, CADA), todas via fonte oficial (portaria/documento próprio do
// órgão, não imprensa).
//
// AFEAM: Marcos Vinícius Cardoso de Castro — afeam.am.gov.br/estrutura/marcos-vinicius-c-de-castro (⚠️ não
// confundir com "AFFEAM", associação privada homônima de nome parecido, cujo presidente Eliezer Aquino NÃO é da
// AFEAM estatal).
// ADS: Michelle Macedo Bessa — documento oficial assinado 20/01/2026.
// AMAZONASTUR: Sérgio Paulo Monteiro Litaiff Filho — documento oficial assinado 13/07/2026.
// CADA: Enderson Simões, nomeado maio/2026 (substituiu Acram Salameh Isper Jr) — Portaria nº 014/2026-GAB/CADA.
// A "Lista de Servidores" própria da CADA (fev/2026) só traz cargo/admissão/vínculo, SEM valores de remuneração —
// não é uma folha de pagamento, é só um roster.
//
// Nenhum valor de remuneração encontrado para nenhuma das 4 nesta rodada.
//
// node scripts/ingest_remuneracao_estatais_am_completa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const REGS = [
  { sigla: "AFEAM", nome_empresa: "Agência de Fomento do Estado do Amazonas", cargo: "Diretor-Presidente",
    nome: "Marcos Vinícius Cardoso de Castro", fonte: "afeam.am.gov.br/estrutura/marcos-vinicius-c-de-castro",
    obs: "não confundir com AFFEAM (associação privada homônima, presidente Eliezer Aquino — entidade diferente)" },
  { sigla: "ADS", nome_empresa: "Agência de Desenvolvimento Sustentável do Amazonas", cargo: "Presidente",
    nome: "Michelle Macedo Bessa", fonte: "documento oficial ADS assinado em 20/01/2026", obs: null },
  { sigla: "AMAZONASTUR", nome_empresa: "Empresa Estadual de Turismo do Amazonas", cargo: "Diretor-Presidente",
    nome: "Sérgio Paulo Monteiro Litaiff Filho", fonte: "amazonastur.am.gov.br — documento oficial 13/07/2026", obs: null },
  { sigla: "CADA", nome_empresa: "Companhia Amazonense de Desenvolvimento e Mobilização de Ativos", cargo: "Diretor-Presidente",
    nome: "Enderson Simões", fonte: "Portaria nº 014/2026-GAB/CADA (cada.am.gov.br)",
    obs: "nomeado em maio/2026, substituiu Acram Salameh Isper Jr; a 'Lista de Servidores' própria da CADA só traz cargo/admissão, sem valores de remuneração" },
].map((r) => ({ ...r, valor: null, competencia: null }));

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`AM|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_am_individual
    (empresa_sigla,empresa_nome,cargo,nome,remuneracao_bruta,remuneracao_liquida,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

await q(`delete from estatais_pendencias where uf='AM' and empresa_sigla in ('AFEAM','ADS','AMAZONASTUR','CADA')`);

console.log("=== Amazonas — completo (rodada 3) ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_am_individual order by empresa_sigla`)).rows);
console.log("=== Amazonas — pendências restantes ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='AM'`)).rows);
await db.end();
