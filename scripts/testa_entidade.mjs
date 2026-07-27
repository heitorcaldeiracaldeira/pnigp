const B="https://transparencia.e-publica.net:443/epublica-portal/rest/florianopolis/api/v1/pessoal";
async function t(qs){ const u=B+"?"+qs;
  let best={s:0,n:0}; for(let a=1;a<=3;a++){ try{ const r=await fetch(u,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(60000)}); const j=await r.json().catch(()=>null); best={s:r.status,n:j?.registros?.length||0,ug:j?.registros?.[0]?.registro?.unidadeGestora?.denominacao,ex:j?.registros?.[0]?.registro?.matricula?.nome,loc:j?.registros?.[0]?.registro?.listFolha?.[0]?.historico?.local?.denominacao,err:j?.erro}; if(best.n>0)break; }catch(e){best.e=e.message.slice(0,30);} await new Promise(s=>setTimeout(s,8000)); } return best; }
const combos=[
 "referencia=12/2023&inicio_registro=0&quantidade_registro=3&codigo_unidade=1&entidade=2002",
 "referencia=12/2025&inicio_registro=0&quantidade_registro=3&codigo_unidade=1&entidade=2002",
 "referencia=12/2025&inicio_registro=0&quantidade_registro=3&entidade=2002",
 "referencia=12/2025&inicio_registro=0&quantidade_registro=3&codigo_unidade=0&entidade=2002",
 "referencia=12/2025&inicio_registro=0&quantidade_registro=3&codigo_unidade=34&entidade=2002",
];
for(const qs of combos){ const r=await t(qs); console.log(`${qs}\n   -> HTTP ${r.s} n=${r.n} UG="${r.ug||""}" ex="${r.ex||""}" loc="${r.loc||""}"${r.err?" ERR "+JSON.stringify(r.err):""}\n`); }
