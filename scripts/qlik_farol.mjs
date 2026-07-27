import fs from "fs";
process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const HOST="paineistransparencia.tce.sc.gov.br";
const APP="4da65a01-68df-47e2-b05f-97249d916192";
const URL=`wss://${HOST}/app/${APP}`;

function connect(){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(URL);
    const pend=new Map(); let id=0;
    ws.addEventListener("open",()=>console.log("WS aberto"));
    ws.addEventListener("error",e=>reject(new Error("WS erro: "+(e.message||e.type))));
    ws.addEventListener("close",e=>console.log("WS fechado",e.code,e.reason||""));
    ws.addEventListener("message",ev=>{
      let m; try{m=JSON.parse(ev.data);}catch{return;}
      if(m.method==="OnConnected"){ resolve({rpc,ws}); return; }
      if(m.id!=null && pend.has(m.id)){ const {res,rej}=pend.get(m.id); pend.delete(m.id); if(m.error)rej(new Error(JSON.stringify(m.error))); else res(m.result); }
    });
    function rpc(method,handle,params){ return new Promise((res,rej)=>{ const i=++id; pend.set(i,{res,rej}); ws.send(JSON.stringify({jsonrpc:"2.0",method,handle,params,id:i})); setTimeout(()=>{ if(pend.has(i)){pend.delete(i);rej(new Error("timeout "+method));} },30000); }); }
    // fallback: se OnConnected nao vier em 5s, resolve mesmo assim
    setTimeout(()=>resolve({rpc,ws}),5000);
  });
}

const {rpc,ws}=await connect();
console.log("conectado, abrindo doc...");
const open=await rpc("OpenDoc",-1,[APP,"","","",false]);
const appH=open.qReturn.qHandle;
console.log("app handle:",appH);
const tk=await rpc("GetTablesAndKeys",appH,[{qcx:1000,qcy:1000},{qcx:0,qcy:0},30,true,false]);
const tables=tk.qtr||[];
console.log("\n=== TABELAS e CAMPOS ===");
for(const t of tables){ console.log(`\n[${t.qName}] ${t.qNoOfRows} linhas`); console.log("  campos:", (t.qFields||[]).map(f=>f.qName).join(" | ")); }
fs.writeFileSync(OUT+"farol_schema.json", JSON.stringify(tables,null,1));
ws.close();
