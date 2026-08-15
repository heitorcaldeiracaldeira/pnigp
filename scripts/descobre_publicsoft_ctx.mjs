// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_publicsoft_ctx.mjs — acha o `ctx` (identificador da entidade na ELMAR) de cada município PublicSoft.
// O coletor da folha já existe, mas depende de `publicsoft_ctx` — que tinha 6 municípios de 96 mapeados no Radar.
// O ctx aparece no iframe `transparencia.elmartecnologia.com.br/...ctx=N`, ora na home, ora só na página interna
// de transparência (quadro funcional / folha de pagamento) — por isso o segundo salto.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const SO = process.env.SO || null;

const alvos = (await q(`select distinct on (r.cod_ibge) r.cod_ibge, r.municipio, r.uf, r.url_portal
  from radar_portal r where r.erp='publicsoft' and r.url_portal is not null
    and not exists (select 1 from publicsoft_ctx c where c.cod_ibge = r.cod_ibge and c.ctx is not null)
  ${SO ? "and r.municipio ilike '%'||$1||'%'" : ""} order by r.cod_ibge`, SO ? [SO] : [])).rows;
console.log(`[publicsoft] ${alvos.length} municípios sem ctx`);

const RE_CTX = /elmartecnologia\.com\.br[^"'<>\s]*ctx=(\d+)/i;
const baixa = async (u) => {
  const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(35000) });
  return new TextDecoder("utf-8").decode(await r.arrayBuffer());
};

let achou = 0;
for (let i = 0; i < alvos.length; i++) {
  const a = alvos[i];
  let ctx = null;
  try {
    const home = await baixa(a.url_portal.startsWith("http") ? a.url_portal : `https://${a.url_portal}`);
    ctx = (home.match(RE_CTX) || [])[1] || null;
    if (!ctx) {
      // 2º salto: a página interna de transparência/quadro funcional é quem embute o iframe
      const links = [...new Set([...home.matchAll(/href=["']([^"']{4,140})["']/gi)].map((m) => m[1]))]
        .filter((h) => /transparencia|quadro-funcional|folha|servidor|pessoal/i.test(h)).slice(0, 4);
      for (const l of links) {
        const url = l.startsWith("http") ? l : new URL(l, a.url_portal.startsWith("http") ? a.url_portal : `https://${a.url_portal}`).href;
        try {
          const p = await baixa(url);
          ctx = (p.match(RE_CTX) || [])[1] || null;
          if (ctx) break;
        } catch { /* próximo link */ }
      }
    }
  } catch { /* site fora */ }
  if (ctx) {
    await q(`insert into publicsoft_ctx (cod_ibge,municipio,uf,ctx,em) values ($1,$2,$3,$4,now())
      on conflict (cod_ibge) do update set ctx=coalesce(publicsoft_ctx.ctx, excluded.ctx), em=now()`,
      [a.cod_ibge, a.municipio, a.uf, ctx]);
    achou++;
  }
  if ((i + 1) % 15 === 0) console.log(`  ${i + 1}/${alvos.length} · ${achou} com ctx`);
}
console.log(`\n[publicsoft] ${achou}/${alvos.length} ctx descobertos`);
console.log("total na tabela:", (await q(`select count(*) filter (where ctx is not null)::int n from publicsoft_ctx`)).rows[0].n);
await db.end();
