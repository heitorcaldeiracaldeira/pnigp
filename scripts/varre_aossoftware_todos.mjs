// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_aossoftware_todos.mjs — recolhe TODOS os links `aossoftware.com.br` de cada site municipal e escolhe o
// módulo de TRANSPARÊNCIA (SCPI 9.0), que é o único que serve folha nominal.
//
// 🚨 O DEFEITO QUE ISTO CONSERTA: a varredura anterior usava `t.match(...)` — pega só a PRIMEIRA ocorrência. Um
// site que linka `tributos…/issweb/` antes de `transparencia…/…/` era cadastrado como ISS. 13 dos 31 alvos
// saíram assim. Em varredura de fornecedor, colher TUDO e escolher depois; nunca parar no primeiro casamento.
//
// A aossoftware é REVENDA/HOSPEDAGEM DA FIORILLI (`aossoftware.dcfiorilli.com.br` no ar): cada município é uma
// instância (subdomínio, PORTA) que serve módulos por caminho — /issweb/ (ISS), /sipweb/ (contracheque),
// /transparencia/ e /PM{X}/ (SCPI). Ver [[pnigp-rotulo-erp-nao-e-o-portal-da-folha]].
//
// Uso: UFS="Piauí,Maranhão" APLICAR=1 node scripts/varre_aossoftware_todos.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UFS = (process.env.UFS || "Piauí,Maranhão").split(",");
const APLICAR = process.env.APLICAR === "1";
const CONC = Number(process.env.CONC || 8);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" };

const eSCPI = (t) => /SCPI\s*9\.0|ProcessaDados|frmPaginaAspx|LnkServidores/i.test(t);
// ordem de preferência do CAMINHO: transparência primeiro, tributos nunca
const nota = (u) => (/\/(transparencia|scpi)\b/i.test(u) ? 3 : /\/PM[A-Z0-9]/i.test(u) ? 2 : /issweb/i.test(u) ? 0 : 1);

const alvos = (await q(`select cod_ibge, municipio, uf, url_portal from radar_portal
  where erp is null and unidade_gestora ilike 'Prefeitura%' and uf = any($1::text[])
    and url_portal is not null and url_portal <> '-'`, [UFS])).rows;
console.log(`[aos-todos] ${alvos.length} sites em ${UFS.join("/")}`);

let ok = 0, i = 0;
for (let k = 0; k < alvos.length; k += CONC) {
  await Promise.all(alvos.slice(k, k + CONC).map(async (a) => {
    const u0 = a.url_portal.startsWith("http") ? a.url_portal : `https://${a.url_portal}`;
    let links = [];
    try {
      const r = await fetch(u0, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
      if (!r.ok) return;
      const t = await r.text();
      links = [...new Set([...t.matchAll(/https?:\/\/([a-z0-9.-]*aossoftware\.com\.br(?::\d{2,5})?\/[A-Za-z0-9_-]{2,40}\/)/gi)]
        .map((m) => `https://${m[1]}`))];
    } catch { return; }
    if (!links.length) return;
    links.sort((x, y) => nota(y) - nota(x));

    // confirmar na fonte: o alvo só vale se a página responder com os marcadores do SCPI
    for (const url of links) {
      try {
        const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
        if (!r.ok || !eSCPI(await r.text())) continue;
      } catch { continue; }
      ok++;
      console.log(`⭐ ${a.municipio.padEnd(26)}/${a.uf.slice(0, 2)} → ${url}   (${links.length} links no site)`);
      if (APLICAR) {
        await q(`insert into fiorilli_portal (cod_ibge, municipio, uf, base_url, detalhe, em)
          values ($1,$2,$3,$4,'SCPI 9.0 via aossoftware (revenda Fiorilli) — confirmado na fonte',now())
          on conflict (cod_ibge) do update set base_url=excluded.base_url, detalhe=excluded.detalhe, em=now()`,
          [a.cod_ibge, a.municipio, a.uf, url]);
      }
      return;
    }
  }));
  i += Math.min(CONC, alvos.length - k);
  process.stdout.write(`   ${i}/${alvos.length} · ${ok} SCPI\r`);
}
console.log(`\n[aos-todos] ${ok} municípios com SCPI confirmado na fonte${APLICAR ? "" : " (simulação)"}`);
await db.end();
