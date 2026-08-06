// COLETOR Compras.gov (SIASG / dados-abertos) — marca ANCORADA POR VALOR. State-agnostic (UF/EST por env).
// ⭐ ACHADO (jul/2026, provado ao vivo): o módulo BANCO DE PREÇOS expõe a marca como CAMPO estruturado:
//   GET /modulo-pesquisa-preco/1_consultarMaterial (material) e /3_consultarServico (serviço) →
//   DTO com {marca|marca?, precoUnitario, niFornecedor(CNPJ), idCompra, numeroItemCompra, estado}.
//   codigoItemCatalogo(CATMAT) é OBRIGATÓRIO → varre-se o CATÁLOGO (modulo-material/4) por classe, estado=EST.
// PONTE (nossos itens NÃO têm CATMAT): idCompra = UASG(6)+modalidade(2)+numero(5)+ano(4). uasg=idCompra[0:6]
//   casa com contratacoes.unidade_codigo (6 díg) dos procs portal_real='Compras.gov'. Dentro do proc, ANCORA
//   por VALOR (precoUnitario ≈ unit_homologado ±0,02) + TRAVA DUPLA com CNPJ (niFornecedor==cnpj_fornecedor).
//   NUNCA por posição/ordem. Grava só o que bate nos 2 sinais.
// Idempotente: app.compras_gov_catmats_${uf} (catmat já varrido, por EST). Grava em LOTE (unnest) em
//   app.item_marca_conferida_${uf} (portal='Compras.gov'). Backoff em 429.
//   node scripts/auditoria/coletor_compras_gov.mjs            # NCAT catmats (default 300)
//   NCAT=0 node ...                                           # varre catálogo inteiro (pesado)
//   EST=PR UF=pr node ...                                     # outro estado (100% state-agnostic)
import fs from "fs"; import pg from "pg";
import { limpaMarca } from "../portais_comportamento.mjs";
const U = fs.readFileSync("./.env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString:U, ssl:{rejectUnauthorized:false}, max:3, statement_timeout:590000 });
const UF  = (process.env.UF  || "sc").toLowerCase();
const EST = (process.env.EST || "SC").toUpperCase();
const NCAT = process.env.NCAT != null ? Number(process.env.NCAT) : 300;   // 0 = catálogo inteiro
const DRY = process.env.DRY === "1";
const CONF = `app.item_marca_conferida_${UF}`, DONE = `app.compras_gov_catmats_${UF}`;
const BASE = "https://dadosabertos.compras.gov.br";
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const round2 = n => Math.round(Number(n)*100)/100;
// classes de MATERIAL onde a marca faz sentido (produtos com marca). Serviço raramente tem marca.
const CLASSES = [7510,7520,7530,7490,6505,6510,6515,6520,6525,6530,6532,6540,6545,8540,8520,8530,8510,3510,3610,4210,4230,4240,5836,5840,5985,7025,7030,7035,7040,7045,7050,7105,7110,7125,7195,7210,7220,7230,7240,7290,7310,7320,7330,7350,7360,8105,8110,8115,8125,8130,8135,8140,8145,9150,9310,9320,9905,4110,4120,4130,4140,2510,2540,2590,2610,2910,2920,2930,2940,2990,6135,6140,6145,6150,6210,6220,6230,6240,6250,6260,5120,5130,5133,5136,5140,5180,5210,5305,5310,5315,5320,5325,5330,5340,5345,5350,5355,5365];

async function api(path, params){
  const u = new URL(BASE+path); for(const[k,v] of Object.entries(params)) if(v!=null) u.searchParams.set(k,v);
  for(let t=0;t<6;t++){
    let r; try{ r = await fetch(u,{headers:{accept:"*/*","user-agent":"Mozilla/5.0"}, signal:AbortSignal.timeout(45000)}); }
    catch{ await sleep(2000*(t+1)); continue; }
    if(r.status===429){ await sleep(3500*(t+1)); continue; }
    if(!r.ok) return null;
    try{ return await r.json(); }catch{ return null; }
  }
  return null;
}
// enumera CATMATs do catálogo (por classe), pulando os já varridos p/ este EST
async function catmatsPendentes(){
  const feitos = new Set((await db.query(`select catmat from ${DONE} where estado=$1`,[EST])).rows.map(r=>r.catmat));
  const out = [];
  for(const classe of CLASSES){
    let pag=1;
    while(true){
      const j = await api("/modulo-material/4_consultarItemMaterial",{pagina:pag,tamanhoPagina:500,codigoClasse:classe,statusItem:true});
      const list = j?.resultado||[]; if(!list.length) break;
      for(const it of list){ const c=String(it.codigoItem); if(!feitos.has(c)) out.push(c); }
      if(list.length<500) break; pag++;
      if(NCAT>0 && out.length>=NCAT*3) break;   // já temos candidatos suficientes p/ o batch
      await sleep(120);
    }
    if(NCAT>0 && out.length>=NCAT*3) break;
  }
  const uniq=[...new Set(out)];
  return NCAT>0 ? uniq.slice(0, NCAT) : uniq;
}

async function main(){
  await db.query(`create table if not exists ${DONE}(catmat text, estado text, rows int, hits int, atualizado timestamptz default now(), primary key(catmat,estado))`);

  // índice ALVO: (uasg|cnpj|preco2) -> [{cnpj,ano,seq,numero,ano_idc}]  (procs Compras.gov c/ UASG 6 díg)
  const alvo = (await db.query(`
    select c.unidade_codigo uasg, c.cnpj, c.ano, c.seq, i.numero, i.unit_homologado uh, i.cnpj_fornecedor cf
    from app.processo_portal_real p
    join contratacoes_${UF} c on c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq
    join itens_${UF} i on i.cnpj=c.cnpj and i.ano=c.ano and i.seq=c.seq
    where p.portal_real='Compras.gov' and c.unidade_codigo ~ '^[0-9]{6}$'
      and i.unit_homologado is not null and i.cnpj_fornecedor is not null`)).rows;
  const idx = new Map(); const uasgs = new Set();
  for(const r of alvo){ uasgs.add(r.uasg); const k=`${r.uasg}|${r.cf}|${round2(r.uh)}`; if(!idx.has(k)) idx.set(k,[]); idx.get(k).push(r); }
  console.log(`ALVO ${EST}: ${alvo.length} itens homologados · ${idx.size} chaves (uasg|cnpj|preço) · ${uasgs.size} UASGs`);

  const catmats = await catmatsPendentes();
  console.log(`CATMATs a varrer: ${catmats.length} (NCAT=${NCAT})`);
  if(!catmats.length){ console.log("nada a varrer (catálogo esgotado p/ este EST)"); await db.end(); return; }

  // acumula por proc → grava em lote
  const porProc = new Map();   // "cnpj|ano|seq" -> Map(numero -> {marca,valor,forn})
  let rowsTot=0, hitsTot=0, gravados=0, catFeitos=0;
  const ENDPOINTS = [["/modulo-pesquisa-preco/1_consultarMaterial","marca"],["/modulo-pesquisa-preco/3_consultarServico","marca"]];

  async function gravaProc(key){
    const m = porProc.get(key); if(!m||!m.size) return 0;
    const [cnpj,ano,seq] = key.split("|");
    const nums=[],mks=[],vals=[],forns=[];
    for(const [numero,v] of m){ nums.push(Number(numero)); mks.push(v.marca); vals.push(v.valor); forns.push(v.forn||null); }
    if(!DRY) await db.query(`insert into ${CONF}(cnpj,ano,seq,numero,marca,valor,fornecedor_cnpj,cnpj_ok,valor_ok,portal,fonte_titulo)
        select $1,$2,$3, x.numero, x.marca, x.valor, x.forn, true, true, 'Compras.gov', 'dados-abertos: banco de preços (marca+preço+CNPJ)'
        from unnest($4::int[],$5::text[],$6::numeric[],$7::text[]) as x(numero,marca,valor,forn)
        on conflict(cnpj,ano,seq,numero) do update set marca=excluded.marca, valor=excluded.valor,
          fornecedor_cnpj=excluded.fornecedor_cnpj, cnpj_ok=true, valor_ok=true, portal='Compras.gov',
          fonte_titulo=excluded.fonte_titulo, atualizado=now()`,
      [cnpj,Number(ano),Number(seq),nums,mks,vals,forns]);
    const n=m.size; porProc.delete(key); return n;
  }

  for(const cat of catmats){
    let rows=0, hits=0;
    for(const [path] of ENDPOINTS){
      let pag=1;
      while(true){
        // ⚠️ CONTRATO DA API MUDOU (conferido ao vivo em 06/ago/2026, a versao de julho devolvia 404):
        //   antes: ?codigoItemCatalogo=<CATMAT>
        //   agora: ?tipo=codigoItemCatalogo&codigo=<CATMAT>   (tipo e enum: codigoItemCatalogo|codigoPdm)
        // e tamanhoPagina passou a ter faixa obrigatoria 10..500 -- fora dela responde 400 com
        // "Informe um numero de paginacao no intervalo de 10 a 500". O envelope segue sendo {resultado:[...]}.
        // O campo `marca` continua vindo estruturado, junto de precoUnitario, niFornecedor e codigoUasg.
        const j = await api(path,{tipo:"codigoItemCatalogo", codigo:cat, estado:EST, pagina:pag, tamanhoPagina:500});
        if(!j) break;
        const list = j.resultado||[]; rows+=list.length;
        for(const it of list){
          const id=String(it.idCompra||""); if(id.length<17) continue;
          const uasg=id.slice(0,6); if(!uasgs.has(uasg)) continue;
          const forn=String(it.niFornecedor||"").replace(/\D/g,"");
          const preco=round2(it.precoUnitario);
          const cand = idx.get(`${uasg}|${forn}|${preco}`); if(!cand) continue;
          const mk = limpaMarca(it.marca); if(!mk) continue;   // descarta ruído/genérico/vazio
          hits++;
          // desambigua por ano do idCompra quando houver múltiplos procs na mesma chave
          const anoIdc = id.slice(-4);
          const alvoR = cand.find(c=>String(c.ano)===anoIdc) || cand[0];
          const key=`${alvoR.cnpj}|${alvoR.ano}|${alvoR.seq}`;
          if(!porProc.has(key)) porProc.set(key,new Map());
          porProc.get(key).set(String(alvoR.numero), {marca:mk, valor:preco, forn});
        }
        if(list.length<500) break; pag++;
        await sleep(120);
      }
    }
    rowsTot+=rows; hitsTot+=hits; catFeitos++;
    if(!DRY) await db.query(`insert into ${DONE}(catmat,estado,rows,hits) values($1,$2,$3,$4)
      on conflict(catmat,estado) do update set rows=excluded.rows,hits=excluded.hits,atualizado=now()`,[cat,EST,rows,hits]);
    // grava incrementalmente procs já completos (libera memória)
    for(const key of [...porProc.keys()]) gravados += await gravaProc(key);
    if(catFeitos%25===0) process.stdout.write(`  ${catFeitos}/${catmats.length} catmats · rows ${rowsTot} · hits ${hitsTot} · gravados ${gravados}\r`);
    await sleep(120);
  }
  for(const key of [...porProc.keys()]) gravados += await gravaProc(key);

  console.log(`\n✔ Compras.gov/${EST}: catmats ${catFeitos} · rows API ${rowsTot} · hits(anchor✓) ${hitsTot} · itens gravados ${gravados}`);
  console.table((await db.query(`select count(*) itens, count(distinct (cnpj,ano,seq)) procs, count(*) filter(where marca is not null) com_marca
    from ${CONF} where portal='Compras.gov'`)).rows);
  console.log("amostra marca REAL (Compras.gov, anchor CNPJ+valor):");
  (await db.query(`select cnpj,ano,seq,numero,left(marca,28) marca,valor from ${CONF} where portal='Compras.gov' order by atualizado desc limit 12`)).rows
    .forEach(r=>console.log(`  ${r.cnpj}/${r.ano}/${r.seq} it${String(r.numero).padStart(3)} | ${String(r.marca).padEnd(28)} | R$ ${r.valor}`));
  await db.end();
}
main().catch(e=>{ console.error("ERRO:",e.message); process.exit(1); });
