import fs from "fs";
process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
const APP="4da65a01-68df-47e2-b05f-97249d916192";
const URL=`wss://paineistransparencia.tce.sc.gov.br/app/${APP}`;
function connect(){ return new Promise((resolve,reject)=>{ const ws=new WebSocket(URL); const pend=new Map(); let id=0;
  ws.addEventListener("error",()=>reject(new Error("WS erro")));
  ws.addEventListener("open",()=>setTimeout(()=>resolve({rpc,ws}),300));
  ws.addEventListener("message",ev=>{ let m; try{m=JSON.parse(ev.data);}catch{return;} if(m.method==="OnConnected"){resolve({rpc,ws});return;} if(m.id!=null&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);if(m.error)rej(new Error(JSON.stringify(m.error)));else res(m.result);} });
  function rpc(method,handle,params){ return new Promise((res,rej)=>{ const i=++id; pend.set(i,{res,rej}); ws.send(JSON.stringify({jsonrpc:"2.0",method,handle,params,id:i})); setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+method));}},50000); }); }
}); }
const {rpc,ws}=await connect();
let appH=null; for(let a=1;a<=6;a++){ try{ const o=await rpc("OpenDoc",-1,[APP,"","","",false]); appH=o.qReturn.qHandle; break; }catch{ await new Promise(s=>setTimeout(s,2500)); } }
console.log("app",appH);
async function selVal(field,valor){ const gf=await rpc("GetField",appH,[field]); await rpc("Select",gf.qReturn.qHandle,[valor,false,0]); }
async function searchList(field,term,n=120){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"lb"},qListObjectDef:{qDef:{qFieldDefs:[field]},qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:n,qWidth:1}]}}]); const h=o.qReturn.qHandle; await rpc("SearchListObjectFor",h,["/qListObjectDef",term]); const lay=await rpc("GetLayout",h,[]); return (lay.qLayout.qListObject.qDataPages?.[0]?.qMatrix||[]).map(r=>r[0].qText); }
async function cube(dims,measures,h=15){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),qMeasures:measures.map(m=>({qDef:{qDef:m}})),qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+measures.length}]}}]); const lay=await rpc("GetLayout",o.qReturn.qHandle,[]); return lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[]; }
const BRUTO="Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";

// 1) escopo Prefeitura Floripa
await rpc("ClearAll",appH,[false]);
await selVal("nomeUG","Prefeitura Municipal de Florianópolis");
for(const t of ["KATHERINE","CATHERINE","KATERINE","SCHREINER"]){
  const c=await searchList("nome",t,120);
  const sch=c.filter(x=>/SCHREINER|KATHERINE|CATHERINE|KATERINE/i.test(x));
  console.log(`\n"${t}" (${c.length}) -> Katherine/Schreiner: ${sch.join(" | ")||"—"}`);
}
// 2) se achar KATHERINE ... SCHREINER, puxa salario
await rpc("ClearAll",appH,[false]);
await selVal("nomeUG","Prefeitura Municipal de Florianópolis");
const cand=await searchList("nome","KATHERINE",120);
const kat=cand.find(x=>/SCHREINER/i.test(x)) || cand.find(x=>/KATHERINE/i.test(x));
if(kat){
  for(const AM of ["202506","202512"]){
    await rpc("ClearAll",appH,[false]); await selVal("nomeUG","Prefeitura Municipal de Florianópolis"); await selVal("anoMes",AM); await selVal("nome",kat);
    const r=await cube(["nome","nomeCargo","descricaoLotacao"],[BRUTO],10);
    if(r.length){ const x=r[0]; console.log(`\n[${AM}] ${x[0].qText} | ${x[1].qText} | ${x[2].qText} | bruto R$ ${x[3].qNum.toLocaleString("pt-BR",{minimumFractionDigits:2})}`); }
    else console.log(`\n[${AM}] ${kat}: sem folha`);
  }
} else console.log("\nKatherine não achada na Prefeitura de Floripa (pode ser comissionada em outra UG/nome distinto)");
ws.close();
