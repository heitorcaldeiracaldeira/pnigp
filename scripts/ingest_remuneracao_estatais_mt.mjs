// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_mt.mjs — Mato Grosso: 7 estatais confirmadas na própria página oficial de
// transparência (transparencia.mt.gov.br/sociedades-de-economia-mista-e-empresas-públicas): CEASA/MT,
// DESENVOLVE MT, EMPAER, METAMAT, MT GÁS, MT PAR, MTI. O portal central de "Servidores em Atividade" não tem
// filtro de órgão visível (só Mês/Ano) e o link interno para "remuneração de celetistas" (seplag.mt.gov.br/
// index.php?pg=remuneracao) está QUEBRADO (404) — não foi possível confirmar se cobre as estatais.
//
// ACHADO IMPORTANTE — conflito de fonte não resolvido, documentado em vez de escolhido a dedo: a METAMAT aparece
// no Diário Oficial de MT (iomat.mt.gov.br, edição nº 29.139 de 19/12/2025) com Rodrigo Ribeiro Verão no papel de
// "LIQUIDANTE" (indicando processo de liquidação da empresa) — mas o site institucional da própria METAMAT
// (metamat.mt.gov.br) se apresenta normalmente como órgão ATIVO, sem qualquer menção a liquidação. Um artigo de
// imprensa (CliqueF5) também trata de operação de corrupção envolvendo ex-presidente e ex-diretor. Mantive o
// nome do Diário Oficial (fonte primária mais forte que o site institucional desatualizado) mas sinalizo o
// status como não resolvido — não é uma empresa claramente ativa nem claramente extinta nesta rodada.
//
// Esta rodada usou só WebFetch/navegação direta (WebSearch esgotou o limite de 200 buscas da sessão) — por isso
// CEASA/MT, DESENVOLVE MT, EMPAER e o nome do dirigente da MTI ficam pendentes (não tentados a fundo).
//
// node scripts/ingest_remuneracao_estatais_mt.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

await q(`create table if not exists remuneracao_dirigentes_estatais_mt_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, valor numeric, competencia text,
  fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const NOME_SEM_VALOR = [
  { sigla: "MT PAR", nome_empresa: "MT Participações e Projetos S.A.", cargo: "Diretor Presidente",
    nome: "Wener Kesley dos Santos", fonte: "mtpar.mt.gov.br/presidente-mtpar",
    obs: "Página institucional não traz valor de remuneração" },
  { sigla: "MT GÁS", nome_empresa: "Companhia Mato-Grossense de Gás", cargo: "Presidente",
    nome: "Aecio Guerino de Souza Rodrigues", fonte: "notícia institucional (jun/2026), com outros 3 diretores nomeados (Guilherme Oliveira Carvalho, Jose Luiz de Aguiar Bojikian, Manoel Antonio Garcia Palma)",
    obs: "Valor de remuneração não pesquisado nesta rodada" },
  { sigla: "METAMAT", nome_empresa: "Metais de Mato Grosso S.A.", cargo: "Liquidante (não Diretor Presidente)",
    nome: "Rodrigo Ribeiro Verão", fonte: "Diário Oficial de Mato Grosso (iomat.mt.gov.br, edição nº 29.139, 19/12/2025)",
    obs: "CONFLITO DE FONTE NÃO RESOLVIDO: o Diário Oficial trata a empresa como em processo de liquidação (cargo 'Liquidante'), mas o site institucional da própria METAMAT se apresenta como órgão ativo sem menção a liquidação — status real não confirmado nesta rodada, não tratar como extinta nem como plenamente ativa sem nova verificação" },
];

for (const r of NOME_SEM_VALOR) {
  const hash = crypto.createHash("sha256").update(`MT|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_mt_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,null,null,$5,$6,$7) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.fonte, r.obs, hash]);
}

const PENDENCIAS = [
  { sigla: "METAMAT", motivo: "status_societario_incerto",
    detalhe: "Diário Oficial (19/12/2025) trata como empresa em liquidação (cargo 'Liquidante'); site institucional próprio se apresenta como ativo sem menção a liquidação — necessário confirmar status atual antes de tratar como qualquer uma das duas hipóteses" },
  { sigla: "MTI", nome_empresa: "Mato Grosso Informática S.A.",
    motivo: "nome_dirigente_nao_confirmado",
    detalhe: "Site institucional (mti.mt.gov.br) tem seção de transparência com 'Demonstrativo de Rendimentos Integrado' mas o nome do atual Diretor-Presidente não foi encontrado nesta rodada (WebSearch esgotado, checagem só por WebFetch da home)" },
  { sigla: "CEASA/MT", nome_empresa: "Central de Abastecimento de Mato Grosso",
    motivo: "nao_pesquisado", detalhe: "Não pesquisado nesta rodada (WebSearch esgotado antes de chegar a esta empresa)" },
  { sigla: "DESENVOLVE MT", nome_empresa: "Agência de Desenvolvimento de Mato Grosso",
    motivo: "nao_pesquisado", detalhe: "Não pesquisado nesta rodada (WebSearch esgotado antes de chegar a esta empresa)" },
  { sigla: "EMPAER", nome_empresa: "Empresa Mato-grossense de Pesquisa, Assistência e Extensão Rural",
    motivo: "nao_pesquisado", detalhe: "Não pesquisado nesta rodada (WebSearch esgotado antes de chegar a esta empresa) — verificar também se é sociedade de economia mista de fato ou autarquia/fundação de extensão rural (padrão observado em outros estados, ex. EMATER)" },
];
for (const p of PENDENCIAS) {
  const hash = crypto.createHash("sha256").update(`MT|${p.sigla}|${p.motivo}`).digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('MT',$1,$2,$3,$4,$5,$6) on conflict (_hash) do nothing`,
    [p.sigla, p.nome_empresa || null, p.motivo, p.detalhe, "transparencia.mt.gov.br/sociedades-de-economia-mista-e-empresas-públicas", hash]);
}

console.log("=== Mato Grosso — nome sem valor ===");
console.table((await q(`select empresa_sigla, cargo, nome from remuneracao_dirigentes_estatais_mt_individual`)).rows);
console.log("=== Mato Grosso — pendências ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='MT'`)).rows);
await db.end();
