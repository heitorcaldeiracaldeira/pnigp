// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_genexus_wwp.mjs — folha nominal dos portais GeneXus WorkWithPlus auto-hospedados
// em `transparencia.{slug}.{uf}.gov.br`. Achado em 18/ago/2026 em SÃO PAULO: **52 municípios**.
//
// ⭐ POR QUE VALE: o grid de resultado tem os CINCO campos de [[pnigp-folha-municipal-cinco-campos]] —
// Matrícula · Nome · **Organograma (=secretaria)** · Centro Custo · **Função** · Vínculo ·
// **Salário Bruto** · Salário Líquido — e ainda oferece **exportação CSV**. Sem login, sem captcha.
//
// ⚠️ NÃO CONFUNDIR com o outro GeneXus já coletado ([[pnigp-genexus-srvbr-scraper]]):
//   • v1 `s2.asp.srv.br/etransparencia.pm.{mun}.sp/servlet/portal` — outro dialeto, já implementado
//   • v2 `gp.srv.br` — folha só com nome/cargo/salário, marcado `v2_pendente`
//   • **este (WWP)** — auto-hospedado, rota `/filtros-recursoshumanos` → `/resultado-recursoshumanos`
// São o mesmo FORNECEDOR com três telas diferentes; o rótulo "GeneXus" não diz qual coletor serve
// ([[pnigp-rotulo-erp-nao-e-o-portal-da-folha]]).
//
// 🚨 POR QUE PLAYWRIGHT e não HTTP: `GET /filtros-recursoshumanos` direto devolve a CASCA, sem os campos de
// filtro — o estado vem da navegação pelo menu. E o export depende do resultado guardado na sessão, igual ao
// [[pnigp-bsit-gestao-publica-folha]].
//
// 🚨 O botão "Confirmar" é `input#W0012BTNENTER`, NÃO um `<button>` — procurar por `<button>` com texto
// "Confirmar" não acha nada e o coletor conclui "tela sem botão" com a tela na cara.
//
// Uso: node scripts/ingest_folha_genexus_wwp.mjs   ·  SO=Adamantina um município  ·  MESES=3 quantos sondar
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const MESES_SONDA = Number(process.env.MESES || 2);
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

const MES_NOME = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

await q(`create table if not exists folha_servidores_genexus_wwp (
  cod_ibge text, municipio text, uf text, host text, orgao text, cnpj text, competencia text,
  matricula text, nome text, organograma text, centro_custo text, funcao text, vinculo text,
  salario_bruto numeric, salario_liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_gxwwp_mun on folha_servidores_genexus_wwp (cod_ibge, competencia)`);
await q(`create table if not exists folha_genexus_wwp_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const slugDe = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, "");
// "1.234,56" → 1234.56 · vazio → null (nunca 0)
const dinheiro = (v) => {
  const s = String(v ?? "").replace(/R\$/gi, "").replace(/[\s"]/g, "").trim();
  if (!s || !/\d/.test(s)) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Retomada: quem já fechou `ok` fica de fora, salvo REFAZ=1. Sem isso, uma passada interrompida recomeça do
// zero e gasta duas horas repetindo município já coletado ([[pnigp-ordem-retorno-resondar-corrigir-criar]]).
const alvos = (await q(`select p.cod_ibge, p.municipio, p.uf, p.host from genexus_wwp_portal p
  where p.situacao = 'tem_rh'
    ${process.env.REFAZ === "1" ? "" :
      "and not exists (select 1 from folha_genexus_wwp_coleta c where c.cod_ibge = p.cod_ibge and c.situacao = 'ok')"}
  order by p.municipio`)).rows
  // ⚠️ o SO também passa por semAcento: o nome do município é comparado SEM acento, então `SO=Tatuí` nunca
  //    casaria com "Tatui" e o coletor terminava "0 municípios" sem dizer por quê.
  .filter((a) => !SO || new RegExp(semAcento(SO), "i").test(semAcento(a.municipio)));

console.log(`── GeneXus WorkWithPlus · ${alvos.length} municípios ───────────────────────────────`);

// 🚨 o navegador morre em município grande e a morte dele mata a passada inteira se não relançar
const abreNavegador = () => chromium.launch({ headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-certificate-errors"] });
let browser = await abreNavegador();
const navegadorVivo = async () => {
  if (browser.isConnected()) return;
  console.log("  ⟳ navegador caiu — relançando");
  try { await browser.close(); } catch {}
  browser = await abreNavegador();
};

// ── navega do /home até a tela de filtro de servidores ────────────────────────────────────────────────────────
// 🚨 `GET /filtros-recursoshumanos` num contexto NOVO devolve a casca — mas funciona se o `/home` tiver sido
// carregado antes NA MESMA SESSÃO. Eu tinha concluído "a rota direta não serve" testando sem o /home antes,
// e escrevi o coletor inteiro em cima do clique no menu — que quebra em portal com outro tema (Buri,
// Cerquilho e Cesário Lange falharam com "nao_chegou_no_filtro" tendo a rota no HTML).
// A rota direta é o caminho principal; o menu virou só o plano B.
async function ateOFiltro(page, host) {
  const temFiltro = () => page.evaluate(() => ({
    botao: !!document.getElementById("W0012BTNENTER"),
    mes: [...document.querySelectorAll("button")].some((x) =>
      /JANEIRO|FEVEREIRO|MAR|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO/i
        .test(x.innerText || "")),
  }));
  await page.goto(`https://${host}/home`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await dorme(2500);

  await page.goto(`https://${host}/filtros-recursoshumanos`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await dorme(3500);
  let t = await temFiltro();
  if (t.botao && t.mes) return "ok";

  // plano B: o menu
  const clica = async (re) => page.evaluate(async (fonte) => {
    const rx = new RegExp(fonte);
    const e = [...document.querySelectorAll("*")]
      .filter((x) => x.children.length === 0 && rx.test((x.innerText || "").trim()))[0];
    if (!e) return false;
    e.click();
    return true;
  }, re);
  await page.goto(`https://${host}/home`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await dorme(2500);
  if (!(await clica("^Recursos Humanos$"))) return "sem_menu_rh";
  await dorme(3000);
  if (!(await clica("^Servidores$"))) return "sem_item_servidores";
  await dorme(4500);
  t = await temFiltro();
  return t.botao && t.mes ? "ok" : "nao_chegou_no_filtro";
}

// escolhe o ÓRGÃO executivo — o padrão costuma ser o certo, mas há portal que abre no legislativo
async function escolheExecutivo(page) {
  return page.evaluate(() => {
    const s = document.getElementById("vORGAO_MPAGE");
    if (!s) return "sem_seletor";
    const alvo = [...s.options].find((o) => /EXECUTIVO|PREFEITURA/i.test(o.text));
    if (!alvo) return "sem_executivo";
    if (s.value !== alvo.value) { s.value = alvo.value; s.dispatchEvent(new Event("change", { bubbles: true })); }
    return alvo.text.trim();
  });
}

async function mesesDisponiveis(page) {
  return page.evaluate(async () => {
    const b = [...document.querySelectorAll("button")]
      .filter((x) => /JANEIRO|FEVEREIRO|MAR|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO/i
        .test(x.innerText || ""))[0];
    if (!b) return [];
    b.click();
    await new Promise((r) => setTimeout(r, 2000));
    const nomes = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
      "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const vistos = [...document.querySelectorAll("*")]
      .filter((e) => e.children.length === 0)
      .map((e) => (e.innerText || "").trim().toUpperCase())
      .filter((t) => nomes.includes(t));
    document.body.click();
    return [...new Set(vistos)];
  });
}

async function escolheMes(page, nome) {
  return page.evaluate(async (alvo) => {
    const b = [...document.querySelectorAll("button")]
      .filter((x) => /JANEIRO|FEVEREIRO|MAR|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO/i
        .test(x.innerText || ""))[0];
    if (!b) return false;
    if ((b.innerText || "").trim().toUpperCase() !== alvo) {
      b.click();
      await new Promise((r) => setTimeout(r, 1800));
      const op = [...document.querySelectorAll("*")]
        .filter((e) => e.children.length === 0 && (e.innerText || "").trim().toUpperCase() === alvo);
      if (!op.length) return false;
      op[op.length - 1].click();
      await new Promise((r) => setTimeout(r, 1800));
    }
    document.body.click();
    return true;
  }, nome);
}

// 🚨 `input#W0012BTNENTER`, não `<button>`
async function confirma(page) {
  const tem = await page.evaluate(() => {
    const b = document.getElementById("W0012BTNENTER");
    if (!b) return false;
    b.click();
    return true;
  });
  if (!tem) return "sem_botao_confirmar";
  await dorme(9000);
  if (page.url().includes("resultado-recursoshumanos")) return "ok";
  // 🚨 Alguns portais devolvem o usuário para /home ao confirmar, em QUALQUER exercício e pelos dois caminhos
  //    de navegação (testado em Buri com 2026 e 2025). Não é o coletor: o módulo de RH daquela instalação não
  //    entrega resultado. Registrar o motivo EXATO — "nenhuma competencia com registros" mentiria, sugerindo
  //    que o município não publica quando o que existe é uma tela quebrada.
  return page.url().replace(/\/+$/, "").endsWith("/home") ? "voltou_home" : "nao_chegou_no_resultado";
}

// 🚨 `Grid_Recordcount` existe no GXState do HTML CRU, mas some depois que a SPA renderiza — `page.content()`
// devolve o DOM, não o JSON inicial, e a leitura volta `undefined`. O que sobra na tela é o rodapé do
// paginador: "Página 1 de 309". Não é a contagem de registros, é a de PÁGINAS — serve para comparar
// competências (é monotônico no volume), e o número real de linhas sai do CSV exportado.
async function contaPaginas(page) {
  return page.evaluate(() => {
    const m = document.body.innerText.match(/P[áa]gina\s+\d+\s+de\s+([\d.]+)/i);
    if (m) return Number(m[1].replace(/\./g, ""));
    // sem paginador: uma página só — conta as linhas do grid
    return document.querySelectorAll("tbody tr").length ? 1 : 0;
  });
}

// ── export CSV ────────────────────────────────────────────────────────────────────────────────────────────────
async function exportaCSV(page, formato = "CSV") {
  const abriu = await page.evaluate(() => {
    const b = document.getElementById("DDO_ACTIONGROUPEXPORTContainer_btnGroupDrop");
    if (!b) return false;
    b.click();
    return true;
  });
  if (!abriu) return null;
  await dorme(1800);
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 120000 }).catch(() => null),
    page.evaluate((fmt) => {
      const itens = [...document.querySelectorAll("#DDO_ACTIONGROUPEXPORTContainer *")]
        .filter((e) => e.children.length === 0 && (e.innerText || "").trim().toUpperCase() === fmt);
      if (!itens.length) return false;
      itens[itens.length - 1].click();
      return true;
    }, formato),
  ]);
  if (!dl) return null;
  const fluxo = await dl.createReadStream();
  const pedacos = [];
  for await (const p of fluxo) pedacos.push(p);
  return Buffer.concat(pedacos);
}

// o CSV do GeneXus varia de codificação por instalação — decidir pelo BUFFER, não pelo cabeçalho
function decodeCSV(buf) {
  const utf8 = buf.toString("utf8");
  return utf8.includes("�") ? buf.toString("latin1") : utf8;
}

function lerCSV(txt) {
  const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return { cab: [], dados: [] };
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ";" : ",";
  const parte = (l) => {
    const out = []; let cur = "", aspas = false;
    for (const ch of l) {
      if (ch === '"') aspas = !aspas;
      else if (ch === sep && !aspas) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  // O export pode trazer linhas de TÍTULO antes do cabeçalho. 🚨 Nem todo portal publica o NOME: Monte Mor
  // exporta `Matrícula;Função;SALÁRIO BASE;…;SALÁRIO BRUTO` e mais nada — folha anônima. Ancorar o cabeçalho
  // só em "Nome" fazia o coletor rejeitar o arquivo ("CSV sem cabecalho reconhecivel") e esconder que a
  // limitação é da FONTE, não do parser. Aceita-se "Nome" OU "Matrícula".
  // ⚠️ Itararé exporta só `Organograma;Função` — sem Nome e sem Matrícula. Ancorar em "Nome" fazia o
  //    arquivo ser rejeitado como ilegível, quando o que existe é uma folha SEM VALOR ([[pnigp-lista-sem-valor-nao-e-folha]]).
  //    Reconhece-se o cabeçalho por qualquer coluna conhecida; quem julga o que falta é a checagem adiante.
  const iCab = linhas.findIndex((l) =>
    /(^|;|,)\s*"?(Nome|Matr[íi]cula|Organograma|Fun[çc][ãa]o)"?\s*(;|,|$)/i.test(l));
  if (iCab < 0) return { cab: [], dados: [] };
  const cab = parte(linhas[iCab]).map((c) => semAcento(c).toUpperCase().replace(/[^A-Z]/g, ""));
  const dados = linhas.slice(iCab + 1).map(parte).filter((c) => c.length >= cab.length - 1);
  return { cab, dados };
}

// ── principal ─────────────────────────────────────────────────────────────────────────────────────────────────
let ok = 0, servidores = 0;
for (const p of alvos) {
  process.stdout.write(`  ${p.municipio.padEnd(26)} `);
  let r = { situacao: "erro", detalhe: null, linhas: 0, competencia: null };
  let ctx = null;
  try {
    await navegadorVivo();
    ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
    const page = await ctx.newPage();

    const passo = await ateOFiltro(page, p.host);
    if (passo !== "ok") throw new Error(passo);

    // identidade: o cabeçalho tem de falar do município certo ([[pnigp-fila-erp-homonimo-contamina-uf]])
    const cab = await page.evaluate(() =>
      (document.getElementById("TEXTBLOCKTITLE_MPAGE") || {}).innerText || "");
    if (!slugDe(cab).includes(slugDe(p.municipio).slice(0, Math.max(5, Math.floor(slugDe(p.municipio).length * 0.7)))))
      throw new Error(`identidade: cabecalho diz "${cab.trim().slice(0, 50)}"`);

    const orgao = await escolheExecutivo(page);
    if (orgao === "sem_executivo") throw new Error("portal sem orgao executivo");
    const cnpj = await page.evaluate(() => (document.getElementById("W0012vCNPJAUX") || {}).value || null);

    const meses = await mesesDisponiveis(page);
    if (!meses.length) throw new Error("sem meses no filtro");
    // ⭐ competência MAIS CHEIA e não a mais recente ([[pnigp-competencia-mais-cheia-nao-a-recente]])
    const candidatas = meses.slice(-MESES_SONDA).reverse();
    let melhor = null;
    let ultimoMotivo = null;
    for (const m of candidatas) {
      if (!(await escolheMes(page, m))) { ultimoMotivo = ultimoMotivo || "mes_nao_selecionou"; continue; }
      const chegou = await confirma(page);
      if (chegou !== "ok") { ultimoMotivo = chegou; continue; }
      const n = await contaPaginas(page);
      if (n != null && (!melhor || n > melhor.n)) melhor = { mes: m, n };
      if (candidatas.length > 1) { const v = await ateOFiltro(page, p.host); if (v !== "ok") break; }
    }
    if (!melhor || !melhor.n) throw new Error(ultimoMotivo || "nenhuma competencia com registros");

    if (candidatas.length > 1) {
      await ateOFiltro(page, p.host);
      await escolheExecutivo(page);
      await escolheMes(page, melhor.mes);
      if ((await confirma(page)) !== "ok") throw new Error("nao voltou ao resultado da melhor competencia");
    }

    // ⭐ DUMP=1: fotografa o GRID na tela ANTES de exportar. Existe porque o CSV do GeneXus pode OMITIR colunas
    //    que o grid mostra ([[pnigp-portal-exige-identificacao-consulente]] — Campinas): declarar "fonte_sem_valor"
    //    pelo cabeçalho do CSV pode estar acusando a fonte errada.
    if (process.env.DUMP === "1") {
      const g = await page.evaluate(() => {
        // a maior tabela pode ser a de LAYOUT: escolher a que tem o cabeçalho "Matrícula"/"Nome"
        const tabs = [...document.querySelectorAll("table")];
        const tb = tabs.find((t) => /matr[íi]cula/i.test(t.rows[0]?.innerText || "") && t.rows.length > 1)
          || tabs.sort((a, b) => b.rows.length - a.rows.length)[0];
        if (!tb) return { erro: "sem tabela no resultado" };
        const txt = (r) => [...r.cells].map((c) => (c.innerText || "").trim());
        const dados = [...tb.rows].slice(1).filter((r) => txt(r).join("").trim().length > 3);
        return { id: tb.id, classe: tb.className, linhas: tb.rows.length, dados: dados.length,
          cab: txt(tb.rows[0]), d1: dados[0] ? txt(dados[0]) : [], d2: dados[1] ? txt(dados[1]) : [],
          paginador: (document.body.innerText.match(/P[áa]gina\s+\d+\s+de\s+[\d.]+/i) || [""])[0] };
      }).catch((e) => ({ erro: String(e).slice(0, 60) }));
      console.log(`
  === GRID de ${p.municipio || p.nome} ===`);
      console.log("  tabela:", g.id, "|", g.classe, "| linhas:", g.linhas, "| dados:", g.dados, "|", g.paginador);
      console.log("  cabeçalho do GRID:", JSON.stringify(g.cab || g.erro));
      console.log("  linha 1:", JSON.stringify(g.d1 || []));
      console.log("  linha 2:", JSON.stringify(g.d2 || []));
      const ctrl = await page.evaluate(() => {
        const sels = [...document.querySelectorAll("select")].map((e) => ({
          id: e.id, nome: e.name, valor: e.value,
          ops: [...e.options].map((o) => `${o.value}=${o.text}`.trim()).slice(0, 12) }));
        const exp = [...document.querySelectorAll("#DDO_ACTIONGROUPEXPORTContainer *")]
          .filter((e) => e.children.length === 0 && (e.innerText || "").trim())
          .map((e) => (e.innerText || "").trim());
        const pag = [...document.querySelectorAll("[id*=PAGINATION i] *, [class*=Pagination] *")]
          .filter((e) => e.children.length === 0 && (e.innerText || "").trim())
          .map((e) => (e.innerText || "").trim()).slice(0, 20);
        return { sels, exp: [...new Set(exp)], pag: [...new Set(pag)] };
      }).catch(() => ({}));
      console.log("  selects   :", JSON.stringify(ctrl.sels || []));
      console.log("  exportar  :", JSON.stringify(ctrl.exp || []));
      console.log("  paginador :", JSON.stringify(ctrl.pag || []));
      for (const fmt of ["CSV", "TXT"]) {
        const bt = await exportaCSV(page, fmt);
        if (!bt) { console.log(`  ${fmt}: não baixou`); continue; }
        const fs = await import("node:fs");
        const dest = `${process.env.TMPDIR || "."}/gxwwp_${fmt}.bin`;
        fs.writeFileSync(dest, bt);
        console.log(`  ${fmt} gravado em ${dest}`);
        const t = decodeCSV(bt).split(/\r?\n/).filter((l) => l.trim()).slice(0, 3);
        console.log(`  ${fmt} (${bt.length} bytes) — 3 primeiras linhas:`);
        for (const l of t) console.log("     ", l.slice(0, 220));
      }
    }
    const buf = await exportaCSV(page);
    if (!buf) throw new Error("export CSV nao baixou");
    const { cab: colunas, dados } = lerCSV(decodeCSV(buf));
    if (!colunas.length) throw new Error("CSV sem cabecalho reconhecivel");

    // ⭐⭐ 19/ago — O CABEÇALHO DA EXPORTAÇÃO VEM TRUNCADO; O DINHEIRO ESTÁ NOS DADOS, SEM RÓTULO.
    // Andradina exporta `Matrícula;Nome;Organograma;Função;Vínculo` (5 rótulos) e cada linha traz **8 campos**:
    //   7519001;ABIGAIL…;VIGILÂNCIA…;AGENTE…;Servidor…;  4.731,94;  -1.299,90;  3.432,04
    // Os três últimos são Salário Bruto, Desconto Total e Salário Líquido — que o GRID mostra rotulados e o
    // arquivo entrega mudos. Casando coluna por NOME, o coletor não achava nada e carimbava `fonte_sem_valor`
    // em 8 municípios de SP (~5.900 servidores) que publicam salário. É a mesma família da lei do rótulo
    // ([[pnigp-rotulo-da-coluna-de-dinheiro-varia]]): ali o rótulo mudava, aqui ele SOME.
    //
    // ⚠️ Alinhar o grid posicionalmente estaria ERRADO: o grid tem 9 rótulos (inclui "Centro Custo") e o
    //    arquivo só 8 campos — o Centro Custo não é exportado. Por isso só se batiza o EXCEDENTE, e só quando
    //    a quantidade de rótulos de dinheiro do grid bate exatamente com a de campos sem rótulo. Não batendo,
    //    o veredito honesto continua sendo `fonte_sem_valor` ([[pnigp-lista-sem-valor-nao-e-folha]]).
    const largura = dados.length ? Math.max(...dados.slice(0, 50).map((d) => d.length)) : 0;
    const sobra = largura - colunas.length;
    let rotulosDoGrid = null;
    if (sobra > 0) {
      const doGrid = await page.evaluate(() => {
        const tabs = [...document.querySelectorAll("table")];
        const tb = tabs.find((t) => /matr[íi]cula/i.test(t.rows[0]?.innerText || "") && t.rows.length > 1);
        return tb ? [...(tb.rows[0]?.cells || [])].map((c) => (c.innerText || "").trim()).filter(Boolean) : [];
      }).catch(() => []);
      const dinheiro = doGrid.map((c) => semAcento(c).toUpperCase().replace(/[^A-Z]/g, ""))
        .filter((c) => /BRUT|LIQUID|DESCONT|PROVENT|VENCIMENT|REMUNERA/.test(c));
      if (dinheiro.length === sobra) {
        colunas.push(...dinheiro);
        rotulosDoGrid = dinheiro.join("+");
        console.log(`     ⭐ cabeçalho truncado: ${sobra} coluna(s) sem rótulo batizadas pelo GRID → ${rotulosDoGrid}`);
      } else {
        console.log(`     ⚠️ ${sobra} campo(s) sem rótulo e ${dinheiro.length} rótulo(s) de dinheiro no grid — não bate, não adivinho`);
      }
    }

    const idx = (...nomes) => { for (const n of nomes) { const i = colunas.indexOf(n); if (i >= 0) return i; } return -1; };
    const iMat = idx("MATRICULA"), iNome = idx("NOME"), iOrg = idx("ORGANOGRAMA"),
      iCC = idx("CENTROCUSTO"), iFun = idx("FUNCAO"), iVin = idx("VINCULO");
    // 🚨 19/ago: casar a coluna de dinheiro por NOME EXATO (`SALARIOBRUTO`/`BRUTO`) deixou **25 municípios**
    //    marcados `fonte_sem_valor` com o dinheiro ali, publicado, sob outro rótulo. Cada instalação do WWP
    //    batiza a coluna do seu jeito — medido no `detalhe` do próprio ledger:
    //      SALBRUTO (Tatuí, São Manuel, Itariri, Iporanga) · REMUNERACAOBRUTA (Ibiúna, Registro, Cajati) ·
    //      VALORBRUTO (Ribeirão Branco) · PROVENTOS (Porangaba) · VENCIMENTOS (Igaratá, Ilha Comprida) ·
    //      REMUNERACAO (Tarumã) · SALBASE + VANTAGENSPESSOAIS (Ipaussu)
    //    ⚠️ A ORDEM importa: `REMUNERACAOBASE` e `SALBASE` são VENCIMENTO BASE, não o bruto — entram por
    //    último, só quando não há nada melhor, senão o salário sai menor que o real.
    //    ⛔ Nunca casar "DESC*" (desconto) nem "LIQUID*" como bruto.
    const acha = (regexes) => { for (const re of regexes) { const i = colunas.findIndex((c) => re.test(c)); if (i >= 0) return i; } return -1; };
    const iBru = acha([/^(SALARIO|SAL|VALOR|REMUNERACAO)?BRUT[AO]$/, /^PROVENTOS?$/, /^VENCIMENTOS?$/,
                       /^REMUNERACAO$/, /^(SAL|REMUNERACAO)BASE$/, /BRUT[AO]/]);
    const iLiq = acha([/^(SALARIO|SAL|VALOR|REMUNERACAO)?LIQUID[AO]$/, /LIQUID[AO]/]);
    // Sem nome ainda é dado útil (matrícula + função + salário), mas NÃO é folha nominal — o ledger tem de
    // dizer isso, senão o município conta como resolvido e ninguém volta lá.
    // O veredito tem de NOMEAR o que falta: "erro de CSV" faria alguém voltar a mexer no parser, quando o
    // que resta é acionar a LAI.
    if (iBru < 0) throw new Error(`fonte_sem_valor: colunas = ${colunas.slice(0, 8).join(",")}`);
    // 🚨 19/ago: faltar CARGO derrubava a coleta inteira, e isso está errado. A régua de folha nominal é
    //    **nome + remuneração** ([[pnigp-lista-sem-valor-nao-e-folha]]); o cargo é desejável, não é o teste.
    //    Joanópolis publica `MATRICULA,NOME,SALBRUTO,SALLIQUIDO,ABONOFUNDEB…` — 630 servidores com nome e
    //    salário — e o `throw` os jogava fora inteiros para punir a ausência de uma coluna acessória.
    //    Agora entra com `funcao` nula e o ledger diz `ok_sem_cargo`, para ninguém confundir com folha completa.
    const semCargo = iFun < 0;
    // Sem nome ainda é dado útil (matrícula + função + salário), mas NÃO é folha nominal.
    const semNome = iNome < 0;

    const mesNum = MES_NOME.indexOf(melhor.mes) + 1;
    const ano = new Date().getFullYear();
    // 🚨 O PADRÃO DO PROJETO É `AAAAMM`, sem hífen — é o que `verifica_competencia_folha.mjs` exige e o que as
    //    outras ~100 tabelas de folha gravam. Este coletor voltou a escrever `AAAA-MM` e o resultado foi a mesma
    //    pessoa em DUAS linhas (`202606` da coleta antiga × `2026-06` da nova), com a agravante de tornar a
    //    de-duplicação impossível: nada casava por competência ([[pnigp-competencia-invariante-verificador]]).
    const competencia = `${ano}${String(mesNum).padStart(2, "0")}`;

    let novas = 0;
    for (let i = 0; i < dados.length; i += 400) {
      const lote = dados.slice(i, i + 400);
      const vals = [], params = [];
      let k = 1;
      for (const d of lote) {
        const h = crypto.createHash("md5").update([p.cod_ibge, competencia, d[iMat] || "", d[iNome] || "",
          d[iOrg] || "", d[iFun] || "", d[iBru] || ""].join("|")).digest("hex");
        vals.push(`($${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++})`);
        params.push(p.cod_ibge, p.municipio, p.uf, p.host, orgao, cnpj, competencia,
          d[iMat] || null, semNome ? null : d[iNome] || null, iOrg >= 0 ? d[iOrg] || null : null,
          iCC >= 0 ? d[iCC] || null : null, iFun >= 0 ? d[iFun] || null : null,
          iVin >= 0 ? d[iVin] || null : null, dinheiro(d[iBru]), dinheiro(d[iLiq]), h);
      }
      const res = await q(`insert into folha_servidores_genexus_wwp
        (cod_ibge, municipio, uf, host, orgao, cnpj, competencia, matricula, nome, organograma,
         centro_custo, funcao, vinculo, salario_bruto, salario_liquido, _hash)
        values ${vals.join(",")} on conflict (_hash) do nothing`, params);
      novas += res.rowCount;
    }
    // linhas = o que a FONTE deu, não o que o insert gravou ([[pnigp-resumo-conta-tabela-nao-execucao]])
    // ⭐ a PROVA de onde veio o dinheiro viaja com o veredito: quando o rótulo foi recuperado do grid, o
    //    ledger tem de dizer qual, senão ninguém consegue revisar sem refazer a coleta.
    r = { situacao: semNome ? "ok_sem_nome" : semCargo ? "ok_sem_cargo" : "ok", linhas: dados.length, competencia,
      detalhe: [novas !== dados.length ? `${novas} novas` : null,
                rotulosDoGrid ? `rótulo do dinheiro veio do GRID (cabeçalho do export truncado): ${rotulosDoGrid}` : null,
                semCargo ? `sem coluna de CARGO na fonte: ${colunas.slice(0, 8).join(",")}` : null,
               ].filter(Boolean).join(" · ") || null };
  } catch (e) {
    const msg = String(e.message || e);
    r = { situacao:
        /identidade|legislativ/.test(msg) ? "identidade"
      : /fonte_sem_valor/.test(msg) ? "fonte_sem_valor"
      : /fonte_sem_cargo/.test(msg) ? "fonte_sem_cargo"
      : /voltou_home/.test(msg) ? "portal_sem_resultado"
      : "erro",
      detalhe: msg.slice(0, 180), linhas: 0, competencia: null };
  } finally {
    try { await ctx?.close(); } catch {}
  }
  await q(`insert into folha_genexus_wwp_coleta
    (cod_ibge, municipio, uf, host, competencia, linhas, situacao, detalhe, em)
    values ($1,$2,$3,$4,$5,$6,$7,$8, now())
    on conflict (cod_ibge) do update set
      linhas = greatest(excluded.linhas, folha_genexus_wwp_coleta.linhas),
      -- ⭐ re-passada não rebaixa veredito ([[pnigp-repassada-nao-pode-rebaixar-veredito]])
      situacao = case when excluded.linhas = 0 and folha_genexus_wwp_coleta.linhas > 0
                      then folha_genexus_wwp_coleta.situacao else excluded.situacao end,
      competencia = coalesce(nullif(excluded.competencia, ''), folha_genexus_wwp_coleta.competencia),
      detalhe = excluded.detalhe, host = excluded.host, em = now()`,
    [p.cod_ibge, p.municipio, p.uf, p.host, r.competencia, r.linhas, r.situacao, r.detalhe]);
  if (/^ok/.test(r.situacao)) { ok++; servidores += r.linhas; }
  console.log(`${r.situacao.padEnd(12)} ${String(r.linhas).padStart(6)} ${r.competencia || ""} ${r.detalhe || ""}`);
}
console.log(`\n  ✔ ${ok}/${alvos.length} municípios · ${servidores.toLocaleString("pt-BR")} servidores`);
try { await browser.close(); } catch {}
await db.end();
