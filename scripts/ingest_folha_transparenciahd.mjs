// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_transparenciahd.mjs — folha dos municípios em `transparencia-hd.com.br`.
//
// 🚨 Eu tinha fechado este bloco como "site em manutenção": a RAIZ do domínio devolve mesmo uma página de
// manutenção. O portal do município só existe depois de escolher o órgão — `?cod_empre={N}` — e a folha fica em
// **`/consulta/remuneracao`**. Sem o `cod_empre` a rota responde "Acesso Proibido! Nenhum órgão foi selecionado".
// Mais um caso de [[pnigp-coletor-ok-sem-dado-sete-causas]]: a porta parecia fechada e faltava a chave.
//
// Entrega (tabela server-side, 20 por página): DataReferência · Matrícula · Nome · **Cargo** · DataAdmissão ·
// DataDesligamento · **Vínculo** · **Lotação** · Carga Horária · Tipo de folha · **Valor Bruto** · **Valor Líquido**.
//
// Uso: node scripts/ingest_folha_transparenciahd.mjs [UF=MG] [SO=Mutum] [REFAZ=1]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const MAX_PAG = Number(process.env.MAX_PAG || 300);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const BASE = "https://transparencia-hd.com.br";

await q(`create table if not exists folha_servidores_transphd (
  cod_ibge text, municipio text, uf text, cod_empre text, competencia text,
  matricula text, nome text, cargo text, vinculo text, secretaria text,
  carga_horaria text, tipo_folha text, data_admissao text, data_desligamento text,
  bruto numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_thd_mun on folha_servidores_transphd (cod_ibge, competencia)`);
await q(`create table if not exists folha_transphd_coleta (
  cod_ibge text primary key, municipio text, uf text, cod_empre text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

const num = (s) => { if (!s) return null; const t = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."); const v = parseFloat(t); return Number.isFinite(v) ? v : null; };

const LOTE = 500;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const f = arr.slice(i, i + LOTE); const c = (k) => f.map((r) => r[k]);
    await q(`insert into folha_servidores_transphd
      (cod_ibge,municipio,uf,cod_empre,competencia,matricula,nome,cargo,vinculo,secretaria,carga_horaria,
       tipo_folha,data_admissao,data_desligamento,bruto,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],$17::text[])
      on conflict (_hash) do nothing`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("cod_empre"), c("competencia"), c("matricula"), c("nome"),
       c("cargo"), c("vinculo"), c("secretaria"), c("carga_horaria"), c("tipo_folha"), c("data_admissao"),
       c("data_desligamento"), c("bruto"), c("liquido"), c("_hash")]);
  }
}

// alvos: o cod_empre sai da própria URL descoberta (?cod_empre=NN)
const alvos = (await q(`select distinct on (m.cod_ibge) m.cod_ibge, m.nome municipio, m.uf,
    (regexp_match(u.url, 'cod_empre=(\\d+)'))[1] cod_empre
  from municipios_br m
  join lateral (
    select url, em from (
      select p.url_portal_real url, p.em from portal_real_descoberto p where p.cod_ibge = m.cod_ibge
      union all select coalesce(d.url_pessoal,d.url_visitada), d.em from folha_diagnostico_faltante d where d.cod_ibge = m.cod_ibge
      union all select v.rota_com_dados, v.em from folha_verificacao_municipal v where v.cod_ibge = m.cod_ibge
    ) t where url ilike '%transparencia-hd%' and url ~ 'cod_empre=\\d+' order by em desc limit 1) u on true
  ${UF ? "where m.uf = $1" : ""} ${SO ? `${UF ? "and" : "where"} m.nome ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
  order by m.cod_ibge`, [UF, SO].filter(Boolean))).rows;

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_transphd_coleta where situacao like 'ok%'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => a.cod_empre && !feitos.has(a.cod_ibge));
console.log(`[transphd] ${alvos.length} municípios com cod_empre · ${fila.length} na fila`);

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors", "--disable-blink-features=AutomationControlled"] });
let total = 0, ok = 0, vazios = 0, falhas = 0;

for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: "pt-BR", userAgent: UA });
  const page = await ctx.newPage();
  const marca = (situacao, detalhe = null, cp = null, linhas = 0) =>
    q(`insert into folha_transphd_coleta (cod_ibge,municipio,uf,cod_empre,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (cod_ibge) do update set cod_empre=excluded.cod_empre, competencia=excluded.competencia,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.cod_empre, cp, linhas, situacao, detalhe]);
  try {
    // 🚨 a sessão do órgão vem daqui; sem isso /consulta/remuneracao devolve "Acesso Proibido"
    await page.goto(`${BASE}/?cod_empre=${a.cod_empre}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await dorme(1800);
    await page.goto(`${BASE}/consulta/remuneracao`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await dorme(3000);

    const linhas = [];
    const vistos = new Set();
    for (let pg = 1; pg <= MAX_PAG; pg++) {
      const bloco = await page.evaluate(() => {
        const t = [...document.querySelectorAll("table")].find((x) => x.rows.length > 2 && /matr[íi]cula/i.test(x.rows[0].innerText));
        if (!t) return [];
        const cab = [...t.rows[0].cells].map((c) => c.textContent.trim().toLowerCase());
        const ix = (re) => cab.findIndex((h) => re.test(h));
        const k = { ref: ix(/refer/), mat: ix(/matr/), nome: ix(/nome/), cargo: ix(/cargo/), adm: ix(/admiss/),
          desl: ix(/deslig/), vinc: ix(/v[íi]nculo/), lot: ix(/lota/), ch: ix(/carga/), tipo: ix(/tipo/),
          bruto: ix(/bruto/), liq: ix(/l[íi]quido/) };
        return [...t.rows].slice(1).map((r) => {
          const c = [...r.cells].map((x) => x.textContent.trim());
          const g = (i) => (i >= 0 && i < c.length ? c[i] : null);
          return { ref: g(k.ref), mat: g(k.mat), nome: g(k.nome), cargo: g(k.cargo), adm: g(k.adm),
            desl: g(k.desl), vinc: g(k.vinc), lot: g(k.lot), ch: g(k.ch), tipo: g(k.tipo),
            bruto: g(k.bruto), liq: g(k.liq) };
        }).filter((x) => x.nome);
      });
      let novos = 0;
      for (const r of bloco) { const key = [r.mat, r.nome, r.ref, r.bruto].join("|"); if (vistos.has(key)) continue; vistos.add(key); linhas.push(r); novos++; }
      if (!novos) break;
      // 🚨 a paginação aqui é por NÚMERO (2, 3, 4…), não por "próxima": procurar só o "próxima" fazia o coletor
      // parar na primeira página e gravar 10 de ~300 — o defeito de sempre, com cara de município pequeno.
      const avancou = await page.evaluate((pagAlvo) => {
        // depois do 1º clique a URL vira /resultado e os links de página mudam de forma — casar por `remuneracao`
        const links = [...document.querySelectorAll("a")].filter((x) => /remuneracao/.test(x.getAttribute("href") || ""));
        const porNumero = links.find((x) => (x.textContent || "").trim() === String(pagAlvo));
        const proxima = links.find((x) => /pr[óo]xim|next|»/i.test(x.textContent || ""));
        const alvo = porNumero || proxima;
        if (alvo) { alvo.click(); return true; }
        return false;
      }, pg + 1).catch(() => false);
      if (!avancou) break;
      await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
      await dorme(1800);
    }
    if (!linhas.length) { await marca("vazio", "tabela de remuneração sem linhas"); vazios++; continue; }

    const cp = (linhas[0].ref || "").replace("/", "").replace(/^(\d{2})(\d{4})$/, "$2$1");
    const regs = linhas.map((r) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, cod_empre: a.cod_empre,
      competencia: (r.ref || "").replace("/", "").replace(/^(\d{2})(\d{4})$/, "$2$1") || cp,
      matricula: r.mat, nome: r.nome, cargo: r.cargo, vinculo: r.vinc, secretaria: r.lot,
      carga_horaria: r.ch, tipo_folha: r.tipo, data_admissao: r.adm, data_desligamento: r.desl,
      bruto: num(r.bruto), liquido: num(r.liq),
      _hash: crypto.createHash("md5").update([a.cod_ibge, r.ref, r.mat, r.nome, r.bruto].join("¦")).digest("hex"),
    }));
    await grava(regs);
    total += regs.length; ok++;
    const comVal = regs.filter((r) => r.bruto > 0).length;
    await marca("ok", `${comVal} com valor`, cp, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${regs.length} servidores (${cp}, ${comVal} com valor)`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 180));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  } finally {
    await ctx.close().catch(() => {});
  }
  await dorme(600);
}
await browser.close();
console.log(`\n[transphd] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
