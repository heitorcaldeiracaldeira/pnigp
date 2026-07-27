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
if(appH==null){console.log("fail");process.exit(1);}
async function selVal(f,v){const g=await rpc("GetField",appH,[f]);return (await rpc("Select",g.qReturn.qHandle,[v,false,0])).qReturn;}
async function selMany(f,vs){const g=await rpc("GetField",appH,[f]);return await rpc("SelectValues",g.qReturn.qHandle,[vs.map(v=>({qText:v})),false,false]);}
async function cube(dims,meas,h=3000){const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),qMeasures:meas.map(m=>({qDef:{qDef:m}})),qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+meas.length}]}}]);const l=await rpc("GetLayout",o.qReturn.qHandle,[]);return (l.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[]);}
const BRUTO="Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";
await selVal("cidade","Jaraguá do Sul"); await selVal("Poder","Executivo"); await selVal("anoMes","202511");
// 1) lotações que gerenciam alimentação (central, na SME)
const lot=(await cube(["descricaoLotacao"],["Count(DISTINCT numeroCPF)",BRUTO],700)).map(r=>({l:r[0].qText||"",n:+r[1].qNum||0,v:+r[2].qNum||0}));
console.log("=== lotações ~ aliment/merend/nutri/gestão escolar ===");
lot.filter(x=>/aliment|merend|nutri|coordena.*(escolar|ensino)|gest.*escolar|departamento.*ensino|educa/i.test(x.l)).slice(0,25).forEach(x=>console.log(`  ${x.l.padEnd(48)} ${String(x.n).padStart(4)} | R$ ${Math.round(x.v).toLocaleString('pt-BR')}`));
// 2) roster de NUTRICIONISTAS (os gestores técnicos do programa)
const nut=(await cube(["nome","nomeCargo","descricaoLotacao"],[BRUTO],1500)).map(r=>({nome:r[0].qText||"",cargo:r[1].qText||"",lot:r[2].qText||"",v:+r[3].qNum||0})).filter(r=>/nutricion/i.test(r.cargo)&&r.nome);
console.log(`\n=== NUTRICIONISTAS (rede municipal) — ${nut.length} ===`);
nut.sort((a,b)=>b.v-a.v).forEach(r=>console.log(`  ${r.nome.slice(0,30).padEnd(30)} | ${r.cargo.slice(0,18).padEnd(18)} | R$ ${Math.round(r.v).toLocaleString('pt-BR').padStart(9)} | ${r.lot.slice(0,34)}`));
console.log(`  >>> ${nut.length} nutricionistas · R$ ${Math.round(nut.reduce((s,r)=>s+r.v,0)).toLocaleString('pt-BR')}/mês`);
ws.close();
