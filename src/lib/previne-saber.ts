// Camada de CONHECIMENTO do Previne Brasil — ensina um leigo a entender e MELHORAR cada indicador.
// Metas e "como é medido" seguem a metodologia oficial do Previne (Min. Saúde / SAPS) — revisar a cada
// Nota Técnica anual. O "como melhorar" é derivado do que o indicador literalmente conta (não é opinião).
export type Saber = {
  emoji: string;
  curto: string; // rótulo curto p/ o gestor
  meta: number; // meta oficial Previne (%) — alcançá-la conta pontos no ISF → repasse
  oQueE: string; // o que é, em português de gente
  porQueImporta: string; // impacto no cidadão + no dinheiro da cidade
  comoMedido: string; // o que LITERALMENTE conta (de onde sai a ação)
  comoMelhorar: string[]; // passos que um servidor de boa vontade consegue executar
};

// chave = código do indicador no previne_sc
export const PREVINE_SABER: Record<string, Saber> = {
  "10": {
    emoji: "🤰", curto: "Pré-natal (6+ consultas)", meta: 45,
    oQueE: "Mede quantas gestantes fizeram pelo menos 6 consultas de pré-natal antes do parto.",
    porQueImporta: "Pré-natal completo evita morte de mãe e bebê e parto prematuro. É o indicador que mais salva vida — e que mais pesa no repasse do Previne.",
    comoMedido: "Conta a gestante que teve 6 ou mais consultas REGISTRADAS no e-SUS APS até o fim da gravidez. Consulta feita e não registrada não conta.",
    comoMelhorar: [
      "Captar a gestante cedo: vincular à equipe já na 1ª consulta (dá tempo de fechar as 6).",
      "Busca ativa das faltosas: agente de saúde liga/visita quem está atrasada nas consultas.",
      "Garantir o registro no e-SUS a cada consulta — treinar a recepção/enfermagem (muita consulta acontece e não é lançada).",
      "Agendar a próxima consulta já na saída da atual (não deixar a gestante sem data).",
    ],
  },
  "20": {
    emoji: "🩸", curto: "Pré-natal: testes sífilis/HIV", meta: 60,
    oQueE: "Mede quantas gestantes fizeram os exames de sífilis e HIV durante o pré-natal.",
    porQueImporta: "Sífilis e HIV não tratados passam da mãe para o bebê e causam sequelas graves — todas evitáveis com um exame barato e tratamento simples.",
    comoMedido: "Conta a gestante com os dois testes (sífilis e HIV) registrados no período. Teste rápido na própria unidade já vale.",
    comoMelhorar: [
      "Oferecer teste rápido na 1ª consulta de pré-natal, na hora — não depender de laboratório externo.",
      "Manter estoque de testes rápidos na UBS (faltou teste = indicador cai).",
      "Registrar o resultado no e-SUS no mesmo dia.",
      "Repetir o teste no 3º trimestre, como manda o protocolo.",
    ],
  },
  "30": {
    emoji: "🦷", curto: "Saúde bucal na gestação", meta: 60,
    oQueE: "Mede quantas gestantes tiveram pelo menos um atendimento odontológico durante a gravidez.",
    porQueImporta: "Infecção na gengiva da gestante está ligada a parto prematuro e bebê de baixo peso. Cuidar dos dentes da mãe protege o bebê.",
    comoMedido: "Conta a gestante com ao menos 1 atendimento odontológico individual registrado no pré-natal.",
    comoMelhorar: [
      "Encaixar a consulta odontológica dentro da rotina do pré-natal (mesma ida à UBS).",
      "Encaminhamento automático: toda gestante captada já sai com horário no dentista.",
      "Se faltam dentistas, organizar mutirões/agenda fixa para gestantes.",
      "Registrar o atendimento odontológico no e-SUS vinculado à gestante.",
    ],
  },
  "40": {
    emoji: "🎗️", curto: "Prevenção câncer de colo (citopatológico)", meta: 40,
    oQueE: "Mede a cobertura do exame preventivo (Papanicolau) nas mulheres de 25 a 64 anos.",
    porQueImporta: "O câncer de colo de útero é quase 100% evitável quando detectado cedo pelo preventivo. Mais exames = menos mortes evitáveis.",
    comoMedido: "Conta as mulheres de 25–64 anos com ao menos um citopatológico nos últimos ~3 anos, registrado.",
    comoMelhorar: [
      "Busca ativa: listar mulheres da faixa que estão sem preventivo e convidar (agente de saúde).",
      "Ampliar horários de coleta (fim de tarde/sábado) para quem trabalha.",
      "Campanhas locais + coleta sem necessidade de marcação prévia em alguns dias.",
      "Garantir que o resultado volta e é registrado (laboratório → e-SUS).",
    ],
  },
  "50": {
    emoji: "💉", curto: "Vacinação infantil", meta: 95,
    oQueE: "Mede a cobertura vacinal de crianças menores de 1 ano (poliomielite e penta).",
    porQueImporta: "Vacina em dia evita o retorno de doenças graves (paralisia infantil, etc.) e protege toda a cidade pelo efeito de rebanho.",
    comoMedido: "Conta as crianças <1 ano com o esquema de polio e penta completo e registrado.",
    comoMelhorar: [
      "Aprazamento ativo: avisar os pais quando a próxima dose está chegando (não esperar eles lembrarem).",
      "Busca ativa de faltosos pelo cartão de vacina/e-SUS.",
      "Vacinação na visita domiciliar e em creches/escolas.",
      "Registrar toda dose no sistema no dia (dose aplicada e não registrada derruba o indicador).",
    ],
  },
  "70": {
    emoji: "🩺", curto: "Controle do diabetes (HbA1c)", meta: 50,
    oQueE: "Mede quantas pessoas com diabetes fizeram o exame de hemoglobina glicada (HbA1c), que mostra se a doença está controlada.",
    porQueImporta: "Diabetes descontrolado leva a cegueira, amputação e diálise — tudo caro e evitável. O exame é a forma de saber se o tratamento está funcionando.",
    comoMedido: "Conta as pessoas com diabetes cadastradas que fizeram ao menos uma HbA1c no período, registrada.",
    comoMelhorar: [
      "Ter o cadastro atualizado de quem tem diabetes na sua área (sem cadastro, não há acompanhamento).",
      "Solicitar a HbA1c na consulta de rotina e na renovação de receita.",
      "Busca ativa de quem não aparece há meses (agente de saúde).",
      "Registrar o pedido e o resultado do exame no e-SUS.",
    ],
  },
};

// nível em relação à meta oficial (maior é sempre melhor no Previne)
export function nivelPrevine(pct: number, meta: number): "ok" | "warn" | "bad" {
  if (pct >= meta) return "ok";
  if (pct >= meta * 0.8) return "warn";
  return "bad";
}
