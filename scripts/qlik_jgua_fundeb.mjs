process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
const APP="4da65a01-68df-47e2-b05f-97249d916192";
const URL=`wss://paineistransparencia.tce.sc.gov.br/app/${APP}`;
function connect(){return new Promise((resolve,reject)=>{const ws=new WebSocket(URL);const pend=new Map();let id=0;
  ws.addEventListener("error",()=>reject(new Error("WS")));ws.addEventListener("open",()=>setTimeout(()=>resolve({rpc,ws}),300));
  ws.addEventListener("message",ev=>{let m;try{m=JSON.parse(ev.data);}catch{return;}if(m.id!=null&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);if(m.error)rej(new Error(JSON.stringify(m.error)));else res(m.result);}});
  function rpc(method,handle,params){return new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({jsonrpc:"2.0",method,handle,params,id:i}));setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("t "+method));}},30000);});}});}
const {rpc,ws}=await connect();
let appH=null;for(let a=1;a<=5;a++){try{const o=await rpc("OpenDoc",-1,[APP,"","","",false]);appH=o.qReturn.qHandle;break;}catch{await new Promise(s=>setTimeout(s,2000));}}
if(appH==null){console.log("fail");process.exit(1);}
async function selVal(f,v){const g=await rpc("GetField",appH,[f]);return (await rpc("Select",g.qReturn.qHandle,[v,false,0])).qReturn;}
async function cube(dims,meas,h=3000){const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),qMeasures:meas.map(m=>({qDef:{qDef:m}})),qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+meas.length}]}}]);const l=await rpc("GetLayout",o.qReturn.qHandle,[]);return (l.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[]);}
const BRUTO="Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";
await selVal("cidade","Jaraguá do Sul");await selVal("Poder","Executivo");await selVal("anoMes","202511");
const m=(await cube(["nomeCargo","descricaoLotacao"],["Count(DISTINCT numeroCPF)",BRUTO],4000)).map(r=>({cargo:r[0].qText||"",lot:r[1].qText||"",n:+r[2].qNum||0,v:+r[3].qNum||0})).filter(r=>/aliment|merend/i.test(r.cargo));
console.log("=== MERENDEIRAS por LOTAÇÃO (=fonte de recurso), 202511 ===");
const byLot={}; for(const r of m){ if(!byLot[r.lot])byLot[r.lot]={n:0,v:0}; byLot[r.lot].n+=r.n; byLot[r.lot].v+=r.v; }
let tF=0,tP=0,tN=0;
Object.entries(byLot).sort((a,b)=>b[1].v-a[1].v).forEach(([lot,x])=>{ const fundeb=/fundeb/i.test(lot); if(fundeb){tF+=x.v;}else{tP+=x.v;} tN+=x.n;
  console.log(`  ${fundeb?'[FUNDEB]':'[outra ]'} ${lot.slice(0,44).padEnd(44)} ${String(x.n).padStart(4)} | R$ ${Math.round(x.v).toLocaleString('pt-BR')}`); });
console.log(`\n>>> ${tN} merendeiras · FUNDEB R$ ${Math.round(tF).toLocaleString('pt-BR')} (${Math.round(tF/(tF+tP)*100)}%) · outras fontes R$ ${Math.round(tP).toLocaleString('pt-BR')}`);
ws.close();
