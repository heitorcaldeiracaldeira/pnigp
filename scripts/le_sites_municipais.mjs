// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// le_sites_municipais.mjs — abre o SITE OFICIAL de cada município sem folha e GRAVA os links de
// transparência/pessoal no banco. É a técnica de maior retorno de toda a campanha de folha:
// revelou o CMS do CE (91 municípios), destravou Aquidauana e Sidrolândia em MS e achou os blocos do RN.
//
// 🚨 POR QUE ESTE SCRIPT EXISTE (a versão anterior era um _script de sessão e morria cedo):
//   1. Ela imprimia no stdout — o que já tinha sido lido se perdia quando o processo caía. Agora cada
//      município é GRAVADO assim que lido, e a fila pula o que já está no banco (retomável).
//   2. Ela usava UM contexto de navegador para o estado inteiro; depois de ~15 municípios o Chromium
//      degradava e o laço parava sem erro. Agora o contexto é RECICLADO a cada N municípios.
//   3. Um município lento segurava tudo: agora há timeout DURO por município (Promise.race).
//
// Uso: UF=RN node scripts/le_sites_municipais.mjs   ·   LIMITE=30   ·   REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";
import { SG_UF as UF, COD_UF as COD } from "./_uf.mjs";

const db = pool(); const q = withRetry(db);
const LIMITE = Number(process.env.LIMITE || 999);
const RECICLA = Number(process.env.RECICLA || 12);      // municípios por contexto de navegador
const TETO_MUN = Number(process.env.TETO_MUN || 75000); // ms por município, timeout duro
const REFAZ = process.env.REFAZ === "1";

await q(`create table if not exists site_municipal_links (
  cod_ibge text primary key, municipio text, uf text, url_lida text,
  links jsonb, n_links int, situacao text, em timestamptz default now()
)`);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (ok) partes.push(`select distinct left(cod_ibge::text,7) c from ${t} where left(cod_ibge::text,2)='${COD}'`);
}
const alvos = (await q(`
  with col as (${partes.join(" union ")})
  select m.cod_ibge, m.nome, coalesce(r.site, r.url_portal) site
    from municipios_br m
    left join col c on c.c = m.cod_ibge
    left join lateral (select site, url_portal from radar_portal r2 where r2.cod_ibge=m.cod_ibge
                        and r2.unidade_gestora ilike 'Prefeitura%' limit 1) r on true
   where m.uf='${UF}' and c.c is null
     ${REFAZ ? "" : "and not exists (select 1 from site_municipal_links s where s.cod_ibge = m.cod_ibge)"}
   order by m.nome limit ${LIMITE}`)).rows;
console.log(`[sites/${UF}] ${alvos.length} municípios a ler`);

const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(new RegExp(" " + UF.toLowerCase() + "$"), "").replace(/[^a-z0-9]/g, "");
const RE = /transpar|servidor|pessoal|folha|remunera|portal do|contracheque|quadro/i;

let browser = null, ctx = null, usos = 0;
async function novoContexto() {
  if (ctx) await ctx.close().catch(() => {});
  if (browser && usos >= RECICLA * 4) { await browser.close().catch(() => {}); browser = null; }
  if (!browser) browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
  ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: "pt-BR", viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" });
  usos = 0;
}
await novoContexto();

async function leMunicipio(a) {
  const bases = [...new Set([a.site, `https://www.${slug(a.nome)}.${UF.toLowerCase()}.gov.br/`,
    `https://${slug(a.nome)}.${UF.toLowerCase()}.gov.br/`].filter(Boolean)
    .map((u) => (u.startsWith("http") ? u : "https://" + u)))];
  for (const b of bases) {
    const page = await ctx.newPage();
    try {
      await page.goto(b, { waitUntil: "domcontentloaded", timeout: 22000 });
      await page.waitForTimeout(3000);
      const links = await page.evaluate((reSrc) => {
        const re = new RegExp(reSrc, "i");
        return [...new Set([...document.querySelectorAll("a[href]")]
          .map((x) => ({ t: (x.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60), h: x.href }))
          .filter((x) => (re.test(x.t) || re.test(x.h)) && !/facebook|instagram|youtube|twitter|whatsapp|\.pdf$/i.test(x.h))
          .map((x) => `${x.t}|${x.h}`))].slice(0, 25);
      }, RE.source);
      await page.close();
      if (links.length) return { url: b, links };
    } catch { await page.close().catch(() => {}); }
  }
  return null;
}

let ok = 0, vazio = 0, erro = 0;
for (const [i, a] of alvos.entries()) {
  if (usos >= RECICLA) await novoContexto();
  usos++;
  let r = null;
  try {
    // 🚨 timeout DURO: sem isto, um município lento segura a fila inteira e o processo parece travado
    r = await Promise.race([leMunicipio(a), new Promise((res) => setTimeout(() => res("TIMEOUT"), TETO_MUN))]);
  } catch { r = null; }
  if (r === "TIMEOUT") { await novoContexto(); r = null; erro++; }
  const sit = r ? "ok" : "sem_link";
  if (r) ok++; else vazio++;
  await q(`insert into site_municipal_links (cod_ibge, municipio, uf, url_lida, links, n_links, situacao, em)
    values ($1,$2,$3,$4,$5::jsonb,$6,$7,now()) on conflict (cod_ibge) do update set
    url_lida=excluded.url_lida, links=excluded.links, n_links=excluded.n_links, situacao=excluded.situacao, em=now()`,
    [a.cod_ibge, a.nome, UF, r?.url || null, JSON.stringify(r?.links || []), r?.links?.length || 0, sit]);
  if ((i + 1) % 10 === 0) console.log(`   ${i + 1}/${alvos.length} · ${ok} com links · ${vazio} sem · ${erro} timeout`);
}
if (ctx) await ctx.close().catch(() => {});
if (browser) await browser.close().catch(() => {});
console.log(`\n[sites/${UF}] ${ok} com links · ${vazio} sem · ${erro} timeout`);

// agrupa por HOST de destino: é isso que revela o bloco/produto
console.log("\n══ hosts mais frequentes nos links de pessoal ══");
console.table((await q(`
  select split_part(split_part(l, '|', 2), '/', 3) host, count(distinct s.cod_ibge) municipios
    from site_municipal_links s, jsonb_array_elements_text(s.links) l
   where s.uf='${UF}' and (l ilike '%servidor%' or l ilike '%pessoal%' or l ilike '%folha%' or l ilike '%remunera%')
   group by 1 having count(distinct s.cod_ibge) > 1 order by 2 desc limit 20`)).rows);
await db.end();
