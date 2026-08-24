// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_publicsoft.mjs — folha NOMINAL COM SALÁRIO + SECRETARIA dos municípios PublicSoft (~48, PB/NE).
//
// ⭐ A folha do PublicSoft é servida por ELMAR Tecnologia: `transparencia.elmartecnologia.com.br/FolhaPag?ctx={N}`
// (o site municipal `/portal-da-transparencia/quadro-funcional-.../` embute esse iframe). O `ctx` identifica a
// entidade (ex.: Mamanguape prefeitura = 201110; fundos/autarquias têm outros ctx no dropdown `ecode`).
//
// Grid DevExpress com EXPORTADOR: clicar "Exportar CSV" baixa a folha inteira num CSV (não paginado). O GET direto
// de `/DevHelper/ExportTo` dá 500 fora da sessão ("visible ungrouped DataColumn required") — precisa do navegador
// inicializar o grid (FolhaPag?ctx) antes. Então: Playwright abre FolhaPag?ctx → clica Exportar CSV → captura download.
//
// CSV (latin1, ';'): Nome; CPF; Cargo; Unidade Trabalho; Secretaria; Regime; Dt. Admissão; Vantagens; Descontos; Líquido.
// Dinheiro "R$ 4.249,67". reCAPTCHA v3 invisível NÃO bloqueia (como GovBR).
//
// Uso pontual: CTX=201110 MUN=Mamanguape UF=PB node scripts/ingest_folha_publicsoft.mjs
// Em lote: tabela `publicsoft_ctx` (cod_ibge, ctx) — descoberta pelo iframe no site municipal.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_publicsoft (
  cod_ibge text, municipio text, uf text, ctx text, competencia text,
  nome text, cpf_masc text, cargo text, unidade text, secretaria text, regime text, data_admissao text,
  vantagens numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_ps_mun on folha_servidores_publicsoft (cod_ibge, competencia)`);
await q(`create table if not exists folha_publicsoft_coleta (
  cod_ibge text primary key, municipio text, uf text, ctx text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);
await q(`create table if not exists publicsoft_ctx (cod_ibge text primary key, municipio text, uf text, ctx text, em timestamptz default now())`);

const money = (s) => { if (s == null) return null; const t = String(s).replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };
const txt = (s) => { const v = (s == null ? "" : String(s)).trim(); return v || null; };

function parseCSV(raw) {
  const linhas = raw.split(/\r?\n/).filter((l) => l.trim() && l.includes(";"));
  if (!linhas.length) return [];
  const head = linhas[0].split(";").map((h) => h.trim().toLowerCase());
  const idx = (re) => head.findIndex((h) => re.test(h));
  const iNome = idx(/nome/), iCpf = idx(/cpf/), iCargo = idx(/cargo/), iUnid = idx(/unidade/), iSec = idx(/secretaria/),
    iReg = idx(/regime/), iAdm = idx(/admiss/), iVant = idx(/vantagens/), iDesc = idx(/descontos/), iLiq = idx(/l[íi]quido/);
  return linhas.slice(1).map((l) => {
    const c = l.split(";");
    return { nome: txt(c[iNome]), cpf: txt(c[iCpf]), cargo: txt(c[iCargo]), unidade: txt(c[iUnid]), secretaria: txt(c[iSec]),
      regime: txt(c[iReg]), adm: txt(c[iAdm]), vant: money(c[iVant]), desc: money(c[iDesc]), liq: money(c[iLiq]) };
  }).filter((r) => r.nome);
}

// alvos
let alvos;
if (process.env.CTX) {
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br where lower(nome)=lower($1) ${process.env.UF ? "and uf=$2" : ""} limit 1`, process.env.UF ? [process.env.MUN, process.env.UF] : [process.env.MUN])).rows[0];
  alvos = [{ ...mun, ctx: process.env.CTX }];
} else {
  alvos = (await q(`select c.cod_ibge, m.nome, m.uf, c.ctx from publicsoft_ctx c join municipios_br m on m.cod_ibge=c.cod_ibge
    where c.ctx is not null ${SO ? "and m.nome ilike '%'||$1||'%'" : ""}`, SO ? [SO] : [])).rows;
}
// REFAZ=1 reprocessa quem ja esta ok — sem isso, conserto de campo nao alcanca quem ja foi coletado
const feitos = process.env.REFAZ === "1" ? new Set() : new Set((await q(`select cod_ibge from folha_publicsoft_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => a.cod_ibge && !feitos.has(a.cod_ibge));
console.log(`[publicsoft] ${alvos.length} municípios · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_publicsoft
      (cod_ibge,municipio,uf,ctx,competencia,nome,cpf_masc,cargo,unidade,secretaria,regime,data_admissao,vantagens,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::text[])
      on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("ctx"), c("competencia"), c("nome"), c("cpf_masc"), c("cargo"),
       c("unidade"), c("secretaria"), c("regime"), c("data_admissao"), c("vantagens"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

// 🚨 O NAVEGADOR MORRE em município grande e, sem relançar, a MORTE DELE MATA A PASSADA INTEIRA — o
// `browser.newContext` seguinte estoura com "browser has been closed" e o processo cai no meio da fila.
// Mesmo defeito já corrigido no NucleoGov ([[pnigp-nucleogov-sgservidores-cinco-campos]]).
const abreNavegador = () => chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let browser = await abreNavegador();
const navegadorVivo = async () => {
  if (browser.isConnected()) return;
  console.log("  ⟳ navegador caiu — relançando");
  try { try { await browser.close(); } catch {} } catch { /* já morto */ }
  browser = await abreNavegador();
};
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, linhas = 0) =>
    // 🚨 Uma re-passada NÃO pode rebaixar um veredito que já produziu linhas. Medido em 18/ago: o livro-razão
    // dizia `vazio` para 38 municípios que tinham 20.679 linhas gravadas — a passada nova sobrescreveu o `ok`
    // verdadeiro, e quem lesse o ledger concluiria "não publica" segurando a folha no banco.
    // Agora o novo `vazio` vira `ok_vazio_agora` (o fato é registrado) e a contagem histórica é preservada.
    q(`insert into folha_publicsoft_coleta (cod_ibge,municipio,uf,ctx,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set
       linhas = greatest(excluded.linhas, folha_publicsoft_coleta.linhas),
       situacao = case when excluded.linhas = 0 and folha_publicsoft_coleta.linhas > 0
                       then 'ok_vazio_agora' else excluded.situacao end,
       detalhe = case when excluded.linhas = 0 and folha_publicsoft_coleta.linhas > 0
                      then coalesce(excluded.detalhe,'') || ' (passada nova veio vazia; dado anterior mantido)'
                      else excluded.detalhe end,
       ctx = excluded.ctx, em = now()`,
      [a.cod_ibge, a.nome, a.uf, a.ctx, linhas, situacao, detalhe]);
  await navegadorVivo();
  const ctx = await browser.newContext({ acceptDownloads: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ps-"));
  try {
    // ⚠️ `networkidle` NUNCA fecha aqui (o DevExpress mantém polling) e derrubava o município por timeout de 60s.
    await page.goto(`https://transparencia.elmartecnologia.com.br/FolhaPag?Tab=1&isModal=false&ctx=${a.ctx}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    // ⚠️ espera FIXA de 3,5s produzia "grid sem linhas" em 65 municípios e paginação truncada em 60: sob carga
    //    o DevExpress demora mais. Esperar o grid EXISTIR de fato (até 40s), não um relógio.
    await page.waitForFunction(() => document.querySelectorAll("tr[class*=dxgvDataRow]").length > 0
      || /nenhum registro|no data|não há dados/i.test(document.body.innerText), { timeout: 40000 }).catch(() => {});
    await dorme(1200);
    const comp = await page.evaluate(() => { const c = document.querySelector("#FolhaPagForm_competencia_I"); return c ? c.value : null; });
    // ⭐⭐ EXPORTAR CSV É O CAMINHO PRINCIPAL — e ele FUNCIONA em headless.
    // ⛔ A nota antiga desta linha ("o EXPORT falha em headless: visible ungrouped DataColumn required") estava
    // ERRADA/vencida: aquilo vale para o GET direto de `/DevHelper/ExportTo`, não para o botão. Disparando
    // `{grid}.PerformCallback({OutputFormat:'CSV', isCallBack:true})` — que é o onclick real do botão — o
    // download vem completo. Cabedelo: **3.680 linhas contra 29** da paginação do grid.
    // Por que isso importa: a paginação do DevExpress travava na 1ª página em 40 dos 85 municípios, e o
    // conferidor da RAIS mostrou o padrão (publicsoft com 39% de cobertura média contra 88% do megasoft).
    const viaCSV = await (async () => {
      try {
        const gname = await page.evaluate(() => Object.keys(window).find((k) =>
          /^Folhade[A-Za-z]*\d{6}$/.test(k) && window[k] && typeof window[k].PerformCallback === "function"));
        if (!gname) return null;
        const [dl] = await Promise.all([
          page.waitForEvent("download", { timeout: 120000 }),
          page.evaluate((n) => window[n].PerformCallback({ OutputFormat: "CSV", isCallBack: true }), gname),
        ]);
        const st = await dl.createReadStream();
        const buf = await new Promise((r, j) => { const c = []; st.on("data", (d) => c.push(d)); st.on("end", () => r(Buffer.concat(c))); st.on("error", j); });
        const linhas = buf.toString("latin1").split(/\r?\n/).filter((l) => l.trim());
        if (linhas.length < 2) return null;
        const cab = linhas[0].split(";").map((h) => h.trim().toLowerCase());
        const ix = (re) => cab.findIndex((h) => re.test(h));
        const iN = ix(/nome/), iC = ix(/cpf/), iCa = ix(/cargo/), iU = ix(/unidade/), iS = ix(/secretaria/),
              iR = ix(/regime/), iA = ix(/admiss/), iV = ix(/vantagens/), iD = ix(/descontos/), iL = ix(/l[íi]quido/);
        if (iN < 0) return null;
        return linhas.slice(1).map((l) => { const c = l.split(";").map((x) => x.trim()); return {
          nome: c[iN], cpf: c[iC], cargo: c[iCa], unidade: c[iU], secretaria: c[iS], regime: c[iR],
          adm: c[iA], vant: c[iV], desc: c[iD], liq: c[iL] }; }).filter((r) => r.nome);
      } catch { return null; }
    })();

    // fallback: ler o grid do DOM paginando (clicar "Próximo"). Mapeia por índice de coluna do header.
    // nome do grid (objeto JS global do DevExpress) e total de páginas
    const gridName = await page.evaluate(() => { const m = [...document.querySelectorAll('[id*="FolhadePagamento"]')].map((e) => (e.id.match(/FolhadePagamento\d+/) || [])[0]).filter(Boolean)[0]; return m || null; });
    const colhido = await page.evaluate(async (gname) => {
      const dorme = (ms) => new Promise((f) => setTimeout(f, ms));
      const heads = [...document.querySelectorAll("td[class*=dxgvHeader]")].map((h) => h.innerText.trim().toLowerCase());
      // 🚨 as células de DADOS ficam deslocadas -1 do header (o header tem a coluna "#" a mais). cell = headerIndex-1.
      const col = (re) => { const i = heads.findIndex((h) => re.test(h)); return i > 0 ? i - 1 : i; };
      const ix = { nome: col(/nome/), cpf: col(/cpf/), cargo: col(/cargo/), unidade: col(/unidade/), secretaria: col(/secretaria/), regime: col(/regime/), adm: col(/admiss/), vant: col(/vantagens/), desc: col(/descontos/), liq: col(/l[íi]quido/) };
      const totalItens = +((document.body.innerText.match(/\((\d+)\s*itens\)/) || [])[1] || 0);
      // 🚨 O objeto JS do grid NÃO se chama sempre "FolhadePagamentoN". Quando o nome muda, `grid` ficava null,
      //    o laço quebrava na 1ª volta e o município saía com UMA PÁGINA (29 linhas) e status 'ok' — Amparo,
      //    Baía da Traição, Congo, Cuitegi, todos com o mesmo 29. Mesmo defeito de
      //    [[pnigp-scpi-subcoleta-78-municipios]]. Achar o grid POR CAPACIDADE, não por nome.
      const acheGrid = () => {
        if (gname && window[gname] && window[gname].GetPageCount) return window[gname];
        for (const k of Object.keys(window)) {
          try { const o = window[k];
            if (o && typeof o.GotoPage === "function" && typeof o.GetPageCount === "function") return o;
          } catch { /* acessar algumas chaves de window lança */ }
        }
        return null;
      };
      const grid = acheGrid();
      const totalPag = grid && grid.GetPageCount ? grid.GetPageCount() : (+((document.body.innerText.match(/de\s+(\d+)\s*\(/) || [])[1] || 1));
      const out = []; const vistos = new Set();
      const lerPagina = () => {
        for (const tr of document.querySelectorAll("tr[class*=dxgvDataRow]")) {
          const c = [...tr.querySelectorAll("td")].map((x) => x.innerText.trim());
          const nome = c[ix.nome]; if (!nome) continue;
          const key = nome + "|" + (c[ix.cargo] || "") + "|" + (c[ix.liq] || "");
          if (vistos.has(key)) continue; vistos.add(key);
          out.push({ nome, cpf: c[ix.cpf], cargo: c[ix.cargo], unidade: c[ix.unidade], secretaria: c[ix.secretaria], regime: c[ix.regime], adm: c[ix.adm], vant: c[ix.vant], desc: c[ix.desc], liq: c[ix.liq] });
        }
      };
      lerPagina();
      // 🚨 AQUECIMENTO: a PRIMEIRA chamada de callback depois do load costuma voltar HTTP 200 com corpo VAZIO —
      //    o grid não sai da página 0 e o município era gravado com 29 linhas. Sousa saiu 29/1387 três vezes e,
      //    quando o callback já tinha sido "gasto", trouxe 1.352. Queimar essa primeira chamada de propósito:
      //    ir à última página e voltar à primeira ANTES de começar a colher.
      if (grid && grid.GotoPage && totalPag > 1) {
        for (const alvo of [totalPag - 1, 0]) {
          grid.GotoPage(alvo);
          for (let w = 0; w < 60; w++) { await dorme(300); if (grid.GetPageIndex() === alvo) break; }
        }
        await dorme(600);
        lerPagina();                                   // a volta à página 0 pode ter trazido as mesmas linhas
      }
      // sem objeto do grid, ainda dá para paginar clicando o botão "Próximo" do pager DevExpress
      const clicaProximo = () => {
        const b = [...document.querySelectorAll("td[class*=dxpButton], a[class*=dxpButton], img[class*=dxp]")]
          .find((e) => /pr[óo]ximo|next|>/i.test(e.title || e.alt || e.innerText || ""));
        if (b) { b.click(); return true; }
        return false;
      };
      // 🚨 `NextPage()` NÃO avança neste grid — retorna sem erro e a página continua 0, o que fazia o coletor
      //    parar na 1ª página e gravar 29 linhas como folha inteira. `GotoPage(n)` funciona (dispara o callback
      //    POST /DevHelper/GridViewPartial e troca as linhas). Navegar por ÍNDICE, não por "próximo".
      // ⚠️ desistir na PRIMEIRA página lenta subcoletava as folhas grandes: Pilões/RN (6 páginas) vinha
      //    inteiro e Pilões/PB (17 páginas) parava em 29 de 485. Insistir na mesma página antes de desistir,
      //    e só encerrar após 2 páginas seguidas sem novidade.
      let secas = 0;
      for (let pg = 1; pg < totalPag; pg++) {
        const antes = out.length;
        for (let tent = 0; tent < 2 && out.length === antes; tent++) {
          if (grid && grid.GotoPage) grid.GotoPage(pg);
          else if (!clicaProximo()) { secas = 9; break; }
          // a prova de que o callback terminou é o grid DECLARAR que está na página pedida
          for (let w = 0; w < 80; w++) {
            await dorme(300);
            if (grid && grid.GetPageIndex && grid.GetPageIndex() === pg) break;
          }
          await dorme(500);
          lerPagina();
        }
        if (out.length === antes) { if (++secas >= 2) break; } else secas = 0;
        if (out.length >= totalItens && totalItens) break;
      }
      // `declarado` é o que o PORTAL diz ter — a régua contra a subcoleta silenciosa
      return { linhas: out, declarado: totalItens, paginas: totalPag, temGrid: !!grid };
    }, gridName).catch(() => ({ linhas: [], declarado: 0, paginas: 0, temGrid: false }));
    // o CSV vence sempre que veio, e vence por muito: é a folha inteira contra 1 página do grid
    const rows = (viaCSV && viaCSV.length >= (colhido.linhas?.length || 0)) ? viaCSV : (colhido.linhas || []);
    const origem = rows === viaCSV ? "csv" : "grid";
    if (!rows.length) { await marca("vazio", "grid sem linhas e CSV indisponível"); vazios++; continue; }
    const money = (s) => { if (s == null) return null; const t = String(s).replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };
    const competencia = (comp || "").replace("/", "").replace(/(\d{2})(\d{4})/, "$2$1") || "atual";
    rows.forEach((r) => { r.vant = money(r.vant); r.desc = money(r.desc); r.liq = money(r.liq); });
    const regs = rows.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf, ctx: a.ctx, competencia,
      nome: s.nome, cpf_masc: s.cpf, cargo: s.cargo, unidade: s.unidade, secretaria: s.secretaria, regime: s.regime,
      data_admissao: s.adm, vantagens: s.vant, descontos: s.desc, liquido: s.liq,
      _hash: crypto.createHash("md5").update([a.cod_ibge, competencia, s.nome, s.cargo, s.secretaria, a.ctx].join("¦")).digest("hex"),
    }));
    await grava(regs);
    totalGeral += regs.length; ok++;
    // 🚨 'ok' só quando o colhido bate com o DECLARADO pelo portal. Sem esta régua, uma página de 29 linhas
    //    passava por folha completa. [[pnigp-scpi-subcoleta-78-municipios]]
    const dec = colhido.declarado || 0;
    const faltou = dec && regs.length < dec * 0.95;
    await marca(faltou ? "subcoletado" : "ok",
      faltou ? `portal declara ${dec} itens, colhi ${regs.length} via ${origem} (${colhido.paginas} pág)` : `via ${origem}`,
      regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${regs.length} servidores (${competencia})` +
      (faltou ? `  ⚠️ SUBCOLETADO — portal declara ${dec}` : dec ? ` de ${dec}` : ""));
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  await dorme(600);
}
try { await browser.close(); } catch {}
console.log(`\n[publicsoft] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
