import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const url="https://pncp.gov.br/pncp-api/v1/orgaos/82892282000143/compras/2025/96/arquivos/2";
const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(60000)});
const ct=r.headers.get("content-type"), cd=r.headers.get("content-disposition");
const buf=Buffer.from(await r.arrayBuffer());
fs.writeFileSync(OUT+"TR_merenda.pdf", buf);
console.log("status",r.status,"type",ct,"disp",cd,"bytes",buf.length);
