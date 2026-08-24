// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// enfileira_candidatos.mjs — leva o que a descoberta achou (`folha_host_candidato`) para a FILA de cada coletor.
//
// ⭐ POR QUE: a maior parte do que falta já tem coletor pronto; o que falta é a FILA. Foi assim que o RN saiu de
//    50 para 64 e AL de 19 para 28 ([[pnigp-ordem-retorno-resondar-corrigir-criar]]).
// 🚨 Cada coletor lê de uma tabela diferente e com colunas próprias — este script traduz candidato → fila:
//      scpi/aos        → portal_produto (produto='scpi')          · base até o diretório, sem arquivo/query
//      datapublic      → o próprio folha_host_candidato (o coletor já lê de lá)
//      portaltp        → erp_portal_municipal (erp='portaltp')    · exige SLUG que case com o município
//      municipioonline → folha_mo_portal (o coletor descobre sozinho por UF)
//
// Uso: UF=RN node scripts/enfileira_candidatos.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RN";

const so = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
// base do SCPI: até o diretório, sem arquivo nem query — o coletor navega sozinho até LnkServidores
const baseDe = (u) => {
  const s = String(u).split("?")[0].split("#")[0].replace(/\/[^/]*\.(aspx|php|jsf|html?)$/i, "/");
  return s.replace(/\/*$/, "") + "/";
};

// ── SCPI (inclui AOS, que é revenda Fiorilli — [[pnigp-aossoftware-revenda-fiorilli]])
const scpi = (await q(`select cod_ibge, municipio, url from folha_host_candidato
  where uf = $1 and produto in ('scpi','aos') and url ~* 'AcessoIndividual|TRANSPARENCIA'`, [UF])).rows;
let nScpi = 0;
for (const x of scpi) {
  // ⚠️ a PK de `portal_produto` é só `cod_ibge`: município já registrado com OUTRO produto colide.
  //    Atualizar em vez de inserir — a prova por URL é mais recente que o rótulo anterior.
  const ja = await q(`select produto from portal_produto where cod_ibge = $1`, [x.cod_ibge]);
  if (ja.rowCount && ja.rows[0].produto === "scpi") continue;
  if (ja.rowCount) {
    await q(`update portal_produto set produto='scpi', url=$2, evidencia='AcessoIndividual= na URL do site oficial', em=now()
             where cod_ibge=$1`, [x.cod_ibge, baseDe(x.url)]);
  } else {
    await q(`insert into portal_produto (cod_ibge, municipio, uf, url, produto, evidencia, em, achado_em)
      values ($1,$2,$3,$4,'scpi','AcessoIndividual= na URL do site oficial', now(), now())`,
      [x.cod_ibge, x.municipio, UF, baseDe(x.url)]);
  }
  console.log(`  scpi      + ${x.municipio.padEnd(24)} ${baseDe(x.url).slice(0, 66)}`);
  nScpi++;
}

// ── PortalTP: 🚨 o slug TEM de casar com o município (Caraúbas apontava para `assu`)
const ptp = (await q(`select cod_ibge, municipio, url from folha_host_candidato
  where uf = $1 and produto = 'portaltp'`, [UF])).rows;
let nPtp = 0, nDescartado = 0;
for (const x of ptp) {
  const u = String(x.url);
  const slug = (u.match(/#\/([a-z0-9-]+)\/portal/i) || u.match(/\/cidadao\/([a-z0-9-]+)\//i)
    || u.match(/\/\/([a-z0-9-]+)-[a-z]{2}\.portaltp\.com\.br/i) || [])[1];
  if (!slug) continue;
  const bate = so(slug).includes(so(x.municipio).slice(0, 6)) || so(x.municipio).includes(so(slug).slice(0, 6));
  if (!bate) { console.log(`  portaltp  🚨 ${x.municipio.padEnd(24)} slug "${slug}" NÃO casa — descartado`); nDescartado++; continue; }
  const ja = await q(`select 1 from erp_portal_municipal where cod_ibge = $1 and erp = 'portaltp'`, [x.cod_ibge]);
  if (ja.rowCount) continue;
  await q(`insert into erp_portal_municipal (cod_ibge, erp, slug) values ($1,'portaltp',$2)`, [x.cod_ibge, slug]);
  console.log(`  portaltp  + ${x.municipio.padEnd(24)} slug=${slug}`);
  nPtp++;
}

console.log(`\n[fila] ${UF}: scpi +${nScpi} · portaltp +${nPtp} (${nDescartado} descartados por slug divergente)`);
console.log("scpi na fila:", (await q(`select count(*)::int n from portal_produto p join municipios_br m on m.cod_ibge=p.cod_ibge where p.produto='scpi' and m.uf=$1`, [UF])).rows[0].n);
await db.end();
