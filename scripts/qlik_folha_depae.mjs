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
for(let a=1;a<=5;a++){ try{ const o=await rpc("OpenDoc",-1,[APP,"","","",false]); appH=o.qReturn.qHandle; break; }catch{ await new Promise(s=>setTimeout(s,2500)); } }
if(appH==null){ console.log("OpenDoc falhou"); process.exit(1); }
console.log("app handle",appH);

async function listField(field,n=60,term=null){
  const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"lb"},qListObjectDef:{qDef:{qFieldDefs:[field]},qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:n,qWidth:1}]}}]);
  const h=o.qReturn.qHandle;
  if(term){ await rpc("SearchListObjectFor",h,["/qListObjectDef",term]); }
  const lay=await rpc("GetLayout",h,[]);
  const dp=lay.qLayout.qListObject.qDataPages?.[0]?.qMatrix||[];
  return dp.map(r=>({t:r[0].qText,s:r[0].qState}));
}
async function selVal(field,valor){ const gf=await rpc("GetField",appH,[field]); await rpc("Select",gf.qReturn.qHandle,[valor,false,0]); }
async function cube(dims,measures,h=200){
  const o=await rpc("CreateSessionObject",appH,[{qInfo:{qType:"tbl"},qHyperCubeDef:{
    qDimensions:dims.map(d=>({qDef:{qFieldDefs:[d]}})),
    qMeasures:measures.map(m=>({qDef:{qDef:m}})),
    qInitialDataFetch:[{qTop:0,qLeft:0,qHeight:h,qWidth:dims.length+measures.length}]}}]);
  const lay=await rpc("GetLayout",o.qReturn.qHandle,[]);
  return lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix||[];
}

// 1) seleciona Florianopolis (+ variante MAIUSCULA) + Executivo + competencia recente
await selVal("cidade","Florianópolis");
await selVal("Poder","Executivo");
const AM="202512";
await selVal("anoMes",AM);
console.log("selecionado: Florianópolis / Executivo / anoMes",AM);
// sanity: nº servidores + folha bruta total
const tot=await cube(["nomeUG"],["Count(DISTINCT numeroCPF)","Sum([val_pagamento]*[sinal_val_pagamento])"],40);
console.log("\n=== UGs do Executivo de Floripa (servidores | folha líquida) ===");
tot.forEach(r=>console.log(`  ${r[0].qText}: ${r[1].qText} serv | R$ ${r[2].qText}`));

// 2) lotações de alimentação
const lot=await listField("descricaoLotacao",80,"aliment");
console.log("\n=== lotações ~aliment ===", lot.filter(v=>v.s!=="X").map(v=>v.t).join(" | ")||"(nenhuma — listando amostra)");
if(!lot.some(v=>v.s!=="X")){ const amostra=await listField("descricaoLotacao",40); console.log("amostra lotações:", amostra.map(v=>v.t).slice(0,40).join(" | ")); }

// 3) tenta selecionar lotação de alimentação e puxar nominal
const alims=lot.filter(v=>v.s!=="X").map(v=>v.t);
if(alims.length){ for(const a of alims) await selVal("descricaoLotacao",a);
  const nom=await cube(["nome","nomeCargo","descricaoLotacao"],["Sum([val_pagamento]*[sinal_val_pagamento])","Sum({<sinal_val_pagamento={1}>}[val_pagamento])"],200);
  console.log(`\n=== FOLHA ALIMENTAÇÃO (${AM}) — ${nom.length} servidores ===`);
  nom.forEach(r=>console.log(`  ${r[0].qText} | ${r[1].qText} | ${r[2].qText} | líq R$ ${r[3].qText} | bruto R$ ${r[4].qText}`));
  fs.writeFileSync(OUT+"folha_depae_farol.json", JSON.stringify(nom.map(r=>({nome:r[0].qText,cargo:r[1].qText,lotacao:r[2].qText,liquido:r[3].qNum,bruto:r[4].qNum})),null,1));
}
ws.close();
