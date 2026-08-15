// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_govbr_gp.mjs — folha nominal dos portais GovernançaBrasil que NÃO têm o módulo "Folha de Pagamento".
//
// ⭐ O QUE ESTAVA FALTANDO NO CRACK (14/ago): o coletor antigo ([[ingest_folha_govbr_auto]]) fixava a rota
// `index.asp?acao=10&item=8` — a tela que gera o ZIP/XML da folha, que existe em Ijuí. Em ~16 municípios essa tela
// NÃO EXISTE no menu, e o coletor morria em "locator.click: Element is not visible" / "Timeout", como se o portal
// estivesse quebrado. O menu desses portais oferece outra tela: **"Salários por Colaborador"** (`acao=4&item=5`),
// com matrícula, nome, cargo, vínculo, salário base, proventos, vantagens, vencimentos totais, descontos e líquido.
//
// 🚨 TRÊS ARMADILHAS desta tela:
//   1. os filtros têm sufixo GP (`cmbUnidadeGP`, `cmbVinculoGP`, `cmbAnoGP`, `cmbMesInicialGP`, `cmbMesFinalGP`) —
//      são outros elementos, os sem sufixo pertencem ao módulo de Publicações e aceitam o valor sem efeito nenhum;
//   2. os botões de exportação vivem dentro de um <tr style="display:none"> com `visibility:hidden`: o clique do
//      Playwright não dispara NADA (zero POST, zero erro). É preciso tornar a linha visível antes de clicar;
//   3. o clique NÃO baixa arquivo — o servidor devolve a própria tela com a listagem em HTML, paginada. O dado
//      vem da RASPAGEM da tabela, não de um download. Esperar `download` era esperar um evento que nunca vem.
//
// A rota NÃO é fixada: o item é achado pelo texto no menu (`st_menus`), porque o número varia entre portais.
// LIMITE CONHECIDO: esta tela não traz lotação/secretaria — a tela "Salários por Lotação/Cargo" existe, mas é
// agregada, sem nomes. Aqui saem 4 dos 5 campos (nome, cargo, vínculo, remuneração).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const RECUO = Number(process.env.RECUO || 6);       // meses a recuar até achar competência com dado
const MAX_PAG = Number(process.env.MAX_PAG || 400); // trava de segurança da paginação
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists govbr_gp_coleta (
  cod_ibge text, competencia text, linhas int, situacao text, detalhe text, em timestamptz default now(),
  primary key (cod_ibge, competencia)
)`);

const money = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/R\$|\s| /g, "").replace(/\./g, "").replace(",", ".");
  const n = +t; return Number.isFinite(n) ? n : null;
};

// acha no menu a URL da tela nominal — o número de acao/item MUDA por portal, então nunca fixar
async function achaRota(page) {
  return page.evaluate(() => {
    const alvos = [/sal[áa]rios?\s+por\s+colaborador/i, /folha\s+de\s+pagamento/i, /rela[çc][ãa]o\s+de\s+servidores/i];
    const itens = [];
    for (const m of (window.st_menus || [])) for (const b of (m.bodys || [])) for (const it of (b.items || [])) {
      const u = String(it.url || ""); const t = String(it.text || "");
      const q = u.match(/index\.asp\?(acao=\d+&item=\d+)/i);
      if (q) itens.push({ texto: t, rota: q[1] });
    }
    for (const re of alvos) { const hit = itens.find((i) => re.test(i.texto)); if (hit) return hit; }
    return null;
  });
}

// preenche os filtros GP, torna visível a linha oculta dos botões e submete; devolve as linhas da tabela
async function consulta(page, host, rota, unidade, ano, mes) {
  // ⚠️ o próprio menu do portal navega como `javascript:limparCookies();location.href='index.asp?...'` — sem essa
  // limpeza a tela abre com o estado da consulta anterior e responde vazia. O portal é stateful.
  await page.evaluate(() => { try { limparCookies(); } catch {} });
  await page.goto(`https://${host}/pronimtb/index.asp?${rota}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await dorme(2000);
  await page.evaluate(({ un, ano, mes }) => {
    const set = (n, v) => { const e = document.querySelector(`[id="${n}"],[name="${n}"]`); if (e) { e.value = v; ["change", "input", "blur"].forEach((ev) => e.dispatchEvent(new Event(ev, { bubbles: true }))); } };
    // ⚠️ a UNIDADE é obrigatória e o combo só existe DENTRO da tela (na home ele não está no DOM). Deixá-la em
    // branco faz o servidor devolver a tela sem listagem — que parecia "município sem dado".
    const cu = document.querySelector('[id="cmbUnidadeGP"],[name="cmbUnidadeGP"]');
    const valor = un || (cu && cu.options[0] ? cu.options[0].value : null);
    if (valor) set("cmbUnidadeGP", valor);
    set("cmbVinculoGP", "0"); set("cmbAnoGP", String(ano));
    set("cmbMesInicialGP", String(mes)); set("cmbMesFinalGP", String(mes));
    const b = document.querySelector('input[name="exportarCSV"]');
    if (b) { let p = b; for (let i = 0; i < 6 && p; i++) { p.style.display = ""; p.style.visibility = "visible"; p = p.parentElement; } }
  }, { un: unidade, ano, mes });
  await dorme(600);
  await page.locator('input[name="exportarCSV"]').first().click({ force: true }).catch(() => {});
  // ⚠️ esperar por TEMPO FIXO aqui dava falso "sem linhas": o POST recarrega a página inteira e a tabela leva mais
  // que os 4s que eu tinha posto. Espera ativa pela tabela, e só depois lê.
  await esperaTabela(page);
  return lePagina(page);
}

// espera a tabela aparecer E parar de crescer — ler assim que ela existe pegava a tabela pela metade (3 linhas de 61)
async function esperaTabela(page) {
  await page.waitForFunction(() => [...document.querySelectorAll("table")]
    .some((t) => /matr[íi]cula/i.test(t.innerText) && /l[íi]quido/i.test(t.innerText) && t.rows.length > 2),
    { timeout: 45000 }).catch(() => {});
  let anterior = -1;
  for (let i = 0; i < 25; i++) {   // municípios grandes demoram a montar a tabela
    await dorme(800);
    const n = await page.evaluate(() => {
      const t = [...document.querySelectorAll("table")].find((x) => /matr[íi]cula/i.test(x.innerText) && /l[íi]quido/i.test(x.innerText));
      return t ? t.rows.length : 0;
    }).catch(() => 0);
    if (n > 0 && n === anterior) return;
    anterior = n;
  }
}

// 🚨 LER PELO CABEÇALHO, não por posição: a ordem e a quantidade de colunas variam entre portais (uns têm "Tipo da
// Folha", outros não). Com índices fixos, Medianeira gravou 24 de 48 linhas — o resto caiu porque o "nome" estava
// noutra coluna e o registro saía sem nome.
const lePagina = (page) => page.evaluate(() => {
  const tab = [...document.querySelectorAll("table")]
    .find((t) => /matr[íi]cula/i.test(t.innerText) && /l[íi]quido/i.test(t.innerText) && t.rows.length > 2);
  if (!tab) return [];
  const linhas = [...tab.rows].map((tr) => [...tr.cells].map((c) => c.innerText.trim()));
  const cab = linhas.find((c) => c.some((x) => /^matr[íi]cula$/i.test(x)) && c.some((x) => /^l[íi]quido$/i.test(x)));
  if (!cab) return [];
  const idx = (re) => cab.findIndex((c) => re.test(c));
  const col = {
    matricula: idx(/matr[íi]cula/i), nome: idx(/^nome/i), cargo: idx(/cargo/i), vinculo: idx(/v[íi]nculo/i),
    salario_base: idx(/sal[áa]rio\s*base/i), proventos: idx(/proventos/i), vantagens: idx(/vantagens/i),
    vencimentos: idx(/vencimentos/i), descontos: idx(/descontos/i), liquido: idx(/l[íi]quido/i),
  };
  const pega = (c, i) => (i >= 0 && i < c.length ? c[i] : null);
  return linhas
    .filter((c) => c.length >= cab.length - 1 && c !== cab && !/^totais$/i.test(c[0] || "") && !/^matr[íi]cula$/i.test(c[0] || ""))
    .map((c) => Object.fromEntries(Object.entries(col).map(([k, i]) => [k, pega(c, i)])))
    .filter((r) => r.nome);
});

const alvos = (await q(`select p.cod_ibge, m.nome municipio, m.uf, p.host from govbr_portal p
  join municipios_br m on m.cod_ibge = p.cod_ibge
 where p.host is not null
   and (not exists (select 1 from folha_servidores_govbr f where f.cod_ibge = p.cod_ibge)
        -- os já colhidos por ESTA tela voltam à fila: as primeiras rodadas pararam na 2ª página
        or exists (select 1 from govbr_gp_coleta g where g.cod_ibge = p.cod_ibge and g.situacao = 'ok'))
   ${SO ? "and m.nome ilike '%'||$1||'%'" : ""}
 order by m.uf, m.nome`, SO ? [SO] : [])).rows;
console.log(`[govbr_gp] ${alvos.length} municípios sem folha`);

const browser = await chromium.launch({ headless: true });
let ok = 0, falhas = 0, totalGeral = 0;
for (let i = 0; i < alvos.length; i++) {
  const a = alvos[i];
  const marca = (competencia, situacao, detalhe, linhas = 0) =>
    q(`insert into govbr_gp_coleta (cod_ibge,competencia,linhas,situacao,detalhe,em) values ($1,$2,$3,$4,$5,now())
       on conflict (cod_ibge,competencia) do update set linhas=excluded.linhas, situacao=excluded.situacao,
       detalhe=excluded.detalhe, em=now()`, [a.cod_ibge, competencia, linhas, situacao, detalhe]);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`https://${a.host}/pronimtb/index.asp`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dorme(1500);
    const rota = await achaRota(page);
    if (!rota) { await marca("-", "sem_rota", "menu sem tela nominal de salários"); falhas++; continue; }
    // 🚨 na HOME o combo de unidade existe no DOM mas SEM OPÇÕES — elas só são montadas DENTRO da tela. Ler ali
    // devolvia lista vazia (o laço nem rodava) e, depois, deixar o portal escolher a primeira opção trazia só uma
    // entidade: Medianeira fechou com 48 servidores porque veio uma autarquia, não a prefeitura. Abrir a tela
    // primeiro, listar TODAS as unidades, e varrer uma a uma.
    await page.evaluate(() => { try { limparCookies(); } catch {} });
    await page.goto(`https://${a.host}/pronimtb/index.asp?${rota.rota}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dorme(2000);
    const unidades = (await page.evaluate(() => {
      const u = document.querySelector('[id="cmbUnidadeGP"],[name="cmbUnidadeGP"]');
      return u ? [...u.options].filter((o) => o.value).map((o) => ({ v: o.value, t: o.text.trim() })) : [];
    }));
    if (!unidades.length) unidades.push({ v: null, t: "(resolvida na tela)" });
    if (process.env.DEBUG) console.log(`    [dbg] ${a.municipio}: ${unidades.length} unidades -> ${unidades.map((u) => u.t).join(" | ").slice(0, 120)}`);

    const vistos = new Set();
    const regs = [];
    let compUsada = null, espelhos = 0;
    const d0 = new Date(); d0.setDate(1); d0.setMonth(d0.getMonth() - 1); // começa no mês fechado
    for (const un of unidades) {
      let achou = false;
      for (let k = 0; k < RECUO && !achou; k++) {
        const d = new Date(d0); d.setMonth(d0.getMonth() - k);
        const ano = d.getFullYear(), mes = d.getMonth() + 1;
        let linhas = await consulta(page, a.host, rota.rota, un.v, ano, mes);
        if (process.env.DEBUG) console.log(`    [dbg] ${a.municipio} rota=${rota.rota} un=${un.v} ${ano}-${mes} -> ${linhas.length} linhas`);
        if (!linhas.length) continue;
        achou = true;
        compUsada = `${ano}${String(mes).padStart(2, "0")}`;
        // pagina: "Próxima página" até acabar (ou repetir a 1ª linha)
        const daUnidade = [...linhas];
        for (let p = 1; p < MAX_PAG; p++) {
          const link = page.locator('a:has-text("Próxima página")').first();
          if (!(await link.count())) break;
          const antes = JSON.stringify(linhas[0] || {});
          // o clique NAVEGA (recarrega a página): sem esperar, o evaluate seguinte morre com
          // "Execution context was destroyed"
          await Promise.all([
            page.waitForLoadState("domcontentloaded", { timeout: 45000 }).catch(() => {}),
            link.click({ force: true }).catch(() => {}),
          ]);
          // 🚨 esperar por tempo e depois comparar a 1ª linha PARAVA CEDO nos municípios grandes: se a página nova
          // ainda não tinha renderizado, a linha vinha igual e eu lia isso como "acabou". Montes Claros fechou com
          // 76 servidores de 13.888. Agora espera-se ATIVAMENTE a primeira linha mudar antes de desistir.
          await page.waitForFunction((ant) => {
            const t = [...document.querySelectorAll("table")].find((x) => /matr[íi]cula/i.test(x.innerText) && /l[íi]quido/i.test(x.innerText));
            if (!t) return false;
            const linha = [...t.rows].map((tr) => [...tr.cells].map((c) => c.innerText.trim()))
              .find((c) => c.length >= 8 && !/^matr[íi]cula$/i.test(c[0] || "") && !/^totais$/i.test(c[0] || ""));
            return linha ? !ant.includes(linha[2] || linha[1] || "###") : false;
          }, antes, { timeout: 60000 }).catch(() => {});
          await esperaTabela(page);
          linhas = await lePagina(page);
          if (!linhas.length || JSON.stringify(linhas[0] || {}) === antes) break;
          daUnidade.push(...linhas);
        }
        for (const c of daUnidade) {
          const reg = {
            cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, competencia: compUsada,
            lotacao: null, secretaria: null, cargo: c.cargo || null, nome: c.nome || null,
            salario_base: money(c.salario_base), proventos: money(c.proventos), vantagens: money(c.vantagens),
            vencimentos_totais: money(c.vencimentos), descontos: money(c.descontos), liquido: money(c.liquido),
            // o hash não leva a unidade: portal que repete a mesma folha em várias unidades é espelho, não dado novo
            _hash: crypto.createHash("md5").update([a.cod_ibge, compUsada, c.matricula, c.nome, c.cargo].join("¦")).digest("hex"),
          };
          if (!reg.nome) continue;
          if (vistos.has(reg._hash)) continue;
          vistos.add(reg._hash); regs.push(reg);
        }
        if (!daUnidade.length) espelhos++;
      }
    }
    if (!regs.length) { await marca("-", "vazio", `sem linhas em ${RECUO} meses`); falhas++; continue; }
    for (let k = 0; k < regs.length; k += 1000) {
      const p = regs.slice(k, k + 1000); const c = (f) => p.map((x) => x[f]);
      await q(`insert into folha_servidores_govbr
        (cod_ibge,municipio,uf,competencia,lotacao,secretaria,cargo,nome,salario_base,proventos,vantagens,
         vencimentos_totais,descontos,liquido,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::numeric[],$10::numeric[],$11::numeric[],$12::numeric[],$13::numeric[],$14::numeric[],$15::text[])
        on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("lotacao"), c("secretaria"), c("cargo"),
         c("nome"), c("salario_base"), c("proventos"), c("vantagens"), c("vencimentos_totais"), c("descontos"),
         c("liquido"), c("_hash")]);
    }
    totalGeral += regs.length; ok++;
    await marca(compUsada, "ok", rota.texto, regs.length);
    console.log(`  [${i + 1}/${alvos.length}] ${a.uf} ${a.municipio}: ${regs.length} servidores (${compUsada}, "${rota.texto}")`);
  } catch (e) {
    falhas++; await marca("-", "erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${alvos.length}] ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close(); }
}
await browser.close();
console.log(`\n[govbr_gp] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${falhas} falhas`);
await db.end();
