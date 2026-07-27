import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const log=m=>fs.appendFileSync(OUT+"fonte_ano_log.txt", m+"\n");
const B="https://transparencia.e-publica.net/epublica-portal/rest/florianopolis/api/v1/despesa";
async function pega(pi,pf,ini,qt){ const u=`${B}?periodo_inicial=${pi}&periodo_final=${pf}&inicio_registro=${ini}&quantidade_registro=${qt}`;
  for(let a=1;a<=6;a++){ try{ const r=await fetch(u,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(120000)}); const j=await r.json().catch(()=>null); const regs=j?.registros||[]; if(regs.length>0||a===6) return regs; }catch(e){log("  err "+e.message.slice(0,30));} await new Promise(s=>setTimeout(s,7000)); } return []; }
// merenda escolar por objeto: subfunção "Alimentação e Nutrição" OU ação "ALIMENTAÇÃO ESCOLAR" OU natureza 33.90.37 com objeto cozinheira/nutric
const isMerenda=(sub,acao,obj,forn)=>/aliment/i.test(sub)||/ALIMENTA..O ESCOLAR/i.test(acao)||/COZINHEIR|MERENDA|NUTRICION/i.test(obj)||/SEPAT/i.test(forn||"");
const grupoFonte=f=>{ const n=(f||"").toUpperCase();
  if(/PNAE/.test(n))return"Federal — PNAE (merenda)";
  if(/SAL[ÁA]RIO.?EDUCA/.test(n))return"Federal — Salário-Educação";
  if(/FUNDEB/.test(n))return"FUNDEB";
  if(/IMPOSTOS/.test(n))return"Próprio — Impostos (Educação/MDE)";
  return"Outros/próprio"; };
const anoFonte={}; // {ano:{fonte:{emp,pago}}}
for(const [ano,pi,pf] of [["2024","01/2024","12/2024"],["2025","01/2025","12/2025"],["2026","01/2026","07/2026"]]){
  log(`\n=== ${ano} ===`); anoFonte[ano]={};
  let ini=0,qt=4000,n=0;
  while(true){ const regs=await pega(pi,pf,ini,qt); if(!regs.length)break;
    for(const w of regs){ const rr=w.registro||w; const d=rr.despesa||{};
      const sub=d.subfuncao?.denominacao||"", acao=d.acao?.denominacao||"", obj=rr.empenho?.objetoResumido||"", forn=rr.fornecedor?.pessoa?.nome||rr.fornecedor?.nome||"";
      if(!isMerenda(sub,acao,obj,forn)) continue; n++;
      let emp=0,pago=0; for(const m of (rr.listMovimentos||[])){const t=m.tipoMovimento||"",v=m.valorMovimento||0; if(/Emiss.o de empenho/i.test(t))emp+=v; else if(/Pagamento/i.test(t))pago+=v;}
      const fg=grupoFonte(rr.fonteRecurso?.denominacao||rr.fonteRecurso);
      (anoFonte[ano][fg]??={emp:0,pago:0}); anoFonte[ano][fg].emp+=emp; anoFonte[ano][fg].pago+=pago;
    }
    log(`  +${regs.length} (merenda ${n})`); if(regs.length<qt)break; ini+=qt; if(ini>120000)break;
  }
}
fs.writeFileSync(OUT+"merenda_fonte_ano.json", JSON.stringify(anoFonte,null,1));
log("\n=== RECURSO POR ANO (merenda, por fonte) ===");
for(const [ano,fs2] of Object.entries(anoFonte)){ log(`\n${ano}:`); for(const [f,x] of Object.entries(fs2).sort((a,b)=>b[1].emp-a[1].emp)) log(`  ${f}: emp R$${(x.emp/1e6).toFixed(2)}mi pago R$${(x.pago/1e6).toFixed(2)}mi`); }
log("FIM");
