// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// aprofunda_tela_sem_linhas.mjs — vai UM CLIQUE ADIANTE nos municípios que o diagnóstico marcou `tela_sem_linhas`.
//
// ⭐ Por que existe: em Diamantina o diagnóstico registrou "tela sem linhas" e ESTAVA CERTO — a URL que ele
// visitou (`portaltransp.com.br/remuneracao/?data=pdmt`) é uma página-ÍNDICE, que só lista opções. A tela com
// dado (`/remuneracao/servidores/`) fica um clique adiante, e tem 1.998 servidores
// ([[pnigp-tela-certa-nao-e-so-ter-tabela]], [[pnigp-portaltransp-codigo-poder]]).
//
// O que faz: abre a URL do diagnóstico, procura links que cheirem a folha/servidor, segue cada um e verifica se
// há TABELA COM DINHEIRO. Registra a rota que tiver dado.
//
// 🚨 Guardas obrigatórias:
//   • CÂMARA fora — host/URL com `cm`, `camara`, `.leg.br` é outro poder ([[pnigp-entidade-espelho-infla-folha]]);
//   • a página tem de DECLARAR o município, senão é portal de vizinho ([[pnigp-entidade-declarada-e-a-prova]]);
//   • "tem tabela" não basta: exige célula com valor monetário — tabela de menu/rodapé não conta.
//
// Uso: UF=MG node scripts/aprofunda_tela_sem_linhas.mjs      · LIMITE=20 · SO=<município>
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "MG";
const SO = process.env.SO || null;
const LIMITE = Number(process.env.LIMITE || 0);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_rota_aprofundada (
  cod_ibge text primary key, municipio text, uf text, url_origem text, url_com_dado text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const RE_PESSOAL = /servidor|pessoal|folha|remunera|sal[aá]ri|vencimento|quadro/i;
const RE_CAMARA = /\bcm[-.]|\/\/cm[a-z]|camara|c[âa]mara|\.leg\.br|legislativ/i;

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const F = partes.join(" union ");

const fila = (await q(`select d.cod_ibge, d.municipio, m.uf, coalesce(d.url_pessoal, d.url_visitada) url
  from folha_diagnostico_faltante d join municipios_br m on m.cod_ibge = d.cod_ibge
 where m.uf = $1 and d.veredito = 'tela_sem_linhas'
   and left(m.cod_ibge,6) not in (${F})
   and coalesce(d.url_pessoal, d.url_visitada) is not null
   and not exists (select 1 from folha_rota_aprofundada r where r.cod_ibge = d.cod_ibge)
   ${SO ? "and d.municipio ilike '%'||$2||'%'" : ""}
 order by d.municipio ${LIMITE ? `limit ${LIMITE}` : ""}`, [UF, SO].filter(Boolean))).rows;
console.log(`[aprofunda] ${fila.length} municípios ${UF} para revisitar`);

// a página tem tabela COM DINHEIRO e declara o município?
async function avalia(page, nome) {
  return page.evaluate((mun) => {
    const EH_DINHEIRO = /(R\$\s*)?\d{1,3}(\.\d{3})*,\d{2}/;
    let melhor = 0;
    for (const t of document.querySelectorAll("table")) {
      const linhas = [...t.querySelectorAll("tr")]
        .map((tr) => [...tr.querySelectorAll("td")].map((c) => (c.innerText || "").trim()))
        .filter((c) => c.length >= 3 && c.some((x) => EH_DINHEIRO.test(x)));
      if (linhas.length > melhor) melhor = linhas.length;
    }
    const txt = document.body.innerText || "";
    const esc = mun.replace(/[^\w\s]/g, ".").replace(/\s+/g, "\\s*");
    return { linhas: melhor, declara: new RegExp(esc, "i").test(txt.slice(0, 8000)) };
  }, nome);
}

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let achados = 0, sem = 0, erros = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, url = null, linhas = 0) =>
    q(`insert into folha_rota_aprofundada (cod_ibge,municipio,uf,url_origem,url_com_dado,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (cod_ibge) do update set url_com_dado=excluded.url_com_dado, linhas=excluded.linhas,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.url, url, linhas, situacao, detalhe]);

  if (RE_CAMARA.test(a.url)) { await marca("camara", "a URL do diagnóstico é da CÂMARA"); continue; }
  const ctx = await browser.newContext({ userAgent: UA, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    await page.goto(a.url, { waitUntil: "domcontentloaded", timeout: 35000 });
    await dorme(2500);

    // a própria página já tem dado?
    let r = await avalia(page, a.municipio);
    if (r.linhas >= 3 && r.declara) {
      achados++; await marca("dado_na_origem", `a própria URL tem ${r.linhas} linhas com valor`, a.url, r.linhas);
      console.log(`  ⭐ ${a.municipio.padEnd(26)} dado na própria URL (${r.linhas} linhas)`);
      await ctx.close(); continue;
    }

    // ⭐ o clique adiante: links de pessoal DENTRO da página
    // 🚨 alguns sites embrulham o link em `google.com/url?q=…` — sem desembrulhar, grava-se o Google como portal
    const desembrulha = (u) => {
      try {
        const url = new URL(u);
        if (/google\./i.test(url.hostname) && url.searchParams.get("q")) return url.searchParams.get("q");
        return u;
      } catch { return u; }
    };
    const links = (await page.evaluate(() => [...document.querySelectorAll("a[href]")]
      .map((x) => ({ t: (x.innerText || "").replace(/\s+/g, " ").trim(), h: x.href }))
      .filter((x) => x.h && /^https?:/.test(x.h))))
      .map((x) => ({ ...x, h: desembrulha(x.h) }));
    const cand = [...new Map(links
      .filter((x) => RE_PESSOAL.test(x.t) || RE_PESSOAL.test(x.h))
      .filter((x) => !RE_CAMARA.test(x.h))
      .map((x) => [x.h, x])).values()].slice(0, 6);

    let venceu = null;
    for (const c of cand) {
      try {
        await page.goto(c.h, { waitUntil: "domcontentloaded", timeout: 30000 });
        await dorme(2500);
        r = await avalia(page, a.municipio);
        if (r.linhas >= 3 && r.declara) { venceu = { url: c.h, linhas: r.linhas, rotulo: c.t }; break; }
      } catch { /* próximo link */ }
    }
    if (venceu) {
      achados++;
      await marca("dado_um_clique_adiante", `link "${venceu.rotulo}" tem ${venceu.linhas} linhas com valor`,
        venceu.url, venceu.linhas);
      console.log(`  ⭐ ${a.municipio.padEnd(26)} ${venceu.linhas} linhas em "${venceu.rotulo}" → ${venceu.url.slice(0, 70)}`);
    } else {
      sem++;
      await marca("sem_dado", `${cand.length} links de pessoal seguidos, nenhum com tabela de valores`);
      console.log(`   · ${a.municipio}: ${cand.length} links seguidos, nenhum com valor`);
    }
  } catch (e) {
    erros++; await marca("erro", String(e.message).split("\n")[0].slice(0, 150));
    console.log(`   ✖ ${a.municipio}: ${String(e.message).split("\n")[0].slice(0, 55)}`);
  }
  await ctx.close().catch(() => {});
}
await browser.close();
console.log(`\n[aprofunda] ${achados} com dado · ${sem} sem dado · ${erros} erros`);
await db.end();
