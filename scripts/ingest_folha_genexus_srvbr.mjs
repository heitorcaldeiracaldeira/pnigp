// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_genexus_srvbr.mjs — scraper (Playwright) do portal GeneXus e-transparência hospedado em *.srv.br.
// UNIFICA vários rótulos do Radar: 'fiorilli' (asp.srv.br) e 'instar' (gp.srv.br) usam o MESMO produto GeneXus.
//
// Por que NAVEGADOR e não HTTP: o grid carrega via POST GeneXus (GXState) — o link tokenizado não está no HTML.
// A via rápida é o botão de EXPORT CSV do grid (dump completo, sem paginar de 15 em 15).
//
// v1 (Fiorilli asp) — COMPLETO, tem secretaria:
//   /servlet/wppessoalconsulta → clicar "Relação de Servidores" → setar Folha="TODAS AS FOLHAS" → #EXPORTCSV
//   CSV: Matrícula; Nome; Lotação; Local de Trabalho(=secretaria); Cargo/Função; Folha; Salário Bruto; Base; Líquido
// v2 (gp) — folha só NOME;CARGO;salários (sem secretaria) → tratado num passo futuro (marca 'v2_pendente').
//
// Números: PONTO decimal no CSV (600.19). Encoding latin1. Delimitador ';'.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";
import { consulente } from "./_consulente.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const LIMITE = Number(process.env.LIMITE || 0); // 0 = todos
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_genexus (
  cod_ibge text, municipio text, uf text, base_url text, versao text, competencia text,
  matricula text, nome text, lotacao text, secretaria text, cargo text, folha_tipo text,
  salario_bruto numeric, salario_base numeric, salario_liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_gx_mun on folha_servidores_genexus (cod_ibge)`);
await q(`create table if not exists folha_genexus_coleta (
  cod_ibge text primary key, municipio text, uf text, base_url text, versao text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const num = (s) => {
  if (s == null) return null;
  s = String(s).trim();
  if (!s) return null;
  // CSV vem com PONTO decimal (600.19); mas por segurança trata vírgula pt-BR se aparecer
  const n = s.includes(",") && !/\.\d{2}$/.test(s) ? +s.replace(/\./g, "").replace(",", ".") : +s.replace(/,/g, "");
  return Number.isFinite(n) ? n : null;
};

// parser CSV simples (delimitador ';', pode haver aspas)
function parseCSV(txt) {
  const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return { header: [], rows: [] };
  const split = (l) => l.split(";").map((c) => c.trim().replace(/^"|"$/g, ""));
  const header = split(linhas[0]).map((h) => h.toLowerCase());
  const rows = linhas.slice(1).map(split);
  return { header, rows };
}

// 🚨 a UF de `genexus_srvbr_portal` vem inconsistente — "Mato Grosso", "São Paulo" por extenso ao lado de "SP".
// Gravar isso em `folha_servidores_genexus` deixa o município fora de qualquer filtro por sigla. O cadastro é a
// fonte da UF e do nome, como do código ([[pnigp-nunca-digitar-codigo-ibge]]).
const alvos = (await q(`select p.cod_ibge, m.nome municipio, m.uf, p.base_url, p.home_servlet, p.versao
  from genexus_srvbr_portal p join municipios_br m on m.cod_ibge = p.cod_ibge
  where p.situacao='ok' and p.base_url is not null
  ${SO ? "and m.nome ilike '%'||$1||'%'" : ""} order by p.versao, m.uf, m.nome`, SO ? [SO] : [])).rows;
// REFAZ=1 reprocessa quem ja esta ok — sem isso, conserto de campo nao alcanca quem ja foi coletado
const feitos = process.env.REFAZ === "1" ? new Set() : new Set((await q(`select cod_ibge from folha_genexus_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
let fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
if (LIMITE) fila = fila.slice(0, LIMITE);
console.log(`[genexus_srvbr] ${alvos.length} portais · ${feitos.size} feitos · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map();
  for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_genexus
      (cod_ibge,municipio,uf,base_url,versao,competencia,matricula,nome,lotacao,secretaria,cargo,folha_tipo,
       salario_bruto,salario_base,salario_liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::text[])
      on conflict (_hash) do update set salario_bruto=excluded.salario_bruto, salario_liquido=excluded.salario_liquido,
        _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("base_url"), c("versao"), c("competencia"), c("matricula"),
       c("nome"), c("lotacao"), c("secretaria"), c("cargo"), c("folha_tipo"), c("salario_bruto"),
       c("salario_base"), c("salario_liquido"), c("_hash")]);
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gxfolha-"));
const browser = await chromium.launch({ headless: true });

// baixa o CSV do grid v1 e devolve o texto (latin1)
async function exportaCSV(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.locator("#EXPORTCSV").click(),
  ]);
  const dest = path.join(tmpDir, "f_" + Date.now() + ".csv");
  await download.saveAs(dest);
  const buf = fs.readFileSync(dest);
  fs.unlinkSync(dest);
  // latin1 → utf8
  return Buffer.from(buf).toString("latin1");
}

// 🚨 o mês DEFAULT do grid é o corrente, que costuma ter só a folha COMPLEMENTAR parcial (Apiaí ago: 62 linhas).
// O mês fechado ANTERIOR tem a folha inteira (Apiaí jul: 929). Seta vMES para o mês-alvo (default: corrente-1).
const MES_ALVO = process.env.MES ? Number(process.env.MES) : (new Date().getMonth() || 12); // getMonth é 0-based → corrente-1
const MESES_TESTE = Number(process.env.MESES_TESTE || 3);
// fluxo v1: wppessoalconsulta → "Relação de Servidores" → vMES=mês fechado → (Folha já vem TODAS) → export CSV
async function coletaV1(page, base) {
  // 🚨 IR DIRETO NO SERVLET NÃO FUNCIONA em parte dos portais: sem sessão, o GeneXus desvia para a tela de
  // consentimento (`wpcontrolelgpd`) ou responde 404 no servlet. Pela HOME o link "Gestão de Pessoas" existe e
  // leva ao mesmo `wppessoalconsulta` com a sessão montada. 6 municípios morriam em "locator.click: Timeout"
  // clicando num link que nunca chegou a existir na página.
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await dorme(2000);
  if (/login/i.test(page.url())) throw new Error("portal exige login (gated)");
  const consentir = page.locator('input[value="Confirmar"]').or(page.getByText("Confirmar", { exact: true })).first();
  if (await consentir.count()) { await consentir.click({ timeout: 8000 }).catch(() => {}); await dorme(2500); }
  const linkPessoal = page.locator('a[href*="wppessoalconsulta"]').first();
  if (await linkPessoal.count()) {
    await linkPessoal.click({ timeout: 20000 }).catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await dorme(1500);
  } else {
    await page.goto(`${base}/servlet/wppessoalconsulta`, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
  if (/login/i.test(page.url())) throw new Error("portal exige login (gated)");
  // 🚨 GATE DE IDENTIFICAÇÃO: alguns portais desviam a consulta de pessoal para `wpcontrolelgpd`, que exige NOME,
  // CPF e E-MAIL do solicitante antes de liberar os dados. Identidade de TERCEIRO seria falsidade — vetado. Mas
  // identificar-se com a identidade do PRÓPRIO solicitante é exatamente o que o formulário pede, e o Bento
  // autorizou o uso dos dados dele em 18/ago/2026 (`_consulente.mjs`, valores só em `.env.local`, nunca em log).
  // Sem identidade configurada, o rótulo antigo `gated` continua valendo — o coletor não inventa dado nenhum.
  if (/wpcontrolelgpd/i.test(page.url())) {
    const pedeCpf = await page.locator('input[name="vCPF"], input[id="vCPF"]').count().catch(() => 0);
    let id = null;
    try { id = consulente(); } catch { /* sem identidade: segue o caminho antigo */ }
    if (!pedeCpf || !id || !id.email) {
      throw new Error(pedeCpf
        ? (id && !id.email ? "gated: exige e-mail do solicitante — falta CONSULENTE_EMAIL em .env.local"
                           : "gated: portal exige nome/CPF/e-mail do solicitante (LGPD)")
        : "gated: tela de consentimento LGPD");
    }
    await page.fill("#vNOME", id.nome);          // preenchido em memória, nunca impresso
    await page.fill("#vCPF", id.cpf);
    await page.fill("#vEMAIL", id.email);
    // 🚨 `BTNCONFIRMAR` é o **name** do input, não o id — `#BTNCONFIRMAR` acha ZERO elemento e o coletor morria
    //    em "locator.click: Timeout 20000ms" depois de já ter preenchido tudo. O botão real é `value="Confirmar"`.
    await page.locator('input[name="BTNCONFIRMAR"], #BTNCONFIRMAR, input[value="Confirmar"]').first()
      .click({ timeout: 20000 });
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await dorme(3000);
    // depois de identificar-se o portal volta para a consulta de pessoal; se continuar no gate, não passou
    if (/wpcontrolelgpd/i.test(page.url())) {
      const aviso = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 90);
      throw new Error(`gated: identificação recusada pelo portal — ${aviso}`);
    }
    if (!/wppessoalconsulta/i.test(page.url())) {
      const l = page.locator('a[href*="wppessoalconsulta"]').first();
      if (await l.count()) { await l.click({ timeout: 20000 }).catch(() => {}); await dorme(2000); }
      else await page.goto(`${base}/servlet/wppessoalconsulta`, { waitUntil: "domcontentloaded", timeout: 60000 });
    }
  }
  await page.locator("text=Relação de Servidores").first().click({ timeout: 30000 });
  await page.waitForLoadState("domcontentloaded");
  await dorme(1500);

  // 🚨 A COMPETÊNCIA NÃO PODE SER FABRICADA. Antes daqui saía `2026-${MES_ALVO}` — com o ANO FIXO na string e sem
  // nenhuma prova de que o filtro foi aplicado; quando `option[value=MES_ALVO]` não existia, o `selectOption` era
  // PULADO em silêncio e o CSV vinha do mês default rotulado como o alvo
  // ([[pnigp-filtro-que-nao-aplica-confira-pelo-dado]]).
  //
  // Este portal recarrega no `onchange` (verificado: mês 8 → 62 linhas, 7 → 929, 6 → 923), então não há botão a
  // clicar — mas o `#vMES` LIDO DE VOLTA é a prova de qual competência o CSV traz, e o CSV não tem coluna de mês.
  // ⚠️ o grid monta por POST depois do clique: com o portal lento, um `dorme` fixo devolve a tela ainda sem o
  //    seletor de mês e o município virava "tela sem #vMES" um dia sim, outro não. Espera pelo ELEMENTO.
  await page.waitForSelector("#vMES", { timeout: 30000 }).catch(() => {});
  const mes = page.locator("#vMES");
  if (!(await mes.count())) throw new Error("tela sem #vMES — não dá para saber a competência do CSV");
  const disponiveis = await mes.locator("option").evaluateAll((os) => os.map((o) => Number(o.value)).filter((n) => n >= 1 && n <= 12));
  if (!disponiveis.length) throw new Error("#vMES sem opções");

  // ⭐ competência MAIS CHEIA entre as últimas ([[pnigp-competencia-mais-cheia-nao-a-recente]]): o default é o mês
  // CORRENTE, que traz só a folha complementar parcial — em Apiaí, 62 linhas contra 929 do mês fechado.
  const alvos = process.env.MES ? [Number(process.env.MES)]
    : disponiveis.slice(-MESES_TESTE).reverse();
  let melhor = null;
  for (const m of alvos) {
    if (!disponiveis.includes(m)) continue;
    await mes.selectOption(String(m));
    await dorme(3500);
    const lido = Number(await mes.inputValue());
    if (lido !== m) throw new Error(`#vMES ficou em ${lido} depois de pedir ${m} — filtro não aplicado`);
    const p = parseCSV(await exportaCSV(page));
    if (!melhor || p.rows.length > melhor.parsed.rows.length) melhor = { m, parsed: p };
    if (alvos.length > 1) console.log(`     mês ${m}: ${p.rows.length} linhas`);
  }
  if (!melhor) throw new Error("nenhum mês devolveu CSV");

  // ⭐ FALLBACK: CSV sem coluna de BRUTO → lê do grid (ver varreGrid). O CSV continua sendo o contrato de
  //    contagem: se a varredura não alcançar as linhas dele, fica o CSV, porque coletar menos é pior do que
  //    coletar sem bruto ([[pnigp-subcoleta-defeito-de-fonte]]).
  if (!melhor.parsed.header.some((h) => /bruto/.test(h))) {
    await mes.selectOption(String(melhor.m));
    await dorme(3000);
    try {
      const grid = await varreGrid(page, melhor.parsed.rows.length);
      const temBruto = grid.header.some((h) => /bruto/.test(h));
      console.log(`     CSV sem bruto → grid: ${grid.rows.length}/${melhor.parsed.rows.length} linhas${temBruto ? " COM bruto" : " (sem bruto também)"}`);
      if (temBruto && grid.rows.length >= melhor.parsed.rows.length) melhor.parsed = grid;
    } catch (e) { console.log("     fallback do grid falhou:", String(e.message).slice(0, 60)); }
  }

  // o ANO vem do relógio, não de string fixa — a tela não tem seletor de exercício, então serve o ano corrente.
  // Formato AAAAMM, o mesmo das demais tabelas de folha (antes gravava AAAA-MM, fora do padrão).
  melhor.parsed.competencia = `${new Date().getFullYear()}${String(melhor.m).padStart(2, "0")}`;
  return melhor.parsed;
}

// 🚨 CSV QUE OMITE O BRUTO (Borebi, 18/ago): o export do grid v1 varia por portal. Em Borebi o CSV traz só
// `Total Mês` e `Salário Líquido` — e o líquido (6.530,04) fica MAIOR que o "total" (2.260,49), o que denuncia
// que nenhuma das duas é o bruto. O GRID da mesma tela mostra `Salário Bruto` 8.459,76, `Desconto` 1.929,72 e
// fecha: 8.459,76 − 1.929,72 = 6.530,04. Ou seja, o dado ESTÁ publicado e quem perdia era o meu caminho —
// gravar só o líquido deixaria o município "sem valor" na view ([[pnigp-lista-sem-valor-nao-e-folha]]).
// O grid pagina de 11 em 11, então a varredura só vale como FALLBACK de quem não tem bruto no CSV.
async function varreGrid(page, esperado) {
  const leia = () => page.evaluate(() => {
    const t = document.querySelector("#Grid1ContainerTbl")
      || [...document.querySelectorAll("table")].sort((a, b) => b.rows.length - a.rows.length)[0];
    if (!t || t.rows.length < 2) return { cab: [], linhas: [] };
    const cel = (r) => [...r.cells].map((c) => c.innerText.replace(/\s+/g, " ").trim());
    return { cab: cel(t.rows[0]), linhas: [...t.rows].slice(1).map(cel).filter((l) => l.some(Boolean)) };
  });
  const primeira = await leia();
  if (!primeira.cab.length) throw new Error("grid sem cabeçalho — fallback do DOM não se aplica");
  const vistas = new Map();          // chave da linha → linha (o grid repete a página quando acaba)
  const guarda = (ls) => { let novas = 0; for (const l of ls) { const k = l.join("¦"); if (!vistas.has(k)) { vistas.set(k, l); novas++; } } return novas; };
  guarda(primeira.linhas);
  // 🚨 o paginador do WorkWithPlus é um `<button class="PagingButtonsNext" title="Próximo">` SEM TEXTO no `tfoot`
  //    do grid (os `>>` da tela são só o breadcrumb "Início >> Gestão de Pessoas"). Procurar por texto acha o
  //    breadcrumb, clica nele e a varredura para na primeira página achando que acabou — foi o que aconteceu.
  const proxima = page.locator("button.PagingButtonsNext:not(.gx-grid-paging-disabled)").first();
  for (let pag = 1; pag < 500; pag++) {
    if (esperado && vistas.size >= esperado) break;
    if (!(await proxima.count())) break;
    const antes = vistas.size;
    await proxima.click({ timeout: 15000 }).catch(() => {});
    await dorme(1200);
    const novas = guarda((await leia()).linhas);
    if (!novas || vistas.size === antes) break;   // página repetida = fim da lista
  }
  return { header: primeira.cab.map((h) => h.toLowerCase()), rows: [...vistas.values()] };
}

// ═══ FLUXO v2 (`gp.srv.br`, 21 municípios de MT + 2 da BA) — crackeado em 18/ago/2026 ═════════════════════════
// Nada aqui se parece com o v1: não há `wppessoalconsulta`, nem `#vMES`, nem export CSV.
//   home → `servlet/home_servidor_v2?N` (menu) → **`servlet/folha_pagamento_v2?N`** é a folha.
//   Grid `#example`: NOME · CARGO · TOTAL PROVENTOS · TOTAL DESCONTOS · VALOR LÍQUIDO · STATUS.
//
// 🚨 O `?N` DA URL É A UNIDADE GESTORA, e o select `#UG` entrega o mapa: cada option tem como VALUE a própria
//    rota (`./folha_pagamento_v2?1` = PREFEITURA, `?7` = instituto de previdência, `?8` = **CÂMARA**). Chutar
//    `?1` funcionaria em Alta Floresta e colheria a câmara ou o RPPS noutro município
//    ([[pnigp-entidade-espelho-infla-folha]]). Sem option de prefeitura, o município NÃO é coletado — é o caso
//    de Tangará da Serra, cujo portal registrado é o do consórcio CISM Norte.
//
// 🚨 A tela abre VAZIA e o botão que pesquisa (`#BUTTON1`) é INVISÍVEL: `click()` do Playwright espera
//    visibilidade e estoura timeout, e mexer no `onchange` da competência não carrega nada. O que funciona é
//    disparar o clique por JS — aí o grid vem INTEIRO, sem paginação (Alta Floresta: 2.485 linhas de uma vez).
//    ⚠️ `#BTN_TOGGLE_FILTRO` não ajuda: ele FECHA o painel (que já vem aberto) e esconde os filtros.
async function coletaV2(page, base, municipio) {
  const raiz = base.replace(/\/+$/, "").replace(/\/servlet\/.*$/, "");
  // ⏱️ 120s: Sinop responde o MENU em 0,2s e estoura 60s na folha — município grande, consulta pesada. O host
  //    estar de pé não garante que a folha caiba no timeout padrão.
  await page.goto(`${raiz}/servlet/folha_pagamento_v2?1`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await dorme(3500);
  const ugs = await page.locator("#UG option").evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.text.trim() })));
  if (!ugs.length) throw new Error("tela sem select de UG — folha_pagamento_v2 não respondeu");
  // 🚨 NEM TODA prefeitura se chama "PREFEITURA" no select: em Barra do Bugres, Barra do Garças e Campo Verde a
  //    opção do executivo é só o NOME DO MUNICÍPIO ("BARRA DO BUGRES"), e um filtro por /prefeitura/ descartava
  //    município bom. O critério que funciona é NEGATIVO — tirar câmara, RPPS, consórcio, fundo e autarquia —
  //    e só então preferir quem diz prefeitura/município ([[pnigp-entidade-espelho-infla-folha]]).
  const NAO_EXECUTIVO = /c[âa]mara|legislativ|vereador|previd|instituto|iprev|ipmt|prev\b|consórcio|consorcio|cism|fundo|autarquia|ag[êe]ncia|regula|saae|samae|servi[çc]o aut[ôo]nomo|hospital|funda[çc][ãa]o/i;
  const candidatas = ugs.filter((u) => u.t && !NAO_EXECUTIVO.test(u.t));
  // ⭐ o desempate que funciona é o NOME DO MUNICÍPIO: em Barra do Garças o executivo é "BARRA DO GARCAS" e
  //    sobrava junto a "AGÊNCIA MUNICIPAL DE REGULAÇÃO E FISCALIZAÇÃO – AGIRF". Comparação sem acento e sem caixa.
  const chave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const pref = candidatas.find((u) => /prefeitura|munic[íi]pio/i.test(u.t))
    || candidatas.find((u) => chave(u.t) === chave(municipio))
    || candidatas.find((u) => chave(u.t).includes(chave(municipio)) && chave(u.t).length < chave(municipio).length + 14)
    || (candidatas.length === 1 ? candidatas[0] : null);
  if (!pref) throw new Error(`sem UG do executivo (opções: ${ugs.map((u) => u.t).join(" / ").slice(0, 90)})`);
  const rota = (String(pref.v).match(/\?(\d+)/) || [, "1"])[1];
  if (rota !== "1") { await page.goto(`${raiz}/servlet/folha_pagamento_v2?${rota}`, { waitUntil: "domcontentloaded", timeout: 60000 }); await dorme(3500); }

  const comps = await page.locator("#vCOMPETENCIA_ID option").evaluateAll((os) =>
    os.map((o) => ({ v: o.value, t: o.text.trim() })).filter((o) => /^\d{2}\/\d{4}$/.test(o.t)));
  if (!comps.length) throw new Error("tela sem competências");
  const leGrid = () => page.evaluate(() => {
    const t = document.querySelector("#example") || [...document.querySelectorAll("table")].sort((a, b) => b.rows.length - a.rows.length)[0];
    if (!t || t.rows.length < 2) return { cab: [], linhas: [] };
    const cel = (r) => [...r.cells].map((c) => c.innerText.replace(/\s+/g, " ").trim());
    return { cab: cel(t.rows[0]).map((h) => h.toLowerCase()), linhas: [...t.rows].slice(1).map(cel).filter((l) => l.some(Boolean)) };
  });
  // ⭐ competência MAIS CHEIA entre as 3 últimas, contando PESSOAS ([[pnigp-competencia-mais-cheia-nao-a-recente]])
  // 🚨 O grid é trocado por AJAX: se a leitura vier antes da resposta, sai o grid da competência ANTERIOR com o
  //    rótulo da nova — e nada no HTML denuncia. A guarda é o próprio dado: a impressão digital das linhas TEM
  //    de mudar de um mês para o outro ([[pnigp-filtro-que-nao-aplica-confira-pelo-dado]]). Provado em Alta
  //    Floresta: o mesmo servidor sai 2.874,86 em julho, 3.068,17 em junho e 3.036,25 em maio.
  const digital = (g) => crypto.createHash("md5").update(g.linhas.slice(0, 40).map((l) => l.join("|")).join("\n")).digest("hex");
  let melhor = null, anterior = null;
  for (const c of comps.slice(0, Number(process.env.MESES_TESTE || 3))) {
    await page.selectOption("#vCOMPETENCIA_ID", c.v).catch(() => {});
    await dorme(1500);
    await page.evaluate(() => { const b = document.querySelector("#BUTTON1"); if (b) b.click(); });
    // 🚨 ESPERAR O GRID, não o relógio. Sinop (município grande) devolvia 1 linha com `dorme(6000)` — e como as
    //    competências seguintes viam o mesmo grid de 1 linha, a guarda de digital as descartava e o município
    //    era gravado como `ok` com UMA linha. Cobertura falsa é pior que falha ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
    await page.waitForFunction(() => {
      const t = document.querySelector("#example");
      return t && t.rows.length > 2;
    }, { timeout: 90000 }).catch(() => {});
    await dorme(1500);
    let g = await leGrid();
    // ⚠️ só compara com um grid anterior que valia alguma coisa: quando a competência anterior veio com 1 linha
    //    (carregamento incompleto), a comparação descartava competências BOAS — Sinop perdeu 07/2026 assim.
    if (anterior && g.linhas.length > 2 && digital(g) === anterior) {   // ainda é o grid anterior: espera e relê
      await dorme(6000);
      g = await leGrid();
      if (digital(g) === anterior) { console.log(`     ${c.t}: grid não recarregou — descartada`); continue; }
    }
    if (!g.linhas.length) { console.log(`     ${c.t}: vazia`); continue; }
    anterior = g.linhas.length > 2 ? digital(g) : anterior;
    const pessoas = new Set(g.linhas.map((l) => l[0])).size;
    console.log(`     ${c.t}: ${g.linhas.length} linhas · ${pessoas} pessoas`);
    if (!melhor || pessoas > melhor.pessoas) melhor = { comp: c.t.slice(3) + c.t.slice(0, 2), pessoas, ...g };
  }
  if (!melhor) throw new Error("nenhuma competência devolveu linha");
  // 🚨 uma folha municipal com 1 ou 2 linhas não existe: é grid não carregado. Falhar aqui é o certo — gravar
  //    seria declarar o município coletado e tirá-lo da fila para sempre.
  if (melhor.linhas.length < 3) throw new Error(`grid devolveu só ${melhor.linhas.length} linha(s) — não carregou`);
  return { header: melhor.cab, rows: melhor.linhas, competencia: melhor.comp };
}

// mapeia as colunas do v2 (o grid não tem matrícula, secretaria nem lotação — o portal não publica)
function mapV2(header, row) {
  const g = (re) => { const i = header.findIndex((h) => re.test(h)); return i >= 0 ? row[i] : null; };
  return {
    matricula: null, nome: g(/nome/), lotacao: null, secretaria: null, cargo: g(/cargo/), folha_tipo: null,
    // 🚨 `total proventos` é o BRUTO; `valor líquido` já vem descontado — nunca trocar os dois.
    bruto: g(/proventos/), base: null, liquido: g(/l[ií]quido/),
  };
}

// mapeia colunas do CSV v1 pelo NOME do cabeçalho (robusto a ordem)
function mapV1(header, row) {
  // 🚨 o cabeçalho do GRID tem colunas que o CSV não tem, e duas delas são armadilha: "Lotação" aparece DUAS
  //    vezes (código `02.07.01` e nome `AGUA E ESGOTO`) e "Código do Cargo do Servidor" vem antes de
  //    "Cargo/Função". Pegando a primeira ocorrência, a lotação vira código e o cargo vira número.
  const cod = /c[óo]d(igo)?\b|^cod\.?/;
  const idx = (re) => header.findIndex((h) => re.test(h) && !cod.test(h));
  const ult = (re) => { let i = -1; header.forEach((h, k) => { if (re.test(h) && !cod.test(h)) i = k; }); return i; };
  const g = (re, fim = false) => { const i = fim ? ult(re) : idx(re); return i >= 0 ? row[i] : null; };
  return {
    matricula: g(/matr/), nome: g(/^nome/), lotacao: g(/lota/, true),
    secretaria: g(/local de trabalho|local_de|localtrab/), cargo: g(/cargo|fun[çc]/),
    // 🚨 no GRID há QUATRO colunas que começam com "folha": `Folha Exercicio` (2026), `Folha Id` (1),
    //    `Folha Mes` (JUNHO) e a que interessa, `Folha` (FOLHA NORMAL). O regex antigo aceitava "folha " e
    //    pegava a primeira — Borebi ficou com `folha_tipo = '2026'`, e qualquer veto por tipo de folha erraria.
    folha_tipo: g(/^folha$|^folha;/), bruto: g(/bruto/),
    base: g(/sal[áa]rio base|^base/), liquido: g(/l[ií]quid/),
  };
}

let total = 0, ok = 0, vazios = 0, falhas = 0, pend = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, linhas = 0) =>
    q(`insert into folha_genexus_coleta (cod_ibge,municipio,uf,base_url,versao,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.base_url, a.versao, linhas, situacao, detalhe]);
  const page = await browser.newPage({ acceptDownloads: true });
  try {
    const parsed = a.versao === "v2" ? await coletaV2(page, a.base_url, a.municipio) : await coletaV1(page, a.base_url);
    const { header, rows } = parsed;
    const dataRows = rows.filter((r) => r.length >= 5 && /\d/.test(r.join("")));
    if (!dataRows.length) { await marca("vazio", "csv sem linhas"); vazios++; continue; }
    const competencia = parsed.competencia || "atual";
    const regs = dataRows.map((r) => {
      const m = a.versao === "v2" ? mapV2(header, r) : mapV1(header, r);
      return {
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, base_url: a.base_url, versao: a.versao,
        competencia, matricula: m.matricula, nome: m.nome, lotacao: m.lotacao, secretaria: m.secretaria,
        cargo: m.cargo, folha_tipo: m.folha_tipo, salario_bruto: num(m.bruto), salario_base: num(m.base),
        salario_liquido: num(m.liquido),
        // 🚨 a COMPETÊNCIA entra no hash. Sem ela, o mesmo servidor em dois meses colide na mesma chave — o
        // segundo mês sobrescreve o primeiro em vez de coexistir — e o `do update` nunca corrige um rótulo de
        // competência errado, porque a linha "já existe" ([[pnigp-filtro-que-nao-aplica-confira-pelo-dado]]).
        _hash: crypto.createHash("md5")
          .update([a.cod_ibge, competencia, m.matricula, m.nome, m.cargo, m.folha_tipo, m.bruto].join("¦")).digest("hex"),
      };
    });
    await grava(regs);
    total += regs.length; ok++;
    await marca("ok", null, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${regs.length} linhas`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 160));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  } finally { await page.close(); }
  await dorme(500);
}
await browser.close();
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
console.log(`\n[genexus_srvbr] ${total.toLocaleString("pt-BR")} linhas · ${ok} ok · ${vazios} vazios · ${falhas} falhas · ${pend} v2_pendente`);
await db.end();
