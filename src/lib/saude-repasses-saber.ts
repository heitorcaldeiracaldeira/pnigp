// Conhecimento dos PROGRAMAS/REPASSES federais de saúde (FNS) — o que é, por que importa e como
// otimizar/aumentar cada repasse. "Como melhorar" ancorado em como cada bloco é financiado (metodologia
// oficial), tom neutro. Os nomes das áreas variam por ano no FNS → canon() agrupa no programa canônico.
export type SaberRepasse = { key: string; emoji: string; nome: string; oQueE: string; porQueImporta: string; comoMelhorar: string[] };

export function canonRepasse(nome: string): string {
  const s = (nome || "").toLowerCase();
  if (/prim[áa]ria|b[áa]sica/.test(s)) return "aps";
  if (/m[ée]dia e alta|complexidade|especializada/.test(s)) return "mac";
  if (/farmac/.test(s)) return "farmacia";
  if (/vigil[âa]ncia/.test(s)) return "vigilancia";
  if (/gest[ãa]o/.test(s)) return "gestao";
  if (/investimento|estrutura/.test(s)) return "investimento";
  if (/covid|coronav|extraordin/.test(s)) return "extraordinario";
  return "outros";
}

export const SABER_REPASSE: Record<string, SaberRepasse> = {
  aps: {
    key: "aps", emoji: "🏠", nome: "Atenção Primária (APS)",
    oQueE: "Recurso federal que custeia a porta de entrada do SUS — UBS, equipes de Saúde da Família, agentes comunitários.",
    porQueImporta: "É onde 80% dos problemas de saúde se resolvem. Hoje paga por população cadastrada + desempenho (Previne) — quanto melhor a APS, maior o repasse.",
    comoMelhorar: [
      "Cadastrar toda a população nas equipes (a capitação paga por pessoa cadastrada, não pela do IBGE).",
      "Cumprir os indicadores do Previne (ver a aba Atenção Primária) — cada um na meta soma repasse.",
      "Registrar todo atendimento no e-SUS APS (serviço não registrado não conta nem para cuidado nem para repasse).",
      "Completar e manter as equipes de Saúde da Família e de Saúde Bucal homologadas no CNES.",
    ],
  },
  mac: {
    key: "mac", emoji: "🏥", nome: "Média e Alta Complexidade (MAC)",
    oQueE: "Recurso para consultas especializadas, exames, cirurgias e internações — o que a UBS não resolve.",
    porQueImporta: "Financia a rede hospitalar e ambulatorial especializada. É baseado em produção e em tetos pactuados — produção não faturada é dinheiro perdido.",
    comoMelhorar: [
      "Registrar e faturar TODA a produção no SIA (ambulatorial) e SIH (hospitalar) — é o que gera o repasse.",
      "Revisar o teto MAC e a PPI com a regional de saúde e o Estado (pactuação) quando a demanda cresce.",
      "Habilitar serviços no CNES (ex.: leitos, UTI, alta complexidade) para liberar recursos específicos.",
      "Reduzir glosas: conferir CID, procedimento e competência antes de enviar o faturamento.",
    ],
  },
  farmacia: {
    key: "farmacia", emoji: "💊", nome: "Assistência Farmacêutica",
    oQueE: "Recurso para os medicamentos do SUS — desde a farmácia básica da UBS até os de alto custo.",
    porQueImporta: "Garante remédio para hipertensão, diabetes, saúde mental, etc. O Componente Básico é cofinanciado (União, Estado e município) — exige contrapartida.",
    comoMelhorar: [
      "Garantir a contrapartida municipal do Componente Básico (sem ela, perde-se a federal).",
      "Manter a farmácia básica abastecida conforme a RENAME e a demanda local.",
      "Registrar a dispensação (Hórus/BNAFAR) — o registro embasa o financiamento e o planejamento.",
      "Aderir aos programas (ex.: Farmácia Popular) e qualificar a programação de compras.",
    ],
  },
  vigilancia: {
    key: "vigilancia", emoji: "🛡️", nome: "Vigilância em Saúde",
    oQueE: "Recurso para prevenir e controlar doenças — vacinação, controle de endemias (dengue), vigilância sanitária e epidemiológica.",
    porQueImporta: "É o que evita surtos e protege a cidade inteira. Tem piso próprio condicionado ao cumprimento de ações.",
    comoMelhorar: [
      "Manter salas de vacina funcionando e a cobertura vacinal em dia.",
      "Notificar agravos no SINAN em tempo (a vigilância depende do dado notificado).",
      "Executar as ações pactuadas (combate à dengue, vigilância sanitária) e comprovar.",
      "Manter as equipes de vigilância e endemias completas e registradas.",
    ],
  },
  gestao: {
    key: "gestao", emoji: "🗂️", nome: "Gestão do SUS",
    oQueE: "Recurso de apoio à organização e qualificação da gestão municipal de saúde.",
    porQueImporta: "Sustenta planejamento, regulação, controle e auditoria — a 'engrenagem' que faz o resto funcionar.",
    comoMelhorar: [
      "Manter o Plano Municipal de Saúde e a programação anual atualizados e aprovados no Conselho.",
      "Qualificar a regulação (filas, marcação) e o controle/avaliação para sustentar pactuações.",
      "Cumprir prazos de prestação de contas (SIOPS, relatórios de gestão).",
    ],
  },
  investimento: {
    key: "investimento", emoji: "🏗️", nome: "Investimento / Estruturação",
    oQueE: "Recurso para obras e equipamentos — construir/reformar UBS, comprar veículos, equipar serviços.",
    porQueImporta: "Amplia e moderniza a rede. Vem muito de propostas e emendas parlamentares cadastradas no FNS.",
    comoMelhorar: [
      "Cadastrar propostas de investimento no sistema do FNS e acompanhar a execução.",
      "Articular emendas parlamentares para a saúde do município.",
      "Ter projetos prontos (engenharia, terreno regularizado) para captar quando o recurso abre.",
    ],
  },
  extraordinario: {
    key: "extraordinario", emoji: "⚡", nome: "Repasses Extraordinários (ex.: COVID-19)",
    oQueE: "Recursos temporários para situações específicas, como o enfrentamento da pandemia.",
    porQueImporta: "Importante no momento, mas TEMPORÁRIO — não deve ser confundido com custeio permanente no planejamento.",
    comoMelhorar: [
      "Tratar como recurso pontual: não comprometer despesa permanente (folha) com dinheiro que vai acabar.",
      "Prestar contas corretamente para não gerar pendência (CAUC) e devolução.",
    ],
  },
  outros: {
    key: "outros", emoji: "📦", nome: "Outras transferências",
    oQueE: "Repasses não classificados nos blocos regulares de financiamento.",
    porQueImporta: "Compõem o total recebido; vale identificar a origem para planejar.",
    comoMelhorar: ["Identificar a finalidade de cada repasse e vinculá-lo ao planejamento da saúde."],
  },
};
