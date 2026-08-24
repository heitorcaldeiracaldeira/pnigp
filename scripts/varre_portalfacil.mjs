// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_portalfacil.mjs — procura o Portal Fácil (`/tpc_serv_nome_lis.aspx`) no domínio do PRÓPRIO município.
//
// ⭐ O produto não tem host de fornecedor para enumerar: roda em `www.{slug}.{uf}.gov.br`
// ([[pnigp-portalfacil-tpc-aspx]]). Por isso a busca é por MOLDE DE DOMÍNIO, e a varredura vale para o país todo.
//
// 🚨 A PROVA É FORTE, e tem de ser. A primeira versão sondava a string `tpc_serv` no HTML e deu **30 falsos
// positivos em 54** — porque metade dos hosts responde com `<meta http-equiv="refresh" url=...tpc_serv...>`, e a
// sonda casava com o ECO DA PRÓPRIA URL PEDIDA ([[pnigp-sonda-soft404-falso-positivo]]).
// A prova que ficou: `POST …ServidorGetCompetencia` devolver um ARRAY de competências. Nada menos conta.
//
// Uso: node scripts/varre_portalfacil.mjs           (todo o país, só quem não tem folha)
//      UF=BA node scripts/varre_portalfacil.mjs     · TODOS=1 (inclui quem já tem folha por outra via)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const TODOS = process.env.TODOS === "1";
const PARALELO = Number(process.env.PARALELO || 12);
const H = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
  "content-type": "application/json; charset=UTF-8",
  "x-requested-with": "XMLHttpRequest",
  accept: "application/json, text/javascript, */*; q=0.01",
};
const RE_META = /<meta[^>]+refresh[^>]+url=([^"'>\s]+)/i;
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// quem JÁ tem folha em qualquer tabela
const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const muns = (await q(`select cod_ibge, nome, uf from municipios_br
  where 1=1 ${UF ? `and uf = '${String(UF).replace(/'/g, "")}'` : ""}
  ${TODOS ? "" : `and left(cod_ibge,6) not in (${partes.join(" union ")})`}
  order by uf, nome`)).rows;
console.log(`[portalfacil] ${muns.length} municípios a sondar${UF ? ` em ${UF}` : " no país"}\n`);

// a prova: ServidorGetCompetencia devolve array de competências
async function prova(base) {
  const caminho = "/transparencia/servidor/tpc_servidor_data.ashx?metodo=ServidorGetCompetencia&entidade=";
  const bate = async (b) => {
    const r = await fetch(`${b}${caminho}`, { method: "POST", headers: H, body: "{}", signal: AbortSignal.timeout(25000) });
    return { ok: r.ok, texto: await r.text() };
  };
  let r = await bate(base);
  if (r.texto.length < 600) {
    const m = RE_META.exec(r.texto);
    if (m) { try { r = await bate(new URL(m[1]).origin); } catch { /* fica com a original */ } }
  }
  if (!r.ok) return null;
  let j; try { j = JSON.parse(r.texto); } catch { return null; }
  const lista = Array.isArray(j) ? j : (j?.d ?? null);
  if (!Array.isArray(lista) || !lista.length) return null;
  const comps = lista.map((c) => String(c.id ?? c));
  // 🚨 só "00/0000" é base não alimentada, não portal ausente — registra, mas avisa
  const mensais = comps.filter((c) => { const mm = Number(String(c).slice(0, 2)); return mm >= 1 && mm <= 12; });
  return { comps, mensais, base };
}

let achados = 0, vazios = 0;
const sonda = async (m) => {
  const s = so(m.nome), uf = m.uf.toLowerCase();
  for (const host of [`www.${s}.${uf}.gov.br`, `${s}.${uf}.gov.br`, `www.pm${s}.${uf}.gov.br`]) {
    let r;
    try { r = await prova(`https://${host}`); } catch { continue; }
    if (!r) continue;
    if (!r.mensais.length) {
      vazios++;
      console.log(`   · ${m.uf} ${m.nome.padEnd(26)} tem o produto, base NÃO ALIMENTADA (${r.comps[0]})`);
    } else {
      achados++;
      console.log(`  ⭐ ${m.uf} ${m.nome.padEnd(26)} ${r.mensais.length} competências · +recente ${r.mensais[0]}`);
    }
    await q(`insert into folha_portal_candidato (cod_ibge,municipio,uf,produto,url,achado_via,achado_em)
      values ($1,$2,$3,'tpc_aspx',$4,'molde /tpc_serv_nome_lis.aspx com prova ServidorGetCompetencia',now())
      on conflict (cod_ibge,url) do nothing`, [m.cod_ibge, m.nome, m.uf, `${r.base}/tpc_serv_nome_lis.aspx`]);
    return;
  }
};

for (let i = 0; i < muns.length; i += PARALELO) {
  await Promise.all(muns.slice(i, i + PARALELO).map(sonda));
  if (i && i % 200 === 0) console.log(`      … ${i}/${muns.length} sondados, ${achados} achados`);
}
console.log(`\n[portalfacil] ${achados} municípios com folha publicada · ${vazios} com o produto mas base vazia`);
await db.end();
