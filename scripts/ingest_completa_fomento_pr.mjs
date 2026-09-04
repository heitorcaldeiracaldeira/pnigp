// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_completa_fomento_pr.mjs — fecha as duas pendências de PR: Fomento Paraná (achava o 6º diretor e faltava
// o Conselho Administrativo inteiro) e Águas Paraná (confirmação final do status).
//
// Miécio Ávila Tezelli (Diretor de Operações do Setor Privado): sumiu da folha em maio/jun-2026 — usei o último
// mês em que aparece (abril/2026). Não inventei valor pros meses que faltam.
//
// Águas Paraná: reconfirmado — foi incorporada pelo IAT (Instituto Água e Terra) em 2019, e o IAT é uma
// AUTARQUIA, não uma estatal (sociedade de economia mista/empresa pública). Isso importa: autarquia não tem
// "diretor-presidente" remunerado por honorário de conselho, tem servidor de carreira/cargo comissionado — outro
// regime jurídico, fora do escopo desta frente (salário de dirigente de ESTATAL). Não é "não achei", é "não é
// estatal", e por isso não vou forçar um "sucessor" que não existe na mesma natureza jurídica.
//
// node scripts/ingest_completa_fomento_pr.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE = "fomento.pr.gov.br/Pagina/Transparencia/Pessoal (remunera_colaboradores_2026_junho.xlsx) + CURRICULO-DE-DIRETORES-E-CONSELHEIROS";

// Diretor faltante
{
  const r = { empresa_sigla: "AFPR", empresa_nome: "Agência de Fomento do Paraná S/A (Fomento Paraná)",
    cargo: "Diretor de Operações do Setor Privado", nome: "Miécio Ávila Tezelli",
    proventos: 49285.39, descontos: 8398.74, liquido: 40886.65,
    competencia: "2026-04 (ausente na folha de mai/jun-2026, usei o último mês disponível)", fonte: FONTE, observacao: null };
  const hash = crypto.createHash("sha256").update(`${r.empresa_sigla}|${r.cargo}|${r.nome}|${r.competencia}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_pr_individual
    (empresa_sigla,empresa_nome,cargo,nome,proventos,descontos,liquido,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (_hash) do nothing`,
    [r.empresa_sigla, r.empresa_nome, r.cargo, r.nome, r.proventos, r.descontos, r.liquido, r.competencia, r.fonte, r.observacao, hash]);
}

// Conselho Administrativo inteiro (7 membros, jun/2026)
const CONSELHO = [
  { nome: "Flavio Montenegro Balan", cargo: "Conselheiro Administrativo - Presidente", proventos: 6603.93, descontos: 1230.40, liquido: 5373.53 },
  { nome: "Eduardo Francisco Sciarra", cargo: "Conselheiro Administrativo", proventos: 6603.93, descontos: 641.03, liquido: 5962.90 },
  { nome: "Carlos Romeu Ramos", cargo: "Conselheiro Administrativo", proventos: 6603.93, descontos: 1334.67, liquido: 5269.26 },
  { nome: "Bruno Antônio de Novaes Parolin", cargo: "Conselheiro Administrativo", proventos: 6603.93, descontos: 1334.67, liquido: 5269.26 },
  { nome: "Giancarlo Rocco", cargo: "Conselheiro Administrativo", proventos: 6603.93, descontos: 641.03, liquido: 5962.90 },
  { nome: "José Eduardo Nasser", cargo: "Conselheiro Administrativo", proventos: 6603.93, descontos: 1216.72, liquido: 5387.21 },
  { nome: "Leticia Zaina Bindo Abdala", cargo: "Conselheiro Administrativo", proventos: 6603.93, descontos: 641.03, liquido: 5962.90 },
].map((r) => ({ ...r, empresa_sigla: "AFPR", empresa_nome: "Agência de Fomento do Paraná S/A (Fomento Paraná)",
  competencia: "2026-06", fonte: FONTE, observacao: null }));

for (const r of CONSELHO) {
  const hash = crypto.createHash("sha256").update(`${r.empresa_sigla}|${r.cargo}|${r.nome}|${r.competencia}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_pr_individual
    (empresa_sigla,empresa_nome,cargo,nome,proventos,descontos,liquido,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (_hash) do nothing`,
    [r.empresa_sigla, r.empresa_nome, r.cargo, r.nome, r.proventos, r.descontos, r.liquido, r.competencia, r.fonte, r.observacao, hash]);
}

// Águas Paraná: nota final (a tabela estatais_extintas já tem o registro; aqui só documento o motivo de não buscar sucessor)
{
  const hash = crypto.createHash("sha256").update("PR|Aguas Parana|nao-e-estatal-sucessora").digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('PR','Águas Paraná','Instituto das Águas do Paraná','nao_aplicavel',
     'Incorporada pelo IAT (Instituto Água e Terra) em 2019 — o IAT é AUTARQUIA, não estatal (sociedade de economia mista/empresa pública). Fora do escopo desta frente por natureza jurídica, não por falta de busca.',
     'transparencia.pr.gov.br (dropdown de órgãos)', $1) on conflict (_hash) do nothing`, [hash]);
}

console.log("=== Fomento Paraná completo ===");
console.table((await q(`select cargo, nome, proventos, liquido, competencia from remuneracao_dirigentes_estatais_pr_individual where empresa_sigla='AFPR' order by proventos desc nulls last`)).rows);
await db.end();
