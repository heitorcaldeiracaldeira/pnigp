// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// consolida_lai_rs.mjs — monta a tabela `folha_lai_pendencia` com o MOTIVO APURADO de cada município que ficou
// sem folha, juntando o que cada coletor registrou. É o insumo do pedido por LAI: para cada município, o que foi
// testado, o que o portal respondeu e por que não há dado.
//
// A regra é a de sempre: só entra como "não publica" o que foi PROVADO (tela sem seção, base vazia, integração
// desligada). O que falhou por rede ou por defeito do coletor entra como pendência técnica, não como omissão do
// município ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
//
// Uso: UF=RS node scripts/consolida_lai_rs.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";

await q(`create table if not exists folha_lai_pendencia (
  cod_ibge text primary key, municipio text, uf text, rais int,
  classe text,          -- nao_publica | pendencia_tecnica | sem_portal_identificado
  produto text, url text, evidencia text, em timestamptz default now()
)`);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const F = partes.join(" union ");

// o que cada coletor registrou sobre o município (a evidência mais específica vence)
const faltam = (await q(`
  select m.cod_ibge, m.nome, m.uf, coalesce(r.v,0) rais,
         (select string_agg(distinct c.produto,'+') from folha_portal_candidato c where c.cod_ibge=m.cod_ibge) produto,
         (select min(c.url) from folha_portal_candidato c where c.cod_ibge=m.cod_ibge) url,
         coalesce(
           (select detalhe from folha_multi24_coleta x where x.cod_ibge=m.cod_ibge and x.situacao='nao_publica'),
           (select detalhe from folha_betha_egov_coleta x where x.cod_ibge=m.cod_ibge and x.situacao='nao_publica'),
           (select 'IPM: '||detalhe from folha_ipm_coleta x where x.cod_ibge=m.cod_ibge and x.situacao<>'ok'),
           (select 'tchê: '||detalhe from folha_tche_coleta x where x.cod_ibge=m.cod_ibge and x.situacao<>'ok'),
           (select 'sys523: '||detalhe from folha_sys523_coleta x where x.cod_ibge=m.cod_ibge and x.situacao<>'ok'),
           (select 'multi24: '||detalhe from folha_multi24_coleta x where x.cod_ibge=m.cod_ibge and x.situacao<>'ok'),
           (select 'citta: '||detalhe from folha_citta_coleta x where x.cod_ibge=m.cod_ibge and x.situacao<>'ok'),
           (select 'GovBR: '||detalhe from govbr_portal x where x.cod_ibge=m.cod_ibge and x.situacao like 'pendente%'),
           (select 'abase: '||detalhe from folha_abase_coleta x where x.cod_ibge=m.cod_ibge and x.situacao<>'ok'),
           (select 'diagnóstico: '||d.veredito from folha_diagnostico_faltante d where d.cod_ibge=m.cod_ibge)
         ) evidencia
    from municipios_br m
    left join (select cod_ibge6, count(*)::int v from folha_rais_municipal
                where esfera_grupo ilike '%munic%' and ativo_3112 group by 1) r on r.cod_ibge6 = left(m.cod_ibge,6)
   where m.uf=$1 and left(m.cod_ibge,6) not in (${F})
   order by coalesce(r.v,0) desc`, [UF])).rows;

// os becos já provados nesta campanha, por nome (a evidência está nas memórias e nas tabelas de coleta)
const PROVADOS = {
  // 🚨 Caxias do Sul, São Leopoldo, Esteio e Canoas SAÍRAM daqui em 17/ago — os quatro publicam, e os quatro eu
  // havia carimbado como "não publica" testando o fornecedor errado ou a tela vizinha:
  //   Caxias  → `remuneracoes.caxias.rs.gov.br` (API REST), achado no MENU do GRP lido por API
  //   S.Leop. → `consfolha.saoleopoldo.rs.gov.br` (DataTables) + SEMAE em ADMRH
  //   Esteio  → ADMRH em `transparencia-prefeitura.esteio.rs.gov.br`
  //   Canoas  → item PESSOAL do portal GeneXus/Ábaco (eu tinha olhado só CARGOS E SALÁRIOS ao lado)
  "Santa Cruz do Sul": "GRP/Thema: integração ADMRH desligada (mesmo teste de Caxias).",
  // 🚨 Passo Fundo e Não-Me-Toque SAÍRAM daqui em 17/ago: o ADMRH deles está VIVO, em
  // `portaltransparencia.pmpf.rs.gov.br` e `portaltransparencia.naometoque.rs.gov.br`. Eu havia concluído
  // "integração desligada" testando só o host `admrh.` e os endpoints do GRP — o módulo não mora onde o nome do
  // fornecedor sugere ([[pnigp-modulo-vs-host-fornecedor]]). Passo Fundo é o 4º maior município do estado.
  // 🚨 São Borja SAIU daqui em 17/ago: o Betha e-gov está mesmo parado em 2019, mas o município MIGROU para
  // DBSeller (`transparencia.saoborja.rs.gov.br/folha_pagamentos`) e publica 2.363 servidores, 2.361 com valor.
  // Eu havia carimbado "não publica" olhando só o fornecedor antigo — fornecedor morto não é município calado
  // ([[pnigp-plataforma-rotulo-vs-sistema]]).
  "Barão do Triunfo": "Betha e-gov responde e a consulta roda, mas a ENTIDADE não alimenta a base — a tela informa 'última atualização pela entidade: 13/11/2019'.",
  // provados na varredura de seções do multi24 e na tela do tchê (17/ago) — ficam AQUI, e não como update avulso,
  // senão a próxima reconsolidação desfaz a conclusão e devolve o município para a fila técnica
  "Pinhal Grande": "multi24 no ar com 22 seções e NENHUMA de pessoal.",
  "Presidente Lucena": "multi24 no ar com 26 seções e NENHUMA de pessoal.",
  "Monte Belo do Sul": "multi24 no ar com 26 seções e NENHUMA de pessoal.",
  "Arroio do Meio": "multi24 no ar com 26 seções e NENHUMA de pessoal.",
  "Riozinho": "multi24 no ar com 21 seções e NENHUMA de pessoal.",
  "Salvador do Sul": "multi24 tem a seção servidores_salarios, mas o <select ano> vem VAZIO — a entidade não alimenta a base.",
  "Rondinha": "tchê no ar com a tela de folha; responde 'não houve movimentação para o período' em 2024, 2025 e 2026.",
  "São José das Missões": "tchê no ar com a tela de folha; 'não houve movimentação para o período' em 2024, 2025 e 2026.",
  "Barão": "IPM: o grupo Pessoal só tem funcionario-efetivo (sem valor) e resumo-folha-de-pagamento (agregado); a tela devolve HTTP 500 ao payload de folha.",
  "Dois Irmãos das Missões": "IPM: o grupo Pessoal só tem funcionario-x-lotacao (sem valor); a tela devolve HTTP 500 ao payload de folha.",
  // 🚨 publicam NOME SEM SALÁRIO — o coletor Betha leu, recusou e registrou 'lista_sem_valor'. Não é falha de
  // coleta: é cadastro de servidores, não folha ([[pnigp-lista-sem-valor-nao-e-folha]]).
  "São José dos Ausentes": "Betha (transparencia.betha.cloud): a consulta 'Servidores públicos' devolve 348 nomes e NENHUM valor — é cadastro de pessoal, não folha. A câmara publica outros 11, também sem valor.",
  "Quevedos": "Betha: a consulta 'Folha de Pagamento' devolve 281 nomes e NENHUM valor — é cadastro de pessoal, não folha.",
  "Silveira Martins": "Radar aponta govbr com url_erp relativa '/PRONIMTB/', mas nenhum host do município responde nesse caminho (testados silveiramartins./www./transparencia. em acao=10&item=8 e acao=4&item=5); em 17/ago o site oficial passou a responder 403 (WAF).",
  // ⭐ evidência TÉCNICA de primeira para o pedido por LAI: não é o coletor que falha, é a tela que não funciona
  // ⭐ PUBLICA, mas o serviço está fora do ar — evidência acionável, e diferente de "não publica"
  "Sério": "PUBLICA mas o SERVIDOR ESTÁ FORA DO AR: o portal oficial tem o link 'Salário dos Servidores' para http://transparencia.serio.rs.gov.br:8080/multi24/sistemas/transparencia/?entidade=1&secao=servidores_salarios; o host resolve (186.236.48.110) mas nenhuma das 13 portas testadas responde e o navegador fecha ERR_CONNECTION_TIMED_OUT (18/ago/2026).",
  "Capivari do Sul": "DBSeller (transparencia.capivaridosul.rs.gov.br/folha_pagamentos) com reCAPTCHA MAL CONFIGURADO: a página carrega recaptcha/api.js SEM o parâmetro render=, então grecaptcha.execute() responde 'Invalid site key or not loaded in api.js' e o controlador recusa a consulta com 'Undefined index: token'. A grade fica vazia para QUALQUER usuário. Testado em 12/2025 e 07/2026, instituições 1 e 2.",
};
let n = 0;
for (const f of faltam) {
  const provado = PROVADOS[f.nome];
  const ev = provado || f.evidencia || "sem portal de folha identificado: varredura multiproduto (8 prefixos × 6 portas × 8 produtos), leitura do site oficial e captura de tráfego não acharam tela de folha";
  // 🚨 "portal identificado" não é só ter candidato na tabela: quando a evidência começa com o nome de um produto
  // (GovBR:, IPM:, tchê:…), o portal FOI achado e o que falta é engenharia — Eldorado do Sul tem o PRONIM
  // mapeado e caía em "sem portal identificado", o que mandaria para LAI um município que publica.
  const temProduto = !!f.produto || /^(GovBR|IPM|tchê|tche|sys523|multi24|citta|abase|SCPI|Betha|Elotech|DBSeller|ADMRH):/i.test(String(ev));
  const classe = provado || /nao_publica|não publica|NENHUMA de pessoal|select ano.*vazio|sem movimenta|login/i.test(ev)
    ? "nao_publica"
    : (temProduto ? "pendencia_tecnica" : "sem_portal_identificado");
  await q(`insert into folha_lai_pendencia (cod_ibge, municipio, uf, rais, classe, produto, url, evidencia, em)
    values ($1,$2,$3,$4,$5,$6,$7,$8,now())
    on conflict (cod_ibge) do update set rais=excluded.rais, classe=excluded.classe, produto=excluded.produto,
      url=excluded.url, evidencia=excluded.evidencia, em=now()`,
    [f.cod_ibge, f.nome, f.uf, f.rais, classe, f.produto, f.url, String(ev).slice(0, 500)]);
  n++;
}
// 🚨 LIMPAR o que deixou de faltar: sem isso a tabela vira acervo e mantém municípios já coletados na fila de
// pendência — Maquiné continuou listado depois de entrar com 633 servidores. A tabela tem de ser um RETRATO do
// que falta agora, não um histórico.
const limpos = await q(`delete from folha_lai_pendencia
  where uf=$1 and left(cod_ibge,6) in (${F}) returning municipio`, [UF]);
if (limpos.rowCount) console.log(`[lai] ${limpos.rowCount} já coletados, removidos da fila: ${limpos.rows.map((r) => r.municipio).join(", ")}`);
console.log(`[lai] ${n} municípios consolidados`);
console.table((await q(`select classe, count(*)::int municipios, sum(rais)::int servidores
  from folha_lai_pendencia where uf=$1 group by 1 order by 3 desc`, [UF])).rows);
console.log("\n--- os 12 maiores, com a evidência ---");
for (const r of (await q(`select municipio, rais, classe, left(evidencia,110) ev from folha_lai_pendencia
  where uf=$1 order by rais desc limit 12`, [UF])).rows) {
  console.log(`  ${r.municipio.padEnd(26)} ${String(r.rais).padStart(5)} [${r.classe}]\n      ${r.ev}`);
}
await db.end();
