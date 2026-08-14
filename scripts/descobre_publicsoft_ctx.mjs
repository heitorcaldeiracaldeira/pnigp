// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_publicsoft_ctx.mjs — acha o `ctx` do ELMAR (FolhaPag) de cada município PublicSoft.
// O ctx está no HTML cru da página "quadro-funcional" do site municipal (iframe
// `transparencia.elmartecnologia.com.br/FolhaPag?...ctx={N}`). Rastreia o site (homepage + /portal-da-transparencia/
// + links de quadro/servidor/pessoal/funcional) e extrai o ctx. Popula `publicsoft_ctx` (cod_ibge, ctx) para o coletor.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const UA = "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (u) => { u = (u || "").trim(); if (!u) return null; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return u.replace(/\/$/, ""); };

await q(`create table if not exists publicsoft_ctx (cod_ibge text primary key, municipio text, uf text, ctx text, url_pessoal text, situacao text, em timestamptz default now())`);

async function baixa(url) {
  try { const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.text(); } catch {}
  return null;
}
const achaCtx = (html) => { const m = (html || "").match(/elmartecnologia\.com\.br\/FolhaPag[^"'<> ]*ctx=(\d+)/i); return m ? m[1] : null; };

// coleta links internos que cheiram a pessoal/quadro/transparência
function linksAlvo(html, base) {
  const hrefs = [...(html || "").matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
  const bons = hrefs.filter((h) => /quadro|funcional|servidor|pessoal|folha|remunera|recursos-humanos/i.test(h));
  const outros = hrefs.filter((h) => /transparencia/i.test(h) && !bons.includes(h));
  const abs = (h) => { try { return h.startsWith("http") ? h : new URL(h, base + "/").href; } catch { return null; } };
  return [...new Set([...bons, ...outros].map(abs).filter(Boolean).filter((u) => u.includes(new URL(base).hostname)))].slice(0, 12);
}

const alvos = (await q(`select cod_ibge, municipio, uf, url_portal from radar_portal
  where erp='publicsoft' and unidade_gestora ilike 'Prefeitura%' and url_portal is not null and url_portal <> '-'
  order by uf, municipio`)).rows;
const feitos = new Set((await q(`select cod_ibge from publicsoft_ctx where situacao in ('ok','sem_ctx')`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[publicsoft_ctx] ${alvos.length} municípios · ${fila.length} na fila`);

let ok = 0, sem = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const base = norm(a.url_portal);
  const marca = (situacao, ctx = null, url = null) =>
    q(`insert into publicsoft_ctx (cod_ibge,municipio,uf,ctx,url_pessoal,situacao,em) values ($1,$2,$3,$4,$5,$6,now())
       on conflict (cod_ibge) do update set ctx=excluded.ctx, url_pessoal=excluded.url_pessoal, situacao=excluded.situacao, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, ctx, url, situacao]);
  try {
    let ctx = null, urlAchou = null;
    // 1) homepage + página de transparência
    const home = await baixa(base);
    if (home) ctx = achaCtx(home);
    const paginas = new Set();
    if (!ctx && home) linksAlvo(home, base).forEach((u) => paginas.add(u));
    // sempre tenta a /portal-da-transparencia/
    for (const p of ["/portal-da-transparencia", "/transparencia", "/portal-da-transparencia/"]) {
      const pg = await baixa(base + p);
      if (pg) { if (!ctx) ctx = achaCtx(pg); linksAlvo(pg, base).forEach((u) => paginas.add(u)); if (ctx) { urlAchou = base + p; break; } }
    }
    // 2) segue os links de quadro/servidor/pessoal
    if (!ctx) {
      for (const u of [...paginas].slice(0, 10)) {
        const pg = await baixa(u);
        if (pg) { const c = achaCtx(pg); if (c) { ctx = c; urlAchou = u; break; } }
        await dorme(150);
      }
    }
    if (ctx) { await marca("ok", ctx, urlAchou); ok++; console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio} -> ctx=${ctx}`); }
    else { await marca("sem_ctx", null, null); sem++; }
  } catch (e) { falhas++; await marca("erro"); }
  if (i % 10 === 9) await dorme(300);
}
console.log(`\n[publicsoft_ctx] ${ok} com ctx · ${sem} sem ctx · ${falhas} falhas`);
await db.end();
