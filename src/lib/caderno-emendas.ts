// Gerador de "Caderno de Sugestões de Emendas" por município — formato inspirado no Caderno do GDF (2026):
// cada demanda = Objeto · Ministério (Unidade Orçamentária Federal) · Categoria de Despesa · Valor · ODS · Justificativa.
// Compõe sugestões a partir dos déficits DIAGNOSTICADOS do município (PerfilNecessidade), mapeando cada área
// ao ministério e ODS corretos. Conteúdo curado, apartidário; valores são REFERÊNCIA (ajustar ao projeto local).
import type { PerfilNecessidade } from "@/lib/queries";

export type SugestaoEmenda = {
  area: string; ods: string; odsNum: number;
  titulo: string; objeto: string;
  ministerio: string; categoria: string;
  valorRef: number; tipoEmenda: string; // ver MODALIDADES_EMENDA
  justificativa: string; sistema: string; finalidades: string;
  origem?: "programa" | "manual"; // como entrou no caderno (programa incorporado x incluída à mão)
};

// Modalidades/tipos de emenda que o município pode escolher (autoria + mecanismo de transferência).
export const MODALIDADES_EMENDA: { v: string; label: string }[] = [
  { v: "individual", label: "Individual (impositiva)" },
  { v: "bancada", label: "Bancada (estruturante)" },
  { v: "especial", label: "Transferência especial (Pix)" },
  { v: "fundoafundo", label: "Fundo a fundo (finalidade definida)" },
  { v: "comissao", label: "Comissão" },
];
export function labelModalidade(v: string): string { return MODALIDADES_EMENDA.find((m) => m.v === v)?.label || "Individual (impositiva)"; }

// Onde a proposta é cadastrada e as FINALIDADES oficiais por área (das cartilhas dos ministérios, PLOA 2026).
const SISTEMA_POR_AREA: Record<string, { sistema: string; finalidades: string }> = {
  saude: { sistema: "FNS — Ambiente Parlamentar (propostas de saúde)", finalidades: "Construção, Ampliação, Reforma, Equipamento e Material Permanente, Custeio Temporário à Atenção Primária (PAP/APS), Custeio à Média e Alta Complexidade (MAC), aquisição de veículos/ambulância" },
  educacao: { sistema: "FNDE/MEC — Transferegov e sistemas do FNDE (PAR/Simec)", finalidades: "Proinfância (creche/pré-escola), Caminho da Escola (transporte), PDDE, mobiliário e equipamentos escolares, quadras escolares" },
  assistencia: { sistema: "MDS/SUAS — Transferegov (cofinanciamento e estruturação da rede)", finalidades: "Construção/reforma e equipagem de CRAS, CREAS e Unidades de Acolhimento; aquisição de veículos; custeio dos serviços socioassistenciais" },
  infraestrutura: { sistema: "Ministério das Cidades / Integração — Transferegov", finalidades: "Esgotamento sanitário, abastecimento de água, resíduos sólidos, pavimentação, drenagem e mobilidade urbana" },
  habitacao: { sistema: "Ministério das Cidades — Transferegov", finalidades: "Urbanização de assentamentos, melhorias habitacionais, unidades habitacionais de interesse social" },
  agricultura: { sistema: "MAPA / MDA — Transferegov", finalidades: "Patrulha mecanizada (tratores/implementos), conservação de estradas rurais, apoio à agricultura familiar e ao abastecimento" },
  esporte: { sistema: "Ministério do Esporte — Transferegov", finalidades: "Construção/reforma de quadras, praças e centros esportivos; aquisição de material esportivo" },
  cultura: { sistema: "Ministério da Cultura — Transferegov / editais (Aldir Blanc, Paulo Gustavo)", finalidades: "Espaços culturais, bibliotecas, equipamentos, editais de fomento à cultura" },
};

type Arquetipo = {
  chave: keyof PerfilNecessidade | "universal";
  ods: string; odsNum: number;
  titulo: string; objeto: string;
  ministerio: string; categoria: string;
  valorRef: number; tipoEmenda: "individual" | "bancada";
  justificativaBase: string;
  sempre?: boolean; // entra mesmo sem déficit específico (demanda comum de emenda)
};

// Unidade Orçamentária Federal (ministério) por área — o campo-chave que torna a emenda executável.
const ARQUETIPOS: Arquetipo[] = [
  { chave: "saude", ods: "Saúde e Bem-Estar", odsNum: 3, titulo: "Estruturação da Atenção Primária à Saúde", objeto: "Construção, ampliação ou reforma de Unidade Básica de Saúde (UBS) e aquisição de equipamentos para a rede de atenção primária.", ministerio: "36901 - Fundo Nacional de Saúde (FNS) · Min. da Saúde", categoria: "Despesa de Capital — Obras e Instalações; Equipamentos e Material Permanente", valorRef: 1_500_000, tipoEmenda: "individual", justificativaBase: "Fortalecer a atenção primária amplia o acesso e reduz a pressão sobre a média e alta complexidade." },
  { chave: "saude", ods: "Saúde e Bem-Estar", odsNum: 3, titulo: "Aquisição de veículo e equipamentos para a saúde", objeto: "Aquisição de ambulância (apoio ao SAMU/transporte sanitário) e equipamentos médico-hospitalares para a rede municipal.", ministerio: "36901 - Fundo Nacional de Saúde (FNS) · Min. da Saúde", categoria: "Despesa de Capital — Equipamentos e Material Permanente", valorRef: 600_000, tipoEmenda: "individual", justificativaBase: "Renovar a frota e os equipamentos garante resolutividade e regularidade do atendimento, sobretudo na zona rural e distritos." },
  { chave: "educacao", ods: "Educação de Qualidade", odsNum: 4, titulo: "Ampliação da rede de educação infantil", objeto: "Construção de creche/pré-escola no padrão Proinfância e aquisição de mobiliário e equipamentos.", ministerio: "26298 - Fundo Nacional de Desenv. da Educação (FNDE) · MEC", categoria: "Despesa de Capital — Obras e Instalações; Equipamentos e Material Permanente", valorRef: 3_000_000, tipoEmenda: "bancada", justificativaBase: "A oferta de vagas em creche é um dos maiores gargalos municipais e condiciona a inserção produtiva das famílias." },
  { chave: "educacao", ods: "Educação de Qualidade", odsNum: 4, titulo: "Transporte e equipamentos escolares", objeto: "Aquisição de ônibus escolar, mobiliário, laboratórios e equipamentos de informática para as escolas municipais.", ministerio: "26298 - Fundo Nacional de Desenv. da Educação (FNDE) · MEC", categoria: "Despesa de Capital — Equipamentos e Material Permanente", valorRef: 700_000, tipoEmenda: "individual", justificativaBase: "Garantir transporte e ambientes adequados eleva a frequência e o desempenho, refletindo no IDEB." },
  { chave: "assistencia", ods: "Redução das Desigualdades", odsNum: 10, titulo: "Estruturação da rede socioassistencial (SUAS)", objeto: "Construção e equipagem de CRAS/CREAS e aquisição de veículo para a proteção social.", ministerio: "55901 - Fundo Nacional de Assistência Social (FNAS) · MDS", categoria: "Despesa de Capital — Obras e Instalações; Equipamentos e Material Permanente", valorRef: 900_000, tipoEmenda: "individual", justificativaBase: "Ampliar a capilaridade do SUAS aproxima a proteção social das famílias em vulnerabilidade." },
  { chave: "infraestrutura", ods: "Água Potável e Saneamento", odsNum: 6, titulo: "Ampliação do saneamento básico", objeto: "Ampliação de rede de esgotamento sanitário e/ou abastecimento de água e melhorias no manejo de resíduos sólidos.", ministerio: "56000 - Ministério das Cidades", categoria: "Despesa de Capital — Obras e Instalações", valorRef: 4_000_000, tipoEmenda: "bancada", justificativaBase: "O saneamento é o investimento de maior retorno em saúde pública e o de maior déficit histórico nos municípios." },
  { chave: "infraestrutura", ods: "Cidades e Comunidades Sustentáveis", odsNum: 11, titulo: "Pavimentação e mobilidade urbana", objeto: "Pavimentação, recapeamento e drenagem de vias urbanas, com acessibilidade.", ministerio: "56000 - Ministério das Cidades", categoria: "Despesa de Capital — Obras e Instalações", valorRef: 2_000_000, tipoEmenda: "individual", justificativaBase: "A pavimentação com drenagem reduz custos de manutenção, melhora a mobilidade e a segurança viária.", sempre: true },
  { chave: "habitacao", ods: "Cidades e Comunidades Sustentáveis", odsNum: 11, titulo: "Habitação de interesse social", objeto: "Infraestrutura e melhorias habitacionais para famílias de baixa renda (urbanização, unidades habitacionais).", ministerio: "56000 - Ministério das Cidades", categoria: "Despesa de Capital — Obras e Instalações", valorRef: 2_500_000, tipoEmenda: "bancada", justificativaBase: "Reduzir o déficit habitacional e a precariedade é condição para dignidade e para a regularização fundiária." },
  { chave: "agricultura", ods: "Fome Zero e Agricultura Sustentável", odsNum: 2, titulo: "Apoio à agricultura familiar e estradas rurais", objeto: "Aquisição de patrulha mecanizada (tratores/implementos) e conservação de estradas rurais para escoamento da produção.", ministerio: "22000 - Ministério da Agricultura e Pecuária", categoria: "Despesa de Capital — Equipamentos e Material Permanente; Obras e Instalações", valorRef: 1_200_000, tipoEmenda: "individual", justificativaBase: "A patrulha mecanizada e a conservação das estradas rurais viabilizam a produção da agricultura familiar e o abastecimento local." },
  { chave: "esporte", ods: "Saúde e Bem-Estar", odsNum: 3, titulo: "Equipamentos esportivos e de lazer", objeto: "Construção/reforma de quadra poliesportiva coberta, praça de esportes ou pista de caminhada.", ministerio: "51000 - Ministério do Esporte", categoria: "Despesa de Capital — Obras e Instalações", valorRef: 900_000, tipoEmenda: "individual", justificativaBase: "Espaços esportivos qualificados promovem saúde, convivência e prevenção, sobretudo para juventude." },
  { chave: "cultura", ods: "Cidades e Comunidades Sustentáveis", odsNum: 11, titulo: "Espaços e fomento à cultura", objeto: "Construção/reforma de espaço cultural (biblioteca, centro de cultura) e aquisição de equipamentos.", ministerio: "42902 - Fundo Nacional de Cultura (FNC) · Min. da Cultura", categoria: "Despesa de Capital — Obras e Instalações; Equipamentos e Material Permanente", valorRef: 800_000, tipoEmenda: "individual", justificativaBase: "Equipamentos culturais fortalecem identidade, economia criativa e acesso da população à cultura." },
];

// Órgão estadual (SC) + sistema por área — para o Caderno no escopo ESTADUAL (emendas impositivas da ALESC).
const ORGAO_ESTADUAL: Record<string, { orgao: string; sistema: string; finalidades: string }> = {
  saude: { orgao: "Secretaria de Estado da Saúde (SES/SC)", sistema: "ALESC (indicação na LOA estadual) + SEF-SC (execução, transferência especial estadual)", finalidades: "custeio e investimento na rede de saúde, equipamentos, obras, veículos/ambulância" },
  educacao: { orgao: "Secretaria de Estado da Educação (SED/SC)", sistema: "ALESC + SEF-SC (transferência especial estadual)", finalidades: "construção/reforma de escolas, transporte, equipamentos e mobiliário escolar" },
  assistencia: { orgao: "Secretaria de Estado da Assistência Social (SC)", sistema: "ALESC + SEF-SC", finalidades: "estruturação da rede socioassistencial, equipamentos, custeio de serviços" },
  infraestrutura: { orgao: "Secretaria de Estado da Infraestrutura e Mobilidade (SIE/SC)", sistema: "ALESC + SEF-SC", finalidades: "pavimentação, drenagem, saneamento, mobilidade, obras viárias" },
  habitacao: { orgao: "Secretaria de Estado (habitação de interesse social)", sistema: "ALESC + SEF-SC", finalidades: "melhorias habitacionais, urbanização, infraestrutura habitacional" },
  agricultura: { orgao: "Secretaria de Estado da Agricultura, Pesca e Desenvolvimento Rural (SC)", sistema: "ALESC + SEF-SC / EPAGRI / CIDASC", finalidades: "patrulha mecanizada, estradas rurais, apoio à agricultura familiar" },
  esporte: { orgao: "Secretaria de Estado do Esporte (SC) / FESPORTE", sistema: "ALESC + SEF-SC", finalidades: "construção/reforma de quadras e praças esportivas, material esportivo" },
  cultura: { orgao: "Secretaria de Estado de Cultura (SC) / Fundação Catarinense de Cultura", sistema: "ALESC + SEF-SC", finalidades: "espaços culturais, equipamentos, fomento à cultura" },
};
// fallback estadual p/ áreas fora do mapa (ex.: segurança, universal) — nunca cair no órgão/sistema FEDERAL num caderno estadual
const ESTADUAL_FALLBACK = { orgao: "Secretaria de Estado competente (conforme a área)", sistema: "ALESC (indicação na LOA estadual) + SEF-SC (execução, transferência especial estadual)", finalidades: "conforme o objeto e a Secretaria de Estado responsável" };
const orgaoEstadual = (chave: string) => ORGAO_ESTADUAL[chave] || ESTADUAL_FALLBACK;

// Menu completo das Secretarias/órgãos de Estado de SC e o que a emenda impositiva estadual pode financiar (o "QDD" estadual).
// area = chave do diagnóstico (p/ destacar déficit) quando aplicável; "" quando não há área equivalente no perfil.
export const SECRETARIAS_ESTADUAIS: { area: string; orgao: string; finalidades: string }[] = [
  { area: "saude", orgao: "Secretaria de Estado da Saúde (SES/SC)", finalidades: "custeio e investimento na rede de saúde, equipamentos, obras, veículos/ambulância" },
  { area: "educacao", orgao: "Secretaria de Estado da Educação (SED/SC)", finalidades: "construção/reforma de escolas, transporte, equipamentos e mobiliário escolar" },
  { area: "infraestrutura", orgao: "Secretaria de Estado da Infraestrutura e Mobilidade (SIE)", finalidades: "pavimentação, drenagem, obras viárias, pontes, mobilidade" },
  { area: "seguranca", orgao: "Secretaria de Estado da Segurança Pública (SSP/SC)", finalidades: "viaturas, equipamentos, reforma de unidades da PM/PC/Bombeiros, videomonitoramento" },
  { area: "agricultura", orgao: "Secretaria de Estado da Agricultura, Pesca e Desenv. Rural (SAR)", finalidades: "patrulha mecanizada, estradas rurais, EPAGRI/CIDASC, agricultura familiar" },
  { area: "assistencia", orgao: "Secretaria de Estado da Assistência Social, Mulher e Família (SAS)", finalidades: "rede socioassistencial, equipamentos, veículos, custeio de serviços" },
  { area: "esporte", orgao: "Secretaria de Turismo, Cultura e Esporte (SOL) / FESPORTE", finalidades: "quadras, praças esportivas, eventos, material esportivo" },
  { area: "cultura", orgao: "Secretaria de Turismo, Cultura e Esporte (SOL) / FCC", finalidades: "espaços culturais, equipamentos, fomento à cultura, turismo" },
  { area: "habitacao", orgao: "Secretaria de Estado / COHAB (habitação de interesse social)", finalidades: "melhorias habitacionais, urbanização, infraestrutura habitacional" },
  { area: "", orgao: "Secretaria de Estado do Desenvolvimento Econômico Sustentável (SDE)", finalidades: "apoio a arranjos produtivos, indústria, comércio, geração de emprego e renda" },
  { area: "", orgao: "Secretaria de Estado do Meio Ambiente e Economia Verde (SEMAE)", finalidades: "saneamento, recuperação ambiental, resíduos, defesa civil e prevenção" },
  { area: "", orgao: "Fundo Social / Secretaria de Estado da Assistência (FUNDOSOCIAL)", finalidades: "projetos sociais, ações emergenciais e de inclusão via Fundo Social do Estado" },
];

export function gerarCaderno(necessidade: PerfilNecessidade | null, nome: string, escopo: "federal" | "estadual" = "federal"): SugestaoEmenda[] {
  const out: SugestaoEmenda[] = [];
  for (const a of ARQUETIPOS) {
    const sinal = a.chave === "universal" ? null : necessidade?.[a.chave];
    const temDeficit = !!(sinal && sinal.deficit);
    if (!temDeficit && !a.sempre) continue;
    const motivo = sinal?.motivo ? ` No diagnóstico de ${nome}: ${sinal.motivo.replace(/\.$/, "")}.` : temDeficit ? "" : " Demanda estruturante recorrente do município.";
    const est = escopo === "estadual" ? orgaoEstadual(a.chave as string) : null;
    const sisF = SISTEMA_POR_AREA[a.chave as string] || { sistema: "Transferegov", finalidades: "" };
    out.push({
      area: rotuloArea(a.chave), ods: a.ods, odsNum: a.odsNum,
      titulo: a.titulo, objeto: a.objeto,
      ministerio: est ? est.orgao : a.ministerio, categoria: a.categoria,
      valorRef: a.valorRef, tipoEmenda: a.tipoEmenda,
      justificativa: a.justificativaBase + motivo,
      sistema: est ? est.sistema : sisF.sistema, finalidades: est ? est.finalidades : sisF.finalidades,
    });
  }
  // ordena: com déficit diagnosticado primeiro (maior valor), depois os "sempre"
  return out.sort((x, y) => y.valorRef - x.valorRef);
}

// Cardápios/documentos oficiais das emendas ESTADUAIS de SC (ALESC + SEF-SC).
export const CARDAPIOS_ESTADUAIS: { orgao: string; url: string }[] = [
  { orgao: "ALESC — Manual de Elaboração e Execução de Emenda Parlamentar Impositiva (LOA)", url: "https://www.alesc.sc.gov.br/mural-legislativo/b58b9e2c-3084-46b6-ac2a-7dd7ca94b8cf" },
  { orgao: "SEF-SC — Transparência das Emendas Parlamentares Estaduais (execução por município)", url: "https://www.sef.sc.gov.br/transparencias/emendas-parlamentares-estaduais" },
];

// Metadados por área p/ compor DEMANDAS MANUAIS (o município adiciona seus próprios projetos ao caderno).
const AREA_META: Record<string, { ministerio: string; ods: string; odsNum: number; categoria: string }> = {
  saude: { ministerio: "36901 - Fundo Nacional de Saúde (FNS) · Min. da Saúde", ods: "Saúde e Bem-Estar", odsNum: 3, categoria: "Despesa de Capital / Custeio" },
  educacao: { ministerio: "26298 - Fundo Nacional de Desenv. da Educação (FNDE) · MEC", ods: "Educação de Qualidade", odsNum: 4, categoria: "Despesa de Capital / Custeio" },
  assistencia: { ministerio: "55901 - Fundo Nacional de Assistência Social (FNAS) · MDS", ods: "Redução das Desigualdades", odsNum: 10, categoria: "Despesa de Capital / Custeio" },
  infraestrutura: { ministerio: "56000 - Ministério das Cidades", ods: "Cidades e Comunidades Sustentáveis", odsNum: 11, categoria: "Despesa de Capital — Obras e Instalações" },
  habitacao: { ministerio: "56000 - Ministério das Cidades", ods: "Cidades e Comunidades Sustentáveis", odsNum: 11, categoria: "Despesa de Capital — Obras e Instalações" },
  agricultura: { ministerio: "22000 - Ministério da Agricultura e Pecuária", ods: "Fome Zero e Agricultura Sustentável", odsNum: 2, categoria: "Despesa de Capital" },
  esporte: { ministerio: "51000 - Ministério do Esporte", ods: "Saúde e Bem-Estar", odsNum: 3, categoria: "Despesa de Capital — Obras e Instalações" },
  cultura: { ministerio: "42902 - Fundo Nacional de Cultura (FNC) · Min. da Cultura", ods: "Cidades e Comunidades Sustentáveis", odsNum: 11, categoria: "Despesa de Capital / Custeio" },
  seguranca: { ministerio: "30000 - Ministério da Justiça e Segurança Pública", ods: "Paz, Justiça e Instituições Eficazes", odsNum: 16, categoria: "Despesa de Capital" },
};
export const AREAS_CADERNO: { chave: string; rotulo: string }[] = Object.keys(AREA_META).map((k) => ({ chave: k, rotulo: rotuloArea(k) }));

export function criarDemandaManual(chave: string, titulo: string, objeto: string, valorRef: number, tipoEmenda: string, origem: "programa" | "manual" = "manual", escopo: "federal" | "estadual" = "federal"): SugestaoEmenda {
  const m = AREA_META[chave] || AREA_META.infraestrutura;
  const est = escopo === "estadual" ? orgaoEstadual(chave) : null; // caderno estadual → Secretaria de Estado, nunca ministério federal
  const sisF = SISTEMA_POR_AREA[chave] || { sistema: "Transferegov", finalidades: "" };
  return { area: rotuloArea(chave), ods: m.ods, odsNum: m.odsNum, titulo: titulo || "Demanda do município", objeto, ministerio: est ? est.orgao : m.ministerio, categoria: m.categoria, valorRef, tipoEmenda, justificativa: origem === "programa" ? "Possibilidade real incorporada ao caderno pelo município." : "Demanda incluída manualmente pelo município.", sistema: est ? est.sistema : sisF.sistema, finalidades: est ? est.finalidades : sisF.finalidades, origem };
}

function rotuloArea(k: string): string {
  const m: Record<string, string> = { saude: "Saúde", educacao: "Educação", assistencia: "Assistência Social", infraestrutura: "Infraestrutura e Saneamento", habitacao: "Habitação", cultura: "Cultura", esporte: "Esporte e Lazer", agricultura: "Agricultura", universal: "Infraestrutura" };
  return m[k] || k;
}

// Programa federal REAL casado (Transferegov) para agregar ao caderno.
export type ProgramaCaderno = { nome: string; orgao: string; area: string; objetivo: string; elegivel: boolean; janelaEmenda: string | null };

export function cadernoParaTexto(sugestoes: SugestaoEmenda[], nome: string, programas: ProgramaCaderno[] = [], escopo: "federal" | "estadual" = "federal"): string {
  const rotOrgao = escopo === "estadual" ? "Secretaria de Estado" : "Unidade Orçamentária Federal";
  const rotBancada = escopo === "estadual" ? "bancada estadual (ALESC)" : "bancada federal";
  const rotSecaoII = escopo === "estadual" ? "OBJETOS REAIS DE EMENDAS ESTADUAIS 2026 (execução SEF-SC)" : "PROGRAMAS FEDERAIS APLICÁVEIS (encontrados na base Transferegov)";
  const rotFonte = escopo === "estadual" ? "e do catálogo real de emendas estaduais de SC (SEF-SC)" : "e da base de programas federais";
  const brl = (n: number) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const total = sugestoes.reduce((s, x) => s + x.valorRef, 0);
  const hoje = new Date().toLocaleDateString("pt-BR");
  let t = `CADERNO DE SUGESTÕES DE EMENDAS PARLAMENTARES\nMunicípio de ${nome} — ${hoje}\n\n`;
  t += `Documento de apoio à articulação com a ${rotBancada}. Cada demanda indica o órgão executor (${rotOrgao}), a categoria de despesa, o valor pretendido e a justificativa, com base no diagnóstico do município.\n`;
  t += `Total de referência (projetos estruturais): ${brl(total)} em ${sugestoes.length} demandas.\n`;
  t += "\n" + "=".repeat(70) + "\nI. PROJETOS ESTRUTURAIS (a partir do diagnóstico do município)\n" + "=".repeat(70) + "\n";
  sugestoes.forEach((s, i) => {
    t += `\nDEMANDA ${i + 1} — ${s.titulo}\n`;
    t += `Área / ODS: ${s.area} · ODS ${s.odsNum} (${s.ods})\n`;
    t += `Objeto: ${s.objeto}\n`;
    t += `Regionalização: Município de ${nome}\n`;
    t += `${rotOrgao}: ${s.ministerio}\n`;
    t += `Categoria Econômica da Despesa: ${s.categoria}\n`;
    t += `Modalidade sugerida: Emenda ${labelModalidade(s.tipoEmenda)}\n`;
    t += `Onde cadastrar: ${s.sistema}\n`;
    if (s.finalidades) t += `Finalidades possíveis: ${s.finalidades}\n`;
    t += `Valor pretendido: ${brl(s.valorRef)}\n`;
    t += `Justificativa: ${s.justificativa}\n`;
  });
  if (programas.length) {
    t += "\n" + "=".repeat(70) + `\nII. ${rotSecaoII}\n` + "=".repeat(70) + "\n";
    programas.forEach((p, i) => {
      t += `\n${escopo === "estadual" ? "OBJETO" : "PROGRAMA"} ${i + 1} — ${p.nome}\n`;
      t += `Área: ${rotuloAreaPub(p.area)}\n`;
      t += `Órgão (${rotOrgao}): ${p.orgao || "—"}\n`;
      if (escopo !== "estadual") t += `Situação para o município: ${p.elegivel ? "elegível" : "verificar elegibilidade"}${p.janelaEmenda ? ` · janela de emenda até ${p.janelaEmenda.split("-").reverse().join("/")}` : ""}\n`;
      if (p.objetivo) t += `Objetivo: ${p.objetivo.slice(0, 400)}\n`;
    });
  }
  t += "\n" + "=".repeat(70) + "\n";
  t += `Valores são REFERÊNCIA para dimensionamento inicial — devem ser ajustados ao projeto e ao plano de trabalho. Documento apartidário, gerado pela plataforma PNIGP a partir do diagnóstico municipal ${rotFonte}.\n`;
  return t;
}

// Cardápios/cartilhas OFICIAIS de emendas 2026 por ministério (fonte: Portal Federativo — Cardápios de Emendas).
// Cada um lista as ações orçamentárias financiáveis por emenda naquela área. Hub central sempre atualizado.
export const CARDAPIO_HUB_2026 = "https://portalfederativo.gov.br/pt-br/cardapios-emendas";
export const CARDAPIOS_EMENDAS_2026: { area: string; orgao: string; url: string }[] = [
  { area: "saude", orgao: "Saúde — FNS (Ambiente Parlamentar), Cartilha PLOA 2026", url: "https://portalfns.saude.gov.br/cartilha-de-emendas-parlamentares-ploa-2026/" },
  { area: "educacao", orgao: "Educação — MEC/FNDE (módulo PAR), Cartilha 2026", url: "https://www.gov.br/mec/pt-br/centrais-de-conteudo/publicacoes/institucionais/emendas-parlamentares-mec-2026.pdf" },
  { area: "assistencia", orgao: "Assistência — MDS/SUAS, Guia de Emendas PLOA 2026", url: "https://mds.gov.br/webarquivos/MDS/1_Acesso_a_Informacao/Emendas_Parlamentares/Guia_de_Emendas/2026/2026_Versao_Completa.pdf" },
  { area: "agricultura", orgao: "Agricultura — MAPA, Portfólio de Ações (Emendas ao PLOA 2026)", url: "https://www.gov.br/agricultura/pt-br/centrais-de-conteudo/publicacoes/cartilhas-emendas-parlamentares/PLOA2025versofinal.pdf" },
  { area: "cultura", orgao: "Cultura — MinC, Cartilha Parlamentar 2026", url: "https://www.gov.br/cultura/pt-br/centrais-de-conteudo/publicacoes/cartilha-parlamentar-2026/cartilha_minc.pdf" },
  { area: "esporte", orgao: "Esporte — MESP, Ações Orçamentárias 2026", url: "https://www.gov.br/esporte/pt-br/acesso-a-informacao/emendas-parlamentares/CartilhaAcoesOrcamentarias2026_paracompartilhar.pdf" },
  { area: "seguranca", orgao: "Segurança — MJSP, Cartilha de Emendas 2026", url: "https://www.gov.br/mj/pt-br/acesso-a-informacao/acoes-e-programas/cartilha-de-emendas-parlamentares-de-2023-ate-2026/cartilha-de-emendas-parlamentares-2026/cartilha-de-emendas-parlamentares-2026.pdf/view" },
];

// Versão HTML (para baixar como Word .doc — preserva acentos e formatação, ao contrário do .txt).
export function cadernoParaHtml(sugestoes: SugestaoEmenda[], nome: string, programas: ProgramaCaderno[] = [], escopo: "federal" | "estadual" = "federal"): string {
  const rotOrgao = escopo === "estadual" ? "Secretaria de Estado" : "Unidade Orçamentária Federal";
  const rotBancada = escopo === "estadual" ? "bancada estadual (ALESC)" : "bancada federal";
  const rotSecaoII = escopo === "estadual" ? "II. Objetos reais de emendas estaduais 2026 (execução SEF-SC)" : "II. Programas federais aplicáveis (base Transferegov)";
  const rotRodape = escopo === "estadual" ? "Objetos reais extraídos da execução de emendas estaduais de SC (SEF-SC). Documento apartidário, gerado pela plataforma PNIGP." : "Finalidades e sistemas conforme as cartilhas oficiais de emendas PLOA 2026. Documento apartidário, gerado pela plataforma PNIGP.";
  const brl = (n: number) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const total = sugestoes.reduce((s, x) => s + x.valorRef, 0);
  const hoje = new Date().toLocaleDateString("pt-BR");
  let b = `<h1 style="font-size:16pt;color:#1e3a8a">Caderno de Sugestões de Emendas Parlamentares</h1>`;
  b += `<p><b>Município de ${esc(nome)}</b> — ${hoje}</p>`;
  b += `<p>Documento de apoio à articulação com a ${rotBancada}. Cada demanda indica o órgão executor (${rotOrgao}), a categoria de despesa, o valor pretendido e a justificativa, com base no diagnóstico do município.</p>`;
  b += `<p><b>Total pretendido (projetos):</b> ${brl(total)} em ${sugestoes.length} demandas.</p>`;
  b += `<h2 style="font-size:13pt;color:#1e3a8a;border-bottom:1px solid #ccc">I. Projetos (a partir do diagnóstico do município)</h2>`;
  sugestoes.forEach((s, i) => {
    b += `<h3 style="font-size:12pt;margin-bottom:2px">Demanda ${i + 1} — ${esc(s.titulo)}</h3><table style="font-size:10.5pt;border-collapse:collapse">`;
    const row = (k: string, v: string) => `<tr><td style="padding:1px 8px 1px 0;vertical-align:top"><b>${k}:</b></td><td style="padding:1px 0">${esc(v)}</td></tr>`;
    b += row("Área / ODS", `${s.area} · ODS ${s.odsNum} (${s.ods})`);
    b += row("Objeto", s.objeto);
    b += row("Regionalização", `Município de ${nome}`);
    b += row(rotOrgao, s.ministerio);
    b += row("Categoria de Despesa", s.categoria);
    b += row("Modalidade sugerida", `Emenda ${labelModalidade(s.tipoEmenda)}`);
    b += row("Onde cadastrar", s.sistema);
    if (s.finalidades) b += row("Finalidades possíveis", s.finalidades);
    b += row("Valor pretendido", brl(s.valorRef));
    b += row("Justificativa", s.justificativa);
    b += `</table>`;
  });
  if (programas.length) {
    b += `<h2 style="font-size:13pt;color:#1e3a8a;border-bottom:1px solid #ccc">${rotSecaoII}</h2>`;
    programas.forEach((p, i) => {
      const cauda = escopo === "estadual" ? "" : ` · ${p.elegivel ? "elegível" : "verificar elegibilidade"}${p.janelaEmenda ? ` · janela até ${p.janelaEmenda.split("-").reverse().join("/")}` : ""}`;
      b += `<p style="margin:4px 0"><b>${i + 1}. ${esc(p.nome)}</b><br>Área: ${esc(rotuloAreaPub(p.area))} · Órgão: ${esc(p.orgao || "—")}${cauda}${p.objetivo ? `<br><i>${esc(p.objetivo.slice(0, 400))}</i>` : ""}</p>`;
    });
  }
  b += `<p style="font-size:9pt;color:#666;margin-top:12px">Valores definidos pelo município conforme o projeto e o plano de trabalho. ${rotRodape}</p>`;
  return htmlDoc("Caderno de Emendas — " + nome, b);
}

export function htmlDoc(titulo: string, body: string): string {
  return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${titulo}</title></head><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111">${body}</body></html>`;
}

// Ações federais CURADAS por área — cobrem as áreas ausentes da base Transferegov (saúde via FNS, educação via
// FNDE/PAR, assistência via MDS/SUAS), grounded nas cartilhas oficiais de emendas PLOA 2026. Cada uma é uma
// possibilidade real de destinação de emenda, com o órgão/sistema correto.
export type AcaoFederal = { area: string; nome: string; orgao: string; objetivo: string };
export const ACOES_FEDERAIS_CURADAS: AcaoFederal[] = [
  // SAÚDE — finalidades oficiais do FNS (Ambiente Parlamentar)
  { area: "saude", nome: "Construção de Unidade Básica de Saúde (UBS)", orgao: "Ministério da Saúde / FNS", objetivo: "Edificação de novo estabelecimento de atenção primária (investimento)." },
  { area: "saude", nome: "Ampliação / Reforma de estabelecimento de saúde", orgao: "Ministério da Saúde / FNS", objetivo: "Ampliação (com acréscimo de área) ou reforma de unidade de saúde existente." },
  { area: "saude", nome: "Equipamento e Material Permanente (saúde)", orgao: "Ministério da Saúde / FNS", objetivo: "Aquisição de equipamentos de assistência e diagnóstico para a rede." },
  { area: "saude", nome: "Aquisição de veículos (ambulância / transporte sanitário)", orgao: "Ministério da Saúde / FNS", objetivo: "Ambulância (apoio ao SAMU) e veículos para transporte sanitário." },
  { area: "saude", nome: "Custeio — Incremento à Atenção Primária (PAP/APS)", orgao: "Ministério da Saúde / FNS", objetivo: "Incremento temporário para manutenção da Atenção Primária à Saúde." },
  { area: "saude", nome: "Custeio — Incremento à Média e Alta Complexidade (MAC)", orgao: "Ministério da Saúde / FNS", objetivo: "Incremento temporário para manutenção da atenção especializada (MAC)." },
  { area: "saude", nome: "Programa Agora Tem Especialista (custeio)", orgao: "Ministério da Saúde / FNS", objetivo: "Custeio de ações de ampliação do acesso à atenção especializada." },
  // EDUCAÇÃO — FNDE (módulo PAR)
  { area: "educacao", nome: "Proinfância — Construção de creche/pré-escola", orgao: "FNDE / Ministério da Educação", objetivo: "Construção de unidade de educação infantil no padrão Proinfância." },
  { area: "educacao", nome: "Caminho da Escola — transporte escolar", orgao: "FNDE / Ministério da Educação", objetivo: "Aquisição de ônibus/embarcação escolar para a rede municipal." },
  { area: "educacao", nome: "Equipamentos e mobiliário escolar", orgao: "FNDE / Ministério da Educação", objetivo: "Aquisição de mobiliário, laboratórios e equipamentos de informática." },
  { area: "educacao", nome: "Construção de quadra escolar coberta", orgao: "FNDE / Ministério da Educação", objetivo: "Construção/cobertura de quadra poliesportiva escolar." },
  { area: "educacao", nome: "PDDE — apoio à escola", orgao: "FNDE / Ministério da Educação", objetivo: "Programa Dinheiro Direto na Escola (manutenção e pequenas melhorias)." },
  // ASSISTÊNCIA — MDS / SUAS
  { area: "assistencia", nome: "Construção / reforma de CRAS", orgao: "Ministério do Desenvolvimento e Assistência Social", objetivo: "Estruturação da proteção social básica (CRAS)." },
  { area: "assistencia", nome: "Construção / reforma de CREAS", orgao: "Ministério do Desenvolvimento e Assistência Social", objetivo: "Estruturação da proteção social especial (CREAS)." },
  { area: "assistencia", nome: "Unidade de Acolhimento", orgao: "Ministério do Desenvolvimento e Assistência Social", objetivo: "Construção/reforma de unidade de acolhimento (idosos, crianças, etc.)." },
  { area: "assistencia", nome: "Aquisição de veículo para a rede socioassistencial", orgao: "Ministério do Desenvolvimento e Assistência Social", objetivo: "Veículo para as equipes do SUAS." },
  { area: "assistencia", nome: "Custeio dos serviços socioassistenciais (SUAS)", orgao: "Ministério do Desenvolvimento e Assistência Social", objetivo: "Cofinanciamento/custeio dos serviços continuados do SUAS." },
];

export function rotuloAreaPub(k: string): string {
  const m: Record<string, string> = { saude: "Saúde", educacao: "Educação", assistencia: "Assistência Social", infraestrutura: "Infraestrutura e Saneamento", habitacao: "Habitação", cultura: "Cultura", esporte: "Esporte e Lazer", agricultura: "Agricultura", seguranca: "Segurança Pública", outros: "Outros / diversos" };
  return m[k] || k;
}
