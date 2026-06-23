import type { Bloco } from "@/lib/docx";

// Banco de Modelos de Captação (documentos Word editáveis, pré-preenchidos com dados oficiais do município).
// Mesma lógica do gerarDocx (blocos h1/h2/p/label). Cada modelo segue a base legal aplicável.

export type DadosEnte = { nome: string; tipo?: string; populacao?: number | null };
export type DadosPrograma = { nome_programa?: string; orgao?: string; modalidade?: string; dt_fim_prop?: string | null } | null;

const L = (texto: string): Bloco => ({ tipo: "label", texto });
const P = (texto: string): Bloco => ({ tipo: "p", texto });
const H2 = (texto: string): Bloco => ({ tipo: "h2", texto });
const BR: Bloco = { tipo: "p", texto: "" };
const linha = "____________________";
const rodape = (nome: string) => P(`Documento pré-preenchido automaticamente pelo PNIGP (Instituto I10) a partir de dados oficiais. Revise e complete os campos antes de submeter. Município: ${nome}/SC.`);

export const MODELOS = {
  "plano-trabalho": { titulo: "Plano de Trabalho", desc: "Convênio / transferência voluntária (Portaria Interm. 424/2016)" },
  "proposta": { titulo: "Proposta de Trabalho", desc: "Cadastro de proposta no Transferegov" },
  "oficio-emenda": { titulo: "Ofício ao Parlamentar (emenda)", desc: "Solicitação de emenda parlamentar" },
  "oficio-concedente": { titulo: "Ofício de Encaminhamento", desc: "Encaminhamento da proposta ao órgão concedente" },
  "termo-referencia": { titulo: "Termo de Referência", desc: "Projeto básico simplificado (Lei 14.133/2021)" },
  "declaracoes": { titulo: "Declarações", desc: "Contrapartida e não-impedimento" },
} as const;
export type ModeloTipo = keyof typeof MODELOS;

function cabecalho(e: DadosEnte): Bloco[] {
  const orgaoEnte = e.tipo === "E" ? "GOVERNO DO ESTADO DE SANTA CATARINA" : `PREFEITURA MUNICIPAL DE ${e.nome.toUpperCase()}`;
  return [{ tipo: "p", texto: orgaoEnte }, P("Estado de Santa Catarina"), BR];
}

export function gerarBlocos(tipo: ModeloTipo, e: DadosEnte, prog: DadosPrograma, hoje: string): Bloco[] {
  const nome = e.nome || "Município";
  const pop = Number(e.populacao || 0).toLocaleString("pt-BR");
  const programa = prog?.nome_programa || `${linha}__________________`;
  const orgao = prog?.orgao || `${linha}__________________`;
  const modalidade = prog?.modalidade || "—";
  const ass = [BR, P(`${nome}/SC, ${hoje}.`), BR, P("_______________________________________"), P(`Responsável pelo ${e.tipo === "E" ? "Estado" : "Município"} proponente`), BR, rodape(nome)];

  if (tipo === "plano-trabalho") return [
    ...cabecalho(e), { tipo: "h1", texto: "PLANO DE TRABALHO" },
    P(`Proposta de convênio / transferência voluntária — ${programa}. Base legal: Decreto nº 11.531/2023 (convênios e contratos de repasse da União) e Portaria Conjunta MGI/MF/CGU nº 28/2024 (alt. nº 15/2025 — regime simplificado), c/c art. 25 da LC nº 101/2000 (LRF). Obs.: a Lei nº 8.666/93 foi revogada em 30/12/2023.`),
    H2("1. Dados do Proponente"),
    L("Ente proponente:"), P(`${nome} — ${e.tipo === "E" ? "Governo do Estado" : "Prefeitura Municipal"} / SC`),
    L("CNPJ:"), P(`${linha}  (preencher)`), L("População (IBGE):"), P(pop),
    L("Responsável (gestor) / cargo:"), P(`${linha}  (preencher)`), L("Endereço / contato / e-mail:"), P(`${linha}  (preencher)`),
    H2("2. Dados do Programa / Concedente"), L("Programa:"), P(programa), L("Órgão concedente:"), P(orgao), L("Modalidade:"), P(modalidade),
    H2("3. Objeto"), P(`Descrição do objeto a ser executado com os recursos do programa "${programa}" em ${nome}. Detalhar o que será adquirido/construído/realizado.`),
    H2("4. Justificativa"), P(`O município de ${nome} apresenta demanda alinhada ao objeto do programa. Descrever o diagnóstico (indicador/gargalo, público atendido, impacto esperado) — apoie-se no Diagnóstico do PNIGP.`),
    H2("5. Metas e Etapas"), L("Meta 1:"), P("Descrição · indicador · quantidade · prazo  (preencher)"), L("Meta 2:"), P("Descrição · indicador · quantidade · prazo  (preencher)"),
    H2("6. Cronograma Físico"), P("Etapa/Fase | Início | Término | Indicador físico  —  (preencher)"),
    H2("7. Plano de Aplicação dos Recursos"), L("Valor do repasse (concedente):"), P("R$ ____________"), L("Contrapartida do proponente:"), P("R$ ____________"), L("Valor global:"), P("R$ ____________"),
    H2("8. Cronograma de Desembolso"), P("Parcela | Mês/Ano | Valor (R$)  —  (preencher)"),
    H2("9. Declarações"), P("Declaramos a regularidade do ente, o compromisso com a contrapartida e com a prestação de contas, nos termos da legislação aplicável."),
    ...ass,
  ];

  if (tipo === "proposta") return [
    ...cabecalho(e), { tipo: "h1", texto: "PROPOSTA DE TRABALHO" },
    P(`Para cadastro no Transferegov.br — programa ${programa}.`),
    H2("1. Identificação"), L("Proponente:"), P(`${nome}/SC`), L("CNPJ:"), P(`${linha}`), L("Programa / concedente:"), P(`${programa} — ${orgao}`),
    H2("2. Descrição da Proposta"), P("Resumo do que se pretende com os recursos (objeto), em linguagem objetiva. (preencher)"),
    H2("3. Justificativa / Diagnóstico"), P(`Necessidade pública que motiva a proposta em ${nome}, com dados (apoie-se no Diagnóstico do PNIGP). (preencher)`),
    H2("4. Valor pretendido"), L("Repasse solicitado:"), P("R$ ____________"), L("Contrapartida:"), P("R$ ____________"),
    H2("5. Resultados esperados"), P("Benefícios à população, com indicadores mensuráveis. (preencher)"),
    ...ass,
  ];

  if (tipo === "oficio-emenda") return [
    ...cabecalho(e), { tipo: "h1", texto: "OFÍCIO — SOLICITAÇÃO DE EMENDA PARLAMENTAR" },
    P(`Ofício nº ______/${new Date(hoje.split("/").reverse().join("-")).getFullYear?.() || ""}  —  ${nome}/SC, ${hoje}.`),
    BR, L("A Sua Excelência o(a) Senhor(a)"), P(`${linha}  (nome do parlamentar)`), P("Câmara dos Deputados / Senado Federal / Assembleia Legislativa"),
    BR, H2("Assunto: Solicitação de emenda parlamentar"),
    P(`Senhor(a) Parlamentar,`),
    P(`O Município de ${nome}, com população de ${pop} habitantes (IBGE), vem respeitosamente solicitar o apoio de Vossa Excelência para a destinação de emenda parlamentar destinada a ${programa !== `${linha}__________________` ? `"${programa}"` : "_______________ (finalidade)"}.`),
    P("A medida atende demanda prioritária da população local, conforme diagnóstico em anexo, e será executada com observância da legislação aplicável e da devida prestação de contas."),
    L("Valor estimado:"), P("R$ ____________"), L("Finalidade / objeto:"), P(`${linha}  (preencher)`),
    P("Certos de contar com o valioso apoio, colocamo-nos à disposição para os esclarecimentos necessários."),
    P("Respeitosamente,"), ...ass,
  ];

  if (tipo === "oficio-concedente") return [
    ...cabecalho(e), { tipo: "h1", texto: "OFÍCIO DE ENCAMINHAMENTO DE PROPOSTA" },
    P(`Ofício nº ______  —  ${nome}/SC, ${hoje}.`),
    BR, L("Ao órgão concedente:"), P(orgao),
    BR, H2(`Assunto: Encaminhamento de proposta — ${programa}`),
    P(`Prezados Senhores,`),
    P(`Encaminhamos a proposta do Município de ${nome}/SC para o programa "${programa}", com o respectivo Plano de Trabalho e documentação de habilitação, para análise dessa unidade concedente.`),
    P("Declaramos a veracidade das informações e a regularidade do ente para a celebração do instrumento."),
    P("Atenciosamente,"), ...ass,
  ];

  if (tipo === "termo-referencia") return [
    ...cabecalho(e), { tipo: "h1", texto: "TERMO DE REFERÊNCIA" },
    P("Projeto básico simplificado — art. 6º, XXIII, da Lei nº 14.133/2021."),
    H2("1. Objeto"), P("Definição precisa do bem/serviço/obra a contratar. (preencher)"),
    H2("2. Justificativa e fundamentação"), P("Necessidade da contratação e o resultado pretendido. (preencher)"),
    H2("3. Descrição da solução / especificação"), P("Especificações técnicas, quantidades e unidades. (preencher — usar a Pesquisa de Preço do PNIGP para o valor de referência)"),
    H2("4. Valor estimado"), P("Valor de referência com base em pesquisa de preços (mínimo 3 fontes ou mediana de mercado). R$ ____________"),
    H2("5. Prazo e local de execução/entrega"), P(`${linha}  (preencher)`),
    H2("6. Obrigações das partes / critério de julgamento"), P("Menor preço / técnica e preço; obrigações do contratado e do contratante. (preencher)"),
    ...ass,
  ];

  // declaracoes
  return [
    ...cabecalho(e), { tipo: "h1", texto: "DECLARAÇÕES" },
    H2("Declaração de Contrapartida"),
    P(`O Município de ${nome}/SC declara que dispõe de recursos orçamentários para a contrapartida exigida no instrumento referente ao programa "${programa}", nos termos da LDO vigente.`),
    BR, H2("Declaração de Não-Impedimento / Regularidade"),
    P(`Declaramos, sob as penas da lei, que o ente não se encontra em situação de impedimento para receber transferências voluntárias e que mantém regularidade fiscal e quanto à prestação de contas, nos termos da legislação aplicável.`),
    BR, H2("Declaração de Capacidade Técnica e Gerencial"),
    P("Declaramos dispor de estrutura para executar o objeto e gerir os recursos, com a devida prestação de contas."),
    ...ass,
  ];
}
