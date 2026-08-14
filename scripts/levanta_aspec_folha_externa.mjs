// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// levanta_aspec_folha_externa.mjs — para cada município ASPEC, segue o link EXTERNO do card "Folha de Pagamento"
// (que aponta para a página própria da prefeitura) e identifica o ERP real da folha. Diz quantos caem em ERP que
// JÁ leio nominalmente (salário/cargo), vs. ERP desconhecido / página avulsa (só PDF, sem folha nominal).
//
// 2 saltos: (1) portal governotransparente `/{acessoinfoId}` → href externo do card Folha (contém "folha");
//           (2) essa página → assinatura do ERP; se nada, segue 1 link de transparência e tenta de novo.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool(); const q = withRetry(db);
const BASE = "https://www.governotransparente.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

// ERPs que JÁ tenho coletor NOMINAL (salário; e em geral cargo/secretaria)
const LEIO_NOMINAL = new Set(["betha", "ipm", "smarapd", "publicsoft", "rpm", "layout", "fiorilli", "megasoft", "nucleogov", "govbr", "portaltp", "elotech", "cr2", "epublica"]);
// memory = nominal SEM salário (4/5 campos) → parcial

const FORN = [
  { erp: "betha",    re: /transparencia\.betha\.cloud|betha\.cloud|betha sistemas/i },
  { erp: "ipm",      re: /\.atende\.net|ipm sistemas/i },
  { erp: "portaltp", re: /\.portaltp\.com\.br|portaltp/i },
  { erp: "epublica", re: /e-publica\.net|e-p[úu]blica/i },
  { erp: "smarapd",  re: /\.smarapd\.com\.br|smarapd/i },
  { erp: "elotech",  re: /\.elotech\.com\.br|elotech/i },
  { erp: "fiorilli", re: /\.fiorilli\.com\.br|dcfiorilli|scpi/i },
  { erp: "memory",   re: /\.memory\.com\.br|ilai\.memory/i },
  { erp: "instar",   re: /\.instarmob\.com\.br|instar\.com\.br|\binstar\b/i },
  { erp: "equiplano",re: /\.equiplano|equiplano/i },
  { erp: "publicsoft",re: /publicsoft\.com\.br|elmartecnologia\.com\.br|elmar tecnologia/i },
  { erp: "govbr",    re: /\.cidade360\.cloud|\.govbr\.cloud|\/pronimtb\/|governan[çc]a\s*brasil|pronim/i },
  { erp: "rpm",      re: /rpmsolucoes\.com\.br|rpm solu[çc]/i },
  { erp: "cr2",      re: /\.cr2transparencia\.com\.br|cr2transparencia/i },
  { erp: "megasoft", re: /megasoft(transparencia|arrecadanet|servicos)?\.com\.br|grupomegas/i },
  { erp: "nucleogov",re: /nucleogov\.com\.br/i },
  { erp: "portabilis",re:/\.portabilis\.com\.br|ieducar/i },
  { erp: "prodata",  re: /\.prodataweb\.inf\.br|prodata/i },
  { erp: "abaco",    re: /\.abaco\.com\.br|abaco\.pa\.gov/i },
  { erp: "siplan",   re: /siplan|\.siplanltda/i },
  { erp: "tributos", re: /tributosmunicipais|tributos\.inf/i },
  { erp: "publica",  re: /publica-ro\.com\.br|publicacloud/i },
  { erp: "sishop",   re: /sishop|shopsystem/i },
  { erp: "gdic",     re: /gdic\.com\.br/i },
  { erp: "aspec",    re: /governotransparente\.com\.br|aspec inform/i },
];
function ident(html) {
  for (const f of FORN) if (f.re.test(html)) return f.erp;
  return null;
}
async function baixa(url, tent = 2) {
  for (let t = 0; t < tent; t++) {
    try { const r = await fetch(url, { headers: { "user-agent": UA, referer: BASE + "/" }, redirect: "follow", signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.text(); if (r.status >= 500 || r.status === 403) { await dorme(1200); continue; } return null;
    } catch { await dorme(1200); }
  }
  return null;
}
// extrai o href externo do card "Folha de Pagamento"
function achaFolhaLink(html) {
  // 1) âncora cujo texto contém "folha ... pagamento"
  for (const m of html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const txt = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (/folha\s*de\s*pagamento|folha de pessoal/i.test(txt) && /^https?:\/\//i.test(m[1]) && !/governotransparente|gdic\.com/i.test(m[1])) return m[1];
  }
  // 2) href externo cuja URL contém "folha"
  const m2 = [...html.matchAll(/href=["'](https?:\/\/[^"']*folha[^"']*)["']/gi)].map((m) => m[1]).find((u) => !/governotransparente/i.test(u));
  return m2 || null;
}
function linkTransp(html) {
  const m = [...html.matchAll(/href=["'](https?:\/\/[^"']*(?:transpar|portal|servidor|pessoal|rh)[^"']*)["']/gi)].map((x) => x[1]).find((u) => !/governotransparente|gdic|fonts\.|\.pdf/i.test(u));
  return m || null;
}

await q(`create table if not exists aspec_folha_externa (
  cod_ibge text primary key, municipio text, uf text, acessoinfo_id text,
  folha_url text, erp text, leio_nominal boolean, em timestamptz default now()
)`);

const alvos = (await q(`select cod_ibge, municipio, uf, acessoinfo_id from folha_aspec_coleta
  where acessoinfo_id is not null order by uf, municipio`)).rows;
console.log(`[levanta] ${alvos.length} municípios ASPEC com id`);

const CONC = 6;
let n = 0;
for (let i = 0; i < alvos.length; i += CONC) {
  const bloco = alvos.slice(i, i + CONC);
  await Promise.all(bloco.map(async (a) => {
    let erp = null, folhaUrl = null;
    try {
      const portal = await baixa(`${BASE}/${a.acessoinfo_id}`);
      if (portal) {
        folhaUrl = achaFolhaLink(portal);
        if (folhaUrl) {
          const pg = await baixa(folhaUrl);
          if (pg) {
            erp = ident(pg);
            if (!erp) { const l2 = linkTransp(pg); if (l2 && l2 !== folhaUrl) { const p2 = await baixa(l2); if (p2) erp = ident(p2); } }
          }
        }
      }
    } catch {}
    const leio = erp ? LEIO_NOMINAL.has(erp) : false;
    await q(`insert into aspec_folha_externa (cod_ibge,municipio,uf,acessoinfo_id,folha_url,erp,leio_nominal,em)
      values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set
      folha_url=excluded.folha_url, erp=excluded.erp, leio_nominal=excluded.leio_nominal, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.acessoinfo_id, folhaUrl, erp, leio]);
    n++;
  }));
  process.stdout.write(`   ${n}/${alvos.length}\r`);
}
console.log(`\n[levanta] ${n} checados`);

console.log("\n═══ ERP da folha externa dos municípios ASPEC ═══");
console.table((await q(`select coalesce(erp,'(sem link/erp)') erp,
  bool_or(leio_nominal) leio_nominal, count(*) municipios
  from aspec_folha_externa group by 1 order by 3 desc`)).rows);
console.log("\n>>> RESUMO: quantos caem em ERP que já leio nominalmente");
console.table((await q(`select
  case when leio_nominal then 'JÁ LEIO (nominal)' when erp is null then 'sem ERP identificado' else 'ERP não lido: '||erp end grupo,
  count(*) municipios
  from aspec_folha_externa group by 1 order by 2 desc`)).rows);
await db.end();
