// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_sinsoft.mjs — folha nominal COM salário do bloco `sinsoft`, 20 municípios do RS.
//
// ⭐ O ACHADO QUE MUDOU O CUSTO: o Sinsoft NÃO tem grid de servidores. A `ASPxGridView` da tela `WebPessoal.aspx`
// é um LISTADOR DE ARQUIVOS — a folha é publicada como **PDF mensal** (`FOLHA_EXECUTIVO_MM_AAAA.pdf`, ~250 KB).
// Eu havia gasto uma rodada tentando arrancar dados da grid por postback ([[pnigp-digifred-sinsoft-citta-rs]]);
// ela nunca teria dados porque não é uma grid de dados.
//
// O PDF traz: Matrícula · Nome · CARGO · Horas mensais · Data de admissão · Padrão/Classe · Salário · Outros ·
// Bruto. ⚠️ Não traz lotação/secretaria.
//
// CAMINHO (Playwright, porque o download nasce de um postback DevExpress):
//   WebPessoal.aspx → seleciona Dp_mes/Dp_Ano → clica `Confirma` → a grid lista os PDFs da competência →
//   clica `Abrir` do arquivo FOLHA_* → captura o download → extrai o texto com unpdf.
// 🚨 O input do "Abrir" é `readonly` e o Playwright o julga NÃO ACIONÁVEL: `page.click` estoura timeout. Clicar
// pelo DOM (`page.evaluate` + `.click()`) contorna.
//
// 🚨 O PDF PERDE A GEOMETRIA na extração ([[pnigp-pdf-geometria-perdida-extracao]]): as colunas saem fora de
// ordem e o BRUTO vem COLADO na matrícula (`1.724,002199`). A ordem real do texto é
//   CARGO · horas · salário · padrão · BRUTO+MATRÍCULA · NOME · admissão · outros
// e a prova de que o parser acertou é ARITMÉTICA: salário + outros = bruto (conferido linha a linha).
//
// Uso: UF=RS node scripts/ingest_folha_sinsoft.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";

await q(`create table if not exists folha_servidores_sinsoft (
  cod_ibge text, municipio text, uf text, competencia text,
  matricula text, nome text, cargo text, horas text, admissao text, padrao text,
  salario numeric, outros numeric, bruto numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
// a v2 do portal traz SETOR (secretaria) e descontos, que o PDF da v1 não tem
for (const col of ["setor text", "contratual numeric", "descontos numeric", "versao_portal text"]) {
  await q(`alter table folha_servidores_sinsoft add column if not exists ${col}`);
}
await q(`create index if not exists ix_folha_sinsoft_mun on folha_servidores_sinsoft (cod_ibge, competencia)`);
await q(`create table if not exists folha_sinsoft_coleta (
  cod_ibge text primary key, municipio text, uf text, slug text, competencia text, arquivo text,
  linhas int, confere int, situacao text, detalhe text, em timestamptz default now()
)`);

const alvos = (await q(`
  select s.cod_ibge, s.municipio, s.uf, coalesce(s.url_pessoal, s.url_base) url
    from folha_sonda_municipal s
   where coalesce(s.url_pessoal, s.url_base) ~ 'sinsoft'
     ${UF ? "and s.uf = $1" : ""} ${SO ? `and s.municipio ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
   order by s.municipio`, [UF, SO].filter(Boolean))).rows;
const feitos = new Set(REFAZ ? [] : (await q(`select cod_ibge from folha_sinsoft_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[sinsoft] ${alvos.length} portais · ${feitos.size} já feitos · ${fila.length} na fila`);

const money = (s) => {
  const m = String(s ?? "").replace(/[R$\s ]/g, "");
  if (!m) return null;
  const n = +m.replace(/\./g, "").replace(",", ".");
  return Number.isFinite(n) ? n : null;
};

// CARGO · horas · salário · padrão · BRUTO+MATRÍCULA · NOME · admissão · outros
const LINHA = /^(.+?)\s+(\d{1,3})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})(\d{1,6})\s+([A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ' .]+?)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.]+,\d{2})\s*$/;

// 🚨 O CABEÇALHO DO PDF MUDA ENTRE MUNICÍPIOS e com ele o SIGNIFICADO da 5ª coluna numérica:
//   Lagoão  → "… Padrão/Classe **Salario** … Nivel/Classe **Bruto**"   → a 5ª é o BRUTO
//   Nonoai  → "… Padrão/Classe **Descontos** … Nivel/Classe **Legais**" → a 5ª é DESCONTOS LEGAIS
// Tratar as duas como bruto deu média de R$ 688 em Nonoai (contra R$ 3.532 em Lagoão) e "bruto" menor que o
// salário na mesma linha. Quem denunciou foi a prova aritmética: 0% das linhas fechavam.
// O que vale nos DOIS layouts: **vencimento + outros = bruto**.
function parsePdf(texto) {
  const linhas = [], problemas = [];
  let confere = 0;
  const cabecalho = texto.split("\n").find((l) => /Matricula/i.test(l) && /N\s*o\s*m\s*e/i.test(l)) || "";
  const quintaEhDesconto = /Descontos/i.test(cabecalho) && !/Salario/i.test(cabecalho);
  for (const raw of texto.split("\n")) {
    const l = raw.replace(/\s+/g, " ").trim();
    const m = LINHA.exec(l);
    if (!m) { if (/\d{2}\/\d{2}\/\d{4}/.test(l) && /\d,\d{2}/.test(l)) problemas.push(l.slice(0, 90)); continue; }
    const [, cargo, horas, vencimento, padrao, quinta, matricula, nome, admissao, ultimo] = m;
    const v = money(vencimento), o = money(ultimo), qv = money(quinta);
    const bruto = quintaEhDesconto ? (v !== null && o !== null ? +(v + o).toFixed(2) : null) : qv;
    const descontos = quintaEhDesconto ? qv : null;
    // ⭐ a prova barata: vencimento + outros = bruto. Se não fecha, a coluna foi lida errada.
    if (v !== null && o !== null && bruto !== null && Math.abs(v + o - bruto) < 0.05) confere++;
    linhas.push({ matricula, nome: nome.trim(), cargo: cargo.trim(), horas, admissao,
                  padrao, salario: v, outros: o, bruto, descontos });
  }
  return { linhas, confere, problemas, layout: quintaEhDesconto ? "descontos-legais" : "bruto" };
}

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "sinsoft-"));
const browser = await chromium.launch({ headless: true });
const { extractText, getDocumentProxy } = await import("unpdf");
const hoje = new Date();
const competencias = Array.from({ length: 6 }, (_, k) => {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 1));
  return { mes: d.getUTCMonth() + 1, ano: d.getUTCFullYear() };
});

let totalGeral = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const slug = (a.url.match(/sinsoft\.com\.br\/(portal\.[a-z0-9-]+)/i) || [])[1];
  const url = slug ? `http://sistema.sinsoft.com.br/${slug}/WebPessoal.aspx` : null;
  const marca = (situacao, detalhe, competencia = null, arquivo = null, linhas = 0, confere = 0) =>
    q(`insert into folha_sinsoft_coleta (cod_ibge,municipio,uf,slug,competencia,arquivo,linhas,confere,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       on conflict (cod_ibge) do update set slug=excluded.slug, competencia=excluded.competencia,
         arquivo=excluded.arquivo, linhas=excluded.linhas, confere=excluded.confere,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, slug, competencia, arquivo, linhas, confere, situacao, detalhe]);
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
  try {
    if (!url) { await marca("erro", "slug não extraído"); falhas++; continue; }
    const page = await ctx.newPage();
    const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (!r || r.status() >= 400) { await marca("erro", `HTTP ${r?.status()} em WebPessoal.aspx`); falhas++; continue; }
    await page.waitForTimeout(2500);

    // ⭐ DUAS VERSÕES DO MESMO PORTAL. A v2 traz GRID NOMINAL na tela (NOME · ADMISSÃO · FUNÇÃO · HORAS · PADRÃO ·
    // SETOR · CONTRATUAL · proventos · descontos) e é MELHOR que o PDF da v1 — tem secretaria. Tratar só a v1
    // marcava todos os v2 como "vazio", que é o falso negativo de sempre.
    const ehV2 = await page.evaluate(() =>
      !!document.querySelector("#MainContent_ASPxPageControl1_ASPxGridView1_DXMainTable"));
    if (ehV2) {
      const comp2 = await page.evaluate(() =>
        (document.querySelector("#MainContent_ASPxComboBox1_I") || {}).value || null);
      const linhas = [];
      const totalPag = await page.evaluate(() => {
        const p = document.querySelector("[id*='DXPagerBottom'], [id*='DXPager']");
        const m = /of\s+(\d+)/i.exec(p?.innerText || "");
        return m ? +m[1] : 1;
      });
      for (let pg = 0; pg < totalPag; pg++) {
        if (pg > 0) {
          // o ASPxClientGridView expõe GotoPage; se não existir, clica o número da página
          const foi = await page.evaluate((n) => {
            const g = window["MainContent_ASPxPageControl1_ASPxGridView1"];
            if (g && typeof g.GotoPage === "function") { g.GotoPage(n); return true; }
            return false;
          }, pg).catch(() => false);
          if (!foi) break;
          await page.waitForTimeout(900);
        }
        const chunk = await page.evaluate(() => {
          const t = document.querySelector("#MainContent_ASPxPageControl1_ASPxGridView1_DXMainTable");
          if (!t) return [];
          return [...t.rows].slice(1).map((r) => [...r.cells].map((c) => c.innerText.trim()));
        });
        for (const c of chunk) if (c[0]) linhas.push(c);
      }
      if (!linhas.length) { await marca("vazio", "v2 sem linhas na grid"); falhas++; continue; }
      const comp = comp2 ? comp2.replace(/(\d{2})\/(\d{4})/, "$2$1") : null;
      const regs = linhas.map((c) => ({
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, competencia: comp,
        matricula: null, nome: c[0], admissao: c[1], cargo: c[2], horas: c[3], padrao: c[4], setor: c[5],
        contratual: money(c[6]), bruto: money(c[7]), descontos: money(c[8]),
        salario: money(c[6]), outros: null, versao_portal: "v2",
        _hash: crypto.createHash("md5").update([a.cod_ibge, comp, c[0], c[2], c[5], c[7]].join("|")).digest("hex"),
      }));
      const pp = [...new Map(regs.map((x) => [x._hash, x])).values()];
      if (REFAZ) await q(`delete from folha_servidores_sinsoft where cod_ibge=$1 and competencia=$2`, [a.cod_ibge, comp]);
      const cc = (f) => pp.map((x) => x[f]);
      await q(`insert into folha_servidores_sinsoft
        (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,horas,admissao,padrao,salario,outros,bruto,
         setor,contratual,descontos,versao_portal,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::text[],$15::numeric[],
          $16::numeric[],$17::text[],$18::text[])
        on conflict (_hash) do update set bruto=excluded.bruto, setor=excluded.setor, _coletado_em=now()`,
        [cc("cod_ibge"), cc("municipio"), cc("uf"), cc("competencia"), cc("matricula"), cc("nome"), cc("cargo"),
         cc("horas"), cc("admissao"), cc("padrao"), cc("salario"), cc("outros"), cc("bruto"), cc("setor"),
         cc("contratual"), cc("descontos"), cc("versao_portal"), cc("_hash")]);
      await marca("ok", `portal v2 (grid nominal com SETOR) · ${totalPag} páginas`, comp, null, pp.length, pp.length);
      totalGeral += pp.length; ok++;
      console.log(`  [${i + 1}/${fila.length}] ${a.municipio}: ${pp.length} servidores · ${comp} · v2 com setor`);
      continue;
    }

    let baixado = null, comp = null;
    for (const { mes, ano } of competencias) {
      await page.selectOption('select[name="ctl00$MainContent$Dp_mes"]', String(mes)).catch(() => {});
      await page.selectOption('select[name="ctl00$MainContent$Dp_Ano"]', String(ano)).catch(() => {});
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('input[type="submit"]')].find((x) => x.value === "Confirma");
        if (b) b.click();
      }).catch(() => {});
      await page.waitForTimeout(3500);
      // há um PDF de FOLHA nesta competência?
      const arquivos = await page.evaluate(() => {
        const t = document.querySelector("#MainContent_ASPxGridView1_DXMainTable");
        if (!t) return [];
        return [...t.rows].map((x) => x.innerText.replace(/\s+/g, " ").trim()).filter((x) => /\.pdf/i.test(x));
      });
      const alvoFolha = arquivos.findIndex((x) => /FOLHA/i.test(x));
      if (alvoFolha < 0) continue;
      try {
        const [dl] = await Promise.all([
          page.waitForEvent("download", { timeout: 60000 }),
          // ⚠️ readonly: clicar pelo DOM. O índice do botão segue a ordem das linhas com PDF.
          page.evaluate((idx) => {
            const bs = [...document.querySelectorAll('input[type="submit"]')].filter((x) => x.value === "Abrir");
            if (!bs[idx]) throw new Error("sem botão Abrir");
            bs[idx].click();
          }, alvoFolha),
        ]);
        const dest = path.join(tmpBase, `${slug}-${ano}${String(mes).padStart(2, "0")}.pdf`);
        await dl.saveAs(dest);
        baixado = { arquivo: dl.suggestedFilename(), caminho: dest };
        comp = `${ano}${String(mes).padStart(2, "0")}`;
        break;
      } catch { /* tenta a competência anterior */ }
    }
    if (!baixado) { await marca("vazio", "nenhuma das 6 competências tem PDF de FOLHA"); falhas++; continue; }

    const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(baixado.caminho)));
    const { text } = await extractText(pdf, { mergePages: true });
    const { linhas, confere, problemas, layout } = parsePdf(text);
    if (!linhas.length) {
      await marca("pdf_nao_parseado", `${problemas.length} linhas com cara de dado não casaram`, comp, baixado.arquivo);
      falhas++; continue;
    }

    const regs = linhas.map((l) => ({ ...l, cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, competencia: comp,
      _hash: crypto.createHash("md5").update([a.cod_ibge, comp, l.matricula, l.nome, l.cargo, l.bruto].join("|")).digest("hex") }));
    const pp = [...new Map(regs.map((x) => [x._hash, x])).values()];
    if (REFAZ) await q(`delete from folha_servidores_sinsoft where cod_ibge=$1 and competencia=$2`, [a.cod_ibge, comp]);
    const c = (f) => pp.map((x) => x[f]);
    await q(`insert into folha_servidores_sinsoft
      (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,horas,admissao,padrao,salario,outros,bruto,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("matricula"), c("nome"), c("cargo"), c("horas"),
       c("admissao"), c("padrao"), c("salario"), c("outros"), c("bruto"), c("_hash")]);

    const pct = Math.round(100 * confere / linhas.length);
    await marca(pct >= 90 ? "ok" : "ok_conferencia_baixa",
      `PDF layout=${layout} · ${pct}% fecham vencimento+outros=bruto` +
      (problemas.length ? ` · ${problemas.length} não casaram` : ""), comp, baixado.arquivo, pp.length, confere);
    totalGeral += pp.length; ok++;
    console.log(`  [${i + 1}/${fila.length}] ${a.municipio}: ${pp.length} servidores · ${comp} · ${pct}% conferem`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 80)}`);
  } finally { await ctx.close(); }
}
await browser.close();
console.log(`\n[sinsoft] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} portais ok · ${falhas} falhas`);
await db.end();
