// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// resolve_govbr_homonimo.mjs — o host do GovBR sai do NOME (`webapp1-{slug}.cidade360.cloud`), então municípios
// HOMÔNIMOS de UFs diferentes caem no mesmo portal e recebiam a MESMA folha (Cachoeira/BA levou a de Cachoeira do
// Sul/RS: 13.023 linhas; Iporá/GO a de Iporã/PR; Palmital/PR a de Palmital/SP).
//
// ⭐ A PROVA está na própria página: ela linka o site oficial (`{slug}.sp.gov.br`) e/ou o CEP. A UF do link decide.
// Quem perde fica `situacao='homonimo'` com o motivo escrito e `host=null` — não some do cadastro, fica declarado.
//
// Uso: node scripts/resolve_govbr_homonimo.mjs         (só relata)
//      APLICAR=1 node scripts/resolve_govbr_homonimo.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

const dups = (await q(`select host, count(*) n, array_agg(cod_ibge) codigos, array_agg(municipio) muns, array_agg(uf) ufs
  from govbr_portal where host is not null group by 1 having count(*) > 1 order by 1`)).rows;
console.log(`${dups.length} hosts disputados por mais de um município`);

for (const d of dups) {
  let html = "";
  for (const esq of ["https", "http"]) {
    try {
      const r = await fetch(`${esq}://${d.host}/pronimtb/index.asp`, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.ok) { html = await r.text(); break; }
    } catch { /* tenta o outro esquema */ }
  }
  if (!html) { console.log(`  ? ${d.host}: fora do ar — não decide`); continue; }
  // a prova: link para o site oficial `{qualquer}.{uf}.gov.br`
  const ufs = [...new Set([...html.matchAll(/[a-z0-9-]+\.([a-z]{2})\.gov\.br/gi)].map((m) => m[1].toUpperCase()))]
    .filter((u) => d.ufs.includes(u));
  if (ufs.length !== 1) { console.log(`  ? ${d.host}: a página não decide (${d.muns.map((m, i) => m + "/" + d.ufs[i]).join(" e ")}) — links: ${ufs.join(",") || "nenhum"}`); continue; }
  const vencedor = d.ufs.indexOf(ufs[0]);
  console.log(`⭐ ${d.host}: é ${d.muns[vencedor]}/${d.ufs[vencedor]}`);
  for (let i = 0; i < d.codigos.length; i++) {
    if (i === vencedor) continue;
    const cod = d.codigos[i];
    const linhas = (await q(`select count(*) n from folha_servidores_govbr where cod_ibge=$1`, [cod])).rows[0].n;
    console.log(`     ✖ ${d.muns[i]}/${d.ufs[i]} — ${linhas} linhas contaminadas${process.env.APLICAR === "1" ? " (apagando)" : ""}`);
    if (process.env.APLICAR === "1") {
      await q(`delete from folha_servidores_govbr where cod_ibge=$1`, [cod]);
      await q(`update govbr_portal set situacao='homonimo', host=null,
        detalhe=$2 where cod_ibge=$1`, [cod, `host ${d.host} serve ${d.muns[vencedor]}/${d.ufs[vencedor]} (o portal linka o site .${ufs[0].toLowerCase()}.gov.br)`]);
    }
  }
}
await db.end();
