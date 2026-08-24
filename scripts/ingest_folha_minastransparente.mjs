// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_minastransparente.mjs — portal "MinasTransparente" (Next.js + Firebase), com API JSON aberta.
//
// ⭐ Achado em 18/ago/2026 em Datas/MG. É dos contratos mais limpos que já encontrei: sem sessão, sem captcha,
// sem POST, e com CATÁLOGO ENUMERÁVEL — o mesmo padrão do CR2 Bubble ([[pnigp-catalogo-rnr-cr2-bubble]]).
//
//   GET https://minastransparente.com.br/api/municipios   → catálogo de TODAS as entidades (slug, estado, site)
//   GET {site}/api/servidores                             → a folha inteira, um objeto por servidor
//   GET {site}/api/municipio-atual                        → nome/CNPJ/estado, serve de guarda de identidade
//
// Campos por servidor: nome · matricula · cargo · lotacao · competencia ("2026-07") · dataAdmissao · cargaHoraria
//                      remuneracaoBase · remuneracaoBruta · remuneracaoLiquida · verbasIndenizatorias · tipo
//
// 🚨 O catálogo mistura PREFEITURA, CÂMARA e CONSÓRCIO. Câmara é outro poder e consórcio não é município —
// entram só as entidades municipais executivas ([[pnigp-entidade-espelho-infla-folha]]).
// 🚨 O produto é NOVO (maio/2026) e pequeno: 3 portais ativos. O coletor já fica pronto para quando crescer.
//
// Uso: node scripts/ingest_folha_minastransparente.mjs        · SO=<município>
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", accept: "application/json" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists folha_servidores_minastransp (
  cod_ibge text, municipio text, uf text, competencia text,
  matricula text, nome text, cargo text, lotacao text, tipo text, admissao text, carga_horaria text,
  salario_base numeric, bruto numeric, liquido numeric, verbas_indenizatorias numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_mtransp_mun on folha_servidores_minastransp (cod_ibge, competencia)`);
await q(`create table if not exists folha_minastransp_coleta (
  cod_ibge text primary key, municipio text, uf text, slug text, site text, competencia text,
  servidores int, com_valor int, situacao text, detalhe text, em timestamptz default now()
)`);

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
// "2026-07" → "202607", o padrão das demais tabelas ([[pnigp-competencia-invariante-verificador]])
const compNorm = (v) => {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})$/);
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}${m[2]}` : null;
};
async function api(url) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (r.ok) return await r.json();
    } catch { await new Promise((s) => setTimeout(s, 2500 * (t + 1))); }
  }
  return null;
}

const catalogo = await api("https://minastransparente.com.br/api/municipios");
if (!catalogo?.length) { console.log("✖ catálogo não respondeu"); await db.end(); process.exit(1); }
// só executivo municipal com portal no ar
const RE_FORA = /c[âa]mara|consorcio|cons[óo]rcio|\bcim\b|demonstra/i;
const alvos = catalogo.filter((e) => e.portalAtivo && e.siteOriginal && !RE_FORA.test(`${e.slug} ${e.nome || ""}`));
console.log(`[minastransp] ${catalogo.length} entidades no catálogo · ${alvos.length} executivos com portal ativo`);

let totalGeral = 0;
for (const e of alvos) {
  const nomeLimpo = String(e.nome || e.slug).replace(/^(munic[íi]pio|prefeitura)\s+(de\s+|do\s+|da\s+)?/i, "").trim();
  if (SO && !nomeLimpo.toLowerCase().includes(SO.toLowerCase())) continue;
  // 🚨 o código IBGE vem do CADASTRO, e o catálogo traz `ibge` vazio ([[pnigp-nunca-digitar-codigo-ibge]])
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br
    where uf = $1 and regexp_replace(lower(unaccent(nome)),'[^a-z0-9]','','g') = $2 limit 1`,
    [e.estado, so(nomeLimpo)])).rows[0];
  if (!mun) { console.log(`   ? ${nomeLimpo}/${e.estado}: não bate com municipios_br`); continue; }

  // 🚨 O `siteOriginal` DO CATÁLOGO PODE NÃO RESPONDER: `municipio-de-datas.minastransparente.com.br` fecha
  // `fetch failed`, enquanto o domínio PRÓPRIO do município (`www.datas.mg.gov.br`) serve a mesma API. O portal
  // é o mesmo produto em dois endereços, e só um está de pé ([[pnigp-modulo-vs-host-fornecedor]]).
  const sMun = so(mun.nome), ufMun = mun.uf.toLowerCase();
  const bases = [...new Set([
    e.siteOriginal.replace(/\/+$/, ""),
    `https://www.${sMun}.${ufMun}.gov.br`, `https://${sMun}.${ufMun}.gov.br`,
  ])];
  let site = null, linhas = null;
  for (const b of bases) {
    const r = await api(`${b}/api/servidores`);
    if (Array.isArray(r) && r.length) { site = b; linhas = r; break; }
    if (!site && r) site = b;   // respondeu, mas vazio — guarda para o registro
  }
  site = site || bases[0];
  if (!Array.isArray(linhas) || !linhas.length) {
    await q(`insert into folha_minastransp_coleta (cod_ibge,municipio,uf,slug,site,servidores,com_valor,situacao,detalhe,em)
      values ($1,$2,$3,$4,$5,0,0,'vazio','/api/servidores respondeu sem linhas',now())
      on conflict (cod_ibge) do update set situacao='vazio', detalhe=excluded.detalhe, em=now()`,
      [mun.cod_ibge, mun.nome, mun.uf, e.slug, site]);
    console.log(`   · ${mun.nome}: sem linhas`);
    continue;
  }
  // competência mais cheia entre as que vierem ([[pnigp-competencia-mais-cheia-nao-a-recente]])
  const porComp = new Map();
  for (const s of linhas) {
    const c = compNorm(s.competencia);
    if (!c) continue;
    porComp.set(c, (porComp.get(c) || 0) + 1);
  }
  const competencia = [...porComp.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0];
  const doMes = linhas.filter((s) => compNorm(s.competencia) === competencia);

  let n = 0, comValor = 0;
  for (const s of doMes) {
    const bruto = num(s.remuneracaoBruta);
    const _hash = crypto.createHash("sha1")
      .update([mun.cod_ibge, competencia, s.id ?? "", s.matricula ?? "", s.nome ?? ""].join("|")).digest("hex");
    await q(`insert into folha_servidores_minastransp
      (cod_ibge, municipio, uf, competencia, matricula, nome, cargo, lotacao, tipo, admissao, carga_horaria,
       salario_base, bruto, liquido, verbas_indenizatorias, _hash)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido,
        salario_base=excluded.salario_base, _coletado_em=now()`,
      [mun.cod_ibge, mun.nome, mun.uf, competencia, String(s.matricula ?? ""), s.nome, s.cargo, s.lotacao,
       s.tipo, s.dataAdmissao ? String(s.dataAdmissao).slice(0, 10) : null, String(s.cargaHoraria ?? ""),
       num(s.remuneracaoBase), bruto, num(s.remuneracaoLiquida), num(s.verbasIndenizatorias), _hash]);
    n++; if (bruto > 0) comValor++;
  }
  totalGeral += n;
  console.log(`  ⭐ ${mun.nome.padEnd(24)} ${n} servidores · ${comValor} com valor · ${competencia}`
    + ` (competências no payload: ${[...porComp.keys()].join(",")})`);
  await q(`insert into folha_minastransp_coleta
    (cod_ibge, municipio, uf, slug, site, competencia, servidores, com_valor, situacao, detalhe, em)
    values ($1,$2,$3,$4,$5,$6,$7,$8,'ok',$9,now())
    on conflict (cod_ibge) do update set competencia=excluded.competencia, servidores=excluded.servidores,
      com_valor=excluded.com_valor, situacao='ok', detalhe=excluded.detalhe, em=now()`,
    [mun.cod_ibge, mun.nome, mun.uf, e.slug, site, competencia, n, comValor,
     `API /api/servidores; competências no payload: ${[...porComp.keys()].join(",")}`]);
}
console.log(`\n[minastransp] ${totalGeral} servidores`);
await db.end();
