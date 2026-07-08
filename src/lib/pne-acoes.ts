// Base de conhecimento determinística: para cada Meta do PNE, COMO o município deve elevar o indicador
// (justificativa) + AÇÕES/estratégias (fundamentadas nas estratégias oficiais do PNE, Lei 13.005/2014) + PRAZOS.
// Alimenta a Fase 3 (Metas e Estratégias) do PME. Chave = código da meta usado em getDiagnosticoEducacaoPneSC.
export type PneAcao = { acao: string; prazo: "curto" | "médio" | "longo" | "contínuo" };
export type PneAcoesMeta = { estrutura: string; comoAumentar: string; acoes: PneAcao[] };

export const PRAZO_LABEL: Record<string, string> = { curto: "curto prazo (até 2 anos)", "médio": "médio prazo (até 5 anos)", longo: "longo prazo (vigência decenal)", "contínuo": "contínuo" };

// Pontos que NÃO temos em dado aberto — roteiro de como a equipe interna da Secretaria Municipal de Educação levanta cada um.
export type LevantamentoPonto = { ponto: string; meta: string; comoLevantar: string; fonte: string; responsavel: string };
export const LEVANTAMENTO_INTERNO: LevantamentoPonto[] = [
  { ponto: "Pós-graduação dos professores", meta: "M16", comoLevantar: "Contar, no quadro de docentes, quantos possuem especialização, mestrado ou doutorado, sobre o total; consolidar por etapa.", fonte: "Ficha funcional / sistema de RH; campo de escolaridade do docente no Censo Escolar", responsavel: "RH / Setor de Pessoal" },
  { ponto: "Vencimento inicial × piso nacional", meta: "M17", comoLevantar: "Comparar o vencimento inicial da tabela do Plano de Carreira com o piso salarial nacional vigente (Lei 11.738/2008) e verificar a defasagem.", fonte: "Folha de pagamento + tabela do Plano de Carreira", responsavel: "RH / Financeiro" },
  { ponto: "Inclusão em classe comum", meta: "M4", comoLevantar: "Nº de estudantes da educação especial matriculados em classe comum ÷ total de matrículas da educação especial.", fonte: "Sistema de matrícula da rede", responsavel: "Educação Especial / Matrícula" },
  { ponto: "Frequência e evasão (permanência)", meta: "M2", comoLevantar: "Acompanhar a frequência pelos diários; identificar faltosos e evadidos e acionar a busca ativa.", fonte: "Diários de classe / sistema de frequência; cruzamento com CadÚnico e Conselho Tutelar", responsavel: "Coordenação Pedagógica" },
  { ponto: "Demanda não atendida por creche", meta: "M1", comoLevantar: "Consolidar as inscrições não atendidas (lista de espera) por bairro para dimensionar o déficit real de vagas.", fonte: "Cadastro de demanda da Secretaria", responsavel: "Setor de Matrícula" },
  { ponto: "Estado da infraestrutura das escolas", meta: "M6", comoLevantar: "Aplicar um checklist físico por escola (espaços pedagógicos, acessibilidade, condições) para priorizar reformas e a expansão do tempo integral.", fonte: "Levantamento físico nas unidades", responsavel: "Setor de Infraestrutura" },
  { ponto: "Formação continuada realizada", meta: "M15", comoLevantar: "Registrar cursos e horas de formação por professor no ano, para acompanhar a política de valorização.", fonte: "Registro de formação / RH", responsavel: "RH / Formação" },
  // Valorização do servidor público da educação (Metas 17 e 18) — dimensões que só a Secretaria levanta internamente
  { ponto: "Cumprimento do 1/3 de hora-atividade", meta: "M17", comoLevantar: "Conferir, na grade horária dos professores, se ao menos um terço da jornada é reservado a planejamento, formação e correção (hora-atividade), fora da sala de aula.", fonte: "Grade horária / lotação de pessoal", responsavel: "RH / Pedagógico" },
  { ponto: "Progressão na carreira aplicada", meta: "M18", comoLevantar: "Levantar quantos servidores tiveram progressão (por titulação e por tempo/avaliação) no período e confirmar se o Plano de Carreira está sendo efetivamente cumprido.", fonte: "Atos de progressão / RH", responsavel: "RH" },
  { ponto: "Quadro efetivo × temporário", meta: "M18", comoLevantar: "Calcular o percentual de professores efetivos (concursados) sobre o total, para dimensionar a necessidade de concurso e a estabilidade do quadro.", fonte: "Folha de pagamento / RH", responsavel: "RH" },
  { ponto: "Condições de trabalho e saúde do servidor", meta: "M18", comoLevantar: "Acompanhar rotatividade, absenteísmo e afastamentos por saúde dos profissionais da educação, para orientar políticas de valorização e bem-estar.", fonte: "RH / medicina do trabalho", responsavel: "RH / Saúde do Servidor" },
  { ponto: "Valorização dos profissionais não-docentes", meta: "M18", comoLevantar: "Verificar se os funcionários da educação (não-docentes) possuem plano de carreira próprio e acesso à formação, como parte da valorização de todo o quadro.", fonte: "RH / Plano de Carreira dos não-docentes", responsavel: "RH" },
];

export const PNE_ACOES: Record<string, PneAcoesMeta> = {
  M1: {
    estrutura: "Rede de educação infantil (creche e pré-escola)",
    comoAumentar: "Ampliar vagas em creche (0 a 3 anos) até atingir 50% da demanda e universalizar a pré-escola (4 e 5 anos), priorizando as áreas de maior déficit e vulnerabilidade.",
    acoes: [
      { acao: "Mapear a demanda por creche (lista de espera) por bairro e cruzar com a oferta atual", prazo: "curto" },
      { acao: "Construir/ampliar/reformar unidades de educação infantil, captando recursos do Proinfância/FNDE", prazo: "médio" },
      { acao: "Realizar busca ativa das crianças de 4 e 5 anos fora da escola (pré-escola é obrigatória)", prazo: "curto" },
      { acao: "Ampliar e qualificar o quadro de profissionais da educação infantil", prazo: "médio" },
    ],
  },
  M2: {
    estrutura: "Rede de ensino fundamental",
    comoAumentar: "Assegurar o atendimento de toda a população de 6 a 14 anos e garantir que concluam o fundamental na idade certa, corrigindo o fluxo escolar.",
    acoes: [
      { acao: "Busca ativa dos alunos fora da escola e dos que abandonaram, com o CadÚnico e a rede de proteção", prazo: "curto" },
      { acao: "Programas de correção de fluxo e recomposição de aprendizagem para reduzir a distorção idade-série", prazo: "médio" },
      { acao: "Acompanhamento individualizado dos estudantes com baixo rendimento ou faltas frequentes", prazo: "contínuo" },
    ],
  },
  M6: {
    estrutura: "Educação em tempo integral",
    comoAumentar: "Elevar progressivamente o percentual de matrículas em tempo integral até, no mínimo, 25% dos estudantes, começando pelas escolas já preparadas (ver diagnóstico de prontidão da ETI).",
    acoes: [
      { acao: "Expandir a jornada nas escolas com infraestrutura pronta (refeitório, quadra, biblioteca)", prazo: "curto" },
      { acao: "Adequar a infraestrutura das demais escolas (reformas e ampliações)", prazo: "médio" },
      { acao: "Aderir ao Programa Escola em Tempo Integral e ampliar a matrícula ETI no FUNDEB", prazo: "curto" },
    ],
  },
  M7: {
    estrutura: "Qualidade da aprendizagem (IDEB)",
    comoAumentar: "Elevar o IDEB dos anos iniciais e finais até as metas projetadas, com atenção especial aos anos finais, onde o rendimento costuma ser mais baixo, priorizando a aprendizagem e a gestão pedagógica.",
    acoes: [
      { acao: "Instituir avaliação diagnóstica própria e periódica da rede, usando os resultados para replanejar o ensino turma a turma", prazo: "curto" },
      { acao: "Apoiar a transição entre ciclos — em especial a passagem do 5º para o 6º ano, quando o rendimento tende a cair — com acolhimento e nivelamento", prazo: "curto" },
      { acao: "Adotar currículo e material didático estruturados, com formação continuada dos professores alinhada à BNCC", prazo: "médio" },
      { acao: "Programa de recomposição das aprendizagens em leitura, escrita e matemática", prazo: "médio" },
    ],
  },
  M9: {
    estrutura: "Alfabetização e escolarização de jovens e adultos",
    comoAumentar: "Elevar a taxa de alfabetização da população de 15 anos ou mais e reduzir o analfabetismo funcional, ofertando EJA de qualidade.",
    acoes: [
      { acao: "Busca ativa de jovens e adultos não alfabetizados, em parceria com a assistência social", prazo: "médio" },
      { acao: "Ofertar EJA integrada à qualificação profissional e em horários compatíveis", prazo: "médio" },
    ],
  },
  M15: {
    estrutura: "Formação dos profissionais da educação",
    comoAumentar: "Garantir que 100% dos docentes tenham formação específica de nível superior na área em que atuam.",
    acoes: [
      { acao: "Levantar os docentes sem formação adequada e firmar parcerias para licenciatura/segunda licenciatura", prazo: "médio" },
      { acao: "Instituir programa de formação em serviço e incentivo à titulação", prazo: "contínuo" },
      { acao: "Realizar concurso público para prover vagas com profissionais habilitados", prazo: "médio" },
    ],
  },
  M18: {
    estrutura: "Carreira e valorização do magistério",
    comoAumentar: "Instituir e manter atualizado o Plano de Carreira dos profissionais da educação, com piso salarial e progressão.",
    acoes: [
      { acao: "Elaborar/atualizar por lei o Plano de Carreira do Magistério, respeitando o piso nacional", prazo: "curto" },
      { acao: "Assegurar 1/3 da jornada para atividades extraclasse (hora-atividade)", prazo: "médio" },
    ],
  },
  M19: {
    estrutura: "Gestão democrática da educação",
    comoAumentar: "Fortalecer a participação da comunidade na gestão escolar e nos conselhos de educação.",
    acoes: [
      { acao: "Fortalecer o Conselho Municipal de Educação e os conselhos de FUNDEB e de alimentação escolar", prazo: "curto" },
      { acao: "Adotar critérios técnicos e consulta à comunidade para a escolha de diretores", prazo: "médio" },
      { acao: "Constituir/reativar conselhos escolares e grêmios estudantis", prazo: "curto" },
    ],
  },
  M20: {
    estrutura: "Financiamento da educação",
    comoAumentar: "Assegurar a aplicação mínima de recursos e ampliar as fontes, buscando o padrão de qualidade (CAQ).",
    acoes: [
      { acao: "Manter a aplicação de, no mínimo, 25% da receita de impostos em MDE", prazo: "contínuo" },
      { acao: "Ampliar a captação (FUNDEB por matrícula integral, emendas, Novo PAC, Proinfância)", prazo: "contínuo" },
      { acao: "Alinhar PPA, LDO e LOA às metas do PME, com transparência e controle social", prazo: "curto" },
    ],
  },
};
