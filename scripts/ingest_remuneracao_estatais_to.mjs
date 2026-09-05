// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_to.mjs — Tocantins: universo pequeno. SANEATINS (saneamento) foi 100% PRIVATIZADA
// desde 1998 — TO é o ÚNICO estado do Brasil que vendeu inteiramente sua companhia estadual de água/esgoto (hoje
// opera sob a BRK Ambiental/Brookfield) — fora de escopo, não é pendência, é exclusão genuína confirmada.
//
// Única sociedade de economia mista clara encontrada: Agência de Fomento do Estado do Tocantins S.A. (FomenTO) —
// Diretor-Presidente Lyndon Johnson Portilho Prado, confirmado em fonte primária (fomento.to.gov.br/institucional).
// CELTINS (energia) já foi privatizada há décadas (Grupo Rede/Energisa) — não pesquisado a fundo nesta rodada
// mas historicamente fora do controle estadual.
//
// node scripts/ingest_remuneracao_estatais_to.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE = "fomento.to.gov.br/institucional";

await q(`create table if not exists remuneracao_dirigentes_estatais_to_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, valor numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const r = { sigla: "FomenTO", nome_empresa: "Agência de Fomento do Estado do Tocantins S.A.", cargo: "Diretor-Presidente",
  nome: "Lyndon Johnson Portilho Prado", valor: null, competencia: null, fonte: FONTE,
  obs: "instituição financeira não bancária, fiscalizada pelo BACEN; valor de remuneração não encontrado nesta rodada" };
{
  const hash = crypto.createHash("sha256").update(`TO|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_to_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

{
  const hash = crypto.createHash("sha256").update("TO|SANEATINS|privatizada_1998").digest("hex");
  await q(`insert into estatais_extintas (uf,sigla,nome,ano_extincao,destino,fonte,_hash) values
    ('TO','SANEATINS','Companhia de Saneamento do Tocantins',1998,
     '100% privatizada — hoje opera sob a BRK Ambiental (grupo Brookfield); TO é o único estado do Brasil que vendeu inteiramente sua companhia estadual de água/esgoto',
     $1, $2) on conflict (_hash) do nothing`, [FONTE, hash]);
}

console.log("=== Tocantins ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_to_individual`)).rows);
await db.end();
