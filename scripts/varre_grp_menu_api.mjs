// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_grp_menu_api.mjs — lê o MENU do portal GRP/Thema pela API JSON e extrai dali o link real da folha.
//
// ⭐⭐ Achado em 17/ago/2026 destravando CAXIAS DO SUL, o maior faltante do RS (8.118 servidores). O portal GRP é
// uma SPA: a tela `#/remuneracoes` cai na home e nada aparece no HTML. Mas o menu inteiro vem de uma API pública:
//
//   GET {host}/infra/apigw/transparencia/service/portal/conteudo/transparencia/menu?categoria=NNNN
//       → 70 itens com `tituloMenu` e o LINK EXTERNO de cada um
//
// Em Caxias, o item "Relação de Servidores" aponta para
// `portaltransparencia.caxias.rs.gov.br/rhsysportaltransp/#!/consulta/relacao_servidores` — ADMRH, que eu já sei
// coletar. Ou seja: **o GRP não publica a folha, ele LINKA para o ADMRH** — e eu vinha testando os endpoints do
// próprio GRP e concluindo "integração desligada" ([[pnigp-thema-grp-folha-dead-end]] estava certo sobre o GRP e
// errado sobre o município).
//
// 🚨 O host do ADMRH não deriva do slug: Caxias usa `caxias`, não `caxiasdosul`; Passo Fundo usa `pmpf`. Por isso
// varrer molde de host falha e ler o menu acerta — o próprio portal informa o endereço
// ([[pnigp-modulo-vs-host-fornecedor]]).
//
// Uso: UF=RS node scripts/varre_grp_menu_api.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36", accept: "application/json" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const RE_PESSOAL = /servidor|remunera|folha|pessoal|sal[áa]ri/i;

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br
  where uf=$1 and left(cod_ibge,6) not in (${partes.join(" union ")}) order by nome`, [UF])).rows;
console.log(`[grp-menu] ${muns.length} municípios ${UF} sem folha`);

// as categorias variam por município — o portal usa uma por entidade. Sondar as usuais e as vizinhas.
const CATEGORIAS = [1058, 1057, 1059, 1060, 1, 2, 3, 100, 1000, 1050, 1051, 1052, 1053, 1054, 1055, 1056];

async function menu(host, cat) {
  try {
    const r = await fetch(`https://${host}/infra/apigw/transparencia/service/portal/conteudo/transparencia/menu?categoria=${cat}`,
      { headers: UA, signal: AbortSignal.timeout(25000) });
    if (!r.ok) return null;
    const t = await r.text();
    if (!/^\s*[[{]/.test(t)) return null;
    return JSON.parse(t);
  } catch { return null; }
}

let achados = 0;
for (const m of muns) {
  const s = so(m.nome);
  // o host do GRP costuma ser `grp.{slug}` — mas o slug pode ser abreviado (caxias, pmpf)
  // 🚨 o domínio estava FIXO em `.rs.gov.br`. Além disso, o host do GRP pode já ter sido descoberto pela leitura
  // do site — nesse caso ele vale MAIS que qualquer molde, porque foi o próprio município que o publicou.
  const u = m.uf.toLowerCase();
  const doCandidato = (await q(`select url from folha_portal_candidato
    where cod_ibge = $1 and (produto = 'grp' or url ~ 'grp\.') limit 3`, [m.cod_ibge])).rows
    .map((r) => { try { return new URL(r.url).hostname; } catch { return null; } }).filter(Boolean);
  const hosts = [...new Set([...doCandidato,
                             `grp.${s}.${u}.gov.br`, `grp.${s.replace(/dosul$|dosanjos$/, "")}.${u}.gov.br`,
                             `grp.pm${s.split("").filter((_, i) => i < 4).join("")}.${u}.gov.br`])];
  const links = new Map();
  for (const h of hosts) {
    for (const cat of CATEGORIAS) {
      const j = await menu(h, cat);
      if (!j) continue;
      const txt = JSON.stringify(j);
      for (const mm of txt.matchAll(/"tituloMenu":"([^"]+)"/g)) { /* só para saber que veio menu */ }
      // pares título ↔ link: o JSON traz ambos; extrair todo http(s) e casar com o título mais próximo
      for (const item of (Array.isArray(j) ? j : [])) {
        const t = item.tituloMenu || item.titulo || "";
        const u = item.link || item.url || item.servico || "";
        if (t && u && /^https?:/.test(String(u)) && RE_PESSOAL.test(t)) links.set(String(u).trim(), t);
      }
      // alguns portais guardam o link dentro de outro campo — varredura bruta como rede de segurança
      for (const mm of txt.matchAll(/https?:\/\/[^"\\ ]+/g)) {
        const u = mm[0];
        if (/rhsysportaltransp|remuneracoes|folha|servidor/i.test(u)) links.set(u, links.get(u) || "(por varredura do JSON)");
      }
      if (links.size) break;
    }
    if (links.size) break;
  }
  if (!links.size) { console.log(`   · ${m.nome}: menu não respondeu ou sem item de pessoal`); continue; }
  achados++;
  console.log(`⭐ ${m.nome}`);
  for (const [u, t] of links) {
    console.log(`      ${t} → ${u}`);
    const produto = /rhsysportaltransp/i.test(u) ? "admrh" : null;
    if (!produto) continue;
    await q(`insert into folha_portal_candidato (cod_ibge, municipio, uf, produto, url, achado_via, achado_em)
      values ($1,$2,$3,$4,$5,'menu do GRP pela API',now()) on conflict (cod_ibge, url) do nothing`,
      [m.cod_ibge, m.nome, m.uf, produto, u]);
  }
}
console.log(`\n[grp-menu] ${achados} municípios com link de pessoal no menu`);
await db.end();
