import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const B="https://transparencia.e-publica.net:443/epublica-portal/rest/florianopolis/api/v1/pessoal";
async function pega(ref,cod,ini,qt){ const u=`${B}?referencia=${ref}&inicio_registro=${ini}&quantidade_registro=${qt}`+(cod!=null?`&codigo_unidade=${cod}`:"");
  for(let a=1;a<=2;a++){ try{ const r=await fetch(u,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(90000)}); const j=await r.json().catch(()=>null); if((j?.registros?.length||0)>0||a===2) return j; }catch(e){} await new Promise(s=>setTimeout(s,7000)); } return null; }
// 1) acha mes mais novo com dados (testa unidade 1 e sem unidade)
let ref=null,cod=null;
const meses=["12/2023","09/2023","06/2023","03/2023","01/2023"];
for(const m of ["12/2024","06/2024","03/2024",...meses]){ const j=await pega(m,1,0,3); const n=j?.registros?.length||0; console.log(`  ${m} cod1 -> ${n}`); if(n>0){ref=m;cod=1;break;} }
if(!ref){ console.log("nenhum funcionou"); process.exit(1); }
console.log("MES:",ref,"unidade:",cod);
// 2) pagina tudo
let all=[],ini=0,qt=1000;
while(true){ const j=await pega(ref,cod,ini,qt); const regs=j?.registros||[]; all.push(...regs); console.log(`  +${regs.length} (total ${all.length})`); if(regs.length<qt)break; ini+=qt; if(ini>60000)break; }
fs.writeFileSync(OUT+`folha_u1_${ref.replace("/","_")}.json`, JSON.stringify(all));
console.log("SALVO",all.length,"registros");
// 3) diagnostico: lotacoes distintas + procura educacao/aliment/DEPAE
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase();
const locais={}; for(const w of all){ const loc=w.registro?.listFolha?.[0]?.historico?.local?.denominacao||"(sem)"; locais[loc]=(locais[loc]||0)+1; }
const locArr=Object.entries(locais).sort((a,b)=>b[1]-a[1]);
console.log("\nlotacoes distintas:",locArr.length);
const edu=locArr.filter(([l])=>/EDUCA|ALIMENT|MERENDA|ESCOL|ENSINO|NEIM|EBM|CRECHE/i.test(l));
console.log("lotacoes ligadas a EDUCACAO/ALIMENTACAO:", edu.length?edu.map(([l,n])=>l+"("+n+")").join(" | "):"NENHUMA");
const NOMES=["CARLA CRISTINA BRITTO","GISELE LILIAM","LIDIAMARA DORNELLES","RAQUEL ERDMANN","RENATA BRODBECK"];
const ach=all.filter(w=>NOMES.some(n=>norm(w.registro?.matricula?.nome).includes(n)));
console.log("DEPAE achados:", ach.length? ach.map(w=>w.registro.matricula.nome).join(" | "):"nenhum");
