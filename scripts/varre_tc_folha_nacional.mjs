// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_tc_folha_nacional.mjs — a pergunta que nunca foi feita de forma sistemática:
//   "ESTE TRIBUNAL PUBLICA A FOLHA DOS MUNICÍPIOS JURISDICIONADOS?"
//
// POR QUE vale: o inventário dos 33 TCs foi levantado para COMPRAS. Perguntar por PESSOAL fechou dois estados
// inteiros nesta semana — TCE-MT (Radar Pessoal Qlik, 141/141) e TCE-PB (ZIP por município, 223/223), 364
// municípios sem escrever um único coletor de portal.
//
// 🚨 A ARMADILHA Nº 1: "Servidores/Remuneração" no portal do tribunal quase sempre é o quadro DO PRÓPRIO TC.
//    Só conta como achado quando o item aparece junto de MUNICÍPIO/JURISDICIONADO — e mesmo assim a prova
//    final é a coleta ([[pnigp-sonda-folha-prova-e-a-coleta]]).
//
// Uso: node scripts/varre_tc_folha_nacional.mjs   ·   SO=TCE-PE   ·   CONC=4
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import fs from "fs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool(); const q = withRetry(db);
const SO = process.env.SO || null;
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };
const RE_PESSOAL = /servidor|pessoal|remunera|folha de pagamento|folha_pagamento|sal[áa]rio|agente p[úu]blico|quadro funcional|vencimento/i;
const RE_MUNI = /munic[íi]pio|jurisdicionad|prefeitura|ente|unidade gestora/i;
// já medidos nesta campanha — não repetir
const JA = { "TCE-MT": "PUBLICA (Radar Pessoal Qlik, nominal)", "TCE-PB": "PUBLICA (ZIP por município)",
  "TCE-SC": "PUBLICA (Farol e-Sfinge)", "TCE-MS": "não publica (medido)", "TCE-RN": "não publica (11 rotas, nenhuma de pessoal)",
  "TCE-CE": "não publica (API 500, SIM exige login)", "TCE-RS": "não publica (só empenho)", "TCE-PR": "não publica (SIAP fechado)",
  "TCM-BA": "PUBLICA (crackeado)", "TCE-MG": "PUBLICA (API sem captcha)", "TCE-MA": "PUBLICA (saapfolha até 2021)",
  "TCE-PE": "PUBLICA (ListaServidores, sem valor)" };

await q(`create table if not exists tc_folha_varredura (
  sigla text primary key, uf text, nome text, nivel text, host text,
  veredito text, evidencia text, urls_testadas int, em timestamptz default now()
)`);

const inv = JSON.parse(fs.readFileSync("C:/Users/PC/inventario-tribunais-contas.json", "utf8"));
const tcs = inv.tribunais.filter((t) => !SO || t.s === SO);
console.log(`[tc-folha] ${tcs.length} tribunais`);

// caminhos canônicos onde um TC costuma pendurar pessoal dos jurisdicionados
const CAMINHOS = ["", "/dados-abertos", "/dadosabertos", "/transparencia", "/portal-do-cidadao", "/cidadao",
  "/consultas", "/paineis", "/painel"];
const SUBS = ["", "dados", "dadosabertos", "dados-abertos", "transparencia", "cidadao", "painel", "paineis",
  "radar", "radarpessoal", "pessoal", "folha", "api", "consulta"];

const raiz = (host) => String(host || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").split(".").slice(-3).join(".");

for (const [i, tc] of tcs.entries()) {
  if (JA[tc.s]) {
    await q(`insert into tc_folha_varredura (sigla, uf, nome, nivel, host, veredito, evidencia, urls_testadas)
      values ($1,$2,$3,$4,$5,$6,$7,0) on conflict (sigla) do update set veredito=excluded.veredito,
      evidencia=excluded.evidencia, em=now()`, [tc.s, tc.uf, tc.nome, tc.nivel, tc.host, JA[tc.s].startsWith("PUBLICA") ? "publica" : "nao_publica", JA[tc.s]]);
    console.log(`  = ${tc.s.padEnd(9)} ${JA[tc.s]}`);
    continue;
  }
  const base = raiz(tc.host) || `tce.${String(tc.uf || "").toLowerCase()}.gov.br`;
  const alvos = [...new Set([
    ...SUBS.map((s) => `https://${s ? s + "." : "www."}${base}/`),
    ...CAMINHOS.map((c) => `https://www.${base}${c}`),
  ])];
  let achado = null, testadas = 0;
  for (const u of alvos) {
    try {
      const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(12000) });
      testadas++;
      if (!r.ok) continue;
      const t = await r.text();
      if (/não encontrada|page not found|erro 404/i.test(t)) continue;
      // procura itens de pessoal que apareçam JUNTO de município/jurisdicionado (senão é o quadro do próprio TC)
      const itens = [...t.matchAll(/>([^<>{}]{6,90})</g)].map((m) => m[1].trim()).filter((x) => RE_PESSOAL.test(x));
      const comMuni = itens.filter((x) => RE_MUNI.test(x));
      const linksPess = [...new Set([...t.matchAll(/href="([^"]*(?:servidor|pessoal|folha|remunera)[^"]*)"/gi)].map((m) => m[1]))].slice(0, 4);
      if (comMuni.length || (itens.length && RE_MUNI.test(t) && linksPess.length)) {
        achado = { url: u, itens: [...new Set(comMuni.length ? comMuni : itens)].slice(0, 4), links: linksPess };
        break;
      }
    } catch { /* host inexistente */ }
  }
  const veredito = achado ? "a_investigar" : "sem_sinal";
  const evid = achado ? `${achado.url} :: ${achado.itens.join(" | ")} :: ${achado.links.join(" ")}`.slice(0, 400) : `nada em ${testadas} URLs`;
  await q(`insert into tc_folha_varredura (sigla, uf, nome, nivel, host, veredito, evidencia, urls_testadas)
    values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (sigla) do update set veredito=excluded.veredito,
    evidencia=excluded.evidencia, urls_testadas=excluded.urls_testadas, em=now()`,
    [tc.s, tc.uf, tc.nome, tc.nivel, tc.host, veredito, evid, testadas]);
  console.log(`  ${achado ? "⭐" : "○"} [${i + 1}/${tcs.length}] ${tc.s.padEnd(9)} ${veredito.padEnd(13)} ${achado ? achado.url.slice(0, 55) + " :: " + achado.itens.slice(0, 2).join(" | ").slice(0, 70) : `(${testadas} URLs)`}`);
}
console.log("\n══ resultado ══");
console.table((await q(`select veredito, count(*) n from tc_folha_varredura group by 1 order by 2 desc`)).rows);
console.table((await q(`select sigla, uf, veredito, left(evidencia,80) evidencia from tc_folha_varredura
  where veredito='a_investigar' order by sigla`)).rows);
await db.end();
