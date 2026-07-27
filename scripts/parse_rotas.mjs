import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const raw=fs.readFileSync(OUT+"TR_rotas_raw.txt","utf8");
const rotaRe=/^(NORTE [1-4]|OESTE|LESTE|CENTRO\/SUL|CENTRO [1-3]|SUL [12]|CONTINENTE [12])\b\s*(.*)$/;
const noise=/^(ROTAS NUTRICIONISTAS|Para confer|SILVEIRA|P.g\.|P.gina:|Pe.a do processo|\d+\s*$|\s*$)/;
const STOP=["NEIM","EBM","EJA","CCFV","NEI","COM","CEDEP","NETI","RED","PARK","CEC","COORD","CENTRO","CONVIVENCIA","FORTALECIMENTO","VINCULO","VINCULOS","DE","DA","DO","DAS","DOS","E","ESCOLA","ANTIGA","ATUAL","PROF","PROFA","PROFESSORA","PROFESSOR","FUTURO","SANTO","SANTA","SAO","NOSSA","SENHORA"];
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9 ]/g," ").toUpperCase().replace(/\s+/g," ").trim();
const toks=s=>new Set(norm(s).split(" ").filter(w=>w.length>2 && !STOP.includes(w)));
const pares=[]; let cur=null;
for(const l0 of raw.split(/\r?\n/)){ const l=l0.trim(); if(!l||noise.test(l))continue;
  const m=l.match(rotaRe);
  if(m){ cur=m[1]; if(m[2]&&m[2].trim()) pares.push({rota:cur,txt:m[2].trim()}); continue; }
  if(/^[a-zà-ú]/.test(l)) continue;
  if(cur) pares.push({rota:cur,txt:l});
}
const paresTok=pares.map(p=>({...p,t:toks(p.txt)}));
const PIN={ "EBM PROFESSORA ZULMA FREITAS DE SOUZA":"NORTE 1", "NEIM SANTO ANTONIO DE PADUA":"OESTE", "NEIM COLONIA Z":"NORTE 2" };
const cas=JSON.parse(fs.readFileSync(OUT+"casamento_escolas.json","utf8"));
let comRota=0;
for(const c of cas){ const key=norm(c.escola);
  if(PIN[key]){ c.rota=PIN[key]; comRota++; continue; }
  const ct=toks(c.escola); if(ct.size===0){ c.rota=null; continue; }
  let best=null,bs=0; for(const p of paresTok){ let ov=0; for(const w of ct) if(p.t.has(w))ov++; const sc=ov/Math.max(1,Math.min(ct.size,p.t.size)); if(sc>bs){bs=sc;best=p;} }
  if(best&&bs>=0.5){ c.rota=best.rota; comRota++; } else c.rota=null;
}
fs.writeFileSync(OUT+"casamento_escolas.json", JSON.stringify(cas,null,1));
console.log(`com rota: ${comRota}/${cas.length} · sem rota: ${cas.filter(x=>!x.rota).map(x=>x.escola||"(vazio)").join(" | ")}`);
// resumo por rota (do casamento)
const R={}; cas.forEach(c=>{ if(c.rota){ (R[c.rota]??={esc:0,coz:0,al:0}); R[c.rota].esc++; R[c.rota].coz+=c.coz||0; R[c.rota].al+=c.alunos||0; }});
console.log("\n=== por rota (casamento) ===");
for(const r of ["NORTE 1","NORTE 2","NORTE 3","NORTE 4","OESTE","LESTE","CENTRO/SUL","CENTRO 1","CENTRO 2","CENTRO 3","SUL 1","SUL 2","CONTINENTE 1","CONTINENTE 2"]) console.log(`  ${r}: ${R[r]?.esc||0} escolas · ${R[r]?.coz||0} cozinheiras · ${(R[r]?.al||0).toLocaleString("pt-BR")} alunos`);
