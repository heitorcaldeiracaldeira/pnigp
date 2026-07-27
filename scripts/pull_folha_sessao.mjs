import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const log=m=>fs.appendFileSync(OUT+"folha_log2.txt", m+"\n");
const HOST="https://transparencia.e-publica.net";
const REST=HOST+"/epublica-portal/rest/florianopolis/api/v1/pessoal";
let cookie="";
async function estabeleceSessao(){
  try{ const r=await fetch(HOST+"/epublica-portal/",{headers:{"User-Agent":"Mozilla/5.0","Accept":"text/html"}});
    const sc=r.headers.getSetCookie?.()||[]; cookie=sc.map(c=>c.split(";")[0]).join("; ");
    log("sessao cookies: "+(cookie||"nenhum")); }catch(e){ log("sessao erro "+e.message.slice(0,40)); }
}
async function pega(ref,cod){
  const url=`${REST}?referencia=${encodeURIComponent(ref)}&inicio_registro=0&quantidade_registro=5000&codigo_unidade=${cod}`;
  for(let a=1;a<=20;a++){
    try{
      const r=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0","Cookie":cookie,"Referer":HOST+"/epublica-portal/"},signal:AbortSignal.timeout(90000)});
      const sc=r.headers.getSetCookie?.()||[]; if(sc.length){ const nc=sc.map(c=>c.split(";")[0]).join("; "); cookie=cookie?cookie+"; "+nc:nc; }
      const txt=await r.text(); let j=null; try{j=JSON.parse(txt);}catch{}
      const tot=j?.totalRegistros??"?", n=j?.registros?.length??0;
      log(`  ${ref} cod${cod} t${a}: ${r.status} total=${tot} regs=${n}`);
      if(n>0) return j;
    }catch(e){ log(`  ${ref} cod${cod} t${a}: erro ${e.message.slice(0,40)}`); }
    await new Promise(s=>setTimeout(s,10000));
  }
  return null;
}
await estabeleceSessao();
for(const cod of ["342210","34"]){
  for(const ref of ["12/2025","11/2025","12/2024"]){
    log(`--- folha ref=${ref} unidade=${cod}`);
    const j=await pega(ref,cod);
    if(j){ fs.writeFileSync(OUT+`folha_${cod}_${ref.replace("/","_")}.json`, JSON.stringify(j)); log(`  ✅ SALVO ${j.registros.length}`); break; }
  }
}
log("FIM");
