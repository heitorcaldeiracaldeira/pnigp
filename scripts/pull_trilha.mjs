import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const B="https://transparencia.e-publica.net/epublica-portal/rest/florianopolis/api/v1/despesa";
const H={"user-agent":"Mozilla/5.0","accept":"application/json"};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const log=m=>fs.appendFileSync(OUT+"trilha_log.txt", m+"\n");
const OBJFOOD=/cozinheira|g[eê]neros? alimentic|alimentíci|hortifrutigranjeiro|agricultura familiar|\bmerenda\b|mais perec[ií]ve|menos perec[ií]ve|kit.{0,6}aliment/i;
const SEPAT=/03\.?750\.?757\/?0001-?90/;
function isMerenda(r){ const func=r.despesa?.funcao?.denominacao||""; const obj=r.empenho?.objetoResumido||""; const cnpj=r.fornecedor?.pessoa?.cpfCnpj||""; const sub=r.despesa?.subfuncao?.denominacao||"";
  if(SEPAT.test(cnpj)&&/Educa/i.test(func)) return true;                 // SEPAT SÓ na Educação
  if(/Educa/i.test(func)&&(OBJFOOD.test(obj)||/Aliment/i.test(sub))) return true; return false; }
async function page(ano,ini,qtd){ const qs=`periodo_inicial=01/${ano}&periodo_final=12/${ano}&inicio_registro=${ini}&quantidade_registro=${qtd}`;
  for(let i=0;i<8;i++){ try{ const r=await fetch(`${B}?${qs}`,{headers:H,signal:AbortSignal.timeout(60000)}); const j=await r.json(); if((j.registros||[]).length) return j.registros; }catch(e){} await wait(8000);} return []; }
const C={}; // por contrato
function acc(r,ano){ if(!isMerenda(r)) return false;
  const ct=r.empenho?.contrato||"(sem contrato)"; const lic=r.empenho?.licitacao||"";
  const key=ct+" ["+lic+"]";
  if(!C[key]) C[key]={fornecedor:r.fornecedor?.pessoa?.nome,cnpj:r.fornecedor?.pessoa?.cpfCnpj,licitacao:lic,anos:new Set(),unidade:new Set(),funcao:new Set(),subfuncao:new Set(),natureza:new Set(),fontes:{},emp:0,liq:0,ret:0,pago:0,nEmp:0,nNF:0,valNF:0,objs:new Set()};
  const a=C[key]; a.nEmp++; a.anos.add(ano);
  a.unidade.add(r.unidadeOrcamentaria?.denominacao||"?"); a.funcao.add(r.despesa?.funcao?.denominacao||"?"); a.subfuncao.add(r.despesa?.subfuncao?.denominacao||"?");
  const nd=r.naturezaDespesa; a.natureza.add((nd?.elemento?.denominacao||nd?.grupo?.denominacao||"?"));
  const fr=r.fonteRecurso?.denominacao||"?"; if(!a.fontes[fr])a.fontes[fr]={emp:0,pago:0};
  const o=(r.empenho?.objetoResumido||"").slice(0,45); if(o)a.objs.add(o);
  for(const m of r.listMovimentos||[]){ const v=m.valorMovimento||0,t=m.tipoMovimento||"";
    if(/Emiss/i.test(t)){a.emp+=v;a.fontes[fr].emp+=v;} else if(/Liquida/i.test(t))a.liq+=v; else if(/Pagamento/i.test(t)){a.pago+=v;a.fontes[fr].pago+=v;} else if(/Reten/i.test(t))a.ret+=v; }
  for(const nf of r.listEmpenhoDocumentos||[]){ if(/fiscal/i.test(nf.tipoDocumento||"")){a.nNF++;a.valNF+=nf.valor||0;} }
  return true; }
const QTD=3000;
for(const ano of [2024,2025,2026]){ let ini=0,sc=0,mt=0; log(`### ${ano}`);
  while(true){ const recs=await page(ano,ini,QTD); if(!recs.length) break; for(const rec of recs){ if(acc(rec.registro||rec,ano)) mt++; } sc+=recs.length;
    log(`  ${ano}@${ini}: ${recs.length} (scan ${sc}, match ${mt})`);
    const dump=Object.fromEntries(Object.entries(C).map(([k,v])=>[k,{...v,anos:[...v.anos],unidade:[...v.unidade],funcao:[...v.funcao],subfuncao:[...v.subfuncao],natureza:[...v.natureza],objs:[...v.objs]}]));
    fs.writeFileSync(OUT+"empenhos_trilha.json", JSON.stringify(dump,null,1));
    if(recs.length<QTD) break; ini+=QTD; } }
log("FIM "+Object.keys(C).length+" contratos");
