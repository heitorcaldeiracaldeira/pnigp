// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_al_completa.mjs — Alagoas, segunda rodada: resolve o nome da ALGÁS (a rodada 1 não
// conseguiu abrir o portal de governança da empresa). CASAL já tinha o nome confirmado (Luiz Cavalcante Peixoto
// Neto) — só falta valor, que não foi encontrado nesta rodada (portal transparencia.al.gov.br está no ar, mas a
// navegação até "Servidores Ativos" não foi resolvida nesta rodada — fica pendente, não é ausência de fonte).
//
// ALGÁS: José Ediberto de Omena (Ediberto Omena), Diretor-Presidente — confirmado em fonte primária (algas.com.br)
// e notícia institucional recente (15/07/2026, também mencionado em post de "2 dias atrás" a partir de 04/09/2026).
//
// node scripts/ingest_remuneracao_estatais_al_completa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const r = { sigla: "ALGÁS", nome_empresa: "Gás de Alagoas S.A.", cargo: "Diretor-Presidente",
  nome: "José Ediberto de Omena", valor: null, competencia: null,
  fonte: "algas.com.br (notícia 15/07/2026 e menções institucionais recentes)", obs: null };
const hash = crypto.createHash("sha256").update(`AL|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
await q(`insert into remuneracao_dirigentes_estatais_al_individual
  (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
  [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);

await q(`delete from estatais_pendencias where uf='AL' and empresa_sigla in ('ALGÁS')`);
await q(`update estatais_pendencias set motivo='nome_confirmado_valor_pendente', detalhe='ALGÁS: José Ediberto de Omena confirmado em fonte primária — valor de remuneração não publicado. CASAL: portal transparencia.al.gov.br está no ar, seção Servidores Ativos existe mas navegação não concluída nesta rodada.' where uf='AL' and empresa_sigla='TODAS'`);

console.log("=== Alagoas — completo (rodada 2) ===");
console.table((await q(`select empresa_sigla, nome, valor from remuneracao_dirigentes_estatais_al_individual order by empresa_sigla`)).rows);
console.log("=== Alagoas — pendências restantes ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='AL'`)).rows);
await db.end();
