const B="https://transparencia.e-publica.net:443/epublica-portal/rest/florianopolis/api/v1/pessoal";
async function t(ref,cod,qt=5){ const url=`${B}?referencia=${ref}&inicio_registro=0&quantidade_registro=${qt}&codigo_unidade=${cod}`;
  try{ const r=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(60000)}); const j=await r.json().catch(()=>null);
    const n=j?.registros?.length||0;
    console.log(`ref=${ref} cod=${cod}: HTTP ${r.status} total=${j?.totalRegistros} regs=${n}${j?.erro?" ERRO:"+JSON.stringify(j.erro):""}`);
    if(j?.registros?.[0]){ const rr=j.registros[0].registro; const f=rr.listFolha?.[0]; console.log("   ex:", rr.matricula?.nome, "|", f?.historico?.cargo?.denominacao, "|", f?.historico?.local?.denominacao); }
    return n;
  }catch(e){ console.log(`ref=${ref} cod=${cod}: erro ${e.message.slice(0,40)}`); return 0; }
}
// testa codigos VALIDOS (fundos pequenos) com mes antigo do exemplo
for(const cod of ["21","24","17","55","1"]){ await t("01/2019",cod); }
