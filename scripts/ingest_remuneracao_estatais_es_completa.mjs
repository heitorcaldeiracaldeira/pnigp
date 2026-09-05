// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_es_completa.mjs — Espírito Santo, segunda rodada: resolve os 2 valores pendentes
// (CESAN, BANDES) — o portal da CESAN, que dava 503 antes, já voltou ao ar.
//
// CESAN: portal próprio (transparencia.cesan.com.br/empregados) tem detalhe mensal individualizado — Munir Abud
// de Oliveira, Diretor Presidente, agosto/2026: remuneração bruta R$ 45.321,67 + outras remunerações R$ 10.324,10
// = R$ 55.645,77 bruto total; líquido R$ 41.316,85.
//
// BANDES: tabela FIXA de honorários da alta administração, vigente desde a AGO de 28/04/2026 — Diretor (empregado
// ou não empregado): R$ 38.607,26/mês. Aplica-se ao cargo de Diretor-Presidente independente de quem o ocupa.
//
// node scripts/ingest_remuneracao_estatais_es_completa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const REGS = [
  { sigla: "CESAN", nome_empresa: "Companhia Espírito-Santense de Saneamento", cargo: "Diretor Presidente",
    nome: "Munir Abud de Oliveira", valor: 55645.77, competencia: "2026-08",
    fonte: "transparencia.cesan.com.br/empregados (detalhe individual)",
    obs: "bruto = remuneração base R$45.321,67 + outras remunerações R$10.324,10; líquido R$41.316,85; entrada no cargo 01/02/2023" },
  { sigla: "BANDES", nome_empresa: "Banco de Desenvolvimento do Espírito Santo S.A.", cargo: "Diretor",
    nome: "Marcelo Barbosa Saintive", valor: 38607.26, competencia: "vigente desde AGO 28/04/2026",
    fonte: "bandes.com.br — Tabela de Salários, Gratificações e Honorários",
    obs: "valor FIXO por tabela (não folha individualizada) — mesmo honorário para Diretor Empregado e Diretor não empregado; 4 vagas de Diretor no total" },
];

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`ES|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_es_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (_hash) do update set valor=excluded.valor, observacao=excluded.observacao`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

// remove a linha antiga da CESAN com valor null (fica só a nova com valor preenchido, mesma pessoa/cargo)
await q(`delete from remuneracao_dirigentes_estatais_es_individual
  where empresa_sigla='CESAN' and valor is null`);

await q(`delete from estatais_pendencias where uf='ES' and empresa_sigla in ('CESAN','BANDES')`);

console.log("=== Espírito Santo — completo (rodada 2) ===");
console.table((await q(`select empresa_sigla, nome, valor, observacao from remuneracao_dirigentes_estatais_es_individual order by empresa_sigla`)).rows);
await db.end();
