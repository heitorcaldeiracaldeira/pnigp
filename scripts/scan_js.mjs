import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const js=fs.readFileSync(OUT+"epub_main.min3.26.12-1784752364333.js","utf8");
for(const term of ["generate-file","tipoArquivo","gestaoPessoal","api/v1/pessoal","codigo_unidade","codigoUnidade","dadosAbertos","download","chunk"]){
  let i=js.indexOf(term); let cnt=0;
  while(i>=0 && cnt<3){ console.log(`\n### "${term}" @${i}`); console.log(js.slice(Math.max(0,i-160),i+200).replace(/\s+/g," ")); i=js.indexOf(term,i+1); cnt++; }
  if(i<0&&cnt===0) console.log(`\n### "${term}": NAO ENCONTRADO`);
}
