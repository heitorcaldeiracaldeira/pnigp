// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_saosebastiao_al.mjs — folha nominal de SÃO SEBASTIÃO/AL, um dos três municípios que ficaram sem
// folha depois da limpeza dos homônimos do GovBR ([[pnigp-tres-municipios-sem-folha-pos-homonimo]]).
//
// ⭐ É PORTAL PRÓPRIO (PHP + DataTables server-side), não produto de fornecedor: o diretório do Layout Sistemas
// não tem nenhuma entidade em AL, e a assinatura "layout" no HTML era coincidência de CSS.
//
// A CADEIA:
//   1. `/servidores` → `/servidores/folhas/` → `/servidores/folhas/servidores/` (a grade)
//   2. filtros obrigatórios: `#entidade` (0 = Todas) e `#processamento` (`AAAA-MM-01.1` = "06/2026 - Mensal").
//      Sem eles a tela diz "Nenhum registro encontrado" — que parece município que não publica.
//   3. POST `/servidores/folhas/servidores/db.datatables.php` (DataTables server-side) →
//      {iTotalDisplayRecords, data:[{matricula,cpf,nome,funcao,orgao,bruto,desconto,liquido}]}
//
// 🚨 ModSecurity bloqueia `fetch` de fora ("Not Acceptable!"): a chamada precisa sair de DENTRO da página, no
// contexto do navegador. Por isso Playwright, mesmo o endpoint sendo REST.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
// ⭐ VIROU COLETOR DE BLOCO (17/ago): a varredura `varre_portal_folhas_al.mjs` achou o MESMO portal em Piaçabuçu.
// Os alvos saem de `portal_real_descoberto` (fornecedor='portal_folhas_datatables'); SO=<nome> limita a um.
// 🚨 O cod_ibge vem do cadastro, não digitado: eu tinha gravado São Sebastião como 2708600, que é OUTRO município.
const PAG = Number(process.env.PAG || 1000);

await q(`create table if not exists folha_servidores_capital (
  cod_ibge text, municipio text, uf text, competencia text, matricula text, nome text, cargo text,
  secretaria text, lotacao text, vinculo text, bruto numeric, descontos numeric, liquido numeric, fonte text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create table if not exists folha_capital_coleta (
  cod_ibge text, municipio text, uf text, competencia text, linhas int, situacao text, detalhe text,
  em timestamptz default now()
)`);

const num = (s) => { const n = +String(s ?? "").replace(/\./g, "").replace(",", "."); return Number.isFinite(n) ? n : (Number.isFinite(+s) ? +s : null); };

const SO = process.env.SO || null;
const alvos = (await q(`select p.cod_ibge, m.nome municipio, m.uf, p.url_portal_real base
  from portal_real_descoberto p join municipios_br m on m.cod_ibge = p.cod_ibge
 where p.fornecedor = 'portal_folhas_datatables' ${SO ? "and m.nome ilike '%'||$1||'%'" : ""}
 order by m.uf, m.nome`, SO ? [SO] : [])).rows;
console.log(`[folhas] ${alvos.length} municípios no padrão DataTables`);

const browser = await chromium.launch({ headless: true });
let totalGeral = 0;
for (const alvo of alvos) {
const COD_IBGE = alvo.cod_ibge, MUNICIPIO = alvo.municipio, UF = alvo.uf, BASE = alvo.base;
const page = await browser.newPage();
try {
let corpo = null, url = null;
page.on("request", (r) => { if (r.method() === "POST" && /db\.datatables\.php/.test(r.url())) { url = r.url(); corpo = r.postData(); } });

await page.goto(BASE, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2500);

// competências publicadas, da mais recente para trás
const comps = await page.evaluate(() => [...document.querySelectorAll("#processamento option")]
  .map((o) => ({ v: o.value, t: o.text.trim() })).filter((x) => /^\d{4}-\d{2}-\d{2}/.test(x.v)));
const comp = comps.find((c) => /mensal/i.test(c.t)) || comps[0];
if (!comp) { console.log(`  ⚠️ ${MUNICIPIO}: sem competência publicada`); await page.close(); continue; }
console.log(`  ${MUNICIPIO}: ${comps.length} competências · escolhida ${comp.t}`);

await page.selectOption("#entidade", "0").catch(() => {});   // 0 = TODAS as entidades (prefeitura + IPAM)
await page.selectOption("#processamento", comp.v);
await page.getByRole("button", { name: /pesquis/i }).first().click({ timeout: 20000 });
await page.waitForTimeout(6000);
if (!url || !corpo) { console.log(`  ✖ ${MUNICIPIO}: não capturei a chamada do DataTables`); await page.close(); continue; }

const competencia = comp.v.slice(0, 4) + comp.v.slice(5, 7);
const regs = [];
for (let start = 0; start < 100000; start += PAG) {
  const txt = await page.evaluate(async ({ u, c, s, n }) => {
    const body = c.replace(/&start=\d+/, `&start=${s}`).replace(/&length=\d+/, `&length=${n}`);
    const r = await fetch(u, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" }, body });
    return await r.text();
  }, { u: url, c: corpo, s: start, n: PAG });
  let j = null; try { j = JSON.parse(txt); } catch { break; }
  const arr = j.data || [];
  if (!arr.length) break;
  for (const s of arr) {
    const nome = String(s.nome || "").trim();
    if (!nome) continue;
    regs.push({
      cod_ibge: COD_IBGE, municipio: MUNICIPIO, uf: UF, competencia,
      matricula: String(s.matricula ?? ""), nome, cargo: String(s.funcao || "").trim(),
      // ⚠️ `orgao` vem prefixado com o código ("3-IPAM - CONTRATADOS") — guardar o rótulo limpo na secretaria
      secretaria: String(s.orgao || "").replace(/^\d+\s*-\s*/, "").trim(), lotacao: String(s.orgao || "").trim(),
      vinculo: null, bruto: num(s.bruto), descontos: num(s.desconto), liquido: num(s.liquido), fonte: "portal_folhas",
      _hash: crypto.createHash("md5").update([COD_IBGE, competencia, s.matricula, nome, s.funcao].join("¦")).digest("hex"),
    });
  }
  if (arr.length < PAG) break;
}
await page.close();

// guarda de nominalidade: linha sem nome não é folha nominal ([[pnigp-rotulo-de-coluna-varia-lei]])
if (!regs.length) { console.log(`  ⚠️ ${MUNICIPIO}: nenhuma linha com nome`); continue; }
const m = new Map(); for (const r of regs) m.set(r._hash, r);
const arr = [...m.values()];
for (let i = 0; i < arr.length; i += 1000) {
  const p = arr.slice(i, i + 1000); const c = (f) => p.map((x) => x[f]);
  await q(`insert into folha_servidores_capital
    (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,secretaria,lotacao,vinculo,bruto,descontos,liquido,fonte,_hash)
    select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
      $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::text[],$15::text[])
    on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
    [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("matricula"), c("nome"), c("cargo"),
     c("secretaria"), c("lotacao"), c("vinculo"), c("bruto"), c("descontos"), c("liquido"), c("fonte"), c("_hash")]);
}
// ⚠️ o livro-razão tem chave (cod_ibge, competencia): sem ON CONFLICT a 2ª rodada do mesmo mês estoura
await q(`insert into folha_capital_coleta (cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
  values ($1,$2,$3,$4,$5,'ok','portal próprio (DataTables server-side)',now())
  on conflict do nothing`, [COD_IBGE, MUNICIPIO, UF, competencia, arr.length]);
totalGeral += arr.length;
console.log(`  ✅ ${MUNICIPIO}: ${arr.length} servidores (${competencia})`);
} catch (e) { console.log(`  ✖ ${MUNICIPIO}: ${String(e.message).slice(0, 70)}`); try { await page.close(); } catch {} }
}
await browser.close();
console.log(`
[folhas] ${totalGeral.toLocaleString("pt-BR")} servidores em ${alvos.length} municípios`);
await db.end();
