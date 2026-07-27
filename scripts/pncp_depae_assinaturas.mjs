import fs from "fs"; import {execSync} from "child_process";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const log=m=>{fs.appendFileSync(OUT+"depae_assin_log.txt", m+"\n"); console.log(m);};
const CNPJ="82892282000143";
const NOMES={"LIDIAMARA DORNELLES":"Lidiamara","CARLA CRISTINA BRITTO":"Carla","RENATA BRODBECK":"Renata","GISELE LILIAM":"Gisele","RAQUEL ERDMANN":"Raquel","MARCIA CAROLINA DE ARAUJO":"Marcia"};
async function j(u){ try{const r=await fetch(u,{headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(40000)}); if(!r.ok)return null; return r.json();}catch{return null;} }
// 1) busca PNCP
const proc=new Map();
for(const q of ["generos alimenticios florianopolis educacao","alimentacao escolar florianopolis","hortifruti florianopolis educacao","paes florianopolis educacao"]){
  for(let pg=1;pg<=3;pg++){
    const d=await j(`https://pncp.gov.br/api/search/?q=${encodeURIComponent(q)}&tipos_documento=edital&ordenacao=-data&pagina=${pg}&tam_pagina=20&status=todos`);
    const items=d?.items||d?.data||[]; if(!items.length)break;
    for(const it of items){ const nc=it.numero_controle_pncp||it.numeroControlePNCP||""; const org=(it.orgao_cnpj||it.orgaoCnpj||it.cnpj_orgao||"")+""; const obj=(it.objeto||it.descricaoObjeto||it.description||"")+"";
      if(!nc.startsWith(CNPJ)&&!/FLORIAN/i.test((it.orgao_nome||it.municipio_nome||"")+""))continue;
      if(!/GENERO|ALIMENTIC|HORTAL|PAO|PAES|CARNE|LACTEO|FRUTA|PERECIVE|MERENDA|COZINHEIR/i.test(obj.toUpperCase()))continue;
      if(nc.startsWith(CNPJ)) proc.set(nc,{nc,obj:obj.slice(0,55)});
    }
  }
}
log("processos SME/gêneros achados: "+proc.size);
// 2) p/ cada, baixa TR e grep
let n=0;
for(const p of proc.values()){ if(n>=25)break;
  const m=p.nc.match(/(\d+)-\d+-(\d+)\/(\d+)/); if(!m)continue; const seq=parseInt(m[2],10), ano=m[3];
  const arqs=await j(`https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ}/compras/${ano}/${seq}/arquivos`); if(!arqs)continue;
  const tr=arqs.find(x=>/Termo de Refer/i.test(x.tipoDocumentoNome||x.titulo||"")); if(!tr){continue;}
  try{ const r=await fetch(tr.uri||tr.url,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(60000)}); const buf=Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(OUT+"tmp_tr.pdf",buf); execSync(`pdftotext "${OUT}tmp_tr.pdf" "${OUT}tmp_tr.txt"`);
    const T=fs.readFileSync(OUT+"tmp_tr.txt","utf8").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase();
    const found=Object.entries(NOMES).filter(([k])=>T.includes(k)).map(([,v])=>v);
    log(`${ano}/${seq} — ${p.obj} → ${found.length?found.join(", "):"(sem nome DEPAE no texto)"}`); n++;
  }catch(e){ log(`${ano}/${seq}: erro ${e.message.slice(0,30)}`); }
}
log("FIM ("+n+" TRs analisados)");
