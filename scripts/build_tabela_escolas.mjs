import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase();
let cas=JSON.parse(fs.readFileSync(OUT+"casamento_escolas.json","utf8"));
// pin final
cas.forEach(c=>{ if(norm(c.escola).includes("NOSSA SENHORA DE LOURDES")&&!c.rota) c.rota="CENTRO 1"; });
const tipoDe=e=>{ const n=norm(e); if(/\bNEIM\b|\bNEI\b/.test(n))return "Creche/Infantil"; if(/\bEBM\b/.test(n))return "Fundamental"; if(/\bEJA\b/.test(n))return "EJA"; if(/CEC|CCFV/.test(n))return "Contraturno"; return "Outro"; };
const rows=cas.filter(c=>c.escola&&norm(c.escola)!=="NEIM").map(c=>({
  escola:c.escola, rota:c.rota||"—", tipo:tipoDe(c.escola),
  alunos:c.alunos||null, h30:c.h30||0, h40:c.h40||0, coz:c.coz||0,
  ratio:(c.alunos&&c.coz)?Math.round(c.alunos/c.coz):null,
  cozinha:c.cozinha===true, refeitorio:c.refeitorio===true, qtprof:c.qt_prof_alim??null
})).sort((a,b)=> (a.rota===b.rota? b.alunos-a.alunos : a.rota.localeCompare(b.rota)));
const ORD=["NORTE 1","NORTE 2","NORTE 3","NORTE 4","OESTE","LESTE","CENTRO/SUL","CENTRO 1","CENTRO 2","CENTRO 3","SUL 1","SUL 2","CONTINENTE 1","CONTINENTE 2"];
rows.sort((a,b)=>{ const ia=ORD.indexOf(a.rota),ib=ORD.indexOf(b.rota); if(ia!==ib)return (ia<0?99:ia)-(ib<0?99:ib); return (b.alunos||0)-(a.alunos||0); });
const kpi={
  escolas:rows.length,
  alunos:rows.reduce((s,x)=>s+(x.alunos||0),0),
  coz:rows.reduce((s,x)=>s+x.coz,0), h30:rows.reduce((s,x)=>s+x.h30,0), h40:rows.reduce((s,x)=>s+x.h40,0),
  comCozinha:rows.filter(x=>x.cozinha).length, comRef:rows.filter(x=>x.refeitorio).length,
  rotas:14, nutri:17,
  ratioMed: Math.round(rows.filter(x=>x.ratio).reduce((s,x)=>s+x.ratio,0)/rows.filter(x=>x.ratio).length)
};
// resumo por rota
const R={}; rows.forEach(r=>{ if(r.rota!=="—"){ (R[r.rota]??={esc:0,coz:0,al:0,coz30:0,coz40:0}); R[r.rota].esc++; R[r.rota].coz+=r.coz; R[r.rota].al+=r.alunos||0; R[r.rota].coz30+=r.h30; R[r.rota].coz40+=r.h40; }});
const rotas=ORD.map(r=>({rota:r,...(R[r]||{esc:0,coz:0,al:0,coz30:0,coz40:0})}));
fs.writeFileSync(OUT+"tabela_final.json", JSON.stringify({rows,kpi,rotas},null,1));
console.log("rows",rows.length,"| alunos",kpi.alunos,"| coz",kpi.coz,"| cozinha",kpi.comCozinha,"| refeit",kpi.comRef,"| ratio med",kpi.ratioMed);
console.log("sem rota:",rows.filter(x=>x.rota==="—").length,"| sem alunos:",rows.filter(x=>!x.alunos).length);
