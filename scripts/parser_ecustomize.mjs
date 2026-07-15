// PARSER DETERMINÍSTICO — ECustomize/Portal Compras Públicas, tabela DETALHADA de propostas (todos os fornecedores).
// Cada registro de proposta tem âncoras fortes: CNPJ completo, data/hora, valores com "R$", classificado Sim/Não.
// Estrutura: <FORNECEDOR> <CNPJ> <DD/MM/AAAA - HH:MM:SS> <modelo marca> <qtd> R$<unit> R$<total> <Sim|Não>
// Determinístico: fornecedor, cnpj, dataHora, qtd, valorUnit, valorTotal, classificado. Fuzzy: split modelo/marca (marca≈última unidade).
const num = (s) => Number(String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const limpaCnpj = (s) => s.replace(/\s+/g, "");

// registro de proposta: ancorado em CNPJ … Sim/Não. O CNPJ pode vir com espaço antes dos 2 últimos díg ("0001- 23").
// blob modelo+marca é curto → LIMITA o gap a 90 chars (evita backtracking catastrófico que travava o node em atas sem o R$ seguinte)
const REC = /(\d{2}\.\d{3}\.\d{3}\/\d{4}\s*-\s*\d{2})\s+(\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}:\d{2}:\d{2})\s+(.{0,90}?)\s+([\d.]+,\d{2,4})\s+R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})\s+(Sim|N[ãa]o)\b/g;

// CABEÇALHO da tabela de propostas ("Fornecedor CNPJ/CPF Data Modelo Marca/ Fabricante Quantidade … LC 123/2006").
// Na 1ª linha de cada tabela o texto antes do CNPJ é "<cabeçalho> <FORNECEDOR>" → o corte por palavras engolia o
// cabeçalho como nome (16% das linhas gravadas: "Marca/ Fabricante Quantidade Local/ Regional /2006"). Colunas variam
// por ata → cada uma opcional, na ordem. Aplicar SÓ ao nome: o `pre` alimenta também a detecção de item (curCodigo).
const CAB = /Fornecedor\s+CNPJ\s*\/\s*CPF(?:\s+Data)?(?:\s+Modelo)?(?:\s+Marca\s*\/\s*Fabricante)?(?:\s+Quantidade)?(?:\s+Local\s*\/\s*Regional)?(?:\s+Melhor\s+Lance)?(?:\s+Lance)?(?:\s+Valor\s+Total)?(?:\s+LC\s*123\s*\/\s*2006)?/gi;
// Rede p/ variante não prevista: o nome vem SEMPRE depois do último token de cabeçalho. Tokens distintivos apenas
// (nada genérico como "Quantidade" solto, que aparece em descrição de produto).
const CAB_RESID = /^[\s\S]*(?:LC\s*123\s*\/\s*2006|\/\s*2006|Valor\s+Total|Local\s*\/\s*Regional|Marca\s*\/\s*Fabricante|CNPJ\s*\/\s*CPF)\s*/i;

export function parseAtaEcustomize(texto) {
  const t = texto.replace(/\s+/g, " ");
  const out = [];
  let prevEnd = 0, curCodigo = null, curProduto = null;
  for (const m of t.matchAll(REC)) {
    let pre = t.slice(prevEnd, m.index).trim();   // texto antes do CNPJ = fornecedor (+ talvez cabeçalho de item "NNNN PRODUTO")
    prevEnd = m.index + m[0].length;
    // remove ruído de rodapé/cabeçalho que vaza no nome do fornecedor
    pre = pre.replace(/A autenticidade[^]*?portaldecompraspublicas\.com\.br/gi, " ")
             .replace(/Documento gerado eletronicamente[^]*?verificador:\s*\w+/gi, " ")
             .replace(/P[áa]gina \d+ de \d+/gi, " ")
             .replace(/\bLance\b|\bValor Total\b|\bLC \d+\b|\bMelhor Lance\b/gi, " ")
             .replace(/\s+/g, " ").trim();
    // detecta início de item: "NNNN PRODUTO EM MAIÚSCULAS" dentro do pre → atualiza item corrente
    const hm = pre.match(/(?:^|\s)(\d{3,4})\s+([A-ZÀ-Ú0-9][^]{4,}?)\s*$/);
    let fornecedor = pre;
    if (hm && hm[2].length > 4) {
      // o pre pode ser "…tail_da_proposta_anterior NNNN PRODUTO… FORNECEDOR"; o fornecedor é o que vem depois do produto — mas
      // fornecedor precede o CNPJ, então na 1ª proposta do item o fornecedor está DEPOIS do produto. Pega o último bloco.
      curCodigo = parseInt(hm[1], 10); curProduto = hm[2].trim();
    }
    // tira o CABEÇALHO da tabela do nome (só aqui: o `pre` acima precisa ficar intacto p/ detectar o item)
    fornecedor = fornecedor.replace(CAB, " ").replace(/\s+/g, " ").trim().replace(CAB_RESID, "").trim();
    // fornecedor = últimas ~8 palavras antes do CNPJ (nome da empresa), tirando ruído de "Sim/Não"/"NM" da proposta anterior
    fornecedor = fornecedor.replace(/^(Sim|N[ãa]o)\b\s*/i, "").replace(/^[A-Z]{1,3}\s+(?=[A-ZÀ-Ú])/, "");
    const palavras = fornecedor.split(" ");
    if (palavras.length > 9) fornecedor = palavras.slice(-9).join(" ");
    // split modelo/marca do blob (m[3]): marca ≈ última unidade; resto = modelo
    const blob = m[3].trim().replace(/\bN\/C\b/gi, "").trim();
    const bt = blob ? blob.split(" ") : [];
    const marca = bt.length ? bt[bt.length - 1] : null;
    const modelo = bt.length > 1 ? bt.slice(0, -1).join(" ") : null;
    out.push({
      codigo: curCodigo, produto: curProduto, fornecedor: fornecedor.trim() || null,
      cnpj: limpaCnpj(m[1]), dataHora: m[2].replace(/\s+/g, " "),
      modelo, marca, quantidade: num(m[4]), valorUnitario: num(m[5]), valorTotal: num(m[6]),
      classificado: /sim/i.test(m[7]),
    });
  }
  return out;
}
