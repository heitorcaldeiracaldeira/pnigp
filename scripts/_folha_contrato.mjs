// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _folha_contrato.mjs — o CONTRATO de colunas da folha, num lugar só.
//
// POR QUÊ: `reconstroi_view_folha_brasil.mjs` (executivo) e `fix_view_folha_camara.mjs` (legislativo) mapeiam as
// MESMAS 95 tabelas `folha_servidores_*` para o MESMO contrato de 16 colunas. Enquanto cada um tinha a sua cópia
// do mapa, o conserto de um não alcançava o outro — foi exatamente assim que o contador nacional e a view
// passaram meses discordando ([[pnigp-view-folha-nao-enxerga-coletores]], [[pnigp-costura-departamentos-risco]]).
//
// Aqui moram: o mapa de colunas do contrato, a ordem de preferência do VALOR, as guardas de duplicidade por
// fonte e o reconhecedor de CÂMARA. Quem consome decide o que aplicar.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// ── mapeamento: para cada coluna do contrato, a primeira coluna existente na tabela ────────────────────────────
export const MAPA = {
  orgao: ["orgao", "entidade"],
  secretaria: ["secretaria", "departamento"],
  lotacao_fonte: ["lotacao", "unidade", "lotacao_completa", "organograma", "centro_custo"],
  cargo: ["cargo"],
  funcao: ["funcao", "vinculo", "tipo_contrato", "categoria"],
  situacao: ["situacao"],
  nome: ["nome"],
};

// ⚠️ ordem que decide o que vira `salario_bruto` — e o que se registra em `tipo_folha` quando não é bruto.
// A ORDEM é de preferência: o BRUTO vem antes do líquido, e base por último.
// 🚨 24/ago/2026: `valor_bruto`/`valor_liquido` FALTAVAM e o coletor `ma_zeus` foi recusado em silêncio
//    ("nenhuma coluna de valor"), com 3 câmaras gravadas e invisíveis. É a SEGUNDA vez que a forma com
//    PREFIXO morde — a primeira foi o TcePta ([[pnigp-tcepta-maranhao]]). Conserto na LISTA, nunca na
//    tabela: quem vier depois com esses nomes seria rejeitado igual ([[pnigp-view-folha-nao-enxerga-coletores]]).
export const VALOR = ["bruto", "salario_bruto", "proventos", "valor", "salario", "salario_base",
                      "remuneracao_base", "liquido", "salario_liquido", "valor_bruto", "valor_liquido"];

// ── guardas: filtro extra por fonte, e o rótulo que explica por quê ────────────────────────────────────────────
// 🚨 sem elas a view mente, e mente para MAIS.
export const GUARDAS = {
  sc: { onde: "poder = 'Executivo' and tipo_ente = 'municipio'",
        porque: "TCE-SC traz Legislativo e consórcios na mesma tabela" },
  gpecloud: { onde: "tipo_calc ilike 'vencimento'",
        porque: "uma linha por tipo de cálculo — 13º duplicaria cada pessoa" },
  abo_mg: { onde: "tipo_pagamento ilike 'mensal'",
        porque: "dezembro traz 13º junto do mês" },
  transphd: { onde: "tipo_folha ilike 'folha mensal'",
        porque: "13º, rescisão e folha adicional na mesma tabela" },
  portalfacil: { onde: "(tipo is null or tipo !~* '(13|d[eé]cimo|f[ée]rias|rescis|adiant|complement)')",
        porque: "rótulo do tipo varia por instalação — exclui o que não é mês fechado" },
  // 🚨 21/ago/2026: `folha_servidores_scriptcase` é tabela de CÂMARA (Rio de Janeiro e as demais em `aplicsc.*`).
  //    O anexo automático da view do EXECUTIVO pega toda `folha_servidores_*` nova — sem esta guarda a folha do
  //    legislativo entraria na conta da prefeitura no dia seguinte, sozinha
  //    ([[pnigp-view-folha-nao-enxerga-coletores]] com o sinal trocado: aqui o automático inclui demais).
  scriptcase: { onde: "poder is distinct from 'legislativo'",
        porque: "tabela de CÂMARA — não é folha do executivo municipal" },
  // o portal da IT Soluções serve os DOIS poderes na mesma tabela; `poder` (derivado da entidade) é quem separa
  itsolucoes: { onde: "poder is distinct from 'legislativo'",
        porque: "mesmo portal serve prefeitura e câmara — a câmara sai da conta do executivo" },
};

// ── IDENTIFICAÇÃO da pessoa: tudo o que a fonte informa, sem descartar ─────────────────────────────────────────
// ⭐ 21/ago/2026, a pedido do Heitor: **trazer TODOS os dados informados, inclusive o CPF MASCARADO** — é ele que
//    permite separar HOMÔNIMO entre fontes (nome igual, CPF diferente) e casar a mesma pessoa em dois portais.
//    Nenhuma fonte municipal publica o CPF inteiro; o que existe é máscara parcial, e ela vale muito.
export const MAPA_IDENT = {
  cpf_masc:      ["cpf_masc", "cpf", "cpf_mascarado", "documento"],
  matricula:     ["matricula", "contrato", "id_servidor", "codigo_servidor"],
  data_admissao: ["data_admissao", "admissao", "ingresso"],
  carga_horaria: ["carga_horaria", "horas_semanais", "jornada", "carga"],
};

// ── quem declara a ENTIDADE em cada tabela ─────────────────────────────────────────────────────────────────────
// ⭐ A prova de que a folha é da CÂMARA está no DADO, não no host: a coluna de unidade/lotação/entidade diz
//    "CÂMARA MUNICIPAL", "VEREADORES", "Legislativo" ([[pnigp-prefeitura-ao-lado-da-camara]] — nome de host não
//    é prova nem a favor nem contra). Nunca usar a coluna `nome`: "Câmara" é sobrenome comum no Nordeste.
export const COLS_ENTIDADE = ["entidade", "entidade_nome", "orgao", "unidade_gestora", "unidade", "poder",
                              "tipo_ente", "natureza_orgao", "ente", "lotacao", "lotacao_completa",
                              "secretaria", "organograma", "departamento", "centro_custo"];

// 🚨 `\m…\M` são as bordas de palavra do Postgres — sem elas **Camaragibe/PE, Camaquã/RS e Camapuã/MS** entram
//    como câmara pelo nome do próprio município, que costuma vir dentro da entidade
//    ("PREFEITURA MUNICIPAL DE CAMARAGIBE"). Testado: com borda, esses três não casam.
export const RE_CAMARA = String.raw`\m(c[aâáà]mara|c[aâáà]maras|vereador|vereadores|legislativ[oa])\M`;

// 🚨 O 13º entra na MESMA tabela como se fosse mês ([[pnigp-competencia-mais-cheia-nao-a-recente]]). Férias,
//    rescisão e complementar FICAM: são a remuneração daquele período — a régua do cidadesmg e do Ágili Blue.
export const RE_DECIMO = "13.{0,3}sal|d[ée]cimo.{0,3}terceiro|13o|13º";

// expressão SQL que concatena, com prefixo de tabela, as colunas de entidade existentes
// ═══ 22/ago/2026 — COLUNA DE ENTE MANDA SOBRE COLUNA DE SETOR ═══════════════════════════════════════════════
// 🚨 A evidência concatenava TUDO e aceitava a linha se QUALQUER pedaço dissesse "câmara". Isso deixava entrar:
//    · escola e posto batizados com nome de vereador — "C.E.M. Vereador Santa" (1.218 linhas em Balneário
//      Camboriú), "CEI Vereador Eloi Camilo da Costa" (667 em Itajaí), "Estratégia de Saúde da Família
//      Vereador Augusto Cesar Viana" — todos servidores da PREFEITURA;
//    · e "EM Dom Jaime De Barros Camara" (759 linhas em Joinville), onde Câmara é SOBRENOME;
//    · em Naque/MG, 487 pessoas da prefeitura, porque `unidade` dizia "Câmara Municipal" enquanto `entidade`
//      dizia "Prefeitura Municipal de Naque" — e a câmara de verdade tem 26 ([[pnigp-guarda-poder-volume-rais]]).
//
// ⭐ A régua: quem nomeia o ENTE (entidade, órgão, unidade gestora, poder) decide; quem nomeia o SETOR dentro
//    do ente (lotação, secretaria, departamento) só é aceito quando o ente NÃO se declara prefeitura.
//    `unidade` é ambígua — é setor quando a fonte tem outra coluna de ente, e é o próprio ente quando é a única.
export const COLS_ENTE = ["entidade", "entidade_nome", "orgao", "unidade_gestora", "poder", "tipo_ente",
                          "natureza_orgao", "ente"];
export const COLS_SETOR = ["unidade", "lotacao", "lotacao_completa", "secretaria", "organograma",
                           "departamento", "centro_custo"];
export const RE_PREFEITURA = String.raw`\m(prefeitura|munic[ií]pio)\M`;

export function exprEntidade(cols, pref = "t.") {
  const un = COLS_ENTIDADE.filter((c) => cols.has(c));
  if (!un.length) return null;
  const j = (l) => l.map((c) => `coalesce(${pref}${c}::text,'')`).join(" || ' | ' || ");
  const ente = COLS_ENTE.filter((c) => cols.has(c));
  const setor = COLS_SETOR.filter((c) => cols.has(c));
  // `unidade` volta a valer como ENTE quando a fonte não tem nenhuma outra (publicsoft, pronimgrade, scpicsv)
  if (!ente.length && setor[0] === "unidade") { ente.push(setor.shift()); }
  // a evidência gravada segue sendo TUDO, na ordem de sempre — quem muda é só o predicado
  return { expr: j(un), colunas: un, ente: ente.length ? j(ente) : null, setor: setor.length ? j(setor) : null };
}

// o predicado do poder legislativo, com a hierarquia ente > setor
export function condCamara(ent, temPoder) {
  const base = ent.ente && ent.setor
    ? `((${ent.ente}) ~* '${RE_CAMARA}' or ((${ent.setor}) ~* '${RE_CAMARA}' and (${ent.ente}) !~* '${RE_PREFEITURA}'))`
    : `(${ent.expr}) ~* '${RE_CAMARA}'`;
  return temPoder ? `(poder ~* 'legislativ' or ${base})` : base;
}

// ── mapa FIXO por coletor: as colunas que a mão ajustou, coletor a coletor ─────────────────────────────────────
// Cada linha: [tabela, orgao, secretaria, lotacao, cargo, funcao, situacao, bruto, tipo_folha].
// 🚨 Vale mais que o mapa genérico: aqui está escrito que o bruto do IPM é `provento`, o do GovBR é
//    `vencimentos_totais` e o do TCM-BA é a SOMA de base+vantagens+gratificação. Quem cair no genérico pega
//    `liquido` e mente o salário ([[pnigp-duas-telas-de-folha-liquido-e-bruto]]).
export const MAPA_FIXO = [
  //  tabela              orgao              secretaria     lotacao                        cargo    funcao                        situacao       bruto                       tipo_folha
  ["abase",            "entidade",        "secretaria",  null,                          "cargo", "funcao",                     "situacao",    "valor",                    null],
  // apitransp: api.transparencia.{slug}.{uf}.gov.br — `proventos` e o BRUTO, nunca `liquido`
  ["apitransp",        "orgao",           "secretaria",  null,                          "cargo", "vinculo",                    "situacao",    "proventos",                null],
  // folhamensal: portal proprio transparencia.{slug}.{uf}.gov.br — `bruto` e o Sal. Bruto, nunca o liquido
  ["folhamensal",      "entidade",        "secretaria",  null,                          "cargo", "vinculo",                    null,          "bruto",                    null],
  // 7focus: `proventos` é o BRUTO; `salario_base` é o vencimento base — não confundir ([[pnigp-7focus-folha-crack]])
  ["7focus",           "orgao",           "secretaria",  null,                          "cargo", "vinculo",                    null,          "proventos",                null],
  // ⭐ transpcidadao (Média Sorocabana/SP, 18/ago): `salario` guarda os PROVENTOS do diálogo de detalhe —
  //    `salario_base` é o vencimento e `liquido` já vem descontado. A "Seção" do diálogo é a secretaria.
  //    Ver [[pnigp-transpcidadao-media-sorocabana]].
  ["transpcidadao",    "entidade",        "secretaria",  null,                          "cargo", "coalesce(vinculo,tipo_contrato)", null,     "salario",                  "tipo_folha"],
  // ⭐ genexus_wwp (18/ago): GeneXus WorkWithPlus auto-hospedado em `transparencia.{slug}.{uf}.gov.br`.
  //    `organograma` é a secretaria e `centro_custo` a lotação fina; `funcao` faz o papel de CARGO aqui —
  //    o portal não tem coluna de cargo separada. `salario_bruto`, nunca o líquido.
  //    Ver [[pnigp-genexus-wwp-transparencia-slug]].
  ["genexus_wwp",      "orgao",           "organograma", "centro_custo",                "funcao", "vinculo",                   null,          "salario_bruto",            null],
  // ⭐ eddydata (18/ago): API REST do portal "Transparência Pública". `departamento` é a lotação/secretaria e
  //    `salario_bruto` é o `valor_bruto` do holerite — nunca o líquido. Ver [[pnigp-eddydata-api-holerites]].
  ["eddydata",         "orgao",           "departamento", null,                         "cargo", "regime_juridico",            "situacao",    "salario_bruto",            null],
  // ── coletores que estavam FORA da view (achados em 16/ago na 2ª conferência) ──────────────────────────────
  // 🚨 A dívida reapareceu depois de corrigida: 11 tabelas novas nasceram sem entrar aqui. Entre elas,
  //    CAMPO GRANDE com 40 mil linhas — que eu tinha reportado como capital SEM folha.
  ["agili",            null,              "secretaria",  null,                          "cargo", "investidura",                "situacao",    "bruto",                    null],
  ["amaam",            "entidade",        "secretaria",  null,                          "cargo", "vinculo",                    null,          "bruto",                    null],
  ["amanc",            "entidade",        "secretaria",  null,                          "cargo", null,                         null,          "bruto",                    null],
  ["campogrande",      null,              "secretaria",  null,                          "cargo", "coalesce(funcao, tipo_admissao)", "situacao", "bruto",               null],
  // ⚠️ Contass publica cadastro SEM valor — entra com salário nulo, não com zero
  ["contass",          null,              "secretaria",  null,                          "cargo", null,                         "situacao",    null,                       null],
  ["quality",          "entidade",        "secretaria",  "departamento",                "cargo", "vinculo",                    "situacao",    "bruto",                    null],
  // RHsys Portal Transparência — bloco novo (17/ago), ver [[pnigp-rhsys-portal-transparencia]]
  ["rhsys",            "orgao",           "orgao",       null,                          "cargo", "vinculo",                    "situacao",    "bruto",                    null],
  ["siplanweb",        null,              "secretaria",  "local_trabalho",              "cargo", "vinculo",                    null,          "bruto",                    "tipo_calc"],
  ["spapublico",       null,              "secretaria",  "local_trabalho",              "cargo", "coalesce(funcao,vinculo)",   "situacao",    "bruto",                    null],
  // ⚠️ TCE-MT: competência é só o ANO (2025) — folha_comp_norm devolve null e `competencia_origem` preserva
  ["tcemt",            "entidade",        "secretaria",  null,                          "cargo", "coalesce(vinculo,regime)",   "situacao",    "bruto",                    null],
  // ⭐ TCE-PB (dados abertos, 17/ago): os 223 municípios da PB, série mensal 202601–202607, com nome, valor e
  //    unidade gestora. A UG entra como `orgao` E como `secretaria` — o CSV não separa lotação de entidade.
  //    Ver [[pnigp-tcepb-dados-abertos-servidores]].
  ["tcepb",            "unidade_gestora", "secretaria",  null,                          "cargo", "vinculo",                    null,          "bruto",                    null],
  // ⭐ Ágili Blue (RN, 17/ago): API com os 5 campos e a secretaria em `estrutAdministrativa`.
  //    O FILTRO acima deixa só a folha Mensal. Ver [[pnigp-agili-blue-api-uc]].
  ["agiliblue",        "unidade_gestora", "secretaria",  null,                          "cargo", "forma_ingresso",             "situacao",    "bruto",                    "tipo_calculo"],
  // ⭐ DataPublic (RN, 17/ago): ASP.NET+DevExpress em IP:porta. A competência é o EXERCÍCIO (ano), guardada em
  //    `referencia`; o tipo de folha e o poder vêm da referência escolhida. Ver [[pnigp-datapublic-escolheug]].
  ["datapublic",       "unidade_gestora", null,          null,                          "cargo", null,                         null,          "bruto",                    "tipo_folha"],
  // ⭐ S&S Informática (CE, 17/ago): a folha vem de PDF gerado pela tela "Pessoal Folha". Traz secretaria,
  //    cargo, natureza e VENCIMENTO. O FILTRO abaixo deixa só o EXECUTIVO — a mesma base tem câmaras,
  //    institutos de previdência e consórcios. Ver [[pnigp-ss-informatica-catalogo-sem-dado]].
  ["ss",               "entidade",        "secretaria",  null,                          "cargo", "natureza",                   null,          "vencimento",               null],
  // ⭐ TC Gestão Pública (AL, 18/ago): DevExpress com export CSV em `/Folha`. `bruto` = salário + vantagens
  //    (o CSV separa as duas colunas). Ver [[pnigp-tcgestao-markasystem-agora]].
  ["tcgestao",         "orgao",           null,          null,                          "cargo", "vinculo",                    null,          "bruto",                    null],
  // ⭐ transpal (AL, 18/ago): portal próprio `transparencia.{mun}.al.gov.br/servidores` com CSV direto em
  //    `servidorescsv.php?ano=&mes=`. O CSV não tem cabeçalho — lido por posição.
  ["transpal",         "orgao",           null,          null,                          "cargo", null,                         null,          "bruto",                    null],
  // ⭐ Top Solutions (RN, 18/ago): API JSON `pm{slug}{uf}.apitransparencia.topsolutionsrn.com.br`.
  //    `secretaria` vem de `orgao`; `bruto` = vlrRemuneracaoBruta (NUNCA vlrRemuAposDescObrig, que é líquido).
  //    51 municípios do RN — ver [[pnigp-topsolutions-host-derivavel]].
  ["topsolutions",     null,              "secretaria",  null,                          "cargo", "coalesce(funcao,vinculo)",   "situacao",    "bruto",                    "tipo_folha"],
  ["admrh",            null,              "secretaria",  null,                          "cargo", "vinculo",                    "case when pensionista then 'Pensionista' when inativo then 'Inativo' else 'Ativo' end", "bruto", null],
  ["agape",            "entidade",        "secretaria",  "lotacao",                     "cargo", "regime",                     "situacao",    "bruto",                    null],
  ["aspec",            "orgao",           "secretaria",  "setor",                       "cargo", "funcao",                     null,          "provento",                 null],
  ["betha",            "entidade",        "secretaria",  "organograma",                 "cargo", "vinculo",                    null,          "bruto",                    "efetivo_em_comissao"],
  // bsit: `departamento` guarda o LOCAL_TRABALHO do CSV, que é a secretaria. `salario` é o PROVENTO (bruto) —
  // a tela mostra "Proventos" e "Vencimento Base" lado a lado e o CSV exporta o primeiro; não é líquido.
  ["bsit",             "entidade",        "departamento", null,                         "cargo", "vinculo",                    null,          "salario",                  "tipo_folha"],
  ["capital",          null,              "secretaria",  "lotacao",                     "cargo", "vinculo",                    null,          "bruto",                    null],
  // ⭐ Campinas (18/ago): portal próprio que só libera a folha depois da IDENTIFICAÇÃO do consulente
  //    ([[pnigp-portal-exige-identificacao-consulente]]). `bruto` é o Total Bruto da tela — NÃO `brutoded`,
  //    que já desconta encargo social patronal. `vinculo` = EFETIVO/COMISSIONADO/FUNÇÃO ATIVIDADE.
  ["campinas",         null,              "secretaria",  "lotacao",                     "cargo", "vinculo",                    null,          "bruto",                    null],
  // 🚨 gxrh ESTAVA FORA DA LISTA FIXA e eu só percebi ao vetar o `genexus_wwp` em favor dele: Cajati, Irapuru,
  //    Joanópolis e Monte Mor ficaram com ZERO fonte na view — 10.613 linhas coletadas e invisíveis. É a dívida
  //    de [[pnigp-view-folha-nao-enxerga-coletores]] reaparecendo pela terceira vez. `bruto` é a Rem. Bruta
  //    (nunca `liquido`); `organograma` é a secretaria e `centro_custo` a lotação fina.
  ["gxrh",             "orgao",           "coalesce(secretaria,organograma)", "centro_custo", "cargo", "vinculo", null, "bruto",              null],
  // ⭐ saiio (20/ago): API central `sai2.io.org.br/v3` por trás dos portais SPA de AL. ⚠️ O que o portal publica
  //    é o **SALÁRIO BASE** (`num_valor_salario_base_sa2`), não o bruto com vantagens — a NATUREZA declara isso
  //    em vez de fingir que é bruto ([[pnigp-saiio-api-central-al]]).
  ["saiio",            null,              "lotacao",     null,                          "cargo", "vinculo",                    null,          "bruto",                    null],
  // ⭐ algov (19/ago): portais `transparencia.{slug}.al.gov.br` de Alagoas, em três variantes (lista+detalhe,
  //    DataTables `tables.php` e lista com valor). `bruto` é o BRUTO da folha; a lotação faz as vezes de órgão.
  //    ⚠️ a competência nem sempre é declarada pelo portal — fica NULL em vez de inventada.
  ["algov",            "orgao",           "lotacao",     null,                          "cargo", null,                         null,          "bruto",                    null],
  // ⚠️ a geração ANTIGA do cidadesmg entra na mesma tabela (ingest_folha_cidadesmg_antigo.mjs) e traz `tipo_folha`
  //    — o TXT de dezembro mistura a folha mensal com o 13º da mesma pessoa. O veto deixa só a mensal.
  ["cidadesmg",        null,              "secretaria",  "coalesce(departamento,local_trabalho)", "cargo", "vinculo",          null,          "bruto",                    "tipo_folha"],
  // ⭐ cgmal (18/ago): white-label da Controladoria Geral do Município em `transparencia.{slug}.al.gov.br`.
  //    `proventos` é o TOTAL DE PROVENTOS da tela (o líquido vem em coluna própria e não pode virar salário);
  //    `orgao` faz as vezes de secretaria — é a única lotação que a tela publica.
  //    Ver [[pnigp-cgm-alagoas-dois-endpoints]].
  ["cgmal",            "orgao",           "secretaria",  null,                          "cargo", null,                         null,          "proventos",                null],
  ["citta",            "unidade_gestora", null,          "lotacao",                     "cargo", "regime",                     null,          "valor",                    null],
  ["cr2",              "coalesce(orgao,entidade)", null, "setor",                       "cargo", "vinculo",                    "situacao",    "proventos",                null],
  ["dbseller",         "instituicao",     null,          "lotacao",                     "cargo", "vinculo",                    null,          "bruto",                    null],
  ["elotech",          "entidade",        null,          "coalesce(lotacao,local_trabalho)", "cargo", "vinculo",               "situacao",    "remuneracao",              null],
  // ⚠️ `elotech` é o CADASTRO do exercício (competência só com ano); `elotech_mensal` é a série mensal da ficha.
  //    São o mesmo universo de pessoas vistas de dois jeitos — o campo `fonte` separa; não somar as duas.
  ["elotech_mensal",   null,              null,          "lotacao",                     "cargo", "vinculo",                    "situacao",    "bruto",                    "tipo_folha"],
  ["epublica",         "unidade_gestora", "secretaria",  "local",                       "cargo", "coalesce(funcao,vinculo)",   "situacao",    "vantagens",                "tipo_contratacao"],
  ["equiplano",        "entidade_nome",   "secretaria",  "lotacao",                     "cargo", "funcao_confianca",           "situacao",    "vantagens",                null],
  ["genexus",          null,              "secretaria",  "lotacao",                     "cargo", null,                         null,          "salario_bruto",            "folha_tipo"],
  ["geosiap",          "entidade",        "secretaria",  "lotacao",                     "cargo", "funcao",                     null,          "salario",                  null],
  ["govbr",            null,              "secretaria",  "lotacao",                     "cargo", null,                         null,          "vencimentos_totais",       null],
  ["hardsoft",         null,              null,          "lotacao",                     "cargo", null,                         null,          "proventos",                null],
  ["ipm",              "entidade",        null,          "lotacao",                     "cargo", null,                         null,          "provento",                 null],
  ["layout",           null,              "secretaria",  "departamento",                "cargo", "vinculo",                    "situacao",    "total_proventos",          null],
  ["megasoft",         null,              "departamento", null,                         "cargo", "vinculo",                    "situacao",    "proventos",                "situacao_pagamento"],
  ["municipioonline",  "entidade",        null,          null,                          "cargo", "tipo_cargo",                 null,          "bruto",                    "nivel"],
  ["memory",           "entidade",        null,          null,                          "cargo", "vinculo",                    null,          "remuneracao",              null],
  ["multi24",          "coalesce(entidade,grupo)", null, null,                          "cargo", "tipo",                       null,          "bruto",                    null],
  ["nucleogov",        null,              "departamento", null,                         "cargo", "vinculo",                    "situacao",    "proventos",                "situacao_pagamento"],
  ["pelotas",          null,              "secretaria",  "lotacao",                     "cargo", "regime",                     null,          "bruto",                    "plano"],
  ["pjf",              "orgao",           "secretaria",  null,                          "cargo", "coalesce(funcao,vinculo)",   null,          "bruto",                    null],
  ["portaltp",         "unidade_gestora", "secretaria",  "coalesce(divisao,secao,local)", "cargo", "regime",                   "situacao",    "bruto",                    null],
  ["publicsoft",       null,              "secretaria",  "unidade",                     "cargo", "regime",                     null,          "vantagens",                null],
  ["rpm",              null,              "secretaria",  "lotacao",                     "cargo", "coalesce(funcao,vinculo)",   null,          "vantagens",                null],
  ["scpi",             null,              "secretaria",  "unidade",                     "cargo", "vinculo",                    null,          "proventos",                "referencia"],
  // ⚠️ siapapi (SIAP auto-hospedado em `siap.{slug}.{uf}.gov.br`): publica NOME, CARGO e LOTAÇÃO e **não publica
  //    remuneração** — `salario_bruto` fica NULL de propósito (a regra da view: onde a fonte não tem, é nulo,
  //    nunca estimado). Sem ela, 9 municípios coletados ficavam invisíveis (Jacareí, Caraguatatuba,
  //    Pindamonhangaba, Lorena, Nilópolis…) — [[pnigp-view-folha-nao-enxerga-coletores]].
  ["siapapi",          "entidade",        "secretaria",  "lotacao",                     "cargo", null,                         null,          null,                       null],
  ["sinsoft",          null,              null,          "setor",                       "cargo", null,                         null,          "bruto",                    null],
  ["smarapd",          null,              "secretaria",  null,                          "cargo", null,                         null,          "total_vencimentos",        "tipo_folha"],
  ["sys523",           "entidade",        null,          "lotacao",                     "cargo", "regime",                     null,          "provento",                 null],
  ["tche",             "ente",            "departamento", null,                         "cargo", "vinculo",                    null,          "bruto",                    "tipo_folha"],
  // 🚨 TCM-BA não publica o bruto: publica as parcelas. Conferido em 3 amostras, base+vantagens+gratificação
  //    fica acima do líquido, como tem de ser. O 13º fica FORA — inflaria o mês.
  ["tcmba",            "entidade",        null,          null,                          "cargo", "regime",                     "situacao",
    "nullif(coalesce(salario_base,0)+coalesce(vantagens,0)+coalesce(gratificacao,0),0)", null],
  ["tenosoft",         "entidade",        "secretaria",  "lotacao",                     "cargo", null,                         null,          "bruto",                    "tipo_folha"],
  ["transparenciaweb", "unidade_gestora", "secretaria",  null,                          "cargo", "quadro",                     null,          "bruto",                    null],
];

// competência: quase todas em `competencia`; três guardam em outra coluna
export const COMP = { elotech: "exercicio", scpi: "referencia", datapublic: "referencia" };

export const NATUREZA = {
  govbr: `case when nome is null or btrim(nome) = '' then 'folha agregada por cargo' else 'folha oficial' end`,
  // ⚖️ O RPPS do TCE-MT (105 municípios, 15.788 pessoas) é folha pública municipal de INATIVOS — não é a folha
  //    do executivo e também não é entidade alheia como a câmara. Em vez de excluir ou de somar calado, declara:
  //    quem quiser a folha ativa filtra por natureza ([[pnigp-tcemt-soma-entidades-no-municipio]]).
  tcemt: `case when entidade ~* 'previd|instituto|fundo' then 'folha de inativos (RPPS)' else 'folha oficial' end`,
  // ⚠️ o sai2.io.org.br só publica o salário BASE por servidor — declarar é mais honesto que chamar de bruto
  saiio: `'folha oficial (salario base)'`,
};
