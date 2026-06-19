const API="https://consultafns.saude.gov.br/recursos/consulta-consolidada/repasse-bloco";
const r=await fetch(`${API}?ano=2010&coMunicipioIbge=420005&coTipoRepasse=M&count=50&page=1&sgUf=SC`,{signal:AbortSignal.timeout(40000)});
const blocos=(await r.json()).resultado||[];
blocos.forEach((b,i)=>{
  console.log(`bloco[${i}] codigo=${b.codigo} nome=${b.nome} liq=${b.vlLiquido}`);
  (b.repasses||[]).forEach(c=>console.log(`   filho codigo=${c.codigo} nome=${String(c.nome).slice(0,40)} liq=${c.vlLiquido}`));
});
