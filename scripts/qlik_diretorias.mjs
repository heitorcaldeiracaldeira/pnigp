import fs from "fs";
process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
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
async function cube(dims,measures,h=40){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),qMeasures:measures.map(m=>({qDef:{qDef:m}})),qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+measures.length}]}}]); const lay=await rpc("GetLayout",o.qReturn.qHandle,[]); return lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[]; }
const BRUTO="Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";
const DESC="Sum({<sinal_val_pagamento={'negativo'}>}[val_pagamento])";
const LOTS=["DIRETORIA ADMINISTRATIVO E OPERACIONAL","DIRETORIA OPERACIONAL","DIR GESTAO DE PESSOAL DA EDUCACAO"];
const todos=[];
for(const L of LOTS){
  await rpc("ClearAll",appH,[false]);
  await selVal("nomeUG","Prefeitura Municipal de Florianópolis");
  await selVal("anoMes","202512");
  await selVal("descricaoLotacao",L);
  const r=await cube(["nome","nomeCargo"],[BRUTO,DESC],40);
  console.log(`\n[${L}] (${r.length})`);
  r.map(x=>({nome:x[0].qText,cargo:x[1].qText,bruto:x[2].qNum,liquido:x[2].qNum-x[3].qNum,lotacao:L}))
   .filter(x=>x.nome&&x.nome!=="-").sort((a,b)=>b.bruto-a.bruto)
   .forEach(x=>{ todos.push(x); console.log(`  ${x.nome} | ${x.cargo} | bruto R$ ${x.bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})} | líq R$ ${x.liquido.toLocaleString("pt-BR",{minimumFractionDigits:2})}`); });
}
fs.writeFileSync(OUT+"folha_diretorias.json", JSON.stringify(todos,null,1));
ws.close();
