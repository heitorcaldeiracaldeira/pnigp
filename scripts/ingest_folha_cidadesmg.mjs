// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_cidadesmg.mjs — folha nominal dos municípios no portal CidadesMG (JSF/PrimeFaces, MG).
//
// A tela é `/portaltransparencia/publica/recursosHumanos/recursosHumanos.xhtml` e a DataTable já traz TUDO:
// Matrícula · Ano · Mês · Servidor · Data Admissão · Cargo/Função · Vínculo · Dpto · Local · Jornada ·
// Valor Bruto · Valor Desconto · Valor Líquido.
//
// 🚨 Os botões "Exportar CSV/JSON" existem mas NÃO baixam nada: são `PrimeFaces.ab({s:"j_idt232",f:"form1"})` e o
// clique não produz download nem resposta com arquivo (testado por evento e por interceptação). O caminho que
// funciona é RASPAR a DataTable e paginar pelo paginator do PrimeFaces. O id dos botões (`j_idt232`) é gerado pelo
// JSF e MUDA de portal para portal — nada pode ser fixado por id, tudo é achado por TEXTO.
//
// ⚠️ Há duas gerações de portal: a nova (`/publica/recursosHumanos/`) e uma antiga (`/faces/user/folha.xhtml?Param=`).
// Este coletor trata a nova; a antiga fica marcada como `geracao_antiga`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const MAX_PAG = Number(process.env.MAX_PAG || 300);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_cidadesmg (
  cod_ibge text, municipio text, uf text, base_url text, competencia text,
  matricula text, nome text, cargo text, vinculo text, departamento text, secretaria text, local_trabalho text,
  jornada text, data_admissao text, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_cmg_mun on folha_servidores_cidadesmg (cod_ibge, competencia)`);
await q(`create table if not exists folha_cidadesmg_coleta (
  cod_ibge text primary key, municipio text, uf text, base_url text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = +t; return Number.isFinite(n) ? n : null;
};

// lê a DataTable da folha; as colunas vêm PELO CABEÇALHO (a ordem varia entre portais)
const leTabela = (page) => page.evaluate(() => {
  const t = [...document.querySelectorAll("table")].find((x) => /matricula/i.test(x.innerText) && /l[íi]quido/i.test(x.innerText) && x.rows.length > 1);
  if (!t) return [];
  const linhas = [...t.rows].map((tr) => [...tr.cells].map((c) => c.innerText.trim().replace(/\s+/g, " ")));
  const iCab = linhas.findIndex((c) => c.some((x) => /^matricula$/i.test(x)));
  if (iCab < 0) return [];
  const cab = linhas[iCab];
  const ix = (re) => cab.findIndex((c) => re.test(c));
  const col = { matricula: ix(/matricula/i), ano: ix(/^ano$/i), mes: ix(/^m[êe]s$/i), nome: ix(/servidor/i),
    admissao: ix(/admiss/i), cargo: ix(/cargo/i), vinculo: ix(/v[íi]nculo/i), dpto: ix(/dpto|departamento/i),
    local: ix(/^local$/i), jornada: ix(/jornada/i), bruto: ix(/bruto/i), desconto: ix(/desconto/i), liquido: ix(/l[íi]quido/i) };
  const pega = (c, i) => (i >= 0 && i < c.length ? c[i] : null);
  return linhas.slice(iCab + 1)
    .map((c) => Object.fromEntries(Object.entries(col).map(([k, i]) => [k, pega(c, i)])))
    .filter((r) => r.nome && !/^servidor$/i.test(r.nome));
});

// 🚨 20 dos 94 portais CidadesMG descobertos são da CÂMARA (`cm{slug}.cidadesmg.com.br`) e o `distinct on` pegava
// o primeiro que aparecesse: Januária entrou com 62 pessoas num município de 2.352, Serro com 27 de 748.
// A folha da câmara é real, mas não é a do município — ordenar preferindo o host `pm` e descartar quem só tem `cm`.
const alvos = (await q(`select distinct on (cod_ibge) cod_ibge, municipio, uf, url_portal_real base
  from portal_real_descoberto where url_portal_real ilike '%cidadesmg%'
    and url_portal_real !~* '//cm'
  ${SO ? "and municipio ilike '%'||$1||'%'" : ""}
  order by cod_ibge, (url_portal_real ~* '//pm') desc`, SO ? [SO] : [])).rows;
const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_cidadesmg_coleta where situacao like 'ok%'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[cidadesmg] ${alvos.length} portais · ${fila.length} na fila`);

const browser = await chromium.launch({ headless: true });
let totalGeral = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, competencia = null, linhas = 0) =>
    q(`insert into folha_cidadesmg_coleta (cod_ibge,municipio,uf,base_url,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set competencia=excluded.competencia,
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.base, competencia, linhas, situacao, detalhe]);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(a.base, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dorme(3000);
    // a geração antiga usa /faces/user/folha.xhtml — outro fluxo, fica marcada
    if (/faces\/user\//i.test(page.url())) { await marca("geracao_antiga", "portal no layout antigo (faces/user)"); falhas++; continue; }
    const href = await page.evaluate(() => [...document.querySelectorAll("a")]
      .find((x) => /servidor|recursosHumanos/i.test((x.innerText || "") + (x.getAttribute("href") || "")))?.getAttribute("href"));
    if (!href) { await marca("sem_rota", "sem link de recursos humanos"); falhas++; continue; }
    await page.goto(new URL(href, page.url()).href, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dorme(4000);

    // mais linhas por página reduz a paginação (o select do PrimeFaces é o "rows per page")
    await page.evaluate(() => {
      const s = [...document.querySelectorAll("select")].find((x) => /j_id\d+$/.test(x.id) && [...x.options].every((o) => /^\d+$/.test(o.value)));
      if (s) { const maior = [...s.options].map((o) => +o.value).sort((x, y) => y - x)[0];
        s.value = String(maior); s.dispatchEvent(new Event("change", { bubbles: true })); }
    }).catch(() => {});
    await dorme(3500);

    // 🚨 a tela abre em JANEIRO (default do filtro), não no mês mais recente publicado. Sem isso a base fica com
    // o retrato do início do ano. Desce de dezembro para janeiro e para no primeiro mês COM linhas.
    for (let mes = 12; mes >= 1; mes--) {
      const setou = await page.evaluate((m) => {
        const s = document.querySelector('[id$="mesFolhaPagamento_input"]');
        if (!s || ![...s.options].some((o) => o.value === String(m))) return false;
        s.value = String(m); s.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }, mes).catch(() => false);
      if (!setou) continue;
      await dorme(1500);
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button,a,input")].find((x) => /^pesquisar$/i.test((x.innerText || x.value || "").trim()));
        if (b) b.click();
      }).catch(() => {});
      await dorme(4000);
      const teste = await leTabela(page);
      if (teste.length) break;
    }

    // 🚨 O TOTAL DECLARADO é a única forma de saber se a paginação foi até o fim. Sem ele o coletor terminava
    // 'ok' com 38 de 2.708 (Salinas) e 62 de 2.352 (Januária): o `.ui-paginator-next` fica DESABILITADO enquanto
    // o AJAX do PrimeFaces carrega, e o laço interpretava isso como "última página".
    const totalDeclarado = await page.evaluate(() => {
      const t = document.body.innerText.match(/de\s+([\d.]+)\s+(registros|resultados)/i);
      return t ? Number(t[1].replace(/\./g, "")) : null;
    }).catch(() => null);

    const linhas = [];
    const vistos = new Set();
    for (let pg = 0; pg < MAX_PAG; pg++) {
      const atual = await leTabela(page);
      let novos = 0;
      for (const r of atual) {
        const k = [r.matricula, r.nome, r.ano, r.mes, r.liquido].join("|");
        if (vistos.has(k)) continue;
        vistos.add(k); linhas.push(r); novos++;
      }
      if (totalDeclarado && linhas.length >= totalDeclarado) break;
      // paginator do PrimeFaces: avança enquanto o botão "próxima" não estiver desabilitado.
      // Botão desabilitado pode ser AJAX em curso — insistir antes de concluir que acabou.
      let avancou = false;
      for (let t = 0; t < 3 && !avancou; t++) {
        avancou = await page.evaluate(() => {
          const b = document.querySelector(".ui-paginator-next:not(.ui-state-disabled)");
          if (!b) return false;
          b.click(); return true;
        }).catch(() => false);
        if (!avancou) await dorme(2500);
      }
      if (!avancou) break;
      await dorme(2500);
      if (!novos && pg > 2) break;   // parou de trazer novidade
    }
    const incompleto = totalDeclarado && linhas.length < totalDeclarado
      ? `PARCIAL: ${linhas.length} de ${totalDeclarado} declarados` : null;
    if (!linhas.length) { await marca("vazio", "tabela sem linhas"); falhas++; continue; }

    const comp = (() => {
      const l = linhas.find((x) => x.ano && x.mes);
      return l ? `${l.ano}${String(l.mes).padStart(2, "0")}` : null;
    })();
    const regs = linhas.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, base_url: a.base,
      competencia: s.ano && s.mes ? `${s.ano}${String(s.mes).padStart(2, "0")}` : comp,
      matricula: s.matricula, nome: s.nome, cargo: s.cargo, vinculo: s.vinculo,
      departamento: s.dpto, secretaria: s.dpto, local_trabalho: s.local, jornada: s.jornada,
      data_admissao: s.admissao, bruto: money(s.bruto), descontos: money(s.desconto), liquido: money(s.liquido),
      _hash: crypto.createHash("md5").update([a.cod_ibge, s.ano, s.mes, s.matricula, s.nome, s.cargo].join("¦")).digest("hex"),
    }));
    const m = new Map(); for (const r of regs) m.set(r._hash, r);
    const arr = [...m.values()];
    for (let k = 0; k < arr.length; k += 1000) {
      const p = arr.slice(k, k + 1000); const c = (f) => p.map((x) => x[f]);
      await q(`insert into folha_servidores_cidadesmg
        (cod_ibge,municipio,uf,base_url,competencia,matricula,nome,cargo,vinculo,departamento,secretaria,
         local_trabalho,jornada,data_admissao,bruto,descontos,liquido,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],
          $17::numeric[],$18::text[])
        on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("base_url"), c("competencia"), c("matricula"), c("nome"),
         c("cargo"), c("vinculo"), c("departamento"), c("secretaria"), c("local_trabalho"), c("jornada"),
         c("data_admissao"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
    }
    totalGeral += arr.length; ok++;
    await marca("ok", incompleto, comp, arr.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${arr.length} servidores (${comp})`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close(); }
  await dorme(700);
}
await browser.close();
console.log(`\n[cidadesmg] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${falhas} falhas`);
await db.end();
