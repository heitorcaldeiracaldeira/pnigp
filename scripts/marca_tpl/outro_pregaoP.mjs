// PARSER DETERMINISTICO DE MARCA — celula outro_pregaoP
//   modalidade: Pregao Presencial (modalidade_id=7) · gerador: 'outro' · tipos doc: 16,11,19,1
//
// A "outro" nesta modalidade e um balde de sistemas municipais. Engenharia reversa (amostra de 400 docs)
// achou 3 sub-templates, todos com a MARCA numa COLUNA/ROTULO da tabela de itens da ata/termo de homologacao:
//
//  TEMPLATE B  (rotulo explicito — o mais limpo; ex.: Municipio de Treze de Maio / sistema estilo "Termo de
//               Homologacao e Adjudicacao"): a linha traz
//     <num> <DESCRICAO> - Marca: <MARCA> <unidade> <qtd> 0,0000 <valorUnit> <valorTotal>
//     -> a MARCA vem apos o rotulo "- Marca:" e antes da unidade. Servico nao tem "- Marca:".
//
//  TEMPLATE A  (coluna Especificacao — estilo Betha "Ata de Julgamento"): cabecalho
//     "Item Especificacao Qtd. Unidade Marca Valor Unitario Valor Total"  e cada linha
//     <num> <ESPEC - ESPEC> <qtd> <unidade> <MARCA?> <valorUnit(4 dec)> <valorTotal(2 dec)>
//     -> a MARCA fica ENTRE a unidade e o valor unitario. Servico deixa a coluna vazia.
//
//  TEMPLATE IPM (Atende.Net "Termo de Homologacao"): cabecalho
//     "Item Produto Unidade Marca Qtde Valor Unitario Valor Total"  e cada linha
//     <num> <PRODUTO> <unidade> <MARCA> <qtde> R$<unit> R$<total>
//     -> a MARCA fica entre a unidade e a quantidade.
//
// ANCORA: unit_homologado (API) na forma 2 casas "1.234,56"/"1234,56" aparece na linha do item (~100% dos
// itens quando ha dado de API — a forma 2 casas casa tambem como prefixo do valor de 4 casas: "29,35" ⊂ "29,3500").
// Cada item da API e localizado pela sua ancora de valor; a marca e o(s) token(s) adjacente(s) na MESMA linha,
// confirmada pelo numero do item quando visivel. Casa-se ao itensApi.numero; descarta se nao localizar.
// Zero rede / zero LLM.

const UNIDADES = ["unidade","unid","und","un","uni","peca","peça","pç","pc","pct","pacote","cx","caixa","kg","kgs",
  "g","gr","grama","mt","metro","m","m2","m3","ml","lt","litro","l","par","cj","conj","kit","rolo","fardo","fd",
  "gl","galao","galão","dz","duzia","dúzia","resma","serv","servico","serviço","diar","diaria","diária","hrs","hr",
  "h","km","l/d","frasco","fr","sc","saco","balde","bd","pote","lata","tubo","bob","bobina","vd","vidro","amp",
  "ampola","bl","blister","mes","mês","ton","t","gal","cent","cento","envelope","env","folha","fl","bisnaga","tira"];
const UNI_RE = new RegExp("^(?:" + UNIDADES.map(u=>u.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|") + ")$", "i");

// LIXO — nunca e marca de fabricante (rotulos, genericos, ausencia de marca, prosa juridica)
const LIXO = new Set(["propria","proprio","própria","próprio","prpria","prpria","prpria","sem marca","s marca",
  "sem","nao possui","não possui","n a","na","nd","n d","generico","genérico","diversos","varias","várias","varios",
  "vários","outros","outra","outro","modelo","marca","fabricante","nacional","importado","conforme edital",
  "conforme","a definir","adefinir","objeto","servico","serviço","servicos","serviços","nacional/importado",
  "s/marca","xxxxx","xxx","---","...","referencia","referência","ref","obs","total","item","especificacao",
  "especificação","valor","unidade","qtde","quantidade","descricao","descrição","proprias","próprias"]);

const norm = (s)=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ").trim();

// formas 2 casas do valor unitario (ancora principal — "1.234,56" e "1234,56")
function valueForms(v){
  const n=Number(v); if(!Number.isFinite(n)||n<=0) return [];
  const [i,d]=n.toFixed(2).split("."); const cp=i.replace(/\B(?=(\d{3})+(?!\d))/g,".");
  return [...new Set([`${cp},${d}`, `${i},${d}`])];
}

// termos que denunciam nome de EMPRESA (fornecedor), nao marca de fabricante
const EMPRESA_RE = /\b(ltda|eireli|mei|epp|s\/a|s\.a|cia|comercio|comércio|comercial|industria|indústria|distribuidora|distribuidor|atacadista|atacado|importadora|exportadora|imports|import|representac|representaç|empreendimentos|servicos|serviços|transportes|construtora|papelaria|papeis|papéis|editora|grafica|gráfica|grafhic|informatica|informática|eletronica|eletrônica|materiais|suprimentos|farmacia|farmácia|comercializa)\b/i;

// remove do texto capturado o NOME DO FORNECEDOR (coluna que segue a marca em alguns layouts) e a flag ME/EPP "Sim/Nao"
function tiraFornecedor(v, fornecedor){
  if(!v) return v;
  v = v.replace(/\s+(sim|n[aã]o)\s*$/i, "").trim();          // coluna ME/EPP booleana
  if(fornecedor){
    const fwords = norm(fornecedor).split(" ").filter(w=>w.length>2 && !EMPRESA_RE.test(w));
    const primeiro = fwords[0];
    if(primeiro){
      const parts = v.split(/\s+/); const low = parts.map(norm);
      const idx = low.indexOf(primeiro);
      if(idx>0) v = parts.slice(0, idx).join(" ");            // corta a partir da 1a palavra do fornecedor
    }
  }
  // fallback: se sobrou termo de razao social, corta. O fornecedor costuma ser "<PROPRIO> <KEYWORD>",
  // entao ao achar a 1a KEYWORD em idx>=2 dropa tambem o proprio-nome que a antecede (idx-1).
  const parts2 = v.split(/\s+/);
  const ie = parts2.findIndex((w,i)=> i>0 && EMPRESA_RE.test(w));
  if(ie>0){ const cut = ie>=2 ? ie-1 : ie; if(cut>=1) v = parts2.slice(0, cut).join(" "); }
  return v.trim();
}

function limpaMarca(raw, fornecedor){
  if(!raw) return null;
  let v=String(raw)
    // corta se emendou no proximo campo/rotulo
    .replace(/\b(modelo|mod\.?|refer[eê]ncia|ref\.?|c[oó]digo|cod\.?|valor|qtde?|quant|unid|unidade|un|r\$|pre[cç]o|total|marca)\b.*$/i,"")
    .replace(/[.,;:\-–\/\s]+$/,"").replace(/^[\s.,;:\-–\/]+/,"").trim();
  // guarda: remove cauda numerica de unidade/qtd/descto que porventura tenha vazado ("... M3 122,00 0,0000")
  v = v.replace(/\s+[A-Za-z0-9ºçÇ\/²³.]{1,8}\s+\d[\d.]*,\d.*$/,"").replace(/\s+\d[\d.]*,\d{2,}.*$/,"").trim();
  v = tiraFornecedor(v, fornecedor);
  // separa modelo (apos "/" ou " - ") -> fica so a marca
  let modelo=null;
  const sp = v.split(/\s*[\/]\s*| - /);
  if(sp.length>1 && norm(sp[0]).length>=2){ v=sp[0].trim(); modelo=sp.slice(1).join(" ").slice(0,40)||null; }
  v=v.replace(/[.,;:\-–\/\s]+$/,"").trim();
  const nv=norm(v);
  if(!nv || nv.length<2 || nv.length>40) return null;
  if(LIXO.has(nv)) return null;
  if(/^[\d.,%\-]+$/.test(nv)) return null;                 // so numeros/simbolos
  if(nv.split(" ").every(w=>LIXO.has(w))) return null;      // "sem marca", "marca propria"
  if(/^(cor|tamanho|medida|linha|tipo)\b/.test(nv)) return null;
  if(EMPRESA_RE.test(nv) && nv.split(" ").length>=2) return null;  // sobrou razao social pura -> descarta
  return {marca: v.slice(0,40), modelo};
}

// Extrai a marca da JANELA imediatamente ANTES da ancora de valor (a marca antecede o valor unitario).
// Retorna {marca, via} ou null.
function marcaAntesDoValor(before, fornecedor){
  if(!before) return null;
  const tail = before.slice(-220);

  // 1) ROTULO explicito "Marca: X" / "Marca - X" / "Marca/Fabricante: X"  (templates B e IPM rotulados)
  //    a marca vai do rotulo ate a unidade (ou ate o fim da janela)
  const rot = /\bmarca(?:\s*[\/-]\s*fabricante)?\s*[:\-–]\s*([^\n;|]{1,45})$/i;
  let m = tail.match(rot);
  if(m){
    // corta a unidade + qtd + descto que ficam entre a marca e o valor: "METISA UN 2,00 0,0000 " / "JAZIDA M3 122,00 "
    let seg = m[1];
    const cut = seg.search(/\s+(?:[A-Za-z0-9ºçÇ\/²³.]{1,8})\s+\d[\d.]*,\d/); // <unidade(pode ter digito: M3)> <qtd,dec>
    if(cut>0) seg = seg.slice(0,cut);
    const mk = limpaMarca(seg, fornecedor);
    if(mk) return {...mk, via:"rotulo"};
    return null; // rotulo presente mas marca e lixo (propria/sem) -> nao inventa
  }

  // 2) COLUNA sem rotulo (template A / IPM sem rotulo): estrutura "... <qtd> <unidade> <MARCA> " logo antes do valor
  //    (a MARCA vem imediatamente antes do valor). Exige unidade conhecida antes da marca p/ precisao.
  //    ex.: "1.000,0 UN SILVA PRE MOLDADO S "  |  "75.000 IPIRANGA " (IPM: qtd depois) -> tratado abaixo
  const col = tail.match(/(\d[\d.]*,\d+|\d[\d.]*)\s+([A-Za-zçÇÀ-ú\/]{1,12})\s+([A-Za-zÀ-ú0-9][A-Za-zÀ-ú0-9\/.\-&' ]{1,45})\s*$/);
  if(col){
    const unidade = norm(col[2]);
    // caso A: <qtd> <UNIDADE> <MARCA>   (unidade reconhecida)
    if(UNI_RE.test(unidade)){
      const mk = limpaMarca(col[3], fornecedor);
      if(mk) return {...mk, via:"coluna"};
      return null;
    }
  }
  // 3) IPM: "... LITRO IPIRANGA 75.000 " (unidade MARCA qtd) — a ancora de valor (unit em R$) vem depois da qtd,
  //    entao a janela antes do valor termina em "... <unidade> <MARCA> <qtde>". Marca = token(s) entre unidade e qtd.
  const ipm = tail.match(/(?:^|\s)([A-Za-zÀ-ú]{2,12})\s+([A-Za-zÀ-ú0-9][A-Za-zÀ-ú0-9\/.\-&' ]{1,30}?)\s+\d[\d.]*(?:,\d+)?\s*$/);
  if(ipm && UNI_RE.test(norm(ipm[1]))){
    const mk = limpaMarca(ipm[2], fornecedor);
    if(mk) return {...mk, via:"coluna-ipm"};
  }
  return null;
}

/**
 * @param {string} texto  texto concatenado dos docs (tipos 16,11,19,1) do processo
 * @param {Array<{numero:number,unit_homologado:number,quantidade?:number,descricao?:string}>} itensApi
 * @returns {Array<{numero:number,marca:string,modelo:null,valorUnit:number|null,confianca:'alta'|'media',template:string}>}
 */
export function parse(texto, itensApi){
  const out=[];
  if(!texto || !Array.isArray(itensApi) || !itensApi.length) return out;
  // deteccao grosseira de template p/ rotular a saida (nao muda a extracao, que e por-ocorrencia)
  const tplB = /-\s*Marca:/i.test(texto);
  const tplA = /Especifica[cç][aã]o\s+Qtd\.?\s+Unidade\s+Marca/i.test(texto);
  const tplIPM = /Produto\s+Unidade\s+Marca\s+Qtde/i.test(texto);
  const templateDoc = tplB?"B-rotulo" : tplA?"A-coluna" : tplIPM?"IPM" : "outro";

  for(const it of itensApi){
    const forms = valueForms(it.unit_homologado);
    if(!forms.length) continue;
    const fornecedor = it.fornecedor || null;
    let best=null; // {marca, modelo, via, conf}
    for(const fv of forms){
      let pos = texto.indexOf(fv);
      let guard=0;
      while(pos>=0 && guard++<40){
        const before = texto.slice(Math.max(0,pos-260), pos);
        const got = marcaAntesDoValor(before, fornecedor);
        if(got){
          // confirmacao pelo NUMERO do item na mesma linha (aumenta confianca e desambigua valor repetido)
          const linha = texto.slice(Math.max(0,pos-260), pos+2);
          const numOk = new RegExp(`(?:^|\\s)0*${it.numero}\\s`).test(linha);
          const conf = numOk ? "alta" : "media";
          if(!best || (conf==="alta" && best.conf!=="alta")){ best={...got, conf}; }
          if(conf==="alta") break;
        }
        pos = texto.indexOf(fv, pos+1);
      }
      if(best && best.conf==="alta") break;
    }
    if(best){
      out.push({numero:it.numero, marca:best.marca, modelo:best.modelo||null,
        valorUnit: Number(it.unit_homologado)||null, confianca:best.conf, template:templateDoc});
    }
  }
  return out;
}

export default { parse };
