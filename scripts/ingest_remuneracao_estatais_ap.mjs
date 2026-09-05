// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_ap.mjs — Amapá: 3 sociedades de economia mista ativas (AFAP, CAESA, GASAP) — achadas
// direto no Diário Oficial do Amapá (DIOFE, 23/03/2026), que nomeia os dirigentes de cada uma na mesma publicação.
//
// CAESA (Companhia de Água e Esgotos do Amapá): a concessão da zona urbana já foi repassada à iniciativa privada,
// mas a companhia estatal continua existindo juridicamente, hoje focada em distritos/áreas rurais — não é extinta.
//
// BANAP (banco) está em liquidação; CEA (eletricidade) já foi privatizada (hoje Equatorial Energia) — ambas fora
// de escopo, confirmadas como não-ativas pela Wikipedia/consultapublica.ap.gov.br.
//
// GASAP: Diretor-Presidente é INTERINO (André Gustavo Lins de Macêdo, mandato 25/03/2026-24/03/2028, também
// acumula a Diretoria Administrativa e Financeira) — confirmado na própria página "Acesso à Informação" da GASAP.
//
// Nenhum valor de remuneração encontrado nesta rodada para as 3.
//
// node scripts/ingest_remuneracao_estatais_ap.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

await q(`create table if not exists remuneracao_dirigentes_estatais_ap_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, valor numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const REGS = [
  { sigla: "AFAP", nome_empresa: "Agência de Fomento do Amapá S.A.", cargo: "Diretor-Presidente",
    nome: "Eduardo Braz Barros Ferreira Júnior", fonte: "DIOFE — Diário Oficial do Amapá (23/03/2026)", obs: null },
  { sigla: "CAESA", nome_empresa: "Companhia de Água e Esgotos do Amapá", cargo: "Diretor-Presidente",
    nome: "Jorge Emanoel Amanajás Cardoso", fonte: "DIOFE — Diário Oficial do Amapá (23/03/2026)",
    obs: "concessão da zona urbana já repassada à iniciativa privada; a companhia estatal segue existindo, focada em distritos/áreas rurais" },
  { sigla: "GASAP", nome_empresa: "Companhia de Gás do Amapá", cargo: "Diretor Presidente Interino",
    nome: "André Gustavo Lins de Macêdo", fonte: "gasap.com.br/administradores",
    obs: "interino, mandato 25/03/2026-24/03/2028; acumula também a Diretoria Administrativa e Financeira" },
].map((r) => ({ ...r, valor: null, competencia: null }));

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`AP|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_ap_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

console.log("=== Amapá ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_ap_individual order by empresa_sigla`)).rows);
await db.end();
