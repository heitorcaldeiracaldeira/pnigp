const B="https://transparencia.e-publica.net:443/epublica-portal/rest/florianopolis/api/v1/pessoal";
async function t(ref,cod,qt=5){ const url=`${B}?referencia=${ref}&inicio_registro=0&quantidade_registro=${qt}&codigo_unidade=${cod}`;
  const r=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(90000)}); const j=await r.json().catch(()=>null);
  return {s:r.status,tot:j?.totalRegistros,n:j?.registros?.length||0,ex:j?.registros?.[0]?.registro,err:j?.erro}; }
for(const [ref,cod] of [["05/2025","1"],["12/2024","1"],["01/2024","1"],["01/2023","1"],["06/2022","1"],["01/2020","1"],["01/2019","1"]]){
  let r; for(let a=1;a<=3;a++){ r=await t(ref,cod); if(r.n>0)break; await new Promise(s=>setTimeout(s,9000)); }
  console.log(`${ref} cod${cod}: HTTP ${r.s} total=${r.tot} regs=${r.n}${r.err?" ERR "+JSON.stringify(r.err):""}${r.ex?" | ex: "+r.ex.matricula?.nome+" ("+(r.ex.listFolha?.[0]?.historico?.local?.denominacao||"?")+")":""}`);
}
