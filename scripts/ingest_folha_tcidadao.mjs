// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_tcidadao.mjs — quadro NOMINAL (nome · matrícula · CARGO · vínculo) do portal
// `transparenciacidadao.com.br`, que serve VÁRIOS municípios num host só, distinguidos por `?idCidade=N`.
//
// ⛔ SEM SALÁRIO, e isso é limite da FONTE: o grid traz Tipo Folha · Matrícula · Colaborador · Admissão ·
// Demissão · Tipo Contrato · Vínculo · Função. O valor fica atrás do botão "Detalhes", que é **ajax PrimeFaces
// sem URL** (`PrimeFaces.ab({s:"…tblColaboradores:N:j_idt139"})`) — uma ida ao servidor POR SERVIDOR. Município
// entra como "coletado sem valor".
//
// ⭐ O caminho: `/faces/paginas/rh_novo.xhtml?idCidade=N` (o `rh.xhtml` é layout velho; **rh_novo serve todos**)
//   → 3 selects: [0] Tipo de Folha · [1] Ano · [2] **Mês, 0-based (0=Janeiro)** → botão "Buscar"
//   → grid PrimeFaces de 20 linhas, paginado por `.ui-paginator-next`.
//
// 🚨 TRÊS ARMADILHAS MEDIDAS (17/ago):
//  1. **3 dos 14 idCidade são CÂMARA** (Campos Novos Paulista 37, Chavantes 22, Ubirajara 85) — a página declara
//     a entidade; conferir antes de gravar ([[pnigp-entidade-espelho-infla-folha]]).
//  2. O `select` nativo é escondido pelo PrimeFaces: `selectOption` do Playwright estoura timeout. Funciona
//     setando `.value` + `dispatchEvent('change')` por JS.
//  3. **A competência não é o mês corrente**: Manduri só tem folha em **dezembro/2025**; 2026 devolve
//     "Não existe folha". Varre (ano,mês) do fechado para trás e prefere quem tem "Folha Mensal" no Tipo Folha —
//     mesma lei de [[pnigp-competencia-mais-cheia-nao-a-recente]] e do tipo de folha do SCPI.
//
// Uso: UF=SP node scripts/ingest_folha_tcidadao.mjs · SO=Manduri · REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const MESES_TESTE = Number(process.env.MESES_TESTE || 10);   // pares (ano,mês) a tentar
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_tcidadao (
  cod_ibge text, municipio text, uf text, id_cidade text, entidade text, competencia text,
  tipo_folha text, matricula text, nome text, data_admissao text, data_demissao text,
  tipo_contrato text, vinculo text, cargo text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_tcid_mun on folha_servidores_tcidadao (cod_ibge, competencia)`);
await q(`create table if not exists folha_tcidadao_coleta (
  cod_ibge text primary key, municipio text, uf text, id_cidade text, entidade text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const alvos = (await q(`
  select cod_ibge, municipio, (regexp_match(coalesce(url_pessoal,url_visitada), 'idCidade=(\\d+)'))[1] id_cidade
    from folha_diagnostico_faltante
   where coalesce(url_pessoal,url_visitada) ilike '%transparenciacidadao%'
     ${SO ? "and municipio ilike '%'||$1||'%'" : ""}
   order by municipio`, SO ? [SO] : [])).rows.filter((a) => a.id_cidade);
const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_tcidadao_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[tcidadao] ${alvos.length} portais · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_tcidadao
      (cod_ibge,municipio,uf,id_cidade,entidade,competencia,tipo_folha,matricula,nome,data_admissao,data_demissao,
       tipo_contrato,vinculo,cargo,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[])
      on conflict (_hash) do update set _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("id_cidade"), c("entidade"), c("competencia"), c("tipo_folha"),
       c("matricula"), c("nome"), c("data_admissao"), c("data_demissao"), c("tipo_contrato"), c("vinculo"),
       c("cargo"), c("_hash")]);
  }
}

// lê a tabela cujo cabeçalho tem "Colaborador" (a outra é a de Cargos e Salários, que é tabela de vencimentos)
const leGrid = (page) => page.evaluate(() => {
  for (const t of document.querySelectorAll("table")) {
    const heads = [...t.querySelectorAll("th")].map((h) => h.innerText.trim().toLowerCase());
    if (!heads.some((h) => /colaborador/.test(h))) continue;
    const ix = (re) => heads.findIndex((h) => re.test(h));
    const col = { tipo: ix(/tipo folha/), mat: ix(/matr/), nome: ix(/colaborador/), adm: ix(/admiss/),
      dem: ix(/demiss/), contr: ix(/tipo contrato/), vinc: ix(/v[íi]nculo/), func: ix(/fun[çc]/) };
    const linhas = [...t.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim()))
      .filter((c) => c.length > 3 && c.some((x) => x));
    return { col, linhas };
  }
  return null;
});

const setaFiltro = (page, tipo, ano, mes) => page.evaluate(([t, a, m]) => {
  const s = [...document.querySelectorAll("select")];
  const set = (i, v) => { if (s[i]) { s[i].value = v; s[i].dispatchEvent(new Event("change", { bubbles: true })); } };
  set(0, t); set(1, a); set(2, m);
  const bt = [...document.querySelectorAll("button,input[type=submit],a")].filter((e) => /buscar/i.test(e.innerText || e.value || ""));
  if (bt[0]) bt[0].click();
}, [tipo, ano, mes]);

// pares (ano, mês 0-based) do mês FECHADO para trás
const COMPS = (() => {
  const out = []; const d0 = new Date(); d0.setDate(1); d0.setMonth(d0.getMonth() - 1);
  for (let k = 0; k < MESES_TESTE; k++) { const d = new Date(d0); d.setMonth(d0.getMonth() - k);
    out.push([String(d.getFullYear()), String(d.getMonth())]); }
  return out;
})();

let totalGeral = 0, ok = 0, vazios = 0, falhas = 0, camaras = 0;
const browser = await chromium.launch({ headless: true });
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, linhas = 0, comp = null, ent = null) =>
    q(`insert into folha_tcidadao_coleta (cod_ibge,municipio,uf,id_cidade,entidade,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,'SP',$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set entidade=excluded.entidade,
       competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao,
       detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.id_cidade, ent, comp, linhas, situacao, detalhe]);
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  try {
    await page.goto(`https://transparenciacidadao.com.br/faces/paginas/rh_novo.xhtml?idCidade=${a.id_cidade}`,
      { waitUntil: "domcontentloaded", timeout: 60000 });
    await dorme(3000);
    const txt = await page.locator("body").innerText();
    const ent = (txt.match(/(Prefeitura|C[âa]mara)\s+Municipal[^\n]{0,45}/i) || ["(não declarou)"])[0].trim();
    if (/c[âa]mara/i.test(ent)) { await marca("camara", `idCidade ${a.id_cidade} é ${ent}`, 0, null, ent); camaras++; console.log(`  ⏭ [${i + 1}/${fila.length}] ${a.municipio}: ${ent} — não é a prefeitura`); await page.close(); continue; }

    let melhor = null;
    for (const [ano, mes] of COMPS) {
      await setaFiltro(page, "0", ano, mes);
      await dorme(7000);
      const g = await leGrid(page);
      if (!g || !g.linhas.length) continue;
      const mensais = g.linhas.filter((c) => /folha\s*mensal/i.test(c[g.col.tipo] || "")).length;
      const cand = { ano, mes, mensais, n: g.linhas.length };
      if (!melhor || cand.mensais > melhor.mensais || (cand.mensais === melhor.mensais && cand.n > melhor.n)) melhor = cand;
      if (melhor.mensais > 0) break;   // achou folha mensal: é essa
    }
    if (!melhor) { await marca("vazio", `sem folha em ${COMPS.length} competências`, 0, null, ent); vazios++; console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: vazio`); await page.close(); continue; }

    // refaz a busca na competência escolhida e pagina
    await setaFiltro(page, "0", melhor.ano, melhor.mes);
    await dorme(7000);
    const competencia = `${melhor.ano}${String(Number(melhor.mes) + 1).padStart(2, "0")}`;
    const regs = []; const vistos = new Set(); let pg = 0;
    while (pg < 300) {
      const g = await leGrid(page);
      if (!g || !g.linhas.length) break;
      let novos = 0;
      for (const c of g.linhas) {
        const pega = (k) => { const v = g.col[k] >= 0 && g.col[k] < c.length ? String(c[g.col[k]]).trim() : ""; return v || null; };
        const r = { cod_ibge: a.cod_ibge, municipio: a.municipio, uf: "SP", id_cidade: a.id_cidade, entidade: ent,
          competencia, tipo_folha: pega("tipo"), matricula: pega("mat"), nome: pega("nome"),
          data_admissao: pega("adm"), data_demissao: pega("dem"), tipo_contrato: pega("contr"),
          vinculo: pega("vinc"), cargo: pega("func") };
        if (!r.nome && !r.matricula) continue;
        r._hash = crypto.createHash("md5").update([a.cod_ibge, competencia, r.matricula, r.nome, r.cargo, r.tipo_folha].join("¦")).digest("hex");
        if (vistos.has(r._hash)) continue;
        vistos.add(r._hash); regs.push(r); novos++;
      }
      if (regs.length >= LOTE) await grava(regs.splice(0));
      if (!novos) break;   // página repetida: a navegação parou de funcionar
      const prox = page.locator(".ui-paginator-next").first();
      const desativado = await prox.evaluate((e) => /ui-state-disabled/.test(e.className)).catch(() => true);
      if (desativado) break;
      await prox.click({ timeout: 10000 }).catch(() => {});
      await dorme(4000);
      pg++;
    }
    if (regs.length) await grava(regs);
    const n = vistos.size;
    if (!n) { await marca("vazio", "grid sem linhas na competência escolhida", 0, competencia, ent); vazios++; console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: vazio`); }
    else { await marca("ok", `${pg + 1} páginas · ${melhor.mensais} linhas de folha mensal na 1ª página`, n, competencia, ent); ok++; totalGeral += n; console.log(`  [${i + 1}/${fila.length}] ${a.municipio}: ${n} servidores (${competencia})`); }
  } catch (e) {
    await marca("erro", String(e.message).slice(0, 200)); falhas++;
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).split("\n")[0].slice(0, 70)}`);
  }
  await page.close().catch(() => {});
}
await browser.close();
console.log(`\n[tcidadao] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${camaras} câmaras puladas · ${falhas} falhas`);
await db.end();
