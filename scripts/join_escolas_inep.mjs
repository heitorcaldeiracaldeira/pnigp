import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const cas=JSON.parse(fs.readFileSync(OUT+"casamento_escolas.json","utf8"));
const inep=JSON.parse(fs.readFileSync(OUT+"inep_cozinha.json","utf8")).filter(x=>x.dep===3); // municipais
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase()
  .replace(/[^A-Z0-9 ]/g," ").replace(/\b(NEIM|EBM|EBEF|EEB|CEI|CEC|NEI|CENTRO DE EDUCACAO INFANTIL|ESCOLA BASICA MUNICIPAL|NUCLEO DE EDUCACAO INFANTIL MUNICIPAL|NUCLEO DE EDUCACAO INFANTIL|NUCLEO INFANTIL|PROF|PROFA|PROFESSOR|PROFESSORA|DR|DRA|SANTA|SAO)\b/g," ")
  .replace(/\s+/g," ").trim();
const idx=new Map(); inep.forEach(e=>{ const k=norm(e.nome); if(k) (idx.get(k)||idx.set(k,[]).get(k)).push(e); });
// tokens p/ fuzzy
const inepTok=inep.map(e=>({e,t:new Set(norm(e.nome).split(" ").filter(w=>w.length>2))}));
let exato=0,fuzzy=0,semmatch=0; const naomatch=[];
for(const c of cas){
  const k=norm(c.escola); let hit=null;
  if(idx.has(k)&&idx.get(k).length===1){ hit=idx.get(k)[0]; exato++; }
  else{ // fuzzy: maior overlap de tokens
    const ct=new Set(k.split(" ").filter(w=>w.length>2)); let best=null,bs=0;
    for(const {e,t} of inepTok){ let ov=0; for(const w of ct) if(t.has(w))ov++; const sc=ov/Math.max(1,Math.min(ct.size,t.size)); if(sc>bs){bs=sc;best=e;} }
    if(best&&bs>=0.6){ hit=best; fuzzy++; } else { semmatch++; naomatch.push(c.escola); }
  }
  if(hit){ c.co=hit.co; c.nome_inep=hit.nome; c.cozinha=hit.cozinha==="1"; c.refeitorio=hit.refeitorio==="1"; c.alimentacao=hit.alimentacao==="1"; c.despensa=hit.despensa==="1"; c.qt_prof_alim=hit.qt_prof_alim; if(!c.alunos&&hit.mat_censo) c.alunos=hit.mat_censo; c.alunos_censo=hit.mat_censo; if(c.alunos&&c.coz) c.ratio=Math.round(c.alunos/c.coz); }
}
fs.writeFileSync(OUT+"casamento_escolas.json", JSON.stringify(cas,null,1));
console.log(`casamento: ${cas.length} escolas TR`);
console.log(`  exato=${exato} fuzzy=${fuzzy} sem match=${semmatch}`);
console.log(`  com cozinha=${cas.filter(x=>x.cozinha===true).length} · com refeitorio=${cas.filter(x=>x.refeitorio===true).length} · com alunos=${cas.filter(x=>x.alunos).length}`);
console.log(`  soma cozinheiras TR=${cas.reduce((s,x)=>s+(x.coz||0),0)} · soma qt_prof_alim censo=${cas.reduce((s,x)=>s+(x.qt_prof_alim||0),0)} · soma alunos=${cas.reduce((s,x)=>s+(x.alunos||0),0)}`);
if(naomatch.length) console.log("  NAO CASOU: "+naomatch.join(" | "));
// tambem escolas INEP sem cozinheira no TR (escolas municipais que oferecem alimentacao mas nao estao no TR)
const casNorm=new Set(cas.map(c=>norm(c.escola)));
const inepExtra=inep.filter(e=>{ const t=new Set(norm(e.nome).split(" ").filter(w=>w.length>2)); let best=0; for(const c of cas){ const ct=new Set(norm(c.escola).split(" ").filter(w=>w.length>2)); let ov=0; for(const w of t)if(ct.has(w))ov++; best=Math.max(best,ov/Math.max(1,Math.min(t.size,ct.size))); } return best<0.6; });
console.log(`  escolas INEP municipais SEM contrapartida no TR: ${inepExtra.length}`);
