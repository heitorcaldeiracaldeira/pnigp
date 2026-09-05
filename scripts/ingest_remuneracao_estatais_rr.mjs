// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_rr.mjs — Roraima (ÚLTIMO estado da fila autônoma de 27 UFs).
//
// Universo pequeno: BANER (banco) foi TRANSFORMADO em Agência de Fomento (não extinto, convertido — hoje
// "Desenvolve RR"); CERR (energia) não está mais sob controle estadual (energia de Roraima é hoje concessão
// privada/federal via Boa Vista Energia). Restam 2 estatais claramente ativas: Desenvolve RR e CAER.
//
// DESENVOLVE RR (Agência de Fomento do Estado de Roraima S/A): Diretor Presidente Adailton Alves Fernandes,
// DUPLA confirmação — site próprio (desenvolverr.com.br/diretoria) + Diário Oficial do Estado de Roraima (DOERR,
// 29/04/2026, assinando contrato como Diretor Presidente).
//
// CAER (Companhia de Águas e Esgotos de Roraima): Diretor-Presidente James da Silva Serrador, confirmado em fonte
// primária (caer.com.br/noticias). A CAER tem portal de transparência PRÓPRIO com folha mensal individualizada
// (caer.com.br/transparencia/rh) — mas a busca pelo nome dele na folha de julho/2026 não retornou registro
// visível nesta rodada (pode estar em outra aba/formato dentro do mesmo portal); valor fica pendente.
//
// node scripts/ingest_remuneracao_estatais_rr.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

await q(`create table if not exists remuneracao_dirigentes_estatais_rr_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, valor numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const REGS = [
  { sigla: "DESENVOLVE RR", nome_empresa: "Agência de Fomento do Estado de Roraima S/A", cargo: "Diretor Presidente",
    nome: "Adailton Alves Fernandes", fonte: "desenvolverr.com.br/diretoria + DOERR 29/04/2026",
    obs: "antiga BANER (Banco do Estado de Roraima), transformada em agência de fomento — não é caso de extinção" },
  { sigla: "CAER", nome_empresa: "Companhia de Águas e Esgotos de Roraima", cargo: "Diretor-Presidente",
    nome: "James da Silva Serrador", fonte: "caer.com.br/noticias",
    obs: "empresa tem portal de transparência próprio com folha mensal individualizada (caer.com.br/transparencia/rh) — busca pelo nome na folha de julho/2026 não retornou registro visível nesta rodada; valor pendente" },
].map((r) => ({ ...r, valor: null, competencia: null }));

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`RR|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_rr_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

console.log("=== Roraima ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_rr_individual order by empresa_sigla`)).rows);
await db.end();
