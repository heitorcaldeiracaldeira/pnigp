// descobre_portaltp_es.mjs — para os municípios do ES ainda NÃO identificados no radar, testa se são Portal TP
// (API `{slug}-es.portaltp.com.br/api/transparencia.asmx/json_servidores`). Registra os que respondem em
// erp_portal_municipal (erp='portaltp', slug), para o coletor ingest_folha_portaltp.mjs pegar depois.
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const slugDe = (nome) => (nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['´`]/g, "").replace(/[^a-z0-9]/g, "");

await q(`create table if not exists erp_portal_municipal (
  cod_ibge text, erp text, slug text, url text, titulo text, achado_em timestamptz default now(),
  primary key (cod_ibge, erp))`);

// ES não-identificados no radar (sem erp), que ainda não estão como portaltp
const alvos = (await q(`select distinct r.cod_ibge, m.nome, m.uf from radar_portal r
  join municipios_br m on m.cod_ibge=r.cod_ibge
  where r.uf='Espírito Santo' and r.unidade_gestora ilike 'Prefeitura%' and r.erp is null
  and not exists (select 1 from erp_portal_municipal e where e.cod_ibge=r.cod_ibge and e.erp='portaltp')
  order by m.nome`)).rows;
console.log(`[portaltp-es] ${alvos.length} municípios ES não-identificados a testar`);

async function testa(slug) {
  // tenta slug-es e slug puro; ano/mes recente
  for (const host of [`${slug}-es`, slug]) {
    const url = `https://${host}.portaltp.com.br/api/transparencia.asmx/json_servidores?ano=2026&mes=6`;
    try {
      const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(20000) });
      if (r.status >= 300 && r.status < 400) continue; // redirect = host errado
      if (!r.ok) continue;
      const t = await r.text();
      if (/servidor|nome|cargo|\[/i.test(t) && t.length > 20) return { host, ok: true };
    } catch {}
  }
  return { ok: false };
}

let achados = 0;
for (let i = 0; i < alvos.length; i++) {
  const a = alvos[i];
  const slug = slugDe(a.nome);
  const res = await testa(slug);
  if (res.ok) {
    const realSlug = res.host.replace(/-es$/, "") === slug ? slug : res.host; // guarda o slug base (o coletor recompõe -uf)
    await q(`insert into erp_portal_municipal (cod_ibge, erp, slug, url, titulo, achado_em)
      values ($1,'portaltp',$2,$3,'Portal TP (ES)',now())
      on conflict (cod_ibge, erp) do update set slug=excluded.slug, url=excluded.url`,
      [a.cod_ibge, slug, `https://${res.host}.portaltp.com.br`]);
    achados++;
    console.log(`  ✔ ${a.nome}: ${res.host}.portaltp.com.br`);
  } else {
    process.stdout.write(`  · ${a.nome} (${slug}) não é portaltp\r`);
  }
  await dorme(300);
}
console.log(`\n[portaltp-es] ${achados} novos Portal TP no ES registrados`);
await db.end();
