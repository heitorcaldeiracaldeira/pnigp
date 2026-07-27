import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const log=m=>fs.appendFileSync(OUT+"folha_js.txt", m+"\n");
const REST="https://transparencia.e-publica.net/epublica-portal/rest/florianopolis/api/v1/pessoal";
let cookie="";
async function poll(ref,cod,tries,gap){
  const url=`${REST}?referencia=${encodeURIComponent(ref)}&inicio_registro=0&quantidade_registro=5000&codigo_unidade=${cod}`;
  for(let a=1;a<=tries;a++){
    try{
      const r=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0",...(cookie?{"Cookie":cookie}:{})},signal:AbortSignal.timeout(90000)});
      const sc=r.headers.getSetCookie?.()||[];
      if(sc.length){ const js=sc.map(c=>c.split(";")[0]).filter(c=>/JSESSION|SESSION|epublica/i.test(c)).join("; "); if(js && js!==cookie){ cookie=js; log(`  [cookie capturado: ${js.slice(0,40)}]`); } }
      const txt=await r.text(); let j=null; try{j=JSON.parse(txt);}catch{}
      const n=j?.registros?.length??0, tot=j?.totalRegistros??"?";
      if(a===1||a%5===0||n>0) log(`  ${ref} c${cod} t${a}: ${r.status} tot=${tot} n=${n} cookie=${cookie?"sim":"nao"}`);
      if(n>0){ fs.writeFileSync(OUT+`folha_${cod}_${ref.replace("/","_")}.json`, txt); log(`  ✅ SALVO ${n} servidores`); return true; }
    }catch(e){ log(`  ${ref} c${cod} t${a}: erro ${e.message.slice(0,40)}`); }
    await new Promise(s=>setTimeout(s,gap));
  }
  return false;
}
for(const [ref,cod] of [["12/2025","342210"],["11/2025","342210"],["10/2025","342210"],["12/2025","34"]]){
  log(`=== ${ref} unidade ${cod}`);
  if(await poll(ref,cod,30,12000)) break;
}
log("FIM");
