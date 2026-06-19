const API="https://consultafns.saude.gov.br/recursos/consulta-consolidada/repasse-bloco";
for (const ano of [2010, 2018, 2024]) {
  const r=await fetch(`${API}?ano=${ano}&coMunicipioIbge=420005&coTipoRepasse=M&count=50&page=1&sgUf=SC`,{signal:AbortSignal.timeout(40000)});
  const b=((await r.json()).resultado||[])[0];
  console.log(`ano ${ano} — chaves do bloco:`, b?JSON.stringify(Object.keys(b)):"vazio");
  if(b) console.log(`   valores:`, JSON.stringify({codigo:b.codigo, co:b.co, cod:b.cod, nome:b.nome, descricao:b.descricao, nrepasses:(b.repasses||[]).length}));
}
