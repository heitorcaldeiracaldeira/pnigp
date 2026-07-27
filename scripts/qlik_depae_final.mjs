import fs from "fs";
process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
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
for(let a=1;a<=6;a++){ try{ const o=await rpc("OpenDoc",-1,[APP,"","","",false]); appH=o.qReturn.qHandle; break; }catch{ await new Promise(s=>setTimeout(s,2500)); } }
console.log("app",appH);
async function selVal(field,valor){ const gf=await rpc("GetField",appH,[field]); await rpc("Select",gf.qReturn.qHandle,[valor,false,0]); }
async function listField(field,n,term){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"lb"},qListObjectDef:{qDef:{qFieldDefs:[field]},qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:n,qWidth:1}]}}]); const h=o.qReturn.qHandle; if(term)await rpc("SearchListObjectFor",h,["/qListObjectDef",term]); const lay=await rpc("GetLayout",h,[]); return (lay.qLayout.qListObject.qDataPages?.[0]?.qMatrix||[]).map(r=>({t:r[0].qText,s:r[0].qState})); }
async function cube(dims,measures,h=300){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),qMeasures:measures.map(m=>({qDef:{qDef:m}})),qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+measures.length}]}}]); const lay=await rpc("GetLayout",o.qReturn.qHandle,[]); return lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[]; }
const BRUTO="Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";
const DESC="Sum({<sinal_val_pagamento={'negativo'}>}[val_pagamento])";

await rpc("ClearAll",appH,[false]);
await selVal("nomeUG","Prefeitura Municipal de Florianópolis");
const AM="202512";
await selVal("anoMes",AM);
console.log("Prefeitura Floripa /",AM);
// acha lotações de alimentação/merenda/escolar
let lots=[];
for(const term of ["aliment","merenda","escolar","DEPAE","nutri"]){ const l=await listField("descricaoLotacao",60,term); l.filter(v=>v.s!=="X").forEach(v=>{ if(!lots.includes(v.t)) lots.push(v.t); }); }
console.log("\nlotações candidatas:", lots.join(" | ")||"(nenhuma)");
// pula as que são claramente não-alimentação; foca em ALIMENTA
const alim=lots.filter(l=>/ALIMENTA|MERENDA|DEPAE/i.test(l));
console.log("selecionando:", alim.join(" | "));
if(alim.length){
  for(const a of alim) await selVal("descricaoLotacao",a);
  const nom=await cube(["nome","nomeCargo"],[BRUTO,DESC],300);
  const rows=nom.map(r=>({nome:r[0].qText,cargo:r[1].qText,bruto:r[2].qNum,desconto:r[3].qNum,liquido:r[2].qNum-r[3].qNum})).filter(x=>x.nome&&x.nome!=="-");
  rows.sort((a,b)=>b.bruto-a.bruto);
  console.log(`\n=== FOLHA DEPAE/ALIMENTAÇÃO — Prefeitura Floripa ${AM} — ${rows.length} servidores ===`);
  rows.forEach(r=>console.log(`  ${r.nome} | ${r.cargo} | bruto R$ ${r.bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})} | líq R$ ${r.liquido.toLocaleString("pt-BR",{minimumFractionDigits:2})}`));
  const tb=rows.reduce((s,x)=>s+x.bruto,0);
  console.log(`  TOTAL bruto: R$ ${tb.toLocaleString("pt-BR",{minimumFractionDigits:2})} | média R$ ${(tb/rows.length).toLocaleString("pt-BR",{minimumFractionDigits:2})}`);
  fs.writeFileSync(OUT+"folha_depae_farol.json", JSON.stringify({anoMes:AM,ug:"Prefeitura Municipal de Florianópolis",lotacoes:alim,servidores:rows},null,1));
}
ws.close();
