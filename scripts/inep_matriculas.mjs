import fs from "fs"; import zlib from "zlib";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const buf=fs.readFileSync(OUT+"inep_2024_buf.bin");
let eo=-1; for(let i=buf.length-22;i>=0 && i>buf.length-22-65536;i--) if(buf.readUInt32LE(i)===0x06054b50){eo=i;break;}
let p=buf.readUInt32LE(eo+16); const n=buf.readUInt16LE(eo+10); let csv=null;
for(let k=0;k<n;k++){ const method=buf.readUInt16LE(p+10),compSize=buf.readUInt32LE(p+20),nameLen=buf.readUInt16LE(p+28),extraLen=buf.readUInt16LE(p+30),commLen=buf.readUInt16LE(p+32),lho=buf.readUInt32LE(p+42); const name=buf.toString("latin1",p+46,p+46+nameLen);
  if(name.endsWith("microdados_ed_basica_2024.csv")){ const lN=buf.readUInt16LE(lho+26),lE=buf.readUInt16LE(lho+28),ds=lho+30+lN+lE; const comp=buf.subarray(ds,ds+compSize); csv=(method===0?Buffer.from(comp):zlib.inflateRawSync(comp)).toString("latin1"); break; }
  p+=46+nameLen+extraLen+commLen; }
const nl=csv.indexOf("\n"); const head=csv.slice(0,nl).split(";").map(h=>h.replace(/^"|"$/g,"").trim());
const ix=x=>head.indexOf(x);
const C={mun:ix("CO_MUNICIPIO"),dep:ix("TP_DEPENDENCIA"),sit:ix("TP_SITUACAO_FUNCIONAMENTO"),
 bas:ix("QT_MAT_BAS"),inf:ix("QT_MAT_INF"),cre:ix("QT_MAT_INF_CRE"),pre:ix("QT_MAT_INF_PRE"),
 fund:ix("QT_MAT_FUND"),med:ix("QT_MAT_MED"),eja:ix("QT_MAT_EJA"),creint:ix("QT_MAT_INF_CRE_INT"),preint:ix("QT_MAT_INF_PRE_INT"),fundint:ix("QT_MAT_FUND_INT")};
console.log("campos QT_MAT achados:", Object.entries(C).filter(([k,v])=>v>=0).map(([k])=>k).join(","));
console.log("campos QT_MAT no header:", head.filter(h=>/^QT_MAT/.test(h)).join(", "));
const S={bas:0,inf:0,cre:0,pre:0,fund:0,med:0,eja:0,creint:0,preint:0,fundint:0,esc:0};
const lines=csv.split(/\r?\n/);
for(let L=1;L<lines.length;L++){ if(!lines[L])continue; const c=lines[L].split(";").map(x=>x.replace(/^"|"$/g,""));
  if(c[C.mun]!=="4205407")continue; if(c[C.sit]!=="1")continue; if(c[C.dep]!=="3")continue; S.esc++;
  for(const k of ["bas","inf","cre","pre","fund","med","eja","creint","preint","fundint"]){ if(C[k]>=0){ const v=parseInt(c[C[k]],10); if(!isNaN(v))S[k]+=v; } }
}
console.log("\n=== Floripa MUNICIPAL (Censo INEP 2024) ===");
console.log("escolas:",S.esc);
console.log("Básica total:",S.bas,"| Infantil:",S.inf,"(creche",S.cre,"+ pré",S.pre,") | Fundamental:",S.fund,"| Médio:",S.med,"| EJA:",S.eja);
console.log("TEMPO INTEGRAL: creche "+S.creint+"/"+S.cre+" ("+(S.creint/S.cre*100).toFixed(0)+"%), pré "+S.preint+"/"+S.pre+" ("+(S.preint/S.pre*100).toFixed(0)+"%), fund "+S.fundint+"/"+S.fund+" ("+(S.fundint/S.fund*100).toFixed(0)+"%)");
console.log("PARCIAL: creche "+(S.cre-S.creint)+", pré "+(S.pre-S.preint)+", fund "+(S.fund-S.fundint));
