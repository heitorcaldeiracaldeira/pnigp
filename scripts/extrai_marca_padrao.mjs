// EXTRAI marca dos templates de TEXTO A/B (inline) — LEVE: lê a fila `doc_tem_marca` (não varre os 12GB), extrai
// pares crus {marca,valor} do texto e grava EM LOTE em app.item_marca_padrao_${uf}. NÃO ancora nem escreve conferida —
// quem consolida/ancora por valor é scripts/auditoria/consolida_marca.mjs (set-based). Templates:
//   A = "Marca/Fabricante: X  Modelo/versão:"  ·  B = "Item… Valor… Marca: X Modelo:"
// (o template C colunar já vive em item_marca_${uf}; visão em app.item_marca_visao_${uf}). State-agnostic (UF).
//   LIMIT=0 node scripts/extrai_marca_padrao.mjs
import fs from "fs"; import pg from "pg";
const U=fs.readFileSync("./.env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db=new pg.Pool({connectionString:U,ssl:{rejectUnauthorized:false},max:3,statement_timeout:590000});
const LIM=Number(process.env.LIMIT??0);
const UF=(process.env.UF||"sc").toLowerCase();
const T_TEXTO=`arquivo_texto_${UF}`;
const T_FLAG=(UF==="sc"?"app.doc_tem_marca":`app.doc_tem_marca_${UF}`);
const T_PADRAO=`app.item_marca_padrao_${UF}`;
const T_FEITAS=`app.marca_padrao_feitas_${UF}`;

const NOISE=/^(servi|material|pe[çc]a|diversos?|v[aá]rios?|nacional|importad|pr[oó]pri|sem marca|marca pr|conforme|generic|n\/?c|n\/?a|na|-+|\.+|x+)$/i;
const NAO_MARCA=/n[aã]o\s+inform|fabricante\s*n[aã]o|^fabricante\b|engenharia|constru|^obra|servi[çc]o/i;
function limpaMarca(s){
  if(!s) return null;
  s=s.replace(/\s+/g," ").trim().replace(/[.,;:\-–]+$/,"").trim();
  if(s.length<2||s.length>60) return null;
  if(NOISE.test(s)||NAO_MARCA.test(s)||!/[a-zA-ZÀ-ÿ]/.test(s)||s.split(" ").length>5) return null;
  return s.toUpperCase();
}
const parseBR=(x)=>{ if(!x) return null; const n=parseFloat(String(x).replace(/\./g,"").replace(",",".")); return isFinite(n)?n:null; };
// pares {marca,valor,padrao} de um texto (A e B)
function extrai(texto){
  const out=[]; let m;
  const reA=/Marca\/Fabricante\s*:?\s*(.+?)\s*Modelo\/?vers/gis;
  while((m=reA.exec(texto))){ const mk=limpaMarca(m[1]); if(mk) out.push({marca:mk,valor:null,padrao:"A"}); }
  for(const b of texto.split(/Item\s*:/i).slice(1)){
    const mMarca=b.match(/Marca\s*:\s*(.+?)\s*Modelo/is); if(!mMarca) continue;
    const mk=limpaMarca(mMarca[1]); if(!mk) continue;
    const mVal=b.match(/Valor\s*(?:Unit\.?|Unit[aá]rio|unit[aá]rio)\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i);
    out.push({marca:mk, valor:parseBR(mVal?.[1]), padrao:"B"});
  }
  return out;
}

async function main(){
  await db.query(`create table if not exists ${T_PADRAO}(cnpj text,ano int,seq int,marca text,valor numeric,padrao text,atualizado timestamptz default now())`);
  await db.query(`create index if not exists ix_marcapadrao_proc_${UF} on ${T_PADRAO}(cnpj,ano,seq)`);
  await db.query(`create table if not exists ${T_FEITAS}(cnpj text,ano int,seq int,primary key(cnpj,ano,seq))`);
  const lim=LIM>0?`limit ${LIM}`:``;
  // fila LEVE: processos da flag ainda não extraídos (idempotência = feitas, invalidada por evento no ao_homologar)
  const procs=(await db.query(`
    select distinct d.cnpj,d.ano,d.seq from ${T_FLAG} d
    where not exists(select 1 from ${T_FEITAS} f where f.cnpj=d.cnpj and f.ano=d.ano and f.seq=d.seq) ${lim}`)).rows;
  console.log(`[extrai A/B UF=${UF}] processos: ${procs.length}`);
  let pares=0;
  for(const p of procs){
    const docs=(await db.query(`select texto from ${T_TEXTO} where cnpj=$1 and ano=$2 and seq=$3 and chars>500`,[p.cnpj,p.ano,p.seq])).rows;
    const rows=[]; for(const d of docs) for(const par of extrai(d.texto)) if(par.valor!=null) rows.push(par);
    // RECONCILE da via A/B: apaga só os pares A/B antigos do processo (NÃO toca PCP/BLL/P de outras vias) e grava os atuais EM LOTE
    await db.query(`delete from ${T_PADRAO} where cnpj=$1 and ano=$2 and seq=$3 and (padrao in ('A','B') or padrao is null)`,[p.cnpj,p.ano,p.seq]);
    if(rows.length){
      const vals=[]; const ph=rows.map((r,i)=>`($${i*6+1},$${i*6+2},$${i*6+3},$${i*6+4},$${i*6+5},$${i*6+6})`).join(",");
      rows.forEach(r=>vals.push(p.cnpj,p.ano,p.seq,r.marca,r.valor,r.padrao));
      await db.query(`insert into ${T_PADRAO}(cnpj,ano,seq,marca,valor,padrao) values ${ph}`,vals);
      pares+=rows.length;
    }
    await db.query(`insert into ${T_FEITAS}(cnpj,ano,seq) values($1,$2,$3) on conflict do nothing`,[p.cnpj,p.ano,p.seq]);
  }
  console.log(`pares A/B gravados (cru): ${pares} → rode consolida_marca.mjs p/ ancorar por valor`);
  await db.end();
}
main().catch(e=>{console.error("ERRO:",e.message);process.exit(1);});
