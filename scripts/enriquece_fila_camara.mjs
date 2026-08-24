// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// enriquece_fila_camara.mjs — dá URL de portal às câmaras da fila que ainda não têm uma.
//
// Três fontes, na ordem em que a prova é mais forte:
//   1. `folha_catalogo_rnr` — o catálogo nacional declara `tipo_entidade='Câmara Municipal'` E o link do portal.
//      É a prova mais forte que existe: a ROTA identifica o produto ([[pnigp-rota-identifica-o-produto-nao-o-host]],
//      [[pnigp-catalogo-rnr-resolve-o-ente]]).
//   2. `prefeitura_de_camara.url_camara` — o inverso do script que procurava a prefeitura a partir da câmara.
//   3. DERIVAÇÃO por padrão de domínio, com PROVA na rede: `{slug}.{uf}.leg.br`, `camara{slug}.{uf}.gov.br`,
//      `cm{slug}.{uf}.gov.br`. 🚨 HTTP 200 não prova nada sozinho ([[pnigp-sonda-soft404-falso-positivo]]) — o
//      corpo tem de falar de CÂMARA/VEREADOR, e o veredito final continua sendo do coletor.
//
// Uso: node scripts/enriquece_fila_camara.mjs            · DERIVAR=1 para a etapa 3 (rede) · CONC=6 LIMITE=
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";
import { baixa } from "./_erp_assinaturas.mjs";

const db = pool();
const q = withRetry(db);
const CONC = Number(process.env.CONC || 6);
const LIMITE = process.env.LIMITE ? Number(process.env.LIMITE) : null;

await q(`alter table folha_camara_fila add column if not exists url_origem text`);

// ── 1 e 2: catálogo RNR e o inverso do prefeitura_de_camara ────────────────────────────────────────────────────
const rnr = await q(`update folha_camara_fila f set url_camara = c.link, url_origem = 'catalogo-rnr'
  from (select distinct on (cod_ibge) cod_ibge, link from folha_catalogo_rnr
         where coalesce(tipo_entidade,'') ~* 'c[âa]mara' or coalesce(entidade_nome,'') ~* 'c[âa]mara'
         order by cod_ibge, (link ilike '%AcessoIndividual=LnkServidores%') desc) c
  where c.cod_ibge = f.cod_ibge and f.url_camara is null`);
console.log(`catálogo RNR: ${rnr.rowCount} câmaras ganharam URL`);

const pdc = await q(`update folha_camara_fila f set url_camara = p.url_camara, url_origem = 'prefeitura_de_camara'
  from prefeitura_de_camara p
  where p.cod_ibge = f.cod_ibge and f.url_camara is null and p.url_camara is not null`);
console.log(`prefeitura_de_camara: ${pdc.rowCount} câmaras ganharam URL`);

if (process.env.DERIVAR !== "1") {
  const r = (await q(`select count(*) filter (where url_camara is null)::int sem_url from folha_camara_fila`)).rows[0];
  console.log(`\n${r.sem_url} câmaras seguem sem URL — rode com DERIVAR=1 para tentar o padrão de domínio.`);
  await db.end(); process.exit(0);
}

// ── 3: derivação com prova na rede ─────────────────────────────────────────────────────────────────────────────
const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "");
const alvos = (await q(`select f.cod_ibge, f.municipio, f.uf from folha_camara_fila f
  where f.url_camara is null order by f.rais_legislativo desc nulls last ${LIMITE ? `limit ${LIMITE}` : ""}`)).rows;
console.log(`[derivar] ${alvos.length} câmaras sem URL · concorrência ${CONC}`);

// ⭐ a prova é o CORPO falar de câmara; e o corpo NÃO pode ser o da prefeitura (o mesmo host serve os dois)
const EH_CAMARA = /c[âa]mara\s+municipal|poder\s+legislativo|vereador/i;
let achados = 0, feitos = 0;
for (let i = 0; i < alvos.length; i += CONC) {
  await Promise.all(alvos.slice(i, i + CONC).map(async (a) => {
    const s = slug(a.municipio), uf = String(a.uf || "").toLowerCase();
    const cands = [`https://${s}.${uf}.leg.br/`, `https://www.camara${s}.${uf}.gov.br/`,
                   `https://cm${s}.${uf}.gov.br/`, `https://www.${s}.${uf}.leg.br/`];
    for (const url of cands) {
      const html = await baixa(url);
      if (html && EH_CAMARA.test(html)) {
        await q(`update folha_camara_fila set url_camara=$2, url_origem='derivado' where cod_ibge=$1`, [a.cod_ibge, url]);
        achados++; break;
      }
    }
    feitos++;
  }));
  if (i % 300 === 0) console.log(`  … ${feitos}/${alvos.length} · ${achados} com portal achado`);
}
console.log(`\n[derivar] ${feitos} checados · ${achados} portais de câmara achados e PROVADOS pelo corpo da página`);
await db.end();
