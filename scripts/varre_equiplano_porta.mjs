// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_equiplano_porta.mjs — acha o portal Equiplano dos municípios em que o Radar só guardou o IDENTIFICADOR
// ("imbituvapr.equiplano"), sem host nem porta.
//
// ⭐ O padrão do produto é `{identificador}.equiplano.com.br:{PORTA}/transparencia`, e a PORTA muda por município
// (é instalação on-premise). As portas já observadas nos 60 portais conhecidos formam um conjunto pequeno — testar
// esse conjunto é barato e resolve sem varredura cega. Mesmo raciocínio de [[pnigp-varredura-host-porta-onpremise]].
// 🚨 O certificado dessas portas altas não bate com o host: sem dispatcher que aceite, o Node devolve
// `fetch failed` genérico e o município parece morto.
//
// Uso: UF=PR node scripts/varre_equiplano_porta.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";
setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false }, connectTimeout: 12000 }));

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "PR";
const R = "srhRelacaoDeServidoresSalariosDetalhado";
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

// portas já vistas nos portais conhecidos + as duas de TLS padrão do produto
const portas = [...new Set([
  ...(await q(`select distinct substring(base_url from ':(\\d{3,5})/') p from equiplano_portal where base_url ~ ':\\d+/'`))
    .rows.map((r) => r.p).filter(Boolean),
  "7474", "7007", "8443", "7443",
])];
console.log(`[equiplano/porta] ${portas.length} portas candidatas: ${portas.join(", ")}`);

// alvos: municípios da UF sem folha, com identificador Equiplano no Radar mas sem host resolvível
const partes = [];
for (const t of (await q(`select table_name t from information_schema.tables
  where table_schema='public' and table_name like 'folha_servidores_%'`)).rows) {
  if ((await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t.t])).rowCount)
    partes.push(`select distinct left(cod_ibge::text,6) i from ${t.t} where cod_ibge is not null`);
}
const alvos = (await q(`select m.cod_ibge, m.nome, m.uf, r.url_erp, r.url_portal
  from municipios_br m
  join lateral (select * from radar_portal x where x.cod_ibge=m.cod_ibge order by (x.erp is null) limit 1) r on true
 where m.uf=$1 and left(m.cod_ibge,6) not in (${partes.join(" union ")})
   and (r.erp='equiplano' or r.url_erp ilike '%equiplano%')
 order by m.nome`, [UF])).rows;
console.log(`[equiplano/porta] ${alvos.length} municípios sem folha com identificador Equiplano`);

const prova = async (base) => {
  try {
    const r = await fetch(`${base}/transparencia/${R}`, { headers: UA, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return 0;
    const t = await r.text();
    return [...t.matchAll(/<option[^>]*value=["']?(\d+)["']?[^>]*>([^<]{2,60})/gi)].length;
  } catch { return 0; }
};

let achados = 0;
for (const a of alvos) {
  const ident = String(a.url_erp || "").replace(/^https?:\/\//, "").split("/")[0].replace(/:\d+$/, "");
  const host = /\.equiplano/i.test(ident) ? (ident.includes(".com.br") ? ident : `${ident.split(".")[0]}.equiplano.com.br`) : null;
  if (!host) { console.log(`   ? ${a.nome}: sem identificador utilizável (${a.url_erp})`); continue; }
  let achou = null;
  for (const p of portas) {
    for (const esq of ["https", "http"]) {
      const base = `${esq}://${host}:${p}`;
      const n = await prova(base);
      if (n) { achou = `${base}/transparencia`; break; }
    }
    if (achou) break;
  }
  if (achou) {
    achados++;
    console.log(`⭐ ${a.nome.padEnd(28)} → ${achou}`);
    await q(`insert into equiplano_portal (cod_ibge,municipio,uf,base_url,detalhe,em) values ($1,$2,$3,$4,'porta descoberta por varredura',now())
      on conflict (cod_ibge) do update set base_url=excluded.base_url, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.nome, a.uf, achou]);
  } else console.log(`   ✖ ${a.nome.padEnd(28)} nenhuma porta respondeu (${host})`);
}
console.log(`\n[equiplano/porta] ${achados}/${alvos.length} portais achados`);
await db.end();
