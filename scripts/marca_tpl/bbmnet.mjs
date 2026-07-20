// Parser DETERMINISTICO de MARCA — celula: BBMNET (Bolsa Brasileira de Mercadorias)
//   plataforma ILIKE '%BBMNET%'  -> "Novo BBMNET Licitacoes" (243) + "Bolsa Brasileira de Mercadorias - BBMNET Licitacoes" (1)
//   ~244 processos SC, so 6 CNPJs (dominado por SAMAE Jaragua do Sul).
//
// TEMPLATE UNICO decifrado (engenharia reversa, sem LLM) — "bbmnet_ata":
//   O documento de RESULTADO da BBMNET e a "ATA DE SESSAO No NNNN" seguida do "Relatorio de Disputa de
//   Licitacao Publica". A marca do VENCEDOR vive num CAMPO NOMEADO por item, no bloco do lote homologado:
//
//     LOTE k - Homologado ... Item no N - Objeto: <desc> Quantidade: <q>
//       Preco unitario:R$ <preco_unit>  Valor Final:R$ <valor_final>  Marca/Modelo: <MARCA>  {proximo delimitador}
//
//   O delimitador que FECHA o campo Marca/Modelo e o proximo "Item no", ou "Valor Global (final)" (ultimo item
//   do lote), ou "Observacao"/"CLASSIFICACAO". A marca e o texto entre "Marca/Modelo:" e esse delimitador.
//   Tambem existe a tabela "CLASSIFICACAO DOS PARTICIPANTES ... Oferta Inicial Oferta Final Marca ME/EPP" que
//   repete a mesma marca do vencedor — NAO usada (o campo por-item ja e o canonico; evita casar no participante
//   errado).  Assinatura do template: co-ocorrencia de "Marca/Modelo:" + "Item no ... Objeto:" + (ATA DE SESSAO
//   | Relatorio de Disputa | bbmnet.com.br).
//
//   Ancora de casamento: "Preco unitario:R$ <v>" == itensApi.unit_homologado  (e/ou Valor Final == unit*qtd);
//   chave primaria = o NUMERO do item (Item no N -> itensApi.numero). DESCARTA quando nao casa (nunca chuta).
//
// FALSOS POSITIVOS tratados:
//   - Campo VAZIO ou "-" (traco): 87% dos casos na celula — servico/obra/software/transporte sem produto.
//   - "MARCA PROPRIA" / "SEM MARCA": ausencia declarada de marca (art.41 / vendedor nao informou). Rejeitado.
//   - Ruido de quebra de pagina que vaza pro campo ("Pagina 2 de 6", "ESTADO DE SANTA CATARINA MUNICIPIO ...").
//   - O ANEXO "DESCRITIVO TECNICO" (colunas "... Modelo Marca") traz MARCA DE REFERENCIA do edital (art.41,
//     "marca de referencia"), NAO a do vencedor -> esse doc NAO casa o template (nao tem "Marca/Modelo:" nem
//     "Item no ... Objeto:") e e ignorado.
//
// REALIDADE MEDIDA (todos os 10 docs da celula que tem o campo, 56 blocos de item): 34x "-", 15x vazio,
//   3x "MARCA PROPRIA", 1x "SEM MARCA", 3x ruido de pagina. ZERO marcas reais. O campo EXISTE e e deterministico,
//   mas nesta celula-SC nunca foi preenchido com marca de fabricante (compras sao de obra/servico; e a config
//   "Exigencia obrigatoria de informar marca dos itens ofertados" vem "Nao"). Ver relatorio.
//
// Zero rede / zero LLM. node --check.

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// valores que NUNCA sao marca de fabricante (ausencia declarada / rotulos / genericos)
const LIXO = new Set([
  "propria", "proprio", "marca propria", "marca propria propria", "sem marca", "s marca", "nao aplicavel",
  "n aplicavel", "na", "n a", "nd", "n d", "generico", "generica", "diversos", "diversas", "varias", "varios",
  "sem", "outros", "outra", "modelo", "marca", "marca modelo", "fabricante", "nacional", "importado",
  "conforme edital", "a definir", "nao informado", "nao informada", "sim", "nao", "0",
]);

// fragmentos de RUIDO de layout que vazam do PDF pro campo Marca/Modelo -> removidos antes de avaliar
const RUIDO_RE = /(p[áa]gina\s*\d+\s*de\s*\d+|estado de santa catarina|munic[íi]pio de|servi[çc]o aut[ôo]nomo|prefeitura municipal).*/i;

function ehLixo(marcaBruta) {
  const nm = norm(marcaBruta);
  if (!nm || nm.length < 2 || nm.length > 40) return true;
  if (/^[\d\s.,\-]+$/.test(marcaBruta)) return true;    // so digitos/traco/pontuacao
  if (LIXO.has(nm)) return true;
  // "marca propria" com sujeira -> pega o miolo
  if (/^(marca\s+)?(propria|proprio)$/.test(nm)) return true;
  if (/^sem\s+marca$/.test(nm)) return true;
  return false;
}

// formas do valor no PDF (2 casas, com e sem separador de milhar). Ex: 1.234,56 e 1234,56
function formasValor(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return [];
  const [int, dec] = n.toFixed(2).split(".");
  const cp = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return [...new Set([`${cp},${dec}`, `${int},${dec}`])];
}

function detectaTemplate(texto) {
  const t = texto || "";
  const temCampo = /Marca\s*\/\s*Modelo:/i.test(t);
  const temItem = /Item\s*n[ºo°]\s*\d+\s*-\s*Objeto:/i.test(t);
  const temAssin = /(ATA DE SESS[ÃA]O|Relat[óo]rio de Disputa|bbmnet\.com\.br)/i.test(t);
  if (temCampo && temItem && temAssin) return "bbmnet_ata";
  return "outro";
}

// Extrai os blocos de item do texto da ATA de Sessao.
// Bloco = Item no N - Objeto: ... Preco unitario:R$ <pu> ... Valor Final:R$ <vf> Marca/Modelo: <marca> {delim}
function extraiBlocos(texto) {
  const re = /Item\s*n[ºo°]\s*(\d+)\s*-\s*Objeto:\s*(.*?)\s*Quantidade:\s*([\d.,]+)\s*Pre[çc]o unit[áa]rio:\s*(-|R?\$?\s*[\d.]+,\d{2})\s*Valor Final:\s*(-|R?\$?\s*[\d.]+,\d{2})\s*Marca\s*\/\s*Modelo:\s*(.*?)\s*(?=Item\s*n[ºo°]\s*\d+\s*-\s*Objeto:|Valor Global|Observa[çc][ãa]o|CLASSIFICA[ÇC][ÃA]O|PARTICIPANTE)/gs;
  const blocos = [];
  let m;
  while ((m = re.exec(texto)) !== null) {
    const numero = parseInt(m[1], 10);
    const precoUnit = /,\d{2}/.test(m[4]) ? m[4].replace(/[^\d.,]/g, "") : null;
    const valorFinal = /,\d{2}/.test(m[5]) ? m[5].replace(/[^\d.,]/g, "") : null;
    let marca = (m[6] || "").replace(RUIDO_RE, "").replace(/\s+/g, " ").trim();
    blocos.push({ numero, precoUnit, valorFinal, marca });
  }
  return blocos;
}

export function parse(texto, itensApi) {
  if (!texto || !Array.isArray(itensApi) || !itensApi.length) return [];
  if (detectaTemplate(texto) !== "bbmnet_ata") return [];

  const blocos = extraiBlocos(texto);
  if (!blocos.length) return [];
  const porNumero = new Map(blocos.map((b) => [b.numero, b]));

  const out = [];
  for (const it of itensApi) {
    const b = porNumero.get(Number(it.numero));
    if (!b) continue;                                   // sem bloco p/ esse numero -> descarta
    if (ehLixo(b.marca)) continue;                      // vazio / "-" / "marca propria" / ruido -> descarta

    // ancora de valor: Preco unitario == unit_homologado (2 casas). Se a API tem unit>0, EXIGE bater.
    let confianca = "media";
    const unit = Number(it.unit_homologado);
    if (Number.isFinite(unit) && unit > 0) {
      const formas = formasValor(unit);
      const casaPreco = b.precoUnit && formas.includes(b.precoUnit);
      // Valor Final = total da linha = unit * quantidade
      const qtd = Number(it.quantidade) || 0;
      const casaTotal = b.valorFinal && qtd > 0 && formasValor(unit * qtd).includes(b.valorFinal);
      if (!casaPreco && !casaTotal) continue;           // numero bate mas valor NAO -> descarta (nunca chuta)
      confianca = "alta";
    }

    // campo "Marca/Modelo" e livre; se vier "MARCA / MODELO" separados por barra, marca = 1a parte
    let marca = b.marca, modelo = null;
    const barra = marca.split(/\s*\/\s*/);
    if (barra.length === 2 && barra[0].length >= 2 && barra[1].length >= 1 && barra[1].length <= 30) {
      marca = barra[0].trim();
      modelo = barra[1].trim() || null;
    }
    if (ehLixo(marca)) continue;

    out.push({
      numero: Number(it.numero),
      marca: marca.slice(0, 60),
      modelo: modelo ? modelo.slice(0, 60) : null,
      valorUnit: Number.isFinite(unit) && unit > 0 ? unit : (b.precoUnit ? Number(b.precoUnit.replace(/\./g, "").replace(",", ".")) : null),
      confianca,
      template: "bbmnet",
    });
  }
  return out;
}

export { detectaTemplate, extraiBlocos, ehLixo };
