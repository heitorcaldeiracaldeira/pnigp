import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9 ]/g," ").toUpperCase().replace(/\s+/g," ").trim();
const STOP=new Set(["NEIM","EBM","EJA","CCFV","NEI","COM","CEDEP","NETI","CEC","COORD","CONVIVENCIA","FORTALECIMENTO","VINCULO","VINCULOS","DE","DA","DO","DAS","DOS","E","ESCOLA","ANTIGA","ATUAL","BASICA","MUNICIPAL","NUCLEO"]);
const toks=s=>new Set(norm(s).split(" ").filter(w=>w.length>2 && !STOP.has(w)));
const titulo=s=>String(s).toLowerCase().replace(/\b([a-zà-ú])/g,(m,c)=>c.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g,m=>m.toLowerCase()).replace(/\bNeim\b/gi,"NEIM").replace(/\bEbm\b/gi,"EBM").replace(/\bEja\b/gi,"EJA").replace(/\bCcfv\b/gi,"CCFV").replace(/\bCeja\b/gi,"CEJA");

const inep=JSON.parse(fs.readFileSync(OUT+"inep_cozinha.json","utf8")).filter(x=>x.dep===3); // 130 municipais
const cas=JSON.parse(fs.readFileSync(OUT+"casamento_escolas.json","utf8"));

// match FRESCO: cada linha TR -> melhor escola INEP (bidirecional), agrupa por co
const porCo={};
const inepTok=inep.map(e=>({e,t:toks(e.nome)}));
const naoCasou=[];
for(const c of cas){
  if(!c.escola || norm(c.escola)==="NEIM") continue;
  const ct=toks(c.escola); if(ct.size===0){ naoCasou.push(c.escola); continue; }
  let best=null,bs=0; for(const {e,t} of inepTok){ let ov=0; for(const w of ct) if(t.has(w))ov++; const sc=ov/Math.max(1,Math.min(ct.size,t.size)); if(sc>bs){bs=sc;best=e;} }
  if(best&&bs>=0.45){ const g=(porCo[best.co]??={h30:0,h40:0,coz:0,rota:null}); g.h30+=c.h30||0; g.h40+=c.h40||0; g.coz+=c.coz||0; if(c.rota&&!g.rota)g.rota=c.rota; }
  else naoCasou.push(c.escola+" ["+bs.toFixed(2)+"]");
}
// propaga rota por REGIÃO p/ escolas INEP sem rota mas com cozinheira (co-localizadas): pega rota da escola-mãe já feita acima
// pin manual: Nossa Senhora de Lourdes -> CENTRO 1 (variante Lurdes)
for(const e of inep){ if(norm(e.nome).includes("LOURDES")||norm(e.nome).includes("LURDES")){ const g=(porCo[e.co]??={h30:0,h40:0,coz:0,rota:null}); if(!g.rota)g.rota="CENTRO 1"; } }
if(naoCasou.length) console.log("TR sem casar:", naoCasou.join(" | "));

const tipoDe=e=>{ const n=norm(e); if(/\bNEIM\b|\bNEI\b/.test(n))return "Creche/Infantil"; if(/\bEBM\b/.test(n))return "Fundamental"; if(/\bEJA\b|CEJA|JOVENS/.test(n))return "EJA"; if(/CEC|CCFV|CONVIVENCIA/.test(n))return "Contraturno"; return "Outro"; };

// tabela = 130 escolas INEP
const rows=inep.map(e=>{ const g=porCo[e.co]||{h30:0,h40:0,coz:0,rota:null};
  return { escola:titulo(e.nome), co:e.co, rota:g.rota||"—", tipo:tipoDe(e.nome),
    alunos:e.mat_censo||0, h30:g.h30, h40:g.h40, coz:g.coz,
    ratio:(e.mat_censo&&g.coz)?Math.round(e.mat_censo/g.coz):null,
    cozinha:e.cozinha==="1", refeitorio:e.refeitorio==="1", qtprof:e.qt_prof_alim??null };
});
const ORD=["NORTE 1","NORTE 2","NORTE 3","NORTE 4","OESTE","LESTE","CENTRO/SUL","CENTRO 1","CENTRO 2","CENTRO 3","SUL 1","SUL 2","CONTINENTE 1","CONTINENTE 2"];
rows.sort((a,b)=>{ const ia=ORD.indexOf(a.rota),ib=ORD.indexOf(b.rota); const xa=ia<0?99:ia, xb=ib<0?99:ib; if(xa!==xb)return xa-xb; return (b.alunos||0)-(a.alunos||0); });

const kpi={
  escolas:rows.length,
  alunos:rows.reduce((s,x)=>s+(x.alunos||0),0),
  coz:rows.reduce((s,x)=>s+x.coz,0), h30:rows.reduce((s,x)=>s+x.h30,0), h40:rows.reduce((s,x)=>s+x.h40,0),
  comCozinha:rows.filter(x=>x.cozinha).length, comRef:rows.filter(x=>x.refeitorio).length,
  rotas:14, nutri:17,
  ratioMed: Math.round(rows.filter(x=>x.ratio).reduce((s,x)=>s+x.ratio,0)/rows.filter(x=>x.ratio).length)
};
const R={}; rows.forEach(r=>{ if(r.rota!=="—"){ (R[r.rota]??={esc:0,coz:0,al:0}); R[r.rota].esc++; R[r.rota].coz+=r.coz; R[r.rota].al+=r.alunos||0; }});
const rotas=ORD.map(r=>({rota:r,...(R[r]||{esc:0,coz:0,al:0})}));
// distribuição por TIPO
const TP=["Creche/Infantil","Fundamental","EJA","Contraturno","Outro"];
const byTipo=TP.map(t=>{ const g=rows.filter(r=>r.tipo===t); return {tipo:t,n:g.length,al:g.reduce((s,x)=>s+x.alunos,0),coz:g.reduce((s,x)=>s+x.coz,0),prof:g.reduce((s,x)=>s+(x.qtprof||0),0)}; }).filter(x=>x.n>0);
// distribuição por TAMANHO (matrículas)
const BK=[{l:"Sem matrícula (contraturno)",min:0,max:0},{l:"Pequena (1–150)",min:1,max:150},{l:"Média (151–350)",min:151,max:350},{l:"Grande (351–600)",min:351,max:600},{l:"Muito grande (600+)",min:601,max:1e9}];
const sizeDist=BK.map(b=>{ const g=rows.filter(r=>r.alunos>=b.min&&r.alunos<=b.max); return {l:b.l,n:g.length,al:g.reduce((s,x)=>s+x.alunos,0)}; });
fs.writeFileSync(OUT+"tabela_final.json", JSON.stringify({rows,kpi,rotas,byTipo,sizeDist},null,1));
console.log("escolas",rows.length,"| ALUNOS",kpi.alunos,"| coz",kpi.coz,"(30h",kpi.h30,"40h",kpi.h40,")| cozinha",kpi.comCozinha,"| refeit",kpi.comRef,"| ratio med",kpi.ratioMed);
console.log("sem rota:",rows.filter(x=>x.rota==="—").length,"| sem cozinheira:",rows.filter(x=>x.coz===0).length,"| sem alunos:",rows.filter(x=>!x.alunos).length);
console.log("\nSEM COZINHEIRA (escola / alunos / tipo / qtprof-censo):");
rows.filter(x=>x.coz===0).forEach(x=>console.log(`  ${x.escola} · ${x.alunos} al · ${x.tipo} · censo tinha ${x.qtprof} prof.alim`));
