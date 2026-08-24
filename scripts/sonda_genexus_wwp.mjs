// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// sonda_genexus_wwp.mjs — mede o tamanho do bloco GeneXus WorkWithPlus auto-hospedado em SP.
//
// ⭐ Achado em 18/ago/2026 ao classificar os 42 municípios de SP "com dados" e sem produto identificado:
// oito deles caíam em `transparencia.{slug}.sp.gov.br/home`, e a página carrega `/DVelop/...` e
// `WorkWithPlusDS.css` — é **GeneXus WorkWithPlus**, primo do `etransparencia` do `s2.asp.srv.br`
// ([[pnigp-genexus-srvbr-scraper]]) mas com OUTRO dialeto: a folha mora em `/filtros-recursoshumanos`
// e os filtros (`vORGANOGRAMA`, `vFUNCAO`, `vVINCULO`, `vMES`) prometem os cinco campos.
//
// A lição do bsit vale aqui ([[pnigp-bsit-gestao-publica-folha]]): sondar o host derivado em TODO município
// da UF sem folha, não só nos que a descoberta apontou — o alcance do produto é maior do que a descoberta viu.
// Quem não tem também é informação: separa "não tem o produto" de "não sondei".
//
// Uso: node scripts/sonda_genexus_wwp.mjs   ·  UF_SONDA=35 (padrão SP)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF_SONDA = process.env.UF_SONDA || "35";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
// 🚨 O cabeçalho do portal vem com ENTIDADE NUMÉRICA ("PREFEITURA MUNICIPAL DE PRAT&#194;NIA"). Comparar o
// slug sem decodificar reprova a identidade de quem está certo: 14 municípios de SP saíram como
// "identidade_nao_confere" — Tatuí, Pratânia, Ribeirão Branco, São Manuel… todos legítimos. O conferidor de
// identidade errar para o lado do FALSO NEGATIVO é o modo seguro, mas ainda é erro: esconde alvo bom.
const desEntidade = (s) => String(s ?? "")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
const slugDe = (s) => semAcento(desEntidade(s)).toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists genexus_wwp_portal (
  cod_ibge text primary key, municipio text, uf text, host text, url_rh text,
  situacao text, detalhe text, em timestamptz default now())`);

// REFAZ=<situacao> re-sonda só quem ficou naquele estado (usado para reavaliar os falsos negativos
// de identidade sem repetir as 357 sondagens).
const alvos = process.env.REFAZ
  ? (await q(`select cod_ibge, municipio, uf from genexus_wwp_portal where situacao = $1 order by municipio`,
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

console.log(`── GeneXus WorkWithPlus · sondando ${alvos.length} municípios sem folha ──────────────`);

const pega = async (url) => {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow",
      signal: AbortSignal.timeout(25000) });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
};

const um = async (m) => {
  const slug = slugDe(m.municipio);
  const uf = m.uf.toLowerCase();
  for (const host of [`transparencia.${slug}.${uf}.gov.br`, `app.${slug}.${uf}.gov.br`]) {
    for (const esq of ["https", "http"]) {
      const t = await pega(`${esq}://${host}/home`);
      if (!t) continue;
      // assinatura do produto: o bundle do WorkWithPlus / DVelop
      if (!/WorkWithPlusDS|\/DVelop\//i.test(t)) continue;
      // ⚠️ confirmar a IDENTIDADE: hosts derivados de slug respondem 200 com casca de outro município
      // ([[pnigp-fila-erp-homonimo-contamina-uf]]). O cabeçalho traz o nome da prefeitura.
      const cab = (t.match(/PREFEITURA[^<]{0,80}|MUNIC[ÍI]PIO DE[^<]{0,60}/i) || [])[0] || "";
      const bate = slugDe(cab).includes(slug.slice(0, Math.max(5, Math.floor(slug.length * 0.7))));
      const temRH = /recursoshumanos|Recursos Humanos/i.test(t);
      return { host, url_rh: `${esq}://${host}/filtros-recursoshumanos`,
        situacao: !bate ? "identidade_nao_confere" : temRH ? "tem_rh" : "sem_item_rh",
        detalhe: cab.replace(/\s+/g, " ").trim().slice(0, 90) || null };
    }
  }
  return { host: null, url_rh: null, situacao: "sem_host", detalhe: null };
};

let achados = 0, comRH = 0;
for (let i = 0; i < alvos.length; i += 8) {
  const lote = alvos.slice(i, i + 8);
  const res = await Promise.all(lote.map(um));
  for (let k = 0; k < lote.length; k++) {
    const m = lote[k], r = res[k];
    await q(`insert into genexus_wwp_portal (cod_ibge, municipio, uf, host, url_rh, situacao, detalhe, em)
             values ($1,$2,$3,$4,$5,$6,$7, now())
             on conflict (cod_ibge) do update set host = excluded.host, url_rh = excluded.url_rh,
               situacao = excluded.situacao, detalhe = excluded.detalhe, em = now()`,
      [m.cod_ibge, m.municipio, m.uf, r.host, r.url_rh, r.situacao, r.detalhe]);
    if (r.host) achados++;
    if (r.situacao === "tem_rh") { comRH++; console.log(`  ✔ ${m.municipio.padEnd(28)} ${r.host}`); }
    else if (r.situacao === "identidade_nao_confere") console.log(`  ⚠️ ${m.municipio.padEnd(28)} ${r.host} → ${r.detalhe}`);
  }
  process.stderr.write(`\r    ${Math.min(i + 8, alvos.length)}/${alvos.length}`);
}
console.log(`\n\n  ${achados} hosts GeneXus WWP · ${comRH} com item de Recursos Humanos`);
await db.end();
