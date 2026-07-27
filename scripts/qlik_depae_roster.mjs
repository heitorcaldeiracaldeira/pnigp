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
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/['´`]/g,"").toUpperCase().replace(/\s+/g," ").trim();
async function selVal(field,valor){ const gf=await rpc("GetField",appH,[field]); await rpc("Select",gf.qReturn.qHandle,[valor,false,0]); }
async function searchSel(field,term){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"lb"},qListObjectDef:{qDef:{qFieldDefs:[field]},qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:5,qWidth:1}]}}]); const h=o.qReturn.qHandle; await rpc("SearchListObjectFor",h,["/qListObjectDef",term]); await rpc("AcceptListObjectSearch",h,["/qListObjectDef",true]); }
async function cube(dims,measures,h=30){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),qMeasures:measures.map(m=>({qDef:{qDef:m}})),qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+measures.length}]}}]); const lay=await rpc("GetLayout",o.qReturn.qHandle,[]); return lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[]; }
const BRUTO="Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";
const DESC="Sum({<sinal_val_pagamento={'negativo'}>}[val_pagamento])";

const ROSTER=[
 {n:"CARLA CRISTINA BRITTO",papel:"Coordenadora"},
 {n:"GISELE LILIAM DAVILA",papel:"Nutricionista"},
 {n:"LIDIAMARA DORNELLES DE SOUZA",papel:"Nutricionista (Resp. Técnica)"},
 {n:"RAQUEL ERDMANN",papel:"Nutricionista"},
 {n:"RENATA BRODBECK FAUST",papel:"Nutricionista"},
 {n:"DANIELE HACK ALVES COELHO",papel:"Administrativo"},
 {n:"GRAZIELA LADWIG DE SOUZA",papel:"Administrativo"},
 {n:"HELOISA HELENA BRAGA DE OLIVEIRA",papel:"Administrativo"},
 {n:"NATHALIA PEREIRA DA SILVA",papel:"Estagiária"},
];
const AM="202512";
const out=[];
for(const p of ROSTER){
  await rpc("ClearAll",appH,[false]);
  await selVal("nomeUG","Prefeitura Municipal de Florianópolis"); await selVal("anoMes",AM);
  await searchSel("nome",p.n);
  const r=await cube(["nome","nomeCargo","descricaoLotacao","jornadaTrabalhoSemanal"],[BRUTO,DESC],30);
  const exato=r.filter(x=>norm(x[0].qText)===norm(p.n));
  if(exato.length){ exato.forEach(x=>{ const bruto=x[4].qNum, desc=x[5].qNum; out.push({nome:x[0].qText,papel:p.papel,cargo:x[1].qText,lotacao:x[2].qText,bruto,liquido:bruto-desc}); console.log(`  ✓ ${x[0].qText} | ${x[1].qText} | ${x[2].qText} | R$ ${bruto.toFixed(2)}`); }); }
  else { out.push({nome:p.n,papel:p.papel,cargo:"(não achado em "+AM+")",lotacao:"-",bruto:0,liquido:0}); console.log(`  ✗ ${p.n}: não achado`); }
}
console.log(`\n=== FOLHA do DEPAE (Coordenadoria de Alimentação Escolar) — Prefeitura Floripa dez/2025 ===`);
out.forEach(r=>console.log(`  ${r.nome} | ${r.papel} | ${r.cargo} | LOT: ${r.lotacao} | bruto R$ ${r.bruto.toLocaleString("pt-BR",{minimumFractionDigits:2})} | líq R$ ${r.liquido.toLocaleString("pt-BR",{minimumFractionDigits:2})}`));
const tb=out.reduce((s,x)=>s+x.bruto,0), tl=out.reduce((s,x)=>s+x.liquido,0);
console.log(`\n  TOTAL bruto R$ ${tb.toLocaleString("pt-BR",{minimumFractionDigits:2})}/mês | líquido R$ ${tl.toLocaleString("pt-BR",{minimumFractionDigits:2})}/mês`);
console.log(`  Custo-empregador estimado (bruto × 1,20 encargos patronais) ≈ R$ ${(tb*1.2).toLocaleString("pt-BR",{minimumFractionDigits:2})}/mês · R$ ${(tb*1.2*13).toLocaleString("pt-BR",{minimumFractionDigits:2})}/ano (13 folhas)`);
fs.writeFileSync(OUT+"folha_depae_roster.json", JSON.stringify({anoMes:AM,fonte:"Farol TCE-SC Pessoal (e-Sfinge)",servidores:out},null,1));
ws.close();
