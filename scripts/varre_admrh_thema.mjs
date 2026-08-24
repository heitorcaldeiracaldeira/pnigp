// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_admrh_thema.mjs — procura o ADMRH hospedado na NUVEM DA THEMA nos municípios sem folha.
//
// ⭐ Descoberto em 17/ago/2026 em Santo Antônio da Patrulha: o portal fica em
//   `admrh.pmsap.thema.cloud:9090/rhsysportaltransp/`  → 2.063 servidores, coletado = declarado.
// O host não deriva do slug do município: usa a SIGLA da prefeitura (`pmsap`) num domínio do fornecedor
// (`thema.cloud`) e porta alta. Nenhuma varredura por `{slug}.rs.gov.br` acharia isso — o caminho foi o link
// "Consulta Servidores" no portal ANTIGO do município ([[pnigp-descobre-portal-pelo-site-oficial]]).
//
// 🚨 Vale notar: a Thema é a mesma do GRP que NÃO publica folha ([[pnigp-thema-grp-folha-dead-end]]) — mas o
// ADMRH dela publica. Fornecedor sem folha num produto pode ter folha em outro.
//
// Uso: UF=RS node scripts/varre_admrh_thema.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const CONC = Number(process.env.CONC || 6);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
// sigla no estilo "pmsap": pm + iniciais das palavras significativas
const sigla = (nome) => "pm" + String(nome).normalize("NFD").replace(/[̀-ͯ]/g, "")
  .split(/\s+/).filter((w) => !/^(de|da|do|das|dos|e)$/i.test(w)).map((w) => w[0]).join("").toLowerCase();

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")}) order by nome`, [UF])).rows;
console.log(`[admrh-thema] ${muns.length} municípios ${UF} sem folha`);

async function prova(host) {
  for (const esq of ["http", "https"]) {
    try {
      const r = await fetch(`${esq}://${host}/rhsysportaltransp/api/lov/referencia?busca=&page=1`,
        { headers: UA, redirect: "follow", signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const t = await r.text();
      if (!/^\s*[[{]/.test(t)) continue;
      const j = JSON.parse(t);
      const dados = j.dados || j.data || (Array.isArray(j) ? j : null);
      if (Array.isArray(dados) && dados.length) return { esq, n: dados.length };
    } catch { /* próximo */ }
  }
  return null;
}

let achados = 0, i = 0;
for (let k = 0; k < muns.length; k += CONC) {
  await Promise.all(muns.slice(k, k + CONC).map(async (m) => {
    const s = so(m.nome), sg = sigla(m.nome);
    const hosts = [];
    for (const base of [sg, `pm${s}`, s]) for (const porta of [":9090", "", ":8080", ":9091"])
      hosts.push(`admrh.${base}.thema.cloud${porta}`);
    for (const h of hosts) {
      const p = await prova(h);
      if (!p) continue;
      achados++;
      console.log(`⭐ ${m.nome.padEnd(26)} → ${p.esq}://${h}  (${p.n} competências)`);
      await q(`insert into folha_admrh_portal (cod_ibge, municipio, uf, host, caminho, url, competencias)
        values ($1,$2,$3,$4,'/rhsysportaltransp',$5,$6)
        on conflict (cod_ibge) do update set host=excluded.host, url=excluded.url, achado_em=now()`,
        [m.cod_ibge, m.nome, m.uf, h, `${p.esq}://${h}/rhsysportaltransp/`, p.n]);
      return;
    }
  }));
  i += Math.min(CONC, muns.length - k);
  process.stdout.write(`   ${i}/${muns.length} · ${achados} achados\r`);
}
console.log(`\n[admrh-thema] ${achados} portais achados`);
await db.end();
