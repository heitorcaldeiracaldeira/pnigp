const cnpj="82892282000143", ano=2025, seq=96;
const url=`https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos`;
try{
  const r=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(40000)});
  console.log("status",r.status);
  const j=await r.json();
  console.log(JSON.stringify(j,null,1).slice(0,3000));
}catch(e){ console.log("erro",e.message); }
