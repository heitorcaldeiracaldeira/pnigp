// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_ac.mjs — Acre: 3 sociedades de economia mista confirmadas (ANAC, COHAB, CDSA),
// achadas via página oficial estado.ac.gov.br/orgao-entidades/sociedade-de-economia-mista (categoria própria,
// mesmo padrão do Distrito Federal). BANACRE (banco) está em liquidação, ELETROACRE já privatizada há décadas —
// ambas fora de escopo (não pesquisadas a fundo, mas descartadas pela Wikipedia como não-ativas).
//
// ANAC = Agência de Negócios do Estado do Acre S/A (NÃO confundir com a Agência Nacional de Aviação Civil, órgão
// federal homônimo — cuidado de busca necessário, a primeira tentativa trouxe resultado errado).
//
// COHAB: CONFLITO entre a página oficial (estado.ac.gov.br, "instantâneo" de 09/07/2026, diz Rafael Almeida de
// Sousa) e uma notícia de posse mais recente (Portal Acre, 17/07/2026, diz Dr. Edmo Araújo assumiu a presidência).
// Prevaleceu a notícia de posse mais recente (lei: não usar dado antigo) — página oficial provavelmente
// desatualizada em relação à troca.
//
// Nenhum valor de remuneração encontrado para nenhuma das 3 nesta rodada.
//
// node scripts/ingest_remuneracao_estatais_ac.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE = "estado.ac.gov.br/orgao-entidades/sociedade-de-economia-mista";

await q(`create table if not exists remuneracao_dirigentes_estatais_ac_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, valor numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const REGS = [
  { sigla: "ANAC", nome_empresa: "Agência de Negócios do Estado do Acre S/A", cargo: "Diretora-Presidente",
    nome: "Waleska Lima Bezerra", fonte: FONTE, obs: "não confundir com a Agência Nacional de Aviação Civil (federal, sigla homônima)" },
  { sigla: "COHAB", nome_empresa: "Companhia de Habitação do Acre", cargo: "Presidente",
    nome: "Dr. Edmo Araújo", fonte: "portalacre.com.br/2026/07/dr-edmo-araujo-assume-a-presidencia-da-cohab-acre (17/07/2026)",
    obs: "posse em 17/07/2026 — substitui Rafael Almeida de Sousa, ainda listado na página oficial estado.ac.gov.br datada de 09/07/2026 (provavelmente desatualizada)" },
  { sigla: "CDSA", nome_empresa: "Companhia de Desenvolvimento de Serviços Ambientais S/A", cargo: "Diretor Presidente",
    nome: "Lauro da Veiga Santos", fonte: FONTE, obs: "empresa gerencia créditos de carbono e serviços ambientais" },
].map((r) => ({ ...r, valor: null, competencia: null }));

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`AC|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_ac_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

console.log("=== Acre ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_ac_individual order by empresa_sigla`)).rows);
await db.end();
