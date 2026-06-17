// Detalhe de uma contratação: itens (valor unitário × total) e empenhos.
// Derivado de forma determinística do próprio contrato (sem tabela extra).

import type { Contratacao } from "./queries";

export type ItemContrato = {
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitarioEstimado: number;
  valorUnitarioHomologado: number;
  valorTotal: number;
  fornecedor: string;
  economiaItem: number;
  economiaValor: number;
};

const FORNECEDORES_ALT = [
  "Alfa Comércio Ltda", "Beta Serviços S.A.", "Delta Distribuidora", "Épsilon Tecnologia",
  "Sigma Comercial", "Pharma Brasil Ltda", "Mais Limpeza Serviços", "Verde Ambiental S.A.",
];
export type Empenho = {
  numero: string;
  data: string;
  empenhado: number;
  pago: number;
};
export type Fornecedor = {
  nome: string;
  cnpj: string;
  cidade: string;
  uf: string;
  porteSigla: string;
  porteLabel: string;
  beneficiarioLC123: boolean;
  beneficioLC: string;
  valorGanho: number;
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = (v: number) => Math.round(v * 100) / 100;
const UNID_SERVICO = ["serviço", "campanha", "anual", "mês"];

const ITENS: Record<string, [string, string][]> = {
  "Aquisição de medicamentos": [["Dipirona 500mg", "cx"], ["Amoxicilina 500mg", "cx"], ["Losartana 50mg", "cx"], ["Insumos farmacêuticos diversos", "lote"]],
  "Material médico-hospitalar": [["Luvas descartáveis", "cx"], ["Seringas e agulhas", "cx"], ["Material de curativo", "lote"], ["Equipamentos hospitalares", "un"]],
  "Aquisição de ambulâncias": [["Ambulância tipo A (simples)", "un"], ["Ambulância tipo B (UTI móvel)", "un"], ["Equipamento de suporte à vida", "un"]],
  "Merenda escolar": [["Arroz", "kg"], ["Feijão", "kg"], ["Leite", "L"], ["Hortifrutigranjeiros", "lote"]],
  "Material escolar e didático": [["Cadernos", "un"], ["Livros didáticos", "un"], ["Material de arte", "lote"], ["Mobiliário escolar", "un"]],
  "Reforma de unidade escolar": [["Serviços de alvenaria", "serviço"], ["Instalações elétricas", "serviço"], ["Pintura", "serviço"], ["Cobertura", "serviço"]],
  "Transporte escolar": [["Locação de ônibus", "mês"], ["Combustível", "L"], ["Manutenção da frota", "serviço"]],
  "Obras de pavimentação": [["CBUQ (massa asfáltica)", "t"], ["Meio-fio e sarjeta", "m"], ["Sinalização viária", "serviço"], ["Drenagem pluvial", "serviço"]],
  "Iluminação pública (LED)": [["Luminária LED", "un"], ["Postes", "un"], ["Serviço de instalação", "serviço"]],
  "Coleta de resíduos sólidos": [["Coleta domiciliar", "mês"], ["Coleta seletiva", "mês"], ["Destinação final (aterro)", "t"]],
  "Material de construção": [["Cimento", "sc"], ["Areia", "m³"], ["Ferragens", "lote"], ["Blocos/tijolos", "milheiro"]],
  "Combustível para a frota": [["Gasolina comum", "L"], ["Diesel S10", "L"], ["Etanol", "L"]],
  "Equipamentos de informática": [["Notebooks", "un"], ["Desktops", "un"], ["Impressoras multifuncionais", "un"], ["Equipamentos de rede", "un"]],
  "Software de gestão pública": [["Licença de uso", "anual"], ["Implantação e migração", "serviço"], ["Suporte e manutenção", "mês"]],
  "Material de escritório": [["Papel A4", "resma"], ["Cartuchos e toners", "un"], ["Material de expediente", "lote"]],
  "Serviços de vigilância": [["Posto de vigilância 12h", "mês"], ["Posto de vigilância 24h", "mês"], ["Equipamentos de segurança", "lote"]],
  "Videomonitoramento urbano": [["Câmeras de monitoramento", "un"], ["Central de monitoramento", "serviço"], ["Infraestrutura de rede", "serviço"]],
  "Cestas básicas": [["Cesta básica de alimentos", "un"], ["Kit de higiene", "un"], ["Logística e entrega", "serviço"]],
  "Locação de veículos": [["Locação de automóvel", "mês"], ["Locação de van", "mês"], ["Locação de caminhão", "mês"]],
  "Serviços de publicidade": [["Produção de campanha", "campanha"], ["Produção de conteúdo", "serviço"], ["Veiculação em mídia", "serviço"]],
};

export function itensDoContrato(c: Contratacao): ItemContrato[] {
  const base = ITENS[c.objeto] ?? [["Item principal", "un"], ["Itens complementares", "lote"], ["Serviços associados", "serviço"]];
  const r = rng(hashStr(c.numero + c.objeto + c.fornecedor));
  const pesos = base.map(() => 0.5 + r());
  const soma = pesos.reduce((a, b) => a + b, 0);
  return base.map(([descricao, unidade], i) => {
    const valorTotal = r2(c.valor_contratado * (pesos[i] / soma));
    const servico = UNID_SERVICO.includes(unidade);
    const quantidade = servico ? 1 + Math.floor(r() * 12) : 20 + Math.floor(r() * 4000);
    const valorUnitarioHomologado = r2(valorTotal / quantidade);
    // economia do item varia em torno da economia do contrato (0–40%)
    const economiaItem = Math.max(0, Math.min(40, c.economia_pct + (r() - 0.5) * 10));
    const valorUnitarioEstimado = r2(valorUnitarioHomologado / (1 - economiaItem / 100));
    // a maioria dos itens é do fornecedor do contrato; alguns têm outro vencedor
    const fornecedor = r() < 0.68 ? c.fornecedor : FORNECEDORES_ALT[Math.floor(r() * FORNECEDORES_ALT.length)];
    return {
      descricao,
      unidade,
      quantidade,
      valorUnitarioEstimado,
      valorUnitarioHomologado,
      valorTotal,
      fornecedor,
      economiaItem: r2(economiaItem),
      economiaValor: r2((valorUnitarioEstimado - valorUnitarioHomologado) * quantidade),
    };
  });
}

const BENEFICIOS_LC = [
  "Empate ficto (preferência de contratação)",
  "Item exclusivo ME/EPP (até R$ 80 mil)",
  "Cota reservada de até 25%",
  "Prazo para regularização fiscal",
];

const CIDADES_UF: [string, string][] = [
  ["São Paulo", "SP"], ["Rio de Janeiro", "RJ"], ["Belo Horizonte", "MG"], ["Curitiba", "PR"],
  ["Porto Alegre", "RS"], ["Salvador", "BA"], ["Recife", "PE"], ["Fortaleza", "CE"],
  ["Goiânia", "GO"], ["Campinas", "SP"], ["Brasília", "DF"], ["Joinville", "SC"],
];

/** Dados cadastrais (simulados, determinísticos) de uma empresa fornecedora. */
function dadosFornecedor(nome: string): Omit<Fornecedor, "valorGanho"> {
  const h = hashStr(nome);
  const n8 = (h % 90000000) + 10000000; // 8 dígitos
  const s = String(n8);
  const dv = String((h % 90) + 10);
  const cnpj = `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/0001-${dv}`;
  const [cidade, uf] = CIDADES_UF[h % CIDADES_UF.length];
  const p = (h >>> 4) % 100;
  const [porteSigla, porteLabel] =
    p < 35 ? ["ME", "Microempresa"] : p < 70 ? ["EPP", "Empresa de Pequeno Porte"] : ["Demais", "Médio/Grande porte"];
  const beneficiarioLC123 = porteSigla === "ME" || porteSigla === "EPP";
  const beneficioLC = beneficiarioLC123 ? BENEFICIOS_LC[h % BENEFICIOS_LC.length] : "Não se aplica";
  return { nome, cnpj, cidade, uf, porteSigla, porteLabel, beneficiarioLC123, beneficioLC };
}

/** Fornecedores vencedores do processo, com o valor que cada um arrematou. */
export function fornecedoresDoProcesso(itens: ItemContrato[]): Fornecedor[] {
  const porNome = new Map<string, number>();
  for (const it of itens) porNome.set(it.fornecedor, (porNome.get(it.fornecedor) ?? 0) + it.valorTotal);
  return [...porNome.entries()]
    .map(([nome, valorGanho]) => ({ ...dadosFornecedor(nome), valorGanho: r2(valorGanho) }))
    .sort((a, b) => b.valorGanho - a.valorGanho);
}

/** Classifica os fornecedores em locais (do próprio ente) × de fora, por valor e quantidade. */
export function resumoFornecedores(contratacoes: Contratacao[], seed = "") {
  const local = { valor: 0, qtd: 0 };
  const fora = { valor: 0, qtd: 0 };
  for (const c of contratacoes) {
    const ehLocal = hashStr(`${c.fornecedor}|loc|${seed}`) % 100 < 42;
    const alvo = ehLocal ? local : fora;
    alvo.valor = r2(alvo.valor + c.valor_contratado);
    alvo.qtd += 1;
  }
  return { local, fora };
}

export function empenhosDoContrato(c: Contratacao): Empenho[] {
  const r = rng(hashStr("E" + c.numero + c.objeto));
  const n = 1 + Math.floor(r() * 4); // 1–4 empenhos
  const pesos = Array.from({ length: n }, () => 0.5 + r());
  const soma = pesos.reduce((a, b) => a + b, 0);
  // % pago depende da situação
  const baseRate = c.situacao === "Homologado" ? 0.75 + r() * 0.25 : c.situacao === "Em andamento" ? 0.2 + r() * 0.4 : 0;
  let seq = (hashStr(c.numero) % 900) + 100;
  return pesos.map((p, i) => {
    const empenhado = r2(c.valor_contratado * (p / soma));
    const pago = r2(empenhado * Math.min(1, baseRate + (r() - 0.5) * 0.1));
    const mes = String(1 + Math.floor(r() * 12)).padStart(2, "0");
    const numero = `2024NE${String(seq + i).padStart(6, "0")}`;
    return { numero, data: `${mes}/2024`, empenhado, pago: Math.max(0, pago) };
  });
}
