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
await q(`create table if not exists folha_scpi_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

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
async function varreMeses(page, frame, avisaMes) {
  let melhor = null, testados = 0;
  for (const mes of MESES) {
    await frame.evaluate((m) => { try { if (window.cmbMes && window.cmbMes.SetValue) window.cmbMes.SetValue(m); } catch {} }, mes).catch(() => {});
    await dorme(1200);
    await frame.evaluate(() => { const b = document.querySelector("#btnPesquisar"); if (b) b.click(); }).catch(() => {});
    await dorme(6000);
    frame = await achaFrame(page);
    if (!frame) break;
    const rows = await leGrid(page);
    if (rows.length) {
      testados++;
      if (!melhor || rows.length > melhor.rows.length) melhor = { mes, rows };
      if (testados >= MESES_TESTE) break;
    }
  }
  if (melhor) { avisaMes(melhor.mes); return melhor.rows; }
  return [];
}

// o postback recria o iframe: o handle precisa ser reobtido a cada ida ao servidor
async function achaFrame(page) {
  let f = page.frames().find((x) => /Servidores\.aspx/i.test(x.url()));
  for (let w = 0; w < 12 && !f; w++) { await dorme(1000); f = page.frames().find((x) => /Servidores\.aspx/i.test(x.url())); }
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

  const out = []; const vistos = new Set();
  for (let pg = 0; pg < (totalPag || 1); pg++) {
    frame = await achaFrame(page);
    if (!frame) break;
    const linhas = await lePaginaAtual(frame);
    for (const r of linhas) {
      const key = [r.mat, r.nome, r.cargo, r.ref, r.liq].join("|");
      if (vistos.has(key)) continue;
      vistos.add(key); out.push(r);
    }
    if (pg + 1 >= (totalPag || 1)) break;
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
  const heads = [...document.querySelectorAll("td[class*=dxgvHeader]")].map((h) => h.innerText.trim().toLowerCase());
  const col = (re) => heads.findIndex((h) => re.test(h));
  const ix = { ref: col(/refer/), mat: col(/matr/), contr: col(/contrato/), adm: col(/admiss/), cargo: col(/cargo/),
    unid: col(/unidade|divis|lota/), vinc: col(/v[íi]nculo/), prov: col(/proventos/), desc: col(/descontos/),
    liq: col(/l[íi]quido/), nome: col(/^nome/) };
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
if (process.env.HOST) {
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br where lower(nome)=lower($1) ${process.env.UF ? "and uf=$2" : ""} limit 1`, process.env.UF ? [process.env.MUN, process.env.UF] : [process.env.MUN])).rows[0];
  alvos = [{ ...mun, host: process.env.HOST }];
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
             'https://' || (regexp_match(f.base_url, '([a-z0-9-]+\\.dcfiorilli\\.com\\.br)'))[1] || ':879/transparencia/' base
        from fiorilli_portal f where f.base_url ilike '%dcfiorilli%'
      union
      select p.cod_ibge, p.municipio, p.uf,
             regexp_replace(p.url_portal_real, '/*$', '') || '/' base
        from portal_real_descoberto p
       where p.url_portal_real ~* 'transparencia'
         and (p.url_portal_real ~* ':(8079|5656|879)/'          -- portas típicas do SCPI on-premise
              or p.url_portal_real ~* 'dcfiorilli'              -- hospedado pela própria Fiorilli
              or p.erp_radar = 'fiorilli')                      -- o Radar já identificou o ERP como Fiorilli
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
      select d.cod_ibge, d.municipio, d.uf,
             regexp_replace(split_part(coalesce(d.url_pessoal, d.url_visitada), '#', 1), '/*$', '') || '/' base
        from folha_diagnostico_faltante d
       where d.produto = 'scpi' and d.tem_dados
         and coalesce(d.url_pessoal, d.url_visitada) !~* '(transparenciacm|camara|\\.leg\\.br)'
      union
      -- ⭐ O RÓTULO DO PRODUTO NÃO É A ÚLTIMA PALAVRA: msgestaopublica e rcmsuporte são HOSPEDAGENS do SCPI
      -- (Xangri-lá abre com título "SCPI 9.0 - Transparência" e rodapé "Fiorilli"), mas o diagnóstico
      -- classificou o produto como ? e esses municípios ficaram parados com coletor pronto. É o mesmo caso de
      -- [[pnigp-plataforma-rotulo-vs-sistema]]: o host revela o sistema quando o rótulo falha.
      select d.cod_ibge, d.municipio, d.uf,
             regexp_replace(split_part(coalesce(d.url_pessoal, d.url_visitada), '#', 1), '/*$', '') || '/' base
        from folha_diagnostico_faltante d
       where coalesce(d.url_pessoal, d.url_visitada) ~* '(msgestaopublica|rcmsuporte)'
         and coalesce(d.url_pessoal, d.url_visitada) !~* '(transparenciacm|camara|\\.leg\\.br)'
    ) x
    -- o modo lote não tinha filtro de UF: UF=RS era ignorado e a fila saía com os 310 municípios do país.
    -- Filtra pelo PREFIXO do cod_ibge porque as tabelas de origem guardam uf em formatos diferentes
    -- (sigla numas, nome por extenso noutras).
    where base is not null ${filtroSO} ${filtroUF}
    order by uf, nome`, parAlvos)).rows
    .map((a) => ({ ...a, host: (() => { try { return new URL(a.base).host; } catch { return null; } })() }))
    .filter((a) => a.host);
}
const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_scpi_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => a.cod_ibge && !feitos.has(a.cod_ibge));
console.log(`[scpi] ${alvos.length} municípios · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_scpi
      (cod_ibge,municipio,uf,host,referencia,matricula,contrato,data_admissao,cargo,unidade,secretaria,vinculo,proventos,descontos,liquido,nome,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::text[],$17::text[])
      on conflict (_hash) do update set liquido=excluded.liquido, nome=excluded.nome, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("referencia"), c("matricula"), c("contrato"),
       c("data_admissao"), c("cargo"), c("unidade"), c("secretaria"), c("vinculo"), c("proventos"), c("descontos"), c("liquido"), c("nome"), c("_hash")]);
  }
}

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled", "--ignore-certificate-errors"] });
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, linhas = 0) =>
    q(`insert into folha_scpi_coleta (cod_ibge,municipio,uf,host,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.nome, a.uf, a.host, linhas, situacao, detalhe]);
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  try {
    await page.goto(a.base || `https://${a.host}:879/transparencia/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dorme(2500);
    // dispara ProcessaDados('LnkServidores') → carrega Servidores.aspx no iframe
    await page.evaluate(() => { try { if (typeof ProcessaDados === "function") ProcessaDados("LnkServidores"); } catch {} });
    await dorme(4000);
    // pega o frame do iframe
    let frame = await achaFrame(page);
    if (!frame) { await marca("erro", "iframe Servidores nao carregou"); falhas++; continue; }

    // 🚨 O MÊS É UM FILTRO, e vem preenchido com o mês CORRENTE — que na maioria dos portais ainda não tem folha
    // publicada. O coletor clicava "Pesquisar" e lia grid vazio, marcando "grid sem linhas" (17 municípios).
    // Brodowski (SP), por exemplo, só tem folha até MARÇO. É um combo DevExpress: `cmbMes.SetValue('03')`.
    // ⚠️ o clique em #btnPesquisar é POSTBACK ASP.NET: o frame é recriado e o handle antigo morre com
    // "Execution context was destroyed" — por isso o frame é reobtido a cada tentativa.
    // 🚨 O EXERCÍCIO É OUTRO COMBO, e ele fica na página PRINCIPAL (fora do iframe): "Escolha o Exercício".
    // O combo de mês só navega dentro do ano selecionado — município que parou de publicar em 2025 aparecia
    // vazio nos 12 meses de 2026 e caía em "grid sem linhas".
    const exercicios = await page.evaluate(() => {
      const s = [...document.querySelectorAll("select")].find((x) => /exerc|ano/i.test(x.id + x.name));
      return s ? [...s.options].map((o) => o.value).filter((v) => /^\d{4}$/.test(v)).sort().reverse().slice(0, 3) : [];
    }).catch(() => []);
    let rows = [], mesUsado = null, exUsado = null;
    for (const ex of (exercicios.length ? exercicios : [null])) {
      if (ex) {
        await page.evaluate((v) => {
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
      cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf, host: a.host, referencia: s.ref,
      matricula: s.mat, contrato: s.contr, data_admissao: s.adm, cargo: s.cargo, unidade: s.unid, secretaria: s.unid, vinculo: s.vinc,
      nome: s.nome,
      proventos: money(s.prov), descontos: money(s.desc), liquido: money(s.liq),
      // nome entra no hash: há layouts SEM matrícula (Brodowski), onde o hash antigo colapsava servidores distintos
      _hash: crypto.createHash("md5").update([a.cod_ibge, s.ref, s.mat, s.nome, s.cargo, s.liq].join("¦")).digest("hex"),
    }));
    await grava(regs);
    totalGeral += regs.length; ok++;
    await marca("ok", `mês ${mesUsado}`, regs.length);
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
