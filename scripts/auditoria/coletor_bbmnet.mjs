// COLETOR BBMNET (Bolsa Brasileira de Mercadorias) — marca do portal, ancorada por VALOR. State-agnostic (UF por env).
// ⭐ CRACK (jul/2026, [[pnigp-conferencia-marca-comprasnet]] + [[pnigp-portais-endpoints-publicos]]):
//   O portal legado www2.bbmnet.com trava a consulta pública por reCAPTCHA por edital (NÃO contornar).
//   Rota LIMPA = PNCP/acervo (Lei 14.133 obriga publicar a ata). A marca do BBMNET VIVE na "ATA DE SESSÃO"
//   (declara www.bbmnet.com.br), padrão B: "Item nº N - Objeto: … Preço unitário:R$ X … Marca/Modelo: Z".
//   O "Termo de Homologação Unificado" (ERP do órgão) e o "Relatório de Disputa" (log de lances) NÃO têm marca.
//   Validado ao vivo: PE 073/2026 SAMAE JS → Marca/Modelo RBA/REDUTECH ancorou nos unit 300/400/900/1500.
// FONTE (mais barato primeiro): a) ACERVO arquivo_texto_${uf} (doc já baixado, ZERO chamada externa);
//   b) PNCP arquivos (api/pncp/v1/…/arquivos → blob) p/ procs sem o doc no acervo (backoff 429).
// Ancora SEMPRE por VALOR: Preço unitário do doc casa itens_${uf}.unit_homologado (±R$0,02); trava dupla c/ CNPJ.
// Grava EM LOTE (unnest) em app.item_marca_conferida_${uf} (portal='BBMNET'). Idempotente: app.bbmnet_feitas_${uf}.
// node scripts/auditoria/coletor_bbmnet.mjs   (LIMIT=15 prova · LIMIT=0 acervo inteiro · UF=sc default · NOPNCP=1 só acervo)
import fs from "fs"; import pg from "pg";
import { extractText, getDocumentProxy } from "unpdf";
import AdmZip from "adm-zip";
import { limpaMarca } from "../portais_comportamento.mjs";

const U = fs.readFileSync("./.env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({connectionString:U, ssl:{rejectUnauthorized:false}, max:3, statement_timeout:590000});
const UF   = (process.env.UF || "sc").toLowerCase();
const ITENS = `itens_${UF}`;
const CONF = `app.item_marca_conferida_${UF}`;
const FEITAS = `app.bbmnet_feitas_${UF}`;
const PPR  = `app.processo_portal_real`;   // rótulo do portal por proc (coluna portal_real)
const LIM  = process.env.LIMIT != null ? Number(process.env.LIMIT) : 30;
const USA_PNCP = process.env.NOPNCP !== "1";
const UA = { "user-agent": "Mozilla/5.0" };
const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

// marca genérica (não é marca específica de fabricante) — sinaliza, não descarta
const GENERICA = /pr[oó]pri|sem marca|marca pr|diversos?|v[aá]rios?|nacional|importad|generic|n[aã]o\s*inform/i;

// ---- PARSER padrão B (ATA DE SESSÃO do BBMNET): bloco por "Item nº N" ----
function parseAtaSessao(txt){
  const out=[];
  const blocks = txt.split(/Item\s*n[ºo°]\s*/i).slice(1);
  for(const b of blocks){
    const nm = b.match(/^\s*(\d{1,4})\b/); if(!nm) continue;
    const numero = Number(nm[1]);
    const pu = b.match(/Pre[çc]o\s*unit[aá]rio:?\s*R?\$?\s*([\d.]+,\d{2})/i);
    if(!pu) continue;
    const valor = parseFloat(pu[1].replace(/\./g,"").replace(",","."));
    const mk = b.match(/Marca\/Modelo:?\s*([^\n]*?)\s*(?:Valor\s*Global|Valor\s*Final|Observa[çc]|Item\s*n[ºo°]|CLASSIFICA|$)/i);
    const marca = mk ? limpaMarca(mk[1]) : null;
    if(marca) out.push({numero, valor, marca, generica: GENERICA.test(mk[1])});
  }
  return out;
}
// NOTA: o "Resultado do Julgamento" tem coluna Marca, mas em modo COLUNAR — quando a marca é "-" (serviço/obra)
// o parser posicional captura cauda do OBJETO como marca (falso positivo: "REGISTRADORES.", "SERVIDORES)"…).
// Fidelidade > recall: NÃO usar o colunar. A Ata de Sessão (padrão B "Marca/Modelo:") é o carregador CONFIÁVEL
// da marca no BBMNET (rótulo explícito, sem ambiguidade posicional). Procs de produto quase sempre têm a Ata.
function parseDoc(txt){
  if(!txt) return [];
  const pares=parseAtaSessao(txt);
  const v=new Set(); return pares.filter(p=>{ const k=p.numero+"|"+p.marca+"|"+p.valor; if(v.has(k))return false; v.add(k); return true; });
}

// ---- PNCP fallback: lista arquivos → baixa candidatos (ata/sessão/resultado/julgamento) → texto ----
async function pncpArquivos(cnpj,ano,seq){
  for(let t=0;t<4;t++){
    try{
      const r=await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos`,{headers:UA,signal:AbortSignal.timeout(25000)});
      if(r.status===429){ await sleep(4000*(t+1)); continue; }
      if(!r.ok) return [];
      return await r.json().catch(()=>[]);
    }catch{ await sleep(2000); }
  }
  return "RATE";
}
async function pdfText(buf){ try{ const u=new Uint8Array(buf); if(u[0]!==0x25) return ""; return (await extractText(await getDocumentProxy(u),{mergePages:true})).text||""; }catch{ return ""; } }
async function docTextoPNCP(url){
  try{
    const buf=Buffer.from(await (await fetch(url,{headers:UA,signal:AbortSignal.timeout(60000)})).arrayBuffer());
    if(buf.length>40*1024*1024) return "";            // >40MB = scan pesado, pula (padrão V, fora deste passe)
    if(buf[0]===0x50&&buf[1]===0x4b){ let t=""; for(const e of new AdmZip(buf).getEntries()) if(/\.pdf$/i.test(e.entryName)) t+=" "+await pdfText(e.getData()); return t; }
    return await pdfText(buf);
  }catch{ return ""; }
}
const ehDocMarca = (t)=> /ata|sess|resultad|julgamento|homolog/i.test(t||"") && !/relat[óo]rio da sess[ãa]o ou de disputa/i.test(t||"");

async function main(){
  const q = async (s,p)=> (await db.query(s,p)).rows;
  await db.query(`create table if not exists ${FEITAS}(cnpj text,ano int,seq int,status text,n int,atualizado timestamptz default now(),primary key(cnpj,ano,seq))`);

  const lim = LIM>0 ? `limit ${LIM}` : ``;
  const procs = await q(`
    select distinct p.cnpj,p.ano,p.seq
    from ${PPR} p
    where p.portal_real='BBMNET'
      and exists(select 1 from ${ITENS} i where i.cnpj=p.cnpj and i.ano=p.ano and i.seq=p.seq and i.unit_homologado is not null)
      and not exists(select 1 from ${CONF} c where c.cnpj=p.cnpj and c.ano=p.ano and c.seq=p.seq and c.portal='BBMNET')
      and not exists(select 1 from ${FEITAS} f where f.cnpj=p.cnpj and f.ano=p.ano and f.seq=p.seq)
    order by 1,2,3 ${lim}`);
  if(!procs.length){ console.log(`acervo BBMNET fechado — nada a coletar (UF=${UF})`); await db.end(); return; }
  console.log(`BBMNET ${UF}: ${procs.length} procs a processar · PNCP=${USA_PNCP?"on":"off"}`);

  let comMarca=0, itensTot=0, feitos=0, rateSeg=0, parar=false;
  for(const p of procs){
    if(parar) break;
    let status="sem_doc", n=0, fonteTitulo=null;
    try{
      // a) ACERVO: docs de resultado com marca (texto), filtrados por PK — nunca varre a tabela inteira
      const docs = await q(`select titulo,texto from arquivo_texto_${UF}
        where cnpj=$1 and ano=$2 and seq=$3 and chars>300
          and titulo ~* 'ata|sess|resultad|julgamento'
          and titulo !~* 'relat[óo]rio da sess[ãa]o ou de disputa'`,[p.cnpj,p.ano,p.seq]);
      let pares=[]; let usouDoc=null;
      for(const d of docs){ const pp=parseDoc(d.texto); if(pp.length){ pares.push(...pp); usouDoc=usouDoc||d.titulo; } }

      // b) PNCP fallback (só se acervo não rendeu e PNCP habilitado)
      if(!pares.length && USA_PNCP){
        const arqs = await pncpArquivos(p.cnpj,p.ano,p.seq);
        if(arqs==="RATE"){ if(++rateSeg>=6){ parar=true; } await sleep(5000); }
        else { rateSeg=0;
          for(const a of (Array.isArray(arqs)?arqs:[])){
            const titulo=(a.titulo||a.nomeArquivo||a.tipoDocumentoNome||"");
            if(!ehDocMarca(titulo)) continue;
            const url=a.url||a.uri; if(!url) continue;
            const txt=await docTextoPNCP(url);
            const pp=parseDoc(txt);
            if(pp.length){ pares.push(...pp); usouDoc=usouDoc||("PNCP:"+titulo); }
            await sleep(300);
          }
        }
      }
      status = pares.length ? "sem_ancora" : (status==="sem_doc"?"sem_doc":status);

      if(pares.length){
        // ANCORA por VALOR contra unit_homologado (±0,02); trava dupla c/ CNPJ do fornecedor no doc
        const itens = await q(`select numero, unit_homologado, cnpj_fornecedor from ${ITENS} where cnpj=$1 and ano=$2 and seq=$3 and unit_homologado is not null`,[p.cnpj,p.ano,p.seq]);
        const docTxt = (docs.map(d=>d.texto).join(" ")); // p/ trava dupla CNPJ (acervo)
        const vn=new Set(); const hits=[];
        for(const par of pares){
          const it=itens.find(i=>Math.abs(Number(i.unit_homologado)-par.valor)<=0.02 && !vn.has(i.numero));
          if(!it) continue; vn.add(it.numero);
          const forn=it.cnpj_fornecedor||null;
          const cnpjOk = forn ? docTxt.replace(/[^\d]/g,"").includes(String(forn).replace(/[^\d]/g,"")) : false;
          hits.push({numero:it.numero, marca:par.marca, valor:par.valor, forn, generica:!!par.generica, cnpjOk});
        }
        if(hits.length){
          fonteTitulo = usouDoc || "Ata de Sessão";
          await db.query(`insert into ${CONF}
            (cnpj,ano,seq,numero,marca,valor,fornecedor_cnpj,marca_generica,cnpj_ok,valor_ok,portal,fonte_titulo)
            select $1,$2,$3, x.numero, x.marca, x.valor, x.forn, x.generica, x.cnpjok, true, 'BBMNET', $4
            from unnest($5::int[],$6::text[],$7::numeric[],$8::text[],$9::bool[],$10::bool[])
              as x(numero,marca,valor,forn,generica,cnpjok)`,
            [p.cnpj,p.ano,p.seq, fonteTitulo,
             hits.map(h=>h.numero), hits.map(h=>h.marca), hits.map(h=>h.valor),
             hits.map(h=>h.forn), hits.map(h=>h.generica), hits.map(h=>h.cnpjOk)]);
          n=hits.length; itensTot+=n; comMarca++; status="ok";
        }
      }
    }catch(e){ status="erro:"+e.message.slice(0,40); }
    // idempotência: 'sem_doc' sob NOPNCP NÃO é terminal (um passe com PNCP pode achar o doc) → não fixa feitas
    if(!(status==="sem_doc" && !USA_PNCP)){
      await db.query(`insert into ${FEITAS}(cnpj,ano,seq,status,n) values($1,$2,$3,$4,$5)
        on conflict(cnpj,ano,seq) do update set status=excluded.status,n=excluded.n,atualizado=now()`,[p.cnpj,p.ano,p.seq,status,n]);
    }
    process.stdout.write(`  ${++feitos}/${procs.length} · com marca ${comMarca} · itens ${itensTot}\r`);
  }
  if(parar) console.log(`\nrate limit PNCP persistente — parei (idempotente; retoma depois)`);
  console.log(`\n✔ BBMNET ${UF}: ${comMarca}/${feitos} procs com marca · ${itensTot} itens gravados`);
  console.table(await q(`select status, count(*) n from ${FEITAS} group by 1 order by 2 desc`));
  await db.end();
}
main().catch(e=>{ console.error("ERRO:", e.message); process.exit(1); });
