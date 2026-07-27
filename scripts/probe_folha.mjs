const HOST="https://transparencia.e-publica.net";
const B=HOST+"/epublica-portal/rest/florianopolis";
const UA={"User-Agent":"Mozilla/5.0","Accept":"application/json,text/plain,*/*","Referer":HOST+"/epublica-portal/"};
async function probe(label,url,opts={}){
  try{ const r=await fetch(url,{headers:UA,...opts,signal:AbortSignal.timeout(30000)}); const t=await r.text();
    console.log(`\n[${label}] ${opts.method||"GET"} ${r.status} ${r.headers.get("content-type")||""} len=${t.length}`);
    console.log("  "+t.slice(0,220).replace(/\n/g," "));
    return {r,t};
  }catch(e){ console.log(`\n[${label}] ERRO ${e.message.slice(0,50)}`); return null; }
}
// 1) endpoints de dados abertos / geracao de arquivo
await probe("genfile-GET", `${B}/dadosAbertos/gestaoPessoal/generate-file-to-download?referencia=12/2025&codigo_unidade=342210&formato=csv`);
await probe("genfile-POST", `${B}/dadosAbertos/gestaoPessoal/generate-file-to-download`, {method:"POST",headers:{...UA,"Content-Type":"application/json"},body:JSON.stringify({referencia:"12/2025",codigoUnidade:"342210",formato:"CSV"})});
// 2) listar unidades (p/ confirmar que 342210/34 existem)
await probe("unidades", `${B}/api/v1/pessoal/unidades`);
await probe("unidade-list2", `${B}/dadosAbertos/gestaoPessoal/unidades`);
// 3) pessoal com formato/csv
await probe("pessoal-csv", `${B}/api/v1/pessoal?referencia=12/2025&inicio_registro=0&quantidade_registro=50&codigo_unidade=342210&formato=csv`);
// 4) endpoint de folha alternativo
await probe("remuneracao", `${B}/api/v1/remuneracao?referencia=12/2025&codigo_unidade=342210`);
// 5) o que o SPA carrega de config
await probe("config", `${B}/api/v1/configuracao`);
