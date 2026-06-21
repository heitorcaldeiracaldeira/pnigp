// Configuração POR UF do motor PNIGP.
// Princípio: o que é NACIONAL (SICONFI, PNCP, FNS, CADPREV, INEP, SNIS e os mínimos constitucionais/LRF)
// é idêntico em todo o país e reaproveitado. O que VARIA por estado — sobretudo o controle externo
// (TCE x TCM, onde as contas MUNICIPAIS são julgadas, IEGM, normas estaduais) — fica aqui, por UF.
// Para habilitar um novo estado: adicionar a entrada da UF + coletar as bases (as federais já servem).

export type UFConfig = {
  uf: string;
  nome: string;
  codEstado: string; // IBGE 2 dígitos (cod do governo estadual)
  tribunalEstadual: string; // TCE — controle externo do estado
  tribunalMunicipios: string; // quem julga as contas dos MUNICÍPIOS
  contasMunicipaisEm: "TCE" | "TCM"; // estados com TCM separado julgam municípios fora do TCE
  iegmFonte: string | null; // origem do IEGM (Índice de Efetividade da Gestão Municipal), se publicado
  portalTransparenciaTCE: string | null;
  codCapital?: string; // IBGE 7 díg da capital, quando a capital tem TCM próprio (SP/RJ)
  tcmCapital?: string; // TCM da capital (ex.: TCM-SP, TCM-RJ)
  observacoes: string;
};

// Âncoras legais FEDERAIS — valem para todos os estados (não mudam por UF):
export const ANCORAS_FEDERAIS = {
  saudeMinPct: 15, // ASPS — LC 141/2012
  educacaoMinPct: 25, // MDE — CF art. 212
  fundebProfPct: 70, // FUNDEB em remuneração de profissionais — Lei 14.113/2020
  pessoalAlerta: 48.6, pessoalPrudencial: 51.3, pessoalLimite: 54, // LRF art. 19/20 (municípios)
  dclLimiteMunicipal: 120, // Dívida Consolidada Líquida — Res. SF 40/2001
};

// Estado de referência implementado. Demais entram com a mesma estrutura.
export const UF_CONFIG: Record<string, UFConfig> = {
  SC: {
    uf: "SC", nome: "Santa Catarina", codEstado: "42",
    tribunalEstadual: "TCE-SC", tribunalMunicipios: "TCE-SC", contasMunicipaisEm: "TCE",
    iegmFonte: "TCE-SC / IRB (IEGM)", portalTransparenciaTCE: "https://www.tce.sc.gov.br",
    observacoes: "Em SC o próprio TCE-SC julga as contas estaduais e municipais (não há TCM). IEGM publicado pelo TCE-SC.",
  },
  // === modelos de referência para expansão (TCM separado) — habilitar quando coletar as bases ===
  BA: {
    uf: "BA", nome: "Bahia", codEstado: "29",
    tribunalEstadual: "TCE-BA", tribunalMunicipios: "TCM-BA", contasMunicipaisEm: "TCM",
    iegmFonte: "TCM-BA", portalTransparenciaTCE: "https://www.tcm.ba.gov.br",
    observacoes: "Bahia tem TCM-BA SEPARADO: contas MUNICIPAIS são julgadas pelo TCM-BA, não pelo TCE-BA. Interpretações e prazos podem diferir.",
  },
  SP: {
    uf: "SP", nome: "São Paulo", codEstado: "35",
    tribunalEstadual: "TCE-SP", tribunalMunicipios: "TCE-SP", contasMunicipaisEm: "TCE",
    iegmFonte: "TCE-SP (IEG-M)", portalTransparenciaTCE: "https://www.tce.sp.gov.br",
    codCapital: "3550308", tcmCapital: "TCM-SP",
    observacoes: "TCE-SP julga os municípios, EXCETO a capital São Paulo, que tem TCM-SP próprio. IEG-M é referência nacional (origem no TCE-SP).",
  },
};

export const ufConfig = (uf: string): UFConfig => UF_CONFIG[uf] || UF_CONFIG.SC;
export const ufImplementadas = () => Object.keys(UF_CONFIG);

// Resolve QUAL tribunal é responsável por um ente — chave para estados com TCE E TCM coexistindo.
// Estado → sempre o TCE. Município → o TCM (se o estado tem TCM que julga municípios) senão o TCE.
// `codCapital` (IBGE 7 díg) trata o caso SP/RJ, onde só a CAPITAL tem TCM próprio.
export function tribunalDoEnte(uf: string, tipo: "E" | "M", codIbge?: string): { tribunal: string; tipo: "TCE" | "TCM"; nota: string } {
  const c = ufConfig(uf);
  if (tipo === "E") return { tribunal: c.tribunalEstadual, tipo: "TCE", nota: "Contas estaduais — controle externo pelo TCE." };
  // município:
  if (c.contasMunicipaisEm === "TCM") return { tribunal: c.tribunalMunicipios, tipo: "TCM", nota: `Contas municipais julgadas pelo ${c.tribunalMunicipios} (TCM separado do TCE).` };
  if (c.codCapital && codIbge === c.codCapital && c.tcmCapital) return { tribunal: c.tcmCapital, tipo: "TCM", nota: `Capital: contas julgadas pelo ${c.tcmCapital} (TCM da capital).` };
  return { tribunal: c.tribunalEstadual, tipo: "TCE", nota: "Contas municipais julgadas pelo próprio TCE (não há TCM)." };
}
