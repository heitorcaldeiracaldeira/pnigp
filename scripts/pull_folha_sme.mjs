import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const log=m=>fs.appendFileSync(OUT+"folha_log.txt", m+"\n");
const BASE="https://transparencia.e-publica.net/epublica-portal/rest/florianopolis/api/v1/pessoal";
// SME = codigo_unidade 34 (Heitor). e-Publica serve dado do Senior. 202-async: repetir ate totalRegistros>0.
async function pega(ref, cod){
  const url=`${BASE}?referencia=${encodeURIComponent(ref)}&inicio_registro=0&quantidade_registro=5000&codigo_unidade=${cod}`;
  for(let a=1;a<=25;a++){
    try{
      const r=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(60000)});
      const j=await r.json().catch(()=>null);
      const tot=j?.totalRegistros??-1, n=j?.registros?.length??0;
      log(`  ${ref} cod${cod} tent${a}: status ${r.status} total=${tot} registros=${n}`);
      if(n>0) return j;
    }catch(e){ log(`  ${ref} cod${cod} tent${a}: erro ${e.message.slice(0,40)}`); }
    await new Promise(s=>setTimeout(s,8000));
  }
  return null;
}
for(const cod of ["34"]){
  for(const ref of ["12/2025","12/2024"]){
    log(`folha ref=${ref} unidade=${cod}...`);
    const j=await pega(ref,cod);
    if(j){ fs.writeFileSync(OUT+`folha_sme_${ref.replace("/","_")}_u${cod}.json`, JSON.stringify(j)); log(`  SALVO ${j.registros.length} servidores`); }
    else log(`  vazio (202 preso ou ref nao processada)`);
  }
}
log("FIM folha");
