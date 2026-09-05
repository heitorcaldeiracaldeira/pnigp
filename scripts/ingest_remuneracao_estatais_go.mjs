// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_remuneracao_estatais_go.mjs — Goiás: o portal central de folha (transparencia.go.gov.br/folha-de-pagamento,
// PowerBI "View Detalhamento Folha de Pagamento") foi CONFIRMADO como não cobrindo nenhuma das 11 estatais listadas
// pela SEAD-GO (só administração direta + autarquias/fundações + a estatal PRODAGO) — consultei via DAX replay
// (Bearer JWT capturado do embed) o SELECT DISTINCT "Nome Orgao" com filtro Ano=2026/Mês atual='Ultimo Mês' e
// nenhuma das 11 apareceu nos 42 órgãos retornados. Método teve que mudar para o padrão "por empresa" (como
// MG/RS/PR/SC/BA): cada estatal publica página própria em goias.gov.br/<empresa>/cargos-e-seus-ocupantes/ (nomes)
// e, quando existe, /estrutura-remuneratoria-de-cargos/ (valores) — mas a página de valores só está viva pra
// poucas empresas (as demais devolvem 404, apesar de a de nomes funcionar).
//
// SANEAGO e CELGPAR são companhias abertas (B3) — remuneração pelo pacote CVM (fre_cia_aberta_2026.zip), mesmo
// método usado em CEMIG/Banrisul/CELESC/Sanepar. ACHADO: os dois arquivos CVM da CELGPAR discordam por ~13x
// (remuneracao_total_orgao 2025 dá R$58.910,81/diretor/ano; a legada remuneracao_maxima_minima_media dá o mesmo
// valor pra TODOS os órgãos, incluindo Conselho de Administração e Fiscal, o que é estruturalmente improvável —
// indício de erro de preenchimento no XBRL da própria empresa). Segui o mesmo critério já usado pra CASAN: confiar
// em remuneracao_total_orgao (mais consistente com a ordem de grandeza das outras estatais) e documentar o
// conflito aqui em vez de escolher calado.
//
// GoiásFomento e Goiás Parcerias: as duas páginas oficiais de "cargos e seus ocupantes" trazem o MESMO nome
// (Alan Farias Tavares) com o MESMO mandato (13/04/2026–12/04/2028) — não é erro de extração, é diretoria
// compartilhada entre as duas empresas (mesmo padrão já visto em CODEMIG/CODEMGE-MG).
//
// AGEHAB: confirmada sociedade de economia mista (não autarquia), mas a única página de remuneração encontrada
// tem arquivos de 2016–2020 (defasada 6+ anos) e não achei o nome do dirigente atual nesta rodada — pendência.
// Goiásgás: nenhum resultado (nome nem valor) nesta rodada — pendência.
//
// node scripts/ingest_remuneracao_estatais_go.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);

const FONTE_PORTAIS = "goias.gov.br/<empresa>/cargos-e-seus-ocupantes (nomes) + /estrutura-remuneratoria-de-cargos (valores, quando publicada)";
const FONTE_CVM = "dados.cvm.gov.br/dataset/cia_aberta-doc-fre (fre_cia_aberta_2026.zip)";

await q(`create table if not exists remuneracao_dirigentes_estatais_go_individual (
  empresa_sigla text, empresa_nome text, cargo text, nome text, valor numeric,
  competencia text, fonte text, observacao text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const INDIVIDUAL = [
  { sigla: "CEASA-GO", nome_empresa: "Centrais de Abastecimento de Goiás S.A.", cargo: "Diretor Presidente",
    nome: "Geraldo Ferreira Pires Junior", valor: 29743.20, competencia: "estrutura vigente (ref. 03/07/2026)",
    fonte: "goias.gov.br/ceasa/estrutura-remuneratoria-de-cargos + /ceasa/cargos-e-seus-ocupantes", obs: null },
  { sigla: "CODEGO", nome_empresa: "Companhia de Desenvolvimento Econômico de Goiás", cargo: "Diretor Presidente",
    nome: "Luiz Antônio Oliveira Rosa", valor: null, competencia: null, fonte: FONTE_PORTAIS,
    obs: "posse em abril/2026; página de remuneração retorna 404 — valor não publicado" },
  { sigla: "Goiás Telecom", nome_empresa: "Goiás Telecomunicações S.A.", cargo: "Diretor-Presidente",
    nome: "João Batista Grego", valor: null, competencia: null, fonte: FONTE_PORTAIS,
    obs: "no cargo desde 09/04/2026 (página oficial atual prevaleceu sobre notícia desatualizada citando outro nome); página de remuneração retorna 404" },
  { sigla: "IQUEGO", nome_empresa: "Indústria Química do Estado de Goiás S.A.", cargo: "Diretor Presidente",
    nome: "José Carlos dos Santos", valor: null, competencia: null, fonte: FONTE_PORTAIS,
    obs: "página de remuneração retorna 404 — valor não publicado" },
  { sigla: "Metrobus", nome_empresa: "Metropolitana de Transportes Coletivos S.A.", cargo: "Diretor Presidente",
    nome: "Francisco Antônio Caldas de Andrade Pinto", valor: null, competencia: null, fonte: FONTE_PORTAIS,
    obs: "no cargo desde 15/01/2020; página de remuneração retorna 404" },
  { sigla: "GoiásFomento", nome_empresa: "Agência de Fomento de Goiás S.A.", cargo: "Diretor Presidente",
    nome: "Alan Farias Tavares", valor: null, competencia: null, fonte: FONTE_PORTAIS,
    obs: "mandato 13/04/2026-12/04/2028; mesma diretoria da Goiás Parcerias; página de remuneração retorna 404" },
  { sigla: "Goiás Parcerias", nome_empresa: "Goiás Parcerias S.A.", cargo: "Diretor Presidente",
    nome: "Alan Farias Tavares", valor: null, competencia: null, fonte: FONTE_PORTAIS,
    obs: "diretoria compartilhada com a GoiásFomento (mesmo nome, mesmo mandato 13/04/2026-12/04/2028, confirmado em duas páginas oficiais distintas); página de remuneração retorna 404" },
];

for (const r of INDIVIDUAL) {
  const hash = crypto.createHash("sha256").update(`GO|${r.sigla}|${r.cargo}|${r.nome}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_go_individual
    (empresa_sigla,empresa_nome,cargo,nome,valor,competencia,fonte,observacao,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (_hash) do nothing`,
    [r.sigla, r.nome_empresa, r.cargo, r.nome, r.valor, r.competencia, r.fonte, r.obs, hash]);
}

// ─── SANEAGO e CELGPAR — mesma tabela agregada CVM usada em MG/RS/PR/SC ───────────────────────────────────────
await q(`create table if not exists remuneracao_dirigentes_estatais_estaduais (
  uf text, empresa_sigla text, empresa_nome text, orgao_administracao text, numero_membros numeric,
  numero_membros_remunerados numeric, valor_maximo_anual numeric, valor_minimo_anual numeric,
  valor_medio_anual numeric, ceo_nome text, ceo_cargo text, exercicio_referencia text, granularidade text,
  fonte text, _hash text primary key, _coletado_em timestamptz default now()
)`);

const EXERCICIO = "2025-01-01 a 2025-12-31";
const CVM_REGS = [
  // SANEAGO (01.616.929/0001-02) — arquivo maxima_minima_media, exercício 2025 (individualizado, membros de 12 meses)
  { uf: "GO", sigla: "SANEAGO", nome_empresa: "Saneamento de Goiás S.A.", orgao: "Conselho de Administração",
    numero_membros: 10, numero_membros_remunerados: 10, valor_maximo_anual: 145117.97, valor_minimo_anual: 145117.97,
    valor_medio_anual: 145117.97, ceo_nome: null, ceo_cargo: null },
  { uf: "GO", sigla: "SANEAGO", nome_empresa: "Saneamento de Goiás S.A.", orgao: "Diretoria Estatutária",
    numero_membros: 7, numero_membros_remunerados: 7, valor_maximo_anual: 1211029.70, valor_minimo_anual: 1012376.58,
    valor_medio_anual: 1065712.52, ceo_nome: "Ricardo José Soavinski", ceo_cargo: "Diretor Presidente (mandato 2025-2026)" },
  { uf: "GO", sigla: "SANEAGO", nome_empresa: "Saneamento de Goiás S.A.", orgao: "Conselho Fiscal",
    numero_membros: 5, numero_membros_remunerados: 5, valor_maximo_anual: 112869.56, valor_minimo_anual: 112869.56,
    valor_medio_anual: 112869.56, ceo_nome: null, ceo_cargo: null },
  // CELGPAR (08.560.444/0001-93) — arquivo remuneracao_total_orgao, exercício 2025 (agregado/membros_remunerados;
  // a legada maxima_minima_media diverge ~13x e foi descartada por inconsistência estrutural, ver comentário acima)
  { uf: "GO", sigla: "CELGPAR", nome_empresa: "Cia Celg de Participações - CELGPAR", orgao: "Conselho de Administração",
    numero_membros: 9, numero_membros_remunerados: 9, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 689256.48 / 9, ceo_nome: null, ceo_cargo: null },
  { uf: "GO", sigla: "CELGPAR", nome_empresa: "Cia Celg de Participações - CELGPAR", orgao: "Diretoria Estatutária",
    numero_membros: 4, numero_membros_remunerados: 4, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 3141909.87 / 4, ceo_nome: null,
    ceo_cargo: "nome do Diretor-Presidente não confirmado nesta rodada — só achei fonte secundária (Econodata) não pareada com este valor" },
  { uf: "GO", sigla: "CELGPAR", nome_empresa: "Cia Celg de Participações - CELGPAR", orgao: "Conselho Fiscal",
    numero_membros: 5, numero_membros_remunerados: 5, valor_maximo_anual: null, valor_minimo_anual: null,
    valor_medio_anual: 382920.26 / 5, ceo_nome: null, ceo_cargo: null },
];

for (const r of CVM_REGS) {
  const hash = crypto.createHash("sha256").update(`${r.uf}|${r.sigla}|${r.orgao}|${EXERCICIO}`).digest("hex");
  await q(`insert into remuneracao_dirigentes_estatais_estaduais
    (uf,empresa_sigla,empresa_nome,orgao_administracao,numero_membros,numero_membros_remunerados,
     valor_maximo_anual,valor_minimo_anual,valor_medio_anual,ceo_nome,ceo_cargo,exercicio_referencia,
     granularidade,fonte,_hash)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'agregado_cvm_por_orgao',$13,$14)
    on conflict (_hash) do update set valor_medio_anual=excluded.valor_medio_anual`,
    [r.uf, r.sigla, r.nome_empresa, r.orgao, r.numero_membros, r.numero_membros_remunerados,
     r.valor_maximo_anual, r.valor_minimo_anual, r.valor_medio_anual, r.ceo_nome, r.ceo_cargo, EXERCICIO, FONTE_CVM, hash]);
}

// ─── pendências ────────────────────────────────────────────────────────────────────────────────────────────
const PENDENCIAS = [
  { sigla: "AGEHAB", nome_empresa: "Agência Goiana de Habitação S.A.", motivo: "dados_defasados",
    detalhe: "Confirmada sociedade de economia mista (não é autarquia); a única página de remuneração encontrada só tem arquivos de 2016-2020; nome do dirigente atual não confirmado nesta rodada" },
  { sigla: "Goiásgás", nome_empresa: "Companhia de Gás de Goiás", motivo: "sem_resultado",
    detalhe: "Nenhum nome de dirigente nem valor de remuneração encontrado nesta rodada de busca" },
];
for (const p of PENDENCIAS) {
  const hash = crypto.createHash("sha256").update(`GO|${p.sigla}|${p.motivo}`).digest("hex");
  await q(`insert into estatais_pendencias (uf,empresa_sigla,empresa_nome,motivo,detalhe,fonte,_hash) values
    ('GO',$1,$2,$3,$4,$5,$6) on conflict (_hash) do nothing`,
    [p.sigla, p.nome_empresa, p.motivo, p.detalhe, FONTE_PORTAIS, hash]);
}

console.log("=== Goiás — individual (nome/valor por empresa) ===");
console.table((await q(`select empresa_sigla, nome, valor, observacao from remuneracao_dirigentes_estatais_go_individual order by empresa_sigla`)).rows);
console.log("=== Goiás — CVM (SANEAGO/CELGPAR) ===");
console.table((await q(`select empresa_sigla, orgao_administracao, ceo_nome, round(valor_medio_anual/12,2) media_mensal from remuneracao_dirigentes_estatais_estaduais where uf='GO' order by empresa_sigla, orgao_administracao`)).rows);
console.log("=== Goiás — pendências ===");
console.table((await q(`select empresa_sigla, motivo from estatais_pendencias where uf='GO'`)).rows);
await db.end();
