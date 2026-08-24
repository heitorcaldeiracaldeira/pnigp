// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_tche.mjs — folha nominal dos municípios com portal da Tchê Informática (GeneXus,
// `/TransparenciaJavaEnvironment/com.tche.transparencia.wfolha`). Achado em 16/ago/2026 no RS: 8 municípios.
//
// ⭐ A TELA JÁ É A FOLHA — o servlet chama-se literalmente `wfolha` e a grade traz, por servidor:
//   Nome · Ente · Departamento (secretaria) · Cargo · Vínculo · Tipo da folha · Valor base · VALOR BRUTO ·
//   Valor da previdência · Valor do Irf · Admissão · Exonerado/Demitido · Carga horária
//
// ⭐ O ATALHO é o EXPORT: a grade pagina de 17 em 17, mas o botão `#DDO_AGEXPORTContainer_btnGroupDrop` abre um
// menu com PDF / Excel / CSV. **Pegar CSV** — o "Excel" é XLS binário (BIFF), que exigiria parser.
// Mesma lição do GeneXus srv.br ([[pnigp-genexus-srvbr-scraper]]): exportar em vez de paginar.
//
// 🚨 Precisa de NAVEGADOR: o filtro é POST GeneXus com GXState; não há URL de replay.
// 🚨 COMPETÊNCIA MAIS CHEIA: baixamos os últimos MESES meses e ficamos com o maior
// ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
//
// Uso: node scripts/ingest_folha_tche.mjs      (SO=<município> · ANO=2026 · MESES=3)
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
const REFAZ = process.env.REFAZ === "1";
const ANO = process.env.ANO || String(new Date().getFullYear());
const MESES = Number(process.env.MESES || 3);
const MES_INI = Number(process.env.MES_INI || new Date().getMonth() + 1); // mês corrente; recuamos a partir dele

await q(`create table if not exists folha_servidores_tche (
  cod_ibge text, municipio text, uf text, competencia text,
  nome text, ente text, departamento text, cargo text, vinculo text, tipo_folha text,
  valor_base numeric, bruto numeric, previdencia numeric, irf numeric,
  admissao text, demissao text, carga_horaria text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_tche_mun on folha_servidores_tche (cod_ibge, competencia)`);
await q(`create table if not exists folha_tche_coleta (
  cod_ibge text primary key, municipio text, uf text, url text, competencia text,
  servidores int, com_valor int, situacao text, detalhe text, em timestamptz default now()
)`);
await q(`create table if not exists tche_portal (
  cod_ibge text primary key, municipio text, uf text, url text, achado_em timestamptz default now()
)`);

// semeia a tabela de portais com o que o diagnóstico já viu
await q(`insert into tche_portal (cod_ibge, municipio, uf, url)
  select d.cod_ibge, m.nome, m.uf,
         regexp_replace(coalesce(d.url_pessoal, d.url_visitada), '(TransparenciaJavaEnvironment).*', '\\1/com.tche.transparencia.wfolha')
    from folha_diagnostico_faltante d join municipios_br m on m.cod_ibge = d.cod_ibge
   where coalesce(d.url_pessoal, d.url_visitada) ilike '%TransparenciaJava%'
  on conflict (cod_ibge) do nothing`);
// … e dos candidatos achados lendo o site oficial (descobre_portal_pelo_site.mjs)
await q(`insert into tche_portal (cod_ibge, municipio, uf, url)
  select c.cod_ibge, c.municipio, c.uf,
         regexp_replace(c.url, '(TransparenciaJavaEnvironment).*', '\\1/com.tche.transparencia.wfolha')
    from folha_portal_candidato c where c.produto = 'tche'
  on conflict (cod_ibge) do nothing`);

const money = (s) => {
  const t = String(s ?? "").replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};
// CSV com aspas e separador variável (o export sai com `;`)
function campos(linha, sep) {
  const out = []; let cur = "", dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { if (dentro && linha[i + 1] === '"') { cur += '"'; i++; continue; } dentro = !dentro; continue; }
    if (c === sep && !dentro) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

async function baixaMes(page, url, ano, mes, dir) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3500);
  // 🚨 os `.catch(() => {})` daqui escondiam o pior defeito possível: se o ano/mês não fossem aplicados, a tela
  // devolvia a competência DEFAULT e o coletor gravava o dado com o rótulo do mês pedido
  // ([[pnigp-filtro-que-nao-aplica-confira-pelo-dado]]). Agora falha alto — e, depois do Enter, confere o que a
  // tela realmente ficou marcando, porque aqui não há botão de consulta: o filtro vai só pelo submit.
  await page.fill('input[name="vEXERCICIOANO"]', String(ano));
  await page.selectOption('select[name="vFOLHAMES"]', String(mes));
  await page.waitForTimeout(800);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(7000);
  const aplicado = await page.evaluate(() => ({
    ano: document.querySelector('input[name="vEXERCICIOANO"]')?.value,
    mes: document.querySelector('select[name="vFOLHAMES"]')?.value,
  })).catch(() => ({}));
  if (aplicado.ano != null && String(aplicado.ano) !== String(ano)) {
    throw new Error(`ano não aplicado: a tela ficou em ${aplicado.ano}, pedi ${ano}`);
  }
  if (aplicado.mes != null && String(aplicado.mes) !== String(mes)) {
    throw new Error(`mês não aplicado: a tela ficou em ${aplicado.mes}, pedi ${mes}`);
  }
  await page.click("#DDO_AGEXPORTContainer_btnGroupDrop").catch(() => {});
  await page.waitForTimeout(2000);
  // 🚨 O CSV NÃO É DOWNLOAD: o portal gera o arquivo em `/TransparenciaJavaEnvironment/tmp/{uuid}.txt` e abre numa
  // ABA NOVA. Esperar `download` estoura o timeout para sempre; o que se espera é o evento `popup` — e daí basta
  // ler a URL (de dentro da página, para herdar a sessão).
  try {
    const [pop] = await Promise.all([
      page.waitForEvent("popup", { timeout: 90000 }),
      page.evaluate(() => {
        const li = [...document.querySelectorAll("li")].find((e) => (e.innerText || "").trim() === "CSV");
        (li?.querySelector("a") || li)?.click();
      }),
    ]);
    const url2 = pop.url();
    await pop.close().catch(() => {});
    const txt = await page.evaluate(async (u) => await (await fetch(u)).text(), url2);
    const destino = path.join(dir, `tche_${ano}_${mes}_${Date.now()}.csv`);
    fs.writeFileSync(destino, txt, "utf8");
    return destino;
  } catch {
    // 🚨 FALLBACK: quando o export não abre o popup, a GRADE ainda está na tela. Pontão e Engenho Velho fechavam
    // "sem linhas em 6 meses" com 17 servidores visíveis — era o CSV que não vinha, não o dado que faltava.
    // Raspar a tabela paginando pelo botão "Seg"(uinte) e devolver no mesmo formato de CSV, para o parser único.
    try {
      const linhas = [];
      for (let pag = 0; pag < 200; pag++) {
        const bloco = await page.evaluate(() => {
          const tab = [...document.querySelectorAll("table")]
            .map((t) => ({ t, n: t.querySelectorAll("tr").length }))
            .sort((a, b) => b.n - a.n)[0]?.t;
          if (!tab) return [];
          return [...tab.querySelectorAll("tr")].map((tr) =>
            [...tr.querySelectorAll("th,td")].map((c) => (c.innerText || "").replace(/\s+/g, " ").trim()));
        });
        const uteis = bloco.filter((l) => l.length >= 4 && l.some(Boolean));
        if (!uteis.length) break;
        const antes = linhas.length;
        for (const l of uteis) { const k = l.join("|"); if (!linhas.some((x) => x.join("|") === k)) linhas.push(l); }
        if (linhas.length === antes) break;                    // página repetida: acabou
        const avancou = await page.evaluate(() => {
          const b = [...document.querySelectorAll("a,button,input,span,div")]
            .find((e) => /^(Seg|Próximo|Proximo|>)$/i.test((e.innerText || e.value || "").trim()));
          if (!b) return false; b.click(); return true;
        });
        if (!avancou) break;
        await page.waitForTimeout(3500);
      }
      if (!linhas.length) return null;
      const destino = path.join(dir, `tche_grade_${ano}_${mes}_${Date.now()}.csv`);
      fs.writeFileSync(destino, linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n"), "utf8");
      return destino;
    } catch { return null; }
  }
}

function parseCsv(arquivo) {
  // o export vem em latin-1 na maioria dos portais GeneXus; cair para utf-8 se não houver mojibake
  const bruto = fs.readFileSync(arquivo);
  let txt = bruto.toString("utf8");
  if (txt.includes("\uFFFD")) txt = bruto.toString("latin1");
  const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return { cab: [], dados: [] };
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ";" : ",";
  // a 1ª linha útil é o cabeçalho — o export pode trazer título antes; procuramos a linha com "Nome"
  const iCab = linhas.findIndex((l) => /nome/i.test(l) && /(cargo|bruto|departamento)/i.test(l));
  if (iCab < 0) return { cab: [], dados: [] };
  const cab = campos(linhas[iCab], sep).map((c) => c.toLowerCase());
  const dados = linhas.slice(iCab + 1).map((l) => campos(l, sep)).filter((f) => f.length >= cab.length - 2 && f.some(Boolean));
  return { cab, dados };
}
const acha = (cab, ...nomes) => {
  for (const n of nomes) { const i = cab.findIndex((c) => c.includes(n)); if (i >= 0) return i; }
  return -1;
};

const alvos = (await q(`select cod_ibge, municipio, uf, url from tche_portal
  ${SO ? "where municipio ilike '%'||$1||'%'" : ""} order by municipio`, SO ? [SO] : [])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_tche_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
console.log(`[tche] ${alvos.length} municípios · ${alvos.filter((a) => !feitos.has(a.cod_ibge)).length} na fila`);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tche-"));
const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
let totalGeral = 0;
for (const a of alvos) {
  if (feitos.has(a.cod_ibge)) continue;
  const marca = (situacao, detalhe, comp = null, n = 0, cv = 0) =>
    q(`insert into folha_tche_coleta (cod_ibge,municipio,uf,url,competencia,servidores,com_valor,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set
       competencia=excluded.competencia, servidores=excluded.servidores, com_valor=excluded.com_valor,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.url, comp, n, cv, situacao, detalhe]);
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
  const page = await ctx.newPage();
  try {
    let melhor = null;
    for (let k = 0; k < MESES; k++) {
      const mes = MES_INI - k > 0 ? MES_INI - k : 12 + (MES_INI - k);
      const ano = MES_INI - k > 0 ? ANO : String(+ANO - 1);
      const arq = await baixaMes(page, a.url, ano, mes, dir);
      if (!arq) continue;
      const { cab, dados } = parseCsv(arq);
      if (!dados.length) continue;
      if (!melhor || dados.length > melhor.dados.length) melhor = { cab, dados, comp: `${ano}${String(mes).padStart(2, "0")}` };
    }
    if (!melhor) { await marca("vazio", `sem linhas em ${MESES} meses a partir de ${MES_INI}/${ANO}`); console.log(`  ✖ ${a.municipio}: sem dados`); await ctx.close(); continue; }
    const { cab, dados, comp } = melhor;
    const iNome = acha(cab, "nome"), iEnte = acha(cab, "ente"), iDep = acha(cab, "departamento", "lotac"),
      iCargo = acha(cab, "cargo"), iVinc = acha(cab, "vinculo", "vínculo"), iTipo = acha(cab, "tipo"),
      iBase = acha(cab, "valor base", "base"), iBruto = acha(cab, "bruto"), iPrev = acha(cab, "previd"),
      iIrf = acha(cab, "irf"), iAdm = acha(cab, "admiss"), iDem = acha(cab, "exoner", "demit"), iCh = acha(cab, "carga");
    if (iNome < 0) { await marca("erro", `cabeçalho sem coluna de nome: ${cab.join("|").slice(0, 150)}`); await ctx.close(); continue; }
    const regs = dados.map((f) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, competencia: comp,
      nome: f[iNome] || "", ente: iEnte >= 0 ? f[iEnte] : "", departamento: iDep >= 0 ? f[iDep] : "",
      cargo: iCargo >= 0 ? f[iCargo] : "", vinculo: iVinc >= 0 ? f[iVinc] : "", tipo_folha: iTipo >= 0 ? f[iTipo] : "",
      valor_base: iBase >= 0 ? money(f[iBase]) : null, bruto: iBruto >= 0 ? money(f[iBruto]) : null,
      previdencia: iPrev >= 0 ? money(f[iPrev]) : null, irf: iIrf >= 0 ? money(f[iIrf]) : null,
      admissao: iAdm >= 0 ? f[iAdm] : "", demissao: iDem >= 0 ? f[iDem] : "", carga_horaria: iCh >= 0 ? f[iCh] : "",
    })).filter((r) => r.nome && !/^nome$/i.test(r.nome));
    for (const r of regs) r._hash = crypto.createHash("md5")
      .update([a.cod_ibge, comp, r.nome, r.cargo, r.departamento, r.admissao, r.bruto].join("¦")).digest("hex");
    const arr = [...new Map(regs.map((r) => [r._hash, r])).values()];
    if (!arr.length) { await marca("vazio", "CSV sem linhas aproveitáveis", comp); await ctx.close(); continue; }
    for (let i = 0; i < arr.length; i += 1000) {
      const p = arr.slice(i, i + 1000);
      const c = (f) => p.map((x) => x[f]);
      await q(`insert into folha_servidores_tche
        (cod_ibge,municipio,uf,competencia,nome,ente,departamento,cargo,vinculo,tipo_folha,
         valor_base,bruto,previdencia,irf,admissao,demissao,carga_horaria,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::numeric[],$15::text[],$16::text[],
          $17::text[],$18::text[])
        on conflict (_hash) do update set bruto=excluded.bruto, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("nome"), c("ente"), c("departamento"),
         c("cargo"), c("vinculo"), c("tipo_folha"), c("valor_base"), c("bruto"), c("previdencia"), c("irf"),
         c("admissao"), c("demissao"), c("carga_horaria"), c("_hash")]);
    }
    const cv = arr.filter((r) => r.bruto > 0).length;
    await marca("ok", `CSV do export · competência mais cheia entre ${MESES} meses`, comp, arr.length, cv);
    console.log(`  ${a.municipio}: ${arr.length} servidores (${cv} com valor) · ${comp}`);
    totalGeral += arr.length;
  } catch (e) {
    await marca("erro", String(e.message).slice(0, 200));
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 90)}`);
  }
  await ctx.close();
}
await browser.close();
console.log(`[tche] ${totalGeral.toLocaleString("pt-BR")} servidores`);
await db.end();
