import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const H={"user-agent":"Mozilla/5.0","accept":"application/json"};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const log=m=>fs.appendFileSync(OUT+"orc_log.txt", m+"\n");
const P="https://transparencia.e-publica.net/epublica-portal/rest/florianopolis/api/v1/pessoal";
const DEPAE=/CARLA CRISTINA BRITTO|GISELE LILIAM|LIDIAMARA DORNELLES|RAQUEL ERDMANN|RENATA BRODBECK|DANIELE HACK|GRAZIELA LADWIG|HELOISA HELENA BRAGA|NATHALIA PEREIRA/i;
async function get(u){ for(let i=0;i<3;i++){ try{ const r=await fetch(u,{headers:H,signal:AbortSignal.timeout(40000)}); const j=await r.json(); if((j.registros||[]).length) return j; }catch(e){} await wait(5000);} return {registros:[],totalRegistros:0}; }
// 1) descobre qual codigo_unidade traz a Educação (olha a unidadeGestora/lotação)
log("=== sondagem de códigos ===");
let smeCU=null;
for(const cu of [19,1,190,1900,12,19000,19001,2002]){
  const j=await get(`${P}?referencia=06/2025&inicio_registro=0&quantidade_registro=50&codigo_unidade=${cu}`);
  const u=j.registros?.[0]?.registro?.unidadeGestora?.denominacao||"-";
  log(`cu=${cu}: total ${j.totalRegistros} · ${u.slice(0,40)}`);
  if(j.totalRegistros>500){ smeCU=cu; log(`  -> candidato forte cu=${cu}`); break; }
}
// 2) se achou um código com muitos servidores, puxa e filtra DEPAE nos 3 anos
if(smeCU){
  const found={};
  for(const ref of ["06/2024","06/2025","05/2026"]){
    let ini=0,n=0;
    while(true){ const j=await get(`${P}?referencia=${ref}&inicio_registro=${ini}&quantidade_registro=3000&codigo_unidade=${smeCU}`); const recs=j.registros||[]; if(!recs.length) break; n+=recs.length;
      for(const rec of recs){ const r=rec.registro||rec; const nome=r.matricula?.nome||""; if(DEPAE.test(nome)){ const k=nome+"|"+ref; if(!found[k]) found[k]={nome,ref,listFolha:r.listFolha}; } }
      if(recs.length<3000) break; ini+=3000; }
    log(`ref ${ref} (cu=${smeCU}): ${n} servidores, ${Object.keys(found).length} DEPAE acum`);
    fs.writeFileSync(OUT+"folha_final.json", JSON.stringify(found,null,1));
  }
  log("DEPAE total: "+Object.keys(found).length);
  const first=Object.values(found)[0]; if(first) log("listFolha ex: "+JSON.stringify(first.listFolha).slice(0,600));
} else log("nenhum código trouxe >500 servidores");
log("FIM");
