import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const log=m=>fs.appendFileSync(OUT+"dotacao_ano_log.txt", m+"\n");
const B="https://transparencia.e-publica.net/epublica-portal/rest/florianopolis/api/v1/despesa";
async function pega(pi,pf,ini,qt){ const u=`${B}?periodo_inicial=${pi}&periodo_final=${pf}&inicio_registro=${ini}&quantidade_registro=${qt}`;
  for(let a=1;a<=6;a++){ try{ const r=await fetch(u,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(120000)}); const j=await r.json().catch(()=>null); const regs=j?.registros||[]; if(regs.length>0||a===6) return regs; }catch(e){log("  err "+e.message.slice(0,30));} await new Promise(s=>setTimeout(s,7000)); } return []; }
// escolar = UO 19001 + ação ALIMENTAÇÃO ESCOLAR (exclui CAISAN/CONSEA/seg alimentar/agricultura urbana)
const isEsc=(cc,acao)=>/^1\.19001\./.test(cc)&&/ALIMENTA..O ESCOLAR/i.test(acao||"");
const byAno={}; // {2024:{emp,liq,pago,custeio,invest,n}}
const dotAno={}; // por dotação x ano (pago)
for(const [ano,pi,pf] of [["2024","01/2024","12/2024"],["2025","01/2025","12/2025"],["2026","01/2026","07/2026"]]){
  log(`\n=== ${ano} (${pi}..${pf}) ===`); byAno[ano]={emp:0,liq:0,pago:0,custeio:0,invest:0,n:0};
  let ini=0,qt=4000;
  while(true){ const regs=await pega(pi,pf,ini,qt); if(!regs.length)break;
    for(const w of regs){ const rr=w.registro||w; const d=rr.despesa||{};
      const cc=(rr.classificacaoCompleta?.classificacaoCompleta)||rr.classificacaoCompleta||"";
      const acao=d.acao?.denominacao||"";
      if(!isEsc(cc,acao)) continue;
      let emp=0,liq=0,pago=0; for(const m of (rr.listMovimentos||[])){ const t=m.tipoMovimento||"",v=m.valorMovimento||0; if(/Emiss.o de empenho/i.test(t))emp+=v; else if(/Liquida..o/i.test(t))liq+=v; else if(/Pagamento/i.test(t))pago+=v; }
      const nat=cc.split(".").pop()||""; const inv=/^44/.test(nat);
      const b=byAno[ano]; b.emp+=emp; b.liq+=liq; b.pago+=pago; b.n++; if(inv)b.invest+=pago; else b.custeio+=pago;
      const key=acao.replace(/ALIMENTA..O ESCOLAR ?/i,"").trim()||acao; (dotAno[key]??={}); dotAno[key][ano]=(dotAno[key][ano]||0)+pago;
    }
    log(`  +${regs.length} (merenda esc ${byAno[ano].n}, pago R$${(byAno[ano].pago/1e6).toFixed(2)}mi)`); if(regs.length<qt)break; ini+=qt; if(ini>120000)break;
  }
}
fs.writeFileSync(OUT+"dotacao_por_ano.json", JSON.stringify({byAno,dotAno},null,1));
log("\n=== FECHAMENTO POR ANO (merenda escolar, UO 19001) ===");
for(const [ano,b] of Object.entries(byAno)) log(`${ano}: emp R$${(b.emp/1e6).toFixed(2)}mi | liq R$${(b.liq/1e6).toFixed(2)}mi | pago R$${(b.pago/1e6).toFixed(2)}mi | custeio ${(b.custeio/1e6).toFixed(2)} | invest ${(b.invest/1e6).toFixed(2)} | ${b.n} emp`);
log("FIM");
