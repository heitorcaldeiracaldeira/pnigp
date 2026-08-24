// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_codigo_memory_camara.mjs — acha o CÓDIGO DO ENTE do Memory/iLAI no site de cada câmara.
//
// POR QUÊ: o Memory identifica o ente por um código de 6 caracteres (`9AG9TM`) e **não tem catálogo público** —
// `ilai.memory.com.br` sem contexto responde *"Volte ao site da entidade e tente acessar o portal"*. Sem o
// código não há coleta; com ele, o coletor roda igual ao do executivo.
//
// O código aparece no LINK do portal dentro do site da câmara, em três formatos vistos:
//   `lai.memory.com.br/entidades/login/9AG9TM`
//   `ilai.memory.com.br/#/entidades/login/9BUD72/6`
//   `ilai.memory.com.br/#/9EB9ZY/2/share?resource=public/inicio`
//
// ⚠️ Só grava o que ACHOU no site — nada de adivinhar código (seria coletar a folha de outro ente).
//
// Uso: node scripts/descobre_codigo_memory_camara.mjs      · CONC=6 · UF=MG · APLICAR=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const CONC = Number(process.env.CONC || 6);
const UF = process.env.UF || null;
const APLICAR = process.env.APLICAR === "1";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" };

// alvos: câmaras sem folha que tenham portal conhecido — o produto pode nem estar identificado ainda,
// porque o link do Memory às vezes só aparece no site, não na assinatura da home
const alvos = (await q(`select f.cod_ibge, f.municipio, f.uf,
     coalesce(f.url_camara, f.url_camara_2, f.url_erp_camara) url
  from folha_camara_fila f
  left join aux_camara_com_folha a on a.cod_ibge = f.cod_ibge
 where coalesce(f.url_camara, f.url_camara_2, f.url_erp_camara) is not null
   and coalesce(a.pessoas, 0) = 0
   and (coalesce(f.erp_camara,'') in ('', 'memory') or f.erp_camara is null)
   ${UF ? "and f.uf = $1" : ""}
 order by f.rais_legislativo desc nulls last`, UF ? [UF] : [])).rows;
console.log(`[memory/codigo] ${alvos.length} câmaras a checar · concorrência ${CONC}`);

const RE_COD = /(?:i?lai\.memory\.com\.br)[^"'\s]*?\/((?:[0-9][A-Z0-9]{5}))(?:[/"'?]|$)/;
let achados = 0, feitos = 0;
const novos = [];
for (let i = 0; i < alvos.length; i += CONC) {
  await Promise.all(alvos.slice(i, i + CONC).map(async (a) => {
    try {
      const r = await fetch(a.url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(45000) });
      if (!r.ok) return;
      const html = await r.text();
      const m = html.match(RE_COD);
      if (!m) return;
      achados++;
      novos.push({ ...a, codigo: m[1] });
      console.log(`  ⭐ ${a.uf} ${a.municipio}: ${m[1]}`);
    } catch { /* site fora do ar não é ausência de código */ }
    finally { feitos++; }
  }));
  if (i % (CONC * 20) === 0) process.stdout.write(`   ${feitos}/${alvos.length} · ${achados} códigos\r`);
}
console.log(`\n[memory/codigo] ${feitos} checadas · ${achados} com código de ente do Memory no site`);

// 🚨 22/ago/2026: DOIS municípios devolveram o MESMO código (Leandro Ferreira e Carmésia, ambos `98UY12`) —
//    o link do Memory que estava no site de um deles é o do outro. Gravar os dois publicaria a folha de um
//    município dentro do outro, que é exatamente o que [[pnigp-gemeas-calibragem-e-entidade]] proíbe: na
//    dúvida entre dois entes, o dado NÃO conta como cobertura de nenhum. Ficam de fora, com o motivo à vista.
const porCodigo = new Map();
for (const n of novos) { if (!porCodigo.has(n.codigo)) porCodigo.set(n.codigo, []); porCodigo.get(n.codigo).push(n); }
const disputados = [...porCodigo.values()].filter((v) => v.length > 1);
if (disputados.length) {
  console.log(`
🚨 ${disputados.length} código(s) reivindicado(s) por mais de um município — NENHUM será gravado:`);
  for (const g of disputados) console.log(`   ${g[0].codigo}: ${g.map((x) => `${x.uf} ${x.municipio}`).join(" × ")}`);
}
const limpos = novos.filter((n) => porCodigo.get(n.codigo).length === 1);
console.log(`${limpos.length} de ${novos.length} códigos são de município único`);

if (!APLICAR) { console.log("(dry-run — APLICAR=1 grava na fila e em memory_entidade)"); await db.end(); process.exit(0); }
for (const n of limpos) {
  await q(`update folha_camara_fila set erp_camara = 'memory',
             url_erp_camara = coalesce(url_erp_camara, 'https://ilai.memory.com.br/#/entidades/login/' || $2),
             erp_via = 'código do ente achado no site da câmara'
           where cod_ibge = $1`, [n.cod_ibge, n.codigo]);
}
console.log(`${limpos.length} câmaras gravadas na fila com o código do ente`);
await db.end();
