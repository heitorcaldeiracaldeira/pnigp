// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_tcgestao.mjs — folha NOMINAL dos municípios TC GESTÃO PÚBLICA (`{slug}.tcgestaopublica.com.br`).
//
// ⭐ ASP.NET + DevExpress com EXPORTADOR: a tela `/Folha` tem os combos `Ano`/`Mes`, o grid `FolhaGridView` e
//    os botões `.PDF .CSV .RTF .XLS .XLSX`. O CSV traz a folha inteira, sem paginar.
//    Colunas: Órgão · Nome · CPF · Vínculo · Cargo · Salário · Benefícios/Outras Vantagens.
//
// 🚨 Os combos são ASPxComboBox: setar por `window.Ano.SetValue()` + `SetText()`, não por `selectOption`
//    (não existe <select> no DOM). A competência tem de ser confirmada com "Pesquisar" antes de exportar.
// ⚠️ Alguns municípios servem o mesmo portal em domínio próprio (`transparencia.{mun}.al.gov.br`) — o coletor
//    aceita qualquer base e navega para `/Folha`.
// 🚨 `goto` em SPA/DevExpress pode falhar com a página carregando: esperar o COMBO existir, não o goto
//    ([[pnigp-goto-falha-mas-pagina-carrega]]).
//
// Uso: UF=AL node scripts/ingest_folha_tcgestao.mjs   ·   SO=Canapi   ·   REFAZ=1   ·   RECUO=6
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs"; import os from "os"; import path from "path"; import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "AL";
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const RECUO = Number(process.env.RECUO || 6);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_tcgestao (
  cod_ibge text, municipio text, uf text, base text, competencia text,
  orgao text, nome text, cpf_masc text, vinculo text, cargo text,
  salario numeric, vantagens numeric, bruto numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_tcg_mun on folha_servidores_tcgestao (cod_ibge, competencia)`);
await q(`create table if not exists folha_tcgestao_coleta (
  cod_ibge text primary key, municipio text, uf text, base text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  const t = String(s ?? "").replace(/R\$|\s|"/g, "").replace(/\./g, "").replace(",", ".");
  const n = +t; return Number.isFinite(n) && t !== "" ? n : null;
};
const txt = (s) => { const v = String(s ?? "").replace(/^"|"$/g, "").replace(/\s+/g, " ").trim(); return v || null; };

// CSV do DevExpress: campos entre aspas, separador `,` ou `;` — respeitar aspas com separador dentro
function campos(linha) {
  const out = []; let cur = ""; let asp = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') { if (asp && linha[i + 1] === '"') { cur += '"'; i++; } else asp = !asp; continue; }
    if ((ch === "," || ch === ";") && !asp) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur); return out;
}

const alvos = (await q(`select cod_ibge, municipio, url from folha_host_candidato
  where uf = $1 and produto = 'tcgestaopublica' ${SO ? "and municipio ilike '%'||$2||'%'" : ""}
  order by municipio`, SO ? [UF, SO] : [UF])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_tcgestao_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[tcgestao] ${UF}: ${alvos.length} candidatos · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_tcgestao
      (cod_ibge,municipio,uf,base,competencia,orgao,nome,cpf_masc,vinculo,cargo,salario,vantagens,bruto,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::text[])
      on conflict (_hash) do update set salario=excluded.salario, bruto=excluded.bruto, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("base"), c("competencia"), c("orgao"), c("nome"), c("cpf_masc"),
       c("vinculo"), c("cargo"), c("salario"), c("vantagens"), c("bruto"), c("_hash")]);
  }
}

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  let base; try { base = new URL(a.url).origin; } catch { base = null; }
  const marca = (situacao, detalhe, linhas = 0, comp = null) =>
    q(`insert into folha_tcgestao_coleta (cod_ibge,municipio,uf,base,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
       base=excluded.base, competencia=excluded.competencia, linhas=excluded.linhas,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, UF, base, comp, linhas, situacao, detalhe]);
  if (!base) { await marca("sem_base", `URL inválida: ${a.url}`); falhas++; continue; }

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tcg-"));
  try {
    await page.goto(`${base}/Folha`, { waitUntil: "commit", timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => !!(window.Ano && window.Ano.SetValue), { timeout: 40000 })
      .catch(() => { throw new Error("combo Ano não apareceu — a tela /Folha não carregou"); });
    await dorme(1500);

    // ⭐ do mês corrente para trás: para no primeiro que devolver linhas
    let colhido = null, compEscolhida = null;
    const hoje = new Date();
    for (let k = 0; k < RECUO && !colhido; k++) {
      const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
      const ano = String(d.getFullYear()), mes = String(d.getMonth() + 1);
      await page.evaluate(({ ano, mes }) => {
        window.Ano.SetValue(ano); window.Ano.SetText(ano);
        window.Mes.SetValue(mes); window.Mes.SetText(mes);
      }, { ano, mes }).catch(() => {});
      await dorme(1200);
      // 🚨 o "Pesquisar" NÃO é input nem componente DevExpress: é um <button class="btn btn-success"> SEM id.
      //    Procurar por input[type=submit] não achava nada e o grid ficava em "No data to display".
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")]
          .find((e) => /^pesquisar$/i.test((e.textContent || "").trim()));
        b?.click();
      }).catch(() => {});
      await dorme(6500);
      const n = await page.evaluate(() => document.querySelectorAll("tr[class*=dxgvDataRow]").length).catch(() => 0);
      if (process.env.DEBUG) console.log(`      ${mes}/${ano} → ${n} linhas no grid`);
      if (!n) continue;

      // exporta CSV pelo botão — o GET direto do handler não funciona fora da sessão
      const espera = page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
      await page.evaluate(() => document.querySelector("#btnExportToCSV_I")?.click());
      const arq = await espera;
      if (!arq) { if (process.env.DEBUG) console.log("      sem download de CSV"); continue; }
      const destino = path.join(tmp, "folha.csv");
      await arq.saveAs(destino);
      const raw = fs.readFileSync(destino);
      let texto = new TextDecoder("utf-8").decode(raw);
      if (/�/.test(texto)) texto = new TextDecoder("latin1").decode(raw);
      const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
      if (linhas.length < 2) continue;
      const head = campos(linhas[0]).map((h) => h.trim().toLowerCase());
      const ix = (re) => head.findIndex((h) => re.test(h));
      const I = { orgao: ix(/[óo]rg[ãa]o/), nome: ix(/nome/), cpf: ix(/cpf/), vinc: ix(/v[íi]nculo/),
        cargo: ix(/cargo/), sal: ix(/sal[áa]rio/), vant: ix(/benef|vantagens/) };
      if (I.nome < 0) { if (process.env.DEBUG) console.log(`      cabeçalho inesperado: ${head.join("|").slice(0, 90)}`); continue; }
      const regs = [];
      for (const l of linhas.slice(1)) {
        const c = campos(l);
        const nome = txt(c[I.nome]); if (!nome) continue;
        const sal = money(c[I.sal]), vant = money(c[I.vant]);
        regs.push({ cod_ibge: a.cod_ibge, municipio: a.municipio, uf: UF, base,
          competencia: `${ano}${mes.padStart(2, "0")}`,
          orgao: txt(c[I.orgao]), nome, cpf_masc: txt(c[I.cpf]), vinculo: txt(c[I.vinc]), cargo: txt(c[I.cargo]),
          salario: sal, vantagens: vant, bruto: sal != null ? sal + (vant || 0) : null,
          _hash: crypto.createHash("md5").update([a.cod_ibge, `${ano}${mes}`, nome, c[I.cpf], c[I.cargo]].join("¦")).digest("hex") });
      }
      if (regs.length) { colhido = regs; compEscolhida = `${ano}${mes.padStart(2, "0")}`; }
    }

    if (!colhido) { await marca("vazio", `sem folha nas últimas ${RECUO} competências`); vazios++;
      console.log(`  · ${a.municipio}: vazio`); continue; }
    await grava(colhido);
    totalGeral += colhido.length; ok++;
    await marca("ok", null, colhido.length, compEscolhida);
    console.log(`  [${i + 1}/${fila.length}] ${a.municipio.padEnd(24)} ${String(colhido.length).padStart(5)} servidores · ${compEscolhida}`);
  } catch (e) {
    await marca("falha", String(e.message).slice(0, 160)); falhas++;
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  } finally { await ctx.close().catch(() => {}); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}
await browser.close();
console.log(`\n[tcgestao] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
