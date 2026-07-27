import fs from "fs";
process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
const HOST="paineistransparencia.tce.sc.gov.br";
const APP="4da65a01-68df-47e2-b05f-97249d916192";
const URL=`wss://${HOST}/app/${APP}`;
function connect(){ return new Promise((resolve,reject)=>{
  const ws=new WebSocket(URL); const pend=new Map(); let id=0;
  ws.addEventListener("error",()=>reject(new Error("WS erro")));
  ws.addEventListener("open",()=>setTimeout(()=>resolve({rpc,ws}),300));
  ws.addEventListener("message",ev=>{ let m; try{m=JSON.parse(ev.data);}catch{return;}
    if(m.method==="OnConnected"){ resolve({rpc,ws}); return; }
    if(m.id!=null&&pend.has(m.id)){ const {res,rej}=pend.get(m.id); pend.delete(m.id); if(m.error)rej(new Error(JSON.stringify(m.error))); else res(m.result); } });
  function rpc(method,handle,params){ return new Promise((res,rej)=>{ const i=++id; pend.set(i,{res,rej}); ws.send(JSON.stringify({jsonrpc:"2.0",method,handle,params,id:i})); setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+method));}},45000); }); }
}); }
const {rpc,ws}=await connect();
let appH=null;
for(let a=1;a<=5;a++){ try{ const o=await rpc("OpenDoc",-1,[APP,"","","",false]); appH=o.qReturn.qHandle; break; }catch{ await new Promise(s=>setTimeout(s,2500)); } }
console.log("app",appH);
async function selVal(field,valor){ const gf=await rpc("GetField",appH,[field]); await rpc("Select",gf.qReturn.qHandle,[valor,false,0]); }
async function listField(field,n,term){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"lb"},qListObjectDef:{qDef:{qFieldDefs:[field]},qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:n,qWidth:1}]}}]); const h=o.qReturn.qHandle; if(term)await rpc("SearchListObjectFor",h,["/qListObjectDef",term]); const lay=await rpc("GetLayout",h,[]); return (lay.qLayout.qListObject.qDataPages?.[0]?.qMatrix||[]).map(r=>({t:r[0].qText,s:r[0].qState})); }
async function cube(dims,measures,h=60){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),qMeasures:measures.map(m=>({qDef:{qDef:m}})),qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+measures.length}]}}]); const lay=await rpc("GetLayout",o.qReturn.qHandle,[]); return lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[]; }

await rpc("ClearAll",appH,[false]);
await selVal("nomeUG","Prefeitura Municipal de Florianópolis");
console.log("selecionado UG Prefeitura Floripa");
// valores distintos de sinal
const sinal=await listField("sinal_val_pagamento",10);
console.log("sinal_val_pagamento valores:", sinal.map(v=>v.t).join(" | "));
// probe meses: qual tem rubrica (val_pagamento)
console.log("\n=== por anoMes: servidores | Sum(val_pagamento) ===");
const meses=["202401","202406","202412","202506","202510","202512","202601","202604"];
for(const am of meses){ const r=await cube(["anoMes"],["Count(DISTINCT numeroCPF)","Sum([val_pagamento])"],1000);
  const row=r.find(x=>x[0].qText===am); console.log(`  ${am}: ${row?row[1].qText+" serv | R$ "+row[2].qText:"(sem linha)"}`); }
// lista total de meses com valor
const rAll=await cube(["anoMes"],["Sum([val_pagamento])"],60);
console.log("\nmeses com Sum(val_pagamento)>0:", rAll.filter(x=>x[1].qNum>0).map(x=>x[0].qText+"="+Math.round(x[1].qNum/1e6)+"mi").join(" | ")||"NENHUM");
ws.close();
