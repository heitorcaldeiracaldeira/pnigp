// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// registra_portaltp_candidato.mjs — promove candidatos "portaltp" (achados pelo rodapé do site) a alvo do coletor.
//
// O `ingest_folha_portaltp.mjs` lê de `erp_portal_municipal` com `erp='portaltp'` e monta o host canônico
// `{slug}-{uf}.portaltp.com.br`. A varredura de rodapé (`varre_rodape_fornecedor.mjs`) só grava o SITE do
// município em `folha_portal_candidato` — falta derivar o slug e PROVAR que o host do portal existe.
//
// 🚨 A prova não é "o site do município cita portaltp": é o HOST do portal responder à API de servidores. Sem
// isso, entra alvo que o coletor vai gastar minutos para descobrir que não existe
// ([[pnigp-sonda-folha-prova-e-a-coleta]]).
//
// Uso: UF=MG node scripts/registra_portaltp_candidato.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const cands = (await q(`select distinct c.cod_ibge, m.nome municipio, m.uf
  from folha_portal_candidato c join municipios_br m on m.cod_ibge = c.cod_ibge
 where c.produto = 'portaltp' ${UF ? "and m.uf = $1" : ""}
   and not exists (select 1 from erp_portal_municipal p where p.cod_ibge = c.cod_ibge and p.erp = 'portaltp')
 order by m.nome`, UF ? [UF] : [])).rows;
console.log(`[portaltp-cand] ${cands.length} candidatos sem registro de portal`);

// prova de vida: a API de servidores responde JSON (mesmo vazio) no host canônico
async function provaHost(slug, uf) {
  for (const h of [`${slug}-${uf.toLowerCase()}`, slug]) {
    for (const ano of [new Date().getFullYear(), new Date().getFullYear() - 1]) {
      try {
        const u = `https://${h}.portaltp.com.br/api/transparencia.asmx/json_servidores?ano=${ano}&mes=6`;
        const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000) });
        if (!r.ok) continue;
        const t = await r.text();
        // 🚨 o JSON vem EMBRULHADO EM XML: `<?xml...><string xmlns="http://tempuri.org/">[{"ano":"2026"...`
        // Exigir que o corpo comece com colchete ou chave reprovou 13 de 13 hosts que estavam no ar.
        if (/\[\s*\{/.test(t) || /"ano"\s*:/.test(t)) return h;
      } catch { /* próximo */ }
    }
  }
  return null;
}

let ok = 0, nao = 0;
for (const c of cands) {
  const slug = so(c.municipio);
  const host = await provaHost(slug, c.uf);
  if (!host) { nao++; console.log(`   · ${c.municipio}: nenhum host portaltp respondeu`); continue; }
  ok++;
  const url = `https://${host}.portaltp.com.br/consultas/pessoal/servidores.aspx`;
  console.log(`⭐ ${c.municipio.padEnd(28)} ${host}.portaltp.com.br`);
  await q(`insert into erp_portal_municipal (cod_ibge, erp, slug, url, achado_em)
    values ($1,'portaltp',$2,$3,now())
    on conflict (cod_ibge, erp) do update set slug=excluded.slug, url=excluded.url, achado_em=now()`,
    [c.cod_ibge, slug, url]);
}
console.log(`\n[portaltp-cand] ${ok} portais provados · ${nao} sem host`);
await db.end();
