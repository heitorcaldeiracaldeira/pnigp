const CNPJ="82892282000143";
const NOMES=["LIDIAMARA","CARLA CRISTINA BRITTO","RENATA BRODBECK","GISELE LILIAM","RAQUEL ERDMANN","MARCIA CAROLINA"];
// lista contratações do órgão SME no PNCP (2024 e 2025), acha gêneros, puxa TR e grep DEPAE
async function arquivos(ano,seq){ try{ const r=await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ}/compras/${ano}/${seq}/arquivos`,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(30000)}); if(!r.ok)return null; return r.json(); }catch{return null;} }
async function meta(ano,seq){ try{ const r=await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ}/compras/${ano}/${seq}`,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(30000)}); if(!r.ok)return null; return r.json(); }catch{return null;} }
async function txt(uri){ try{ const r=await fetch(uri,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(40000)}); if(!r.ok)return ""; const b=Buffer.from(await r.arrayBuffer()); return b.toString("latin1"); }catch{return "";} }
// varre seqs 2024 e 2025, acha objetos de gêneros
const achados=[];
for(const ano of [2025,2024]){
  for(let seq=1; seq<=140 && achados.length<60; seq++){
    const m=await meta(ano,seq); if(!m)continue;
    const obj=(m.objetoCompra||m.objeto||"").toUpperCase();
    if(!/GENERO|ALIMENTIC|HORTAL|PAO|PAES|CARNE|LACTEO|FRUTA|PERECIVE/.test(obj))continue;
    achados.push({ano,seq,obj:obj.slice(0,60)});
  }
}
console.log("processos de gêneros achados:",achados.length);
// p/ os 6 primeiros, pega TR e grep DEPAE
let done=0;
for(const a of achados){ if(done>=6)break;
  const arqs=await arquivos(a.ano,a.seq); if(!arqs)continue;
  const tr=arqs.find(x=>/Termo de Refer|TR/i.test(x.tipoDocumentoNome||x.titulo||"")); if(!tr)continue;
  const t=await txt(tr.uri||tr.url); if(!t)continue;
  const T=t.normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase();
  const found=NOMES.filter(n=>T.includes(n));
  console.log(`\n${a.ano}/${a.seq} — ${a.obj}\n   DEPAE que assinaram: ${found.join(", ")||"(não localizado no texto)"}`);
  done++;
}
