// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_host_porta_pelo_site.mjs — acha o portal de transparência que vive em IP:PORTA, lendo o site oficial.
//
// 🚨 POR QUE ESTE SCRIPT EXISTE: `descobre_portal_pelo_site.mjs` varreu 58 municípios do RN e achou ZERO
//    produtos. Não era ausência de portal — os portais do RN estão em **IP com porta alta**
//    (`170.79.153.44:9367/transparencia/?AcessoIndividual=LnkServidores` = SCPI de Alto do Rodrigues) e as
//    assinaturas por hostname não casam com um IP. Ver [[pnigp-varredura-host-porta-onpremise]].
//    ⭐ Zero absoluto numa varredura é sinal de assinatura cega, não de estado sem portal.
//
// Uso: UF=RN node scripts/descobre_host_porta_pelo_site.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RN";
const CONC = Number(process.env.CONC || 4);
const LIMITE = Number(process.env.LIMITE || 999);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const so = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

await q(`create table if not exists folha_host_candidato (
  cod_ibge text primary key, municipio text, uf text, produto text, host text, url text,
  achado_via text, em timestamptz default now()
)`);

// assinatura na URL → produto que já tem coletor. A primeira que casar vale.
const ASSINATURAS = [
  // 🚨 `AcessoIndividual=` é a assinatura do SCPI e aparece em QUALQUER caminho:
  //    `/transparencia/?AcessoIndividual=LnkServidores` (Alto do Rodrigues) e
  //    `/Transparencia/Default.aspx?AcessoIndividual=…` (Lagoa de Velhos). Exigir o caminho exato deixou
  //    municípios como "desconhecido" com a prova na própria URL.
  [/AcessoIndividual=/i, "scpi"],
  [/\/ssfolha\/|sstransparenciamunicipal/i, "sstransparencia"],
  [/\/datapublic\//i, "datapublic"],
  [/aossoftware/i, "aos"],
  [/portaltp|e-publica/i, "portaltp"],
  [/elotech/i, "elotech"],
  [/betha|e-gov/i, "betha"],
  [/atende\.net|ipm/i, "ipm"],
  [/cidade360|govbr|pronim/i, "govbr"],
  [/publicsoft|elmartecnologia/i, "publicsoft"],
  [/municipioonline|genesis/i, "municipioonline"],
  [/memory|ilai/i, "memory"],
  [/siplan/i, "siplanweb"],
  [/agili|cidadedigital/i, "agili"],
];

const muns = (await q(`select m.cod_ibge, m.nome from municipios_br m
  where m.uf = $1
    and not exists (select 1 from vw_folha_oficial v where v.cod_ibge = m.cod_ibge)
    and not exists (select 1 from folha_host_candidato c where c.cod_ibge = m.cod_ibge and c.host is not null)
  order by m.nome limit ${LIMITE}`, [UF])).rows;
console.log(`[host] ${UF}: ${muns.length} municípios sem folha a investigar`);

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
let achou = 0, feitos = 0;

async function trata(ctx, m) {
  const page = await ctx.newPage();
  try {
    // o site oficial segue {nome}.{uf}.gov.br na quase totalidade; tenta com e sem www
    let abriu = false;
    for (const site of [`https://www.${so(m.nome)}.${UF.toLowerCase()}.gov.br/`, `https://${so(m.nome)}.${UF.toLowerCase()}.gov.br/`]) {
      try { const r = await page.goto(site, { waitUntil: "domcontentloaded", timeout: 45000 }); if (r && r.status() < 400) { abriu = true; break; } } catch {}
    }
    if (!abriu) return;
    await dorme(3000);
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")]
      .map((e) => ({ t: (e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 50), h: e.href }))
      .filter((x) => /transpar|servidor|folha|pessoal|remunera|portal/i.test(x.t + x.h)));
    // ⭐ prioriza o link que fala de SERVIDOR: é o que aponta direto para a folha
    const ordenados = [...links].sort((a, b) =>
      (/servidor|folha|pessoal/i.test(b.t + b.h) ? 1 : 0) - (/servidor|folha|pessoal/i.test(a.t + a.h) ? 1 : 0));
    for (const l of ordenados) {
      const prod = (ASSINATURAS.find(([re]) => re.test(l.h)) || [])[1];
      if (!prod) continue;
      let host = null; try { host = new URL(l.h).host; } catch { continue; }
      await q(`insert into folha_host_candidato (cod_ibge, municipio, uf, produto, host, url, achado_via)
        values ($1,$2,$3,$4,$5,$6,$7) on conflict (cod_ibge) do update set
        produto=excluded.produto, host=excluded.host, url=excluded.url, achado_via=excluded.achado_via, em=now()`,
        [m.cod_ibge, m.nome, UF, prod, host, l.h.slice(0, 300), `link "${l.t}"`]);
      achou++;
      console.log(`   ⭐ ${m.nome.padEnd(26)} ${prod.padEnd(16)} ${host}`);
      return;
    }
    // não casou assinatura, mas há host externo com porta? registra para identificação pelo CONTEÚDO.
    // 🚨 Gravar só o HOST joga fora o caminho: `topdown.servehttp.com:8080` sozinho não responde e 15 de 18
    //    saíram "não abriu" na identificação. Guardar a URL COMPLETA — é ela que abre.
    // 🚨 Exigir PORTA aqui perdia estados inteiros: em ALAGOAS os portais estão em domínio próprio sem porta
    //    (`transparencia.{mun}.al.gov.br`, `portalpmcanapi.tcgestaopublica.com.br`) e 80 de 83 municípios
    //    sumiam sem deixar rastro. Guardar o MELHOR link de transparência/pessoal seja qual for o host — a
    //    identificação do produto é feita depois, pelo CONTEÚDO (`identifica_host_desconhecido.mjs`).
    const comPorta = ordenados.filter((l) => {
      try { const u = new URL(l.h); return !!u.port || /transpar|servidor|folha|pessoal|portal/i.test(u.host + u.pathname); }
      catch { return false; }
    });
    if (comPorta.length) {
      const l = comPorta[0];
      const host = new URL(l.h).host;
      await q(`insert into folha_host_candidato (cod_ibge, municipio, uf, produto, host, url, achado_via)
        values ($1,$2,$3,'desconhecido',$4,$5,$6)
        on conflict (cod_ibge) do update set host=excluded.host, url=excluded.url, achado_via=excluded.achado_via, em=now()`,
        [m.cod_ibge, m.nome, UF, host, l.h.slice(0, 300), `host com porta, produto a identificar · link "${l.t}"`]);
      console.log(`   ? ${m.nome.padEnd(26)} ${"(a identificar)".padEnd(16)} ${l.h.slice(0, 70)}`);
    }
  } catch { /* site fora do ar é resposta */ }
  finally { await page.close().catch(() => {}); feitos++; }
}

const ctx = await browser.newContext({ ignoreHTTPSErrors: true,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
for (let i = 0; i < muns.length; i += CONC) {
  await Promise.all(muns.slice(i, i + CONC).map((m) => trata(ctx, m)));
  if ((i + CONC) % 20 < CONC) console.log(`  ${Math.min(i + CONC, muns.length)}/${muns.length} · ${achou} com produto`);
}
await browser.close();
console.log(`\n[host] ${achou} de ${muns.length} com portal identificado`);
console.table((await q(`select produto, count(*)::int municipios from folha_host_candidato
  where uf = $1 group by 1 order by 2 desc`, [UF])).rows);
await db.end();
