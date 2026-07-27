import fs from "fs";
process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const HOST="paineistransparencia.tce.sc.gov.br";
const APP="4da65a01-68df-47e2-b05f-97249d916192";
const URL=`wss://${HOST}/app/${APP}`;
function connect(){ return new Promise((resolve,reject)=>{
  const ws=new WebSocket(URL); const pend=new Map(); let id=0; let onconn=false;
  ws.addEventListener("error",e=>reject(new Error("WS erro")));
  ws.addEventListener("open",()=>{ setTimeout(()=>resolve({rpc,ws}),300); });
  ws.addEventListener("message",ev=>{ let m; try{m=JSON.parse(ev.data);}catch{return;}
    if(m.method==="OnConnected"){ onconn=true; resolve({rpc,ws}); return; }
    if(m.id!=null&&pend.has(m.id)){ const {res,rej}=pend.get(m.id); pend.delete(m.id); if(m.error)rej(new Error(JSON.stringify(m.error))); else res(m.result); } });
  function rpc(method,handle,params){ return new Promise((res,rej)=>{ const i=++id; pend.set(i,{res,rej}); ws.send(JSON.stringify({jsonrpc:"2.0",method,handle,params,id:i})); setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+method));}},40000); }); }
}); }
const {rpc,ws}=await connect();
let appH=null;
for(let a=1;a<=4;a++){ try{ const open=await rpc("OpenDoc",-1,[APP,"","","",false]); appH=open.qReturn.qHandle; break; }catch(e){ console.log("OpenDoc tent",a,"falhou; retry"); await new Promise(s=>setTimeout(s,2500)); } }
if(appH==null){ console.log("OpenDoc falhou 4x"); process.exit(1); }
console.log("app handle:",appH);

async function fieldValues(field,n=20,term=null){
  const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"lb"},qListObjectDef:{qDef:{qFieldDefs:[field]},qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:n,qWidth:1}]}}]);
  const h=o.qReturn.qHandle;
  if(term){ await rpc("SearchListObjectFor",h,["/qListObjectDef",term]); await rpc("AcceptListObjectSearch",h,["/qListObjectDef",true]); }
  const lay=await rpc("GetLayout",h,[]);
  const dp=lay.qLayout.qListObject.qDataPages?.[0]?.qMatrix||[];
  return {h,vals:dp.map(r=>({t:r[0].qText,s:r[0].qState}))};
}
// seleciona por valor EXATO no campo (via Field API)
async function selectValue(field,valor){
  const gf=await rpc("GetField",appH,[field]); const fh=gf.qReturn.qHandle;
  const r=await rpc("Select",fh,[valor,false,0]);
  return r.qReturn;
}
// 1) competencias disponiveis
const am=await fieldValues("anoMes",60);
console.log("\nanoMes disponiveis (ult 12):", am.vals.map(v=>v.t).slice(-12).join(" | "), "| total", am.vals.length);
// 2) achar Florianopolis no campo cidade
const cidF=await fieldValues("cidade",30,"Florianópolis");
console.log("\ncidade ~Florianópolis:", cidF.vals.map(v=>v.t).join(" | "));
// 3) selecionar Florianópolis (valor exato)
const ok=await selectValue("cidade","Florianópolis");
console.log("selecionou 'Florianópolis':", ok);
const poder=await fieldValues("Poder",10);
console.log("Poder (apos sel Floripa):", poder.vals.filter(v=>v.s!=="X").map(v=>v.t).join(" | "));
// 4) hypercube: UGs de Floripa x nº de servidores (CPF distinto)
const hc=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{
  qDimensions:[{qDef:{qFieldDefs:["nomeUG"]}}],
  qMeasures:[{qDef:{qDef:"Count(DISTINCT numeroCPF)"}}],
  qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:40,qWidth:2}]}}]);
const lay=await rpc("GetLayout",hc.qReturn.qHandle,[]);
const mtx=lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[];
console.log("\n=== UGs de Florianópolis x nº servidores (CPF distinto) ===");
mtx.forEach(r=>console.log(`  ${r[0].qText} : ${r[1].qText}`));
ws.close();
