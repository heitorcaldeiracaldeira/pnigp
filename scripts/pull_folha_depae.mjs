import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const H={"user-agent":"Mozilla/5.0","accept":"application/json"};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const log=m=>{ fs.appendFileSync(OUT+"folha_log.txt", m+"\n"); };
const DESP="https://transparencia.e-publica.net/epublica-portal/rest/florianopolis/api/v1/despesa";
const PESS="https://transparencia.e-publica.net/epublica-portal/rest/florianopolis/api/v1/pessoal";
const DEPAE=/CARLA CRISTINA BRITTO|GISELE LILIAM|LIDIAMARA DORNELLES|RAQUEL ERDMANN|RENATA BRODBECK|DANIELE HACK|GRAZIELA LADWIG|HELOISA HELENA BRAGA|NATHALIA PEREIRA/i;
async function get(url){ for(let i=0;i<4;i++){ try{ const r=await fetch(url,{headers:H,signal:AbortSignal.timeout(45000)}); const j=await r.json(); if((j.registros||[]).length) return j; }catch(e){} await wait(6000);} return {registros:[]}; }
// 1) códigos de unidade orçamentária da Educação (via despesa)
log("buscando códigos SME na despesa...");
const smeCodes={};
for(let ini=0; ini<9000; ini+=3000){
  const j=await get(`${DESP}?periodo_inicial=01/2025&periodo_final=12/2025&inicio_registro=${ini}&quantidade_registro=3000`);
  if(!j.registros.length) break;
  for(const rec of j.registros){ const r=rec.registro||rec; if(/Educa/i.test(r.despesa?.funcao?.denominacao||"")){ const u=r.unidadeOrcamentaria; if(u?.codigo) smeCodes[u.codigo]=u.denominacao; } }
}
log("códigos SME: "+JSON.stringify(smeCodes));
// 2) testa cada código na API de pessoal, procura DEPAE
const found={};
for(const cu of Object.keys(smeCodes)){
  for(const ref of ["06/2025","06/2024","06/2026","05/2026"]){
    let ini=0, n=0, hits=0;
    while(true){ const j=await get(`${PESS}?referencia=${ref}&inicio_registro=${ini}&quantidade_registro=3000&codigo_unidade=${cu}`); const recs=j.registros||[]; if(!recs.length) break; n+=recs.length;
      for(const rec of recs){ const r=rec.registro||rec; const nome=r.matricula?.nome||""; if(DEPAE.test(nome)){ hits++;
        const bruto=(r.listFolha||[]).reduce((s,f)=>s+(f.valorTotal||f.valor||0),0);
        const k=nome+"|"+ref; found[k]={nome, ref, unidade:smeCodes[cu], listFolha:r.listFolha}; } }
      if(recs.length<3000) break; ini+=3000; }
    log(`  cu=${cu} ${smeCodes[cu]?.slice(0,25)} ref ${ref}: ${n} servidores, ${hits} DEPAE`);
    if(n>0 && Object.keys(found).length) break; // achou o órgão certo
  }
  if(Object.keys(found).length>=5) break;
}
fs.writeFileSync(OUT+"folha_depae.json", JSON.stringify(found,null,1));
log("\n=== DEPAE encontrados: "+Object.keys(found).length+" ===");
for(const k in found){ log("  "+k+" · "+JSON.stringify(found[k].listFolha).slice(0,200)); }
log("FIM");
