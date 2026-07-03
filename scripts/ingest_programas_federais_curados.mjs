// ETL — REGISTRO CURADO de programas federais de infraestrutura (saúde/educação) que o município pode pleitear.
// FNS/FNDE não expõem "janela aberta" por API limpa (SISMOB/Habilita são logados; aberturas saem por portaria/seleção).
// Então mantemos um registro curado, COM PROVENIÊNCIA (link oficial em cada item = evidência da procura), atualizado
// quando muda a portaria. Alimenta o casamento oportunidade×carência do radar. Idempotente. node scripts/ingest_programas_federais_curados.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

// Fonte: páginas oficiais consultadas (Novo PAC Casa Civil — 9 eixos, FNS/SISMOB, FNDE/Proinfância, MDS) — jun/2026.
const NP = "https://www.gov.br/casacivil/pt-br/novopac";
const SEL = "Por seleção do Novo PAC (portaria) — consultar portal";
const PROGRAMAS = [
  // ===== SAÚDE =====
  { id: "novopac-ubs", area: "saude", nome: "Novo PAC — Unidades Básicas de Saúde (UBS)",
    objeto: "Construção e conclusão de Unidades Básicas de Saúde (atenção primária)", orgao: "Ministério da Saúde · Novo PAC",
    fonte: "Novo PAC Saúde", link: `${NP}/saude`, elegibilidade: "Municípios com demanda/obras de atenção básica; ingresso por seleção do Novo PAC.", janela: SEL },
  { id: "sismob-requalifica-ubs", area: "saude", nome: "Requalifica UBS / SISMOB",
    objeto: "Construção, ampliação, reforma e informatização de UBS", orgao: "Ministério da Saúde · Fundo Nacional de Saúde",
    fonte: "FNS · SISMOB 2.0", link: "https://portalfns.saude.gov.br/sismob-2-0/", elegibilidade: "Municípios; cadastro de proposta no SISMOB quando a fase é aberta por portaria.", janela: "Cadastro no SISMOB quando aberto por portaria — consultar portal" },
  { id: "novopac-saude-especializada", area: "saude", nome: "Novo PAC — Policlínicas e Maternidades",
    objeto: "Policlínicas regionais e maternidades (atenção especializada)", orgao: "Ministério da Saúde · Novo PAC",
    fonte: "Novo PAC Saúde", link: `${NP}/saude`, elegibilidade: "Em geral de abrangência regional; verificar arranjo com o estado/CIR.", janela: SEL },
  { id: "novopac-telessaude", area: "saude", nome: "Novo PAC — Telessaúde (saúde digital)",
    objeto: "Núcleos de Telessaúde e Salas de Teleconsulta", orgao: "Ministério da Saúde · Novo PAC",
    fonte: "Novo PAC Saúde", link: `${NP}/saude`, elegibilidade: "Municípios; integra a rede de atenção. Por seleção.", janela: SEL },
  { id: "fns-investsus-propostas", area: "saude", nome: "Propostas de investimento ao MS (InvestSUS)",
    objeto: "Apresentação de propostas de investimento e custeio ao Ministério da Saúde (obras, equipamentos, veículos), conforme a cartilha anual de propostas", orgao: "Ministério da Saúde · Fundo Nacional de Saúde",
    fonte: "FNS · InvestSUS · Cartilha de Propostas ao MS 2026", link: "https://investsus.saude.gov.br/", elegibilidade: "Fundos municipais de saúde cadastrados no InvestSUS; proposta submetida quando a área/programa está aberto.", janela: "Apresentação de propostas 2026 — via InvestSUS (cartilha MS 2026); consultar aberturas por programa" },
  { id: "novopac-saude-consulta-referencia", area: "saude", nome: "Novo PAC — Projetos de referência (consulta pública)",
    objeto: "Projetos de referência do Novo PAC Saúde (UBS, UPA, policlínicas) disponibilizados para consulta pública — base para o município pleitear", orgao: "Ministério da Saúde · Novo PAC",
    fonte: "FNS · Novo PAC (consulta pública de projetos de referência)", link: "https://portalfns.saude.gov.br/", elegibilidade: "Municípios; usar o projeto de referência ao apresentar proposta na seleção do Novo PAC.", janela: "Consulta pública contínua; ingresso por seleção do Novo PAC" },
  // ===== EDUCAÇÃO =====
  { id: "novopac-educacao", area: "educacao", nome: "Novo PAC — Educação básica (creches e escolas)",
    objeto: "Construção de creches, pré-escolas e escolas de ensino fundamental e médio", orgao: "MEC · FNDE · Novo PAC",
    fonte: "Novo PAC Educação", link: `${NP}/educacao-ciencia-e-tecnologia`, elegibilidade: "Municípios com demanda de vagas; ingresso por seleção do Novo PAC.", janela: SEL },
  { id: "fnde-proinfancia", area: "educacao", nome: "Proinfância (FNDE)",
    objeto: "Construção e equipamento de creches e pré-escolas (educação infantil)", orgao: "FNDE",
    fonte: "FNDE · Proinfância (PAR/SIMEC)", link: "https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/proinfancia", elegibilidade: "Demanda mínima por Censo + terreno municipal regularizado; adesão via PAR no SIMEC.", janela: "Adesão por ciclo do PAR (SIMEC) — consultar portal" },
  { id: "par-simec-obras", area: "educacao", nome: "PAR — Obras (SIMEC Módulo Obras 2.0)",
    objeto: "Pleito e acompanhamento de obras da educação (creches, escolas, quadras cobertas, ampliações) pelo Plano de Ações Articuladas", orgao: "MEC · FNDE",
    fonte: "FNDE · PAR / SIMEC Obras 2.0 (painel público de transparência)", link: "https://simec.mec.gov.br/painelObras/", elegibilidade: "Municípios com termo de compromisso no PAR; pleito de novas obras quando o ciclo do PAR abre no SIMEC (login do gestor).", janela: "Pleito por ciclo do PAR no SIMEC; execução acompanhável no Painel de Obras (público)" },
  // ===== INFRAESTRUTURA / SANEAMENTO / ÁGUA =====
  { id: "novopac-esgoto", area: "infraestrutura", nome: "Novo PAC — Esgotamento sanitário",
    objeto: "Ampliação do acesso e melhoria da coleta e tratamento de esgoto", orgao: "Ministério das Cidades · Novo PAC",
    fonte: "Novo PAC Cidades Sustentáveis", link: `${NP}/cidades-sustentaveis-e-resilientes`, elegibilidade: "Municípios; seleção por critérios de déficit de saneamento.", janela: SEL },
  { id: "novopac-agua", area: "infraestrutura", nome: "Novo PAC — Abastecimento de água",
    objeto: "Obras de abastecimento de água urbano e rural", orgao: "Ministério das Cidades / Integração · Novo PAC",
    fonte: "Novo PAC Água para Todos", link: `${NP}/agua-para-todos`, elegibilidade: "Municípios; propostas habilitadas (FGTS/OGU).", janela: SEL },
  { id: "novopac-drenagem", area: "infraestrutura", nome: "Novo PAC — Drenagem urbana sustentável",
    objeto: "Obras para reduzir risco de alagamentos e inundações recorrentes", orgao: "Ministério das Cidades · Novo PAC",
    fonte: "Novo PAC Cidades Sustentáveis", link: `${NP}/cidades-sustentaveis-e-resilientes`, elegibilidade: "Municípios com histórico de alagamento.", janela: SEL },
  { id: "novopac-residuos", area: "infraestrutura", nome: "Novo PAC — Gestão de resíduos sólidos",
    objeto: "Melhoria dos serviços de gestão de resíduos sólidos", orgao: "Ministério das Cidades / Meio Ambiente · Novo PAC",
    fonte: "Novo PAC Cidades Sustentáveis", link: `${NP}/cidades-sustentaveis-e-resilientes`, elegibilidade: "Municípios e consórcios.", janela: SEL },
  { id: "novopac-encostas", area: "infraestrutura", nome: "Novo PAC — Contenção de encostas",
    objeto: "Obras de prevenção em áreas com risco recorrente de deslizamento", orgao: "Ministério das Cidades · Novo PAC",
    fonte: "Novo PAC Cidades Sustentáveis", link: `${NP}/cidades-sustentaveis-e-resilientes`, elegibilidade: "Municípios com áreas de risco mapeadas.", janela: SEL },
  { id: "novopac-mobilidade", area: "infraestrutura", nome: "Novo PAC — Mobilidade urbana",
    objeto: "Mobilidade urbana, travessias e vias municipais", orgao: "Ministério das Cidades · Novo PAC",
    fonte: "Novo PAC Transporte", link: `${NP}/transporte-eficiente-e-sustentavel`, elegibilidade: "Municípios; projetos de mobilidade.", janela: SEL },
  { id: "novopac-conectividade", area: "infraestrutura", nome: "Novo PAC — Inclusão digital e conectividade",
    objeto: "Banda larga e conectividade (escolas, equipamentos públicos)", orgao: "MCom · Novo PAC",
    fonte: "Novo PAC Conectividade", link: `${NP}/inclusao-digital-e-conectividade`, elegibilidade: "Municípios; prioriza áreas sem cobertura.", janela: SEL },
  // ===== CULTURA / ESPORTE =====
  { id: "novopac-ceu-cultura", area: "cultura", nome: "Novo PAC — CEUs da Cultura",
    objeto: "Centros de artes e esportes unificados (cultura, arte e cidadania)", orgao: "Ministério da Cultura · Novo PAC",
    fonte: "Novo PAC Infraestrutura Social", link: `${NP}/infraestrutura-social-inclusiva`, elegibilidade: "Municípios; equipamento cultural comunitário.", janela: SEL },
  { id: "novopac-arena-esporte", area: "cultura", nome: "Novo PAC — Arena Brasil (esporte)",
    objeto: "Centros esportivos comunitários (campo society, quadra, pista, parquinho)", orgao: "Ministério do Esporte · Novo PAC",
    fonte: "Novo PAC Infraestrutura Social", link: `${NP}/infraestrutura-social-inclusiva`, elegibilidade: "Municípios; equipamento esportivo de bairro.", janela: SEL },
  // ===== SEGURANÇA =====
  { id: "novopac-convive", area: "seguranca", nome: "Novo PAC — Centros Comunitários pela Vida (CONVIVE)",
    objeto: "Complexo com esporte, lazer e módulos de ensino p/ prevenção da violência", orgao: "Ministério da Justiça/Segurança · Novo PAC",
    fonte: "Novo PAC Infraestrutura Social", link: `${NP}/infraestrutura-social-inclusiva`, elegibilidade: "Municípios/territórios com prioridade de segurança cidadã.", janela: SEL },
  // ===== ASSISTÊNCIA SOCIAL =====
  { id: "suas-equipamentos", area: "assistencia", nome: "SUAS — Equipamentos de assistência social (CRAS/CREAS)",
    objeto: "Cofinanciamento e estruturação de CRAS, CREAS e unidades de acolhimento", orgao: "MDS · Fundo Nacional de Assistência Social",
    fonte: "MDS · SUAS", link: "https://www.gov.br/mds/pt-br", elegibilidade: "Municípios habilitados no SUAS; expansão/cofinanciamento por portaria do MDS.", janela: "Expansão/cofinanciamento por portaria do MDS — consultar portal" },
  { id: "suas-aceite-expansao", area: "assistencia", nome: "SUAS — Aceite de expansão/cofinanciamento (SUASWeb)",
    objeto: "Aceite de novos pisos e da expansão qualificada de serviços socioassistenciais (PSB/PSE) cofinanciados pelo FNAS", orgao: "MDS · Fundo Nacional de Assistência Social",
    fonte: "MDS · Rede SUAS / SUASWeb", link: "https://aplicacoes.mds.gov.br/suaswebcons/", elegibilidade: "Municípios habilitados no SUAS; o gestor confirma o aceite no SUASWeb quando o MDS abre a expansão por resolução do CNAS.", janela: "Aceite quando o MDS abre a expansão (resolução CNAS) — no SUASWeb (login do gestor)" },
  // Programas do MDS (assistência social / combate à fome) PLEITEÁVEIS pelo município — NÃO os benefícios individuais (Bolsa Família/BPC).
  { id: "mds-paa", area: "assistencia", nome: "PAA — Programa de Aquisição de Alimentos",
    objeto: "Compra de alimentos da agricultura familiar para abastecer a rede socioassistencial e de SAN (via adesão, sem licitação)", orgao: "MDS · SESAN",
    fonte: "MDS · Brasil Sem Fome", link: "https://www.gov.br/mds/pt-br/acoes-e-programas/paa", elegibilidade: "Municípios e consórcios públicos que aderirem ao Termo de Adesão do PAA.", janela: "Adesão/seleção por chamada pública do MDS — consultar portal" },
  { id: "mds-alimenta-cidades", area: "assistencia", nome: "Alimenta Cidades",
    objeto: "Estruturação de equipamentos públicos de SAN: bancos de alimentos, cozinhas comunitárias, restaurantes populares e feiras", orgao: "MDS · SESAN",
    fonte: "MDS · Brasil Sem Fome", link: "https://www.gov.br/mds/pt-br/acoes-e-programas/alimenta-cidades", elegibilidade: "Municípios selecionados por chamada/edital (prioridade a maior vulnerabilidade alimentar).", janela: "Por edital do MDS — consultar portal" },
  { id: "mds-cozinha-solidaria", area: "assistencia", nome: "Cozinha Solidária",
    objeto: "Implantação e custeio de cozinhas solidárias para refeições gratuitas a pessoas em insegurança alimentar", orgao: "MDS · SESAN",
    fonte: "MDS · Brasil Sem Fome", link: "https://www.gov.br/mds/pt-br/acoes-e-programas/cozinha-solidaria", elegibilidade: "Municípios e entidades por chamamento público.", janela: "Por chamamento do MDS — consultar portal" },
  { id: "mds-agricultura-urbana", area: "assistencia", nome: "Agricultura Urbana e Periurbana",
    objeto: "Apoio a hortas comunitárias, unidades de produção e cinturões verdes para SAN e geração de renda", orgao: "MDS · SESAN",
    fonte: "MDS · Brasil Sem Fome", link: "https://www.gov.br/mds/pt-br/acoes-e-programas/agricultura-urbana", elegibilidade: "Municípios por chamada pública/emenda.", janela: "Por chamada do MDS — consultar portal" },
  { id: "mds-acredita-1passo", area: "assistencia", nome: "Acredita — inclusão produtiva",
    objeto: "Inclusão produtiva e acompanhamento de famílias do CadÚnico (microcrédito, qualificação, intermediação de trabalho)", orgao: "MDS",
    fonte: "MDS · Acredita", link: "https://www.gov.br/mds/pt-br/acoes-e-programas/acredita", elegibilidade: "Municípios que aderirem; foco em famílias do CadÚnico/Bolsa Família.", janela: "Adesão/edital do MDS — consultar portal" },
  // Programas federais de larga adesão municipal (FNDE, Saúde, Cultura, Cidades)
  { id: "fnde-pnae", area: "educacao", nome: "PNAE — Alimentação Escolar",
    objeto: "Repasse federal para a alimentação dos alunos da educação básica (por aluno matriculado/censo escolar)", orgao: "MEC · FNDE",
    fonte: "FNDE · PNAE", link: "https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/pnae", elegibilidade: "Todos os municípios (transferência automática fundo-a-fundo, conforme matrículas).", janela: "Repasse automático ao longo do ano letivo" },
  { id: "fnde-pdde", area: "educacao", nome: "PDDE — Dinheiro Direto na Escola",
    objeto: "Recursos diretos às escolas para manutenção, pequenos investimentos e projetos pedagógicos", orgao: "MEC · FNDE",
    fonte: "FNDE · PDDE", link: "https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/pdde", elegibilidade: "Escolas públicas com unidade executora; municípios aderem pelo PDDEWeb.", janela: "Repasse anual (parcelas)" },
  { id: "fnde-transporte", area: "educacao", nome: "PNATE / Caminho da Escola — Transporte Escolar",
    objeto: "Custeio do transporte escolar (PNATE) e financiamento de veículos escolares (Caminho da Escola)", orgao: "MEC · FNDE",
    fonte: "FNDE · Transporte Escolar", link: "https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/caminho-da-escola", elegibilidade: "Municípios com alunos da rede pública usuários de transporte escolar.", janela: "PNATE automático; veículos por adesão/pregão FNDE" },
  { id: "ms-farmacia-popular", area: "saude", nome: "Farmácia Popular do Brasil",
    objeto: "Acesso a medicamentos essenciais gratuitos ou com baixo custo via rede credenciada", orgao: "Ministério da Saúde",
    fonte: "MS · Farmácia Popular", link: "https://www.gov.br/saude/pt-br/composicao/sectics/farmacia-popular", elegibilidade: "Adesão de farmácias/drogarias; a gestão municipal articula a rede.", janela: "Credenciamento contínuo" },
  { id: "ms-samu", area: "saude", nome: "SAMU 192 — Urgência e Emergência",
    objeto: "Implantação e custeio federal do atendimento móvel de urgência (SAMU 192)", orgao: "Ministério da Saúde",
    fonte: "MS · SAMU", link: "https://www.gov.br/saude/pt-br/composicao/saes/samu-192", elegibilidade: "Municípios/regiões de saúde habilitados, conforme pactuação na CIB.", janela: "Habilitação por portaria do MS" },
  { id: "cultura-aldir-blanc", area: "cultura", nome: "Política Nacional Aldir Blanc (PNAB)",
    objeto: "Transferência federal anual para fomento à cultura (editais, prêmios, espaços e fazedores de cultura)", orgao: "Ministério da Cultura",
    fonte: "MinC · PNAB", link: "https://www.gov.br/cultura/pt-br/assuntos/pnab", elegibilidade: "Municípios com plano e órgão/conselho de cultura aptos a executar.", janela: "Repasse anual; execução por editais locais" },
  { id: "cidades-avancar", area: "infraestrutura", nome: "Avançar Cidades — Mobilidade Urbana",
    objeto: "Financiamento de mobilidade urbana: pavimentação, drenagem, vias, transporte e qualificação viária", orgao: "Min. das Cidades · Caixa",
    fonte: "Min. das Cidades", link: "https://www.gov.br/cidades/pt-br/assuntos/mobilidade-urbana", elegibilidade: "Municípios com capacidade de endividamento (operação de crédito) ou via OGU.", janela: "Seleção por chamamento/edital" },
];

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  await db.query(`CREATE TABLE IF NOT EXISTS programas_federais_sc (
    id TEXT PRIMARY KEY, area TEXT NOT NULL, nome TEXT NOT NULL, objeto TEXT, orgao TEXT,
    fonte TEXT, link TEXT, elegibilidade TEXT, janela TEXT, atualizado_em timestamptz DEFAULT now())`);
  for (const p of PROGRAMAS) {
    await db.query(`INSERT INTO programas_federais_sc (id,area,nome,objeto,orgao,fonte,link,elegibilidade,janela,atualizado_em)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      ON CONFLICT (id) DO UPDATE SET area=EXCLUDED.area, nome=EXCLUDED.nome, objeto=EXCLUDED.objeto, orgao=EXCLUDED.orgao,
        fonte=EXCLUDED.fonte, link=EXCLUDED.link, elegibilidade=EXCLUDED.elegibilidade, janela=EXCLUDED.janela, atualizado_em=now()`,
      [p.id, p.area, p.nome, p.objeto, p.orgao, p.fonte, p.link, p.elegibilidade, p.janela]);
  }
  const r = (await db.query(`SELECT area, count(*) n FROM programas_federais_sc GROUP BY 1 ORDER BY 1`)).rows;
  console.log(`programas_federais_sc: ${PROGRAMAS.length} registrados · ${r.map((x) => `${x.area}=${x.n}`).join(" · ")}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
