const B="https://transparencia.e-publica.net:443/epublica-portal/rest/florianopolis/api/v1/pessoal";
async function t(ref,cod,qt=10){ const url=`${B}?referencia=${ref}&inicio_registro=0&quantidade_registro=${qt}&codigo_unidade=${cod}`;
  try{ const r=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(45000)}); const j=await r.json().catch(()=>null);
    console.log(`ref=${ref} cod=${cod}: HTTP ${r.status} total=${j?.totalRegistros} regs=${j?.registros?.length||0}`);
    if(j?.registros?.[0]){ const m=j.registros[0].registro?.matricula; const ug=j.registros[0].registro?.unidadeGestora; console.log("   ex:", ug?.denominacao, "|", m?.nome, "|", m?.cargo||m?.tipoContratacao||""); }
    return j?.registros?.length||0;
  }catch(e){ console.log(`ref=${ref} cod=${cod}: erro ${e.message.slice(0,40)}`); return 0; }
}
console.log("== exemplo da doc ==");
await t("01/2019","0");
console.log("== DEPAE 342210 por mês (achar o mais recente processado) ==");
for(const ref of ["01/2019","01/2024","06/2024","12/2024","01/2025","06/2025","09/2025"]){ await t(ref,"342210"); }
