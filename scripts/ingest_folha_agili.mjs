// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_agili.mjs — folha NOMINAL dos municípios ÁGILI ("ÁGILI Cidade Digital"), bloco de MS.
//
// 🚨 O ACHADO QUE DESTRAVA: o portal ÁGILIBlue (`transparencia-ocmblue.com.br/{slug}`) NÃO tem a folha —
// o item "Consulta de Servidores" aponta para OUTRO host, on-premise em DNS dinâmico:
//     http://portaltransparencia{slug}.ddns.com.br/Cidadao/ConsultaServidores.aspx
// Quem parasse no portal principal concluiria "não publica" ([[pnigp-rotulo-erp-nao-e-o-portal-da-folha]]).
//
// A TELA: ASP.NET WebForms + DevExpress — o MESMO motor do SCPI, então vale a mesma receita: grid `grdFunc`,
// linhas em `tr[class*=dxgvDataRow]`, paginação por `grdFunc.NextPage()`, e o handle reobtido a cada página
// (o callback recria o conteúdo — varredura dentro de um único evaluate perde metade das linhas).
// Colunas: Nome · CPF · Cargo · Secretaria · Investidura · Salário bruto · Descontos · Salário líquido ·
//          Situação · Mês · Classe · Nível — os cinco campos de uma vez.
// ⭐ Combos `cmbExercicio` e `cmbMes` (ASPxClientComboBox): varre para achar a competência mais CHEIA.
//
// Uso: UF=MS node scripts/ingest_folha_agili.mjs   ·   SO=Vicentina   ·   REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const MESES_TESTE = Number(process.env.MESES_TESTE || 3);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_agili (
  cod_ibge text, municipio text, uf text, host text, competencia text,
  nome text, cpf_masc text, cargo text, secretaria text, investidura text, situacao text,
  classe text, nivel text, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_agili_mun on folha_servidores_agili (cod_ibge)`);
await q(`create table if not exists folha_agili_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const slugDe = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+ms$/, "").replace(/[^a-z0-9]/g, "");
// 🚨 O HOST DA FOLHA VARIA em www e em PORTA: Anaurilândia é `www.…ddns.com.br:8181`, Vicentina é `…ddns.com.br`
// (porta 80). Derivar um host só fazia o município sair como "portal não respondeu" — que é indistinguível de
// "não publica" ([[pnigp-coletor-ok-sem-dado-sete-causas]]). Testa as variações antes de desistir.
const hostsDe = (nome) => {
  const s = slugDe(nome);
  const bases = [`portaltransparencia${s}.ddns.com.br`, `www.portaltransparencia${s}.ddns.com.br`];
  return bases.flatMap((b) => ["", ":8181", ":8080", ":8079"].map((p) => b + p));
};
const money = (s) => { if (s == null) return null; const t = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };
const mascara = (cpf) => { const d = String(cpf || "").replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 3)}.***.***-${d.slice(9)}` : (String(cpf || "").trim() || null); };

// alvos: quem tem portal ocmblue mapeado, mais os que o cadastro do TCE-MS rotula AGILI
const alvos = (await q(`
  select distinct m.cod_ibge, m.nome, m.uf
    from municipios_br m
    left join tc_ms_software_house s on s.cod_ibge = m.cod_ibge
    left join portal_real_descoberto p on p.cod_ibge = m.cod_ibge
   where m.uf='MS' and (s.razao_social ilike '%AGILI%' or p.url_portal_real ilike '%ocmblue%'
                        or p.url_portal_real ilike '%agilicloud%')
     ${SO ? "and m.nome ilike '%'||$1||'%'" : ""}
   order by m.nome`, SO ? [SO] : [])).rows.map((a) => ({ ...a, hosts: hostsDe(a.nome) }));

const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_agili_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[agili] ${alvos.length} municípios · ${fila.length} na fila`);

const LOTE = 700;
async function grava(regs) {
  const uniq = [...new Map(regs.map((r) => [r._hash, r])).values()];
  for (let i = 0; i < uniq.length; i += LOTE) {
    const p = uniq.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_agili
      (cod_ibge,municipio,uf,host,competencia,nome,cpf_masc,cargo,secretaria,investidura,situacao,classe,nivel,
       bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::numeric[],$16::numeric[],$17::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("nome"), c("cpf_masc"), c("cargo"),
       c("secretaria"), c("investidura"), c("situacao"), c("classe"), c("nivel"),
       c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
  return uniq.length;
}

// lê a página atual do grid pelo CABEÇALHO (a ordem das colunas muda entre portais)
const lePagina = (page) => page.evaluate(() => {
  const heads = [...document.querySelectorAll("td[class*=dxgvHeader]")].map((h) => h.innerText.trim().toLowerCase());
  const col = (re) => heads.findIndex((h) => re.test(h));
  const ix = { nome: col(/^nome/), cpf: col(/cpf/), cargo: col(/cargo/), sec: col(/secretaria/),
    inv: col(/investidura/), bruto: col(/bruto/), desc: col(/desconto/), liq: col(/l[íi]quido/),
    sit: col(/situa/), mes: col(/^m[êe]s/), classe: col(/classe/), nivel: col(/n[íi]vel/) };
  const pega = (c, i) => (i >= 0 && i < c.length ? c[i] : null);
  const out = [];
  for (const tr of document.querySelectorAll("tr[class*=dxgvDataRow]")) {
    const c = [...tr.querySelectorAll("td")].map((x) => x.innerText.trim());
    const r = { nome: pega(c, ix.nome), cpf: pega(c, ix.cpf), cargo: pega(c, ix.cargo), sec: pega(c, ix.sec),
      inv: pega(c, ix.inv), bruto: pega(c, ix.bruto), desc: pega(c, ix.desc), liq: pega(c, ix.liq),
      sit: pega(c, ix.sit), mes: pega(c, ix.mes), classe: pega(c, ix.classe), nivel: pega(c, ix.nivel) };
    if (!r.nome && !r.cpf) continue;
    out.push(r);
  }
  return out;
});

// varre o grid inteiro; o handle é reobtido a cada página (o callback do DevExpress recria o conteúdo)
async function varreGrid(page) {
  const total = await page.evaluate(() => (window.grdFunc?.GetPageCount ? window.grdFunc.GetPageCount() : 1)).catch(() => 1);
  const out = []; const vistos = new Set();
  for (let pg = 0; pg < (total || 1); pg++) {
    for (const r of await lePagina(page)) {
      const k = [r.cpf, r.nome, r.cargo, r.bruto].join("|");
      if (vistos.has(k)) continue;
      vistos.add(k); out.push(r);
    }
    if (pg + 1 >= (total || 1)) break;
    await page.evaluate(() => { try { window.grdFunc.NextPage(); } catch {} });
    await dorme(1600);
  }
  return out;
}

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let ok = 0, vazios = 0, erros = 0, total = 0;
for (const [i, a] of fila.entries()) {
  const marca = (situacao, detalhe, comp = null, linhas = 0) =>
    q(`insert into folha_agili_coleta (cod_ibge,municipio,uf,host,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
       competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao,
       detalhe=excluded.detalhe, em=now()`, [a.cod_ibge, a.nome, a.uf, a.host, comp, linhas, situacao, detalhe]);
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: "pt-BR", viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  try {
    // ⚡ escolhe o host por HTTP (barato) ANTES de abrir o navegador: um `page.goto` num host morto fica
    // pendurado até o timeout e, com 8 variações, o município estoura o tempo sem nunca chegar no host bom.
    let alvo = null;
    for (const h of a.hosts) {
      const u = `http://${h}/Cidadao/ConsultaServidores.aspx`;
      try {
        const res = await fetch(u, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
        if (res.ok && /grdFunc/.test(await res.text())) { alvo = u; a.host = h; break; }
      } catch { /* host morto: próxima variação */ }
    }
    if (!alvo) throw new Error(`portal não respondeu em ${a.hosts.length} variações de host/porta`);
    const r = await page.goto(alvo, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    if (!r) throw new Error("host respondeu por HTTP mas o navegador não abriu");
    await dorme(8000);
    if (!(await page.evaluate(() => !!window.grdFunc))) throw new Error("grid grdFunc ausente (layout diferente)");

    // ⭐ competência mais CHEIA: varre os meses recentes e fica com o maior — o corrente vem parcial
    const meses = await page.evaluate(() => {
      const cb = window.cmbMes; if (!cb?.GetItemCount) return [];
      return Array.from({ length: cb.GetItemCount() }, (_, i) => ({ i, t: cb.GetItem(i)?.text }));
    });
    let melhor = null, testados = 0;
    // 🚨 O COMBO JÁ VEM DO MAIS RECENTE PARA O MAIS ANTIGO (13º·2ª, 13º·1ª, julho, junho, …, janeiro).
    // Inverter fazia o coletor testar janeiro/fevereiro/março e gravar competência velha — e a régua da RAIS
    // NÃO denuncia (453 contra 536 parece plausível). Ordem natural, e fora as parcelas do 13º, que não são mês.
    const ordem = meses.length ? meses.filter((m) => !/13/.test(m.t || "")) : [null];
    for (const m of ordem) {
      if (testados >= MESES_TESTE) break;
      if (m) {
        await page.evaluate((i) => { try { window.cmbMes.SetSelectedIndex(i); } catch {} }, m.i);
        await dorme(900);
        await page.evaluate(() => { const b = document.querySelector("[id*=btnPesquisar],[id*=btPesquisar]"); if (b) b.click(); });
        await dorme(5000);
      }
      const linhas = await varreGrid(page);
      if (linhas.length) { testados++; if (!melhor || linhas.length > melhor.linhas.length) melhor = { linhas, comp: m?.t || "atual" }; }
    }
    if (!melhor) { await marca("vazio", "grid sem linhas em nenhum mês"); vazios++; console.log(`  ○ [${i + 1}/${fila.length}] ${a.nome}: vazio`); continue; }

    // 🚨 O COMBO DÁ SÓ O NOME DO MÊS ("julho"), e era isso que ia para a coluna competência — 3.154 linhas sem
    // ANO nenhum, em que "julho" de 2025 e de 2026 empilhariam no mesmo rótulo. O portal serve o exercício
    // corrente, então o ano é o da coleta; o formato é `AAAAMM`, como nas demais tabelas.
    const MES_N = { janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7,
                    agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
    const compNorm = (t) => {
      const n = MES_N[String(t ?? "").trim().toLowerCase()];
      return n ? `${new Date().getFullYear()}${String(n).padStart(2, "0")}` : null;
    };
    const comp = compNorm(melhor.comp);
    const regs = melhor.linhas.map((x) => ({
      cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf, host: a.host, competencia: comp,
      nome: x.nome, cpf_masc: mascara(x.cpf), cargo: x.cargo, secretaria: x.sec, investidura: x.inv,
      situacao: x.sit, classe: x.classe, nivel: x.nivel,
      bruto: money(x.bruto), descontos: money(x.desc), liquido: money(x.liq),
      _hash: crypto.createHash("md5").update([a.cod_ibge, comp, x.cpf, x.nome, x.cargo, x.sec].join("|")).digest("hex"),
    }));
    const n = await grava(regs);
    total += n; ok++;
    await marca("ok", `competência ${melhor.comp} (${comp})`, comp, n);
    console.log(`  ✔ [${i + 1}/${fila.length}] ${a.nome}: ${n} servidores (${melhor.comp} → ${comp})`);
  } catch (e) {
    erros++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.nome}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close(); }
}
await browser.close();
console.log(`\n[agili] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${erros} erros`);
console.table((await q(`select count(distinct cod_ibge) municipios, count(*) linhas,
  count(*) filter (where bruto>0) com_valor, count(*) filter (where secretaria is not null and secretaria<>'') com_sec
  from folha_servidores_agili`)).rows);
await db.end();
