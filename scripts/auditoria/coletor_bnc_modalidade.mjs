// MEDIÇÃO BNC POR MODALIDADE — onde vive a marca (portal × modalidade × doc de resultado).
// Receita: link ProcessView?param1=[gkz] (local link_sistema_origem OU PNCP linkSistemaOrigem, rate-limited)
//   → ProcessFiles → blobs bnccompras.blob → doc de RESULTADO (pdf/atas.zip) → texto → estrutura da marca + ancora por valor.
// DRY=1 mede sem gravar. Grava em app.item_marca_conferida_sc EM LOTE (unnest), nunca row-by-row.
import fs from "fs"; import pg from "pg";
import AdmZip from "adm-zip";
import { extractText, getDocumentProxy } from "unpdf";
import { limpaMarca, parseBR, extraiMarcas } from "../portais_comportamento.mjs";

const U = fs.readFileSync("./.env.local","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({connectionString:U, ssl:{rejectUnauthorized:false}, max:3, statement_timeout:590000});
const HOST = "bnccompras.com";
const UA = { "user-agent":"Mozilla/5.0" };
const DRY = process.env.DRY === "1";
const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
// amostra por modalidade_id
const AMOSTRA = { 8:15, 6:15, 4:8, 9:5, 12:3 };

async function pdfText(buf){ try{ const u=new Uint8Array(buf); if(u[0]!==0x25) return ""; return (await extractText(await getDocumentProxy(u),{mergePages:true})).text||""; }catch{ return ""; } }
// PNCP linkSistemaOrigem (rate-limited) → link do portal, ou "RATE"
async function pncpLink(cnpj,ano,seq){
  for(let t=0;t<4;t++){
    try{ const r=await fetch(`https://pncp.gov.br/api/consulta/v1/orgaos/${cnpj}/compras/${ano}/${seq}`,{signal:AbortSignal.timeout(25000)});
      if(r.status===429){ await sleep(4000*(t+1)); continue; }
      const j=await r.json().catch(()=>null); const link=j?.linkSistemaOrigem||"";
      return link.includes(HOST)? link : null;
    }catch{ await sleep(2000); } }
  return "RATE";
}
// ProcessView → ProcessFiles → [{url,nome}]
async function arquivos(pvUrl){
  const html = await (await fetch(pvUrl,{headers:UA,signal:AbortSignal.timeout(25000)})).text();
  const m = html.match(/ProcessFiles'\s*,\s*\[\s*'([^']+)'/); if(!m) return [];
  const pf = `https://${HOST}/Process/ProcessFiles?param1=`+encodeURIComponent(m[1]);
  const t = await (await fetch(pf,{headers:{...UA,"x-requested-with":"XMLHttpRequest"},signal:AbortSignal.timeout(25000)})).text();
  let j=null; try{ j=JSON.parse(t); }catch{}
  const body = j?.html||t;
  const urls = [...body.matchAll(/https?:\/\/[^"'\s)]+\.(pdf|zip)/gi)].map(x=>x[0]);
  const nomes = [...body.matchAll(/>([^<>]{3,80}\.(?:pdf|zip|PDF|ZIP))</g)].map(x=>x[1]);
  return urls.map((url,i)=>({url,nome:nomes[i]||url.split("/").pop()}));
}
async function docTexto(url){
  try{ const buf=Buffer.from(await (await fetch(url,{headers:UA,signal:AbortSignal.timeout(45000)})).arrayBuffer());
    if(buf[0]===0x50&&buf[1]===0x4b){ let txt=""; for(const e of new AdmZip(buf).getEntries()){ if(!/\.pdf$/i.test(e.entryName)) continue; txt+=" "+await pdfText(e.getData()); } return txt; }
    return await pdfText(buf);
  }catch{ return ""; }
}
const ehResultado = (nome)=> /ata|resultad|homolog|adjudic|vencedor|classific|proposta/i.test(nome);
// parser colunar (mesmo do PCP/BLL)
function parseColunar(txt){
  const out=[]; const re=/\b(\d{3,4})\s+(.+?)\s+([\d.]+),\d{2}\s+[A-Za-zçÇºª\.]{1,10}\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})/g; let m;
  while((m=re.exec(txt))){ const meio=m[2].trim().split(/\s+/); const marca=limpaMarca(meio.slice(-2).join(" "))||limpaMarca(meio.slice(-1)[0]); const vu=parseBR(m[4]); if(marca&&vu) out.push({marca,valor:vu,padrao:"colunar"}); }
  return out;
}
// estrutura da marca no doc
function estruturaMarca(txt){
  if(!txt || txt.replace(/\s/g,"").length<40) return "vazio_ausente";
  const temA = /Marca\s*\/\s*Fabricante/i.test(txt);
  const temRotulo = /Marca\s*:/i.test(txt) && /Modelo\s*:/i.test(txt);
  const col = parseColunar(txt);
  if(temA || temRotulo) return "rotulo_marca_modelo";
  if(col.length>=2) return "colunar";
  if(/\bmarca\b/i.test(txt)) return "na_descricao";
  return "vazio_ausente";
}
function extraiTudo(txt){
  const pares=[...extraiMarcas(txt).filter(p=>p.valor!=null).map(p=>({marca:p.marca,valor:p.valor})), ...parseColunar(txt)];
  const visto=new Set(); return pares.filter(p=>{ const k=p.marca+"|"+p.valor; if(visto.has(k)) return false; visto.add(k); return true; });
}

async function main(){
  const q = async (s,p)=> (await db.query(s,p)).rows;
  // itens homologados por proc (para ancorar)
  const modResult = {};
  let pncpRate=0;
  for(const [modId,alvo] of Object.entries(AMOSTRA)){
    // prioriza: link local primeiro, depois procs com itens homologados (via PNCP)
    const cand = await q(`
      select c.cnpj,c.ano,c.seq, c.link_sistema_origem,
        (c.link_sistema_origem ilike '%bnccompras.com%') tem_link_local
      from contratacoes_sc c
      where c.plataforma ilike '%Bolsa Nacional%' and c.modalidade_id=$1
        and exists(select 1 from itens_sc i where i.cnpj=c.cnpj and i.ano=c.ano and i.seq=c.seq and i.unit_homologado is not null)
        and not exists(select 1 from app.item_marca_conferida_sc m where m.cnpj=c.cnpj and m.ano=c.ano and m.seq=c.seq and m.portal='BNC')
      order by tem_link_local desc, c.ano desc
      limit ${alvo*4}`, [modId]);
    const acc = { modalidade_id:Number(modId), docs:new Set(), estruturas:{}, procs:0, itens_marca:0, pares:0, inseridos:0, samples:[] };
    let usados=0;
    for(const c of cand){
      if(usados>=alvo) break;
      let link = c.tem_link_local ? c.link_sistema_origem : null;
      if(!link){ if(process.env.NOPNCP==="1"||pncpRate>=6) continue; const l=await pncpLink(c.cnpj,c.ano,c.seq); if(l==="RATE"){ pncpRate++; await sleep(5000); continue; } pncpRate=0; if(!l) continue; link=l; }
      const arqs = (await arquivos(link)).filter(a=>ehResultado(a.nome));
      if(!arqs.length) continue;
      usados++; acc.procs++;
      let txt="";
      for(const a of arqs){ acc.docs.add(a.nome.replace(/\s+/g," ").trim()); txt += " "+await docTexto(a.url); }
      const est = estruturaMarca(txt); acc.estruturas[est]=(acc.estruturas[est]||0)+1;
      const pares = extraiTudo(txt); acc.pares += pares.length;
      // ancora por valor contra itens_sc.unit_homologado (±0,02), trava CNPJ opcional
      const itens = await q(`select numero, unit_homologado, cnpj_fornecedor from itens_sc where cnpj=$1 and ano=$2 and seq=$3 and unit_homologado is not null`,[c.cnpj,c.ano,c.seq]);
      const hits=[];
      for(const par of pares){ const it=itens.find(i=>Math.abs(Number(i.unit_homologado)-par.valor)<=0.02); if(it){ hits.push({numero:it.numero, marca:par.marca, valor:par.valor, forn:it.cnpj_fornecedor}); } }
      // dedup por numero
      const vistoN=new Set(); const uniq=hits.filter(h=>{ if(vistoN.has(h.numero)) return false; vistoN.add(h.numero); return true; });
      acc.itens_marca += uniq.length;
      if(uniq.length && acc.samples.length<3) acc.samples.push({proc:`${c.cnpj}/${c.ano}/${c.seq}`, est, ex:uniq.slice(0,2)});
      // GRAVA em lote (unnest) — nunca row-by-row
      if(uniq.length && !DRY){
        const doc = [...acc.docs][0]||"ata";
        await db.query(`insert into app.item_marca_conferida_sc
          (cnpj,ano,seq,numero,marca,valor,fornecedor_cnpj,valor_ok,portal,fonte_titulo)
          select $1,$2,$3, x.numero, x.marca, x.valor, x.forn, true, 'BNC', $4
          from unnest($5::int[],$6::text[],$7::numeric[],$8::text[]) as x(numero,marca,valor,forn)`,
          [c.cnpj,c.ano,c.seq,doc, uniq.map(h=>h.numero), uniq.map(h=>h.marca), uniq.map(h=>h.valor), uniq.map(h=>h.forn||null)]);
        acc.inseridos += uniq.length;
      }
      await sleep(400);
    }
    acc.docs=[...acc.docs].slice(0,6);
    modResult[modId]=acc;
    console.log(`mod ${modId}: procs=${acc.procs} estruturas=${JSON.stringify(acc.estruturas)} pares=${acc.pares} itens_marca=${acc.itens_marca} inseridos=${acc.inseridos}`);
    console.log(`   docs: ${acc.docs.join(" | ")}`);
    if(acc.samples.length) console.log(`   ex: ${JSON.stringify(acc.samples)}`);
  }
  console.log("\n=== RESUMO JSON ===");
  console.log(JSON.stringify(modResult));
  await db.end();
}
main().catch(e=>{ console.error("ERRO:", e.message); process.exit(1); });
