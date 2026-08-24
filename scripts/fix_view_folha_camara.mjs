// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// fix_view_folha_camara.mjs — a folha das CÂMARAS MUNICIPAIS, com o mesmo contrato da folha das prefeituras.
//
// POR QUÊ: a folha do legislativo já estava no banco — dezenas de coletores multi-entidade e 5 tribunais de
// contas a trazem junto com a do executivo — mas era tratada só como CONTAMINAÇÃO: vetada da view nacional
// ([[pnigp-contaminacao-camara-e-sempre-pequena]], [[pnigp-radar-mapeou-a-camara-causa-nacional]]) e invisível
// como dado próprio. Vetar da conta da prefeitura continua certo; jogar fora, não.
//
// ⭐ O contrato e o MAPA são os MESMOS da folha das prefeituras (`_folha_contrato.mjs`): o mapa fixo por coletor
// (bruto do IPM = `provento`, do GovBR = `vencimentos_totais`, do TCM-BA = base+vantagens+gratificação) manda, e
// o genérico só cobre quem não está nele. Duas cópias do mapa divergem — foi assim que a view e o contador
// nacional passaram meses discordando ([[pnigp-view-folha-nao-enxerga-coletores]]).
//
// A coluna `camara` grava a EVIDÊNCIA: o texto da entidade que provou o poder legislativo — veredito sem
// evidência esconde o erro ([[pnigp-rotulo-da-coluna-de-dinheiro-varia]]).
//
// 🚨 A prova é o DADO, nunca o host: `scpi-camara.rancharia.sp.gov.br` é a PREFEITURA, e portal sem "camara" no
//    nome serve câmara ([[pnigp-prefeitura-ao-lado-da-camara]]).
// 🚨 Bordas de palavra no regex: sem elas Camaragibe/PE, Camaquã/RS e Camapuã/MS entram como câmara pelo nome
//    do próprio município, que costuma vir dentro da entidade.
// ⚠️ `rais` fica FORA da união (é censitária e sem nome) — ela é o DENOMINADOR, natureza 1066 "Órgão Público do
//    Poder Legislativo Municipal": 193.767 vínculos ativos em 5.512 municípios
//    ([[pnigp-rais-ativo3112-e-o-denominador-do-mes]]).
//
// Uso: node scripts/fix_view_folha_camara.mjs          (dry-run: o que entra e por qual coluna)
//      APLICAR=1 node scripts/fix_view_folha_camara.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { MAPA, MAPA_FIXO, MAPA_IDENT, COMP, VALOR, GUARDAS, RE_CAMARA, RE_DECIMO, exprEntidade, condCamara } from "./_folha_contrato.mjs";

const FIXO = Object.fromEntries(MAPA_FIXO.map((l) => [l[0], l]));
const N = (x) => x || "null::text";
const db = pool();
const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";

// `rais` é censitária (sem nome, sem entidade) e serve de denominador, não de folha
const FORA = new Set(["rais"]);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%' order by 1`)).rows.map((r) => r.t);

const blocos = [], relatorio = [], recusados = [];
for (const t of tabs) {
  const fonte = t.replace("folha_servidores_", "");
  if (FORA.has(fonte)) continue;
  const cols = new Set((await q(`select column_name n from information_schema.columns where table_name=$1`, [t])).rows.map((r) => r.n));
  const n = (await q(`select count(*)::int x from ${t}`)).rows[0].x;
  if (!n) continue;
  if (!cols.has("cod_ibge") || ["pe", "ma"].includes(fonte)) {
    recusados.push({ fonte, linhas: n, situacao: "bloco próprio (o município vem por NOME)" }); continue;
  }
  const ent = exprEntidade(cols, "");
  if (!ent) { recusados.push({ fonte, linhas: n, situacao: "🚨 sem coluna de entidade — não dá para provar o poder" }); continue; }

  // ⭐ o mapa FIXO manda; o genérico só cobre quem não está nele
  const fx = FIXO[fonte];
  const pega = (lista) => lista.find((c) => cols.has(c)) ?? null;
  const cval = fx ? fx[7] : pega(VALOR);
  const ccomp = fx ? (COMP[fonte] || "competencia")
    : cols.has("competencia") ? "competencia"
    : cols.has("anomes") ? "anomes"
    : cols.has("referencia") ? "referencia"
    : cols.has("exercicio") ? "exercicio" : null;
  const campo = (alvo, i) => (fx ? N(fx[i]) : N(pega(MAPA[alvo])));
  // ⭐ IDENTIFICAÇÃO: tudo o que a fonte informa vai junto — CPF mascarado, matrícula, admissão, carga horária.
  //    O CPF mascarado é o que separa HOMÔNIMO entre fontes; descartá-lo era jogar fora a única chave de pessoa
  //    que os portais publicam (a pedido do Heitor, 21/ago/2026).
  const ident = (alvo) => { const c = pega(MAPA_IDENT[alvo]); return c ? `${c}::text` : "null::text"; };

  // ── o predicado do poder: coluna `poder` explícita quando existe; senão, a entidade declarada ───────────────
  // ⭐ 22/ago: a coluna que nomeia o ENTE manda sobre a que nomeia o SETOR — sem isso entram escolas e postos
  //    batizados com nome de vereador, e a prefeitura de Naque entrava como 487 vereadores.
  const cond = condCamara(ent, cols.has("poder"));
  // guardas de duplicidade da fonte (13º, tipo de cálculo). A do `sc` é do EXECUTIVO — aqui vale o inverso, e o
  // que sobra dela é só "consórcio não é câmara".
  // 🚨 GUARDA DE PODER NÃO VALE AQUI — e isso zerou duas fontes inteiras. As guardas de `scriptcase` e
  //    `itsolucoes` dizem `poder is distinct from 'legislativo'`: elas existem para tirar a câmara da view do
  //    EXECUTIVO. Aplicadas na camada de câmara, tiram justamente o que ela deve mostrar (o Rio e as câmaras de
  //    PE sumiram sem erro nenhum). Aqui só entram as guardas de DUPLICIDADE (13º, tipo de cálculo).
  const gBruta = fonte === "sc" ? null : GUARDAS[fonte];
  const g = gBruta && /\bpoder\b/i.test(gBruta.onde) ? null : gBruta;
  const gcons = fonte === "sc" ? "tipo_ente = 'municipio'" : null;
  // 🚨 o 13º entra na mesma tabela como se fosse mês. Férias, rescisão e complementar FICAM.
  const cdec = ["tipo_folha", "referencia", "tipo_calculo", "tipo_pagamento", "tipo_calc", "tipo"].filter((c) => cols.has(c));
  const dec = cdec.length ? cdec.map((c) => `coalesce(${c}::text,'') !~* '${RE_DECIMO}'`).join(" and ") : null;
  const onde = [cond, g?.onde, gcons, dec].filter(Boolean).join("\n    and ");

  const uf = cols.has("uf") ? `case when uf ~ '^[A-Za-z]{2}$' then upper(uf) else uf_por_ibge(cod_ibge) end` : `uf_por_ibge(cod_ibge)`;
  const rotulo = fx ? N(fx[8]) : (!cval ? "'sem coluna de valor'::text"
    : cval === "bruto" ? (cols.has("tipo_folha") ? "tipo_folha" : "null::text") : `'valor = ${cval}'::text`);

  blocos.push(`select '${fonte}'::text as fonte,
    ${uf} as uf,
    ${ccomp ? `folha_comp_norm(${ccomp}::text, ${cols.has("_coletado_em") ? "_coletado_em" : "null"})` : "null::text"} as competencia,
    cod_ibge, ${cols.has("municipio") ? "municipio" : "null::text as municipio"},
    ${campo("orgao", 1)} as orgao, ${campo("secretaria", 2)} as secretaria, ${campo("lotacao_fonte", 3)} as lotacao_fonte,
    ${campo("cargo", 4)} as cargo, ${campo("funcao", 5)} as funcao, ${campo("situacao", 6)} as situacao,
    ${cols.has("nome") ? "nome" : "null::text"} as nome,
    ${cval ? cval : "null"}::numeric as salario_bruto, ${rotulo} as tipo_folha,
    left(${ent.expr}, 120) as camara,
    ${ident("cpf_masc")} as cpf_masc, cpf_masc_visivel(${ident("cpf_masc")}) as cpf_visivel,
    cpf_masc_padrao(${ident("cpf_masc")}) as cpf_padrao,
    ${ident("matricula")} as matricula, ${ident("data_admissao")} as data_admissao,
    ${ident("carga_horaria")} as carga_horaria
  from ${t}
  where ${onde}`);
  relatorio.push({ fonte, linhas: n, valor: cval || "—", mapa: fx ? "fixo" : "generico",
                   entidade: ent.colunas.join("+"), poder: cols.has("poder") ? "coluna poder" : "entidade" });
}

// ── fontes fora do padrão `folha_servidores_*` ─────────────────────────────────────────────────────────────────
// SC: o Farol do TCE-SC é NOMINAL, mensal e declara o poder — a melhor fonte de câmara do país
blocos.push(`select 'farol-tcesc'::text, 'SC'::text, f.anomes,
    coalesce(mb7.cod_ibge, mb6.cod_ibge), f.municipio, f.orgao, f.area, f.lotacao_origem,
    f.cargo, f.funcao, f.situacao, f.nome, f.bruto, null::text,
    left(coalesce(f.orgao,'') || ' | ' || coalesce(f.poder,''), 120),
    -- o Farol não publica CPF nem matrícula: aqui a chave de pessoa é nome + órgão + competência
    null::text, null::text, null::text, null::text, null::text, null::text
  from vw_folha_municipal_sc f
  left join municipios_br mb6 on mb6.cod_ibge6 = f.cod_ibge and length(f.cod_ibge) = 6
  left join municipios_br mb7 on mb7.cod_ibge  = f.cod_ibge and length(f.cod_ibge) = 7
  where f.poder ~* 'legislativ'`);
// PE: o TCE-PE declara a natureza do órgão e identifica o município por NOME; NÃO publica remuneração
blocos.push(`select 'tcepe'::text, 'PE'::text,
    folha_comp_norm(coalesce(p.ano_remessa,'') || lpad(coalesce(p.mes_remessa,''),2,'0')),
    mb.cod_ibge, p.municipio, p.uj_nome, p.uj_nome, p.uj_nome, p.cargo, p.tipo_vinculo,
    case when p.data_afastamento is null or p.data_afastamento = '' then 'Ativo' else 'Afastado' end,
    p.nome, null::numeric, 'TCE-PE não publica remuneração'::text,
    left(coalesce(p.natureza_orgao,'') || ' | ' || coalesce(p.uj_nome,''), 120),
    -- ⭐ o TCE-PE publica CPF MASCARADO, matrícula e carga horária — nunca tinham sido expostos
    p.cpf_masc, cpf_masc_visivel(p.cpf_masc), cpf_masc_padrao(p.cpf_masc),
    p.matricula, coalesce(p.data_admissao, p.data_ingresso), p.carga_horaria
  from folha_servidores_pe p
  left join municipios_br mb on mb.uf = 'PE' and nome_chave(mb.nome) = nome_chave(p.municipio)
  where (coalesce(p.natureza_orgao,'') || ' | ' || coalesce(p.uj_nome,'')) ~* '${RE_CAMARA}'`);
// MA: o TcePta identifica o ente pelo NOME e declara o poder; não publica o nome do servidor (CPF mascarado)
blocos.push(`select 'tcema'::text, 'MA'::text, m.ano::text || lpad(m.mes::text,2,'0'),
    mb.cod_ibge, m.ente, m.unidade, m.unidade, m.unidade, m.cargo, coalesce(m.natureza_cargo, m.regime),
    case when m.data_exclusao is null or m.data_exclusao = 'null' then 'Ativo' else 'Desligado' end,
    null::text, m.valor_bruto, coalesce(m.tipo_folha, 'TCE-MA não publica o nome'),
    left(coalesce(m.poder,'') || ' | ' || coalesce(m.ente,'') || ' | ' || coalesce(m.unidade,''), 120),
    -- ⭐⭐ o TcePta NÃO publica o nome, mas PUBLICA o CPF mascarado: no Maranhão é ele a única chave de pessoa,
    --    e é o que permite acompanhar o mesmo servidor mês a mês e cruzar com outra base
    m.cpf_masc, cpf_masc_visivel(m.cpf_masc), cpf_masc_padrao(m.cpf_masc),
    m.matricula, m.data_exercicio, m.carga_horaria
  from folha_servidores_ma m
  left join municipios_br mb on mb.uf = 'MA'
    and nome_chave(regexp_replace(mb.nome, ' MA$', '')) =
        nome_chave(regexp_replace(m.ente, '^(c[aâ]mara municipal de |prefeitura municipal de |munic[ií]pio de )', '', 'i'))
  where (coalesce(m.poder,'') || ' | ' || coalesce(m.ente,'') || ' | ' || coalesce(m.unidade,'')) ~* '${RE_CAMARA}'
    and coalesce(m.tipo_folha,'') !~* '${RE_DECIMO}'`);

if (recusados.length) console.table(recusados);
console.log(`${blocos.length} fontes na camada de câmaras (${relatorio.length} tabelas + 3 blocos próprios)`);

if (!APLICAR) {
  console.table(relatorio);
  console.log("\n(dry-run — APLICAR=1 para criar a view)");
  await db.end();
  process.exit(0);
}

await q(`drop view if exists vw_folha_camara_brasil cascade`);
await q(`create view vw_folha_camara_brasil (fonte, uf, competencia, cod_ibge, municipio, orgao, secretaria,
  lotacao_fonte, cargo, funcao, situacao, nome, salario_bruto, tipo_folha, camara,
  cpf_masc, cpf_visivel, cpf_padrao, matricula, data_admissao, carga_horaria) as\n${blocos.join("\nunion all\n")}`);
const r = (await q(`select count(*)::int linhas, count(distinct cod_ibge)::int munic,
   count(*) filter (where nome is not null and nome <> '')::int com_nome,
   count(*) filter (where salario_bruto > 0)::int com_valor from vw_folha_camara_brasil`)).rows[0];
console.log(`✔ vw_folha_camara_brasil: ${r.linhas} linhas · ${r.munic} municípios · ${r.com_nome} com nome · ${r.com_valor} com valor`);
await db.end();
