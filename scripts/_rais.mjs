// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _rais.mjs — dicionários e leitura do microdado RAIS (PDET/MTE).
//
// O arquivo é CSV `;` em LATIN-1, com cabeçalho, e cada região vem num .7z próprio. Não tem CNPJ nem nome:
// o vínculo é anônimo. Por isso a RAIS responde MUNICÍPIO + CARGO (CBO) + FUNÇÃO (tipo de vínculo) + SALÁRIO,
// e NÃO responde secretaria — essa só existe na folha que o Tribunal de Contas publica.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Natureza jurídica (CONCLA): o código da RAIS traz 4 dígitos = grupo + dígito verificador (103-1 → "1031").
// Só a administração MUNICIPAL entra. Empresa pública e sociedade de economia mista (2011/2038) não declaram
// esfera no código — ficam de fora e isso é registrado no relatório, não escondido.
export const NAT_MUNICIPAL = {
  "1031": "Órgão Público do Poder Executivo Municipal",
  "1066": "Órgão Público do Poder Legislativo Municipal",
  "1120": "Autarquia Municipal",
  "1155": "Fundação Pública de Direito Público Municipal",
  "1180": "Órgão Público Autônomo Municipal",
  "1244": "Município",
  "1279": "Fundação Pública de Direito Privado Municipal",
  "1309": "Fundo Público da Administração Indireta Municipal",
  "1333": "Fundo Público da Administração Direta Municipal",
};
// consórcios: intermunicipais por natureza, entram marcados à parte
export const NAT_CONSORCIO = {
  "1210": "Consórcio Público de Direito Público (Associação Pública)",
  "1228": "Consórcio Público de Direito Privado",
};

// Tipo de vínculo (RAIS) — é o campo que responde "função/regime" no sentido do pedido.
export const TIPO_VINCULO = {
  "10": "CLT indeterminado", "15": "CLT indeterminado (PJ)", "20": "CLT determinado",
  "25": "CLT determinado (PJ)", "30": "Estatutário", "31": "Estatutário RGPS",
  "35": "Estatutário não efetivo", "40": "Avulso", "50": "Temporário (Lei 8.745)",
  "55": "Aprendiz", "60": "CLT determinado Lei 9.601", "65": "CLT indeterminado (obra certa)",
  "70": "Diretor sem vínculo", "75": "Contrato por prazo determinado", "80": "Contrato de trabalho verde-amarelo",
  "90": "Contrato intermitente", "95": "Contrato de trabalho intermitente",
  "96": "Contrato de trabalho parcial", "97": "Contrato por tempo determinado",
};

export const VINC_ATIVO = { "0": "Não", "1": "Sim" };

export const ESCOLARIDADE = {
  "1": "Analfabeto", "2": "Até 5ª incompleto", "3": "5ª completo", "4": "6ª a 9ª",
  "5": "Fundamental completo", "6": "Médio incompleto", "7": "Médio completo",
  "8": "Superior incompleto", "9": "Superior completo", "10": "Mestrado", "11": "Doutorado",
};

// ⚠️ O separador MUDA entre edições da RAIS: 2025 veio com VÍRGULA (e ponto decimal), anos anteriores usam
// ponto-e-vírgula (e vírgula decimal). Nunca fixar — decidir pelo cabeçalho.
export function detectaSep(cabecalho) {
  return (cabecalho.split(";").length > cabecalho.split(",").length) ? ";" : ",";
}

// Divide uma linha CSV respeitando aspas e devolve os campos sem aspas nem espaços de preenchimento.
export function partirLinha(linha, sep = ";") {
  const out = [];
  let campo = "", dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { dentro = !dentro; continue; }
    if (c === sep && !dentro) { out.push(campo.trim()); campo = ""; continue; }
    campo += c;
  }
  out.push(campo.trim());
  return out;
}

// Remuneração: o arquivo de 2025 veio com PONTO decimal e sem separador de milhar ("1637.69", ".00").
// Anos anteriores usam vírgula. Aceita os dois; não existe separador de milhar em nenhum deles.
export const num = (v) => {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
