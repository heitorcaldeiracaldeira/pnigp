// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// registra_betha_portal_por_hash.mjs — registra portais Betha achados pelo HASH na URL, mesmo quando o município
// NÃO aparece no diretório nacional `/auth/portais`.
//
// 🚨 O DIRETÓRIO NÃO É COMPLETO. `betha_portal` tem 1.272 portais vindos de `/auth/portais`, e eu tratava essa
// lista como o universo Betha. Cambuquira/MG **não está lá** — mas o hash que a leitura do site oficial trouxe
// (`transparencia.betha.cloud/#/LYEccqCNElvHNsB3Hc5CwA==/consultas/61956`) responde ao `/api/menu` com o menu
// completo, incluindo "Servidores e Remunerações". Ou seja: municípios com portal Betha vivo ficavam invisíveis
// por não constarem do catálogo ([[pnigp-catalogo-ok-nao-significa-gravou]]).
//
// A prova de vida é o próprio `/api/menu` responder com consulta de pessoal — não basta o hash existir.
//
// Uso: UF=MG node scripts/registra_betha_portal_por_hash.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { pegaToken, API } from "./_betha.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const RE_PESSOAL = /servidor|remunera|folha de pagamento/i;

// candidatos com hash de portal Betha na URL que ainda não estão no diretório
const cands = (await q(`
  select distinct on (c.cod_ibge) c.cod_ibge, c.municipio, c.uf, c.url
    from folha_portal_candidato c join municipios_br m on m.cod_ibge = c.cod_ibge
   where c.url ~ 'transparencia\.betha\.cloud/#/'
     ${UF ? "and m.uf = $1" : ""}
     and not exists (select 1 from betha_portal b where b.cod_ibge = c.cod_ibge)
   order by c.cod_ibge, length(c.url)`, UF ? [UF] : [])).rows;
console.log(`[betha-hash] ${cands.length} candidatos com hash fora do diretório`);

// id sintético: o diretório usa ids de verdade; para os que não estão nele, uma faixa alta e reservada evita
// colidir com qualquer id futuro do próprio Betha
const proximoId = async () => {
  const r = await q(`select coalesce(max(id), 900000) m from betha_portal where id >= 900000`);
  return Math.max(900001, Number(r.rows[0].m) + 1);
};

let ok = 0, nao = 0;
for (const c of cands) {
  const hash = (c.url.match(/#\/([^/?#]+)/) || [])[1];
  if (!hash) { nao++; console.log(`   · ${c.municipio}: URL sem hash`); continue; }
  const ctx = Buffer.from(JSON.stringify({ portal: decodeURIComponent(hash) })).toString("base64");
  let temPessoal = false;
  try {
    const tk = await pegaToken();
    const r = await fetch(`${API}/api/menu`, {
      headers: { authorization: `Bearer ${tk}`, "app-context": ctx, accept: "application/json" },
      signal: AbortSignal.timeout(40000) });
    if (r.ok) {
      const t = await r.text();
      if (/^\s*[[{]/.test(t)) temPessoal = RE_PESSOAL.test(t);
    }
  } catch { /* segue como não provado */ }
  if (!temPessoal) { nao++; console.log(`   · ${c.municipio}: menu sem consulta de pessoal`); continue; }
  const id = await proximoId();
  await q(`insert into betha_portal (id, nome, municipio, uf, cod_ibge, hash, entidades, _coletado_em)
    values ($1,$2,$3,$4,$5,$6,'[]'::jsonb,now())
    on conflict (id) do nothing`,
    [id, `Prefeitura Municipal de ${c.municipio}`, c.municipio, c.uf, c.cod_ibge, decodeURIComponent(hash)]);
  ok++;
  console.log(`  ⭐ ${c.municipio.padEnd(26)} id ${id} · hash ${decodeURIComponent(hash).slice(0, 28)}`);
}
console.log(`\n[betha-hash] ${ok} portais registrados · ${nao} sem prova`);
await db.end();
