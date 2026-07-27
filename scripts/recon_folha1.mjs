const B="https://transparencia.e-publica.net:443/epublica-portal/rest/florianopolis/api/v1/pessoal";
async function pega(ref,ini,qt){ const url=`${B}?referencia=${ref}&inicio_registro=${ini}&quantidade_registro=${qt}&codigo_unidade=1`;
  const r=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(90000)}); return r.json().catch(()=>null); }
// acha um mes recente que retorne dados
let ref=null;
for(const m of ["12/2025","11/2025","10/2025","06/2025","12/2024"]){ const j=await pega(m,0,3); const n=j?.registros?.length||0; console.log(`teste ${m}: regs=${n}`); if(n>0){ref=m;break;} }
if(!ref){ console.log("nenhum mes recente retornou; usando 01/2019"); ref="01/2019"; }
console.log("REF escolhida:",ref);
// puxa 1 pagina grande e inspeciona locais com ALIMENT + procura nomes DEPAE
const NOMES=["CARLA CRISTINA BRITTO","GISELE LILIAM","LIDIAMARA DORNELLES","RAQUEL ERDMANN","RENATA BRODBECK"];
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase();
const j=await pega(ref,0,2000); const regs=j?.registros||[];
console.log("pagina 1:",regs.length,"registros");
const locais=new Set(); const alims=new Set(); const achados=[];
for(const w of regs){ const rr=w.registro; const f=rr.listFolha?.[0]; const loc=f?.historico?.local?.denominacao||""; locais.add(loc);
  if(/ALIMENT/i.test(loc)) alims.add(loc);
  const nm=norm(rr.matricula?.nome); if(NOMES.some(n=>nm.includes(n))) achados.push(rr.matricula?.nome+" | "+(f?.historico?.cargo?.denominacao)+" | "+loc);
}
console.log("\nlocais com ALIMENT:", [...alims].join(" || ")||"(nenhum nesta pagina)");
console.log("\nnomes DEPAE achados:", achados.join("\n")||"(nenhum nesta pagina — precisa paginar)");
console.log("\ntotal locais distintos nesta pagina:", locais.size);
console.log("amostra locais:", [...locais].slice(0,25).join(" | "));
