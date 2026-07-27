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
async function selVal(field,valor){ const gf=await rpc("GetField",appH,[field]); const r=await rpc("Select",gf.qReturn.qHandle,[valor,false,0]); return r.qReturn; }
async function cube(dims,measures,h=15){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),qMeasures:measures.map(m=>({qDef:{qDef:m}})),qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+measures.length}]}}]); const lay=await rpc("GetLayout",o.qReturn.qHandle,[]); return lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[]; }
const BRUTO="Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";
const DESC="Sum({<sinal_val_pagamento={'negativo'}>}[val_pagamento])";
const ROSTER=[
 ["CARLA CRISTINA BRITTO","Coordenadora"],
 ["GISELE LILIAM DAVILA","Nutricionista"],
 ["LIDIAMARA DORNELLES DE SOUZA","Nutricionista (RT)"],
 ["RAQUEL ERDMANN","Nutricionista"],
 ["RENATA BRODBECK FAUST","Nutricionista"],
 ["DANIELE HACK ALVES COELHO","Administrativo"],
 ["GRAZIELA LADWIG DE SOUZA","Administrativo"],
 ["HELOISA HELENA BRAGA DE OLIVEIRA","Administrativo"],
];
for(const AM of ["202506","202512"]){
  console.log(`\n================ ${AM} ${AM==="202512"?"(inclui 13º)":"(mês normal)"} ================`);
  const out=[];
  for(const [nome,papel] of ROSTER){
    await rpc("ClearAll",appH,[false]);
    await selVal("nomeUG","Prefeitura Municipal de Florianópolis");
    await selVal("anoMes",AM);
    await selVal("nome",nome);
    const r=await cube(["nome","nomeCargo","descricaoLotacao"],[BRUTO,DESC],10);
    if(r.length){ const x=r[0]; const bruto=x[3].qNum; out.push({nome:x[0].qText,papel,cargo:x[1].qText,lotacao:x[2].qText,bruto}); console.log(`  ${x[0].qText} | ${papel} | ${x[1].qText} | ${x[2].qText} | bruto R$ ${bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})}`); }
    else { out.push({nome,papel,cargo:"(sem folha)",bruto:0}); console.log(`  ${nome} | ${papel} | (sem folha em ${AM})`); }
  }
  const tb=out.reduce((s,x)=>s+x.bruto,0);
  console.log(`  --- TOTAL bruto ${out.filter(x=>x.bruto).length} servidores: R$ ${tb.toLocaleString("pt-BR",{minimumFractionDigits:2})}/mês`);
  if(AM==="202506") fs.writeFileSync(OUT+"folha_depae_roster.json", JSON.stringify({anoMes:AM,fonte:"Farol TCE-SC Pessoal",servidores:out},null,1));
}
ws.close();
