// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_bloco_host.mjs — dá o SALTO que o identificador de ERP não dá: colhe TODOS os links de um host de
// terceiro nos sites municipais, ABRE cada alvo e identifica o produto NA PÁGINA DE DESTINO.
//
// 🚨 POR QUE ISTO EXISTE: `identifica_erp_por_pagina.mjs` lê o site institucional. No PI/MA o site é um CMS
// (`administracaopublica.com.br`) e a assinatura do fornecedor DA FOLHA está um salto adiante, no portal linkado
// — 283 municípios re-checados deram ZERO por isso ([[pnigp-rotulo-erp-nao-e-o-portal-da-folha]]).
//
// Regras que este script respeita:
//  · colher TUDO com matchAll e escolher depois — parar no primeiro link cadastra o módulo errado
//    ([[pnigp-varredura-colher-tudo-nao-o-primeiro]]);
//  · a prova é a PÁGINA DE DESTINO, não o nome do host ([[pnigp-sonda-folha-prova-e-a-coleta]]);
//  · não grava alvo nenhum — só RELATA. Cadastro é passo separado, com a régua do produto na mão.
//
// Uso: HOSTS="webservicesistemas,adtrcloud,siafc,stsinformatica" UFS="Piauí,Maranhão" node scripts/varre_bloco_host.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { identifica } from "./_erp_assinaturas.mjs";

const db = pool();
const q = withRetry(db);
const UFS = (process.env.UFS || "Piauí,Maranhão").split(",");
const HOSTS = (process.env.HOSTS || "webservicesistemas,adtrcloud,siafc,stsinformatica").split(",").map((s) => s.trim());
const CONC = Number(process.env.CONC || 8);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" };

// assinaturas de PRODUTO que o dicionário geral ainda não cobre — o que interessa é reconhecer a PLATAFORMA
const EXTRA = [
  [/SCPI\s*9\.0|ProcessaDados\(|frmPaginaAspx/i, "scpi (Fiorilli)"],
  [/DevExpress|ASPxGridView/i, "grid DevExpress"],
  [/__doPostBack|aspnetForm|ASP\.NET/i, "ASP.NET WebForms"],
  [/ng-app|ng-version|angular/i, "Angular SPA"],
  [/DataTables|dataTable\(/i, "DataTables"],
  [/react|__NEXT_DATA__/i, "React/Next"],
];
const marca = (t) => {
  const erp = identifica(t);
  const e = (typeof erp === "string" ? erp : erp?.erp) || null;
  const extras = EXTRA.filter(([re]) => re.test(t)).map(([, n]) => n);
  return [e, ...extras].filter(Boolean).join(" + ") || "—";
};
const temFolha = (t) => /servidor|folha de pagamento|remunera|quadro de pessoal|contracheque/i.test(t);

const alvos = (await q(`select cod_ibge, municipio, uf, url_portal from radar_portal
  where erp is null and unidade_gestora ilike 'Prefeitura%' and uf = any($1::text[])
    and url_portal is not null and url_portal <> '-'`, [UFS])).rows;
console.log(`[bloco] ${alvos.length} sites em ${UFS.join("/")} · hosts: ${HOSTS.join(", ")}\n`);

const reHost = new RegExp(`https?://([a-z0-9.:-]*(?:${HOSTS.join("|")})[a-z0-9.:/_?=&%-]*)`, "gi");
const porHost = new Map();   // host → {n, produto, exemplos:[], folha}
let i = 0, comLink = 0;

for (let k = 0; k < alvos.length; k += CONC) {
  await Promise.all(alvos.slice(k, k + CONC).map(async (a) => {
    const u0 = a.url_portal.startsWith("http") ? a.url_portal : `https://${a.url_portal}`;
    let links = [];
    try {
      const r = await fetch(u0, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
      if (!r.ok) return;
      links = [...new Set([...(await r.text()).matchAll(reHost)].map((m) => `https://${m[1]}`))];
    } catch { return; }
    if (!links.length) return;
    comLink++;

    for (const url of links.slice(0, 4)) {
      let t = "";
      try {
        const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
        if (!r.ok) continue;
        t = await r.text();
      } catch { continue; }
      const host = (() => { try { return new URL(url).host; } catch { return url; } })();
      const chave = host.replace(/^[a-z0-9-]+\./, (s) => (/^(www|transparencia|portal)\./.test(s) ? s : "*."));
      if (!porHost.has(chave)) porHost.set(chave, { n: 0, produtos: new Set(), exemplos: [], folha: 0 });
      const v = porHost.get(chave);
      v.n++;
      v.produtos.add(marca(t));
      if (temFolha(t)) v.folha++;
      if (v.exemplos.length < 2) v.exemplos.push(`${a.municipio}/${a.uf.slice(0, 2)} → ${url.slice(0, 78)}`);
    }
  }));
  i += Math.min(CONC, alvos.length - k);
  process.stdout.write(`   ${i}/${alvos.length} · ${comLink} sites com link\r`);
}

console.log(`\n\n── o que há atrás de cada host (${comLink} sites linkaram) ──`);
for (const [h, v] of [...porHost.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`\n${h}   ${v.n} páginas · ${v.folha} mencionam pessoal/folha`);
  console.log(`   produto: ${[...v.produtos].join(" | ")}`);
  for (const e of v.exemplos) console.log(`   ${e}`);
}
await db.end();
