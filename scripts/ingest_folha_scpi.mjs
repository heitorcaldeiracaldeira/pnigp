// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_scpi.mjs — folha NOMINAL COM SALÁRIO + SECRETARIA dos municípios Fiorilli/SCPI 9.0 (dcfiorilli, NACIONAL).
//
// ⭐ A transparência Fiorilli dcfiorilli vive na PORTA :879: `{slug}.dcfiorilli.com.br:879/transparencia/` = SCPI 9.0.
// Fluxo (Playwright): abrir /transparencia/ → `ProcessaDados('LnkServidores')` (seta contexto, POST RecuperarDados) →
// carrega `Servidores.aspx` no iframe `#frmPaginaAspx` → dentro do iframe clicar `#btnPesquisar` → grid DevExpress
// `gridPessoal` popula → ler+paginar (grid.NextPage) → colunas: Referência·Matrícula·Contrato·Data Admissão·Cargo·
// Unidade(=secretaria)·Vínculo·Proventos·Descontos·Líquido. Dinheiro "5.314,29".
//
// Hosts: `fiorilli_portal` (base_url dcfiorilli) → `{host}:879`. Uso pontual: HOST=colinasp.dcfiorilli.com.br MUN=Colina UF=SP.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";
import { COD_UF as COD_UF_SCPI } from "./_uf.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
// ⭐ 21/ago/2026: PODER=legislativo colhe a folha da CÂMARA. É o MESMO produto, a MESMA tela e a MESMA tabela —
//    o que muda é qual entidade do combo `cmbEntidadeContabil` se escolhe, e a fila, que passa a aceitar os
//    portais de câmara que as guardas do executivo excluem de propósito. Um método por tipo de portal
//    ([[feedback-varios-metodos-um-por-tipo]]): não se forka o coletor, parametriza-se o poder.
const PODER = (process.env.PODER || "executivo").toLowerCase();
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_scpi (
  cod_ibge text, municipio text, uf text, host text, referencia text,
  matricula text, contrato text, data_admissao text, cargo text, unidade text, secretaria text, vinculo text,
  proventos numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_scpi_mun on folha_servidores_scpi (cod_ibge)`);
// vários layouts do SCPI trazem o NOME do servidor (Brodowski, Cabeceiras); o coletor antigo descartava
await q(`alter table folha_servidores_scpi add column if not exists nome text`);
// ⭐ 18/ago: a ENTIDADE DECLARADA passa a ser gravada. Sem esta coluna o `audita_entidade_declarada.mjs` —
//    que existe justamente para pegar município carregando folha de outro — era CEGO ao SCPI, a fonte com
//    mais subcoleta e contaminação medida ([[pnigp-varredura-porta-exige-entidade]]).
await q(`alter table folha_servidores_scpi add column if not exists entidade text`);
await q(`create table if not exists folha_scpi_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);
// 🚨 o livro-razão tinha PK só em cod_ibge: a passada do LEGISLATIVO sobrescreveria o veredito do EXECUTIVO do
//    mesmo município (e o veto `ok_so_camara` da view depende dele). A chave passa a ser (cod_ibge, poder).
await q(`alter table folha_scpi_coleta add column if not exists poder text not null default 'executivo'`);
await q(`do $$ begin
  if exists (select 1 from pg_constraint where conname = 'folha_scpi_coleta_pkey'
               and (select count(*) from unnest(conkey)) = 1) then
    alter table folha_scpi_coleta drop constraint folha_scpi_coleta_pkey;
    alter table folha_scpi_coleta add primary key (cod_ibge, poder);
  end if;
end $$`);

const money = (s) => { if (s == null) return null; const t = String(s).replace(/\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };

// meses a tentar, do corrente para trás (o combo cmbMes é 01..12 do exercício corrente)
const MESES = (() => {
  const out = []; const hoje = new Date();
  for (let k = 0; k < Number(process.env.RECUO || 12); k++) {
    const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
    if (d.getFullYear() !== hoje.getFullYear()) break;   // o combo não muda de exercício
    out.push(String(d.getMonth() + 1).padStart(2, "0"));
  }
  return out;
})();

// varre os meses do exercício e devolve as linhas do mês MAIS CHEIO — não do primeiro que responder.
// 🚨 O mês corrente vem PARCIAL: Marau saía com 90 linhas (RAIS: 1.320), Ilópolis com 4, Caraá com 12, todos
// carimbados "mês 08". Parar no primeiro mês com folha é o mesmo defeito que subcoletou 22 municípios no Betha
// ([[pnigp-competencia-mais-cheia-nao-a-recente]]). Testa até MESES_TESTE meses com dados e fica com o maior.
const MESES_TESTE = Number(process.env.MESES_TESTE || 3);
// 🚨 A coluna `Referência` do SCPI não é a competência: é o TIPO DE FOLHA ("Folha Mensal - Julho",
//    "Rescisão - Julho", "Folha Complementar", "Adiantamento 13º"). Escolher o mês com mais LINHAS pegava a
//    folha errada: **23 municípios ficaram sem UMA linha de Folha Mensal** — Avaré com 2.625 linhas, todas de
//    rescisão/complementar; Itaí com 7 ("Complementar de Rescisão"); Itapira com 21 de rescisão e 4 da mensal.
//    A régua passa a ser o nº de linhas de FOLHA MENSAL; o total só desempata quando nenhum mês tem mensal.
const ehMensal = (r) => /folha\s*mensal/i.test(String(r?.ref || ""));
const pesoMensal = (rows) => rows.filter(ehMensal).length;
async function varreMeses(page, frame, avisaMes) {
  let melhor = null, testados = 0;
  for (const mes of MESES) {
    await frame.evaluate((m) => { try { if (window.cmbMes && window.cmbMes.SetValue) window.cmbMes.SetValue(m); } catch {} }, mes).catch(() => {});
    await dorme(1200);
    // 🚨 UMA VARIANTE DO SCPI EXIGE ESCOLHER O QUE LISTAR ANTES de pesquisar: radios `rbListagemServidoresAtivos`,
    // `rbListagemCargoSalario`, `rbListagemEstagiarios`, `rbListagemVereadores`… Sem marcar nenhum, o Pesquisar
    // devolve grid VAZIO e o município saía como "grid sem linhas" — parecia não publicar (medido em Tabapuã,
    // 17/ago). Marcar SERVIDORES ATIVOS; "Cargos e Salários" é tabela de vencimentos, não folha.
    await frame.evaluate(() => {
      const r = document.querySelector("#rbListagemServidoresAtivos")
            || document.querySelector('input[type=radio][id*="ServidoresAtivos"]');
      if (r && !r.checked) { r.click(); }
    }).catch(() => {});
    await dorme(1500);
    await frame.evaluate(() => { const b = document.querySelector("#btnPesquisar"); if (b) b.click(); }).catch(() => {});
    await dorme(6000);
    frame = await achaFrame(page);
    if (!frame) break;
    const rows = await leGrid(page);
    if (rows.length) {
      testados++;
      const cand = { mes, rows, mensal: pesoMensal(rows) };
      // compara primeiro por linhas de folha mensal; só cai no total quando ambos não têm nenhuma
      const melhorQue = !melhor
        || cand.mensal > melhor.mensal
        || (cand.mensal === melhor.mensal && cand.mensal === 0 && cand.rows.length > melhor.rows.length);
      if (melhorQue) melhor = cand;
      if (testados >= MESES_TESTE) break;
    }
  }
  if (melhor) {
    avisaMes(melhor.mes);
    if (!melhor.mensal) console.log(`      ⚠️ nenhum mês trouxe "Folha Mensal" — o que veio é rescisão/complementar`);
    return melhor.rows;
  }
  return [];
}

// o postback recria o iframe: o handle precisa ser reobtido a cada ida ao servidor
// ⏱️ 12s de espera pelo iframe eram pouco para portal lento: 12 municípios morreram em "iframe Servidores nao
//    carregou" — e Pilar do Sul, um deles, tinha sido COLHIDO com 1.017 servidores noutra rodada. Sintoma
//    intermitente é tempo, não portal ([[pnigp-coletor-ok-sem-dado-sete-causas]]). FRAME_S ajusta.
const FRAME_S = Number(process.env.FRAME_S || 40);
async function achaFrame(page) {
  let f = page.frames().find((x) => /Servidores\.aspx/i.test(x.url()));
  for (let w = 0; w < FRAME_S && !f; w++) { await dorme(1000); f = page.frames().find((x) => /Servidores\.aspx/i.test(x.url())); }
  return f;
}

// Lê o grid DevExpress página a página. ⚠️ A paginação NÃO pode rodar toda dentro de um único evaluate: o callback
// do DevExpress troca o conteúdo do iframe e o contexto do frame é reciclado — a varredura interna colhia 54 de 108
// em Brodowski. Aqui cada página é uma ida ao frame, com o handle reobtido, exatamente como o navegador faria.
async function leGrid(page) {
  let frame = await achaFrame(page);
  if (!frame) return [];
  const totalPag = await frame.evaluate(() => {
    const g = [...document.querySelectorAll('[id*="gridPessoal"]')].map((e) => (e.id.match(/gridPessoal/) || [])[0]).filter(Boolean)[0];
    const grid = g ? window[g] || window.gridPessoal : window.gridPessoal;
    return grid && grid.GetPageCount ? grid.GetPageCount() : 1;
  }).catch(() => 1);

  // 🚨 `GetPageCount()` devolve 1 quando o objeto JS do grid tem OUTRO NOME — o que acontece nos white-labels
  // (sigmix, masterpublica, sgpcloud). O coletor então lia só a 1ª página e terminava 'ok': 8 dos 28 municípios
  // de MG saíram com 13 a 50 linhas (Jacutinga 22 de 1.468 na RAIS). Quando o total não é confiável mas a
  // página veio CHEIA, seguir avançando até parar de trazer novidade. Ver [[pnigp-coletor-ok-sem-dado-sete-causas]].
  const out = []; const vistos = new Set();
  const TETO = 400;
  const confiavel = (totalPag || 1) > 1;
  for (let pg = 0; pg < (confiavel ? totalPag : TETO); pg++) {
    frame = await achaFrame(page);
    if (!frame) break;
    // DUMP=1 fotografa o CABEÇALHO e a 1ª linha CRUA do grid DevExpress, uma vez só. Existe porque "coluna de
    // dinheiro achada" e "valor chegando" são coisas diferentes: o ledger registrava `col=proventos` e todas as
    // células vinham nulas ([[pnigp-rotulo-da-coluna-de-dinheiro-varia]]).
    if (process.env.DUMP === "1" && pg === 0) {
      const foto = await frame.evaluate(() => {
        const heads = [...document.querySelectorAll("td[class*=dxgvHeader]")].map((h) => h.innerText.trim());
        const tr = document.querySelector("tr[class*=dxgvDataRow]");
        const cels = tr ? [...tr.querySelectorAll("td")].map((x) => x.innerText.trim()) : [];
        return { heads, cels, nLinhas: document.querySelectorAll("tr[class*=dxgvDataRow]").length };
      }).catch((e) => ({ erro: String(e).slice(0, 60) }));
      console.log(`     CABEÇALHO (${foto.heads?.length ?? "?"}): ${JSON.stringify(foto.heads || foto.erro)}`);
      console.log(`     1ª LINHA  (${foto.cels?.length ?? "?"}): ${JSON.stringify(foto.cels || [])}`);
    }
    const linhas = await lePaginaAtual(frame);
    let novos = 0;
    for (const r of linhas) {
      const key = [r.mat, r.nome, r.cargo, r.ref, r.liq].join("|");
      if (vistos.has(key)) continue;
      vistos.add(key); out.push(r); novos++;
    }
    if (confiavel && pg + 1 >= totalPag) break;
    if (!confiavel && (!novos || linhas.length === 0)) break;   // sem novidade = acabou de verdade
    await frame.evaluate(() => {
      const g = [...document.querySelectorAll('[id*="gridPessoal"]')].map((e) => (e.id.match(/gridPessoal/) || [])[0]).filter(Boolean)[0];
      const grid = g ? window[g] || window.gridPessoal : window.gridPessoal;
      try { grid.NextPage(); } catch {}
    }).catch(() => {});
    await dorme(3500);
  }
  return out;
}

// lê apenas as linhas visíveis da página atual; as colunas vêm PELO CABEÇALHO, que muda de portal para portal
const lePaginaAtual = (frame) => frame.evaluate(async () => {
  const dorme = (ms) => new Promise((f) => setTimeout(f, ms));
  // 🚨🚨 19/ago — O CABEÇALHO TEM DE VIR DO **MESMO GRID** DAS LINHAS.
  //   A página do SCPI tem vários grids DevExpress empilhados: o da folha e os painéis de detalhe (plano de
  //   cargo, documentos, ponto). Varrer `td[class*=dxgvHeader]` no documento inteiro juntava TODOS —
  //   São Francisco de Itabapoana devolvia 26 rótulos para linhas de 8 células. O matcher achava "Proventos"
  //   no índice 19 (que é de outro grid), lia `c[19]` numa linha de 8 e gravava NULO. O dinheiro estava na
  //   coluna 7, "Salário Base", com 4.168,83 na cara — 2.164 servidores marcados sem valor por isso.
  //   Agora o cabeçalho sai da tabela que contém a 1ª linha de dado; sem ela, cai no comportamento antigo.
  const trRef = document.querySelector("tr[class*=dxgvDataRow]");
  const tabelaDoGrid = trRef ? trRef.closest("table") : null;
  const heads = [...(tabelaDoGrid || document).querySelectorAll("td[class*=dxgvHeader]")]
    .map((h) => h.innerText.trim().toLowerCase());
  // ⚠️ rede de segurança: índice além da largura da linha é índice de OUTRO grid — vale -1, nunca um valor torto
  const largura = trRef ? trRef.querySelectorAll("td").length : 0;
  const col = (re) => { const i = heads.findIndex((h) => re.test(h)); return largura && i >= largura ? -1 : i; };
  const ix = { ref: col(/refer/), mat: col(/matr/), contr: col(/contrato/), adm: col(/admiss/), cargo: col(/cargo/),
    // 🚨 19/ago: o RÓTULO DO DINHEIRO varia como o do nome variava. `/proventos/` sozinho perdeu municípios que
    //    publicam a mesma coisa com outro nome — São Francisco de Itabapoana/RJ (2.168 pessoas) expõe
    //    **"Salário Base"** e nada mais. É a mesma família do conserto do GeneXus WWP, onde SALBRUTO,
    //    REMUNERACAOBRUTA, VALORBRUTO, PROVENTOS e VENCIMENTOS eram a mesma coluna com nomes diferentes.
    //    ⚠️ ORDEM: proventos/vencimentos (o bruto de verdade) vêm primeiro; **salário base entra por último**,
    //    porque é o vencimento sem gratificações e vale menos — só serve quando não há nada melhor.
    unid: col(/unidade|divis|lota/), vinc: col(/v[íi]nculo/),
    prov: [/proventos/, /vencimentos/, /remunera/, /^bruto|sal.*bruto/, /sal[áa]rio\s*base|vencimento\s*base/]
            .map((re) => col(re)).find((i) => i >= 0) ?? -1,
    desc: col(/descontos/),
    // 🚨 O RÓTULO DA COLUNA DO NOME VARIA (16/ago/2026): `^nome` não casa com "Servidor", "Funcionário" nem
    // "Colaborador" — 20.736 linhas entraram SEM NOME (Botucatu 3.330, Bastos 1.920, Leme 1.872, todas 100%),
    // e linha sem nome não é folha nominal. Mesma família do detector de salário do PR
    // ([[pnigp-pr-mapa-folha-399]]) e do `Nome`/`NomeServidor` do SMARAPD.
    liq: col(/l[íi]quido/), nome: col(/^(nome|servidor|funcion|colaborador|empregado)/) };
  const g = [...document.querySelectorAll('[id*="gridPessoal"]')].map((e) => (e.id.match(/gridPessoal/) || [])[0]).filter(Boolean)[0];
  const grid = g ? window[g] || window.gridPessoal : window.gridPessoal;
  const totalPag = grid && grid.GetPageCount ? grid.GetPageCount() : 1;
  const out = []; const vistos = new Set();
  const pega = (c, i) => (i >= 0 && i < c.length ? c[i] : null);
  const ler = () => {
    for (const tr of document.querySelectorAll("tr[class*=dxgvDataRow]")) {
      const c = [...tr.querySelectorAll("td")].map((x) => x.innerText.trim());
      const r = { ref: pega(c, ix.ref), mat: pega(c, ix.mat), contr: pega(c, ix.contr), adm: pega(c, ix.adm),
        cargo: pega(c, ix.cargo), unid: pega(c, ix.unid), vinc: pega(c, ix.vinc), prov: pega(c, ix.prov),
        desc: pega(c, ix.desc), liq: pega(c, ix.liq), nome: pega(c, ix.nome) };
      if (!r.mat && !r.nome && !r.cargo) continue;
      // ⭐ o RÓTULO da coluna de dinheiro viaja junto com a linha. Sem isso, "salário base" entra em `proventos`
      //    indistinguível de um bruto de verdade — e base exclui gratificações, então subestima a folha.
      //    Registrar o rótulo deixa o veredito revisável sem refazer a coleta (a lição do GeneXus WWP).
      r.rotuloProv = ix.prov >= 0 ? heads[ix.prov] : null;
      const key = [r.mat, r.nome, r.cargo, r.liq].join("|");
      if (vistos.has(key)) continue; vistos.add(key);
      out.push(r);
    }
  };
  ler();
  return out;
}).catch(() => []);

// alvos: fiorilli_portal dcfiorilli → host:879
let alvos;
// ⭐ BASE= aceita a URL COMPLETA da instalação, para os municípios que publicam em VÁRIAS bases.
//    `portal_produto` tem PK em cod_ibge e só guarda uma; Picos tem três (`/prefeitura/`, `/educacao/`,
//    `/saude/`) e só a prefeitura registrada dava 23% da RAIS — faltavam as duas MAIORES folhas.
//    Ex.: BASE=https://www2.picos.pi.gov.br/educacao/ MUN=Picos UF=PI
if (process.env.BASE || process.env.HOST) {
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br where lower(nome)=lower($1) ${process.env.UF ? "and uf=$2" : ""} limit 1`, process.env.UF ? [process.env.MUN, process.env.UF] : [process.env.MUN])).rows[0];
  const base = process.env.BASE ? process.env.BASE.replace(/\/*$/, "/") : null;
  alvos = [{ ...mun, base, host: process.env.HOST || (base ? new URL(base).host : null) }];
} else {
  // 🚨 A PORTA NÃO É SÓ 879. Ao investigar os 216 municípios rotulados "instar" no Radar (que é o fornecedor do
  // SITE, não do portal), 50 deles são SCPI hospedado ON-PREMISE: 32 em :8079, 11 em :5656 e 7 em :879, muitos
  // em IP puro (177.129.251.233:8079) ou DNS dinâmico (itapui.ddns.net:8079). Fixar `{host}:879` deixava todos
  // esses de fora. Agora a base vem pronta da descoberta, com host e porta reais.
  const parAlvos = [];
  const filtroSO = SO ? `and nome ilike '%'||$${parAlvos.push(SO)}||'%'` : "";
  const filtroUF = process.env.UF ? `and left(cod_ibge,2) = $${parAlvos.push(COD_UF_SCPI)}` : "";
  alvos = (await q(`
    select cod_ibge, nome, uf, base from (
      select f.cod_ibge, f.municipio nome, f.uf,
             -- 🚨 REMONTAR host:879 SÓ QUANDO A BASE NÃO TRAZ PORTA/CAMINHO. A 879 não existe em vários
             -- servidores dcfiorilli (contreina 2,3,6,10,17,18 e piaos4): o portal está em 877, 878, 8072, 8078…
             -- Onde a sondagem já gravou a base COMPLETA, usar verbatim — remontar era jogar fora a descoberta
             -- e gastar 150 s de timeout por município.
             case when f.base_url ~ ':[0-9]+' or f.base_url ~* '/(transparencia|Default\\.aspx)'
                  then regexp_replace(f.base_url, '/*$', '') || '/'
                  else 'https://' || (regexp_match(f.base_url, '([a-z0-9-]+\\.dcfiorilli\\.com\\.br)'))[1] || ':879/transparencia/'
             end base
        from fiorilli_portal f where f.base_url ilike '%dcfiorilli%'
      union
      -- 🚨 NEM TODA REVENDA MORA NO dcfiorilli. A aossoftware (PI/MA) hospeda SCPI 9.0 em instâncias próprias
      -- (subdomínio, PORTA) e o caminho do módulo varia (/transparencia/, /PM+MUNICIPIO/). Aqui a base já veio
      -- CONFIRMADA NA FONTE pela varredura — usar VERBATIM, sem remontar host:879, que não existe nesses hosts.
      select f.cod_ibge, f.municipio nome, f.uf, regexp_replace(f.base_url, '/*$', '') || '/' base
        from fiorilli_portal f
       where f.base_url not ilike '%dcfiorilli%' and f.detalhe ilike '%confirmado na fonte%'
      union
      select p.cod_ibge, p.municipio, p.uf,
             regexp_replace(p.url_portal_real, '/*$', '') || '/' base
        from portal_real_descoberto p
       where (p.url_portal_real ~* 'transparencia'
              or p.url_portal_real ~* '\-scpi\.'                -- ⭐ o sufixo -scpi no host é o produto (MG)
              or p.url_portal_real ~* 'sgpcloud\.net:[0-9]+')
         and (p.url_portal_real ~* ':(8079|5656|879)/'          -- portas típicas do SCPI on-premise
              or p.url_portal_real ~* 'dcfiorilli'              -- hospedado pela própria Fiorilli
              -- 🚨 EM MINAS o SCPI não mora no dcfiorilli: é WHITE-LABEL em {mun}-scpi.sigmix.net,
              -- {mun}-scpi.masterpublica.net e portal.sgpcloud.net:{porta alta}. O que os une é o
              -- sufixo -scpi e a porta, nunca a marca do fornecedor ([[pnigp-portal-proprio-e-white-label]]).
              or p.url_portal_real ~* '\-scpi\.'
              or p.url_portal_real ~* 'sgpcloud\.net:[0-9]+'
              -- 🚨 IGUALDADE aqui era um vazamento SILENCIOSO: as correções posteriores gravam com rótulo
              -- derivado ('fiorilli-pref', 'fiorilli-varredura') e nenhuma batia com = 'fiorilli'. Chapadão do
              -- Sul tinha o portal certo mapeado e nunca entrou na fila. Prefixo, não igualdade.
              or p.erp_radar ilike 'fiorilli%'                  -- o Radar/as correções identificaram Fiorilli
              -- provedor regional que hospeda SCPI SEM porta alta (rcmsuporte/biosnet em MS)
              or p.url_portal_real ~* '(rcmsuporte|biosnet)\.com\.br/transparencia')
      union
      -- ⭐ a VARREDURA DE RODAPÉ (varre_rodape_fornecedor.mjs) acha o fornecedor lendo a assinatura no rodapé do
      -- site do município — 18 municípios de MG entraram por aqui e nenhuma das outras fontes os tinha
      -- ([[pnigp-plataforma-rotulo-vs-sistema]]). Mesma guarda de câmara das demais fontes.
      select c.cod_ibge, c.municipio, c.uf, regexp_replace(c.url, '/*$', '') || '/' base
        from folha_portal_candidato c
       where c.produto = 'scpi'
         and c.url !~* '(transparenciacm|camara|\.leg\.br|[a-z]cm\.|\-cm\.)'
      union
      -- portais em DOMÍNIO PRÓPRIO do município que a assinatura da página revelou ser SCPI (white-label):
      -- 40 municípios que pareciam "portal próprio" e são o mesmo produto. Ver identifica_produto_portal.mjs
      select pp.cod_ibge, pp.municipio, pp.uf, regexp_replace(pp.url, '/*$', '') || '/' base
        from portal_produto pp where pp.produto = 'scpi'
      union
      -- ⭐ o DIAGNÓSTICO PROFUNDO (diagnostica_faltantes.mjs) abre o portal com navegador e só marca 'tem_dados'
      -- quando a tela de pessoal mostra linhas — é a evidência mais forte que existe, e traz alvos que os filtros
      -- acima não alcançam: porta fora da lista (:8076 em Cassilândia) e domínio próprio sem porta (Ivinhema).
      -- 🚨 exclui o que é da CÂMARA (/transparenciacm/, camara, .leg.br): coletar de lá dá dezenas de
      -- pessoas num município de milhares ([[pnigp-entidade-espelho-infla-folha]]).
      -- 16/ago: a câmara também se esconde no HOST do white-label — saojoaodamatacm.sgpcloud.net trouxe 15
      -- pessoas. Daí os padrões {letra}cm. e -cm. na guarda.
      select d.cod_ibge, d.municipio, d.uf,
             regexp_replace(split_part(coalesce(d.url_pessoal, d.url_visitada), '#', 1), '/*$', '') || '/' base
        from folha_diagnostico_faltante d
       where d.produto = 'scpi' and d.tem_dados
         and coalesce(d.url_pessoal, d.url_visitada) !~* '(transparenciacm|camara|\\.leg\\.br|[a-z]cm\\.|\\-cm\\.)'
      union
      -- ⭐ O RÓTULO DO PRODUTO NÃO É A ÚLTIMA PALAVRA: msgestaopublica e rcmsuporte são HOSPEDAGENS do SCPI
      -- (Xangri-lá abre com título "SCPI 9.0 - Transparência" e rodapé "Fiorilli"), mas o diagnóstico
      -- classificou o produto como ? e esses municípios ficaram parados com coletor pronto. É o mesmo caso de
      -- [[pnigp-plataforma-rotulo-vs-sistema]]: o host revela o sistema quando o rótulo falha.
      select d.cod_ibge, d.municipio, d.uf,
             regexp_replace(split_part(coalesce(d.url_pessoal, d.url_visitada), '#', 1), '/*$', '') || '/' base
        from folha_diagnostico_faltante d
       where coalesce(d.url_pessoal, d.url_visitada) ~* '(msgestaopublica|rcmsuporte)'
         and coalesce(d.url_pessoal, d.url_visitada) !~* '(transparenciacm|camara|\\.leg\\.br|[a-z]cm\\.|\\-cm\\.)'
      union
      -- ⭐ 18/ago: o CATÁLOGO RNR (folha_catalogo_rnr) é a sétima fonte e nenhuma das seis acima a alcançava —
      -- 26 municípios com a rota do SCPI CONFIRMADA no link e sem folha em coletor nenhum. A assinatura é a
      -- query string "?AcessoIndividual=LnkServidores", que é do SCPI 9.0 e NÃO do fornecedor: ela aparece em
      -- dcfiorilli:875, adtrcloud:8088, aossoftware, IP puro (45.185.146.2:8079), duckdns e domínio do próprio
      -- município. O host mente sobre o produto; a rota, não ([[pnigp-catalogo-rnr-resolve-o-ente]],
      -- [[pnigp-fiorilli-instar-nao-sao-bloco]] — aquilo descartou ADIVINHAR porta/caminho, não o link dado).
      -- 🚨 mesma guarda de câmara das demais: aqui ela é dupla, pelo tipo_entidade do catálogo E pela URL.
      select r.cod_ibge, r.municipio, r.uf,
             regexp_replace(split_part(r.link, '?', 1), '/*$', '') || '/' base
        from folha_catalogo_rnr r
       where r.link ilike '%AcessoIndividual=LnkServidores%'
         and r.cod_ibge is not null
         and coalesce(r.tipo_entidade, '') !~* 'c[âa]mara'
         and r.link !~* '(transparenciacm|camara|\\.leg\\.br|[a-z]cm\\.|\\-cm\\.)'
    ) x
    -- o modo lote não tinha filtro de UF: UF=RS era ignorado e a fila saía com os 310 municípios do país.
    -- Filtra pelo PREFIXO do cod_ibge porque as tabelas de origem guardam uf em formatos diferentes
    -- (sigla numas, nome por extenso noutras).
    where base is not null ${filtroSO} ${filtroUF}
    -- 🚨 SO_ERROS=1: reexecuta só os municípios registrados em 'erro'. São 122 no país (contra 278 ok) e boa
    -- parte é falha TRANSITÓRIA — hosts que deram ERR_CONNECTION_TIMED_OUT respondem 200 com o portal completo
    -- quando testados de novo. Erro de coleta não é ausência de dado ([[pnigp-scpi-122-erros-recuperaveis]]).
    ${process.env.SO_ERROS === "1"
      ? "and exists (select 1 from folha_scpi_coleta c where c.cod_ibge = x.cod_ibge and c.situacao = 'erro')"
      : ""}
    -- 🚨 SO_SEM_MENSAL=1: os municípios cuja coleta ficou SÓ com rescisão/complementar/13º, sem uma linha de
    -- "Folha Mensal". Eram 23 (Avaré com 2.625 linhas, nenhuma mensal). A régua de escolha do mês foi corrigida
    -- para pesar linhas mensais — Itapira saiu de 25 para 2.529 ([[pnigp-scpi-subcoleta-78-municipios]]).
    ${process.env.SO_SEM_MENSAL === "1"
      ? `and exists (select 1 from folha_servidores_scpi s where s.cod_ibge = x.cod_ibge)
         and not exists (select 1 from folha_servidores_scpi s where s.cod_ibge = x.cod_ibge
                          and s.referencia ~* 'folha mensal')`
      : ""}
    order by uf, nome`, parAlvos)).rows
    .map((a) => ({ ...a, host: (() => { try { return new URL(a.base).host; } catch { return null; } })() }))
    .filter((a) => a.host);

  // ⭐ PODER=legislativo: as 6 fontes acima excluem o portal da CÂMARA de propósito — aqui ele é o ALVO. A fila
  //    ganha os portais de câmara que o identificador reconheceu como Fiorilli/SCPI (`folha_camara_fila`), sem
  //    perder os do executivo: em muita instalação a câmara é só OUTRA entidade do mesmo combo (a lei do IPM,
  //    [[pnigp-ipm-todas-as-entidades]]) e é lá que ela está.
  if (PODER === "legislativo") {
    const parCam = [];
    const fUF = process.env.UF ? `and left(f.cod_ibge,2) = $${parCam.push(COD_UF_SCPI)}` : "";
    const fSO = SO ? `and f.municipio ilike '%'||$${parCam.push(SO)}||'%'` : "";
    const cam = (await q(`select f.cod_ibge, f.municipio nome, f.uf,
        regexp_replace(split_part(coalesce(f.url_erp_camara, f.url_camara, f.url_camara_2), '?', 1), '/*$', '') || '/' base
      from folha_camara_fila f
      where coalesce(f.erp_camara,'') ~* '^(fiorilli|scpi)'
        and coalesce(f.url_erp_camara, f.url_camara, f.url_camara_2) is not null ${fUF} ${fSO}
      order by f.rais_legislativo desc nulls last`, parCam)).rows
      .map((a) => ({ ...a, host: (() => { try { return new URL(a.base).host; } catch { return null; } })() }))
      .filter((a) => a.host);
    // ⚠️ SUBSTITUI a fila do executivo, não soma: cada município do SCPI custa de 1 a 25 minutos (o pior caso é
    //    "grid sem linhas em 8 meses × 3 exercícios", medido em Corumbá). Somar os 881 do executivo daria dias.
    //    A câmara que mora DENTRO da instância do executivo é outra passada, com fila própria.
    alvos.length = 0;
    alvos.push(...cam);
    console.log(`[scpi] PODER=legislativo · ${cam.length} portais de câmara identificados como Fiorilli/SCPI`);
  }
}
// 🚨 CORRIGIDO — `contreina` NÃO É TREINO. Eu classifiquei 34 alvos do PI/MA como ambiente de treinamento por
// causa do nome do host (`picontreinaN`/`macontreinaN.dcfiorilli.com.br`) e apaguei 552 linhas REAIS. A prova do
// contrário: os SITES OFICIAIS desses municípios linkam justamente esses hosts como portal, e
// `macontreina1.dcfiorilli.com.br:878/transparencia/` responde "PREFEITURA MUNICIPAL DE SANTA HELENA".
// `contreina` é o nome do SERVIDOR/cluster da Fiorilli, não o ambiente. Nome de host não é prova de nada —
// a prova é o ENTE DECLARADO na página ([[pnigp-sonda-folha-prova-e-a-coleta]]).
const TREINO = /treinamento|homologa|sandbox|\bdemo\./i;
{
  const barrados = alvos.filter((a) => TREINO.test(a.base || a.host || ""));
  if (barrados.length) {
    console.log(`[scpi] ⚠️ ${barrados.length} alvos barrados por serem ambiente de TREINAMENTO do fornecedor: ` +
      barrados.slice(0, 6).map((b) => `${b.nome}/${b.uf}`).join(", ") + (barrados.length > 6 ? "…" : ""));
    for (let i = alvos.length - 1; i >= 0; i--) if (TREINO.test(alvos[i].base || alvos[i].host || "")) alvos.splice(i, 1);
  }
}
const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_scpi_coleta
      where situacao like 'ok%' and poder = $1`, [PODER])).rows.map((r) => r.cod_ibge));
// ⚠️ LIMITE= corta a fila. Os jobs longos vêm sendo interrompidos antes de terminar, e o SCPI leva ~1-2 min
//    por município (navegador). Com SO_SEM_MENSAL=1 a fila é AUTO-INCREMENTAL: quem ganha folha mensal sai
//    dela sozinho na rodada seguinte, então dá para avançar em lotes sem controle externo.
const fila = alvos.filter((a) => a.cod_ibge && !feitos.has(a.cod_ibge))
  .slice(0, Number(process.env.LIMITE || 100000));
console.log(`[scpi] ${alvos.length} municípios · ${fila.length} na fila${process.env.LIMITE ? ` (lote de ${process.env.LIMITE})` : ""}`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_scpi
      (cod_ibge,municipio,uf,host,referencia,matricula,contrato,data_admissao,cargo,unidade,secretaria,vinculo,proventos,descontos,liquido,nome,entidade,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::text[],$17::text[],$18::text[])
      -- 🚨 19/ago: o upsert atualizava só liquido/nome/entidade. PROVENTOS ficava de fora — então, ao consertar
      --    o cabeçalho e passar a ler "Salário Base" em São Francisco de Itabapoana, o coletor buscou o valor
      --    certo e o BANCO o descartou: 2.168 linhas recoletadas com sucesso e nenhuma com dinheiro. É o mesmo
      --    defeito que travou 8 municípios no SMARAPD no mesmo dia — conserto de coletor não chega ao banco se
      --    o ON CONFLICT não propagar a coluna consertada ([[pnigp-rotulo-da-coluna-de-dinheiro-varia]]).
      -- ⚠️ coalesce(excluded.X, atual): re-passada que volta vazia NÃO apaga valor bom
      --    ([[pnigp-repassada-nao-pode-rebaixar-veredito]]).
      on conflict (_hash) do update set
        liquido    = coalesce(excluded.liquido,    folha_servidores_scpi.liquido),
        proventos  = coalesce(excluded.proventos,  folha_servidores_scpi.proventos),
        descontos  = coalesce(excluded.descontos,  folha_servidores_scpi.descontos),
        cargo      = coalesce(excluded.cargo,      folha_servidores_scpi.cargo),
        secretaria = coalesce(excluded.secretaria, folha_servidores_scpi.secretaria),
        unidade    = coalesce(excluded.unidade,    folha_servidores_scpi.unidade),
        vinculo    = coalesce(excluded.vinculo,    folha_servidores_scpi.vinculo),
        nome=excluded.nome,
        entidade=coalesce(excluded.entidade, folha_servidores_scpi.entidade), _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("referencia"), c("matricula"), c("contrato"),
       c("data_admissao"), c("cargo"), c("unidade"), c("secretaria"), c("vinculo"), c("proventos"), c("descontos"), c("liquido"), c("nome"), c("entidade"), c("_hash")]);
  }
}

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled", "--ignore-certificate-errors"] });
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  // ⚠️ o coletor só falava no FIM de cada município — passada longa parecia travada quando estava só devagar.
  //    Silêncio não é conclusão ([[pnigp-vigia-silencio-nao-e-conclusao]]).
  console.log(`  → [${i + 1}/${fila.length}] ${a.uf} ${a.nome} · ${a.base || a.host}`);
  const marca = (situacao, detalhe, linhas = 0) =>
    q(`insert into folha_scpi_coleta (cod_ibge,municipio,uf,host,linhas,situacao,detalhe,poder,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge,poder) do update set
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.nome, a.uf, a.host, linhas, situacao, detalhe, PODER]);
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  try {
    // portais em hospedagem compartilhada (msgestaopublica) demoram mais que 60 s no primeiro acesso — o timeout
    // fixo transformava "portal lento" em "município sem folha"
    await page.goto(a.base || `https://${a.host}:879/transparencia/`,
      { waitUntil: "domcontentloaded", timeout: Number(process.env.GOTO_MS || 150000) });
    await dorme(2500);
    // 🚨 O MENU DO SCPI É POR INSTÂNCIA. `LnkServidores` existe como ELEMENTO em toda instalação, mas só tem
    // handler onde o município habilitou a tela nominal. Em PI (aossoftware) as três instâncias confirmadas têm
    // apenas Cedidos/QuadroFuncional/ServidoresRelatorios — nenhuma nominal. Sem esta checagem o coletor volta
    // "vazio" e o município parece falha de coleta, quando é NÃO-PUBLICAÇÃO da fonte.
    const temTelaNominal = await page.evaluate(() =>
      /ProcessaDados\(\s*["']LnkServidores["']\s*\)/.test(document.documentElement.innerHTML)).catch(() => true);
    if (!temTelaNominal) {
      await marca("sem_tela_nominal", "instância SCPI sem handler de LnkServidores — só Cedidos/QuadroFuncional/Relatórios", 0);
      vazios++; await ctx.close(); continue;
    }
    // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
    // 🚨 A ENTIDADE. Host respondendo é INDÍCIO; quem prova de quem é a folha é a ENTIDADE DECLARADA
    //    ([[pnigp-varredura-porta-exige-entidade]]). Este coletor não olhava o combo e lia a entidade PADRÃO da
    //    instância — o que, em host compartilhado, é a entidade de OUTRO ente.
    //    Medido em 18/ago: `picontreina7.dcfiorilli.com.br:879` serve Capitão de Campos, Elesbão Veloso e São
    //    Braz do Piauí, e o combo `cmbEntidadeContabil` tem UM item só: "CAMARA MUNICIPAL DE ELESBÃO VELOSO".
    //    Resultado: Capitão de Campos e São Braz gravaram as MESMAS 20 linhas de VEREADOR — a câmara de um
    //    TERCEIRO município — e os dois passaram a contar como cobertos. 8 hosts do PI servem 2 a 5 municípios.
    //    A regra: só coleta quando a entidade declarada casa com o MUNICÍPIO e é do EXECUTIVO. Não casou, não
    //    grava — e o motivo fica escrito no livro-razão, que é melhor do que dado errado com veredito 'ok'.
    // ═════════════════════════════════════════════════════════════════════════════════════════════════════════
    const ent = await page.evaluate(() => {
      const c = window.cmbEntidadeContabil;
      if (!c || typeof c.GetItemCount !== "function") return null;      // instância sem combo: nada a conferir
      const itens = [];
      for (let i = 0; i < c.GetItemCount(); i++) {
        const it = c.GetItem(i);
        if (it) itens.push({ i, valor: it.value, texto: String(it.text || "").replace(/\s+/g, " ").trim() });
      }
      return { itens, atual: typeof c.GetText === "function" ? String(c.GetText() || "").replace(/\s+/g, " ").trim() : null };
    }).catch(() => null);

    let entidadeUsada = null;
    if (ent && ent.itens.length) {
      const chave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
      const alvoNome = chave(a.nome);
      // 🚨 CASAR O NOME NÃO BASTA — TEM DE SER A PREFEITURA. A instância de Capitão de Campos tem SETE entidades
      //    ("Prefeitura Municipal de…", "Fundo de Previdência Social de…", "Fundo de Manutenção e Desenvolvimento
      //    da Educação", "Unidade de Saúde…"). A primeira versão deste guarda pegava o PRIMEIRO item que citasse
      //    o município e não fosse câmara — e trouxe 416 linhas do **Fundo de Previdência**, que são
      //    aposentados e pensionistas, não a folha da prefeitura. Aqui a escolha é RANQUEADA: só o executivo
      //    serve, e na falta dele o município é recusado ([[pnigp-entidade-espelho-infla-folha]]).
      const doMunicipio = (t) => chave(t).includes(alvoNome);
      const ehExecutivo = (t) => /^(PREFEITURA|MUNICIPIO|PREF )/.test(chave(t)) || /\bPREFEITURA MUNICIPAL\b/.test(chave(t));
      const naoEhFolhaDoEnte = (t) => /\bCAMARA\b|\bLEGISLATIV|\bFUNDO\b|\bINSTITUTO\b|PREVIDENC|\bAUTARQUIA\b|CONSORCIO|UNIDADE DE SAUDE|\bHOSPITAL\b|\bSAAE\b/.test(chave(t));
      // ⭐ PODER=legislativo inverte a régua: serve a CÂMARA daquele município, e só ela. Prefeitura, fundo,
      //    autarquia e instituto continuam recusados — trocar o poder não pode afrouxar a prova da entidade
      //    ([[pnigp-varredura-porta-exige-entidade]]).
      const ehCamara = (t) => /\bCAMARA\b|\bCAMARA MUNICIPAL\b|\bLEGISLATIV/.test(chave(t));
      const naoEhCamaraDoEnte = (t) => /\bPREFEITURA\b|\bFUNDO\b|\bINSTITUTO\b|PREVIDENC|\bAUTARQUIA\b|CONSORCIO|UNIDADE DE SAUDE|\bHOSPITAL\b|\bSAAE\b/.test(chave(t));
      const quero = PODER === "legislativo"
        ? (x) => doMunicipio(x.texto) && ehCamara(x.texto) && !naoEhCamaraDoEnte(x.texto)
        : (x) => doMunicipio(x.texto) && ehExecutivo(x.texto) && !naoEhFolhaDoEnte(x.texto);
      const bom = ent.itens.find(quero);
      if (!bom) {
        const so = ent.itens.map((x) => x.texto).join(" | ").slice(0, 180);
        await marca("entidade_nao_confere", `combo declara "${so}" — nenhuma ${PODER === "legislativo" ? "CÂMARA" : "PREFEITURA"} de ${a.nome}`, 0);
        vazios++; await ctx.close(); continue;
      }
      entidadeUsada = bom.texto;
      // seleciona a entidade certa quando ela não é a que já está posta (postback do DevExpress)
      if (ent.atual !== bom.texto) {
        await page.evaluate((idx) => { try { window.cmbEntidadeContabil.SetSelectedIndex(idx); } catch {} }, bom.i);
        await dorme(4000);
      }
    }

    // dispara ProcessaDados('LnkServidores') → carrega Servidores.aspx no iframe
    await page.evaluate(() => { try { if (typeof ProcessaDados === "function") ProcessaDados("LnkServidores"); } catch {} });
    await dorme(4000);
    // pega o frame do iframe
    let frame = await achaFrame(page);
    if (!frame) { await marca("erro", `iframe Servidores nao apareceu em ${FRAME_S}s — instancia pode nao ter a tela nominal (ver sem_tela_nominal)`); falhas++; continue; }

    // 🚨 O MÊS É UM FILTRO, e vem preenchido com o mês CORRENTE — que na maioria dos portais ainda não tem folha
    // publicada. O coletor clicava "Pesquisar" e lia grid vazio, marcando "grid sem linhas" (17 municípios).
    // Brodowski (SP), por exemplo, só tem folha até MARÇO. É um combo DevExpress: `cmbMes.SetValue('03')`.
    // ⚠️ o clique em #btnPesquisar é POSTBACK ASP.NET: o frame é recriado e o handle antigo morre com
    // "Execution context was destroyed" — por isso o frame é reobtido a cada tentativa.
    // 🚨 O EXERCÍCIO É OUTRO COMBO, e ele fica na página PRINCIPAL (fora do iframe): "Escolha o Exercício".
    // O combo de mês só navega dentro do ano selecionado — município que parou de publicar em 2025 aparecia
    // vazio nos 12 meses de 2026 e caía em "grid sem linhas".
    // 🚨 O COMBO DE EXERCÍCIO NÃO É UM <select> (19/ago/2026). É DevExpress: a página tem `TABLE#cmbExercicio`,
    //    o valor vive em `INPUT#cmbExercicio_VI` e as opções na lista `cmbExercicio_DDD_L_LBT`. Procurando por
    //    <select>, a varredura achava ZERO anos, caía no `[null]` e o log dizia "× 1 exercícios" — foi o que
    //    aconteceu com os 17 municípios marcados `vazio`, entre eles Catiguá, Borá, Tabapuã e Cândido Mota,
    //    cujas telas TÊM dado ([[pnigp-recuo-curto-perde-quem-parou]], [[pnigp-coletor-ok-sem-dado-sete-causas]]).
    const exercicios = await page.evaluate(() => {
      const anos = new Set();
      const lista = document.querySelector("#cmbExercicio_DDD_L_LBT");   // a lista suspensa já renderizada
      if (lista) for (const tr of lista.rows) {
        const t = (tr.innerText || "").trim();
        if (/^\d{4}$/.test(t)) anos.add(t);
      }
      const vi = document.querySelector("#cmbExercicio_VI") || document.querySelector('input[id*="cmbExercicio_VI"]');
      if (vi && /^\d{4}$/.test(String(vi.value).trim())) anos.add(String(vi.value).trim());
      const s = [...document.querySelectorAll("select")].find((x) => /exerc|ano/i.test(x.id + x.name));
      if (s) for (const o of s.options) if (/^\d{4}$/.test(o.value)) anos.add(o.value);
      return [...anos].sort().reverse().slice(0, 3);
    }).catch(() => []);
    let rows = [], mesUsado = null, exUsado = null;
    for (const ex of (exercicios.length ? exercicios : [null])) {
      if (ex) {
        // troca pelo cliente DevExpress (`cmbExercicio.SetValue`) e dispara o callback que recarrega a entidade
        // no ano escolhido; o <select> continua como plano B para as variantes antigas do SCPI.
        await page.evaluate((v) => {
          try {
            if (window.cmbExercicio && window.cmbExercicio.SetValue) {
              window.cmbExercicio.SetValue(v);
              if (window.btnCallBackTrocaEntExercicio && window.btnCallBackTrocaEntExercicio.PerformCallback)
                window.btnCallBackTrocaEntExercicio.PerformCallback();
              else if (typeof TrocarEntidadeExercicio === "function") TrocarEntidadeExercicio();
              return;
            }
          } catch {}
          const s = [...document.querySelectorAll("select")].find((x) => /exerc|ano/i.test(x.id + x.name));
          if (s) { s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }
        }, ex).catch(() => {});
        await dorme(3000);
        await page.evaluate(() => { try { if (typeof ProcessaDados === "function") ProcessaDados("LnkServidores"); } catch {} });
        await dorme(4000);
        frame = await achaFrame(page);
        if (!frame) break;
      }
      exUsado = ex;
      rows = await varreMeses(page, frame, (m) => { mesUsado = m; });
      if (rows.length) break;
    }
    if (!rows.length) {
      await marca("vazio", `grid sem linhas em ${MESES.length} meses × ${exercicios.length || 1} exercícios`);
      vazios++; continue;
    }
    const regs = rows.filter((r) => r.mat || r.cargo || r.nome).map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf, host: a.host, referencia: s.ref, entidade: entidadeUsada,
      matricula: s.mat, contrato: s.contr, data_admissao: s.adm, cargo: s.cargo, unidade: s.unid, secretaria: s.unid, vinculo: s.vinc,
      nome: s.nome,
      proventos: money(s.prov), descontos: money(s.desc), liquido: money(s.liq),
      // nome entra no hash: há layouts SEM matrícula (Brodowski), onde o hash antigo colapsava servidores distintos
      _hash: crypto.createHash("md5").update([a.cod_ibge, s.ref, s.mat, s.nome, s.cargo, s.liq].join("¦")).digest("hex"),
    }));
    // 🚨 GUARDA DE NOMINALIDADE (16/ago/2026): linha sem nome NÃO é folha nominal. Sem esta trava entraram 20.736
    // linhas sem nome (Botucatu 3.330, Bastos 1.920, Leme 1.872 — 100% cada) porque o rótulo da coluna do nome
    // varia por instalação ([[pnigp-rotulo-de-coluna-varia-lei]]). A mesma guarda já existe na Betha e no GovBR.
    // Marca `sem_nome` em vez de `ok`: o município fica DECLARADO como não-nominal, não escondido como coletado.
    const comNome = regs.filter((r) => r.nome && String(r.nome).trim()).length;
    if (regs.length && comNome < regs.length / 2) {
      await marca("sem_nome", `grade sem coluna de nome reconhecida (${comNome}/${regs.length}) — mês ${mesUsado}`, 0);
      console.log(`  ⚠️ [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${regs.length} linhas SEM NOME — não gravado`);
      vazios++; continue;
    }
    await grava(regs);
    totalGeral += regs.length; ok++;
    // ⚠️ quando o dinheiro veio de "salário base" (e não de proventos/vencimentos), o veredito TEM de dizer:
    //    base exclui gratificações e adicionais, então a folha sai menor que a real. Sem esta nota, ninguém
    //    saberia distinguir esse município de um que publica o bruto de verdade.
    const rotulo = [...new Set(rows.map((r) => r.rotuloProv).filter(Boolean))].join("/");
    const ressalvaBase = /base/i.test(rotulo) ? ` | ⚠️ valor vindo de "${rotulo}" — é BASE, não bruto` : null;
    await marca("ok", [`mês ${mesUsado}`, rotulo ? `col=${rotulo}` : null, ressalvaBase].filter(Boolean).join(" · "), regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${regs.length} servidores (mês ${mesUsado})`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close(); }
  await dorme(600);
}
await browser.close();
console.log(`\n[scpi] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
