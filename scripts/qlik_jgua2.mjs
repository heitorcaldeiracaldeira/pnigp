process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
const APP="4da65a01-68df-47e2-b05f-97249d916192";
const URL=`wss://paineistransparencia.tce.sc.gov.br/app/${APP}`;
function connect(){ return new Promise((resolve,reject)=>{ const ws=new WebSocket(URL); const pend=new Map(); let id=0;
  ws.addEventListener("error",()=>reject(new Error("WS")));
  ws.addEventListener("open",()=>setTimeout(()=>resolve({rpc,ws}),300));
  ws.addEventListener("message",ev=>{let m;try{m=JSON.parse(ev.data);}catch{return;} if(m.id!=null&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);if(m.error)rej(new Error(JSON.stringify(m.error)));else res(m.result);}});
  function rpc(method,handle,params){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({jsonrpc:"2.0",method,handle,params,id:i}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("t "+method));}},30000);});}
}); }
const {rpc,ws}=await connect();
let appH=null; for(let a=1;a<=5;a++){try{const o=await rpc("OpenDoc",-1,[APP,"","","",false]);appH=o.qReturn.qHandle;break;}catch{await new Promise(s=>setTimeout(s,2000));}}
if(appH==null){console.log("OpenDoc falhou");process.exit(1);}
async function listField(field,n=700){const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"lb"},qListObjectDef:{qDef:{qFieldDefs:[field]},qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:n,qWidth:1}]}}]);const lay=await rpc("GetLayout",o.qReturn.qHandle,[]);return (lay.qLayout.qListObject.qDataPages?.[0]?.qMatrix||[]).map(r=>r[0].qText);}
async function selVal(field,valor){const gf=await rpc("GetField",appH,[field]);return (await rpc("Select",gf.qReturn.qHandle,[valor,false,0])).qReturn;}
async function cube(dims,meas,h=500){const hc=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),qMeasures:meas.map(m=>({qDef:{qDef:m}})),qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+meas.length}]}}]);const lay=await rpc("GetLayout",hc.qReturn.qHandle,[]);return (lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[]);}
await selVal("cidade","Jaraguá do Sul"); await selVal("Poder","Executivo");
// folha total por anoMes → achar meses com dado
const porMes=(await cube(["anoMes"],["Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])"],60)).map(r=>({m:r[0].qText,v:+r[1].qNum||0})).filter(x=>x.m).sort((a,b)=>a.m.localeCompare(b.m));
console.log("=== folha total por mês (últimos 10) ===");
porMes.slice(-10).forEach(x=>console.log(`  ${x.m}: R$ ${Math.round(x.v).toLocaleString('pt-BR')}`));
const YEAR=process.argv[2]||'';const comMed=porMes.filter(x=>x.v>4e7&&x.v<6e7&&(!YEAR||x.m.startsWith(YEAR)));
const comp=comMed.length?comMed[comMed.length-1].m:porMes[porMes.length-1].m;
console.log("\n>>> competência com folha:", comp);
await selVal("anoMes",comp);
const mtx=(await cube(["nomeCargo"],["Count(DISTINCT numeroCPF)","Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])"],500)).map(r=>({cargo:r[0].qText||"",n:+r[1].qNum||0,v:+r[2].qNum||0}));
const mer=mtx.filter(r=>/aliment|merend|cozinh/i.test(r.cargo));
console.log(`\n=== MERENDA — cargos (${comp}) ===`); let tN=0,tV=0;
mer.forEach(r=>{tN+=r.n;tV+=r.v;console.log(`  ${r.cargo.padEnd(44)} ${String(r.n).padStart(3)} | R$ ${Math.round(r.v).toLocaleString('pt-BR')}`);});
console.log(`\n>>> MERENDA folha própria ${comp}: ${tN} servidores · R$ ${Math.round(tV).toLocaleString('pt-BR')}/mês`);
console.log(`>>> anualizado (×13.33): R$ ${Math.round(tV*13.33).toLocaleString('pt-BR')}/ano`);
console.log(`>>> média/servidor: R$ ${tN?Math.round(tV/tN).toLocaleString('pt-BR'):0}/mês`);
ws.close();
