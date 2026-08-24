// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_aossoftware_ne.mjs — cadastra como alvo SCPI os municípios cujo site linka
// `transparencia.aossoftware.com.br/PM{MUNICIPIO}/…` — que é **SCPI 9.0 white-label** (a página responde
// "SCPI 9.0 - Transparência", com `ProcessaDados`/`frmPaginaAspx`, os mesmos marcadores do coletor).
//
// 🚨 POR QUE O IDENTIFICADOR NÃO ACHAVA: no PI/MA o site institucional é o CMS `administracaopublica.com.br`
// (diário oficial, e-SIC) — a assinatura do FORNECEDOR DA FOLHA está um salto adiante, no link da transparência.
// 283 municípios foram re-checados por assinatura com ZERO resultado por causa disso.
// Mesma familia de [[pnigp-rotulo-erp-nao-e-o-portal-da-folha]].
//
// Uso: UFS="Piauí,Maranhão" node scripts/varre_aossoftware_ne.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UFS = (process.env.UFS || "Piauí,Maranhão").split(",");
const CONC = Number(process.env.CONC || 8);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" };

await q(`create table if not exists fiorilli_portal (
  cod_ibge text primary key, municipio text, uf text, base_url text, detalhe text, em timestamptz default now()
)`);

const alvos = (await q(`select cod_ibge, municipio, uf, url_portal from radar_portal
  where erp is null and unidade_gestora ilike 'Prefeitura%' and uf = any($1::text[])
    and url_portal is not null and url_portal <> '-'`, [UFS])).rows;
console.log(`[aossoftware] ${alvos.length} sites a varrer em ${UFS.join("/")}`);

let achados = 0, i = 0;
for (let k = 0; k < alvos.length; k += CONC) {
  await Promise.all(alvos.slice(k, k + CONC).map(async (a) => {
    const u = a.url_portal.startsWith("http") ? a.url_portal : `https://${a.url_portal}`;
    try {
      const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
      if (!r.ok) return;
      const t = await r.text();
      // o link traz o CÓDIGO do município no produto — é ele que vira o alvo, não o nome
      // 🚨 O white-label tem PELO MENOS DUAS FORMAS: `/{host}/PM{MUNICIPIO}/` (Avelino Lopes) e
      // `{host}:{PORTA}/transparencia/` (Barra D'Alcântara, porta 8026). Capturar a BASE, não um formato só —
      // exigir `/PM…/` fez a varredura achar 2 de 41.
      const m = t.match(/https?:\/\/([a-z0-9.-]*aossoftware\.com\.br(?::\d{2,5})?\/[A-Za-z0-9_-]{3,40}\/)/i);
      if (!m) return;
      const base = `https://${m[1]}`;
      achados++;
      console.log(`⭐ ${a.municipio.padEnd(26)}/${a.uf.slice(0, 2)} → ${base}`);
      await q(`insert into fiorilli_portal (cod_ibge, municipio, uf, base_url, detalhe, em)
        values ($1,$2,$3,$4,'SCPI white-label aossoftware (link no site institucional)',now())
        on conflict (cod_ibge) do update set base_url=excluded.base_url, detalhe=excluded.detalhe, em=now()`,
        [a.cod_ibge, a.municipio, a.uf, base]);
    } catch { /* site fora */ }
  }));
  i += Math.min(CONC, alvos.length - k);
  process.stdout.write(`   ${i}/${alvos.length} · ${achados} achados\r`);
}
console.log(`\n[aossoftware] ${achados} municípios cadastrados como SCPI`);
await db.end();
