import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const HOST="https://transparencia.e-publica.net/epublica-portal/";
for(const f of ["scripts/main.min3.26.12-1784752364333.js","scripts/modulo.min3.26.12-1784752364333.js"]){
  const r=await fetch(HOST+f,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(60000)});
  const t=await r.text(); const nm="epub_"+f.split("/")[1];
  fs.writeFileSync(OUT+nm, t); console.log(nm, r.status, t.length);
}
