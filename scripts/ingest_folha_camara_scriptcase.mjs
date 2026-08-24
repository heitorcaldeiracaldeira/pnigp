// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_camara_scriptcase.mjs — folha das CÂMARAS que publicam em ScriptCase (`aplicsc.*`).
//
// ⭐ PRIMEIRO ALVO: a CÂMARA MUNICIPAL DO RIO DE JANEIRO — a maior lacuna de pessoas do país no legislativo
// (8.702 vínculos na RAIS 1066, nada colhido até 21/ago/2026).
//
// A ROTA (medida em 21/ago/2026):
//   1) `transparencia.camara.rj.gov.br/recursos-humanos/funcao-gratificada-ou-cargo-comissionado` embute um
//      IFRAME para `aplicsc.camara.rj.gov.br/scriptcase/sistemas/contracheque/Ctrl_Pesquisa/`.
//   2) O formulário exige ANO, MÊS, **FOLHA ("Normal")** e VÍNCULO. 🚨 Sem a folha o app responde
//      *"Por favor selecione a folha que deseja exibir"* — foi o que fez a primeira sonda parecer vazia.
//   3) O "Ok" abre outro app no iframe: `Cons_ExportarServidoresFolha`, que é a GRADE com
//      **Nome · Vínculo · Símbolo · Cargo · Remuneração Líquida** (2.236 linhas em jul/2026).
//   4) A paginação é `nm_gp_submit_rec(offset)`, 10 por página — não há botão de exportação exposto.
//
// ⚠️ O QUE VEM É LÍQUIDO, e o coletor NÃO o chama de bruto: `tipo_folha` grava "remuneração líquida". Líquido
//    conta como PROVA DE PUBLICAÇÃO quando não há bruto, mas não é bruto ([[pnigp-gemeas-calibragem-e-entidade]],
//    [[pnigp-duas-telas-de-folha-liquido-e-bruto]]).
// ⚠️ `poder='legislativo'` em toda linha: esta tabela é só de câmara, e a marca mantém o dado fora da conta do
//    executivo e dentro de `vw_folha_camara_brasil`.
//
// Uso: node scripts/ingest_folha_camara_scriptcase.mjs            · ANO=2026 MES=Julho · IBGE=3304557
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const ANO = process.env.ANO || "2026";
const MES = process.env.MES || "Julho";
const PAGINAS_MAX = Number(process.env.PAGINAS || 400);

// catálogo dos alvos: por enquanto o Rio; a rota é a mesma para qualquer câmara em `aplicsc.*`
const ALVOS = [{
  cod_ibge: "3304557", municipio: "Rio de Janeiro", uf: "RJ",
  url: "https://aplicsc.camara.rj.gov.br/scriptcase/sistemas/contracheque/Ctrl_Pesquisa/",
}].filter((a) => !process.env.IBGE || a.cod_ibge === process.env.IBGE);

await q(`create table if not exists folha_servidores_scriptcase (
  cod_ibge text, municipio text, uf text, poder text, competencia text,
  nome text, vinculo text, simbolo text, cargo text, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_sc_mun on folha_servidores_scriptcase (cod_ibge, competencia)`);
await q(`create table if not exists folha_scriptcase_coleta (
  cod_ibge text, poder text, municipio text, uf text, competencia text, linhas int,
  situacao text, detalhe text, em timestamptz default now(), primary key (cod_ibge, poder))`);

const money = (s) => {
  const t = String(s || "").replace(/[R$\s ]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && t !== "" ? n : null;
};
const MESES = { Janeiro: "01", Fevereiro: "02", Março: "03", Abril: "04", Maio: "05", Junho: "06",
                Julho: "07", Agosto: "08", Setembro: "09", Outubro: "10", Novembro: "11", Dezembro: "12" };

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
let totalGeral = 0;

for (const a of ALVOS) {
  const marca = (situacao, detalhe, comp = null, linhas = 0) =>
    q(`insert into folha_scriptcase_coleta (cod_ibge,poder,municipio,uf,competencia,linhas,situacao,detalhe,em)
       values ($1,'legislativo',$2,$3,$4,$5,$6,$7,now())
       on conflict (cod_ibge,poder) do update set competencia=excluded.competencia, linhas=excluded.linhas,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, comp, linhas, situacao, detalhe]);

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    await page.goto(a.url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(4000);
    // 🚨🚨 ESCREVER `.value` NÃO BASTA — e foi isso que fez o coletor concluir "a grade não abriu" com o portal
    //    vivo. O ScriptCase reage ao evento REAL do `select`: `page.selectOption` sobre a FOLHA já dispara a
    //    consulta e abre o iframe da grade sozinho. `el.value = x` + `new Event('change')` deixa o widget
    //    exibindo "Selecione a folha..." e o app não consulta ([[pnigp-goto-falha-mas-pagina-carrega]] é o mesmo
    //    gênero: a página parece pronta e o passo não aconteceu).
    await page.selectOption('[name="cmp_ano"]', ANO).catch(() => {});
    await page.waitForTimeout(700);
    await page.selectOption('[name="cmp_mes"]', MESES[MES] || "07").catch(() => {});
    await page.waitForTimeout(700);
    await page.selectOption('[name="cmp_tipo_vinculo"]', { index: 0 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.selectOption('[name="cmp_tipo_folha"]', { label: "Normal" }).catch(() => {});
    await page.waitForTimeout(3000);
    // 🚨 O DIÁLOGO E A GRADE DISPUTAM O MESMO BOTÃO. O "Ok" ora fecha o aviso ("a carga acontece 15 dias após"),
    //    ora dispara a consulta — e quando fecha o aviso, o iframe da grade não nasce e o coletor conclui "não
    //    abriu" com o portal perfeitamente vivo. Clicar de novo e ESPERAR o frame é a diferença entre
    //    "não publica" e "eu não esperei" ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
    let frame = null;
    for (let tentativa = 0; tentativa < 3 && !frame; tentativa++) {
      if (tentativa > 0) await page.locator("#sub_form_b").first().click({ timeout: 10000 }).catch(() => {});
      // ⚠️ o iframe nasce em `about:blank` e SÓ DEPOIS navega para Cons_Exportar… — casar pela URL logo de cara
      //    devolve "não abriu" com o frame já na página. Aceita qualquer frame filho e confere pelo CONTEÚDO.
      for (let s = 0; s < 25 && !frame; s++) {
        await page.waitForTimeout(1500);
        frame = page.frames().find((f) => /Cons_ExportarServidoresFolha/i.test(f.url())) || null;
      }
    }
    if (!frame) {
      const diag = await page.evaluate(() => ({
        txt: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 240),
        folha: document.querySelector("[name=cmp_tipo_folha]")?.value ?? "(sem campo)",
        ano: document.querySelector("[name=cmp_ano]")?.value ?? "", mes: document.querySelector("[name=cmp_mes]")?.value ?? "",
      })).catch(() => ({}));
      console.log("  ⚠️ diagnóstico:", JSON.stringify(diag), "| frames:", page.frames().map((f) => f.url().slice(0, 60)));
      await marca("erro", `grade não abriu · folha=${diag.folha} ano=${diag.ano} mes=${diag.mes}`);
      await ctx.close(); continue;
    }

    const competencia = `${ANO}${MESES[MES] || "07"}`;
    const vistos = new Set();
    const regs = [];
    let offset = 1, paginas = 0, totalDeclarado = null, semNovidade = 0;

    while (paginas < PAGINAS_MAX) {
      // ⚠️ ESPERAR O DINHEIRO APARECER. O iframe nasce antes da grade: ler na hora devolve zero linha e o
      //    coletor conclui "grade sem linhas" com o portal servindo 2.236 pessoas.
      await frame.waitForFunction(() => /R\$\s*[\d.]+,\d{2}/.test(document.body?.innerText || ""), null,
        { timeout: 45000 }).catch(() => {});
      const pagina = await frame.evaluate(() => {
        // 1) o caminho estruturado: <tr><td>…</td></tr>
        let linhas = [...document.querySelectorAll("tr")].map((tr) =>
          [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").trim()))
          .filter((c) => c.length >= 5);
        // 2) o caminho do texto: o ScriptCase separa as colunas por TAB no innerText — serve quando a grade
        //    mora em divs ou quando as células vêm aninhadas
        if (!linhas.length) {
          linhas = (document.body.innerText || "").split("\n")
            .map((l) => l.split("\t").map((c) => c.trim()))
            .filter((c) => c.length >= 5 && /R\$\s*[\d.]+,\d{2}/.test(c[c.length - 1]));
        }
        const rodape = document.body.innerText.match(/\[\s*[\d.]+\s*a\s*[\d.]+\s*de\s*([\d.]+)\s*\]/);
        return { linhas, total: rodape ? Number(rodape[1].replace(/\./g, "")) : null };
      });
      if (totalDeclarado === null) totalDeclarado = pagina.total;
      let novas = 0;
      for (const c of pagina.linhas) {
        // 🚨 NÃO CONTAR COLUNA POR POSIÇÃO FIXA: a grade do ScriptCase traz células de ícone/checkbox antes dos
        //    dados, e `slice(0,5)` pegava lixo — o mesmo erro que zerou o salário de 3 municípios no algov
        //    ([[pnigp-algov-alagoas-tres-variantes]]). A ÂNCORA é o dinheiro: a última célula com R$ manda.
        const iVal = c.map((x) => /R\$\s*[\d.]+,\d{2}/.test(x)).lastIndexOf(true);
        if (iVal < 1) continue;
        const liq = money(c[iVal]);
        if (liq === null) continue;
        const nome = (c.slice(0, iVal).find((x) => /[A-Za-zÀ-ú]{4,}/.test(x)) || "").trim();
        if (!nome || /^nome$/i.test(nome)) continue;
        const cargo = c[iVal - 1] && c[iVal - 1] !== nome ? c[iVal - 1] : null;
        const simbolo = iVal >= 3 && c[iVal - 2] !== nome ? c[iVal - 2] : null;
        const vinculo = iVal >= 4 && c[iVal - 3] !== nome ? c[iVal - 3] : null;
        const _hash = crypto.createHash("md5").update([a.cod_ibge, competencia, nome, cargo, simbolo].join("¦")).digest("hex");
        if (vistos.has(_hash)) continue;
        vistos.add(_hash); novas++;
        regs.push({ cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, poder: "legislativo", competencia,
                    nome, vinculo: vinculo || null, simbolo: simbolo || null, cargo: cargo || null, liquido: liq, _hash });
      }
      paginas++;
      if (paginas % 25 === 0) console.log(`  … ${a.municipio}: ${regs.length} linhas (página ${paginas})`);
      if (totalDeclarado && regs.length >= totalDeclarado) break;
      // ⚠️ UMA página repetida NÃO é o fim: o ScriptCase às vezes devolve a mesma página enquanto processa o
      //    postback. Parar na primeira repetição deixou o Rio em 1.595 de 2.236 declarados. Só desiste depois
      //    de 3 repetições seguidas — e, enquanto o total declarado não for atingido, continua avançando.
      if (!novas) { semNovidade++; if (semNovidade >= 3) break; } else semNovidade = 0;
      offset += 10;
      const foi = await frame.evaluate((off) => {
        try { if (typeof nm_gp_submit_rec === "function") { nm_gp_submit_rec(off); return true; } } catch { /* */ }
        return false;
      }, offset);
      if (!foi) break;
      await frame.waitForTimeout(1500);
    }

    if (!regs.length) { await marca("vazio", `grade sem linhas em ${competencia}`, competencia); await ctx.close(); continue; }

    for (let i = 0; i < regs.length; i += 1000) {
      const p2 = regs.slice(i, i + 1000); const c = (f) => p2.map((x) => x[f]);
      await q(`insert into folha_servidores_scriptcase
        (cod_ibge,municipio,uf,poder,competencia,nome,vinculo,simbolo,cargo,liquido,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
          $8::text[],$9::text[],$10::numeric[],$11::text[])
        on conflict (_hash) do update set liquido=coalesce(excluded.liquido, folha_servidores_scriptcase.liquido),
          _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("poder"), c("competencia"), c("nome"), c("vinculo"),
         c("simbolo"), c("cargo"), c("liquido"), c("_hash")]);
    }
    totalGeral += regs.length;
    await marca("ok", `${paginas} páginas · total declarado ${totalDeclarado ?? "?"}`, competencia, regs.length);
    console.log(`  ✔ ${a.uf} ${a.municipio}: ${regs.length} servidores (${competencia}, ${paginas} páginas)`);
  } catch (e) {
    await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 90)}`);
  }
  await ctx.close();
}

await browser.close();
console.log(`\n[scriptcase] ${totalGeral.toLocaleString("pt-BR")} servidores de câmara gravados`);
await db.end();
