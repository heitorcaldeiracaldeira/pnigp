import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const B="https://transparencia.e-publica.net/epublica-portal/rest/florianopolis/api/v1/despesa";
const H={"user-agent":"Mozilla/5.0","accept":"application/json"};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const log=m=>{ fs.appendFileSync(OUT+"empenhos_log.txt", m+"\n"); };
// filtro preciso: função Educação + objeto de comida  OU  CNPJ do SEPAT (mão de obra)
const OBJFOOD=/cozinheira|g[eê]neros? alimentic|alimentíci|hortifrutigranjeiro|agricultura familiar|\bmerenda\b|mais perec[ií]ve|menos perec[ií]ve|kit.{0,6}aliment/i;
const SEPAT=/03\.?750\.?757\/?0001-?90|SEPAT/i;
function isMerenda(reg){
  const func=(reg.despesa?.funcao?.denominacao||"");
  const obj=reg.empenho?.objetoResumido||"";
  const forn=reg.fornecedor?.pessoa?.nome||""; const cnpj=reg.fornecedor?.pessoa?.cpfCnpj||"";
  const sub=(reg.despesa?.subfuncao?.denominacao||"");
  const educ=/Educa/i.test(func);
  if(SEPAT.test(forn)||SEPAT.test(cnpj)) return true;            // mão de obra
  if(educ && (OBJFOOD.test(obj)||/Aliment/i.test(sub))) return true; // gêneros/agric na Educação
  return false;
}
async function page(ano, ini, qtd){
  const qs=`periodo_inicial=01/${ano}&periodo_final=12/${ano}&inicio_registro=${ini}&quantidade_registro=${qtd}`;
  for(let i=0;i<8;i++){ try{ const r=await fetch(`${B}?${qs}`,{headers:H,signal:AbortSignal.timeout(60000)}); const j=await r.json(); if((j.registros||[]).length) return j.registros; }catch(e){} await wait(8000); }
  return [];
}
const agg={};
function acc(reg){
  if(!isMerenda(reg)) return false;
  const f=(reg.fornecedor?.pessoa?.nome||"?")+" · "+(reg.fornecedor?.pessoa?.cpfCnpj||"");
  if(!agg[f]) agg[f]={emp:0,liq:0,pago:0,ret:0,contratos:new Set(),objs:new Set(),n:0};
  const a=agg[f]; a.n++;
  if(reg.empenho?.contrato) a.contratos.add(reg.empenho.contrato+(reg.empenho.licitacao?" ("+reg.empenho.licitacao+")":""));
  const o=(reg.empenho?.objetoResumido||"").slice(0,50); if(o)a.objs.add(o);
  for(const m of reg.listMovimentos||[]){ const v=m.valorMovimento||0,t=m.tipoMovimento||"";
    if(/Emiss/i.test(t))a.emp+=v; else if(/Liquida/i.test(t))a.liq+=v; else if(/Pagamento/i.test(t))a.pago+=v; else if(/Reten/i.test(t))a.ret+=v; }
  return true;
}
const QTD=3000;
for(const ano of [2025,2026]){
  log(`\n### ANO ${ano}`); let ini=0, matched=0, scanned=0;
  while(true){
    const recs=await page(ano,ini,QTD); if(!recs.length) break;
    let m=0; for(const rec of recs){ if(acc(rec.registro||rec)) m++; }
    matched+=m; scanned+=recs.length;
    log(`  ${ano} @${ini}: ${recs.length} recs · ${m} merenda (scan ${scanned}, match ${matched})`);
    fs.writeFileSync(OUT+"empenhos_merenda.json", JSON.stringify(Object.fromEntries(Object.entries(agg).map(([k,v])=>[k,{...v,contratos:[...v.contratos],objs:[...v.objs]}])),null,1));
    if(recs.length<QTD) break;
    ini+=QTD;
  }
}
log("\n=== TOTAIS POR FORNECEDOR ===");
const rows=Object.entries(agg).sort((a,b)=>b[1].pago-a[1].pago);
for(const [f,a] of rows) log(`  ${f.slice(0,50).padEnd(50)} emp ${Math.round(a.emp).toLocaleString('pt-BR').padStart(14)} liq ${Math.round(a.liq).toLocaleString('pt-BR').padStart(14)} pago ${Math.round(a.pago).toLocaleString('pt-BR').padStart(14)} (${a.n})`);
const t=rows.reduce((s,[,a])=>({e:s.e+a.emp,l:s.l+a.liq,p:s.p+a.pago}),{e:0,l:0,p:0});
log(`\nTOTAL MERENDA: empenhado ${Math.round(t.e).toLocaleString('pt-BR')} · liquidado ${Math.round(t.l).toLocaleString('pt-BR')} · pago ${Math.round(t.p).toLocaleString('pt-BR')}`);
log("FIM");
