import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const inep=JSON.parse(fs.readFileSync(OUT+"inep_cozinha.json","utf8"));
const mun=inep.filter(x=>x.dep===3);
const est=inep.filter(x=>x.dep===2), fed=inep.filter(x=>x.dep===1), priv=inep.filter(x=>x.dep===4);
console.log("=== INEP Censo 2024 — Florianópolis (escolas ATIVAS) ===");
console.log(`Total ativas: ${inep.length} | Municipal(3): ${mun.length} · Estadual(2): ${est.length} · Federal(1): ${fed.length} · Privada(4): ${priv.length}`);
// tipo por nome
const tipo=e=>{ const n=e.nome.toUpperCase();
  if(/\bNEIM\b|\bNEI\b|CRECHE|EDUCA..O INFANTIL/.test(n))return "Creche/EI (NEIM)";
  if(/\bEBM\b|ESCOLA B|ENSINO FUND/.test(n))return "Fundamental (EBM)";
  if(/\bEJA\b/.test(n))return "EJA";
  if(/CCFV/.test(n))return "CCFV (contraturno)";
  if(/CEDEP|NETI|CEC\b/.test(n))return "Outros (CEDEP/NETI/CEC)";
  return "Outro"; };
const porTipo={}; let matTot=0;
for(const e of mun){ const t=tipo(e); (porTipo[t]??={n:0,mat:0}); porTipo[t].n++; porTipo[t].mat+=e.mat_censo||0; matTot+=e.mat_censo||0; }
console.log("\n=== Municipais por tipo (nome) ===");
for(const [t,v] of Object.entries(porTipo).sort((a,b)=>b[1].mat-a[1].mat)) console.log(`  ${t}: ${v.n} escolas · ${v.mat.toLocaleString("pt-BR")} matrículas`);
console.log(`  TOTAL municipal: ${mun.length} escolas · ${matTot.toLocaleString("pt-BR")} matrículas`);
// infra
console.log("\n=== Infra alimentação (municipal) ===");
console.log(`  cozinha: ${mun.filter(x=>x.cozinha==="1").length}/${mun.length} · refeitório: ${mun.filter(x=>x.refeitorio==="1").length} · despensa: ${mun.filter(x=>x.despensa==="1").length} · oferece alimentação: ${mun.filter(x=>x.alimentacao==="1").length}`);
console.log(`  soma QT_PROF_ALIMENTACAO (censo): ${mun.reduce((s,x)=>s+(x.qt_prof_alim||0),0)}`);
// vs TR
const cas=JSON.parse(fs.readFileSync(OUT+"casamento_escolas.json","utf8"));
console.log("\n=== TR (contrato SEPAT) vs INEP ===");
console.log(`  Unidades no TR: ${cas.length} | casadas com INEP: ${cas.filter(x=>x.co).length} | sem match: ${cas.filter(x=>!x.co).length}`);
console.log(`  Cozinheiras TR (soma): ${cas.reduce((s,x)=>s+(x.coz||0),0)} (30h=${cas.reduce((s,x)=>s+(x.h30||0),0)} 40h=${cas.reduce((s,x)=>s+(x.h40||0),0)})`);
console.log(`  Alunos (casados c/ censo): ${cas.reduce((s,x)=>s+(x.alunos||0),0).toLocaleString("pt-BR")}`);
// escolas INEP municipais que atendem (alimentacao=1) mas nao tem linha no TR
const casNames=new Set(cas.filter(x=>x.nome_inep).map(x=>x.nome_inep));
const inepSemTR=mun.filter(e=>e.alimentacao==="1" && !casNames.has(e.nome));
console.log(`\n=== INEP municipais que oferecem alimentação SEM linha no TR: ${inepSemTR.length} ===`);
inepSemTR.slice(0,40).forEach(e=>console.log(`  ${e.nome} (mat ${e.mat_censo||0}, cozinha ${e.cozinha}, qtprof ${e.qt_prof_alim})`));
