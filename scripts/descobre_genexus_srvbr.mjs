// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_genexus_srvbr.mjs — acha a URL base do portal GeneXus e-transparência (*.srv.br) de cada município
// rotulado 'fiorilli' OU 'instar' pelo Radar. Os DOIS rótulos apontam, na prática, para o MESMO produto GeneXus
// hospedado em *.srv.br (asp.srv.br = Fiorilli/Assessor Público; gp.srv.br = a linha "v2"; etc.).
//
// Estratégia: baixa o HTML do site oficial (url_portal) e garima o link `https://{host}.srv.br/{app}/servlet/{svlt}`.
// Guarda a BASE (`https://{host}/{app}`) + o servlet-home + a versão detectada. HTTP puro (rápido); os que não
// expõem link no HTML cru ficam 'sem_link' para uma 2ª passada com render JS.
//
// Versões (detectadas pelo servlet-home do link):
//   v1: `wppessoalconsulta` / `home_portal` (Fiorilli asp) — folha COMPLETA (tem Lotação + Local de Trabalho=secretaria)
//   v2: `home_portal_v2` / `home_servidor_v2` (gp) — folha só NOME;CARGO;salários (secretaria fica em contrato_servidor_v3)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UA = "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists genexus_srvbr_portal (
  cod_ibge text primary key, municipio text, uf text, rotulo_radar text, url_portal text,
  base_url text, home_servlet text, versao text, situacao text, detalhe text, em timestamptz default now()
)`);

const alvos = (await q(`select cod_ibge, municipio, uf, erp rotulo, url_portal from radar_portal
  where erp in ('fiorilli','instar') and unidade_gestora ilike 'Prefeitura%' and url_portal is not null and url_portal <> '-'
  ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by uf, municipio`, SO ? [SO] : [])).rows;

const feitos = new Set((await q(`select cod_ibge from genexus_srvbr_portal where situacao in ('ok','sem_link')`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[descobre_srvbr] ${alvos.length} municípios (fiorilli+instar) · ${fila.length} na fila`);

const normUrl = (u) => { u = (u || "").trim(); if (!u) return null; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return u; };

// garima o link do portal GeneXus *.srv.br: https://{host}.srv.br/{app}/servlet/{servlet}
function achaSrvbr(html) {
  const m = html.match(/https?:\/\/([a-z0-9.-]+\.srv\.br)\/([a-z0-9._-]+)\/servlet\/([a-z0-9._]+)/i);
  if (!m) return null;
  const [, host, app, servlet] = m;
  const versao = /_v2|_v3/i.test(servlet) || /home_portal_v2|home_servidor/i.test(html) ? "v2" : "v1";
  return { base: `https://${host}/${app}`, servlet: servlet.replace(/[?].*$/, ""), versao };
}

async function baixa(url) {
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(25000) });
      if (r.ok) return await r.text();
      return null;
    } catch { await dorme(1500 * (t + 1)); }
  }
  return null;
}

let ok = 0, sem = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, base = null, servlet = null, versao = null, detalhe = null) =>
    q(`insert into genexus_srvbr_portal (cod_ibge,municipio,uf,rotulo_radar,url_portal,base_url,home_servlet,versao,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) on conflict (cod_ibge) do update set
       base_url=excluded.base_url, home_servlet=excluded.home_servlet, versao=excluded.versao,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.rotulo, a.url_portal, base, servlet, versao, situacao, detalhe]);
  try {
    const html = await baixa(normUrl(a.url_portal));
    if (!html) { await marca("erro_site", null, null, null, "site fora do ar"); falhas++; continue; }
    const f = achaSrvbr(html);
    if (f) { await marca("ok", f.base, f.servlet, f.versao); ok++; console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio} (${a.rotulo}) -> ${f.versao}: ${f.base}`); }
    else { await marca("sem_link"); sem++; }
  } catch (e) { falhas++; await marca("erro", null, null, null, String(e.message).slice(0, 120)); }
  if (i % 20 === 19) await dorme(400);
}
console.log(`\n[descobre_srvbr] ${ok} com URL srv.br · ${sem} sem link · ${falhas} falhas`);
const resumo = await q(`select versao, count(*) n from genexus_srvbr_portal where situacao='ok' group by versao order by n desc`);
console.log("por versão:", resumo.rows.map((r) => (r.versao || "?") + "=" + r.n).join(" "));
await db.end();
