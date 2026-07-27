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
async function searchList(field,term,n=60){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"lb"},qListObjectDef:{qDef:{qFieldDefs:[field]},qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:n,qWidth:1}]}}]); const h=o.qReturn.qHandle; await rpc("SearchListObjectFor",h,["/qListObjectDef",term]); const lay=await rpc("GetLayout",h,[]); return (lay.qLayout.qListObject.qDataPages?.[0]?.qMatrix||[]).map(r=>r[0].qText); }
async function cube(dims,measures,h=10){ const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),qMeasures:measures.map(m=>({qDef:{qDef:m}})),qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+measures.length}]}}]); const lay=await rpc("GetLayout",o.qReturn.qHandle,[]); return lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[]; }
const BRUTO="Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";
const ALVOS=[
 {term:"SCHREINER",full:"KATHERINE SCHREINER",papel:"Ordenadora de despesa / Sec. Licitações (SMLCP)"},
 {term:"BUENAVIDES",full:"RODRIGO BUENAVIDES RODRIGUES",papel:"Pregoeiro"},
 {term:"MELLO PEIXOTO",full:"THIAGO MELLO PEIXOTO DA SILVEIRA",papel:"Secretário de Educação / gestor do contrato"},
 {term:"ALEXANDRE FARIAS LUZ",full:"ALEXANDRE FARIAS LUZ",papel:"Responsável jurídico"},
 {term:"EDGARD PINTO",full:"EDGARD PINTO JUNIOR",papel:"Parecer jurídico (OAB)"},
 {term:"CAROLINA DE ARAUJO GOMES",full:"MARCIA CAROLINA DE ARAUJO GOMES",papel:"Chefia (assinou TR/ETP)"},
];
const AM="202506";
await selVal("nomeUG","Prefeitura Municipal de Florianópolis"); // escopo Floripa
const out=[];
for(const a of ALVOS){
  await rpc("ClearAll",appH,[false]);
  const cand=await searchList("nome",a.term,60);
  // acha exato: nome candidato que contém TODOS os tokens do full
  const toks=norm(a.full).split(" ");
  const exato=cand.find(c=>{ const nc=norm(c); return toks.every(t=>nc.split(" ").includes(t)); }) || cand.find(c=>norm(c)===norm(a.full));
  if(!exato){ console.log(`\n${a.full} (${a.papel}): NÃO ACHADO (candidatos: ${cand.slice(0,4).join(", ")||"nenhum"})`); out.push({...a,achado:false}); continue; }
  await selVal("nomeUG","Prefeitura Municipal de Florianópolis"); await selVal("anoMes",AM); await selVal("nome",exato);
  const r=await cube(["nome","nomeCargo","descricaoLotacao"],[BRUTO],10);
  if(r.length){ const x=r[0]; console.log(`\n${exato} | ${a.papel}\n   cargo ${x[1].qText} | lot ${x[2].qText} | bruto R$ ${x[3].qNum.toLocaleString("pt-BR",{minimumFractionDigits:2})} (jun/2025)`); out.push({nome:exato,papel:a.papel,cargo:x[1].qText,lotacao:x[2].qText,bruto:x[3].qNum,achado:true}); }
  else { console.log(`\n${exato} | ${a.papel}: achado no cadastro mas sem folha em ${AM}`); out.push({nome:exato,papel:a.papel,achado:true,bruto:0}); }
}
fs.writeFileSync(OUT+"folha_processo.json", JSON.stringify({anoMes:AM,servidores:out},null,1));
ws.close();
