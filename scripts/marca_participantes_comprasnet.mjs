// MARCAS PARTICIPANTES por item (Compras.gov / comprasnet) — captura TODAS as marcas que concorreram
// (vencedor + perdedores), ligadas à DESCRIÇÃO do item. Corpus descrição→marcas concorrentes p/ estudar
// a descrição do item e catálogo por CATMAT. NÃO substitui a marca CONFERIDA do vencedor (essa é a trava dupla).
// Derivada (Lei 1) em app.item_marca_participante_sc.  node scripts/marca_participantes_comprasnet.mjs [LIMIT=0]
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DB = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LIMIT = process.env.LIMIT != null ? Number(process.env.LIMIT) : 40;
const norm = s => (s||"").replace(/\D/g,"");
const num = s => Number(String(s||"").replace(/\./g,"").replace(",","."));

async function ddl(db){
  await db.query(`create table if not exists app.item_marca_participante_sc(
    cnpj text, ano int, seq int, numero text, descricao_item text,
    fornecedor_cnpj text, fornecedor text, marca text, modelo text, valor numeric,
    vencedor bool, portal text, atualizado timestamptz default now())`);
  await db.query(`create index if not exists ix_marcapart_item on app.item_marca_participante_sc(cnpj,ano,seq,numero)`);
  await db.query(`create table if not exists app.marca_part_feitas(
    cnpj text, ano int, seq int, n_part int, atualizado timestamptz default now(), primary key(cnpj,ano,seq))`);
}

// por item: array de propostas {cnpj, forn, valor, marca, modelo, vencedor}
function parseItens(txt){
  const itens = {};
  // fatia por "Propostas do Item N" até o próximo
  const secRe = /Propostas do Item\s+(\d+)([^]*?)(?=Propostas do Item\s+\d+|$)/g;
  let s;
  while((s = secRe.exec(txt))){
    const item = s[1], bloco = s[2];
    // cada proposta: "CNPJ - NOME ... R$ V (unitário) ... [Proposta adjudicada] Marca/Fabricante: M Modelo/versão: MO Valor proposta: R$ VP"
    const pRe = /([\d]{2}\.?[\d]{3}\.?[\d]{3}\/?[\d]{4}-?[\d]{2}|[\d.\-*]{6,})\s*-\s*(.+?)\s*(?:Benef[^]*?)?(Proposta adjudicada\s*)?Marca\/Fabricante:\s*(.+?)\s*Modelo\/vers[aã]o:\s*(.+?)\s*Valor proposta:\s*R\$\s*([\d.,]+)/gi;
    let p; const arr=[];
    while((p = pRe.exec(bloco))){
      arr.push({ cnpj: norm(p[1]), forn: (p[2]||'').replace(/\s+/g,' ').trim().slice(0,80),
        vencedor: !!p[3], marca:(p[4]||'').replace(/\s+/g,' ').trim().slice(0,60),
        modelo:(p[5]||'').replace(/\s+/g,' ').trim().slice(0,60), valor: num(p[6]) });
    }
    if(arr.length) itens[item]=arr;
  }
  return itens;
}

async function main(){
  const db = new pg.Pool({ connectionString: DB, ssl:{rejectUnauthorized:false}, max:3, statement_timeout:120000 });
  db.on("error",()=>{});
  await ddl(db);
  const lim = LIMIT>0?`limit ${LIMIT}`:"";
  const procs=(await db.query(`
    select distinct t.cnpj,t.ano,t.seq from arquivo_texto_sc t
    join contratacoes_sc c on c.cnpj=t.cnpj and c.ano=t.ano and c.seq=t.seq
    where t.texto ~ 'Proposta adjudicada' and t.texto ~ 'Marca/Fabricante' and t.chars>800
      and exists(select 1 from itens_sc i where i.cnpj=t.cnpj and i.ano=t.ano and i.seq=t.seq)
      and not exists(select 1 from app.marca_part_feitas f where f.cnpj=t.cnpj and f.ano=t.ano and f.seq=t.seq) ${lim}`)).rows;
  console.log(`processos: ${procs.length} (LIMIT=${LIMIT})`);
  let done=0;
  for(const p of procs){
    try{
      const doc=(await db.query(`select texto from arquivo_texto_sc where cnpj=$1 and ano=$2 and seq=$3 and texto ~ 'Marca/Fabricante' order by chars desc limit 1`,[p.cnpj,p.ano,p.seq])).rows[0];
      const itens=(await db.query(`select numero, left(descricao,200) d from itens_sc where cnpj=$1 and ano=$2 and seq=$3`,[p.cnpj,p.ano,p.seq])).rows;
      const desc={}; itens.forEach(i=>desc[String(i.numero)]=i.d);
      const parsed=parseItens(doc.texto); let n=0;
      for(const [item,props] of Object.entries(parsed)){
        for(const pr of props){
          await db.query(`insert into app.item_marca_participante_sc(cnpj,ano,seq,numero,descricao_item,fornecedor_cnpj,fornecedor,marca,modelo,valor,vencedor,portal)
            values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Compras.gov.br')`,
            [p.cnpj,p.ano,p.seq,item,desc[item]||null,pr.cnpj,pr.forn,pr.marca,pr.modelo,pr.valor,pr.vencedor]);
          n++;
        }
      }
      await db.query(`insert into app.marca_part_feitas(cnpj,ano,seq,n_part) values($1,$2,$3,$4) on conflict(cnpj,ano,seq) do update set n_part=$4,atualizado=now()`,[p.cnpj,p.ano,p.seq,n]);
    }catch(e){ await db.query(`insert into app.marca_part_feitas(cnpj,ano,seq,n_part) values($1,$2,$3,-1) on conflict(cnpj,ano,seq) do nothing`,[p.cnpj,p.ano,p.seq]); }
    done++; if(done%10===0) process.stdout.write(`\r  ${done}/${procs.length}`);
  }
  console.log(`\n=== participantes ===`);
  console.table((await db.query(`select count(*) linhas, count(*) filter(where vencedor) vencedores, count(distinct marca) marcas_distintas, count(distinct cnpj||ano||seq||numero) itens from app.item_marca_participante_sc`)).rows);
  await db.end();
}
main().catch(e=>{console.error("ERRO:",e.message);process.exit(1);});
