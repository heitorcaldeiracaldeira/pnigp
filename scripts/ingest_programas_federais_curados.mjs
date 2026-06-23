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
  // ===== EDUCAÇÃO =====
  { id: "novopac-educacao", area: "educacao", nome: "Novo PAC — Educação básica (creches e escolas)",
    objeto: "Construção de creches, pré-escolas e escolas de ensino fundamental e médio", orgao: "MEC · FNDE · Novo PAC",
    fonte: "Novo PAC Educação", link: `${NP}/educacao-ciencia-e-tecnologia`, elegibilidade: "Municípios com demanda de vagas; ingresso por seleção do Novo PAC.", janela: SEL },
  { id: "fnde-proinfancia", area: "educacao", nome: "Proinfância (FNDE)",
    objeto: "Construção e equipamento de creches e pré-escolas (educação infantil)", orgao: "FNDE",
    fonte: "FNDE · Proinfância (PAR/SIMEC)", link: "https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/proinfancia", elegibilidade: "Demanda mínima por Censo + terreno municipal regularizado; adesão via PAR no SIMEC.", janela: "Adesão por ciclo do PAR (SIMEC) — consultar portal" },
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
