// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_admrh.mjs — procura o portal ADMRH (`/rhsysportaltransp/`) em TODOS os municípios ainda sem folha.
//
// ⭐ POR QUE VALE: o GRP/Thema não serve folha própria — ele CONSOME uma integração "ADMRH"
// ([[pnigp-thema-grp-folha-dead-end]]). Onde o município tem o ADMRH instalado, ele costuma expor o portal
// dele à parte, em host próprio — foi assim que apareceram Rio Grande, Lajeado, Taquara e São Francisco de
// Paula ([[pnigp-admrh-e-pelotas-csv]]). Ou seja: o 500 do GRP é PISTA de que o produto existe, não um fim.
//
// A prova de vida é a API de competências, que responde JSON sem sessão:
//   GET {host}/rhsysportaltransp/api/lov/referencia?busca=&page=1  → {dados:[…]}
// (a de servidores exige sessão — HTTP 440 — mas essa não.)
//
// Hosts testados por município: os que já estão na base (diagnóstico e portais) MAIS os derivados do slug.
// Uso: UF=RS node scripts/varre_admrh.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const CONC = Number(process.env.CONC || 8);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const CAMINHOS = ["/rhsysportaltransp", "/rhsysweb", "/portaltransp", "/rhsys"];

const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists folha_admrh_portal (
  cod_ibge text primary key, municipio text, uf text, host text, caminho text, url text,
  competencias int, achado_em timestamptz default now()
)`);

// municípios da UF sem nenhuma folha coletada
const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  // 🚨 `cod_ibge is not null` NÃO é zelo: um único NULL na lista faz o `not in` devolver ZERO linhas — a
  // varredura dizia "0 municípios sem folha" com 139 faltando.
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select m.cod_ibge, m.nome, m.uf from municipios_br m
  where m.uf=$1 and left(m.cod_ibge,6) not in (${partes.join(" union ")})
  order by m.nome`, [UF])).rows;
console.log(`[admrh] ${muns.length} municípios ${UF} sem folha`);

// hosts que já conhecemos de cada um (diagnóstico + portais descobertos)
const conhecidos = new Map();
const addHost = (ibge, u) => {
  if (!u) return;
  const m = String(u).match(/^(?:https?:\/\/)?([^/?#]+)/);
  if (!m) return;
  const h = m[1].replace(/:\d+$/, "");
  if (!/\./.test(h)) return;
  if (!conhecidos.has(ibge)) conhecidos.set(ibge, new Set());
  conhecidos.get(ibge).add(h);
};
for (const r of (await q(`select cod_ibge, url_visitada, url_pessoal from folha_diagnostico_faltante`).catch(() => ({ rows: [] }))).rows) {
  addHost(r.cod_ibge, r.url_visitada); addHost(r.cod_ibge, r.url_pessoal);
}
for (const r of (await q(`select cod_ibge, url from erp_portal_municipal`).catch(() => ({ rows: [] }))).rows) addHost(r.cod_ibge, r.url);

async function testa(host, caminho) {
  for (const esq of ["https", "http"]) {
    try {
      const r = await fetch(`${esq}://${host}${caminho}/api/lov/referencia?busca=&page=1`,
        { headers: UA, redirect: "follow", signal: AbortSignal.timeout(9000) });
      if (!r.ok) continue;
      const t = await r.text();
      if (!/^\s*[[{]/.test(t)) continue;
      const js = JSON.parse(t);
      const dados = js.dados || js.data || (Array.isArray(js) ? js : null);
      if (Array.isArray(dados) && dados.length) return { url: `${esq}://${host}${caminho}/`, n: dados.length };
    } catch { /* próximo */ }
  }
  return null;
}

let achados = 0, i = 0;
for (let k = 0; k < muns.length; k += CONC) {
  const bloco = muns.slice(k, k + CONC);
  await Promise.all(bloco.map(async (m) => {
    const s = so(m.nome);
    const hosts = new Set([...(conhecidos.get(m.cod_ibge) || [])]);
    // 🚨 `transparenciarh.` (sem ponto entre "transparencia" e "rh") NÃO estava nos moldes — e é justamente o host
    // de Venâncio Aires. Um prefixo a menos na lista some com um município inteiro que já tinha coletor pronto.
    for (const h of [`transparencia.${s}.rs.gov.br`, `transparenciarh.${s}.rs.gov.br`, `transparencia-rh.${s}.rs.gov.br`,
                     `grp.${s}.rs.gov.br`, `rh.${s}.rs.gov.br`, `rhsys.${s}.rs.gov.br`,
                     `servidor.${s}.rs.gov.br`, `portal.${s}.rs.gov.br`, `www.${s}.rs.gov.br`]) hosts.add(h);
    for (const h of hosts) {
      for (const c of CAMINHOS) {
        const r = await testa(h, c);
        if (!r) continue;
        achados++;
        console.log(`⭐ ${m.nome.padEnd(28)} → ${r.url}  (${r.n} competências)`);
        await q(`insert into folha_admrh_portal (cod_ibge, municipio, uf, host, caminho, url, competencias)
          values ($1,$2,$3,$4,$5,$6,$7) on conflict (cod_ibge) do update set url=excluded.url, achado_em=now()`,
          [m.cod_ibge, m.nome, m.uf, h, c, r.url, r.n]);
        return;
      }
    }
  }));
  i += bloco.length;
  process.stdout.write(`   ${i}/${muns.length} testados · ${achados} achados\r`);
}
console.log(`\n[admrh] ${achados} portais ADMRH achados`);
await db.end();
