import fs from "fs";
process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const APP="4da65a01-68df-47e2-b05f-97249d916192";
const URL=`wss://paineistransparencia.tce.sc.gov.br/app/${APP}`;
function connect(){ return new Promise((resolve,reject)=>{ const ws=new WebSocket(URL); const pend=new Map(); let id=0;
  ws.addEventListener("error",()=>reject(new Error("WS erro")));
  ws.addEventListener("open",()=>setTimeout(()=>resolve({rpc,ws}),300));
  ws.addEventListener("message",ev=>{ let m; try{m=JSON.parse(ev.data);}catch{return;} if(m.method==="OnConnected"){resolve({rpc,ws});return;} if(m.id!=null&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);if(m.error)rej(new Error(JSON.stringify(m.error)));else res(m.result);} });
  function rpc(method,handle,params){ return new Promise((res,rej)=>{ const i=++id; pend.set(i,{res,rej}); ws.send(JSON.stringify({jsonrpc:"2.0",method,handle,params,id:i})); setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+method));}},45000); }); }
}); }
const {rpc,ws}=await connect();
let appH=null; for(let a=1;a<=6;a++){ try{ const o=await rpc("OpenDoc",-1,[APP,"","","",false]); appH=o.qReturn.qHandle; break; }catch{ await new Promise(s=>setTimeout(s,2500)); } }
console.log("app",appH);
async function selVal(field,valor){ const gf=await rpc("GetField",appH,[field]); await rpc("Select",gf.qReturn.qHandle,[valor,false,0]); }
async function cube(dims,measures,h=400){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),qMeasures:measures.map(m=>({qDef:{qDef:m}})),qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+measures.length}]}}]); const lay=await rpc("GetLayout",o.qReturn.qHandle,[]); return lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[]; }
async function searchSelect(field,term){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"lb"},qListObjectDef:{qDef:{qFieldDefs:[field]},qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:20,qWidth:1}]}}]); const h=o.qReturn.qHandle; await rpc("SearchListObjectFor",h,["/qListObjectDef",term]); await rpc("AcceptListObjectSearch",h,["/qListObjectDef",true]); }
const BRUTO="Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";

await rpc("ClearAll",appH,[false]);
await selVal("nomeUG","Prefeitura Municipal de Florianópolis");
await selVal("anoMes","202512");
// 1) busca os nomes conhecidos do DEPAE, vê lotação real
const NOMES=["CARLA CRISTINA BRITTO","LIDIAMARA DORNELLES","GISELE LILIAM","RAQUEL ERDMANN","RENATA BRODBECK"];
const lotacoesEncontradas=new Set();
console.log("\n=== busca por nome (DEPAE conhecidos) ===");
for(const nm of NOMES){
  await selVal("nomeUG","Prefeitura Municipal de Florianópolis"); await selVal("anoMes","202512");
  await searchSelect("nome",nm);
  const r=await cube(["nome","nomeCargo","descricaoLotacao"],[BRUTO],10);
  if(r.length){ r.forEach(x=>{ console.log(`  ${x[0].qText} | ${x[1].qText} | LOT: ${x[2].qText} | R$ ${x[3].qText}`); lotacoesEncontradas.add(x[2].qText); }); }
  else console.log(`  ${nm}: não achou`);
  await rpc("ClearAll",appH,[false]);
}
console.log("\nLOTAÇÕES REAIS do DEPAE:", [...lotacoesEncontradas].join(" | "));
// 2) puxa TODOS os servidores dessas lotações
await selVal("nomeUG","Prefeitura Municipal de Florianópolis"); await selVal("anoMes","202512");
for(const l of lotacoesEncontradas){ await selVal("descricaoLotacao",l); }
const all=await cube(["nome","nomeCargo","descricaoLotacao","jornadaTrabalhoSemanal"],[BRUTO,"Sum({<sinal_val_pagamento={'negativo'}>}[val_pagamento])"],400);
const rows=all.map(r=>({nome:r[0].qText,cargo:r[1].qText,lotacao:r[2].qText,jornada:r[3].qText,bruto:r[4].qNum,liquido:r[4].qNum-r[5].qNum})).filter(x=>x.nome&&x.nome!=="-").sort((a,b)=>b.bruto-a.bruto);
console.log(`\n=== TODOS os servidores das lotações do DEPAE (${rows.length}) — dez/2025 ===`);
rows.forEach(r=>console.log(`  ${r.nome} | ${r.cargo} | ${r.jornada}h | LOT: ${r.lotacao} | bruto R$ ${r.bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})}`));
const tb=rows.reduce((s,x)=>s+x.bruto,0);
console.log(`  TOTAL bruto R$ ${tb.toLocaleString("pt-BR",{minimumFractionDigits:2})} | média R$ ${rows.length?(tb/rows.length).toLocaleString("pt-BR",{minimumFractionDigits:2}):0}`);
fs.writeFileSync(OUT+"folha_depae_farol.json", JSON.stringify({anoMes:"202512",lotacoes:[...lotacoesEncontradas],servidores:rows},null,1));
ws.close();
