import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const log=m=>fs.appendFileSync(OUT+"dotacao_log.txt", m+"\n");
const B="https://transparencia.e-publica.net/epublica-portal/rest/florianopolis/api/v1/despesa";
async function pega(pi,pf,ini,qt){ const u=`${B}?periodo_inicial=${pi}&periodo_final=${pf}&inicio_registro=${ini}&quantidade_registro=${qt}`;
  for(let a=1;a<=6;a++){ try{ const r=await fetch(u,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(120000)}); const j=await r.json().catch(()=>null); const regs=j?.registros||[]; if(regs.length>0||a===6) return regs; }catch(e){log("  fetch err "+e.message.slice(0,30));} await new Promise(s=>setTimeout(s,7000)); } return []; }
const dot={}; // por classificacaoCompleta
let totReg=0, alimReg=0;
for(const [pi,pf] of [["01/2024","12/2024"],["01/2025","12/2025"],["01/2026","07/2026"]]){
  log(`\n=== período ${pi}..${pf} ===`);
  let ini=0, qt=4000;
  while(true){
    const regs=await pega(pi,pf,ini,qt); if(!regs.length){log("  vazio/stop em "+ini);break;}
    for(const w of regs){ const rr=w.registro||w; totReg++;
      const d=rr.despesa||{}; const sub=(d.subfuncao?.denominacao)||""; const acao=(d.acao?.denominacao)||""; const func=(d.funcao?.denominacao)||"";
      if(!/aliment/i.test(sub) && !/aliment|merenda/i.test(acao)) continue; // só merenda
      alimReg++;
      const cc=(rr.classificacaoCompleta?.classificacaoCompleta)||rr.classificacaoCompleta||"?";
      const nat=(rr.naturezaDespesa?.denominacao)||(rr.naturezaDespesa?.especificacao)||"?";
      const elem=(rr.naturezaDespesa?.codigoCompleto)||"";
      const emp=rr.empenho?.valor||rr.valorEmpenhado||0;
      let pago=0; (rr.listMovimentos||[]).forEach(m=>{ if(/Pagamento/i.test(m.tipoMovimento)) pago+=m.valorMovimento||0; });
      const key=cc;
      (dot[key]??={cc,func,sub,acao,nats:{},emp:0,pago:0,n:0}); const g=dot[key]; g.emp+=emp; g.pago+=pago; g.n++;
      (g.nats[nat]??={emp:0,pago:0}); g.nats[nat].emp+=emp; g.nats[nat].pago+=pago;
    }
    log(`  +${regs.length} (tot ${totReg}, merenda ${alimReg})`);
    if(regs.length<qt)break; ini+=qt; if(ini>120000)break;
  }
}
fs.writeFileSync(OUT+"dotacao_merenda.json", JSON.stringify(dot,null,1));
log(`\nDOTAÇÕES da merenda: ${Object.keys(dot).length} | registros merenda ${alimReg}/${totReg}`);
for(const g of Object.values(dot).sort((a,b)=>b.pago-a.pago)){ log(`\n${g.cc} | ${g.func}>${g.sub}>${g.acao} | emp R$${(g.emp/1e6).toFixed(2)}mi pago R$${(g.pago/1e6).toFixed(2)}mi (${g.n} emp)`); for(const [n,x] of Object.entries(g.nats)) log(`    - ${n}: pago R$${(x.pago/1e6).toFixed(2)}mi`); }
log("FIM");
