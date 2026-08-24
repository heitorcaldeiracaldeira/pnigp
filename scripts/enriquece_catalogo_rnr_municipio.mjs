// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// enriquece_catalogo_rnr_municipio.mjs — dá NOME e MUNICÍPIO aos links do catálogo nacional de folha.
//
// ⭐ O QUE ESTAVA FALTANDO: `ingest_catalogo_rnr_cr2.mjs` já traz **699 links de folha em 27 produtos** — mas
// só consegue identificar o ente quando o IBGE aparece DENTRO da URL (`/150013102/foff/...`). São 77 de 699.
// Os outros 622 ficavam como "link de folha de alguém".
//
// ⭐ A PONTE: o mesmo app Bubble expõe mais dois tipos, e eles fecham o circuito —
//     relacao_nominal_remuneracao.modulo  →  modulo._id
//     modulo.entidadeModulo               →  entidade._id
//     entidade                            →  { nome, UF, Slug, tipoEntidade, Status }
// `tipoEntidade` diz "Prefeitura Municipal" × "Câmara Municipal" × "Consórcio", o que resolve o ESCOPO
// ([[pnigp-folha-escopo-executivo]]) sem adivinhar pelo nome. Ex.: o módulo
// `relacao-nominal-remuneracao-cm-abel-figueiredo` resolve para "Câmara Municipal de Abel Figueiredo - PA".
//
// ⚠️ São ~25 mil módulos; paginar TODOS (249 requisições de 100) sai mais barato do que buscar ~700 por id.
// O filtro `constraints=[{"key":"Slug","constraint_type":"text contains"}]` devolveu 0 — não usar.
//
// Uso: node scripts/enriquece_catalogo_rnr_municipio.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36", accept: "application/json" };
const API = "https://www.portalcr2.com.br/api/1.1/obj";

await q(`alter table folha_catalogo_rnr add column if not exists entidade_nome text`);
await q(`alter table folha_catalogo_rnr add column if not exists tipo_entidade text`);
await q(`alter table folha_catalogo_rnr add column if not exists slug_entidade text`);

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const chave = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, "");

async function tudo(tipo, rotulo) {
  const out = [];
  for (let cursor = 0; ; cursor += 100) {
    const r = await fetch(`${API}/${tipo}?limit=100&cursor=${cursor}`, { headers: UA, signal: AbortSignal.timeout(60000) });
    if (!r.ok) break;
    const j = await r.json();
    const rs = j.response?.results || [];
    out.push(...rs);
    if (out.length % 2000 < 100) process.stderr.write(`\r  ${rotulo}: ${out.length}   `);
    if (!rs.length || !(j.response?.remaining > 0)) break;
  }
  console.log(`\n  ${rotulo}: ${out.length}`);
  return out;
}

console.log("── catálogo RNR · resolvendo o ente de cada link ──────────────────────────────");
const rnr = await tudo("relacao_nominal_remuneracao", "links de folha");
const ents = await tudo("entidade", "entidades");
const porEnte = new Map(ents.map((e) => [e._id, e]));

// só os módulos referenciados pelos links interessam
const precisa = new Set(rnr.map((x) => x.modulo).filter(Boolean));
const mods = await tudo("modulo", "módulos");
const porMod = new Map(mods.filter((m) => precisa.has(m._id)).map((m) => [m._id, m]));
console.log(`  módulos úteis: ${porMod.size} de ${precisa.size} referenciados`);

// ── municípios para casar por (nome, UF) ──────────────────────────────────────────────────────────────────────
const mun = (await q(`select cod_ibge, nome, uf from municipios_br`)).rows;
const porNomeUf = new Map();
for (const m of mun) porNomeUf.set(`${chave(m.nome)}|${m.uf.toUpperCase()}`, m);

// "Prefeitura Municipal de Abaetetuba - PA (2025-2026)" → "Abaetetuba"
const soMunicipio = (nome) => String(nome || "")
  .replace(/\(.*?\)/g, "")
  .replace(/^\s*(prefeitura|c[âa]mara|c[âa]m\.?|consórcio|cons[óo]rcio|fundo|instituto|autarquia|servi[çc]o)\b[^-]*?\bde\s+/i, "")
  .replace(/^\s*(prefeitura|c[âa]mara)\s+municipal\s+/i, "")
  .replace(/\s*[-–]\s*[A-Z]{2}\s*$/i, "")
  .trim();

let resolvidos = 0, casados = 0, semMod = 0;
const atualiza = [];
for (const x of rnr) {
  const mod = porMod.get(x.modulo);
  if (!mod) { semMod++; continue; }
  const ent = porEnte.get(mod.entidadeModulo);
  if (!ent) { semMod++; continue; }
  resolvidos++;
  const nomeMun = soMunicipio(ent.nome);
  const uf = String(ent.UF || "").toUpperCase();
  const m = porNomeUf.get(`${chave(nomeMun)}|${uf}`);
  if (m) casados++;
  atualiza.push([x._id, ent.nome || null, ent.tipoEntidade || null, ent.Slug || null,
    m ? m.cod_ibge : null, m ? m.nome : nomeMun || null, uf || null]);
}
console.log(`\n  ${resolvidos} links com ente resolvido · ${casados} casados com município · ${semMod} sem módulo/entidade`);

for (let i = 0; i < atualiza.length; i += 200) {
  const p = atualiza.slice(i, i + 200);
  const c = (k) => p.map((z) => z[k]);
  await q(`update folha_catalogo_rnr t set
      entidade_nome = d.entidade_nome, tipo_entidade = d.tipo_entidade, slug_entidade = d.slug,
      cod_ibge = coalesce(t.cod_ibge, d.cod_ibge), municipio = coalesce(t.municipio, d.municipio),
      uf = coalesce(t.uf, d.uf), em = now()
    from (select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[])
            as x(id, entidade_nome, tipo_entidade, slug, cod_ibge, municipio, uf)) d
    where t.id = d.id`,
    [c(0), c(1), c(2), c(3), c(4), c(5), c(6)]);
}

const r = (await q(`select count(*)::int total,
    count(*) filter (where cod_ibge is not null)::int com_ibge,
    count(*) filter (where tipo_entidade is not null)::int com_tipo
  from folha_catalogo_rnr`)).rows[0];
console.log(`\n  ✔ catálogo: ${r.total} links · ${r.com_ibge} com município · ${r.com_tipo} com tipo de entidade`);
await db.end();
