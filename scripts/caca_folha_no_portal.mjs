// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// caca_folha_no_portal.mjs — dado um portal de transparência, SEGUE os links até achar a tela de folha e
// prova pelo CONTEÚDO (nome + valor), não por rota fixa.
//
// ⭐ POR QUE: varrer rotas conhecidas (`/transparencia/servidores/folhas/servidores/`) esgota rápido — cada
//    portal próprio inventa a sua. O que não muda é a PROVA: uma tabela com nome de pessoa e dinheiro.
// 🚨 Registra o que achou em `folha_host_candidato.url` + produto='folha_encontrada', para o passo seguinte
//    decidir o coletor. Não coleta nada aqui: separa DESCOBRIR de COLETAR.
//
// Uso: UF=AL node scripts/caca_folha_no_portal.mjs   ·   LIMITE=10   ·   CONC=3
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "AL";
const CONC = Number(process.env.CONC || 3);
const LIMITE = Number(process.env.LIMITE || 999);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

// a folha tem: nome de pessoa (2+ palavras maiúsculas) e dinheiro no formato brasileiro
const TEM_DINHEIRO = /\d{1,3}\.\d{3},\d{2}|R\$\s?\d+[.,]\d{2}/;
const TEM_NOME = /\b[A-ZÀ-Ú][A-ZÀ-Ú]+\s+[A-ZÀ-Ú]{2,}\b/;

const alvos = (await q(`select cod_ibge, municipio, url from folha_host_candidato
  where uf = $1 and produto = 'desconhecido'
    and not exists (select 1 from vw_folha_oficial v where v.cod_ibge = folha_host_candidato.cod_ibge)
  order by municipio limit ${LIMITE}`, [UF])).rows;
console.log(`[caça] ${UF}: ${alvos.length} portais a investigar`);

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
let achou = 0;

async function provaFolha(page) {
  await dorme(3500);
  return await page.evaluate(({ dinRe, nomeRe }) => {
    const din = new RegExp(dinRe), nome = new RegExp(nomeRe);
    const t = document.body?.innerText || "";
    const linhas = document.querySelectorAll("tr, .tr, [class*=row]").length;
    return { temDin: din.test(t), temNome: nome.test(t), linhas, tam: t.length,
      titulo: (document.title || "").slice(0, 50) };
  }, { dinRe: TEM_DINHEIRO.source, nomeRe: TEM_NOME.source }).catch(() => null);
}

async function trata(a) {
  const page = await ctx.newPage();
  try {
    await page.goto(a.url, { waitUntil: "commit", timeout: 45000 }).catch(() => {});
    await dorme(3000);
    // 1) a própria página já é a folha?
    let p = await provaFolha(page);
    if (p && p.temDin && p.temNome && p.linhas > 8) {
      await q(`update folha_host_candidato set produto='folha_encontrada', achado_via='folha na própria página' where cod_ibge=$1`, [a.cod_ibge]);
      console.log(`   ⭐ ${a.municipio.padEnd(24)} folha na própria página (${p.linhas} linhas)`);
      achou++; return;
    }
    // 2) segue os links que falam de folha/servidor — os mais específicos primeiro
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")]
      .map((e) => ({ t: (e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40), h: e.href }))
      .filter((x) => /folha|servidor|remunera|pessoal|sal[áa]rio/i.test(x.t + x.h))).catch(() => []);
    const ordem = [...new Map(links.map((l) => [l.h, l])).values()]
      .sort((x, y) => (/folha|remunera/i.test(y.t + y.h) ? 1 : 0) - (/folha|remunera/i.test(x.t + x.h) ? 1 : 0))
      .slice(0, 5);
    for (const l of ordem) {
      await page.goto(l.h, { waitUntil: "commit", timeout: 40000 }).catch(() => {});
      p = await provaFolha(page);
      if (p && p.temDin && p.temNome && p.linhas > 8) {
        await q(`update folha_host_candidato set produto='folha_encontrada', url=$2,
                 achado_via=$3 where cod_ibge=$1`, [a.cod_ibge, l.h.slice(0, 300), `link "${l.t}"`]);
        console.log(`   ⭐ ${a.municipio.padEnd(24)} ${l.h.slice(0, 70)}`);
        achou++; return;
      }
    }
    console.log(`   · ${a.municipio.padEnd(24)} nenhuma tela com nome+valor (${ordem.length} links seguidos)`);
  } catch (e) { console.log(`   ✖ ${a.municipio.padEnd(24)} ${String(e.message).slice(0, 45)}`); }
  finally { await page.close().catch(() => {}); }
}

for (let i = 0; i < alvos.length; i += CONC) await Promise.all(alvos.slice(i, i + CONC).map(trata));
await browser.close();
console.log(`\n[caça] ${achou} de ${alvos.length} com folha localizada`);
await db.end();
