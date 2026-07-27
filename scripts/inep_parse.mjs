import fs from "fs"; import zlib from "zlib";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const log=m=>{fs.appendFileSync(OUT+"inep_parse.txt", m+"\n"); console.log(m);};
const buf=fs.readFileSync(OUT+"inep_2024_buf.bin");
const sufixo="microdados_ed_basica_2024.csv";
let eo=-1; for(let i=buf.length-22;i>=0 && i>buf.length-22-65536;i--) if(buf.readUInt32LE(i)===0x06054b50){eo=i;break;}
let p=buf.readUInt32LE(eo+16); const n=buf.readUInt16LE(eo+10); let csv=null;
for(let k=0;k<n;k++){ const method=buf.readUInt16LE(p+10),compSize=buf.readUInt32LE(p+20),nameLen=buf.readUInt16LE(p+28),extraLen=buf.readUInt16LE(p+30),commLen=buf.readUInt16LE(p+32),lho=buf.readUInt32LE(p+42); const name=buf.toString("latin1",p+46,p+46+nameLen);
  if(name.endsWith(sufixo)){ const lN=buf.readUInt16LE(lho+26),lE=buf.readUInt16LE(lho+28),ds=lho+30+lN+lE; const comp=buf.subarray(ds,ds+compSize); const raw=method===0?Buffer.from(comp):zlib.inflateRawSync(comp); csv=raw.toString("latin1"); log("descomprimido "+Math.round(raw.length/1048576)+"MB"); break; }
  p+=46+nameLen+extraLen+commLen; }
if(!csv){ log("nao achou"); process.exit(1); }
const nl=csv.indexOf("\n"); const head=csv.slice(0,nl).split(";").map(h=>h.replace(/^"|"$/g,"").trim());
const infra=head.filter(h=>/COZINHA|REFEIT|ALIMENT|IN_BANHEIRO|DESPENSA/i.test(h));
log("campos infra alim: "+infra.join(", "));
const ix=x=>head.indexOf(x);
const C={uf:ix("CO_UF"),mun:ix("CO_MUNICIPIO"),no:ix("NO_ENTIDADE"),co:ix("CO_ENTIDADE"),dep:ix("TP_DEPENDENCIA"),sit:ix("TP_SITUACAO_FUNCIONAMENTO"),coz:ix("IN_COZINHA"),ref:ix("IN_REFEITORIO"),ali:ix("IN_ALIMENTACAO"),desp:ix("IN_DESPENSA"),qtprof:ix("QT_PROF_ALIMENTACAO"),mat:ix("QT_MAT_BAS")};
log("indices: "+JSON.stringify(C));
const out=[]; let i=nl+1; let line;
// varre por municipio 4205407
const lines=csv.split(/\r?\n/);
for(let L=1;L<lines.length;L++){ if(!lines[L])continue; const c=lines[L].split(";").map(x=>x.replace(/^"|"$/g,"")); if(c[C.mun]!=="4205407")continue; if(c[C.sit]!=="1")continue;
  out.push({co:c[C.co],nome:c[C.no],dep:+c[C.dep],cozinha:C.coz>=0?c[C.coz]:null,refeitorio:C.ref>=0?c[C.ref]:null,alimentacao:C.ali>=0?c[C.ali]:null,despensa:C.desp>=0?c[C.desp]:null,qt_prof_alim:C.qtprof>=0?(parseInt(c[C.qtprof],10)||0):null,mat_censo:C.mat>=0?(parseInt(c[C.mat],10)||0):null}); }
fs.writeFileSync(OUT+"inep_cozinha.json", JSON.stringify(out,null,1));
const mun=out.filter(x=>x.dep===3);
log(`Floripa: ${out.length} escolas ativas (${mun.length} municipais)`);
log(`  municipais: cozinha ${mun.filter(x=>x.cozinha==="1").length}/${mun.length} · refeitorio ${mun.filter(x=>x.refeitorio==="1").length} · alimentacao ${mun.filter(x=>x.alimentacao==="1").length} · despensa ${mun.filter(x=>x.despensa==="1").length}`);
