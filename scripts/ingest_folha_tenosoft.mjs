// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_tenosoft.mjs — folha nominal dos municípios TENOSOFT (43 mapeados, quase todos em PE).
//
// ⭐ PORTAL ÚNICO: todos os municípios vivem em `cloud.tenosoft.com.br/portal`, separados por `?entidade=N`.
// Descoberta em 2 saltos: site institucional do município → link para cloud.tenosoft.com.br → captura o `entidade`.
//
// A CADEIA (ScriptCase, exige navegador):
//   1. pt_conexao.php?appURL=sai_servidor&entidade=N   → tela "SERVIDORES" (menu de opções)
//   2. o item "REMUNERAÇÃO NOMINAL DE CADA SERVIDOR" NÃO é link comum: é `nm_gp_submit5(destino, origem, params,
//      '_blank', …)` — abre em POPUP. Clicar não navega a página atual; é preciso capturar a nova aba.
//   3. no popup, o filtro (Ano/Mês/Vínculo/Lotação/Cargo) só devolve dados após clicar `#sc_b_pesq_bot`.
//   4. o grid traz Nome · Matrícula · Tipo Folha · Cargo/Função · Carga Horária · LOTAÇÃO · Bruto · Descontos ·
//      Líquido — os cinco campos, com secretaria declarada pela fonte.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const SO_DESCOBRIR = process.env.DESCOBRIR === "1";
const RECUO = Number(process.env.RECUO || 6);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const BASE = "https://cloud.tenosoft.com.br/portal";

await q(`create table if not exists tenosoft_portal (
  cod_ibge text primary key, municipio text, uf text, entidade text, detalhe text, em timestamptz default now()
)`);
await q(`create table if not exists folha_servidores_tenosoft (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  matricula text, nome text, cargo text, lotacao text, secretaria text, tipo_folha text, carga_horaria text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_teno_mun on folha_servidores_tenosoft (cod_ibge, competencia)`);
await q(`create table if not exists folha_tenosoft_coleta (
  cod_ibge text primary key, municipio text, uf text, entidade text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = +t; return Number.isFinite(n) ? n : null;
};

// ── FASE 1: descoberta do `entidade` pelo site institucional ────────────────────────────────────────────────────
if (SO_DESCOBRIR) {
  const alvos = (await q(`select distinct on (r.cod_ibge) r.cod_ibge, r.municipio, r.uf, r.url_portal
    from radar_portal r where r.erp='tenosoft' and r.url_portal is not null ${SO ? "and r.municipio ilike '%'||$1||'%'" : ""}
    order by r.cod_ibge`, SO ? [SO] : [])).rows;
  console.log(`[tenosoft/descoberta] ${alvos.length} municípios`);
  for (const a of alvos) {
    let ent = (String(a.url_portal).match(/entidade=(\d+)/) || [])[1] || null;
    if (!ent) {
      try {
        const r = await fetch(a.url_portal, { headers: { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0)" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
        const txt = new TextDecoder("iso-8859-1").decode(await r.arrayBuffer());
        ent = (txt.match(/cloud\.tenosoft\.com\.br[^"'<>\s]*entidade=(\d+)/i) || [])[1] || null;
      } catch { /* site fora do ar */ }
    }
    await q(`insert into tenosoft_portal (cod_ibge,municipio,uf,entidade,detalhe,em) values ($1,$2,$3,$4,$5,now())
      on conflict (cod_ibge) do update set entidade=coalesce(excluded.entidade, tenosoft_portal.entidade),
      detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, ent, ent ? null : "entidade não encontrada no site institucional"]);
    console.log(`  ${a.uf} ${String(a.municipio).padEnd(24)} entidade=${ent || "?"}`);
  }
  const n = (await q(`select count(*) filter (where entidade is not null)::int com, count(*)::int tot from tenosoft_portal`)).rows[0];
  console.log(`[tenosoft/descoberta] ${n.com}/${n.tot} com entidade`);
  await db.end();
  process.exit(0);
}

// ── FASE 2: coleta ──────────────────────────────────────────────────────────────────────────────────────────────
const alvos = (await q(`select cod_ibge, municipio, uf, entidade from tenosoft_portal
  where entidade is not null ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by uf, municipio`, SO ? [SO] : [])).rows;
const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_tenosoft_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[tenosoft] ${alvos.length} entidades · ${fila.length} na fila`);

// lê o grid do popup (ScriptCase): colunas pelo CABEÇALHO, nunca por posição
const leGrid = (pop) => pop.evaluate(() => {
  // 🚨 a página tem tabelas ANINHADAS: o wrapper do ScriptCase também contém as palavras "Matrícula"/"Líquido",
  // então pegar a primeira que casa devolve o invólucro e a leitura sai vazia. Escolher a tabela que realmente
  // tem uma LINHA DE CABEÇALHO com "Nome" e "Matrícula" em células separadas — e, entre elas, a maior.
  const cands = [...document.querySelectorAll("table")].filter((t) => t.rows.length > 2).map((t) => {
    const linhas = [...t.rows].map((tr) => [...tr.cells].map((c) => c.innerText.trim().replace(/\s+/g, " ")));
    const iCab = linhas.findIndex((c) => c.some((x) => /^nome$/i.test(x)) && c.some((x) => /matr[íi]cula/i.test(x)));
    return { linhas, iCab };
  }).filter((x) => x.iCab >= 0);
  if (!cands.length) return [];
  const { linhas, iCab } = cands.sort((a, b) => b.linhas.length - a.linhas.length)[0];
  const cab = linhas[iCab];
  const ix = (re) => cab.findIndex((c) => re.test(c));
  const col = { nome: ix(/^nome/i), matricula: ix(/matr[íi]cula/i), tipo_folha: ix(/tipo\s*folha/i),
    cargo: ix(/cargo|fun[çc]/i), carga: ix(/carga/i), lotacao: ix(/lota[çc]/i),
    bruto: ix(/bruto/i), descontos: ix(/desconto/i), liquido: ix(/l[íi]quido/i) };
  const pega = (c, i) => (i >= 0 && i < c.length ? c[i] : null);
  return linhas.slice(iCab + 1)
    .filter((c) => c.length >= 4 && !/^total/i.test(c[0] || ""))
    .map((c) => Object.fromEntries(Object.entries(col).map(([k, i]) => [k, pega(c, i)])))
    .filter((r) => r.nome && !/^nome$/i.test(r.nome));
});

const browser = await chromium.launch({ headless: true });
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, competencia = null, linhas = 0) =>
    q(`insert into folha_tenosoft_coleta (cod_ibge,municipio,uf,entidade,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set entidade=excluded.entidade,
       competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.entidade, competencia, linhas, situacao, detalhe]);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/pt_conexao/pt_conexao.php?appURL=sai_servidor&entidade=${a.entidade}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    // a rota é um loader ScriptCase: a tela real só existe depois do POST interno — esperar o menu aparecer,
    // não um tempo fixo (com 5s o link ainda não estava lá e o município saía como "menu sem remuneração nominal")
    await page.waitForFunction(() => [...document.querySelectorAll("a")]
      .some((x) => /REMUNERA[ÇC][ÃA]O NOMINAL/i.test((x.innerText || "").replace(/\s+/g, " "))),
      { timeout: 45000 }).catch(() => {});
    await dorme(1500);
    const href = await page.evaluate(() => {
      const el = [...document.querySelectorAll("a")].find((x) => /REMUNERA[ÇC][ÃA]O NOMINAL/i.test((x.innerText || "").replace(/\s+/g, " ")));
      return el ? el.getAttribute("href") : null;
    });
    if (!href) { await marca("sem_rota", "menu sem 'remuneração nominal'"); falhas++; continue; }
    // ⚠️ abre em POPUP (_blank): capturar a aba nova, senão a leitura fica na tela do menu
    const [pop] = await Promise.all([
      ctx.waitForEvent("page", { timeout: 40000 }),
      page.evaluate((js) => { try { eval(js.replace(/^javascript:/, "")); } catch {} }, href),
    ]);
    await pop.waitForLoadState("domcontentloaded").catch(() => {});
    await dorme(6000);

    // recuo de competência: o filtro abre no mês mais recente publicado, mas nem sempre ele tem folha
    let rows = [], comp = null;
    for (let k = 0; k < RECUO; k++) {
      if (k > 0) {
        const desceu = await pop.evaluate(() => {
          const s = document.querySelector('[name="SC_mesf2"], #SC_mesf2');
          if (!s || s.selectedIndex + 1 >= s.options.length) return false;
          s.selectedIndex += 1; s.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }).catch(() => false);
        if (!desceu) break;
        await dorme(1200);
      }
      const filtro = await pop.evaluate(() => {
        const g = (n) => { const s = document.querySelector(`[name="${n}"], #${n}`); return s ? (s.options ? s.options[s.selectedIndex]?.text : s.value) : null; };
        return { ano: g("SC_anof2"), mes: g("SC_mesf2") };
      }).catch(() => ({}));
      await pop.locator("#sc_b_pesq_bot").first().click({ timeout: 20000 }).catch((e) => { if (process.env.DEBUG) console.log("    [dbg] clique:", String(e.message).slice(0, 50)); });
      await dorme(9000);
      rows = await leGrid(pop);
      // 🚨 O GRID PAGINA DE 20 EM 20 e o rodapé declara o total ("1 a 20 de 1537"). Sem varrer, Iati sairia com
      // 20 servidores de 1.537 — exatamente o defeito que custou 96% do Elotech. A navegação é
      // `nm_gp_submit_rec(offset)`, com offset em base 1 (1, 21, 41, …).
      if (rows.length) {
        const total = await pop.evaluate(() => {
          const m = document.body.innerText.match(/(\d+)\s*a\s*(\d+)\s*de\s*(\d+)/i);
          return m ? { ate: +m[2], total: +m[3] } : null;
        }).catch(() => null);
        if (total && total.total > total.ate) {
          const passo = total.ate || rows.length;
          for (let off = passo + 1; off <= total.total; off += passo) {
            await pop.evaluate((o) => { try { nm_gp_submit_rec(String(o)); } catch {} }, off).catch(() => {});
            await dorme(2500);
            const mais = await leGrid(pop);
            if (!mais.length) break;
            rows.push(...mais);
            if (off > 200000) break;
          }
          if (process.env.DEBUG) console.log(`    [dbg] paginado: ${rows.length}/${total.total}`);
        }
      }
      if (process.env.DEBUG) {
        const diag = await pop.evaluate(() => ({
          url: location.href.slice(-60),
          tabs: [...document.querySelectorAll("table")].filter((t) => t.rows.length > 2).map((t) => `${t.rows.length}L:${t.innerText.replace(/\s+/g, " ").slice(0, 60)}`).slice(0, 3),
        })).catch((e) => ({ erro: String(e.message).slice(0, 40) }));
        console.log(`    [dbg] ${filtro.ano}/${filtro.mes} rows=${rows.length} ${JSON.stringify(diag).slice(0, 300)}`);
      }
      if (rows.length) {
        // 🚨 ler o mês pelo <select> saiu errado (Abreu e Lima gravou competência "00"): o texto da opção varia com
        // acento/caixa. A própria página de resultado imprime o filtro aplicado — "Filtro: Ano: = '2026' | Mês: =
        // 'Junho'" — e essa é a fonte confiável do que foi de fato consultado.
        const doTexto = await pop.evaluate(() => {
          const m = document.body.innerText.replace(/\s+/g, " ").match(/Ano:\s*=\s*'?(\d{4})'?\s*\|?\s*M[êe]s:\s*=\s*'?([A-Za-zçÇãÃéÉ]+)'?/i);
          return m ? { ano: m[1], mes: m[2] } : null;
        }).catch(() => null);
        const nomeMes = String((doTexto && doTexto.mes) || filtro.mes || "")
          .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const mesNum = { janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
          julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12" }[nomeMes];
        const ano = (doTexto && doTexto.ano) || filtro.ano;
        if (!mesNum || !ano) { // sem competência confiável não se grava: dado sem data não serve para série
          await marca("erro", `competência ilegível (ano=${ano} mês=${nomeMes})`);
          falhas++; rows = []; break;
        }
        comp = `${ano}${mesNum}`;
        break;
      }
      // volta ao filtro para tentar outro mês
      await pop.goBack().catch(() => {});
      await dorme(2500);
    }
    if (!rows.length) { await marca("vazio", `sem linhas em ${RECUO} competências`); vazios++; continue; }

    const regs = rows.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, entidade: a.entidade, competencia: comp,
      matricula: s.matricula, nome: s.nome, cargo: s.cargo, lotacao: s.lotacao, secretaria: s.lotacao,
      tipo_folha: s.tipo_folha, carga_horaria: s.carga,
      bruto: money(s.bruto), descontos: money(s.descontos), liquido: money(s.liquido),
      _hash: crypto.createHash("md5").update([a.cod_ibge, comp, s.matricula, s.nome, s.cargo, s.tipo_folha].join("¦")).digest("hex"),
    }));
    const m = new Map(); for (const r of regs) m.set(r._hash, r);
    const arr = [...m.values()];
    for (let k = 0; k < arr.length; k += 1000) {
      const p = arr.slice(k, k + 1000); const c = (f) => p.map((x) => x[f]);
      await q(`insert into folha_servidores_tenosoft
        (cod_ibge,municipio,uf,entidade,competencia,matricula,nome,cargo,lotacao,secretaria,tipo_folha,carga_horaria,
         bruto,descontos,liquido,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::text[])
        on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("matricula"), c("nome"),
         c("cargo"), c("lotacao"), c("secretaria"), c("tipo_folha"), c("carga_horaria"), c("bruto"),
         c("descontos"), c("liquido"), c("_hash")]);
    }
    totalGeral += arr.length; ok++;
    await marca("ok", null, comp, arr.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${arr.length} servidores (${comp})`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close(); }
  await dorme(800);
}
await browser.close();
console.log(`\n[tenosoft] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
