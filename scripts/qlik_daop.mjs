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
async function cube(dims,measures,h=400){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),qMeasures:measures.map(m=>({qDef:{qDef:m}})),qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+measures.length}]}}]); const lay=await rpc("GetLayout",o.qReturn.qHandle,[]); return lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[]; }
const BRUTO="Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";
const DESC="Sum({<sinal_val_pagamento={'negativo'}>}[val_pagamento])";

await rpc("ClearAll",appH,[false]);
await selVal("nomeUG","Prefeitura Municipal de Florianópolis");
await selVal("anoMes","202512");
const LOTS=["DIRETORIA OPERACIONAL","DIRETORIA ADMINISTRATIVO E OPERACIONAL","GERENTE DE APOIO OPERACIONAL"];
for(const l of LOTS) await selVal("descricaoLotacao",l);
const all=await cube(["nome","nomeCargo","descricaoLotacao","jornadaTrabalhoSemanal"],[BRUTO,DESC],400);
const rows=all.map(r=>({nome:r[0].qText,cargo:r[1].qText,lotacao:r[2].qText,jornada:r[3].qText,bruto:r[4].qNum,liquido:r[4].qNum-r[5].qNum})).filter(x=>x.nome&&x.nome!=="-").sort((a,b)=>a.lotacao.localeCompare(b.lotacao)||b.bruto-a.bruto);
console.log(`\n=== Servidores das lotações operacionais (DAOP) — Prefeitura Floripa dez/2025 — ${rows.length} ===`);
let curL="";
rows.forEach(r=>{ if(r.lotacao!==curL){ console.log(`\n[${r.lotacao}]`); curL=r.lotacao; } console.log(`  ${r.nome} | ${r.cargo} | ${r.jornada}h | bruto R$ ${r.bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})} | líq R$ ${r.liquido.toLocaleString("pt-BR",{minimumFractionDigits:2})}`); });
// destaque: nutricionistas (o núcleo da alimentação)
const nutri=rows.filter(r=>/NUTRICION/i.test(r.cargo));
console.log(`\n>>> NUTRICIONISTAS nessas lotações: ${nutri.length}`);
nutri.forEach(r=>console.log(`  ${r.nome} | ${r.lotacao} | R$ ${r.bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})}`));
fs.writeFileSync(OUT+"folha_daop_farol.json", JSON.stringify({anoMes:"202512",lotacoes:LOTS,servidores:rows},null,1));
ws.close();
