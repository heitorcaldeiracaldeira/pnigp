// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_pr_sc.mjs — remuneração dos dirigentes das estatais de PR e SC.
//
// MESMO PADRÃO de MG/RS (ingest_remuneracao_estatais_mg_rs.mjs): nenhum dos dois estados tem portal único
// cobrindo a folha das estatais. As únicas com fonte confirmada são as duas que são companhia aberta na B3 —
// Sanepar (PR) e CELESC (SC) — via o mesmo dataset nacional da CVM (fre_cia_aberta_2026.zip), agregado por órgão.
//
// Copel (PR) foi PRIVATIZADA em 2023 — fora do escopo. CASAN (SC) segue estatal (privatização só cogitada, não
// efetivada) mas não é companhia aberta — sem Formulário de Referência.
//
// SC tem um portal próprio (transparenciaempresas.sc.gov.br/<sigla>/gestao/governanca/divulgacao-da-remuneracao-
// -dos-administradores) com URL padronizada por empresa — mas a página do CIASC (testada com browser real) está
// VAZIA (título carrega, tabela/PDF não) — mesmo padrão de "documento formalmente existente e vazio" já visto em
// outras frentes. Não teve como confirmar se é individualizado ou agregado; fica pendente.
//
// CEASA-PR, Fomento Paraná, Águas Paraná (PR) e CASAN, BADESC, EPAGRI, CIDASC, SANTUR (SC) NÃO foram checadas
// a fundo nesta rodada — ficaram de fora por falta de fonte confirmada rápida, não por decisão de excluir.
//
// node scripts/ingest_remuneracao_estatais_pr_sc.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE = "dados.cvm.gov.br/dataset/cia_aberta-doc-fre (fre_cia_aberta_2026.zip)";
const EXERCICIO = "2025-01-01 a 2025-12-31";

const REGS = [
  { uf: "PR", sigla: "Sanepar", nome_empresa: "Companhia de Saneamento do Paraná", orgao: "Conselho de Administração",
    numero_membros: 9, numero_membros_remunerados: 8, valor_maximo_anual: 149159.00, valor_minimo_anual: 149159.00,
    valor_medio_anual: 149159.00, ceo_nome: null, ceo_cargo: null },
  { uf: "PR", sigla: "Sanepar", nome_empresa: "Companhia de Saneamento do Paraná", orgao: "Diretoria Estatutária",
    numero_membros: 11, numero_membros_remunerados: 11, valor_maximo_anual: 1136418.22, valor_minimo_anual: 562562.98,
    valor_medio_anual: 919098.36, ceo_nome: "Wilson Bley Lipski", ceo_cargo: "Diretor Presidente / Superintendente" },
  { uf: "PR", sigla: "Sanepar", nome_empresa: "Companhia de Saneamento do Paraná", orgao: "Conselho Fiscal",
    numero_membros: 4.66, numero_membros_remunerados: 4.66, valor_maximo_anual: 99439.30, valor_minimo_anual: 99439.20,
    valor_medio_anual: 99439.20, ceo_nome: null, ceo_cargo: null },
  // CELESC — via remuneracao_total_orgao (formato novo, só total; sem max/min individual)
  { uf: "SC", sigla: "CELESC", nome_empresa: "Centrais Elétricas de Santa Catarina S.A.", orgao: "Conselho de Administração",
    numero_membros: 11, numero_membros_remunerados: 9.42, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 1752017.54 / 9.42, ceo_nome: null, ceo_cargo: null },
  { uf: "SC", sigla: "CELESC", nome_empresa: "Centrais Elétricas de Santa Catarina S.A.", orgao: "Diretoria Estatutária",
    numero_membros: 9, numero_membros_remunerados: 8.83, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 11002570.27 / 8.83, ceo_nome: "Edson Moritz Martins da Silva", ceo_cargo: "Diretor Presidente / Superintendente" },
  { uf: "SC", sigla: "CELESC", nome_empresa: "Centrais Elétricas de Santa Catarina S.A.", orgao: "Conselho Fiscal",
    numero_membros: 5, numero_membros_remunerados: 4.00, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 507404.72 / 4.00, ceo_nome: null, ceo_cargo: null },
];

for (const r of REGS) {
  const hash = crypto.createHash("sha256").update(`${r.uf}|${r.sigla}|${r.orgao}|${EXERCICIO}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_estaduais
    (uf,empresa_sigla,empresa_nome,orgao_administracao,numero_membros,numero_membros_remunerados,
     valor_maximo_anual,valor_minimo_anual,valor_medio_anual,ceo_nome,ceo_cargo,exercicio_referencia,
     granularidade,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'agregado_cvm_por_orgao',$13,$14)
    on conflict (_hash) do update set valor_medio_anual=excluded.valor_medio_anual`,
    [r.uf, r.sigla, r.nome_empresa, r.orgao, r.numero_membros, r.numero_membros_remunerados,
     r.valor_maximo_anual, r.valor_minimo_anual, r.valor_medio_anual, r.ceo_nome, r.ceo_cargo, EXERCICIO, FONTE, hash]);
}

const { rows } = await q(`select uf, empresa_sigla, orgao_administracao, ceo_nome, round(valor_medio_anual/12,2) media_mensal from remuneracao_dirigentes_estatais_estaduais order by uf, empresa_sigla, orgao_administracao`);
console.table(rows);
await db.end();
