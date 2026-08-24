// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// promove_diagnostico_camara.mjs — leva o que o diagnóstico com navegador ACHOU para a fila de coleta.
//
// O ciclo é: identificar por assinatura → (quem sobra) diagnosticar com navegador → PROMOVER o achado → coletar.
// Este script é o terceiro passo: o diagnóstico abriu a tela e viu linhas, então grava na fila o produto e a URL
// DA TELA DE PESSOAL (não a da home) — é ela que o coletor precisa.
//
// 🚨 GUARDA DE ASSEMBLEIA, segunda passada: a primeira versão tirava `al.{uf}.leg.br`, mas o diagnóstico trouxe
//    `transparencia.al.go.leg.br` para GOIÂNIA — a Assembleia de Goiás num SUBDOMÍNIO, que o padrão anterior não
//    pegava. Colher de lá gravaria deputados estaduais como servidores do município
//    ([[pnigp-al-uf-legbr-e-assembleia-nao-camara]]).
//
// Uso: node scripts/promove_diagnostico_camara.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
const db = pool();
const q = withRetry(db);

const RE_ASSEMBLEIA = "(^|[./])al\\.[a-z]{2}\\.leg\\.br|assembleia|alerj|almg|alesc|alep|alba|alema|camara\\.leg\\.br|senado\\.leg\\.br";
const sujas = await q(`select cod_ibge, municipio, uf, url_pessoal, url_visitada from folha_diagnostico_camara
  where coalesce(url_pessoal, url_visitada) ~* $1`, [RE_ASSEMBLEIA]);
if (sujas.rowCount) {
  console.log(`🚨 ${sujas.rowCount} diagnósticos apontam para ASSEMBLEIA estadual — recusados:`);
  console.table(sujas.rows.map((r) => ({ municipio: r.municipio, uf: r.uf, url: String(r.url_pessoal || r.url_visitada).slice(0, 60) })));
  await q(`update folha_diagnostico_camara set veredito = 'recusado_assembleia',
             detalhe = 'URL é de assembleia legislativa estadual, não de câmara municipal'
           where coalesce(url_pessoal, url_visitada) ~* $1`, [RE_ASSEMBLEIA]);
  await q(`update folha_camara_fila f set url_recusada = coalesce(f.url_camara, f.url_camara_2),
             url_camara = null, url_camara_2 = null, erp_camara = null, url_erp_camara = null
           from folha_diagnostico_camara d
           where d.cod_ibge = f.cod_ibge and d.veredito = 'recusado_assembleia'`);
}

// ⭐ promove: produto + URL DA TELA DE PESSOAL para quem o diagnóstico provou ter dados
const r = await q(`update folha_camara_fila f
   set erp_camara = coalesce(d.produto, f.erp_camara),
       url_erp_camara = coalesce(d.url_pessoal, f.url_erp_camara),
       erp_via = 'diagnóstico com navegador (tela com linhas)'
  from folha_diagnostico_camara d
 where d.cod_ibge = f.cod_ibge and d.veredito = 'tem_dados'
   and (f.erp_camara is null or f.url_erp_camara is null)`);
console.log(`\n${r.rowCount} câmaras promovidas para a fila de coleta`);

console.table((await q(`select coalesce(f.erp_camara,'(sem produto — precisa de coletor novo)') produto,
    count(*)::int camaras
  from folha_camara_fila f join folha_diagnostico_camara d on d.cod_ibge = f.cod_ibge
 where d.veredito = 'tem_dados' group by 1 order by 2 desc`)).rows);
await db.end();
