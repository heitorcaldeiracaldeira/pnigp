// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// audita_capitais_salario.mjs — para cada capital, verifica se a REMUNERAÇÃO INDIVIDUAL está de fato acessível.
//
// A LC 131/2009 e a LAI obrigam a publicação da remuneração individualizada. Mas publicar a LISTA de servidores e
// entregar o VALOR são coisas diferentes: em Fortaleza a ficha individual existe, tem os campos de proventos e
// descontos, e a API por trás dela responde HTTP 500 em TODAS as 7 competências testadas (2024/12 a 2026/7) —
// o portal exibe "Dados do servidor não localizado" e R$ 0,00. Esta auditoria separa três situações:
//   TEM_VALOR   — a tela/API entrega remuneração
//   SEM_VALOR   — publica quem é servidor, mas não quanto recebe
//   QUEBRADO    — prevê o valor mas a rota falha (erro do portal, não opção editorial)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const SO = process.env.SO || null;

await q(`alter table capital_portal add column if not exists tem_salario text`);
await q(`alter table capital_portal add column if not exists evidencia_salario text`);

const alvos = (await q(`select cod_ibge, municipio, uf, url_pessoal, url_transparencia from capital_portal
  where coalesce(url_pessoal, url_transparencia) is not null
  ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by municipio`, SO ? [SO] : [])).rows;
console.log(`[auditoria] ${alvos.length} capitais com rota conhecida\n`);

const browser = await chromium.launch({ headless: true });
const resumo = new Map();
for (const a of alvos) {
  const url = a.url_pessoal || a.url_transparencia;
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  let veredito = "?", evid = null;
  const erros = [];
  page.on("response", (r) => { if (r.status() >= 500) erros.push(`${r.status()} ${r.url().slice(0, 70)}`); });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await dorme(6000);
    const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    // dinheiro na tela: "R$ 1.234,56" com valor DIFERENTE de zero
    const valores = [...t.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map((m) => m[1]).filter((v) => !/^0+,00$/.test(v));
    const temCampoSalario = /remunera|provento|vencimento|sal[áa]rio|l[íi]quido|bruto/i.test(t);
    if (valores.length >= 3) { veredito = "TEM_VALOR"; evid = `${valores.length} valores na tela (ex.: R$ ${valores[0]})`; }
    else if (temCampoSalario && erros.length) { veredito = "QUEBRADO"; evid = `campos de remuneração presentes, backend falhou: ${erros[0]}`; }
    else if (temCampoSalario) { veredito = "CAMPO_SEM_VALOR"; evid = "tela cita remuneração mas não exibe valores > 0"; }
    else { veredito = "SEM_VALOR"; evid = "tela não menciona remuneração"; }
  } catch (e) { veredito = "ERRO"; evid = String(e.message).slice(0, 60); }
  await q(`update capital_portal set tem_salario=$1, evidencia_salario=$2, em=now() where cod_ibge=$3`, [veredito, evid, a.cod_ibge]);
  resumo.set(veredito, (resumo.get(veredito) || 0) + 1);
  console.log(`  ${a.uf} ${a.municipio.padEnd(16)} ${veredito.padEnd(16)} ${String(evid).slice(0, 70)}`);
  await ctx.close();
}
await browser.close();
console.log("\nRESUMO:", [...resumo.entries()].map(([k, v]) => `${k}=${v}`).join(" · "));
await db.end();
