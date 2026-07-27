import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const log=m=>fs.appendFileSync(OUT+"folha_long.txt", m+"\n");
const B="https://transparencia.e-publica.net:443/epublica-portal/rest/florianopolis/api/v1/pessoal";
const url=`${B}?referencia=12/2025&inicio_registro=0&quantidade_registro=5000&codigo_unidade=342210`;
log("long-poll 12/2025 unidade 342210 (DEPAE) — ate 56 tentativas x 15s");
for(let a=1;a<=56;a++){
  try{ const r=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(60000)});
    const j=await r.json().catch(()=>null); const n=j?.registros?.length||0;
    if(a%4===0||n>0||r.status!==202) log(`t${a} (${a*15}s): HTTP ${r.status} regs=${n}`);
    if(n>0){ fs.writeFileSync(OUT+"folha_342210_12_2025.json", JSON.stringify(j)); log(`✅ SALVO ${n} servidores após ${a*15}s`); process.exit(0); }
  }catch(e){ log(`t${a}: erro ${e.message.slice(0,40)}`); }
  await new Promise(s=>setTimeout(s,15000));
}
log("❌ nunca completou em ~14min");
