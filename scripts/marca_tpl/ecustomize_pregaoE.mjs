// PARSER DETERMINISTICO DE MARCA — celula ecustomize_pregaoE
//   portal (gerador): portal_compras_publicas · modalidade: Pregao Eletronico (modalidade_id=6) · docs tipo 16,11,19
//
// TEMPLATE (gerado por software, layout FIXO). A tabela de itens vem FLATTENADA na extracao de texto.
// Duas assinaturas cobrem a grande maioria:
//
//  A) "Vencedores"  (cabecalho: Vencedores Codigo Produto Fornecedor Modelo Marca/Fabricante Valor Qtd ValorTotal)
//     linha:  <0001> <PRODUTO...> <FORNECEDOR...> <MODELO...> <MARCA> <valorUnit> <qtd> <valorTotal>
//     => a MARCA e o ULTIMO token ANTES do valor unitario. Ex.: "GSF-260 Garthen 900,00 4,00 3.600,00" -> Garthen
//        "...Propria / Messer 3,99 6.500,00 25.935,00" -> Messer ; "N/C N/C ..." -> N/C (=sem marca)
//
//  B) "lote / R$"  (linha:  ... <MODELO> <MARCA> <qtd> <UNIDADE> R$ <valorUnit> R$ R$ <valorTotal>)
//     Ex.: "COLECAO CAMINHOS E VIVENCIAS SEFE 2.550,00 UN R$ 464,50 R$ R$ ..." -> SEFE
//     => a MARCA e o ULTIMO token antes do bloco "<qtd> <UNIDADE> R$".
//
// ANCORA (o que garante a LINHA certa e mata falso-positivo): valorUnit E valorTotal(=unit*qtd) ADJACENTES.
// Isso descarta o valor que reaparece em bloco de cadastro do fornecedor ("- Documento .../0001-30 - Endereco:")
// ou na prosa. Casa-se cada linha ao itensApi.numero pelo valor unitario; se nao ancorar, DESCARTA (nunca chuta).
// Zero rede / zero LLM.

const LIXO = new Set(["propria","proprio","p rio","sem marca","s marca","nao possui","nao consta","n c","n a","na","n d","nd",
  "generico","diversos","diversas","varias","varios","sem","outros","outra","outro","modelo","marca","fabricante","nacional","importado",
  "conforme edital","a definir","objeto","servico","servicos","servico proprio","nc","xx","nao","sim","und","un","kit","h a",
  "ltda","ltda me","me","epp","eireli","eireli me","s a","sa","cia","mei","ss","lc123"]);

const norm = (s) => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g," ").trim();

// formas pt-BR de um numero: com e sem separador de milhar, sempre 2 casas.
function formasNum(v){
  const n = Number(v); if(!Number.isFinite(n)||n<=0) return [];
  const [i,d] = n.toFixed(2).split(".");
  const cp = i.replace(/\B(?=(\d{3})+(?!\d))/g,".");
  return [...new Set([`${cp},${d}`, `${i},${d}`])];
}

// e' marca plausivel? (nao lixo, nao numero, tamanho ok, nao fragmento de bloco de cadastro)
function marcaOk(tok){
  if(!tok) return false;
  const nv = norm(tok);
  if(!nv || nv.length < 2 || nv.length > 32) return false;
  if(LIXO.has(nv)) return false;
  if(/^\d+$/.test(nv)) return false;                 // so numero
  if(nv.split(" ").every(w => LIXO.has(w) || /^\d+$/.test(w))) return false;
  return true;
}

// tokeniza mantendo o case original; devolve array de tokens (whitespace collapse)
const toks = (s) => s.trim().split(/\s+/).filter(Boolean);

// unidade de medida (col. Unidade no template B): poucas letras, admite acento/º/²/³ e ponto
const UNIDADE = /^[A-Za-zÀ-ú][A-Za-zÀ-ú.ºª²³]{0,6}$/;

export function parse(texto, itensApi){
  if(!texto || !Array.isArray(itensApi) || !itensApi.length) return [];
  const out = [];
  for(const it of itensApi){
    const unit = Number(it.unit_homologado);
    if(!Number.isFinite(unit) || unit <= 0) continue;
    const qtd = Number(it.quantidade);
    const unitForms = formasNum(unit);
    const totalForms = (Number.isFinite(qtd) && qtd > 0) ? formasNum(unit * qtd) : [];

    let best = null; // {pos, len, template, conf}
    for(const uf of unitForms){
      let pos = texto.indexOf(uf);
      while(pos >= 0){
        const after  = texto.slice(pos + uf.length, pos + uf.length + 90);
        const before = texto.slice(Math.max(0, pos - 300), pos);
        const isB = /R\$\s*$/.test(before);
        const totalOk = totalForms.length ? totalForms.some(tf => after.includes(tf)) : false;
        // formato da linha de item (qtd logo apos o valor unitario, ou bloco R$ R$ total)
        const aShape = isB
          ? /^\s*R\$\s*R?\$?\s*[\d.]+,\d{2}/.test(after)      // B: "R$ R$ <total>"
          : /^\s*[\d.]+,\d{2}/.test(after);                   // A: "<qtd>,dd ..."
        if(totalOk || aShape){
          const conf = totalOk ? "alta" : "media";
          const cand = { pos, len: uf.length, template: isB ? "B_lote" : "A_vencedores", conf, totalOk };
          // prioriza: totalOk > aShape ; e a primeira boa ocorrencia
          if(!best || (cand.totalOk && !best.totalOk)){ best = cand; if(cand.totalOk) break; }
        }
        pos = texto.indexOf(uf, pos + 1);
      }
      if(best && best.totalOk) break;
    }
    if(!best) continue;

    // extrai a MARCA conforme o template
    let marca = null;
    const preRaw = texto.slice(Math.max(0, best.pos - 220), best.pos);
    // guarda anti-bloco-de-cadastro (o valor caiu num bloco "Documento .../0001-.. - Endereco:")
    const tail40 = preRaw.slice(-40);
    const noise = /(endere[çc]o|documento\b|tipo:|lc123|cnpj|c[óo]digo interno|bairro|munic[íi]pio)/i.test(tail40);

    if(!noise){
      if(best.template === "B_lote"){
        // "...MARCA <qtd> <UNIDADE> R$"  -> tira R$, tira unidade, tira qtd, pega ultimo token
        let s = preRaw.replace(/R\$\s*$/,"").trim();
        let tk = toks(s);
        if(tk.length && UNIDADE.test(tk[tk.length-1]) && !/^\d/.test(tk[tk.length-1])) tk.pop();     // unidade
        if(tk.length && /^[\d.]+,\d{2}$/.test(tk[tk.length-1])) tk.pop();                             // qtd
        else if(tk.length && /^\d[\d.]*$/.test(tk[tk.length-1])) tk.pop();
        if(tk.length){ const c = tk[tk.length-1]; if(marcaOk(c)) marca = c; }
      } else {
        // A_vencedores: "<MODELO> <MARCA> <valorUnit>" -> ultimo token antes do valor
        const tk = toks(preRaw);
        if(tk.length){ const c = tk[tk.length-1]; if(marcaOk(c)) marca = c; }
      }
    }

    if(marca){
      marca = marca.replace(/^\(+|\)+$/g,"").replace(/[.,;:]+$/,"").replace(/^[.,;:/]+/,"").trim().slice(0,40);
      if(!marcaOk(marca)) marca = null;
    }
    if(!marca) continue; // sem marca real -> nao pendura nada

    out.push({
      numero: Number(it.numero),
      marca,
      modelo: null,
      valorUnit: unit,
      confianca: best.conf,
      template: best.template,
    });
  }
  return out;
}

// ─── SELF-TEST / VALIDACAO (node scripts/marca_tpl/ecustomize_pregaoE.mjs) ────────────────────────────────
import { fileURLToPath } from "url";
if(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const fs = await import("fs"); const path = await import("path"); const pg = (await import("pg")).default;
  const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/../..";
  const U = fs.readFileSync(path.join(ROOT,".env.local"),"utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
  const db = new pg.Pool({ connectionString:U, ssl:{rejectUnauthorized:false}, max:3, statement_timeout:180000 }); db.on("error",()=>{});
  const docs = (await db.query(`
    SELECT t.cnpj,t.ano,t.seq,t.texto
    FROM contratacoes_sc c
    JOIN arquivo_texto_sc t ON t.cnpj=c.cnpj AND t.ano=c.ano AND t.seq=c.seq
    JOIN arquivos_sc a ON a.cnpj=t.cnpj AND a.ano=t.ano AND a.seq=t.seq AND a.sequencial_documento=t.sequencial_documento
    WHERE c.modalidade_id=6 AND t.gerador='portal_compras_publicas' AND a.tipo_documento_id IN (16,11,19) AND t.chars BETWEEN 800 AND 45000
    LIMIT 60`)).rows;
  let totItens=0, comMarca=0; const byTpl={}; const exemplos=[];
  for(const d of docs){
    const itens = (await db.query(`SELECT numero,descricao,unit_homologado,quantidade,cnpj_fornecedor,fornecedor FROM itens_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND situacao='Homologado' AND unit_homologado>0 ORDER BY numero`,[d.cnpj,d.ano,d.seq])).rows;
    if(!itens.length) continue;
    totItens += itens.length;
    const res = parse(d.texto, itens);
    const byNum = new Map(itens.map(x=>[Number(x.numero), x]));
    for(const r of res){
      comMarca++; byTpl[r.template]=(byTpl[r.template]||0)+1;
      if(exemplos.length < 12){
        const it = byNum.get(r.numero);
        exemplos.push({ doc:`${d.cnpj}/${d.ano}/${d.seq}`, numero:r.numero, marca:r.marca, conf:r.confianca, tpl:r.template, spec:(it?.descricao||"").slice(0,70) });
      }
    }
  }
  console.log(`\nTOTAL itens homologados: ${totItens} | com marca: ${comMarca} (${(100*comMarca/totItens).toFixed(1)}%)`);
  console.log(`por template:`, byTpl);
  console.log(`\nEXEMPLOS:`);
  for(const e of exemplos) console.log(`  [${e.tpl.padEnd(12)} ${e.conf.padEnd(5)}] it${e.numero} => "${e.marca}"  | ${e.spec}`);
  await db.end();
}
