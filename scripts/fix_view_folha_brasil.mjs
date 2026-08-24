// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// fix_view_folha_brasil.mjs — reconstrói `vw_folha_municipal_brasil` com TODOS os coletores.
//
// POR QUÊ: a view unia 6 fontes enquanto 40 tabelas `folha_servidores_*` já estavam cheias. Medido em 16/ago/2026:
// 2.310 municípios coletados, 485 visíveis. As 22 capitais, o TCM-BA, GovBR, IPM, PortalTP, Megasoft, Elotech e
// mais 20 coletores existiam no banco e não existiam no produto.
//
// A assinatura das 14 colunas originais é PRESERVADA — vw_folha_cobertura, vw_folha_municipio_qualidade e
// vw_folha_oficial dependem dela. As duas colunas novas entram no FIM, que é o que CREATE OR REPLACE aceita.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { FILTRO_FOLHA } from "./_folha_filtros.mjs";
import { MAPA_FIXO as M, COMP, NATUREZA } from "./_folha_contrato.mjs";
const db = pool();
const q = withRetry(db);

// ── 1. normalizador de competência ───────────────────────────────────────────────────────────────────────────────
// 🚨 Sete formatos nas 40 tabelas. O que mais engana: `072026` (MMYYYY, Juiz de Fora) casa com o mesmo regex de
//    `202607` (YYYYMM) — só o valor dos 2 primeiros dígitos separa. E o Betha guarda os DOIS formatos na mesma
//    coluna (`2021-10` e `01-2026`): a view antiga fazia replace('-','') nos dois e produzia `012026`.
await q(`create or replace function folha_comp_norm(txt text, ref timestamptz default null)
returns text language plpgsql immutable as $fn$
declare
  t text := trim(coalesce(txt, ''));
  meses text[] := array['janeiro','fevereiro','marco','abril','maio','junho',
                        'julho','agosto','setembro','outubro','novembro','dezembro'];
  mm text; i int;
begin
  if t = '' then return null; end if;
  if t ~ '^(19|20)[0-9]{4}$' then return t; end if;                                    -- YYYYMM
  if t ~ '^(0[1-9]|1[0-2])(19|20)[0-9]{2}$' then return substr(t,3,4)||substr(t,1,2); end if;  -- MMYYYY
  if t ~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' then return substr(t,1,4)||substr(t,6,2); end if;
  if t ~ '^(0[1-9]|1[0-2])-(19|20)[0-9]{2}$' then return substr(t,4,4)||substr(t,1,2); end if;
  for i in 1..12 loop                                                                  -- 'Julho/2026', 'Folha Mensal - Julho'
    if lower(translate(t,'áàâãéêíóôõúç','aaaaeeiooouc')) ~ ('(^|[^a-z])'||meses[i]||'([^a-z]|$)') then
      mm := lpad(i::text,2,'0'); exit; end if;
  end loop;
  if mm is null and t ~ '^(0?[1-9]|1[0-2])$' then mm := lpad(t,2,'0'); end if;          -- só o número do mês
  if mm is null then return null; end if;
  if t ~ '(19|20)[0-9]{2}' then return (regexp_match(t,'((19|20)[0-9]{2})'))[1]||mm; end if;
  -- sem ano no texto: cai para a data da COLETA.
  -- ⚠️ é INFERÊNCIA declarada: mês posterior ao da coleta só pode ser do ano anterior.
  if ref is null then return null; end if;
  if mm::int <= extract(month from ref)::int then return extract(year from ref)::int::text||mm;
  else return (extract(year from ref)::int - 1)::text||mm; end if;
end $fn$`);

// UF a partir do IBGE — a RAIS e o e-Sfinge não trazem UF, e sem ela a view não agrupa por estado
await q(`create or replace function uf_por_ibge(cod text) returns text language sql immutable as $$
  select case left(cod,2)
    when '11' then 'RO' when '12' then 'AC' when '13' then 'AM' when '14' then 'RR' when '15' then 'PA'
    when '16' then 'AP' when '17' then 'TO' when '21' then 'MA' when '22' then 'PI' when '23' then 'CE'
    when '24' then 'RN' when '25' then 'PB' when '26' then 'PE' when '27' then 'AL' when '28' then 'SE'
    when '29' then 'BA' when '31' then 'MG' when '32' then 'ES' when '33' then 'RJ' when '35' then 'SP'
    when '41' then 'PR' when '42' then 'SC' when '43' then 'RS' when '50' then 'MS' when '51' then 'MT'
    when '52' then 'GO' when '53' then 'DF' else null end $$`);
// chave de nome para casar ente↔município (o TCE-MA identifica o ente só pelo nome)
await q(`create or replace function nome_chave(t text) returns text language sql immutable as $$
  select lower(trim(translate(coalesce(t,''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                                              'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))) $$`);
console.log("→ folha_comp_norm, uf_por_ibge e nome_chave criadas");

// ── 2. mapa: uma linha por coletor ──────────────────────────────────────────────────────────────────────────────
// 🚨 A regra do `bruto` é a que mais erra: cada fornecedor batiza a mesma coisa de um jeito (provento, vantagens,
//    vencimentos_totais, remuneracao, valor…). Nunca cair no LÍQUIDO — ele já vem descontado.
// 🚨 UF POR EXTENSO. Cinco coletores gravam 'Goiás', 'São Paulo', 'Minas Gerais'… no lugar da sigla
//    (~190 mil linhas): `coalesce(uf, …)` aceitava o texto e a view ganhava estados FANTASMA, que nenhum
//    agrupamento por UF casa. Só a sigla de 2 letras passa; o resto é derivado do IBGE, que nunca mente.
const N = (x) => x || "null::text";
// ⭐ 21/ago/2026: o mapa M, o COMP e o NATUREZA mudaram-se para `_folha_contrato.mjs` (M virou MAPA_FIXO).
//    A camada das CÂMARAS (fix_view_folha_camara.mjs) mapeia as MESMAS tabelas: duas cópias do mapa divergem, e
//    é assim que o bruto do IPM (`provento`) vira `liquido` num consumidor e não no outro.

// ── FORA da view DE PROPÓSITO (conferido em 18/ago/2026) ────────────────────────────────────────────────────────
// A rotina "tabela de coletor × view" ([[pnigp-view-folha-nao-enxerga-coletores]]) aponta estas três; nenhuma é
// dívida — não re-incluir sem medir de novo:
//   folha_servidores_tcidadao    11 municípios/4.319 linhas, TODOS já cobertos por `transpcidadao` (22 munis) —
//                                é a mesma fonte numa extração anterior, sem salário. Somaria pessoa em dobro.
//   folha_servidores_betha_egov  0 linhas (coletor iniciado e não rodado)
//   (folha_servidores_campinas saiu desta lista em 18/ago: o coletor identificado rodou, 16.023 servidores)

// competência: quase todas em `competencia`; três guardam em outra coluna

// 🚨 FILTRO por fonte (câmara coletada como se fosse prefeitura, 13º somado com o mês, poder errado…).
//    Os vetos moram em `_folha_filtros.mjs`: a view e o CONTADOR NACIONAL leem o mesmo mapa — enquanto cada um
//    tinha o seu, a manchete contava município que a view já havia vetado ([[pnigp-entidade-espelho-infla-folha]]).
const FILTRO = Object.fromEntries(Object.entries(FILTRO_FOLHA).map(([k, v]) => [k, `where ${v}`]));

// 🚨 O GovBR mistura NOMINAL e AGREGADO na mesma tabela: 10.385 linhas sem nome são somas por cargo × fonte de
//    recurso ("Professor / FUNDEB 70%" = R$ 3,1 mi; "Prof.Lp espec. 200h / Aposentados" = R$ 3,6 mi). Elas
//    inflam a média de R$ 5.171 para R$ 22.942 e produzem "salários" de milhões. Não é lixo — é outra natureza,
//    e 6 municípios (Paranapanema, Pedra Bela, Engenheiro Coelho…) publicam SÓ assim.
const blocos = M.map(([t, orgao, sec, lot, cargo, func, sit, bruto, tipo]) => {
  const c = COMP[t] || "competencia";
  return `select '${t}'::text as fonte, ${NATUREZA[t] || "'folha oficial'"}::text as natureza,
    case when uf ~ '^[A-Za-z]{2}$' then upper(uf) else uf_por_ibge(cod_ibge) end as uf, folha_comp_norm(${c}, _coletado_em) as competencia,
    cod_ibge, municipio, ${N(orgao)} as orgao, ${N(sec)} as secretaria, ${N(lot)} as lotacao_fonte,
    ${N(cargo)} as cargo, ${N(func)} as funcao, ${N(sit)} as situacao, ${t === "digifred" ? "nome" : "nome"},
    ${bruto ? bruto : "null"}::numeric as salario_bruto, ${N(tipo)} as tipo_folha, ${c}::text as competencia_origem
  from folha_servidores_${t} ${FILTRO[t] || ""}`;
});

// ── 3. fontes que não são coletor de município ──────────────────────────────────────────────────────────────────
// 🚨 O e-Sfinge usa IBGE de 6 DÍGITOS e todo o resto da base usa 7: sem traduzir, o mesmo município conta duas
//    vezes e nunca casa com outra fonte (SC aparecia com 421 municípios num estado de 295 — 143%).
// 🚨 Os 55 códigos de 5 dígitos NÃO são municípios: são consórcios intermunicipais e a FURB. Entram como folha
//    pública com `cod_ibge` nulo, senão inflam a contagem de municípios ([[entidade-espelho]]).
// 🚨 17/ago: `vw_folha_municipal_sc` passou a gravar IBGE de **7 dígitos** (era 6). O join casava só por
//    `cod_ibge6 AND length=6` — e SC inteiro (295 municípios) saiu da view em silêncio, derrubando o total
//    nacional de 3.623 para 3.520 sem nenhum erro. Aceitar os DOIS tamanhos torna o bloco imune à próxima
//    mudança de formato. Só a conferência antes/depois pegou isso ([[pnigp-view-folha-nao-enxerga-coletores]]).
blocos.push(`select 'farol-tcesc'::text, 'folha oficial'::text, 'SC'::text, f.anomes,
    coalesce(mb7.cod_ibge, mb6.cod_ibge), f.municipio,
    f.orgao, f.area, f.lotacao_origem, f.cargo, f.funcao, f.situacao, f.nome, f.bruto, null::text, f.anomes
  from vw_folha_municipal_sc f
  left join municipios_br mb6 on mb6.cod_ibge6 = f.cod_ibge and length(f.cod_ibge) = 6
  left join municipios_br mb7 on mb7.cod_ibge  = f.cod_ibge and length(f.cod_ibge) = 7`);
blocos.push(`select 'tcepe'::text, 'folha oficial'::text, 'PE'::text,
    folha_comp_norm(coalesce(p.ano_remessa,'') || lpad(coalesce(p.mes_remessa,''),2,'0')),
    p.municipio_cod, p.municipio, p.uj_nome, p.uj_nome, p.uj_nome, p.cargo, p.tipo_vinculo,
    case when p.data_afastamento is null or p.data_afastamento = '' then 'Ativo' else 'Afastado' end,
    p.nome, null::numeric, null::text, coalesce(p.ano_remessa,'')||lpad(coalesce(p.mes_remessa,''),2,'0')
  from folha_servidores_pe p`);
// ⭐ O TCE-MA identifica o ente só pelo NOME — sem cod_ibge, 185 municípios do Maranhão ficavam invisíveis no mapa.
// 🚨 `municipios_br` grava alguns nomes com o sufixo da UF ("Bom Jardim MA"): sem tirá-lo, 2 dos 200 não casam.
// ⚠️ "Estado do Maranhão" e "Consórcios" NÃO são município e ficam sem cod_ibge de propósito.
// ⚠️ O TCE-MA não publica o nome do servidor (só CPF mascarado): entra com cargo e valor, `nome` nulo.
blocos.push(`select 'tcema'::text, 'folha oficial'::text, 'MA'::text,
    m.ano::text || lpad(m.mes::text,2,'0'), mb.cod_ibge, m.ente, m.unidade, m.unidade, m.unidade, m.cargo,
    coalesce(m.natureza_cargo, m.regime),
    case when m.data_exclusao is null or m.data_exclusao = 'null' then 'Ativo' else 'Desligado' end,
    null::text, m.valor_bruto, m.tipo_folha, m.ano::text||lpad(m.mes::text,2,'0')
  from folha_servidores_ma m
  left join municipios_br mb on mb.uf = 'MA'
    and nome_chave(regexp_replace(mb.nome, ' MA$', '')) = nome_chave(m.ente)`);
// ⚠️ empenho ≠ folha: é pagamento orçamentário, entra com natureza própria para não somar com folha
blocos.push(`select 'tcers'::text, 'empenho orcamentario'::text, 'RS'::text,
    folha_comp_norm(r.ano || lpad(r.mes::text,2,'0')), null::text, r.ente, r.secretaria, r.secretaria, r.unidade,
    null::text, r.rubrica, 'Ativo'::text, case when r.nominal then r.credor else null end, r.vl_pagamento,
    r.rubrica, r.ano||lpad(r.mes::text,2,'0')
  from folha_empenho_rs r`);
// 🚨 CORRIGIDO em 17/ago: eu tinha classificado o Digifred como "tabela de cargos" e isso tirou **19 municípios
//    do RS** da contagem indevidamente. Conferido: são **5.520 NOMES distintos** em 5.740 linhas, 1.001 cargos —
//    é folha NOMINAL, uma linha por pessoa (Ibirubá: 705 linhas, 677 nomes, 113 cargos).
//    ⚠️ O valor exige cuidado: quando `piso = teto` é a remuneração DAQUELA pessoa; quando diferem (56% dos
//    casos) é faixa do cargo e não pode virar salário. Daí o `case`.
blocos.push(`select 'digifred'::text, 'folha oficial'::text, case when uf ~ '^[A-Za-z]{2}$' then upper(uf) else uf_por_ibge(cod_ibge) end,
    folha_comp_norm(competencia, _coletado_em), cod_ibge, municipio, null::text, null::text, null::text,
    cargo, null::text, null::text, nome,
    case when piso is not null and piso = teto then piso else null end,
    case when piso is distinct from teto then 'faixa do cargo (piso≠teto)' else null end, competencia
  from folha_servidores_digifred`);
// a RAIS também é de 6 dígitos — casa 5.568/5.568 com municipios_br
blocos.push(`select 'rais'::text, 'censitario (declaracao do empregador)'::text, uf_por_ibge(r.cod_ibge6),
    r.ano::text, mb.cod_ibge, null::text, r.natureza_desc, null::text, null::text, r.cbo,
    coalesce(r.tipo_vinculo_desc, r.tipo_vinculo),
    case when r.ativo_3112 then 'Ativo' else 'Desligado no ano' end, null::text, r.rem_media, null::text, r.ano::text
  from folha_rais_municipal r
  left join municipios_br mb on mb.cod_ibge6 = r.cod_ibge6`);

const sql = `create or replace view vw_folha_municipal_brasil as\n${blocos.join("\nunion all\n")}`;
await q(sql);
console.log(`→ view recriada com ${blocos.length} fontes (lista fixa)`);
await db.end();

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 🚨 ESTE SCRIPT NÃO É O ÚLTIMO PASSO — e descobrir isso custou 29 coletores.
//
// `create or replace view` reescreve a definição INTEIRA a partir do `M` acima. O `reconstroi_view_folha_brasil.mjs`
// trabalha por ANEXO: preserva o que já está ligado e acrescenta as tabelas que faltam, achando a coluna de valor
// sozinho. São dois métodos escrevendo o MESMO objeto — e este, rodando depois, apaga o outro.
// Em 18/ago/2026 rodei este cinco vezes e derrubei 29 tabelas cheias da view sem perceber: portalfacil_api (102
// municípios), cerh (99), scpicsv (61)… A conferência "tabela × view" que eu fizera no INÍCIO da sessão dizia
// "4 fora" — era retrato de ANTES das minhas próprias escritas ([[pnigp-view-folha-nao-enxerga-coletores]]).
//
// ⭐ A correção não é um comentário pedindo para lembrar: comentário não executa. O anexo passa a ser AUTOMÁTICO.
//    SEM_ANEXO=1 desliga — serve só para depurar a lista fixa isoladamente.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
if (process.env.SEM_ANEXO !== "1") {
  const { spawnSync } = await import("child_process");
  console.log("→ anexando as tabelas fora da lista fixa (reconstroi_view_folha_brasil.mjs)…");
  const r = spawnSync(process.execPath, ["scripts/reconstroi_view_folha_brasil.mjs"],
    { stdio: "inherit", env: { ...process.env, APLICAR: "1" } });
  if (r.status !== 0) {
    console.log("🚨 o anexo FALHOU — a view ficou só com a lista fixa. Rode reconstroi_view_folha_brasil.mjs à mão.");
    process.exitCode = 1;
  }
}
