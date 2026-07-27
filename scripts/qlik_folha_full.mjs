import fs from "fs";
process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const APP="4da65a01-68df-47e2-b05f-97249d916192";
const URL=`wss://paineistransparencia.tce.sc.gov.br/app/${APP}`;
function connect(){ return new Promise((resolve,reject)=>{ const ws=new WebSocket(URL); const pend=new Map(); let id=0;
  ws.addEventListener("error",()=>reject(new Error("WS erro")));
  ws.addEventListener("open",()=>setTimeout(()=>resolve({rpc,ws}),300));
  ws.addEventListener("message",ev=>{ let m; try{m=JSON.parse(ev.data);}catch{return;} if(m.method==="OnConnected"){resolve({rpc,ws});return;} if(m.id!=null&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);if(m.error)rej(new Error(JSON.stringify(m.error)));else res(m.result);} });
  function rpc(method,handle,params){ return new Promise((res,rej)=>{ const i=++id; pend.set(i,{res,rej}); ws.send(JSON.stringify({jsonrpc:"2.0",method,handle,params,id:i})); setTimeout(()=>{if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+method));}},60000); }); }
}); }
const {rpc,ws}=await connect();
let appH=null; for(let a=1;a<=6;a++){ try{ const o=await rpc("OpenDoc",-1,[APP,"","","",false]); appH=o.qReturn.qHandle; break; }catch{ await new Promise(s=>setTimeout(s,2500)); } }
console.log("app",appH);
async function selVal(field,valor){ const gf=await rpc("GetField",appH,[field]); await rpc("Select",gf.qReturn.qHandle,[valor,false,0]); }
const BRUTO="Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";
const DESC="Sum({<sinal_val_pagamento={'negativo'}>}[val_pagamento])";
await rpc("ClearAll",appH,[false]);
await selVal("nomeUG","Prefeitura Municipal de Florianópolis");
await selVal("anoMes","202512");
// cria hypercube e pagina via GetHyperCubeData
const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{
  qDimensions:[{qDef:{qFieldDefs:["nome"]}},{qDef:{qFieldDefs:["nomeCargo"]}},{qDef:{qFieldDefs:["descricaoLotacao"]}}],
  qMeasures:[{qDef:{qDef:BRUTO}},{qDef:{qDef:DESC}}],
  qInitialDataFetch:[]}}]);
const oh=o.qReturn.qHandle;
const lay=await rpc("GetLayout",oh,[]);
const nrows=lay.qLayout.qHyperCube.qSize.qcy; const W=5;
console.log("linhas totais:",nrows);
const all=[]; const H=1800;
for(let top=0; top<nrows; top+=H){
  const d=await rpc("GetHyperCubeData",oh,["/qHyperCubeDef",[{qTop:top,qLeft:0,qHeight:H,qWidth:W}]]);
  const mtx=d.qDataPages?.[0]?.qMatrix||[];
  mtx.forEach(r=>all.push({nome:r[0].qText,cargo:r[1].qText,lotacao:r[2].qText,bruto:r[3].qNum,liquido:r[3].qNum-r[4].qNum}));
  process.stdout.write(`  ${all.length}/${nrows}\r`);
}
console.log("\ncoletado:",all.length);
fs.writeFileSync(OUT+"folha_floripa_full_202512.json", JSON.stringify(all));
// casa o roster DEPAE
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/['´`]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const ROSTER=[["CARLA CRISTINA BRITTO","Coordenadora"],["GISELE LILIAM DAVILA","Nutricionista"],["LIDIAMARA DORNELLES DE SOUZA","Nutricionista RT"],["RAQUEL ERDMANN","Nutricionista"],["RENATA BRODBECK FAUST","Nutricionista"],["DANIELE HACK ALVES COELHO","Administrativo"],["GRAZIELA LADWIG DE SOUZA","Administrativo"],["HELOISA HELENA BRAGA DE OLIVEIRA","Administrativo"],["NATHALIA PEREIRA DA SILVA","Estagiária"]];
console.log("\n=== FOLHA DEPAE (Coordenadoria de Alimentação Escolar) — dez/2025 ===");
const dep=[];
for(const [n,papel] of ROSTER){ const hits=all.filter(x=>norm(x.nome)===norm(n));
  if(hits.length) hits.forEach(h=>{ dep.push({...h,papel}); console.log(`  ${h.nome} | ${papel} | ${h.cargo} | LOT: ${h.lotacao} | bruto R$ ${h.bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})} | líq R$ ${h.liquido.toLocaleString("pt-BR",{minimumFractionDigits:2})}`); });
  else console.log(`  ${n} | ${papel} | (não consta na folha 202512)`);
}
const tb=dep.reduce((s,x)=>s+x.bruto,0);
console.log(`\n  TOTAL bruto R$ ${tb.toLocaleString("pt-BR",{minimumFractionDigits:2})}/mês · custo-empregador ~R$ ${(tb*1.2).toLocaleString("pt-BR",{minimumFractionDigits:2})}/mês · ~R$ ${(tb*1.2*13).toLocaleString("pt-BR",{minimumFractionDigits:2})}/ano`);
fs.writeFileSync(OUT+"folha_depae_roster.json", JSON.stringify({anoMes:"202512",fonte:"Farol TCE-SC Pessoal (e-Sfinge)",servidores:dep},null,1));
ws.close();
