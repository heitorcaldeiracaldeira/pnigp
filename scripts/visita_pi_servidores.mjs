// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// visita_pi_servidores.mjs — visita CADA município do Piauí na tela `/servidores` do CMS padrão do estado
// (o modelo que o TCE/PI exige pela IN 01/2025, item 1.4) e grava o que encontra.
//
// 🚨 POR QUE COM NAVEGADOR (e não HTTP puro, que seria 20× mais rápido):
//   - o `fetch` do Node falha com "fetch failed" nesses hosts (TLS antigo que o Node 24 recusa; o curl aceita);
//   - a tabela NÃO vem no GET: exige POST com `_token` (CSRF Laravel) e o POST por curl estoura o tempo.
//   Sobrou o navegador. Por isso: contexto reciclado, timeout duro e gravação município a município (retomável).
//
// ⚠️ O QUE ESTA TELA ENTREGA: CPF (mascarado) · NOME · CARGO · LOTAÇÃO · JORNADA · ADMISSÃO · DEMISSÃO —
//    quatro dos cinco campos, **SEM REMUNERAÇÃO**. É quadro de pessoal, não folha. Registrado como tal.
//
// Uso: node scripts/visita_pi_servidores.mjs   ·   LIMITE=30   ·   REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const LIMITE = Number(process.env.LIMITE || 999);
const RECICLA = Number(process.env.RECICLA || 12);
const TETO = Number(process.env.TETO || 70000);
const REFAZ = process.env.REFAZ === "1";
// re-visita SÓ quem já deu dados — para corrigir `tem_valor`/`total` sem refazer os 205 do zero
const SO_COM_DADOS = process.env.SO_COM_DADOS === "1";

await q(`create table if not exists pi_servidores_visita (
  cod_ibge text primary key, municipio text, url text, linhas int, cabecalho text,
  tem_valor boolean, total_registros int, paginas int, situacao text, detalhe text, em timestamptz default now()
)`);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (ok) partes.push(`select distinct left(cod_ibge::text,7) c from ${t} where left(cod_ibge::text,2)='22'`);
}
const alvos = (await q(`
  with col as (${partes.join(" union ")})
  select m.cod_ibge, m.nome,
         -- ⭐ a URL que JÁ funcionou vem primeiro: na re-visita não se paga de novo o custo de descobrir
         coalesce((select v.url from pi_servidores_visita v where v.cod_ibge=m.cod_ibge and v.url is not null),
         (select split_part(l,'|',2) from site_municipal_links s2, jsonb_array_elements_text(s2.links) l
           where s2.cod_ibge=m.cod_ibge and split_part(l,'|',2) ~* '/servidores' limit 1)) url_lida
    from municipios_br m left join col c on c.c = m.cod_ibge
   where m.uf='PI' and c.c is null
     ${SO_COM_DADOS ? "and exists (select 1 from pi_servidores_visita v where v.cod_ibge = m.cod_ibge and v.situacao='com_dados')"
       : REFAZ ? "" : "and not exists (select 1 from pi_servidores_visita v where v.cod_ibge = m.cod_ibge)"}
   order by m.nome limit ${LIMITE}`)).rows;
console.log(`[pi] ${alvos.length} municípios a visitar`);

const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/ pi$/, "").replace(/ do piaui$/, "").replace(/[^a-z0-9]/g, "");

let browser = null, ctx = null, usos = 0;
async function novoCtx() {
  if (ctx) await ctx.close().catch(() => {});
  if (!browser) browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
  ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: "pt-BR", viewport: { width: 1400, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" });
  usos = 0;
}
await novoCtx();

async function visita(a) {
  const s = slug(a.nome);
  const cands = [...new Set([a.url_lida,
    `https://transparencia.${s}.pi.gov.br/${s}/servidores/`,
    `https://transparencia.${s}.pi.gov.br/servidores`,
    `https://${s}.pi.gov.br/${s}/servidores/`,
    `https://${s}.pi.gov.br/transparencia/servidores`].filter(Boolean))];
  for (const u of cands) {
    const page = await ctx.newPage();
    try {
      const r = await page.goto(u, { waitUntil: "domcontentloaded", timeout: 25000 });
      if (!r || r.status() >= 400) { await page.close(); continue; }
      await page.waitForTimeout(3500);
      // a tabela só aparece depois de submeter o filtro (POST com _token)
      await page.evaluate(() => {
        const a = document.querySelector("select[name=ano]"), m = document.querySelector("select[name=mes]");
        if (a && a.options.length > 1) a.selectedIndex = 1;
        if (m && m.options.length > 1) m.selectedIndex = 1;
        const b = [...document.querySelectorAll("button,input[type=submit]")]
          .find((x) => /buscar|consult|pesquis|filtr/i.test(x.innerText || x.value || ""));
        if (b) b.click();
      }).catch(() => {});
      await page.waitForTimeout(9000);
      const d = await page.evaluate(() => ({
        linhas: [...document.querySelectorAll("table tr")].length - 1,
        cab: [...document.querySelectorAll("table th")].map((t) => t.innerText.trim()).slice(0, 12).join(" | "),
        // 🚨 detectar valor pelo CONTEÚDO da linha, não pelo rótulo da coluna: em Barro Duro o dinheiro
        // aparece ("R$ 2.163,03") sem que o <th> diga "remuneração" — pelo cabeçalho, o município saía
        // como "sem valor", que é falso. Mesma família do detector de salário do PR e das 2 colunas do CE.
        valor: /R\$\s?[\d.]+[,.]\d{2}/.test([...document.querySelectorAll("table td")].map((t) => t.innerText).join(" ")),
        // "Página 1 de 13 (317 registros)" — sem isto eu leria 26 de 317
        total: (document.body.innerText.match(/\((\d[\d.]*)\s*registros?\)/i) || [])[1] || null,
        paginas: (document.body.innerText.match(/de\s+(\d+)\s*\(/i) || [])[1] || null,
      }));
      await page.close();
      if (d.linhas > 2) return { url: u, ...d };
    } catch { await page.close().catch(() => {}); }
  }
  return null;
}

let ok = 0, sem = 0, erro = 0;
for (const [i, a] of alvos.entries()) {
  if (usos >= RECICLA) await novoCtx();
  usos++;
  let r = null;
  try { r = await Promise.race([visita(a), new Promise((res) => setTimeout(() => res("T"), TETO))]); } catch { r = null; }
  if (r === "T") { await novoCtx(); r = null; erro++; }
  if (r) ok++; else sem++;
  await q(`insert into pi_servidores_visita (cod_ibge, municipio, url, linhas, cabecalho, tem_valor, situacao, em, total_registros, paginas)
    values ($1,$2,$3,$4,$5,$6,$7,now(),$8,$9) on conflict (cod_ibge) do update set url=excluded.url, linhas=excluded.linhas,
    cabecalho=excluded.cabecalho, tem_valor=excluded.tem_valor, situacao=excluded.situacao,
    total_registros=excluded.total_registros, paginas=excluded.paginas, em=now()`,
    [a.cod_ibge, a.nome, r?.url || null, r?.linhas || 0, r?.cab || null, r?.valor || false, r ? "com_dados" : "sem_dados",
     r?.total ? Number(String(r.total).replace(/\./g, "")) : null, r?.paginas ? Number(r.paginas) : null]);
  if ((i + 1) % 15 === 0) console.log(`   ${i + 1}/${alvos.length} · ${ok} com dados · ${sem} sem · ${erro} timeout`);
}
if (ctx) await ctx.close().catch(() => {});
if (browser) await browser.close().catch(() => {});
console.log(`\n[pi] ${ok} com dados · ${sem} sem · ${erro} timeout`);
console.table((await q(`select situacao, count(*) n, count(*) filter (where tem_valor) com_valor, sum(linhas) linhas
  from pi_servidores_visita group by 1 order by 2 desc`)).rows);
await db.end();
