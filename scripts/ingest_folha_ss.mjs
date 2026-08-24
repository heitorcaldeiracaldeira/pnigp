// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_ss.mjs — folha NOMINAL COM VALOR dos municípios da S&S Informática (dominante no CEARÁ).
//
// ⭐ O CAMINHO (IntraWeb/Delphi — `transparenciaisapi.dll`):
//   1. `pagamento.php?entcod={N}` abre a sessão e redireciona para o ISAPI
//   2. `window.doSelectMenu('pessoalfolha')` — ⭐ o menu é função JS, dispensa clique no drawer
//   3. Mês `#IWCOMBOBOX1` + Ano `#IWEDIT1` → botão **"Pesquisar Folha" `#IWBUTTON1`** popula `#IWCOMBOBOX2`
//   4. escolher a folha do MÊS (não "DÉCIMO TERCEIRO") → **"Visualizar" `#IWBUTTON2`**
//   5. ⭐⭐ o resultado é um **PDF** em `#iw-dlg-iframe` (`…/temp/NNNNNN.pdf`) — é ele que tem o VALOR
//
// 🚨 A tela "Pessoal Servidores" (`doSelectMenu('pessoal')`) mostra só Servidor·CPF·Folha·Natureza, SEM valor.
//    Quem parar nela conclui que o produto não publica folha ([[pnigp-lista-sem-valor-nao-e-folha]]).
//    O valor está no PDF de "Pessoal Folha".
// 🚨 `selectOption`/`click` do Playwright, NÃO `evaluate(...click())`: o IntraWeb escuta eventos que o clique
//    sintético não dispara — a cascata ficava vazia de forma intermitente.
// 🚨 O `tipo` do catálogo erra: entcod 137 está como prefeitura e o PDF diz "Câmara Municipal de Canindé".
//    A entidade REAL vem no cabeçalho do PDF — é ela que decide se a linha é do executivo.
//
// Uso: UF=CE node scripts/ingest_folha_ss.mjs   ·   ENT=137   ·   REFAZ=1   ·   LIMITE=20
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs"; import os from "os"; import path from "path"; import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "CE";
const ENT = process.env.ENT || null;
const REFAZ = process.env.REFAZ === "1";
const LIMITE = Number(process.env.LIMITE || 999);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

await q(`create table if not exists folha_servidores_ss (
  cod_ibge text, municipio text, uf text, entcod text, entidade text, poder text, competencia text,
  secretaria text, nome text, cpf_masc text, cargo text, natureza text,
  vencimento numeric, descontos numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_ss_mun on folha_servidores_ss (cod_ibge, competencia)`);
await q(`create table if not exists folha_ss_coleta (
  entcod text primary key, cod_ibge text, municipio text, uf text, entidade text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => { const t = String(s ?? "").replace(/\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };
const txt = (s) => { const v = String(s ?? "").replace(/\s+/g, " ").trim(); return v || null; };

// ── extrai os servidores do texto do PDF
// O layout repete, por servidor:
//   NOME ***.999.999-** FUNÇÃO
//   Servidor CPF Função
//   NATUREZA
//   Natureza
//   Vencimento Desconto
//   1.650,00 124,18Total do Servidor:
// e "Secretaria: X" abre cada bloco de lotação.
function extrai(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim());
  const out = [];
  let secretaria = null, entidade = null;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!entidade && /^(Prefeitura|C[âa]mara|Munic[íi]pio|Fundo|Instituto|Autarquia|Servi[çc]o)/i.test(l)) entidade = l;
    const ms = l.match(/^Secretaria:\s*(.+)$/i);
    if (ms) { secretaria = txt(ms[1]); continue; }
    // linha do servidor: NOME + CPF mascarado + função
    const m = l.match(/^(.+?)\s+(\*{3}\.\d{3}\.\d{3}-\*{2})\s*(.*)$/);
    if (!m) continue;
    const nome = txt(m[1]);
    const cpf = m[2];
    let cargo = txt(m[3]);
    // a função pode continuar na linha seguinte quando o PDF quebra
    if (!cargo && /^[A-ZÀ-Ú][^a-z]{3,}$/.test(linhas[i + 1] || "")) cargo = txt(linhas[i + 1]);
    // natureza e valores vêm nas linhas seguintes do bloco
    let natureza = null, venc = null, desc = null;
    for (let j = i + 1; j < Math.min(i + 9, linhas.length); j++) {
      const s = linhas[j];
      if (/^(EFETIVO|COMISSIONADO|TEMPOR[ÁA]RIO|AGENTE POL[ÍI]TICO|APOSENTAD|PENSIONISTA|CONTRATAD|ESTAGI)/i.test(s)) natureza = txt(s);
      const v = s.match(/^([\d.]+,\d{2})\s+([\d.]+,\d{2})\s*Total do Servidor/i);
      if (v) { venc = money(v[1]); desc = money(v[2]); break; }
      const v2 = s.match(/^([\d.]+,\d{2})\s*Total do Servidor/i);
      if (v2) { venc = money(v2[1]); break; }
    }
    if (venc == null) continue;               // sem valor não entra ([[pnigp-lista-sem-valor-nao-e-folha]])
    out.push({ nome, cpf_masc: cpf, cargo, natureza, vencimento: venc, descontos: desc, secretaria });
  }
  return { linhas: out, entidade };
}

const alvos = ENT
  ? (await q(`select entcod, municipio_nome, cod_ibge, entidade from ss_catalogo where entcod = $1`, [ENT])).rows
  // ⚠️ só PREFEITURA: o catálogo tem câmaras, institutos de previdência e consórcios, que não publicam folha
  //    e custam 4 competências × timeout cada um. Filtrar aqui cortou a fila de 314 para ~145 no CE.
  //    O `tipo` inferido erra às vezes; o `poder` final ainda vem do cabeçalho do PDF.
  // ⭐ 22/ago/2026 — PODER=legislativo: o catálogo tem 122 CÂMARAS (119 com município). O filtro acima nasceu
  //    quando o alvo era só o executivo, e a nota "câmara não publica" era um custo estimado, não medido.
  //    Agora a câmara É o alvo — e quem decide se publica é a coleta ([[pnigp-sonda-folha-prova-e-a-coleta]]).
  : (await q(`select entcod, municipio_nome, cod_ibge, entidade from ss_catalogo
      where uf = $1 and cod_ibge is not null
        and entidade ~* ${(process.env.PODER || "executivo").toLowerCase() === "legislativo"
            ? "'^c[âa]mara'" : "'^(prefeitura|munic[íi]pio de)'"}
      order by municipio_nome limit ${LIMITE}`, [UF])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select entcod from folha_ss_coleta where situacao = 'ok'`)).rows.map((r) => r.entcod));
const fila = alvos.filter((a) => !feitos.has(a.entcod));
console.log(`[ss] ${UF}: ${alvos.length} entidades no catálogo · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_ss
      (cod_ibge,municipio,uf,entcod,entidade,poder,competencia,secretaria,nome,cpf_masc,cargo,natureza,vencimento,descontos,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::text[])
      on conflict (_hash) do update set vencimento=excluded.vencimento, descontos=excluded.descontos, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entcod"), c("entidade"), c("poder"), c("competencia"),
       c("secretaria"), c("nome"), c("cpf_masc"), c("cargo"), c("natureza"), c("vencimento"), c("descontos"), c("_hash")]);
  }
}

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0, feitosN = 0;
// ⚠️ 12 competências × ~20s dava ~8h para os 313 do CE. A maioria publica o mês corrente ou o anterior:
//    RECUO=4 cobre isso, e CONC roda vários municípios ao mesmo tempo (cada um em seu contexto/sessão).
const RECUO = Number(process.env.RECUO || 4);
const CONC = Number(process.env.CONC || 1);   // ⚠️ 1 por padrão: ver PAUSA_MS acima

async function trata(a, i) {
  const marca = (situacao, detalhe, linhas = 0, competencia = null, entidade = null) =>
    q(`insert into folha_ss_coleta (entcod,cod_ibge,municipio,uf,entidade,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (entcod) do update set
       cod_ibge=excluded.cod_ibge, entidade=excluded.entidade, competencia=excluded.competencia,
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.entcod, a.cod_ibge, a.municipio_nome, UF, entidade || a.entidade, competencia, linhas, situacao, detalhe]);

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ss-"));
  try {
    await page.goto(`http://sstransparenciamunicipal.net:8080/transparencia/pagamento.php?entcod=${a.entcod}`,
      { waitUntil: "domcontentloaded", timeout: 60000 });
    // 🚨 esperar o RELÓGIO e chamar a função dava `window.doSelectMenu is not a function` em 57 de 57
    //    municípios quando o portal ficava lento — parecia servidor recusando, e era timing meu.
    //    Esperar a FUNÇÃO existir ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
    await page.waitForFunction(() => typeof window.doSelectMenu === "function", { timeout: 45000 })
      .catch(() => { throw new Error("doSelectMenu não apareceu em 45s — portal não carregou"); });
    await dorme(800);
    await page.evaluate(() => window.doSelectMenu("pessoalfolha"));
    await page.waitForSelector("#IWCOMBOBOX1", { timeout: 40000 });
    await dorme(1500);

    // ⭐ do mês corrente para trás, para no primeiro que tiver folha do mês
    let colhido = null, compEscolhida = null, entidadeReal = null;
    const hoje = new Date();
    for (let k = 0; k < RECUO && !colhido; k++) {
      const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
      const mes = MESES[d.getMonth()], ano = String(d.getFullYear());
      await page.selectOption("#IWCOMBOBOX1", { label: mes }).catch(() => {});
      await page.fill("#IWEDIT1", ano).catch(() => {});
      await dorme(900);
      await page.click("#IWBUTTON1", { force: true, timeout: 20000 }).catch(() => {});
      // 🚨 O combo fica UM CICLO ATRASADO: pedindo Junho ele ainda mostrava as folhas de Julho, e o
      //    "Visualizar" saía sem PDF. Não basta esperar o POST — esperar o combo REFLETIR o mês pedido.
      await page.waitForFunction((m) =>
        [...(document.querySelector("#IWCOMBOBOX2")?.options || [])]
          .some((x) => x.text.trim().toUpperCase() === m.toUpperCase()),
        mes, { timeout: 12000 }).catch(() => {});
      await dorme(1200);
      let ops = await page.evaluate(() => [...(document.querySelector("#IWCOMBOBOX2")?.options || [])].map((o) => o.text.trim()).filter(Boolean));
      // se ainda não reflete o mês pedido, clicar de novo (o IntraWeb perde o 1º postback com frequência)
      if (!ops.some((o) => new RegExp(`^${mes}$`, "i").test(o))) {
        await page.click("#IWBUTTON1", { force: true, timeout: 20000 }).catch(() => {});
        await dorme(5000);
        ops = await page.evaluate(() => [...(document.querySelector("#IWCOMBOBOX2")?.options || [])].map((o) => o.text.trim()).filter(Boolean));
      }
      // 🚨 a folha do MÊS, não "DÉCIMO TERCEIRO"/"FÉRIAS"/"RESCISÃO" — somar tudo infla
      const alvoFolha = ops.find((o) => new RegExp(`^${mes}$`, "i").test(o))
        || ops.find((o) => !/d[ée]cimo|f[ée]rias|rescis|adiant|complement/i.test(o));
      if (process.env.DEBUG) console.log(`      ${mes}/${ano}: folhas=[${ops.join(" | ")}] → escolhida="${alvoFolha || "nenhuma"}"`);
      if (!alvoFolha) continue;
      await page.selectOption("#IWCOMBOBOX2", { label: alvoFolha }).catch(() => {});
      await dorme(2500);
      // 🚨 SECRETARIA e NATUREZA têm opção "Todas" e NÃO vêm marcadas por padrão: sem setar, o PDF sai com um
      //    recorte. Viçosa do Ceará veio com 11 servidores de 3.412 da RAIS, São Gonçalo do Amarante 85 de
      //    5.698, Canindé 165 de 2.342. Marcar "Todas" nos dois ([[pnigp-filtro-que-nao-aplica-confira-pelo-dado]]).
      // ⚠️ cada `change` dispara um POSTBACK do IntraWeb: setar em sequência rápida perde a seleção anterior.
      //    Com 700ms Viçosa do Ceará saía com 11 servidores; com 2,5s vem com 2.878 (271 páginas de PDF).
      for (const cb of ["#IWCOMBOBOX3", "#IWCOMBOBOX4"]) {
        await page.selectOption(cb, { label: "Todas" }).catch(() => {});
        await dorme(2500);
      }
      await page.click("#IWBUTTON2", { force: true, timeout: 20000 }).catch(() => {});
      // espera o PDF APARECER no iframe, em vez de um relógio fixo
      // ⚠️ 45s de espera × 4 competências × município que não publica = horas paradas. 18s basta: o PDF
      //    aparece em ~6s quando existe.
      await page.waitForFunction(() => /\.pdf/i.test(document.querySelector("#iw-dlg-iframe")?.src || ""),
        { timeout: 18000 }).catch(() => {});
      const src = await page.evaluate(() => document.querySelector("#iw-dlg-iframe")?.src || null);
      if (process.env.DEBUG) console.log(`      PDF: ${src || "(nenhum)"}`);
      if (!src || !/\.pdf/i.test(src)) continue;
      const got = await page.evaluate(async (u) => {
        const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer());
        let s = ""; for (let x = 0; x < b.length; x += 8192) s += String.fromCharCode(...b.slice(x, x + 8192));
        return btoa(s);
      }, src).catch(() => null);
      if (!got) continue;
      const arq = path.join(tmp, "f.pdf");
      fs.writeFileSync(arq, Buffer.from(got, "base64"));
      const { extractText, getDocumentProxy } = await import("unpdf");
      const doc = await getDocumentProxy(new Uint8Array(fs.readFileSync(arq)));
      const { text } = await extractText(doc, { mergePages: true });
      const r = extrai(text);
      if (r.linhas.length) { colhido = r.linhas; entidadeReal = r.entidade; compEscolhida = `${ano}${String(d.getMonth() + 1).padStart(2, "0")}`; }
    }

    if (!colhido) { await marca("vazio", `sem folha nas últimas ${RECUO} competências`); vazios++;
      console.log(`  · ${a.municipio_nome}: vazio`); return; }

    // 🚨 o PDF declara a entidade: é a prova de que a folha é do EXECUTIVO e não da câmara
    const poder = /c[âa]mara|legislativ/i.test(String(entidadeReal || a.entidade)) ? "legislativo" : "executivo";
    const regs = colhido.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio_nome, uf: UF, entcod: a.entcod,
      entidade: entidadeReal || a.entidade, poder, competencia: compEscolhida,
      secretaria: s.secretaria, nome: s.nome, cpf_masc: s.cpf_masc, cargo: s.cargo, natureza: s.natureza,
      vencimento: s.vencimento, descontos: s.descontos,
      _hash: crypto.createHash("md5").update([a.entcod, compEscolhida, s.nome, s.cpf_masc, s.cargo].join("¦")).digest("hex"),
    }));
    await grava(regs);
    totalGeral += regs.length; ok++;
    // ⭐ régua externa: a RAIS é o denominador. Menos de 25% dos vínculos ativos é sinal de recorte
    //    (filtro de secretaria/natureza não aplicado, PDF parcial) — [[pnigp-conferidor-rais-denominador-folha]]
    const rais = poder === "executivo" && a.cod_ibge
      ? (await q(`select count(*)::int n from folha_rais_municipal where cod_ibge6 = left($1,6) and ativo_3112 = '1'`, [a.cod_ibge])).rows[0].n
      : 0;
    const magro = rais > 100 && regs.length < rais * 0.25;
    await marca(magro ? "subcoletado" : "ok",
      magro ? `só ${regs.length} de ${rais} vínculos da RAIS (${Math.round(100 * regs.length / rais)}%)` : `${poder} · ${entidadeReal || ""}`.slice(0, 150),
      regs.length, compEscolhida, entidadeReal);
    console.log(`  [${i + 1}/${fila.length}] ${a.municipio_nome.padEnd(24)} ${String(regs.length).padStart(5)} servidores · ${compEscolhida} · ${poder}` +
      (magro ? `  ⚠️ SUBCOLETADO — RAIS ${rais}` : ""));
  } catch (e) {
    await marca("falha", String(e.message).slice(0, 160)); falhas++;
    console.log(`  ✖ ${a.municipio_nome}: ${String(e.message).slice(0, 60)}`);
  } finally { await ctx.close().catch(() => {}); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

// 🚨 PAUSA obrigatória: cada `pagamento.php?entcod=` cria uma SESSÃO Delphi residente que só expira por
//    timeout. Sem pausa e com CONC alto eu esgotei a memória do servidor e derrubei o portal para todos
//    ([[pnigp-intraweb-sessao-derruba-servidor]]). PAUSA_MS entre lotes, CONC=1 por padrão neste produto.
const PAUSA_MS = Number(process.env.PAUSA_MS || 4000);
for (let i = 0; i < fila.length; i += CONC) {
  await Promise.all(fila.slice(i, i + CONC).map((a, k) => trata(a, i + k)));
  feitosN += Math.min(CONC, fila.length - i);
  await dorme(PAUSA_MS);
  if (feitosN % 30 < CONC) console.log(`  ── ${feitosN}/${fila.length} · ${ok} ok · ${totalGeral.toLocaleString("pt-BR")} servidores`);
}
await browser.close();
console.log(`\n[ss] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
