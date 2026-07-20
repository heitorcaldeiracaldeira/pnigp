// CONFERÊNCIA marca→item (Compras.gov / comprasnet, texto — sem OCR).
// Doc correto = Termo com "Marca/Fabricante". Extrai a marca da PROPOSTA ADJUDICADA (vencedor),
// amarra ao nº do item, e VALIDA com trava dupla contra itens_sc: CNPJ==cnpj_fornecedor E valor==unit_homologado
// (ambos vindos da API PNCP). Grava só o que bate nos 2 sinais. Derivada (Lei 1) em app.item_marca_conferida_sc.
//   node scripts/confere_marca_comprasnet.mjs            # leva de validação
//   LIMIT=0 node scripts/confere_marca_comprasnet.mjs    # tudo
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DB = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LIMIT = process.env.LIMIT != null ? Number(process.env.LIMIT) : 40;
const GEN = /^(diversos|pr[oó]prio|pr[oó]pria|s\/?marca|n[aã]o se aplica|n\/?a|-+|sem marca|marca pr[oó]pria|nacional|importado|gen[eé]rico|generico|refrigerante)$/i;
const norm = s => (s||"").replace(/\D/g,"");
const num = s => Number(String(s||"").replace(/\./g,"").replace(",","."));

async function ddl(db){
  await db.query(`create table if not exists app.item_marca_conferida_sc(
    cnpj text, ano int, seq int, numero text, marca text, modelo text,
    fornecedor_cnpj text, valor numeric, marca_generica bool,
    cnpj_ok bool, valor_ok bool, portal text, fonte_titulo text, atualizado timestamptz default now(),
    primary key(cnpj,ano,seq,numero))`);
  await db.query(`create table if not exists app.marca_conferida_feitas(
    cnpj text, ano int, seq int, status text, itens_doc int, conferidos int,
    atualizado timestamptz default now(), primary key(cnpj,ano,seq))`);
}

// parseia o Termo comprasnet → por item: {cnpj_venc, valor, marca, modelo}
function parse(txt){
  const out = {};
  // cada item: "...Homologado...CNPJ X, melhor lance R$ V ... Propostas do Item N <bloco até proximo Homologado>"
  const re = /Homologado[^]*?CNPJ\s+([\d.\/-]+),\s*melhor lance:\s*R\$\s*([\d.,]+)[^]*?Propostas do Item\s+(\d+)([^]*?)(?=(?:Adjudicado e )?Homologado (?:por|em)|Propostas do Item\s+\d+|$)/g;
  let m;
  while((m = re.exec(txt))){
    const cnpjV = norm(m[1]), valor = num(m[2]), item = m[3], bloco = m[4];
    const mk = bloco.match(/Proposta adjudicada\s*Marca\/Fabricante:\s*(.+?)\s*Modelo\/vers[aã]o:\s*(.+?)\s*Valor/i);
    out[item] = { cnpjV, valor, marca: mk?mk[1].replace(/\s+/g,' ').trim():null, modelo: mk?mk[2].replace(/\s+/g,' ').trim().slice(0,60):null };
  }
  return out;
}

async function main(){
  const db = new pg.Pool({ connectionString: DB, ssl:{rejectUnauthorized:false}, max: 3, statement_timeout: 120000 });
  db.on("error",()=>{});
  await ddl(db);
  const lim = LIMIT>0 ? `limit ${LIMIT}` : "";
  // processos Compras.gov com doc de resultado contendo Marca/Fabricante, ainda não feitos
  const procs = (await db.query(`
    select distinct t.cnpj,t.ano,t.seq, c.plataforma
    from arquivo_texto_sc t
    join contratacoes_sc c on c.cnpj=t.cnpj and c.ano=t.ano and c.seq=t.seq
    where t.texto ~ 'Proposta adjudicada' and t.texto ~ 'Marca/Fabricante' and t.chars>800
      and exists(select 1 from itens_sc i where i.cnpj=t.cnpj and i.ano=t.ano and i.seq=t.seq
                 and i.cnpj_fornecedor is not null and i.unit_homologado is not null)
      and not exists(select 1 from app.marca_conferida_feitas f where f.cnpj=t.cnpj and f.ano=t.ano and f.seq=t.seq)
    ${lim}`)).rows;
  console.log(`processos Compras.gov c/ doc de proposta: ${procs.length} (LIMIT=${LIMIT})`);
  let done=0;
  for(const p of procs){
    try{
      const doc = (await db.query(`select texto from arquivo_texto_sc where cnpj=$1 and ano=$2 and seq=$3 and texto ~ 'Marca/Fabricante' order by chars desc limit 1`,[p.cnpj,p.ano,p.seq])).rows[0];
      const itens = (await db.query(`select numero, cnpj_fornecedor cf, unit_homologado uh from itens_sc where cnpj=$1 and ano=$2 and seq=$3`,[p.cnpj,p.ano,p.seq])).rows;
      const byNum={}; itens.forEach(i=>byNum[String(i.numero)]=i);
      const parsed = parse(doc.texto);
      let conf=0, nd=0;
      for(const [item,w] of Object.entries(parsed)){
        nd++;
        const si = byNum[item]; if(!si) continue;
        const cnpjOk = si.cf && norm(si.cf)===w.cnpjV;
        const valOk = si.uh!=null && Math.abs(Number(si.uh)-w.valor)<0.01;
        if(!(cnpjOk && valOk)) continue;               // TRAVA DUPLA — só grava com 2 sinais
        conf++;
        await db.query(`insert into app.item_marca_conferida_sc(cnpj,ano,seq,numero,marca,modelo,fornecedor_cnpj,valor,marca_generica,cnpj_ok,valor_ok,portal,fonte_titulo)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true,$10,'comprasnet')
          on conflict(cnpj,ano,seq,numero) do update set marca=$5,modelo=$6,fornecedor_cnpj=$7,valor=$8,marca_generica=$9,portal=$10,atualizado=now()`,
          [p.cnpj,p.ano,p.seq,item,w.marca,w.modelo,w.cnpjV,w.valor, w.marca? GEN.test(w.marca):true, p.plataforma]);
      }
      await db.query(`insert into app.marca_conferida_feitas(cnpj,ano,seq,status,itens_doc,conferidos) values($1,$2,$3,'ok',$4,$5)
        on conflict(cnpj,ano,seq) do update set status='ok',itens_doc=$4,conferidos=$5,atualizado=now()`,[p.cnpj,p.ano,p.seq,nd,conf]);
    }catch(e){ await db.query(`insert into app.marca_conferida_feitas(cnpj,ano,seq,status) values($1,$2,$3,$4) on conflict(cnpj,ano,seq) do update set status=$4`,[p.cnpj,p.ano,p.seq,'erro:'+e.message.slice(0,60)]); }
    done++; if(done%10===0) process.stdout.write(`\r  ${done}/${procs.length}`);
  }
  console.log(`\n=== RESULTADO ===`);
  console.table((await db.query(`select count(*) itens_conferidos, count(*) filter (where not marca_generica) marca_real, count(distinct cnpj||ano||seq) procs from app.item_marca_conferida_sc`)).rows);
  console.log("amostra marca REAL conferida (marca no item certo, CNPJ+valor✓):");
  (await db.query(`select numero, left(marca,30) marca, valor from app.item_marca_conferida_sc where not marca_generica order by random() limit 12`)).rows.forEach(r=>console.log(`  it${String(r.numero).padStart(3)} | ${r.marca.padEnd(30)} | R$ ${r.valor}`));
  await db.end();
}
main().catch(e=>{console.error("ERRO:",e.message);process.exit(1);});
