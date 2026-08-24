// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_gxrh.mjs — folha NOMINAL com CARGO + SECRETARIA + SALÁRIO do portal GeneXus/WorkWithPlus hospedado
// no DOMÍNIO DO PRÓPRIO MUNICÍPIO (`transparencia.{slug}.sp.gov.br`) — white-label, não é o asp.srv.br.
//
// POR QUE um coletor novo: o `ingest_folha_genexus_srvbr.mjs` fala a variante JAVA (`/servlet/wppessoalconsulta`,
// grid com botão EXPORTCSV). Esta é a variante .NET (`wcrhconsultafiltro.aspx`, WorkWithPlus/DVelop) e NÃO tem
// export — os dados saem do grid paginado. Assinatura do produto: `gxcfg.js` + `DVelop/Shared/WorkWithPlusCommon.js`.
// Descoberto em 16/ago/2026 no levantamento de SP ([[pnigp-sp-mapa-folha-645]], [[pnigp-portal-proprio-e-white-label]]).
//
// ⭐ O CAMINHO (nada disso se adivinha pela URL — a rota direta devolve página VAZIA, precisa da sessão do clique):
//   /home → clicar `a[href="#Recursos-Humanos"]` → clicar o LinkButton "Servidores" → tela `/filtros-recursoshumanos`
//   → `#vORGAO_MPAGE` (1=Legislativo, 2=EXECUTIVO) · `#vEXERCICIO_MPAGE` (ano) · combo de MÊS → `#W0012BTNENTER`
//   → `/resultado-recursoshumanos`, grid `#GridContainerTbl`, paginado por `#vGRIDCURRENTPAGE`.
//   Colunas: Matrícula · Nome · Organograma · Centro Custo · Função · Vínculo · Rem. Base · Rem. Bruta · Descontos · Líquida
//   (Organograma = secretaria; Função = cargo — os três campos do critério do Bento.)
//
// Uso: UF=SP node scripts/ingest_folha_gxrh.mjs   ·   SO=Cajati   ·   REFAZ=1   ·   BASE=https://... MUN=Nome
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const ANO = Number(process.env.ANO || new Date().getFullYear());
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const money = (s) => { if (s == null) return null; const t = String(s).replace(/\s/g, "").replace(/\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };

await q(`create table if not exists folha_servidores_gxrh (
  cod_ibge text, municipio text, uf text, base_url text, competencia text, orgao text,
  matricula text, nome text, organograma text, secretaria text, centro_custo text, cargo text, vinculo text,
  remuneracao_base numeric, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_gxrh_mun on folha_servidores_gxrh (cod_ibge, competencia)`);
await q(`create table if not exists folha_gxrh_coleta (
  cod_ibge text primary key, municipio text, uf text, base_url text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

// ── alvos: portais com a assinatura /home que o diagnóstico profundo abriu ────────────────────────────────────
let alvos;
if (process.env.BASE) {
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br where lower(nome)=lower($1) ${process.env.UF ? "and uf=$2" : ""} limit 1`,
    process.env.UF ? [process.env.MUN, process.env.UF] : [process.env.MUN])).rows[0];
  alvos = [{ ...mun, base: process.env.BASE }];
} else {
  const par = [];
  const filtroUF = process.env.UF ? `and left(d.cod_ibge,2) = $${par.push({ SP: "35", PR: "41", RS: "43", SC: "42", MG: "31" }[process.env.UF] || "35")}` : "";
  const filtroSO = SO ? `and d.municipio ilike '%'||$${par.push(SO)}||'%'` : "";
  // 🚨 A UF ERA HARDCODED 'SP'. Doutor Maurício Cardoso e Porto Xavier são do RS (cod_ibge 43…) e entraram na
  // tabela marcados como SP — um município gravado na UF errada não aparece em nenhum levantamento estadual e
  // contamina o do vizinho. A UF sai do CADASTRO, junto com o código ([[pnigp-nunca-digitar-codigo-ibge]]).
  alvos = (await q(`
    select d.cod_ibge, m.nome, m.uf,
           regexp_replace(coalesce(d.url_pessoal, d.url_visitada), '/home.*$|/wptransparenciaportal.*$|/+$', '') base
      from folha_diagnostico_faltante d
      join municipios_br m on m.cod_ibge = d.cod_ibge
     where d.tem_dados
       and coalesce(d.url_pessoal, d.url_visitada) ~* '^https?://[^/]+/(home|wptransparenciaportal)'
       ${filtroUF} ${filtroSO}
     order by m.nome`, par)).rows.filter((a) => a.base && /^https?:\/\//.test(a.base));
}
const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_gxrh_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => a.cod_ibge && !feitos.has(a.cod_ibge));
console.log(`[gxrh] ${alvos.length} portais · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_gxrh
      (cod_ibge,municipio,uf,base_url,competencia,orgao,matricula,nome,organograma,secretaria,centro_custo,cargo,
       vinculo,remuneracao_base,bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::numeric[],$16::numeric[],
        $17::numeric[],$18::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("base_url"), c("competencia"), c("orgao"), c("matricula"), c("nome"),
       c("organograma"), c("secretaria"), c("centro_custo"), c("cargo"), c("vinculo"), c("remuneracao_base"),
       c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

// lê o grid da página atual pelo CABEÇALHO (a ordem das colunas muda entre portais — mesma lição do SCPI)
const leGrid = (page) => page.evaluate(() => {
  const tb = document.querySelector("#GridContainerTbl");
  if (!tb) return { heads: [], linhas: [] };
  const trs = [...tb.querySelectorAll("tr")];
  const heads = [...(trs[0]?.querySelectorAll("th,td") || [])].map((c) => c.innerText.trim().toLowerCase());
  const linhas = trs.slice(1).map((tr) => [...tr.querySelectorAll("td")].map((c) => c.innerText.trim()))
    .filter((c) => c.some((x) => x));
  return { heads, linhas };
});

let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, linhas = 0, comp = null) =>
    q(`insert into folha_gxrh_coleta (cod_ibge,municipio,uf,base_url,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set base_url=excluded.base_url,
       competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao,
       detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.nome, a.uf, a.base, comp, linhas, situacao, detalhe]);
  // 🚨 CÂMARA NÃO É EXECUTIVO. `transparencia.camarairapuru.sp.gov.br` entrou como se fosse a prefeitura de
  // Irapuru e trouxe 16 pessoas para um município de centenas — somar o legislativo ao executivo infla um e
  // esconde o outro ([[pnigp-entidade-espelho-infla-folha]]). O host denuncia antes de gastar navegador.
  if (/\/\/[^/]*(camara|cmara|clegis|legislativ)/i.test(a.base)) {
    await marca("camara", `host ${a.base} é da CÂMARA, não da prefeitura — outro poder`);
    console.log(`  ⊘ [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: host de câmara, pulado`);
    continue;
  }
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  try {
    await page.goto(`${a.base}/home`, { waitUntil: "networkidle", timeout: 60000 });
    await dorme(2000);
    const rh = page.locator('a[href="#Recursos-Humanos"]').first();
    if (!(await rh.count())) throw new Error("home sem menu Recursos Humanos (não é este produto)");
    await rh.click({ timeout: 15000 });
    await dorme(1500);
    await page.getByText("Servidores", { exact: true }).first().click({ timeout: 20000 });
    await dorme(4000);
    if (!(await page.locator("#vORGAO_MPAGE").count())) throw new Error("tela de filtro não abriu");

    // 🚨🚨 O MÊS NUNCA ERA SELECIONADO. O seletor antigo (`[id*="COMBO_MES"] li, a`) não casava com nada, `meses`
    // vinha VAZIO, e a competência era fabricada como `ANO + (meses.length || 1)` — o número de meses do combo
    // virando número do mês. Todas as coletas saíram de JANEIRO (o default da tela) e só por acaso o rótulo
    // "01" coincidiu com o dado ([[pnigp-filtro-que-nao-aplica-confira-pelo-dado]]).
    //
    // O combo é um ExtendedCombo do WorkWithPlus: um botão que abre `ul.dropdown-menu` com `a[dsc="JULHO"]`.
    // Clicar no `a[dsc]` escreve o número do mês em `#W0012vMES` — e é ESSE input, lido de volta, que prova qual
    // competência a consulta vai usar.
    const abreComboMes = async () => {
      await page.locator("#W0012COMBO_MESContainer_btnGroupDrop").click({ timeout: 15000 });
      await dorme(1200);
    };
    await abreComboMes();
    const meses = await page.locator("#W0012COMBO_MESContainer a[dsc]")
      .evaluateAll((es) => [...new Set(es.map((e) => e.getAttribute("dsc")).filter(Boolean))]);
    if (!meses.length) throw new Error("combo de mês não abriu (o filtro de competência não seria aplicado)");
    await page.keyboard.press("Escape").catch(() => {});
    await dorme(600);

    await page.selectOption("#vORGAO_MPAGE", "2");
    await dorme(2000);
    await page.selectOption("#vEXERCICIO_MPAGE", String(ANO));
    await dorme(2000);

    // ⭐ competência MAIS CHEIA entre as últimas ([[pnigp-competencia-mais-cheia-nao-a-recente]]): a tela abre em
    // JANEIRO, que costuma ser das mais magras do ano.
    const MESES_TESTE = Number(process.env.MESES_TESTE || 3);
    const candidatos = meses.slice(-MESES_TESTE).reverse();
    // 🚨 comparar competências pela 1ª PÁGINA não discrimina nada: o grid abre com 5 linhas por página, então
    // todo mês devolve "5". O que separa é o TOTAL declarado no controle de paginação ("… de N").
    const totalPaginasDe = async () => {
      const t = await page.locator(".rowsperpage button").first().innerText().catch(() => "");
      const m = t.match(/de\s+(\d+)/i);
      return m ? Number(m[1]) : 0;
    };
    let escolha = null;
    for (const nomeMes of candidatos) {
      await abreComboMes();
      await page.locator(`#W0012COMBO_MESContainer a[dsc="${nomeMes}"]`).first().click({ timeout: 15000 });
      await dorme(2200);
      const nMes = Number(await page.locator("#W0012vMES").inputValue().catch(() => 0));
      if (!nMes) throw new Error(`clicar "${nomeMes}" não escreveu em #W0012vMES — filtro não aplicado`);
      await page.locator("#W0012BTNENTER").click({ timeout: 20000 });
      await dorme(5000);
      const n = await totalPaginasDe();
      console.log(`     ${nomeMes} (mês ${nMes}): ${n} páginas`);
      if (!escolha || n > escolha.n) escolha = { nomeMes, nMes, n };
      // volta à tela de filtro para testar o próximo
      if (nomeMes !== candidatos[candidatos.length - 1]) {
        await page.goto(`${a.base}/filtros-recursoshumanos`, { waitUntil: "networkidle", timeout: 60000 });
        await dorme(3000);
      }
    }
    if (!escolha?.n) throw new Error("nenhuma competência devolveu linhas");

    // aplica a escolhida e CONFIRMA pelo input antes de coletar
    await page.goto(`${a.base}/filtros-recursoshumanos`, { waitUntil: "networkidle", timeout: 60000 });
    await dorme(3000);
    await page.selectOption("#vORGAO_MPAGE", "2");
    await dorme(1500);
    await page.selectOption("#vEXERCICIO_MPAGE", String(ANO));
    await dorme(1500);
    await abreComboMes();
    await page.locator(`#W0012COMBO_MESContainer a[dsc="${escolha.nomeMes}"]`).first().click({ timeout: 15000 });
    await dorme(2200);
    const mesAplicado = Number(await page.locator("#W0012vMES").inputValue().catch(() => 0));
    if (mesAplicado !== escolha.nMes) throw new Error(`#W0012vMES ficou em ${mesAplicado}, esperado ${escolha.nMes}`);
    await page.locator("#W0012BTNENTER").click({ timeout: 20000 });
    await dorme(5000);

    const { heads } = await leGrid(page);
    if (!heads.length) throw new Error("grid não montou");
    const ix = (re) => heads.findIndex((h) => re.test(h));
    const col = { mat: ix(/matr/), nome: ix(/^nome/), org: ix(/organograma/), cc: ix(/centro/), func: ix(/fun[çc][ãa]o/),
      vinc: ix(/v[íi]nculo/), base: ix(/base/), bruta: ix(/bruta/), desc: ix(/desconto/), liq: ix(/l[íi]quid/) };

    // ⭐ A PAGINAÇÃO é um dropdown Bootstrap, não o input `vGRIDCURRENTPAGE` (esse não responde e cada `fill`
    // gastava 30s de timeout — 221 páginas = 110 min presos). O controle real:
    //   `.rowsperpage button` abre o menu → `li[val=50]` põe 50 linhas por página (o default é 5!) →
    //   `li.goTo input[type=number]` + o ícone `i.fas.fa-redo` navegam. Subir de 5 para 50 corta as páginas em 10×.
    const abreMenu = async () => { await page.locator(".rowsperpage button").first().click({ timeout: 8000 }).catch(() => {}); await dorme(600); };
    await abreMenu();
    await page.locator('.rowsperpage li[val="50"] a').first().click({ timeout: 8000 }).catch(() => {});
    await dorme(4000);

    const totalDe = async () => {
      const t = await page.locator(".rowsperpage button").first().innerText().catch(() => "");
      const m = t.match(/de\s+(\d+)/i); return m ? Number(m[1]) : 1;
    };
    const totalPag = await totalDe();
    // a competência sai do MÊS QUE A TELA CONFIRMOU ter aplicado, nunca de contagem de opções
    const competencia = `${ANO}${String(escolha.nMes).padStart(2, "0")}`;

    const regs = []; const vistos = new Set();
    let assinaturaAnterior = null;
    for (let pg = 1; pg <= totalPag; pg++) {
      if (pg > 1) {
        await abreMenu();
        await page.locator(".rowsperpage li.goTo input").first().fill(String(pg), { timeout: 8000 }).catch(() => {});
        await page.locator(".rowsperpage li.goTo i").first().click({ timeout: 8000 }).catch(() => {});
        await dorme(3000);
      }
      const { linhas } = await leGrid(page);
      if (!linhas.length) break;
      // guarda contra laço: se a página não mudou de conteúdo, a navegação parou de funcionar
      const assinatura = (linhas[0] || []).join("¦");
      if (assinatura === assinaturaAnterior) { console.log(`     (página ${pg} repetiu o conteúdo — parando)`); break; }
      assinaturaAnterior = assinatura;
      for (const c of linhas) {
        // 🚨 célula vazia tem de virar NULL: gravar '' fez `count(secretaria)` dizer 100% em Monte Mor, que não
        // publica organograma nenhum. String vazia conta em COUNT — a régua mente sem isso.
        const pega = (k) => { const v = col[k] >= 0 && col[k] < c.length ? String(c[col[k]]).trim() : ""; return v || null; };
        // 🚨 as COLUNAS DE DINHEIRO variam por portal: Cajati publica base+bruta+descontos+líquido, Adamantina só
        // o LÍQUIDO, Monte Mor só a BASE. Sem um fallback, esses dois entram como "coletado sem valor" — o mesmo
        // defeito de detector de [[pnigp-sonda-folha-prova-e-a-coleta]]. `bruto` recebe a melhor remuneração que
        // o portal de fato publica, na ordem bruta → base → líquida, e as demais ficam nos seus campos.
        const vBruta = money(pega("bruta")), vBase = money(pega("base")), vLiq = money(pega("liq"));
        const r = {
          cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf, base_url: a.base, competencia, orgao: "PODER EXECUTIVO",
          matricula: pega("mat"), nome: pega("nome"), organograma: pega("org"), secretaria: pega("org"),
          centro_custo: pega("cc"), cargo: pega("func"), vinculo: pega("vinc"),
          remuneracao_base: vBase, bruto: vBruta ?? vBase ?? vLiq,
          descontos: money(pega("desc")), liquido: vLiq,
        };
        if (!r.nome && !r.matricula) continue;
        r._hash = crypto.createHash("md5").update([a.cod_ibge, competencia, r.matricula, r.nome, r.cargo].join("¦")).digest("hex");
        if (vistos.has(r._hash)) continue;
        vistos.add(r._hash); regs.push(r);
      }
      if (regs.length >= LOTE) { await grava(regs.splice(0)); }
    }
    if (regs.length) await grava(regs);
    const n = vistos.size;
    if (!n) { await marca("vazio", `grid sem linhas (${totalPag} páginas anunciadas)`, 0, competencia); vazios++; console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: vazio`); }
    else { await marca("ok", `${totalPag} páginas`, n, competencia); ok++; totalGeral += n; console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${n} servidores (${totalPag} pág.)`); }
  } catch (e) {
    await marca("erro", String(e.message).slice(0, 200));
    falhas++; console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${String(e.message).split("\n")[0].slice(0, 80)}`);
  }
  await page.close().catch(() => {});
}
await browser.close();
console.log(`\n[gxrh] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
