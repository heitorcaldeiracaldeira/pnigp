// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_pronim_grade.mjs — folha nominal do PRONIM/GovBR RASPANDO A GRADE, para as instalações em que o
// export não baixa arquivo nenhum.
//
// ⭐ Achado em 17/ago/2026 em ELDORADO DO SUL/RS, que estava havia dias como `pendencia_tecnica`. O registro
// anterior dizia: *"o botão Gerar NÃO dispara download nem com todos os campos preenchidos"*. É verdade — e a
// conclusão que eu tirei disso é que estava errada: **o "Gerar" não baixa arquivo, ele PREENCHE A TELA**. A folha
// inteira estava ali, paginada, o tempo todo ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
//
// O CAMINHO (item "Salários do Quadro de Pessoal" = `acao=4&item=5`, garimpado do objeto de menu
// `st_menus[0].bodys[12].items[N].url`, porque o menu do PRONIM não tem href navegável):
//   1. abrir `/pronimtb/index.asp` (a home cria a sessão)
//   2. ir para `/pronimtb/index.asp?acao=4&item=5`
//   3. selecionar `#cmbUnidadeGP` (DW_LC131_AP_2 = prefeitura, _3 = estagiários) e `#cmbDataGP` (AAAAMM01)
//   4. clicar `input[value='Gerar']` → a grade aparece na própria página
//   5. ⭐ paginar por GET: `?acao=4&item=5&visao=1&numpag=N` — o estado da consulta fica na SESSÃO, então a URL
//      da página seguinte não repete os filtros
//
// Colunas: Matrícula · Tipo da Folha · Nome · Cargo · Vínculo · Salário Base · Proventos · Vantagens ·
//          Vencimentos Totais · Descontos · Líquido    (valores no formato "R$ 4.705,32")
//
// Uso: HOST=webapp1-eldoradodosul.cidade360.cloud MUN="Eldorado do Sul" UF=RS node scripts/ingest_folha_pronim_grade.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const HOST = process.env.HOST || "webapp1-eldoradodosul.cidade360.cloud";
const MUN = process.env.MUN || "Eldorado do Sul";
const UF = process.env.UF || "RS";
const ESQ = process.env.ESQUEMA || "https";
const MESES_TESTE = Number(process.env.MESES_TESTE || 3);
const B = `${ESQ}://${HOST}/pronimtb`;

await q(`create table if not exists folha_servidores_pronimgrade (
  cod_ibge text, municipio text, uf text, competencia text, unidade text,
  matricula text, tipo_folha text, nome text, cargo text, vinculo text,
  salario_base numeric, proventos numeric, vantagens numeric, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_pronimgrade_mun on folha_servidores_pronimgrade (cod_ibge, competencia)`);
await q(`create table if not exists folha_pronimgrade_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text, unidades text,
  servidores int, com_valor int, paginas int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  const t = String(s ?? "").replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};
// 🚨 o código IBGE vem do cadastro, nunca digitado ([[pnigp-nunca-digitar-codigo-ibge]])
const mun = (await q(`select cod_ibge, nome, uf from municipios_br where uf=$1 and lower(nome)=lower($2) limit 1`,
  [UF, MUN])).rows[0];
if (!mun) throw new Error(`"${MUN}" não está em municipios_br (${UF})`);

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const frameTela = () => page.frames().find((f) => /acao=4/.test(f.url())) || page.mainFrame();

// a grade é a tabela que tem Matrícula E Líquido no cabeçalho
async function raspa() {
  return frameTela().evaluate(() => {
    const t = [...document.querySelectorAll("table")]
      .find((x) => /Matr[íi]cula/i.test(x.innerText) && /L[íi]quido/i.test(x.innerText));
    if (!t) return { cab: null, linhas: [] };
    const trs = [...t.querySelectorAll("tr")]
      .map((tr) => [...tr.querySelectorAll("td,th")].map((c) => (c.innerText || "").replace(/\s+/g, " ").trim()));
    const iCab = trs.findIndex((l) => /^Matr[íi]cula$/i.test(l[0] || ""));
    return { cab: iCab >= 0 ? trs[iCab] : null, linhas: trs.slice(iCab + 1).filter((l) => l.length >= 10 && l[2]) };
  });
}
async function totalPaginas() {
  return frameTela().evaluate(() => {
    const ns = [...document.querySelectorAll("a")].map((a) => a.innerText.trim()).filter((t) => /^\d+$/.test(t)).map(Number);
    return ns.length ? Math.max(...ns) : 1;
  });
}
async function abreConsulta(unidade, data) {
  await page.goto(`${B}/index.asp`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.goto(`${B}/index.asp?acao=4&item=5`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(3500);
  const fr = frameTela();
  await fr.selectOption("#cmbUnidadeGP", unidade);
  await page.waitForTimeout(1800);
  await fr.selectOption("#cmbDataGP", data);
  await page.waitForTimeout(1800);
  await fr.click("input[value='Gerar']");
  await page.waitForTimeout(7000);
}

try {
  // descobre unidades e competências disponíveis
  await page.goto(`${B}/index.asp`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.goto(`${B}/index.asp?acao=4&item=5`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(3500);
  const opts = await frameTela().evaluate(() => ({
    unidades: [...(document.querySelector("#cmbUnidadeGP")?.options || [])].map((o) => ({ v: o.value, t: o.text.trim() })).filter((o) => o.v),
    datas: [...(document.querySelector("#cmbDataGP")?.options || [])].map((o) => ({ v: o.value, t: o.text.trim() })).filter((o) => o.v),
  }));
  console.log(`[pronim-grade] ${mun.nome}/${mun.uf}: ${opts.unidades.length} unidades · ${opts.datas.length} competências`);
  opts.unidades.forEach((u) => console.log(`   ${u.v} = ${u.t}`));
  if (!opts.unidades.length || !opts.datas.length) throw new Error("tela sem combo de unidade ou de competência");

  // ⭐ competência mais cheia entre as N mais recentes ([[pnigp-competencia-mais-cheia-nao-a-recente]])
  const principal = opts.unidades[0];
  let melhor = null;
  for (const d of opts.datas.slice(0, MESES_TESTE)) {
    await abreConsulta(principal.v, d.v);
    const { linhas } = await raspa();
    const p = await totalPaginas();
    console.log(`   ${d.t}: ${linhas.length} linhas na 1ª página · ${p} páginas`);
    if (!melhor || p > melhor.p || (p === melhor.p && linhas.length > melhor.n)) melhor = { ...d, p, n: linhas.length };
  }
  if (!melhor?.n) throw new Error("nenhuma competência devolveu linhas");
  const competencia = `${melhor.v.slice(0, 4)}${melhor.v.slice(4, 6)}`;
  console.log(`   ⭐ ${melhor.t} (${melhor.p} páginas)`);

  let gravados = 0, comValor = 0, paginasTotal = 0;
  const vistos = new Set();
  for (const u of opts.unidades) {
    await abreConsulta(u.v, melhor.v);
    const paginas = await totalPaginas();
    paginasTotal += paginas;
    for (let p = 1; p <= paginas; p++) {
      if (p > 1) {
        // ⭐ a página seguinte é um GET simples: o filtro já está na sessão
        await page.goto(`${B}/index.asp?acao=4&item=5&visao=1&numpag=${p}`, { waitUntil: "networkidle", timeout: 120000 });
        await page.waitForTimeout(2200);
      }
      const { linhas } = await raspa();
      for (const l of linhas) {
        const [matricula, tipoFolha, nome, cargo, vinculo, base, proventos, vantagens, totais, descontos, liquido] = l;
        if (!nome) continue;
        const _hash = crypto.createHash("sha1")
          .update([mun.cod_ibge, competencia, u.v, matricula, nome, cargo].join("|")).digest("hex");
        if (vistos.has(_hash)) continue;
        vistos.add(_hash);
        const bruto = money(totais);
        await q(`insert into folha_servidores_pronimgrade
          (cod_ibge, municipio, uf, competencia, unidade, matricula, tipo_folha, nome, cargo, vinculo,
           salario_base, proventos, vantagens, bruto, descontos, liquido, _hash)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos,
            liquido=excluded.liquido, _coletado_em=now()`,
          [mun.cod_ibge, mun.nome, mun.uf, competencia, u.t, matricula, tipoFolha, nome, cargo, vinculo,
           money(base), money(proventos), money(vantagens), bruto, money(descontos), money(liquido), _hash]);
        gravados++; if (bruto > 0) comValor++;
      }
      process.stdout.write(`   ${u.t.slice(0, 28)}: página ${p}/${paginas} · ${gravados} gravados\r`);
    }
    console.log(`   ${u.t}: ${paginas} páginas                              `);
  }
  console.log(`[pronim-grade] ${gravados} servidores · ${comValor} com valor · competência ${competencia}`);
  await q(`insert into folha_pronimgrade_coleta
    (cod_ibge, municipio, uf, competencia, unidades, servidores, com_valor, paginas, situacao, detalhe, em)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
    on conflict (cod_ibge) do update set competencia=excluded.competencia, unidades=excluded.unidades,
      servidores=excluded.servidores, com_valor=excluded.com_valor, paginas=excluded.paginas,
      situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [mun.cod_ibge, mun.nome, mun.uf, competencia, opts.unidades.map((u) => u.t).join(" + "),
     gravados, comValor, paginasTotal, gravados ? "ok" : "vazio",
     `acao=4&item=5 "Salários do Quadro de Pessoal"; grade raspada (o Gerar não baixa arquivo, preenche a tela)`]);
} finally {
  await browser.close();
  await db.end();
}
