// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// cadastra_elotech_hosts.mjs — prova, host a host, quem responde a API Elotech e grava em `elotech_portal`.
//
// 🚨 O PROBLEMA QUE ISTO RESOLVE: em RO, sete municípios estavam com o ledger do Elotech em `vazio`
// ("sem servidores em 2026/2025/2024") e a API responde perfeitamente — Vilhena tem 3.346 servidores lá.
// O defeito nunca foi a coleta: era a **descoberta de host**. O coletor deriva o slug de `radar_portal`
// (padrão `{slug}.eloweb.net`), e esses municípios são da geração **Oxy** (`{slug}.oxy.elotech.com.br`) ou
// publicam no próprio domínio (`transparencia.{slug}.ro.gov.br`). Slug derivado aponta para host que não
// existe → resposta vazia → "não publica". ⚠️ `vazio` num ledger merece sempre a pergunta "vazio de quê:
// da fonte ou do meu endereço?" ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
//
// A prova aqui é a mesma da campanha inteira: `/entidades/lista` tem de devolver ENTIDADES, não 200.
//
// Uso: UF=RO node scripts/cadastra_elotech_hosts.mjs   ·   CONC=8
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";
import { SG_UF as UF } from "./_uf.mjs";

setGlobalDispatcher(new Agent({ connect: { timeout: 20000, rejectUnauthorized: false, family: 4 },
  headersTimeout: 45000, bodyTimeout: 120000 }));

const db = pool(); const q = withRetry(db);
const CONC = Number(process.env.CONC || 8);
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "application/json" };

await q(`create table if not exists elotech_portal (
  cod_ibge text primary key, municipio text, uf text, slug text, host text, entidades int,
  achado_em timestamptz default now())`);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (ok) partes.push(`select distinct left(cod_ibge::text,7) c from ${t}`);
}
const alvos = (await q(`
  with col as (${partes.join(" union ")})
  select m.cod_ibge, m.nome municipio, m.uf,
         (select array_agg(distinct split_part(split_part(split_part(l,'|',2),'//',2),'/',1))
            from site_municipal_links s cross join lateral jsonb_array_elements_text(s.links) l
           where s.cod_ibge=m.cod_ibge and split_part(l,'|',2) ~ '^https?://') hosts
    from municipios_br m left join col c on c.c=m.cod_ibge
   where m.uf=$1 and c.c is null order by m.nome`, [UF])).rows;
console.log(`[elotech-hosts/${UF}] ${alvos.length} municípios a testar`);

const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function testa(h) {
  for (const esq of ["https", "http"]) {
    try {
      const r = await fetch(`${esq}://${h}/portaltransparencia-api/api/entidades/lista?fields=id,nome,tipo`,
        { headers: { ...H, entidade: "1", exercicio: String(new Date().getUTCFullYear()) },
          redirect: "follow", signal: AbortSignal.timeout(45000) });
      if (r.status >= 400) continue;
      const j = await r.json().catch(() => null);
      const arr = Array.isArray(j) ? j : (j?.content || []);
      // ⚠️ a prova é a ENTIDADE, não o 200
      if (arr.length && arr[0]?.nome) return { host: h, entidades: arr.length };
    } catch { /* próximo esquema */ }
  }
  return null;
}

let i = 0, achados = 0;
async function trab() {
  while (i < alvos.length) {
    const a = alvos[i++];
    const s = slug(a.municipio);
    const cand = [...new Set([...(a.hosts || []).filter(Boolean),
      `${s}.oxy.elotech.com.br`, `transparencia.${s}.${UF.toLowerCase()}.gov.br`, `${s}.eloweb.net`])]
      .filter((h) => h && !h.includes(" ") && !/atricon|gov\.br\/pt-br|\.leg\.br/i.test(h));
    for (const h of cand) {
      const r = await testa(h);
      if (!r) continue;
      achados++;
      await q(`insert into elotech_portal (cod_ibge,municipio,uf,slug,host,entidades,achado_em)
        values ($1,$2,$3,$4,$5,$6,now()) on conflict (cod_ibge) do update set
        slug=excluded.slug, host=excluded.host, entidades=excluded.entidades, achado_em=now()`,
        [a.cod_ibge, a.municipio, a.uf, s, r.host, r.entidades]);
      console.log(`  ✔ ${a.municipio}: ${r.entidades} entidades · ${r.host}`);
      break;
    }
  }
}
await Promise.all(Array.from({ length: CONC }, trab));
console.log(`\n[elotech-hosts/${UF}] ${achados} municípios com API Elotech provada`);
console.table((await q(`select municipio, host, entidades from elotech_portal where uf=$1 order by municipio`, [UF])).rows);
await db.end();
