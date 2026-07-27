import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const B="https://transparencia.e-publica.net:443/epublica-portal/rest/florianopolis/api/v1/pessoal";
async function t(ref,cod){ const u=`${B}?referencia=${ref}&inicio_registro=0&quantidade_registro=3`+(cod!=null?`&codigo_unidade=${cod}`:"");
  const r=await fetch(u,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(60000)}); const j=await r.json().catch(()=>null);
  const rr=j?.registros?.[0]?.registro; return {s:r.status,n:j?.registros?.length||0,ug:rr?.unidadeGestora?.denominacao,ex:rr?.matricula?.nome,loc:rr?.listFolha?.[0]?.historico?.local?.denominacao}; }
// unidadeGestora do que veio na unidade 1
const all=JSON.parse(fs.readFileSync(OUT+"folha_u1_12_2023.json","utf8"));
const ug={}; all.forEach(w=>{ const d=w.registro?.unidadeGestora?.denominacao||"?"; ug[d]=(ug[d]||0)+1; });
console.log("unidadeGestora na 'unidade 1':", JSON.stringify(ug));
// testa codigos p/ achar Educacao/Saude
for(const cod of [9,10,1,2,4,5,0]){ const r=await t("12/2023",cod); console.log(`cod ${cod}: HTTP ${r.s} n=${r.n} UG="${r.ug}" ex="${r.ex}" loc="${r.loc}"`); }
