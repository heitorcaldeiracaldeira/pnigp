const B="https://transparencia.e-publica.net:443/epublica-portal/rest/florianopolis/api/v1/pessoal";
async function t(ref,cod){ const u=`${B}?referencia=${ref}&inicio_registro=0&quantidade_registro=3&codigo_unidade=${cod}`;
  let best={s:0,n:0}; for(let a=1;a<=3;a++){ try{ const r=await fetch(u,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(60000)}); const j=await r.json().catch(()=>null); best={s:r.status,n:j?.registros?.length||0,ug:j?.registros?.[0]?.registro?.unidadeGestora?.denominacao}; if(best.n>0)break; }catch(e){} await new Promise(s=>setTimeout(s,8000)); } return best; }
console.log("unidade 1 (Câmara) por mês:");
for(const ref of ["06/2023","12/2023","03/2024","06/2024","12/2024","03/2025","06/2025","12/2025","01/2026","06/2026"]){ const r=await t(ref,1); console.log(`  ${ref}: HTTP ${r.s} regs=${r.n} ${r.ug||""}`); }
