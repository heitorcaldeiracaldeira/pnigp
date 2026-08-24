// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_betha_egov.mjs — folha nominal do portal Betha ANTIGO ("Transparência Fly", JSF/Seam em
// `e-gov.betha.com.br/transparencia/01037-173/`). NÃO é o mesmo do `ingest_folha_betha.mjs`, que usa a API nova
// (`/auth/portais` + `busca-textual`): estes municípios não aparecem naquela lista.
//
// ⭐ COMO SE CHEGA: a URL 01037-173 é um SELETOR genérico — escolhe-se UF e município e clica-se em
// `input[value="Consultar"]`; a sessão passa a ser daquele município e as telas `con_*.faces` respondem.
//   `con_servidoresativos.faces` → Entidade · Ano · Mês · Situação · Lotação · Vínculo → Consultar → Exportar
//
// 🚨 A página SOBRESCREVE `Event`: `new Event("change")` estoura "Event is not a constructor" dentro de
// `page.evaluate`. Selecionar pelo Playwright (`selectOption`), que dispara o evento de fora da página.
// 🚨 O `<select>` de município só é preenchido DEPOIS do change da UF, e os handles antigos ficam stale — o JSF
// re-renderiza a página inteira. Reobter os elementos a cada passo.
//
// Uso: node scripts/ingest_folha_betha_egov.mjs        (UF=RS · SO=<município>)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const BASE = "https://e-gov.betha.com.br/transparencia/01037-173";
const UF = process.env.UF || "RS";
const SO = process.env.SO || null;
const ANO = process.env.ANO || String(new Date().getFullYear());
const MESES_TESTE = Number(process.env.MESES_TESTE || 3);
const MES_INI = Number(process.env.MES_INI || new Date().getMonth() + 1);
const COD_UF_JSF = { RS: "23" };   // valor do <select> de estado nesse portal

await q(`create table if not exists folha_servidores_betha_egov (
  cod_ibge text, municipio text, uf text, competencia text,
  matricula text, nome text, cargo text, lotacao text, vinculo text, situacao text, admissao text,
  carga_horaria text, salario numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_bethaegov_mun on folha_servidores_betha_egov (cod_ibge, competencia)`);
await q(`create table if not exists folha_betha_egov_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text,
  servidores int, com_valor int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  const t = String(s ?? "").replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// municípios da UF ainda sem folha, com o id do <select> daquele portal
const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
let ctx = await browser.newContext({ ignoreHTTPSErrors: true });
let page = await ctx.newPage();
// 🚨 A ESCOLHA DO MUNICÍPIO FICA NA SESSÃO: depois do primeiro, o portal não devolve mais a tela de seleção e
// todo `selectOption` estoura por timeout. Cada município precisa de um contexto NOVO (cookies limpos).
async function novaSessao() {
  await ctx.close().catch(() => {});
  ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  page = await ctx.newPage();
}

async function seletor() {
  await page.goto(`${BASE}/con_relatorios_opcionais.faces`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3500);
  const s = await page.$$("select");
  await s[0].selectOption(COD_UF_JSF[UF] || COD_UF_JSF.RS);
  await page.waitForTimeout(6000);
  return await page.evaluate(() => {
    const sel = document.querySelectorAll("select")[1];
    return sel ? [...sel.options].map((o) => ({ v: o.value, t: o.text.trim() })).filter((x) => /^\d+$/.test(x.v)) : [];
  });
}
const opcoes = await seletor();
console.log(`[betha-egov] ${opcoes.length} municípios de ${UF} no portal`);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%' and table_name <> 'folha_servidores_betha_egov'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const semFolha = (await q(`select cod_ibge, nome from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")})`, [UF])).rows;
const mapa = new Map(semFolha.map((m) => [so(m.nome), m]));
const fila = opcoes.filter((o) => mapa.has(so(o.t))).filter((o) => !SO || so(o.t).includes(so(SO)));
console.log(`[betha-egov] ${fila.length} na fila: ${fila.map((f) => f.t).join(", ")}`);

function tabelaDaTela(html) {
  const linhas = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((tr) => [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()));
  return linhas.filter((l) => l.length >= 3);
}

let totalGeral = 0;
for (const alvo of fila) {
  const mun = mapa.get(so(alvo.t));
  const marca = (situacao, detalhe, comp = null, n = 0, cv = 0) =>
    q(`insert into folha_betha_egov_coleta (cod_ibge,municipio,uf,competencia,servidores,com_valor,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set competencia=excluded.competencia,
       servidores=excluded.servidores, com_valor=excluded.com_valor, situacao=excluded.situacao,
       detalhe=excluded.detalhe, em=now()`, [mun.cod_ibge, mun.nome, UF, comp, n, cv, situacao, detalhe]);
  try {
    await novaSessao();
    await seletor();
    let s = await page.$$("select");
    await s[1].selectOption(alvo.v);
    await page.waitForTimeout(2500);
    await page.click('input[value="Consultar"]');
    await page.waitForTimeout(5000);

    let melhor = null;
    for (let k = 0; k < MESES_TESTE; k++) {
      const mes = MES_INI - k > 0 ? MES_INI - k : 12 + (MES_INI - k);
      const ano = MES_INI - k > 0 ? ANO : String(+ANO - 1);
      await page.goto(`${BASE}/con_servidoresativos.faces`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(4000);
      // 🚨 estes três `.catch(() => {})` faziam a falha do filtro passar em silêncio: sem a seleção ou sem o
      // clique em Consultar, a tela devolve a competência default e o coletor grava com o rótulo do mês pedido
      // ([[pnigp-filtro-que-nao-aplica-confira-pelo-dado]]). Falhar aqui pula a competência, que é o certo.
      try {
        await page.selectOption('select[name="mainForm:ano"]', ano);
        await page.selectOption('select[name="mainForm:mes"]', String(mes));
        await page.waitForTimeout(1200);
        await page.click('input[value="Consultar"]');
      } catch (e) {
        console.log(`     ${ano}-${mes}: filtro não aplicado (${String(e.message).split("\n")[0].slice(0, 60)})`);
        continue;
      }
      await page.waitForTimeout(9000);
      // o JSF re-renderiza a página: confere se os selects ficaram no que foi pedido antes de aceitar a grade
      const ap = await page.evaluate(() => ({
        ano: document.querySelector('select[name="mainForm:ano"]')?.value,
        mes: document.querySelector('select[name="mainForm:mes"]')?.value,
      })).catch(() => ({}));
      if ((ap.ano != null && String(ap.ano) !== String(ano)) || (ap.mes != null && String(ap.mes) !== String(mes))) {
        console.log(`     ${ano}-${mes}: a tela voltou em ${ap.ano}-${ap.mes} — competência descartada`);
        continue;
      }
      const linhas = tabelaDaTela(await page.content());
      if (linhas.length && (!melhor || linhas.length > melhor.linhas.length)) melhor = { ano, mes, linhas };
    }
    if (!melhor) { await marca("vazio", `sem linhas em ${MESES_TESTE} meses`); console.log(`  ✖ ${mun.nome}: sem dados`); continue; }

    const comp = `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`;
    // a 1ª linha é o cabeçalho — as colunas variam por município, então achamos pelo NOME
    const cab = melhor.linhas[0].map((c) => c.toLowerCase());
    const idx = (...nomes) => { for (const n of nomes) { const i = cab.findIndex((c) => c.includes(n)); if (i >= 0) return i; } return -1; };
    const iMat = idx("matr"), iNome = idx("nome", "servidor"), iCargo = idx("cargo", "função", "funcao"),
      iLot = idx("lota", "setor", "secret"), iVinc = idx("vínculo", "vinculo"), iSit = idx("situa"),
      iAdm = idx("admiss"), iCh = idx("carga"), iSal = idx("salário", "salario", "remunera", "valor", "bruto");
    if (iNome < 0) { await marca("erro", `cabeçalho sem nome: ${cab.join("|").slice(0, 140)}`); continue; }
    const regs = melhor.linhas.slice(1).map((f) => ({
      cod_ibge: mun.cod_ibge, municipio: mun.nome, uf: UF, competencia: comp,
      matricula: iMat >= 0 ? f[iMat] : "", nome: f[iNome] || "", cargo: iCargo >= 0 ? f[iCargo] : "",
      lotacao: iLot >= 0 ? f[iLot] : "", vinculo: iVinc >= 0 ? f[iVinc] : "", situacao: iSit >= 0 ? f[iSit] : "",
      admissao: iAdm >= 0 ? f[iAdm] : "", carga_horaria: iCh >= 0 ? f[iCh] : "",
      salario: iSal >= 0 ? money(f[iSal]) : null,
    })).filter((r) => r.nome && !/^nome/i.test(r.nome));
    for (const r of regs) r._hash = crypto.createHash("md5")
      .update([mun.cod_ibge, comp, r.matricula, r.nome, r.cargo].join("¦")).digest("hex");
    const arr = [...new Map(regs.map((r) => [r._hash, r])).values()];
    if (!arr.length) { await marca("vazio", "tabela sem linhas aproveitáveis", comp); continue; }
    for (let i = 0; i < arr.length; i += 1000) {
      const pz = arr.slice(i, i + 1000);
      const c = (f) => pz.map((x) => x[f]);
      await q(`insert into folha_servidores_betha_egov
        (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,lotacao,vinculo,situacao,admissao,carga_horaria,salario,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::text[])
        on conflict (_hash) do update set salario=excluded.salario, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("matricula"), c("nome"), c("cargo"),
         c("lotacao"), c("vinculo"), c("situacao"), c("admissao"), c("carga_horaria"), c("salario"), c("_hash")]);
    }
    const cv = arr.filter((r) => r.salario > 0).length;
    await marca(cv ? "ok" : "ok_sem_valor", `colunas: ${cab.join(" | ").slice(0, 150)}`, comp, arr.length, cv);
    console.log(`  ${mun.nome}: ${arr.length} servidores (${cv} com valor) · ${comp}`);
    totalGeral += arr.length;
  } catch (e) {
    await marca("erro", String(e.message).slice(0, 200));
    console.log(`  ✖ ${mun.nome}: ${String(e.message).slice(0, 90)}`);
  }
}
await browser.close();
console.log(`[betha-egov] ${totalGeral.toLocaleString("pt-BR")} servidores`);
await db.end();
