// alimenta erp_portal_municipal (a fonte de alvos do coletor PortalTP) com os portais descobertos
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);
const linhas = (await q(`select cod_ibge, municipio, uf, url_portal_real from portal_real_descoberto
  where url_portal_real ilike '%portaltp.com.br%'`)).rows;
let n = 0;
for (const x of linhas) {
  // o host é {slug}-{uf}.portaltp.com.br e a tabela guarda o slug SEM a uf (extrema-mg → extrema)
  const host = (x.url_portal_real.match(/https?:\/\/([a-z0-9-]+)\.portaltp\.com\.br/i) || [])[1];
  if (!host) continue;
  const slug = host.replace(/-[a-z]{2}$/i, "");
  // a tabela não tem chave única (cod_ibge, erp) — evitar duplicata na mão
  const ja = await q(`select 1 from erp_portal_municipal where cod_ibge=$1 and erp='portaltp'`, [x.cod_ibge]);
  if (ja.rowCount) continue;
  await q(`insert into erp_portal_municipal (cod_ibge, erp, url, slug, achado_em)
    values ($1,'portaltp',$2,$3,now())`, [x.cod_ibge, x.url_portal_real, slug]);
  n++;
}
console.log(`portaltp roteados: ${n} de ${linhas.length}`);
console.log("total portaltp em erp_portal_municipal:", (await q(`select count(*)::int n from erp_portal_municipal where erp='portaltp'`)).rows[0].n);
await db.end();
