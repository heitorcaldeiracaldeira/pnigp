// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_go_completa.mjs — Goiás, segunda rodada: resolve as 2 pendências abertas (AGEHAB,
// Goiásgás), ambas via padrão goias.gov.br/<empresa>/cargos-e-seus-ocupantes já usado nas outras estatais do
// estado.
//
// AGEHAB: Juliano Ricardo Fuganti Mendes, Diretor-Presidente (mandato 17/04/2026-07/03/2027), sucedeu Alexandre
// Baldy. A página de estrutura remuneratória continuava desatualizada (2016-2020) — resolvido só o nome.
//
// Goiásgás: Erik Alencar de Figueiredo, Diretor Presidente (mandato 11/12/2024-10/12/2026), "eleito por ata".
// A EMPRESA TEM uma página própria de "Folha de Pagamento" (goiasgas.com.br) — tentei acessar mas a URL exata não
// foi encontrada nesta rodada; valor fica pendente de nova tentativa (não é ausência de fonte, é navegação).
//
// node scripts/ingest_remuneracao_estatais_go_completa.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const REGS = [
  { sigla: "AGEHAB", nome_empresa: "Agência Goiana de Habitação S.A.", cargo: "Diretor-Presidente",
    nome: "Juliano Ricardo Fuganti Mendes", valor: null, competencia: "mandato 17/04/2026-07/03/2027",
    fonte: "goias.gov.br/agehab/cargos-e-seus-ocupantes", obs: "sucedeu Alexandre Baldy; página de remuneração segue desatualizada (2016-2020)" },
  { sigla: "Goiásgás", nome_empresa: "Agência Goiana de Gás Canalizado", cargo: "Diretor Presidente",
    nome: "Erik Alencar de Figueiredo", valor: null, competencia: "mandato 11/12/2024-10/12/2026",
    fonte: "goiasgas.com.br/a-goiasgas/diretoria", obs: "empresa TEM página própria de Folha de Pagamento, mas a URL exata não foi encontrada nesta rodada — valor pendente de nova tentativa, não é ausência de fonte" },
];

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`GO|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_go_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

await q(`delete from estatais_pendencias where uf='GO' and empresa_sigla in ('AGEHAB','Goiásgás')`);

console.log("=== Goiás — completo (rodada 2) ===");
console.table((await q(`select empresa_sigla, nome, observacao from remuneracao_dirigentes_estatais_go_individual order by empresa_sigla`)).rows);
await db.end();
