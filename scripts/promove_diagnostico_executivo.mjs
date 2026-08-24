// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// promove_diagnostico_executivo.mjs — leva o que o diagnóstico com navegador ACHOU da PREFEITURA para a fila.
//
// O ciclo é: identificar por assinatura → (quem sobra) diagnosticar com navegador → PROMOVER → coletar.
// A câmara tinha os quatro passos (`promove_diagnostico_camara.mjs`); o EXECUTIVO não tinha o terceiro, e por
// isso municípios marcados `tem_dados` ficavam parados no diagnóstico sem virar alvo de coleta nenhum
// (23/ago/2026: 33 municípios sem folha alguma, todos já provados coletáveis).
//
// Grava em `radar_portal` (linha da Prefeitura): `erp` = o produto que o navegador reconheceu e `url_erp` = a URL
// DA TELA DE PESSOAL — não a da home, que é o que o coletor não sabe usar.
//
// ═══ AS DUAS GUARDAS, e por que existem ═══
// 🚨 1. URL QUE NÃO É DO MUNICÍPIO. O diagnóstico visitou o que a sonda tinha, e às vezes isso é o portal
//       FEDERAL: Embaúba/SP veio com `portaldatransparencia.gov.br/localidades/3514957`. Promover apontaria o
//       coletor para a CGU e traria despesa da União como folha do município.
// 🚨 2. URL DA CÂMARA promovida como PREFEITURA. Agudos/SP veio com `etransparencia.cm.agudos.sp` — `cm` é
//       Câmara Municipal. É o espelho da guarda de assembleia do promotor da câmara
//       ([[pnigp-al-uf-legbr-e-assembleia-nao-camara]]) e da [[pnigp-guarda-poder-volume-rais]]: apontar o
//       coletor para o portal do outro poder não dá erro nenhum, grava e fecha `ok`.
//    ⚠️ A guarda de câmara olha o HOST, e HOST NÃO É PROVA. Ela já produziu um falso negativo no primeiro uso:
//       `scpi-camara.rancharia.sp.gov.br` **é a PREFEITURA** — o caso que dá nome a
//       [[pnigp-prefeitura-ao-lado-da-camara]]. Por isso a recusa por host **não descarta**: manda para
//       REVISÃO MANUAL, e quem decide é o dado (entidade declarada / escala contra a RAIS), nunca o endereço.
//
// Uso: node scripts/promove_diagnostico_executivo.mjs          (só relata)
//      APLICAR=1 node scripts/promove_diagnostico_executivo.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const APLICAR = process.env.APLICAR === "1";

// domínios que NÃO são do município — portal federal, tesouro, portais estaduais agregadores
const RE_NAO_E_DO_MUNICIPIO = "portaldatransparencia\.gov\.br|portaltransparencia\.gov\.br|tesourotransparente|" +
  "transparencia\.(rs|sp|mg|pr|ba)\.gov\.br|webde\.com\.br|gov\.br/pt-br";
// padrões inequívocos de CÂMARA no host/caminho
const RE_CAMARA = "(^|[./])cm[.-]|(^|[./])camara|c[aâ]mara|\.leg\.br|vereador";

const base = `from folha_diagnostico_faltante d
  where d.veredito = 'tem_dados' and coalesce(d.url_pessoal, d.url_visitada) is not null`;

const federal = (await q(`select d.cod_ibge, d.municipio, d.uf, coalesce(d.url_pessoal, d.url_visitada) url
  ${base} and coalesce(d.url_pessoal, d.url_visitada) ~* $1`, [RE_NAO_E_DO_MUNICIPIO])).rows;
const camara = (await q(`select d.cod_ibge, d.municipio, d.uf, coalesce(d.url_pessoal, d.url_visitada) url
  ${base} and coalesce(d.url_pessoal, d.url_visitada) !~* $1
    and coalesce(d.url_pessoal, d.url_visitada) ~* $2`, [RE_NAO_E_DO_MUNICIPIO, RE_CAMARA])).rows;

if (federal.length) {
  console.log(`🚨 ${federal.length} com URL que NÃO é do município (portal federal/estadual) — recusados:`);
  console.table(federal.map((r) => ({ municipio: r.municipio, uf: r.uf, url: String(r.url).slice(0, 62) })));
}
if (camara.length) {
  console.log(`\n🚨 ${camara.length} com URL de CÂMARA promovidos como prefeitura — recusados:`);
  console.table(camara.map((r) => ({ municipio: r.municipio, uf: r.uf, url: String(r.url).slice(0, 62) })));
}

const bons = (await q(`select d.cod_ibge, d.municipio, d.uf, d.produto,
     coalesce(d.url_pessoal, d.url_visitada) url
  ${base} and coalesce(d.url_pessoal, d.url_visitada) !~* $1
    and coalesce(d.url_pessoal, d.url_visitada) !~* $2
  order by d.uf, d.municipio`, [RE_NAO_E_DO_MUNICIPIO, RE_CAMARA])).rows;

const comProduto = bons.filter((b) => b.produto);
console.log(`\n${bons.length} promovíveis · ${comProduto.length} com produto reconhecido (coletor existente) · ` +
            `${bons.length - comProduto.length} sem produto (precisam de coletor novo, mas a URL fica gravada)`);
console.table(Object.entries(bons.reduce((a, b) => {
  const k = b.produto || "(sem produto — precisa de coletor novo)"; a[k] = (a[k] || 0) + 1; return a;
}, {})).map(([produto, n]) => ({ produto, municipios: n })).sort((a, b) => b.municipios - a.municipios));

if (!APLICAR) { console.log("\n(só relatório — APLICAR=1 grava em radar_portal)"); await db.end(); process.exit(0); }

// 🚨 nunca sobrescrever produto já conhecido: o diagnóstico é a ÚLTIMA fonte de verdade, não a primeira
//    ([[pnigp-fornecedor-e-host-nao-erp]]). Só preenche o que está vazio.
let n = 0;
for (const b of bons) {
  const r = await q(`update radar_portal
       set erp = coalesce(nullif(erp,''), $2),
           url_erp = coalesce(nullif(url_erp,''), $3),
           erp_via = 'diagnóstico com navegador (tela de pessoal com linhas)'
     where cod_ibge = $1 and unidade_gestora ilike 'Prefeitura%'
       and (coalesce(erp,'') = '' or coalesce(url_erp,'') = '')`, [b.cod_ibge, b.produto, b.url]);
  n += r.rowCount;
}
console.log(`\n✅ ${n} prefeituras promovidas no radar_portal`);
await db.end();
