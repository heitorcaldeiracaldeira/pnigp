// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// sonda_eddydata.mjs — mede o bloco EddyData ("Transparência Pública") em `app.{slug}.{uf}.gov.br`.
//
// ⭐ Achado em 18/ago/2026 nos últimos avulsos dos 42 de SP: São José da Bela Vista e Tapiratiba serviam o
// MESMO bundle Angular (hash idêntico `main-es2015.152eb8396142c5448180.js`) — logo, mesmo produto.
// Atrás dele há uma **API REST** com os cinco campos: `/api/v1/{tenant}/1/holerites/{pag}/{lim}` com
// `relations=funcionario.pessoa,funcionario.cargo,funcionario.departamento`.
//
// 🚨 O TENANT não sai do slug ("sjbv" para São José da Bela Vista) — está EMBUTIDO no bundle, em
// `const environment = { url: 'https://app.../api/v1/{tenant}', orgao: '020000', cidade: 1 }`.
// O bundle tem 24 MB e o `environment` fica a ~57% do arquivo; baixar tudo para 357 municípios seriam ~5 GB.
// Como o servidor aceita **Range**, esta sondagem pega só a faixa de 800 KB em volta do ponto conhecido.
// ⚠️ O deslocamento varia alguns milhares de bytes entre instalações (o nome do tenant tem tamanhos
// diferentes): a primeira faixa de 12 KB que testei ACHOU em São José e NÃO achou em Tapiratiba. Faixa
// estreita demais produz "não é EddyData" para quem é.
//
// Uso: node scripts/sonda_eddydata.mjs   ·  UF_SONDA=35 (padrão SP)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF_SONDA = process.env.UF_SONDA || "35";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const slugDe = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists eddydata_portal (
  cod_ibge text primary key, municipio text, uf text, host text, caminho text,
  tenant text, orgao text, cidade int, versao text, situacao text, detalhe text,
  em timestamptz default now())`);

const alvos = process.env.REFAZ
  ? (await q(`select cod_ibge, municipio, uf from eddydata_portal where situacao = $1 order by municipio`,
      [process.env.REFAZ])).rows
  : (await q(`
      select m.cod_ibge, m.nome municipio, m.uf
        from municipios_br m
       where left(m.cod_ibge,2) = $1
         -- 🚨 not exists contra a VIEW (65 fontes) trava: a sondagem de MG ficou minutos parada antes de
       -- imprimir a primeira linha. A tabela aux_mun_com_folha materializa o conjunto uma vez
       -- (scripts/atualiza_aux_mun_com_folha.mjs) e a consulta passa a ser instantânea.
       -- ATENÇÃO: nada de crase aqui dentro — este SQL vive num template literal.
       and not exists (select 1 from aux_mun_com_folha a where a.cod_ibge = m.cod_ibge)
       order by m.nome`, [UF_SONDA])).rows;

console.log(`── EddyData · sondando ${alvos.length} municípios sem folha ──────────────────────`);

const pega = async (url, extra = {}) => {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, ...extra }, redirect: "follow",
      signal: AbortSignal.timeout(45000) });
    if (!r.ok && r.status !== 206) return null;
    return await r.text();
  } catch { return null; }
};

// lê `const environment = { ... }` do bundle usando Range — e alarga a janela se não achar
async function tenantDoBundle(base, arquivo) {
  const janelas = [[13800000, 14600000], [14600000, 15600000], [12800000, 13800000]];
  for (const [ini, fim] of janelas) {
    const t = await pega(`${base}/${arquivo}`, { Range: `bytes=${ini}-${fim}` });
    if (!t) continue;
    const m = t.match(/const environment\s*=\s*\{([^}]{10,400})\}/);
    if (!m) continue;
    const corpo = m[1];
    return {
      tenant: (corpo.match(/url:\s*'[^']*\/api\/v1\/([^'/]+)'/) || [])[1] || null,
      orgao: (corpo.match(/orgao:\s*'([^']*)'/) || [])[1] || null,
      cidade: Number((corpo.match(/cidade:\s*(\d+)/) || [])[1] || 1),
      versao: (corpo.match(/versao:\s*'([^']*)'/) || [])[1] || null,
    };
  }
  return null;
}

// 🚨 O host NEM SEMPRE sai do slug: São José da Bela Vista atende em `app.sjbelavista.sp.gov.br` — abreviado.
// Derivar só do nome perde justamente quem a descoberta JÁ CONHECIA (a URL estava em
// `folha_diagnostico_faltante`). É [[pnigp-cruzar-tabelas-de-descoberta]]: antes de derivar, olhar o que as
// tabelas de descoberta já guardam.
const hostsConhecidos = new Map();
for (const linha of (await q(`
  select cod_ibge, regexp_replace(url_pessoal, '^https?://([^/]+).*', '\\1') host
    from folha_diagnostico_faltante where url_pessoal ~* '^https?://app\\.'
  union
  select cod_ibge, regexp_replace(url_portal_real, '^https?://([^/]+).*', '\\1') host
    from portal_real_descoberto where url_portal_real ~* '^https?://app\\.'`)).rows) {
  if (!hostsConhecidos.has(linha.cod_ibge)) hostsConhecidos.set(linha.cod_ibge, []);
  hostsConhecidos.get(linha.cod_ibge).push(linha.host);
}

const um = async (m) => {
  const derivado = `app.${slugDe(m.municipio)}.${m.uf.toLowerCase()}.gov.br`;
  const candidatos = [...new Set([...(hostsConhecidos.get(m.cod_ibge) || []), derivado])];
  for (const host of candidatos) {
  for (const caminho of ["/transparencia/020000/", "/transparencia/"]) {
    for (const esq of ["https", "http"]) {
      const base = `${esq}://${host}${caminho}`.replace(/\/$/, "");
      const idx = await pega(`${base}/`);
      if (!idx) continue;
      if (!/Transpar[êe]ncia P[úu]blica/i.test(idx) || !/main-es\d+\.[a-f0-9]+\.js/.test(idx)) continue;
      const arquivo = (idx.match(/main-es\d+\.[a-f0-9]+\.js/) || [])[0];
      const env = await tenantDoBundle(base, arquivo);
      if (!env || !env.tenant)
        return { host, caminho, situacao: "sem_tenant", detalhe: `bundle ${arquivo}` };
      return { host, caminho, ...env, situacao: "tem_api" };
    }
  }
  }
  return { host: null, caminho: null, situacao: "sem_host" };
};

let achados = 0;
for (let i = 0; i < alvos.length; i += 6) {
  const lote = alvos.slice(i, i + 6);
  const res = await Promise.all(lote.map(um));
  for (let k = 0; k < lote.length; k++) {
    const m = lote[k], r = res[k];
    await q(`insert into eddydata_portal
      (cod_ibge, municipio, uf, host, caminho, tenant, orgao, cidade, versao, situacao, detalhe, em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
      on conflict (cod_ibge) do update set host = excluded.host, caminho = excluded.caminho,
        tenant = excluded.tenant, orgao = excluded.orgao, cidade = excluded.cidade,
        versao = excluded.versao, situacao = excluded.situacao, detalhe = excluded.detalhe, em = now()`,
      [m.cod_ibge, m.municipio, m.uf, r.host, r.caminho, r.tenant || null, r.orgao || null,
        r.cidade || null, r.versao || null, r.situacao, r.detalhe || null]);
    if (r.situacao === "tem_api") { achados++; console.log(`  ✔ ${m.municipio.padEnd(26)} ${r.host}  tenant=${r.tenant}  v${r.versao}`); }
    else if (r.situacao === "sem_tenant") console.log(`  ⚠️ ${m.municipio.padEnd(26)} ${r.host} — bundle sem environment na faixa`);
  }
  process.stderr.write(`\r    ${Math.min(i + 6, alvos.length)}/${alvos.length}`);
}
console.log(`\n\n  ${achados} portais EddyData com API`);
await db.end();
