import fs from "fs"; import zlib from "zlib";
process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const log=m=>fs.appendFileSync(OUT+"inep_log.txt", m+"\n");
function unzipEntry(buf, sufixo){ let eo=-1; for(let i=buf.length-22;i>=0 && i>buf.length-22-65536;i--) if(buf.readUInt32LE(i)===0x06054b50){eo=i;break;} let p=buf.readUInt32LE(eo+16); const n=buf.readUInt16LE(eo+10);
  for(let k=0;k<n;k++){ const method=buf.readUInt16LE(p+10),compSize=buf.readUInt32LE(p+20),nameLen=buf.readUInt16LE(p+28),extraLen=buf.readUInt16LE(p+30),commLen=buf.readUInt16LE(p+32),lho=buf.readUInt32LE(p+42); const name=buf.toString("latin1",p+46,p+46+nameLen);
    if(name.toLowerCase().endsWith(sufixo.toLowerCase())){ const lN=buf.readUInt16LE(lho+26),lE=buf.readUInt16LE(lho+28),ds=lho+30+lN+lE; const comp=buf.subarray(ds,ds+compSize); return (method===0?Buffer.from(comp):zlib.inflateRawSync(comp)).toString("latin1"); }
    p+=46+nameLen+extraLen+commLen; } throw new Error("nao achou "+sufixo); }
async function tenta(url){ for(let a=1;a<=3;a++){ try{ const r=await fetch(url,{signal:AbortSignal.timeout(300000)}); if(!r.ok){ log(`  HTTP ${r.status} (tent ${a}) ${url.slice(-40)}`); if(r.status===404)return null; continue;} const b=Buffer.from(await r.arrayBuffer()); log(`  OK ${Math.round(b.length/1048576)}MB`); return b; }catch(e){ log(`  fetch fail tent ${a}: ${e.message.slice(0,40)}`);} } return null; }
for(const ANO of ["2024","2023"]){
  for(const url of [`https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_${ANO}_.zip`, `https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_${ANO}.zip`]){
    log(`baixando ${url.slice(-50)}`);
    const buf=await tenta(url); if(!buf)continue;
    try{
      const csv=unzipEntry(buf, "Tabela_Escola_"+ANO+".csv");
      const linhas=csv.split(/\r?\n/); const head=linhas[0].split(";").map(h=>h.replace(/^"|"$/g,"").trim());
      log("  campos infra: "+head.filter(h=>/COZINHA|REFEIT|ALIMENT/i.test(h)).join(", "));
      const ix=n=>head.indexOf(n);
      const C={mun:ix("CO_MUNICIPIO"),no:ix("NO_ENTIDADE"),co:ix("CO_ENTIDADE"),dep:ix("TP_DEPENDENCIA"),sit:ix("TP_SITUACAO_FUNCIONAMENTO"),coz:ix("IN_COZINHA"),ref:ix("IN_REFEITORIO"),ali:ix("IN_ALIMENTACAO")};
      const out=[];
      for(let i=1;i<linhas.length;i++){ if(!linhas[i])continue; const c=linhas[i].split(";").map(x=>x.replace(/^"|"$/g,"")); if(c[C.mun]!=="4205407")continue; if(c[C.sit]!=="1")continue;
        out.push({co:c[C.co],nome:c[C.no],dep:+c[C.dep],cozinha:C.coz>=0?c[C.coz]:null,refeitorio:C.ref>=0?c[C.ref]:null,alimentacao:C.ali>=0?c[C.ali]:null}); }
      fs.writeFileSync(OUT+"inep_cozinha.json", JSON.stringify(out,null,1));
      const mun=out.filter(x=>x.dep===3);
      log(`  Floripa ${ANO}: ${out.length} escolas (${mun.length} mun) · cozinha ${mun.filter(x=>x.cozinha==="1").length}/${mun.length} · refeit ${mun.filter(x=>x.refeitorio==="1").length} · aliment ${mun.filter(x=>x.alimentacao==="1").length}`);
      log("FIM "+ANO); process.exit(0);
    }catch(e){ log("  parse erro: "+e.message.slice(0,60)); }
  }
}
log("nenhum ano baixou");
