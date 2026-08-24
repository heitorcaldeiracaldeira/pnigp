// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// sonda_aossoftware_scpi.mjs — acha o módulo de TRANSPARÊNCIA (SCPI) nos hosts `aossoftware.com.br`.
//
// 🚨 O ACHADO QUE MUDA O ALVO: `aossoftware.dcfiorilli.com.br` (Curral Novo/PI) entrega que a aossoftware é
// REVENDA/HOSPEDAGEM DA FIORILLI. Cada município é uma instância própria identificada por (subdomínio, PORTA),
// e a MESMA instância serve vários módulos por CAMINHO:
//     /issweb/         → ISS (tributos)          ← NÃO é folha
//     /sipweb/         → contracheque/pessoal
//     /transparencia/  → SCPI 9.0 (é este)       ← é o que o coletor sabe ler
//     /PM{MUNICIPIO}/  → mesma coisa, rótulo antigo
// O site institucional linka o módulo que quiser — em 13 dos 31 casos linkou o de TRIBUTOS. Cadastrar o link do
// site como alvo de folha estaria errado; o caminho certo é sondar os irmãos no mesmo host:porta.
//
// Uso: node scripts/sonda_aossoftware_scpi.mjs      (APLICAR=1 grava o base_url corrigido)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";
const CONC = Number(process.env.CONC || 6);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" };

// marcadores do SCPI 9.0 — os MESMOS que o coletor usa para navegar
const eSCPI = (t) => /SCPI\s*9\.0|ProcessaDados|frmPaginaAspx|LnkServidores/i.test(t);

const alvos = (await q(`select cod_ibge, municipio, uf, base_url from fiorilli_portal
  where base_url ilike '%aossoftware%' order by municipio`)).rows;
console.log(`[sonda] ${alvos.length} instâncias aossoftware`);

const candidatos = (base) => {
  const u = new URL(base);
  const slug = u.pathname.replace(/^\/|\/$/g, "");
  const raiz = `${u.protocol}//${u.host}`;
  const caminhos = ["transparencia", "Transparencia", "scpi", "transparenciaweb"];
  if (slug && !/^(issweb|sipweb|sseweb)$/i.test(slug)) caminhos.unshift(slug);   // já pode ser o certo
  return [...new Set(caminhos.map((c) => `${raiz}/${c}/`))];
};

let ok = 0, i = 0;
const achados = [];
for (let k = 0; k < alvos.length; k += CONC) {
  await Promise.all(alvos.slice(k, k + CONC).map(async (a) => {
    for (const url of candidatos(a.base_url)) {
      try {
        const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
        if (!r.ok) continue;
        const t = await r.text();
        if (!eSCPI(t)) continue;
        ok++;
        achados.push({ ...a, url });
        console.log(`⭐ ${a.municipio.padEnd(26)}/${a.uf.slice(0, 2)} → ${url}`);
        if (APLICAR) {
          await q(`update fiorilli_portal set base_url=$2,
                     detalhe='SCPI 9.0 via aossoftware (revenda Fiorilli) — módulo de transparência sondado', em=now()
                   where cod_ibge=$1`, [a.cod_ibge, url]);
        }
        return;
      } catch { /* porta fechada / TLS */ }
    }
    console.log(`   ${a.municipio.padEnd(26)}/${a.uf.slice(0, 2)} — sem transparência no host`);
  }));
  i += Math.min(CONC, alvos.length - k);
}
console.log(`\n[sonda] ${ok}/${alvos.length} com módulo de transparência SCPI${APLICAR ? " (gravado)" : " (simulação — use APLICAR=1)"}`);
await db.end();
