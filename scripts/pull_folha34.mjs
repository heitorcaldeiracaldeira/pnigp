import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const H={"user-agent":"Mozilla/5.0","accept":"application/json"};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const log=m=>{ fs.appendFileSync(OUT+"folha34_log.txt", m+"\n"); };
const PESS="https://transparencia.e-publica.net/epublica-portal/rest/florianopolis/api/v1/pessoal";
const DEPAE=/CARLA CRISTINA BRITTO|GISELE LILIAM|LIDIAMARA DORNELLES|RAQUEL ERDMANN|RENATA BRODBECK|DANIELE HACK|GRAZIELA LADWIG|HELOISA HELENA BRAGA|NATHALIA PEREIRA/i;
async function get(u){ for(let i=0;i<5;i++){ try{ const r=await fetch(u,{headers:H,signal:AbortSignal.timeout(45000)}); const j=await r.json(); if((j.registros||[]).length) return j; }catch(e){} await wait(6000);} return {registros:[],totalRegistros:0}; }
const found={};
for(const ref of ["06/2024","06/2025","06/2026","05/2026","04/2026"]){
  let ini=0,n=0,hits=0;
  while(true){ const j=await get(`${PESS}?referencia=${ref}&inicio_registro=${ini}&quantidade_registro=3000&codigo_unidade=34`); const recs=j.registros||[]; if(!recs.length) break; n+=recs.length;
    for(const rec of recs){ const r=rec.registro||rec; const nome=r.matricula?.nome||""; if(DEPAE.test(nome)){ hits++; const k=nome+"|"+ref; if(!found[k]) found[k]={nome,ref,cargo:r.matricula?.tipoContratacao,listFolha:r.listFolha}; } }
    if(recs.length<3000) break; ini+=3000; }
  log(`ref ${ref}: ${n} servidores SME, ${hits} DEPAE`);
  fs.writeFileSync(OUT+"folha34.json", JSON.stringify(found,null,1));
}
log("\ntotal DEPAE-mês: "+Object.keys(found).length);
// estrutura do listFolha (verbas) do primeiro
const first=Object.values(found)[0];
if(first) log("exemplo listFolha: "+JSON.stringify(first.listFolha).slice(0,700));
log("FIM");
