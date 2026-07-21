// ANÁLISE DOCUMENTAL do processo licitatório (fase interna, Lei 14.133) — por MODALIDADE.
// Por peça exigida: DOCUMENTO PRÓPRIO (arquivos_sc.tipo) vs EMBUTIDA (marcador no texto) vs NÃO CONSTA no PNCP.
// ⚠️ PNCP é espelho PARCIAL: "não consta" ≠ "não existe" → confirmador POSITIVO neutro, NUNCA acusa ausência.
// Reusa o corpus (arquivos_sc + arquivo_texto_sc); não re-parseia nada. Só amostra c/ texto (embutida é verificável).
//   node scripts/analisa_documentacao.mjs           # todas as modalidades
//   LIMIT=200 node scripts/analisa_documentacao.mjs
import fs from "fs"; import pg from "pg";
const U=fs.readFileSync("./.env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db=new pg.Pool({connectionString:U,ssl:{rejectUnauthorized:false},max:2,statement_timeout:590000});
const LIM=Number(process.env.LIMIT||100);
// peça -> { ids: tipo_documento_id(s) do doc próprio, re: marcador no texto (embutida) }
const PECAS={
  "DFD":            { ids:[10],   re:'documento de formaliz|formaliza..o da demanda|\\mdfd\\M' },
  "ETP":            { ids:[7],    re:'estudo t.cnico preliminar|\\metp\\M' },
  "TR":             { ids:[4],    re:'termo de refer.ncia' },
  "Projeto Básico": { ids:[6],    re:'projeto b.sico' },
  "Mapa de Riscos": { ids:[9],    re:'mapa de riscos|gerenciamento de risco' },
  "Aviso/Ato C.Direta":{ ids:[1,20], re:'aviso de contrata..o direta|ato que autoriza a contrata|contrata..o direta' },
};
// peças exigidas por modalidade (régua-protótipo; ajustável ao caso legal exato)
const EXPECT={
  "Pregão - Eletrônico":       ["DFD","ETP","TR","Mapa de Riscos"],
  "Concorrência - Eletrônica": ["DFD","ETP","TR","Projeto Básico","Mapa de Riscos"],
  "Dispensa":                  ["DFD","ETP","TR","Aviso/Ato C.Direta"],
  "Inexigibilidade":           ["DFD","ETP","TR","Aviso/Ato C.Direta"],
  "Credenciamento":            ["ETP","TR"],
};

async function analisa(mod, pecas){
  const sep = pecas.map((p,i)=>`bool_or(a.tipo_documento_id = ANY(ARRAY[${PECAS[p].ids.join(",")}])) s${i}`).join(", ");
  const emb = pecas.map((p,i)=>`bool_or(t.texto ~* '${PECAS[p].re}') e${i}`).join(", ");
  const r=(await db.query(`
    with amostra as (
      select distinct c.cnpj,c.ano,c.seq from contratacoes_sc c
      where c.modalidade=$1
        and exists(select 1 from arquivo_texto_sc t where t.cnpj=c.cnpj and t.ano=c.ano and t.seq=c.seq and t.texto is not null and t.chars>500)
      limit ${LIM}),
    sep as (select m.cnpj,m.ano,m.seq, ${sep} from amostra m join arquivos_sc a using(cnpj,ano,seq) group by 1,2,3),
    emb as (select m.cnpj,m.ano,m.seq, ${emb} from amostra m join arquivo_texto_sc t using(cnpj,ano,seq) where t.texto is not null group by 1,2,3)
    select s.*, ${pecas.map((p,i)=>`e.e${i}`).join(",")}
    from sep s left join emb e using(cnpj,ano,seq)`,[mod])).rows;
  if(!r.length){ console.log(`\n### ${mod} — sem amostra com texto`); return; }
  console.log(`\n### ${mod}  (n=${r.length})`);
  console.log("  peça                 | próprio | embutida | NÃO CONSTA | presente");
  for(const [i,p] of pecas.entries()){
    const sepN=r.filter(x=>x[`s${i}`]).length;
    const embN=r.filter(x=>!x[`s${i}`]&&x[`e${i}`]).length;
    const pres=r.filter(x=>x[`s${i}`]||x[`e${i}`]).length;
    console.log(`  ${p.padEnd(20)} | ${String(sepN).padStart(6)}  | ${String(embN).padStart(7)}  | ${String(r.length-pres).padStart(9)}  | ${(100*pres/r.length).toFixed(0)}%`);
  }
  const dist={}; r.forEach(x=>{let n=0;pecas.forEach((p,i)=>{if(x[`s${i}`]||x[`e${i}`])n++;});dist[n]=(dist[n]||0)+1;});
  console.log("  completude:", Object.keys(dist).sort((a,b)=>b-a).map(k=>`${k}/${pecas.length}:${dist[k]}`).join("  "));
}

async function main(){
  console.log("ANÁLISE DOCUMENTAL — fase interna por modalidade (confirmador positivo; 'não consta' = espelho parcial, NÃO acusa)");
  for(const [mod,pecas] of Object.entries(EXPECT)) await analisa(mod, pecas);
  await db.end();
}
main().catch(e=>{console.error("ERRO:",e.message);process.exit(1);});
