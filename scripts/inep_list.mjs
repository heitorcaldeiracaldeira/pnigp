import fs from "fs"; import zlib from "zlib";
process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const log=m=>{fs.appendFileSync(OUT+"inep_list.txt", m+"\n");};
const ANO="2024";
const r=await fetch(`https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_${ANO}.zip`,{signal:AbortSignal.timeout(300000)});
const buf=Buffer.from(await r.arrayBuffer());
log("baixado "+Math.round(buf.length/1048576)+"MB");
let eo=-1; for(let i=buf.length-22;i>=0 && i>buf.length-22-65536;i--) if(buf.readUInt32LE(i)===0x06054b50){eo=i;break;}
let p=buf.readUInt32LE(eo+16); const n=buf.readUInt16LE(eo+10);
const names=[];
for(let k=0;k<n;k++){ const nameLen=buf.readUInt16LE(p+28),extraLen=buf.readUInt16LE(p+30),commLen=buf.readUInt16LE(p+32); const name=buf.toString("latin1",p+46,p+46+nameLen); names.push(name); p+=46+nameLen+extraLen+commLen; }
log("entradas ("+names.length+"):"); names.forEach(x=>log("  "+x));
fs.writeFileSync(OUT+"inep_2024_buf.bin", buf); // guarda p/ nao rebaixar
