// ORQUESTRADOR de coleta — detecta novidade por fonte e roda só os ETLs devidos (incremental,
// idempotente, serial por API). Grava estado em etl_catalogo. node scripts/etl_orquestrador.mjs
//   MODO=plan (padrão) → só detecta e reporta o que está pendente, sem rodar.
//   MODO=run           → detecta e executa os ETLs devidos.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import { spawn, execSync } from "child_process"; import pg from "pg";
import { pegaTrava } from "./trava_processo.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const MODO = process.env.MODO || "plan";
const HOJE = new Date();
const ANO_FECHADO = HOJE.getFullYear() - 1;      // último exercício fechado
const ANO_CORRENTE = HOJE.getFullYear();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const log = (m) => process.stdout.write(`[ORQ ${new Date().toISOString().slice(11, 19)}] ${m}\n`);

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true, query_timeout: 60000, statement_timeout: 60000 });
db.on("error", () => {});
const maxAno = async (tab, col = "ano") => { try { return Number((await db.query(`SELECT max(${col}) m FROM ${tab}`)).rows[0]?.m) || 0; } catch { return 0; } };
const diasDesde = (ts) => (ts ? (Date.now() - new Date(ts).getTime()) / 86400000 : 9999);

// CATÁLOGO — cada fonte: id, label, api (serializa por grupo), script+env, e o detector "devido?"
const FONTES = [
  { id: "financas", label: "Finanças (SICONFI RREO an.1/2)", api: "siconfi", script: "scripts/ingest_sc.mjs", env: { ANOS: `${ANO_FECHADO},${ANO_CORRENTE}` },
    devido: async (st) => (await maxAno("financas_sc")) < ANO_FECHADO || diasDesde(st?.ultima_exec) > 35 },
  { id: "metas", label: "Metas Fiscais LDO (RREO an.6)", api: "siconfi", script: "scripts/ingest_metas_fiscais_sc.mjs", env: { ANOS: `${ANO_FECHADO},${ANO_CORRENTE}` },
    devido: async () => (await maxAno("metas_fiscais_sc")) < ANO_FECHADO },
  { id: "desp_subfuncao", label: "Despesa por subfunção (RREO an.2 — drill)", api: "siconfi", script: "scripts/ingest_despesa_subfuncao_sc.mjs", env: {},
    devido: async () => (await maxAno("despesa_subfuncao_sc")) < ANO_FECHADO },
  { id: "receitas_det", label: "Receitas detalhadas (ICMS/FPM/IPTU/FUNDEB — RREO an.3)", api: "siconfi", script: "scripts/ingest_receitas_detalhe_sc.mjs", env: {},
    devido: async () => (await maxAno("receitas_detalhe_sc")) < ANO_FECHADO },
  { id: "rreo_const", label: "Educação/RCL (RREO an.14/3)", api: "siconfi", script: "scripts/ingest_rreo_constitucional_sc.mjs", env: {},
    devido: async () => (await maxAno("rreo_const_sc")) < ANO_FECHADO },
  { id: "rgf", label: "Pessoal/DCL (RGF)", api: "siconfi", script: "scripts/ingest_rgf_sc.mjs", env: {},
    devido: async () => (await maxAno("rgf_sc")) < ANO_FECHADO },
  { id: "rpps", label: "Previdência RPPS (RREO Anexo 04)", api: "siconfi", script: "scripts/ingest_rpps_sc.mjs", env: {},
    devido: async () => (await maxAno("rpps_sc")) < ANO_FECHADO },
  { id: "rpps_atuarial", label: "Déficit atuarial RPPS (CADPREV/DRAA)", api: "cadprev", script: "scripts/ingest_rpps_atuarial_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 60 }, // DRAA anual
  { id: "pdde", label: "PDDE por município (FNDE — Plataforma Antonieta de Barros)", api: "fnde", script: "scripts/ingest_pdde_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 60 }, // execução PDDE anual
  { id: "pnld", label: "PNLD reserva técnica — demanda de livros (FNDE — Antonieta de Barros)", api: "fnde", script: "scripts/ingest_pnld_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // reserva técnica muda no ciclo
  { id: "acesso_financeiro", label: "Sistema financeiro por município (BCB Olinda — agências/cooperativas/correspondentes + Pix série)", api: "bcb", script: "scripts/ingest_acesso_financeiro_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 28 }, // posição mensal do BCB
  { id: "estban", label: "ESTBAN — volumes bancários por município (BCB, crédito/poupança, série)", api: "bcb", script: "scripts/ingest_estban_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 28 }, // ESTBAN mensal (lag ~3 meses)
  { id: "bndes", label: "BNDES desembolsos por município (crédito produtivo, série 1995+)", api: "bndes", script: "scripts/ingest_bndes_sc.mjs", env: {},
    devido: async (st) => (await maxAno("bndes_sc")) < ANO_CORRENTE || diasDesde(st?.ultima_exec) > 60 },
  { id: "cfem", label: "CFEM — royalties de mineração por município (ANM, distribuição)", api: "anm", script: "scripts/ingest_cfem_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 180 }, // distribuição pública estável (até 2020)
  { id: "queimadas", label: "Focos de calor por município (INPE BDQueimadas, mensal)", api: "inpe", script: "scripts/ingest_queimadas_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 15 }, // focos mensais
  { id: "anp", label: "Preços de combustíveis por município (ANP, semestral, série 2004+)", api: "anp", script: "scripts/ingest_anp_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 365 }, // série histórica estável (até 2021 neste path)
  { id: "bolsa_atleta", label: "Bolsa Atleta por município (Min. Esporte — atletas + valor)", api: "esporte", script: "scripts/ingest_bolsa_atleta_sc.mjs", env: {},
    devido: async (st) => (await maxAno("bolsa_atleta_sc")) < ANO_CORRENTE || diasDesde(st?.ultima_exec) > 60 },
  // O ano que falta só chega quando o IBGE publica, e isso não depende de insistir: a condição antiga
  // (max_ano < ANO_FECHADO-1) era VERDADE PERMANENTE enquanto o Registro Civil não publicasse o ano
  // seguinte, então esta fonte se declarava vencida em TODA rodada, todo dia, para sempre. Agora a
  // perseguição do ano novo tem cadência mensal; o resto segue a cadência semestral da fonte.
  { id: "estatisticas_vitais", label: "Estatísticas vitais por município (IBGE Registro Civil — nascidos/óbitos, série)", api: "sidra", script: "scripts/ingest_estatisticas_vitais_sc.mjs", env: {},
    devido: async (st) => ((await maxAno("estatisticas_vitais_sc")) < ANO_FECHADO - 1 && diasDesde(st?.ultima_exec) > 30) || diasDesde(st?.ultima_exec) > 180 },
  { id: "ans_cobertura", label: "Cobertura de planos de saúde por município (ANS — pressão sobre o SUS)", api: "ans", script: "scripts/ingest_ans_cobertura_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "caged", label: "Saldo de empregos formais por município (Novo CAGED/MTE, mensal)", api: "mte", script: "scripts/ingest_caged_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // CAGED mensal (lag ~2 meses); ajustar MESES no env
  { id: "rais", label: "RAIS — estoque de emprego formal por município (MTE, anual)", api: "mte", script: "scripts/ingest_rais_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 180 },
  { id: "prodes", label: "Desmatamento PRODES por município (INPE, interseção PostGIS)", api: "inpe", script: "scripts/ingest_prodes_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 120 },
  { id: "desastres", label: "Desastres S2ID por município (Atlas Digital CEPED-UFSC/MIDR, série 1991+)", api: "atlas", script: "scripts/ingest_desastres_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "sinisa", label: "Saneamento SINISA por município (água/esgoto/resíduos, Min. Cidades, ref 2024)", api: "cidades", script: "scripts/ingest_sinisa_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 180 },
  { id: "sinan_dengue", label: "Dengue por município (SINAN via InfoDengue, série + incidência)", api: "infodengue", script: "scripts/ingest_sinan_dengue_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 14 },
  { id: "aneel_gd", label: "Geração distribuída de energia por município (ANEEL, série)", api: "aneel", script: "scripts/ingest_aneel_gd_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "anatel_bl", label: "Banda larga fixa por município (ANATEL, série 2007+)", api: "anatel", script: "scripts/ingest_anatel_bl_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "senatran_frota", label: "Frota de veículos por município (SENATRAN)", api: "senatran", script: "scripts/ingest_senatran_frota_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 45 },
  { id: "pronaf", label: "PRONAF crédito agricultura familiar (BCB SICOR — servidor instável, retry)", api: "sicor", script: "scripts/ingest_pronaf_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 3 },
  { id: "ibama_autos", label: "Autos de infração ambiental por município (IBAMA, série 1990+)", api: "ibama", script: "scripts/ingest_ibama_autos_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "sinesp", label: "Vítimas de crimes violentos letais por município (SINESP/MJSP, dados abertos)", api: "sinesp", script: "scripts/ingest_sinesp_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "incra_assentamentos", label: "Assentamentos reforma agrária por município (INCRA/MDA SIPRA)", api: "incra", script: "scripts/ingest_incra_assentamentos_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "icmbio_uc", label: "Unidades de conservação por município (MMA CNUC, interseção PostGIS)", api: "cnuc", script: "scripts/ingest_icmbio_uc_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 120 },
  { id: "ana_outorgas", label: "Outorgas de uso da água por município (ANA, finalidade+série)", api: "ana", script: "scripts/ingest_ana_outorgas_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "ibge_producao", label: "Produção agropecuária (PAM/PPM) + empresas (CEMPRE) por município (IBGE SIDRA)", api: "sidra", script: "scripts/ingest_ibge_producao_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 180 },
  { id: "arboviroses", label: "Arboviroses (dengue/zika/chikungunya) por município (InfoDengue/SINAN)", api: "infodengue", script: "scripts/ingest_arboviroses_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 14 },
  { id: "datatran", label: "Acidentes em rodovias federais por município (PRF DATATRAN, série 2015+)", api: "prf", script: "scripts/ingest_datatran_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "anp_vendas", label: "Vendas de combustíveis por município (ANP, série 1990+)", api: "anp", script: "scripts/ingest_anp_vendas_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "capag", label: "CAPAG capacidade de pagamento por município (STN/Tesouro)", api: "tesouro", script: "scripts/ingest_capag_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "rfb_arrecadacao", label: "Arrecadação federal por município (RFB, série 2019+)", api: "rfb", script: "scripts/ingest_rfb_arrecadacao_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "sim", label: "Óbitos por município (DATASUS SIM, descompressor DBC próprio)", api: "datasus", script: "scripts/ingest_datasus_sim_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "sia_producao", label: "Produção ambulatorial SUS por complexidade (DATASUS SIA + SIGTAP)", api: "datasus", script: "scripts/ingest_sia_producao_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "medicamentos_alto_custo", label: "Medicamentos de alto custo CEAF por município (SIA grupo 06)", api: "datasus", script: "scripts/ingest_medicamentos_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "cnes_equipes", label: "Equipes de saúde (ESF) por município/estabelecimento (CNES EP)", api: "datasus", script: "scripts/ingest_cnes_equipes_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 45 },
  { id: "cnes_equipamentos", label: "Equipamentos médicos por estabelecimento (CNES EQ)", api: "datasus", script: "scripts/ingest_cnes_equipamentos_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 45 },
  { id: "cnes_leitos", label: "Leitos hospitalares por estabelecimento (CNES LT)", api: "datasus", script: "scripts/ingest_cnes_leitos_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 45 },
  { id: "cnes_profissionais", label: "Profissionais de saúde por município/estabelecimento (CNES PF)", api: "datasus", script: "scripts/ingest_cnes_profissionais_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 45 },
  { id: "apac", label: "APAC oncologia e diálise por município (SIA-APAC)", api: "datasus", script: "scripts/ingest_apac_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "raas_saude_mental", label: "Saúde mental CAPS/RAAS por município (SIA-RAAS-PS)", api: "datasus", script: "scripts/ingest_raas_saude_mental_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "cobertura_vacinal", label: "Cobertura vacinal SÉRIE 2015-2026 por município/vacina (SI-PNI LocalizaSUS, engine Qlik set-analysis)", api: "localizasus", script: "scripts/ingest_cobertura_vacinal_final.mjs", env: { CSV: "scripts/_dados/cobertura_vacinal_moderna_sc.csv" }, devido: async (st) => diasDesde(st?.ultima_exec) > 120 },
  { id: "sinan_agravos", label: "Agravos de notificação SINAN por município (tuberculose/hanseníase/violência)", api: "datasus", script: "scripts/ingest_sinan_agravos_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "sinasc", label: "Nascimentos por município (DATASUS SINASC DBC)", api: "datasus", script: "scripts/ingest_datasus_sinasc_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "sih", label: "Internações SUS por município (DATASUS SIH DBC mensal)", api: "datasus", script: "scripts/ingest_datasus_sih_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "producao_aps", label: "Produção da APS (SISAB — fichas aprovadas, série mensal 2021+)", api: "sisab", script: "scripts/etl_producao_aps.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 28 }, // SISAB mensal, retroativo ~4 competências
  { id: "indicadores_previne", label: "Indicadores Previne + ISF (SISAB indicadorPainel — 10 quadrimestres)", api: "sisab", script: "scripts/etl_indicadores_previne.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 180 }, // Previne descontinuado; base histórica congelada
  { id: "qualidade_siaps", label: "Qualidade (15 indicadores) + Vínculo/CVAT — novo cofinanciamento (SIAPS)", api: "siaps", script: "scripts/etl_qualidade_siaps.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // novo quadrimestre aparece + recálculo
  { id: "igdm", label: "IGD-M gestão PBF/CadÚnico por município (MDS/SAGI Solr)", api: "mds", script: "scripts/ingest_igdm_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "suas_saldo", label: "SUAS repasse+SALDO na mesa por município (MDS/SAGI Solr) — recurso não usado", api: "mds", script: "scripts/ingest_suas_saldo_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 28 }, // Solr mensal
  { id: "pdde_saldo", label: "PDDE saldo parado (verba escolar não executada) por município (FNDE Antonieta de Barros)", api: "fnde", script: "scripts/ingest_pdde_saldo_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "pnae_agri", label: "PNAE % agricultura familiar (mínimo legal 30%) por município (FNDE)", api: "fnde", script: "scripts/ingest_pnae_agri_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 120 },
  { id: "barragens", label: "Barragens por município (ANA/SNISB — dano potencial + risco)", api: "ana", script: "scripts/ingest_barragens_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "paa", label: "PAA compras agricultura familiar por município (Conab)", api: "conab", script: "scripts/ingest_paa_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "lpg", label: "Lei Paulo Gustavo execução/saldo por município (MinC)", api: "cultura", script: "scripts/ingest_lpg_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 45 },
  { id: "salic", label: "Lei Rouanet SALIC — aprovado/captado por município (MinC)", api: "cultura", script: "scripts/ingest_salic_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "obras", label: "Obras por município — detalhe (ObrasGov)", api: "obrasgov", script: "scripts/ingest_obras_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "novopac", label: "Novo PAC obras por município (ObrasGov/Casa Civil)", api: "obrasgov", script: "scripts/ingest_novopac_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "censo_corraca", label: "População por cor/raça Censo 2022 (IBGE SIDRA 9605)", api: "ibge", script: "scripts/ingest_censo_corraca_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 365 },
  { id: "populacao_faixa", label: "População por faixa etária Censo 2022 + idosos/dependência (IBGE SIDRA 9514)", api: "ibge", script: "scripts/ingest_populacao_faixa_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 365 },
  { id: "pib_municipal", label: "PIB municipal preços correntes + per capita (IBGE SIDRA 5938)", api: "ibge", script: "scripts/ingest_pib_municipal_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 180 },
  { id: "idhm", label: "IDHM + subíndices por município (Atlas Brasil PNUD, Censo 2010)", api: "atlasbrasil", script: "scripts/ingest_idhm_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 365 },
  { id: "cemaden", label: "Estações de monitoramento de risco CEMADEN por município (defesa civil)", api: "cemaden", script: "scripts/ingest_cemaden_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "domicilios", label: "Domicílios + densidade domiciliar Censo 2022 (IBGE SIDRA 4712)", api: "ibge", script: "scripts/ingest_domicilios_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 365 },
  { id: "ranking_tesouro", label: "Ranking da Qualidade da Informação Fiscal (Tesouro) por município", api: "tesouro", script: "scripts/ingest_ranking_tesouro_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "escola_turmas", label: "Número de turmas por etapa/rede (INEP Censo Escolar)", api: "inep", script: "scripts/ingest_escola_turmas_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 365 },
  { id: "evasao_escolar", label: "Taxa de evasão por etapa (INEP Fluxo/Transição)", api: "inep", script: "scripts/ingest_evasao_escolar_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 365 },
  { id: "salario_educacao", label: "Salário-Educação por município (SICONFI DCA)", api: "siconfi", script: "scripts/ingest_salario_educacao_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 180 },
  { id: "saeb", label: "SAEB proficiência Port/Mat por etapa (INEP)", api: "inep", script: "scripts/ingest_saeb_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 365 },
  { id: "cnpj_municipal", label: "CNPJs do governo municipal (SICONFI+órgãos+RPPS)", api: "siconfi", script: "scripts/ingest_cnpj_municipal_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 180 },
  { id: "transferencias_cgu", label: "Transferências federais à prefeitura (CGU download em massa)", api: "cgu", script: "scripts/ingest_transferencias_cgu_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "alfabetizacao", label: "Taxa de alfabetização 15+ Censo 2022 (IBGE SIDRA 9543)", api: "ibge", script: "scripts/ingest_alfabetizacao_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 365 },
  { id: "setores", label: "Setores censitários Censo 2022 — perfil intraurbano (IBGE FTP)", api: "ibge", script: "scripts/ingest_setores_sc.mjs", env: {}, devido: async () => false },
  { id: "setores_geo", label: "Malha (polígonos) dos setores → mapa choropleth (IBGE GPKG)", api: "ibge", script: "scripts/ingest_setores_geo_sc.mjs", env: {}, devido: async () => false },
  { id: "setores_idade", label: "% idosos por setor censitário → variável do mapa intraurbano (IBGE demografia)", api: "ibge", script: "scripts/ingest_setores_idade_sc.mjs", env: {}, devido: async () => false },
  { id: "setores_criancas", label: "% crianças 0-14 por setor → variável do mapa intraurbano (IBGE demografia)", api: "ibge", script: "scripts/ingest_setores_criancas_sc.mjs", env: {}, devido: async () => false },
  { id: "museus", label: "Museus por município (IBRAM MuseusBr)", api: "ibram", script: "scripts/ingest_museus_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "ibama_embargos", label: "Áreas embargadas por município (IBAMA CSV)", api: "ibama", script: "scripts/ingest_ibama_embargos_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "quilombos", label: "Comunidades quilombolas certificadas por município (Palmares)", api: "cultura", script: "scripts/ingest_quilombos_sc.mjs", env: {}, devido: async (st) => diasDesde(st?.ultima_exec) > 180 },
  { id: "equipamentos_esporte", label: "Equipamentos esportivos georreferenciados (OSM — mapa camada Esporte)", api: "osm", script: "scripts/ingest_equipamentos_esporte_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "censo_especial", label: "Educação especial/AEE por município (INEP Censo microdata)", api: "inep", script: "scripts/ingest_censo_especial_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 90 },
  { id: "fundeb_oficial", label: "Matrículas FUNDEB oficiais (FNDE Antonieta de Barros)", api: "fnde", script: "scripts/ingest_fundeb_oficial_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "fundeb_parametros", label: "Parâmetros FUNDEB — fatores/VAAT/VAAR (FNDE)", api: "fnde", script: "scripts/ingest_fundeb_parametros.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "indicadores_inep", label: "Indicadores educacionais INEP (AFD/TDI/ATU/rendimento por município)", api: "inep", script: "scripts/ingest_indicadores_inep_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 120 },
  { id: "indicadores_inep_escola", label: "Indicadores INEP por escola (georreferenciado)", api: "inep", script: "scripts/ingest_indicadores_inep_escola_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 120 },
  { id: "rpps_crp", label: "Regularidade previdenciária CRP (CADPREV — Consulta Pública)", api: "cadprev", script: "scripts/ingest_rpps_crp.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 10 }, // CRP muda com frequência (validade/emissão)
  { id: "cadprev_full", label: "Espelho completo CADPREV (37 recursos: DAIR/DIPR/DRAA/RPPS_*)", api: "cadprev", script: "scripts/ingest_cadprev.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // mirror amplo; recoleta mensal
  { id: "crp_alertas", label: "Alertas de CRP (transições vencido/a vencer — varredura)", api: "cadprev", script: "scripts/alerta_crp.mjs", env: {},
    // roda após o CRP atualizar (re-detecta transições) OU semanalmente (dias passam → categorias mudam sozinhas)
    devido: async (st) => {
      const last = st?.ultima_exec ? new Date(st.ultima_exec).getTime() : 0;
      const dep = (await db.query(`SELECT ultima_exec FROM etl_catalogo WHERE id='rpps_crp'`).catch(() => ({ rows: [] }))).rows[0];
      const crpMaisNovo = dep?.ultima_exec && new Date(dep.ultima_exec).getTime() > last;
      return crpMaisNovo || diasDesde(st?.ultima_exec) > 7;
    } },
  { id: "siops", label: "Saúde ASPS (SIOPS)", api: "siops", script: "scripts/ingest_siops_sc.mjs", env: {},
    devido: async () => (await maxAno("siops_sc")) < ANO_FECHADO },
  // DERIVADA (Lei 1): compras_sc é função pura do espelho (contratacoes_sc) — reconstrói em segundos, sem re-fetch do
  // PNCP. Re-deriva quando o espelho mudou (evento→flag→re-deriva a fatia), não por varredura. Mata o REFRESH full antigo.
  { id: "compras", label: "Compras por ente/ano — DERIVADA do espelho (contratacoes_sc, sem re-fetch)", api: "derivado", script: "scripts/build_compras_sc.mjs", env: {},
    devido: async (st) => { const m = (await db.query(`SELECT max(atualizado) x FROM contratacoes_sc`).catch(() => ({ rows: [{}] }))).rows[0]?.x; return !st?.ultima_exec || (!!m && new Date(m) > new Date(st.ultima_exec)); } },
  // ═══ PIPELINE DE EVENTOS (PNCP-como-log): produtor → consumidor → re-deriva a fatia. Cada peça dispara do estado da fila. ═══
  // 1) INCREMENTAL — /contratacoes/atualizacao + /historico dizem O QUE mudou → enchem a fila pncp_evento (~1.000/dia, não 1,2M).
  { id: "incremental", label: "Coleta incremental PNCP — o que mudou (enche a fila de eventos)", api: "pncp", script: "scripts/coleta_incremental_pncp.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) >= 1 },
  // 2) CONSUMIDOR DO DADO — aplica cada evento à FATIA do espelho (item/resultado/contratação; invalida ata excluída).
  { id: "eventos_dado", label: "Consumo de eventos → espelho (a fatia que o evento aponta)", api: "pncp", script: "scripts/consome_evento_dado.mjs", env: { LOTE: "300" },
    devido: async () => Number((await db.query(`SELECT count(*) n FROM pncp_evento WHERE consumido_dado IS NULL`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) > 0 },
  // 3) RE-DERIVA A FATIA — só os entes que mudaram → compras_sc + andamento (não reconstrói os 295 municípios).
  { id: "rederiva", label: "Re-derivação por fatia (evento → derivadas do ente)", api: "derivado", script: "scripts/rederiva_fatia.mjs", env: {},
    devido: async () => Number((await db.query(`SELECT count(*) n FROM pncp_evento WHERE consumido_dado IS NOT NULL AND consumido_derivado IS NULL`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) > 0 },
  { id: "contratos", label: "Contratos (PNCP ano corrente, append)", api: "pncp", script: "scripts/ingest_contratos_sc.mjs", env: { APPEND: "1", ANOS: String(ANO_CORRENTE), REFRESH: "1" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 25 },
  { id: "pca", label: "PCA (PNCP)", api: "pncp", script: "scripts/ingest_pca_sc.mjs", env: { ANOS: `${ANO_CORRENTE},${ANO_CORRENTE + 1}` },
    devido: async (st) => diasDesde(st?.ultima_exec) > 35 },
  { id: "processos", label: "Contratações PNCP — TODAS (entidade Contratação espelhando o PNCP: modalidade/plataforma/SRP/estimado×homologado; via bulk por data)", api: "pncp", script: "scripts/ingest_contratacoes_sc.mjs", env: { ANO_INI: "2021", ANO_FIM: String(ANO_CORRENTE) },
    devido: async (st) => diasDesde(st?.ultima_exec) > 20 }, // NB: resumível por janela; refetch incremental de meses recentes = pendente (junto da reescrita da coleta diária)
  { id: "itens", label: "Itens de TODOS os processos (preço unitário)", api: "pncp", script: "scripts/ingest_itens_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 20 },
  { id: "catalogo_govbr", label: "Catálogo oficial CATMAT/CATSER (Compras.gov.br) — espinha de classificação", api: "compras", script: "scripts/ingest_catalogo_govbr_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // catálogo muda raramente
  { id: "classificacao_itens", label: "Classificação dos itens → CATMAT/CATSER (dicionário, matcher v2)", api: "pncp", script: "scripts/ingest_classificacao_itens_sc.mjs", env: {},
    // DEPENDÊNCIA: re-classifica sempre que 'itens' ou 'catalogo_govbr' rodarem depois dela (ou a cada 30d)
    devido: async (st) => {
      const last = st?.ultima_exec ? new Date(st.ultima_exec).getTime() : 0;
      const dep = (await db.query(`SELECT ultima_exec FROM etl_catalogo WHERE id IN ('itens','catalogo_govbr')`).catch(() => ({ rows: [] }))).rows;
      const algumMaisNovo = dep.some((d) => d.ultima_exec && new Date(d.ultima_exec).getTime() > last);
      return algumMaisNovo || diasDesde(st?.ultima_exec) > 30;
    } },
  { id: "indicadores", label: "Indicadores (IBGE/CGU)", api: "ibge", script: "scripts/ingest_indicadores_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 60 },
  { id: "geo_entes", label: "Georreferência dos entes (centroide/área/região — IBGE malhas; base p/ frete e variação de preço)", api: "ibge", script: "scripts/ingest_geo_entes_sc.mjs", env: {},
    // dispara quando há ente sem coordenada (estado novo ingerido) ou anualmente (limites mudam raríssimo)
    devido: async (st) => {
      const faltam = Number((await db.query(`SELECT count(*) n FROM entes_sc WHERE latitude IS NULL`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);
      return faltam > 0 || diasDesde(st?.ultima_exec) > 300;
    } },
  { id: "transferencias", label: "Transferências (CGU)", api: "cgu", script: "scripts/ingest_transferencias_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "cnes", label: "CNES — rede de saúde (Min. Saúde)", api: "cnes", script: "scripts/ingest_cnes_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // competência mensal
  { id: "sih", label: "SIH — produção hospitalar (DATASUS)", api: "datasus", script: "scripts/ingest_sih_sc.mjs", env: { ANOS: `${ANO_FECHADO},${ANO_CORRENTE}` },
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // competência mensal (TabNet)
  { id: "sia", label: "SIA — produção ambulatorial (DATASUS)", api: "datasus", script: "scripts/ingest_sia_sc.mjs", env: { ANOS: `${ANO_FECHADO},${ANO_CORRENTE}` },
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "previne", label: "Previne Brasil — indicadores APS (SISAB)", api: "datasus", script: "scripts/ingest_previne_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 40 }, // quadrimestral
  { id: "indigena", label: "População indígena (IBGE Censo 2022)", api: "ibge", script: "scripts/ingest_indigena_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 300 }, // censitário (decenal)
  { id: "fns", label: "Repasses federais FNS por bloco (Consulta Consolidada)", api: "fns", script: "scripts/ingest_fns_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // repasses mensais; ano corrente cresce
  { id: "cnpj_loc", label: "Localidade dos fornecedores (CNPJ→UF/município)", api: "receita", script: "scripts/ingest_cnpj_loc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 20 }, // novos fornecedores a cada coleta de contratos/itens
  { id: "empenhos", label: "Empenhos por contrato (PNCP Lei 14.133 — acende quando publicarem)", api: "pncp", script: "scripts/ingest_empenhos_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 15 }, // recheca contratos recentes; cobertura hoje ~0
  { id: "atas", label: "Atas de Registro de Preço (PNCP Consulta)", api: "pncp", script: "scripts/ingest_atas_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 20 },
  { id: "nf", label: "Notas fiscais / instrumentos de cobrança (PNCP — acende quando publicarem)", api: "pncp", script: "scripts/ingest_nf_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 15 }, // cobertura SC hoje ~0
  { id: "iegm", label: "IEGM — qualidade da gestão (TCE-SC/IRB, dados abertos)", api: "irb", script: "scripts/ingest_iegm_sc.mjs", env: {},
    devido: async () => (await maxAno("iegm_sc")) < ANO_FECHADO-1 },
  { id: "cauc", label: "Regularidade fiscal CAUC/CADIN (Tesouro)", api: "tesouro", script: "scripts/ingest_cauc_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 7 }, // atualizado diariamente — recoleta semanal
  { id: "ideb", label: "IDEB — indicadores educacionais (INEP)", api: "inep", script: "scripts/ingest_ideb_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 300 }, // bienal
  { id: "censo", label: "Censo Escolar — matrículas (INEP Sinopse)", api: "inep", script: "scripts/ingest_censo_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 300 }, // anual
  { id: "programas_transferegov", label: "Radar de Captação — programas + planos (Transferegov fundo a fundo, API viva)", api: "transferegov", script: "scripts/ingest_transferegov_api.mjs", env: { UF: "SC" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 0.9 }, // janelas de proposta abrem/fecham — recoleta DIÁRIA
  { id: "programas_agil", label: "Catálogo de programas Transferegov — gestão ágil (fundoafundo/programa_gestao_agil); complementa o catálogo unificado de 335 programas", api: "transferegov", script: "scripts/ingest_programas_agil.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM programas_transferegov WHERE modalidade='GESTAO_AGIL'`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 0.9 }, // Transferegov ágil — DIÁRIO
  { id: "fnde_simad", label: "FNDE liberações por município (SIMAD, Playwright)", api: "inep", script: "scripts/ingest_fnde_simad.mjs", env: { UF: "SC" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 60 }, // browser-only; recoleta esparsa
  { id: "escolas", label: "Escolas por município + infraestrutura (INEP Censo Escolar)", api: "inep", script: "scripts/ingest_escolas_sc.mjs", env: { ANO: "2025" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 300 }, // anual
  { id: "cnes_estab", label: "Estabelecimentos de saúde por município (CNES — rede p/ regulação, API DEMAS)", api: "datasus", script: "scripts/ingest_cnes_estab_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 45 }, // CNES atualiza mensalmente
  { id: "emendas", label: "Emendas — INDICAÇÃO (SICONV/Transferegov, repositório detru: parlamentar, impositivo, valor destinado)", api: "transferegov", script: "scripts/ingest_emendas_siconv_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  { id: "emendas_exec", label: "Emendas — EXECUÇÃO orçamentária federal (Portal da Transparência: empenhado×pago → recurso na mesa)", api: "transferegov", script: "scripts/ingest_emendas_sc.mjs", env: { ANO_INI: "2020", ANO_FIM: "2026" },
    // emendas_check pula anos já coletados; p/ atualizar a execução do ano corrente, limpar a linha do ano em emendas_check
    devido: async (st) => diasDesde(st?.ultima_exec) > 15 },
  { id: "siop_acoes", label: "Catálogo de Ações Orçamentárias Federais (SIOP dados abertos) — o que emenda financia por setor; cruza com acao_orcamentaria da indicação", api: "siop", script: "scripts/ingest_siop_acoes.mjs", env: { EXERCICIO: String(ANO_FECHADO) },
    // catálogo anual; CSV do ano novo demora a sair (fallback p/ ano anterior no coletor). Recoleta trimestral.
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM siop_acoes`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 90 },
  { id: "programa_beneficiario", label: "Elegibilidade dos programas (Transferegov: quem pode captar cada programa — base do casamento oportunidade×necessidade)", api: "transferegov", script: "scripts/ingest_programa_beneficiario_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 15 }, // muda quando abre/fecha janela ou muda o grupo elegível
  { id: "programas_federais", label: "Programas federais curados de saúde/educação (Novo PAC, Requalifica UBS, Proinfância — casamento com carência; FNS/FNDE sem feed)", api: "transferegov", script: "scripts/ingest_programas_federais_curados.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // registro curado — revisar conforme portarias
  { id: "suas", label: "Assistência social / FNAS por município (MDS · MI Social/CadSUAS: CRAS, CREAS — déficit p/ casamento)", api: "transferegov", script: "scripts/ingest_suas_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // Censo SUAS/CadSUAS atualiza periodicamente
  { id: "assistencia_social", label: "Assistência social COMPLETA (MDS MI Social): série anual de repasse FNAS 2005→ + CadÚnico + Bolsa Família", api: "transferegov", script: "scripts/ingest_assistencia_social_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
  // EQUIPAMENTOS da assistência (unidades CRAS/CREAS individuais) — pipeline CadSUAS, serial (api "cadsuas"):
  // scrape (Playwright) → endereço → geocode (Nominatim) → fallback CEP. Cada passo só roda se houver pendência.
  { id: "equipamentos_suas", label: "Equipamentos SUAS por unidade (CadSUAS, Playwright): CRAS/CREAS/Centro POP/Acolhimento + nome/nº", api: "cadsuas", script: "scripts/ingest_equipamentos_suas.mjs", env: {},
    devido: async () => Number((await db.query(`SELECT count(*) n FROM entes_sc e WHERE e.tipo='M' AND NOT EXISTS (SELECT 1 FROM equipamentos_suas_sc q WHERE q.cod_ibge=e.cod_ibge)`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) > 0 }, // municípios sem unidade
  { id: "equipamentos_endereco", label: "Equipamentos SUAS — endereço/telefone (CadSUAS detalhe, HTTP)", api: "cadsuas", script: "scripts/enrich_equipamentos_suas_endereco.mjs", env: {},
    devido: async () => Number((await db.query(`SELECT count(*) n FROM equipamentos_suas_sc WHERE endereco_em IS NULL`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) > 0 },
  { id: "equipamentos_geo", label: "Equipamentos SUAS — geocodificação (Nominatim/OSM por endereço)", api: "cadsuas", script: "scripts/geocode_equipamentos_suas.mjs", env: {},
    devido: async () => Number((await db.query(`SELECT count(*) n FROM equipamentos_suas_sc WHERE endereco IS NOT NULL AND geo_em IS NULL`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) > 0 },
  { id: "equipamentos_cep", label: "Equipamentos SUAS — fallback de geo por CEP (AwesomeAPI)", api: "cadsuas", script: "scripts/geocode_equipamentos_cep.mjs", env: {},
    devido: async () => Number((await db.query(`SELECT count(*) n FROM equipamentos_suas_sc WHERE latitude IS NULL AND cep IS NOT NULL AND geo_em IS NOT NULL`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) > 0 },
  { id: "equipamentos_justica", label: "Equipamentos segurança/justiça/defesa civil georreferenciados (OSM + SAP/SC): polícia, bombeiros, defesa civil, prisional, socioeducativo", api: "osm", script: "scripts/ingest_equipamentos_justica.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM equipamentos_justica_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 90 }, // OSM/curado mudam devagar
  { id: "precatorios", label: "Precatórios por município (estoque e quantidade) — API do TJSC, Regime Especial de Precatórios; replicável por UF (CNJ Res. 303)", api: "tjsc", script: "scripts/ingest_precatorios_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM precatorios_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 90 },
  { id: "saneamento", label: "Saneamento por município (água/esgoto/lixo) — IBGE Censo 2022 via SIDRA (cobertura por domicílio)", api: "ibge", script: "scripts/ingest_saneamento_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM saneamento_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 180 }, // censo muda raramente
  { id: "agropecuaria", label: "Agricultura e agricultura familiar por município — Censo Agropecuário 2017 (IBGE/SIDRA t/6778+6883): estabelecimentos + área, familiar vs não-familiar", api: "ibge", script: "scripts/ingest_agropecuaria_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM agropecuaria_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 365 }, // censo decenal
  { id: "caf", label: "CAF — Cadastro Nacional da Agricultura Familiar (ex-DAP) por município: nº de agricultores familiares (MDA, XLSX mensal)", api: "mda", script: "scripts/ingest_caf_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM caf_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 }, // planilha mensal
  { id: "car", label: "CAR — Cadastro Ambiental Rural: nº de imóveis rurais por município (SICAR GeoServer WFS, contagem por município)", api: "sicar", script: "scripts/ingest_car_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM car_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 90 },
  { id: "pronaf", label: "PRONAF / Crédito Rural por município — valor contratado por ano (BCB SICOR/Matriz do Crédito Rural, OData; cdEstado=25)", api: "bcb", script: "scripts/ingest_pronaf_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM pronaf_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 90 },
  { id: "bancada", label: "Bancada federal do estado (deputados + senadores) p/ módulo de Captação de Emendas — APIs Câmara + Senado", api: "congresso", script: "scripts/ingest_bancada_federal_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM bancada_federal_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 }, // muda com posses/suplências
  { id: "snis", label: "SNIS Água/Esgoto por município e prestador (atendimento, perdas, tratamento) — app Ministério das Cidades via Playwright; state-agnostic (UF/ANO)", api: "snis", script: "scripts/ingest_snis_sc.mjs", env: { UF: "SC", ANO: "2022" },
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM snis_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 180 }, // SNIS é anual
  { id: "transferencias_stn", label: "Transferências da União por município, MENSAL (FPM/FUNDEB/ITR/Lei Kandir/CIDE/FEX/IOF/LC176) — CSV oficial STN/Tesouro Transparente; NACIONAL, state-agnostic (UF env)", api: "tesouro", script: "scripts/ingest_transferencias_stn.mjs", env: { UF: "SC" },
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM transferencias_stn_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 }, // CSVs ~mensal; RODAR DEPOIS DA 01h (de dia o servidor do Tesouro dá 502)
  { id: "sancoes", label: "Sanções a empresas/pessoas (CEIS + CNEP) — API Portal da Transparência; cruza com fornecedores (fornecedor sancionado)", api: "transparencia", script: "scripts/ingest_sancoes.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM sancoes`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 15 }, // requer PORTAL_TRANSPARENCIA_KEY
  { id: "munic", label: "IBGE MUNIC — instrumentos de gestão (planos/conselhos/fundos/instrumentos legais) por município, da BASE DE DADOS oficial (xlsx), não SIDRA", api: "ibge", script: "scripts/ingest_munic_basedados.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM munic_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 180 }, // MUNIC é ~bienal; baixa o xlsx + parse
  { id: "acompanhamento", label: "Acompanhamento intra-anual da execução (RREO do bimestre vigente) — receita prevista×realizada e despesa orçada×empenhada por município", api: "siconfi", script: "scripts/ingest_acompanhamento_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM acompanhamento_sc WHERE ano=extract(year from current_date)`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 50 }, // RREO publica a cada bimestre (~60 dias)
  { id: "acompanhamento_funcao", label: "Acompanhamento por função (intra-anual) — orçado×realizado por função até o bimestre vigente (RREO Anexo 02 parcial)", api: "siconfi", script: "scripts/ingest_acompanhamento_funcao_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM acompanhamento_funcao_sc WHERE ano=extract(year from current_date)`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 50 },
  { id: "msc_despesa", label: "MSC ancorada ao RREO — despesa empenhada por natureza e fonte (forma da MSC × total exato do RREO; reconcilia por construção)", api: "siconfi", script: "scripts/ingest_msc_despesa_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM msc_despesa_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 90 }, // anual; MSC pesada (paginada por ente)
  { id: "precos_compras", label: "Análise de compras por PREÇO UNITÁRIO — livro de preços de referência de SC + sobrepreço por município (derivado de itens_sc, via SQL)", api: "derivado", script: "scripts/build_precos_compras.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM sobrepreco_compras_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 }, // recomputar quando itens_sc atualizar
  // Passe 2 do mapa de preços — apresentação (unidade básica) em camadas + referência por chave de comparabilidade
  { id: "apresentacao_rotulo", label: "Apresentação Camada 1 (rótulo → unidade básica + fator de desempacotamento); derivado de itens_sc, via SQL", api: "derivado", script: "scripts/build_apresentacao_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM item_apresentacao_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 },
  { id: "apresentacao_desc", label: "Apresentação Camada 2 (descrição → quantidade do conteúdo p/ itens-container); derivado de itens_sc + Camada 1, via SQL", api: "derivado", script: "scripts/build_apresentacao_desc_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM item_apresentacao_desc_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 },
  { id: "apresentacao_llm", label: "Apresentação Camada LLM (Haiku extrai qtd do resíduo ambíguo, com abstenção); derivado, usa ANTHROPIC_API_KEY + cache", api: "derivado", script: "scripts/build_apresentacao_llm.mjs", env: { MODE: "apply", CONC: "8" },
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM item_apresentacao_desc_sc WHERE metodo='llm'`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 90 }, // LLM: infrequente; cache torna re-run barato
  { id: "precos_basica", label: "Referência por UNIDADE BÁSICA (Passe 2) — CATMAT+base+forma, mediana + curadoria IQR (IN 65 art.6); derivado de itens_sc + item_catmat_map + apresentação", api: "derivado", script: "scripts/build_precos_basica_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM precos_referencia_basica_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 }, // roda após apresentação camadas 1/2/LLM + match CATMAT
  { id: "mislabel_unidade", label: "Red-flag de unidade trocada no lançamento — item que destoa ≥100× da mediana do grupo CATMAT+base (efeito colateral do Passe 2); derivado", api: "derivado", script: "scripts/build_mislabel_unidade_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM mislabel_unidade_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 }, // roda após apresentação
  { id: "precos_nacional", label: "Referência NACIONAL de preços por CATMAT (Painel de Preços/Compras.gov.br), por unidade e por forma (avulso×escala) — enriquece o Banco de Preços e o sobrepreço", api: "compras", script: "scripts/ingest_precos_nacional.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM precos_nacional_ref`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 45 }, // depende de precos_referencia_sc.catmat_cod (classificador)
  // DESATIVADA em 04/ago/2026 a pedido do Heitor: o sobrepreço vai ser REESCRITO depois que o BANCO DE PREÇOS
  // (em construção) ficar pronto — é ele que passa a ser a régua de comparação, no lugar do duplo benchmark
  // atual. Até lá esta rotina não roda: nem por devido, nem por [solicitado] na tela /etl. O script
  // build_sobrepreco_nacional.mjs fica no repo como base da reescrita; para religar, tire o desativado daqui.
  { id: "sobrepreco_nacional", label: "Reconstrução do sobrepreço com DUPLO benchmark — mediana de SC + referência nacional + desvio/CV (IN 65); derivado de itens_sc + precos_referencia_sc + precos_nacional_ref", api: "derivado", script: "scripts/build_sobrepreco_nacional.mjs", env: {},
    desativado: "será reescrita depois que o banco de preços (em construção) ficar pronto — pedido de 04/ago/2026",
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM sobrepreco_compras_sc WHERE unit_nac IS NOT NULL`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 }, // roda após precos_compras + precos_nacional
  { id: "variacao_interna", label: "Variação INTERNA de preços — mesmo município comprou o mesmo item a preços diferentes (derivado de itens_sc, via SQL)", api: "derivado", script: "scripts/build_variacao_interna.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM variacao_interna_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 },
  { id: "red_flags", label: "Red flags de fornecedores — concentração + sanção (CEIS/CNEP) + sobrepreço por fornecedor (derivado de contratos/itens/sancoes, via SQL)", api: "derivado", script: "scripts/build_red_flags_fornecedores.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM red_flags_fornecedores_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 },
  { id: "mcmv", label: "Habitação — MCMV (Minha Casa Minha Vida), unidades financiadas por município (Min. Cidades, gov.br/cidades — sem WAF); alimenta o casamento oportunidade×necessidade", api: "cidades", script: "scripts/ingest_mcmv_sc.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM mcmv_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 90 },
  { id: "cmed", label: "CMED/Anvisa PMVG — preço-teto legal de medicamentos (Conformidade Gov, auto-descobre URL); referência nacional p/ sobrepreço em saúde (SC = ICMS 17%)", api: "anvisa", script: "scripts/ingest_cmed_pmvg.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM cmed_pmvg`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 },
  { id: "sobrepreco_med", label: "Indícios de sobrepreço em medicamentos (compras do município vs teto legal PMVG, por substância+dosagem); derivado de cmed_pmvg + itens_sc", api: "derivado", script: "scripts/build_sobrepreco_medicamentos.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM sobrepreco_medicamentos_sc`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 45 },
  { id: "convenios", label: "Convênios e contratos de repasse por município (SICONV/Transferegov, repositório detru — proposta+convenio)", api: "transferegov", script: "scripts/ingest_convenios_siconv_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // requer CSVs detru extraídos em tmp (proposta 714MB)
];

async function ensure() {
  await db.query(`CREATE TABLE IF NOT EXISTS etl_catalogo (
    id TEXT PRIMARY KEY, label TEXT, api TEXT, max_ano INTEGER,
    ultima_exec timestamptz, ultimo_status TEXT, devido BOOLEAN, msg TEXT, atualizado_em timestamptz )`);
  await db.query(`ALTER TABLE etl_catalogo ADD COLUMN IF NOT EXISTS solicitado BOOLEAN DEFAULT FALSE`); // pedido manual via tela /etl
  await db.query(`ALTER TABLE etl_catalogo ADD COLUMN IF NOT EXISTS desativado BOOLEAN DEFAULT FALSE`); // fonte suspensa aqui no catálogo; a tela /etl não oferece o botão
  // o desativado sai daqui a cada execução: religar a fonte é tirar a chave do FONTES, sem tocar no banco
  for (const f of FONTES) await db.query(`INSERT INTO etl_catalogo (id,label,api,desativado) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label, api=EXCLUDED.api, desativado=EXCLUDED.desativado`, [f.id, f.label, f.api, !!f.desativado]);
}
const estado = async (id) => (await db.query(`SELECT * FROM etl_catalogo WHERE id=$1`, [id])).rows[0];

// ===== SUPERVISÃO (lógica do PNCP aplicada a TODA fonte) =====
// Tabela cujo count(*) cresce durante a coleta = sinal de progresso de cada fonte.
const TAB = { financas: "financas_sc", metas: "metas_fiscais_sc", rreo_const: "rreo_const_sc", receitas_det: "receitas_detalhe_sc", desp_subfuncao: "despesa_subfuncao_sc", rgf: "rgf_sc", siops: "siops_sc", rpps: "rpps_sc", rpps_atuarial: "rpps_atuarial_sc", pdde: "pdde_sc", pnld: "pnld_reserva_sc", acesso_financeiro: "acesso_financeiro_sc", estban: "estban_sc", bndes: "bndes_sc", cfem: "cfem_sc", queimadas: "queimadas_sc", anp: "anp_precos_sc", bolsa_atleta: "bolsa_atleta_sc", estatisticas_vitais: "estatisticas_vitais_sc", ans_cobertura: "ans_cobertura_sc", caged: "caged_sc", rais: "rais_sc", prodes: "prodes_sc", desastres: "desastres_sc", sinisa: "sinisa_sc", sinan_dengue: "sinan_dengue_sc", aneel_gd: "aneel_gd_sc", anatel_bl: "anatel_bl_sc", senatran_frota: "frota_sc", pronaf: "pronaf_sc", ibama_autos: "ibama_autos_sc", sinesp: "sinesp_vitimas_sc", incra_assentamentos: "incra_assentamentos_sc", icmbio_uc: "icmbio_uc_sc", ana_outorgas: "ana_outorgas_sc", ibge_producao: "ibge_producao_sc", arboviroses: "arboviroses_sc", datatran: "datatran_sc", anp_vendas: "anp_vendas_sc", capag: "capag_sc", rfb_arrecadacao: "rfb_arrecadacao_sc", sim: "sim_sc", sisagua: "sisagua_sc", bps_precos_ref: "bps_precos_ref", sia_producao: "sia_producao_sc", medicamentos_alto_custo: "medicamentos_alto_custo_sc", cnes_equipes: "cnes_equipes_sc", cnes_equipamentos: "cnes_equipamentos_sc", cnes_leitos: "cnes_leitos_sc", cnes_profissionais: "cnes_profissionais_sc", apac: "apac_sc", raas_saude_mental: "raas_saude_mental_sc", cobertura_vacinal: "cobertura_vacinal_sc", sinan_agravos: "sinan_agravos_sc", sinasc: "sinasc_sc", sih: "sih_sc", igdm: "igdm_sc", ibama_embargos: "ibama_embargos_sc", quilombos: "quilombos_sc", equipamentos_esporte: "equipamentos_esporte_sc", censo_especial: "educacao_especial_sc", fundeb_oficial: "fundeb_oficial_sc", fundeb_parametros: "fatores_fundeb", indicadores_inep: "indicadores_inep_sc", indicadores_inep_escola: "indicadores_inep_escola_sc", rpps_crp: "rpps_crp_sc", cadprev_full: "cadprev_sync_log", crp_alertas: "crp_alertas", compras: "compras_sc", contratos: "contratos_sc", pca: "pca_sc_feitos", processos: "contratacoes_sc", itens: "itens_sc", indicadores: "indicadores_sc", transferencias: "transferencias_sc", cnes: "cnes_sc", sih: "saude_producao_sc", sia: "saude_producao_sc", previne: "previne_sc", indigena: "entes_sc", fns: "fns_repasse_sc", cnpj_loc: "cnpj_loc", empenhos: "empenhos_check", atas: "atas_sc", nf: "nf_sc", cauc: "cauc_sc", catalogo_govbr: "catalogo_govbr_sc", classificacao_itens: "itens_classificacao_sc", emendas: "emendas_indicacao_sc", emendas_exec: "emendas_execucao_sc", programa_beneficiario: "programa_beneficiario_sc", programas_federais: "programas_federais_sc", suas: "suas_sc", assistencia_social: "assistencia_repasse_sc", equipamentos_suas: "equipamentos_suas_sc", equipamentos_endereco: "equipamentos_suas_sc", equipamentos_geo: "equipamentos_suas_sc", equipamentos_cep: "equipamentos_suas_sc", equipamentos_justica: "equipamentos_justica_sc", precatorios: "precatorios_sc", saneamento: "saneamento_sc", snis: "snis_sc", transferencias_stn: "transferencias_stn_sc", sancoes: "sancoes", munic: "munic_sc", acompanhamento: "acompanhamento_sc", acompanhamento_funcao: "acompanhamento_funcao_sc", msc_despesa: "msc_despesa_sc", precos_compras: "sobrepreco_compras_sc", apresentacao_rotulo: "item_apresentacao_sc", apresentacao_desc: "item_apresentacao_desc_sc", apresentacao_llm: "item_apresentacao_desc_sc", precos_basica: "precos_referencia_basica_sc", mislabel_unidade: "mislabel_unidade_sc", precos_nacional: "precos_nacional_ref", sobrepreco_nacional: "sobrepreco_compras_sc", variacao_interna: "variacao_interna_sc", red_flags: "red_flags_fornecedores_sc", mcmv: "mcmv_sc", programas_agil: "programas_transferegov", cmed: "cmed_pmvg", sobrepreco_med: "sobrepreco_medicamentos_sc", agropecuaria: "agropecuaria_sc", caf: "caf_sc", car: "car_sc", pronaf: "pronaf_sc", bancada: "bancada_federal_sc", incremental: "pncp_evento", eventos_dado: "item_resultado_sc", rederiva: "pncp_evento" };
// SINAL DE PROGRESSO — count(*) SOZINHO É CEGO a ETL que faz upsert. Caso real (04/ago/2026):
// estatisticas_vitais regrava sempre as MESMAS 5.956 linhas (290 municípios × 2003-2023) com
// INSERT ... ON CONFLICT DO UPDATE, então o count fica parado em 5.956 por construção. O supervisor lia
// "quieto" e matava aos 20 min — 5 tentativas seguidas, sem a coleta nunca ter parado de fato (o
// max(atualizado) da tabela avançava enquanto ele a dava por morta). O sinal agora é o par
// (linhas, escrita mais recente): basta UM dos dois andar para a fonte contar como viva.
// A coluna de carimbo é descoberta no information_schema, uma vez por fonte — nada de lista a manter.
const CARIMBOS = ["atualizado", "atualizado_em", "criado_em", "ts", "coletado_em", "data_carga"];
const colCarimbo = new Map();
async function carimboDe(tab) {
  if (colCarimbo.has(tab)) return colCarimbo.get(tab);
  let col = null;
  try {
    const { rows } = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name=$1 AND data_type LIKE 'timestamp%' AND column_name = ANY($2)`, [tab, CARIMBOS]);
    col = CARIMBOS.find((c) => rows.some((r) => r.column_name === c)) || null;
  } catch { col = null; }
  colCarimbo.set(tab, col);
  return col;
}
// devolve { n: linhas, sig: assinatura comparável }; sig muda se ENTRAR linha OU se alguma linha for REGRAVADA
async function sinal(id) {
  const tab = TAB[id] || "financas_sc";
  const col = await carimboDe(tab);
  try {
    const { rows: [r] } = await db.query(
      col ? `SELECT count(*) n, coalesce(extract(epoch from max(${col}))::bigint,0) t FROM ${tab}`
          : `SELECT count(*) n, 0 t FROM ${tab}`);
    return { n: Number(r.n) || 0, sig: `${r.n}|${r.t}` };
  } catch { return { n: 0, sig: "erro" }; }
}
const STALL_MS = 20 * 60 * 1000;   // 20 min sem progresso => mata e religa (folga p/ não matar ente pesado)
const CHECK_MS = 60 * 1000;
const MAX_TENT = 5;
const killTree = (pid) => { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" }); } catch {} };

// roda 1 vez sob monitoramento; "ok" | "retry"(estagnado) | "erro(n)"
function runOnce(f, reinicios) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [f.script], { cwd: ROOT, env: { ...process.env, ...f.env }, stdio: "ignore" });
    let last = "", lastChange = Date.now(), settled = false, timer = null;
    const fin = (v) => { if (settled) return; settled = true; if (timer) clearInterval(timer); resolve(v); };
    timer = setInterval(async () => {
      let p; try { p = await sinal(f.id); } catch { return; }
      if (p.sig !== last) { last = p.sig; lastChange = Date.now(); }
      const idle = Math.round((Date.now() - lastChange) / 1000);
      await db.query(`UPDATE etl_catalogo SET msg=$1, atualizado_em=now() WHERE id=$2`, [`rodando: ${p.n} regs · ${reinicios} reinício(s)${idle > 120 ? ` · quieto ${idle}s` : ""}`, f.id]).catch(() => {});
      if (Date.now() - lastChange > STALL_MS) { log(`!! ${f.id} ESTAGNADO (${idle}s) — matando e religando`); killTree(child.pid); fin("retry"); }
    }, CHECK_MS);
    child.on("exit", (code) => fin(code === 0 ? "ok" : `erro(${code})`));
    child.on("error", () => fin("erro(spawn)"));
  });
}

// supervisão completa: religa em estagnação OU crash, até MAX_TENT (ETLs são idempotentes/resumíveis)
async function rodar(f) {
  let ultimo = "—";
  for (let tent = 1; tent <= MAX_TENT; tent++) {
    log(`▶ ${f.id} (tentativa ${tent}/${MAX_TENT})`);
    ultimo = await runOnce(f, tent - 1);
    await db.query(`UPDATE etl_catalogo SET ultima_exec=now(), ultimo_status=$1, msg=$2, atualizado_em=now() WHERE id=$3`, [ultimo, `tentativa ${tent} · ${new Date().toISOString().slice(0, 16)}`, f.id]).catch(() => {});
    if (ultimo === "ok") return "ok";
    log(`  ${f.id}: ${ultimo} — religando em 5s`);
    await sleep(5000);
  }
  return ultimo;
}

let trava = null;   // a trava vive no escopo do módulo: main() a pega, e os manipuladores de sinal a soltam

async function main() {
  // TRAVA — um orquestrador por vez. Em 04/ago/2026 a rodada forçada das 21:40 e o PNIGP_ETL_diario das 22:30
  // rodaram juntos: dois processos coletando as MESMAS fontes, escrevendo nas mesmas linhas do etl_catalogo e
  // disputando o mesmo banco (que é o gargalo). Quem chega depois sai em silêncio e com código 0 — não é falha,
  // é "já tem alguém coletando"; sair com erro faria a cadeia chamadora reportar quebra onde não houve.
  // MODO=plan não trava: só relata. Por que não é pg_advisory_lock — ver trava_processo.mjs (pooler).
  if (MODO !== "plan") {
    trava = await pegaTrava(db, "orquestrador", { toleranciaMin: 10 });
    if (!trava.ok) {
      log(`já há um orquestrador coletando (${trava.donoAtual}, há ${trava.minRodando} min, última batida ${trava.segUltimaBatida}s atrás) — saindo sem tocar em nada; isto NÃO é erro`);
      await db.end(); return;
    }
  }
  await ensure();
  log(`MODO=${MODO} | ano fechado=${ANO_FECHADO} | corrente=${ANO_CORRENTE}`);
  // 1) detectar (MODO=solicitados → roda só o que foi pedido na tela; run → devidos OU solicitados; plan → só reporta)
  const SOLIC = MODO === "solicitados";
  const plano = [];
  for (const f of FONTES) {
    const st = await estado(f.id);
    // fonte desativada: não roda nem por devido nem por [solicitado]; o pedido manual é limpo para não ficar preso na fila da tela /etl
    if (f.desativado) {
      await db.query(`UPDATE etl_catalogo SET devido=false, solicitado=false, msg=$1, atualizado_em=now() WHERE id=$2`, [`DESATIVADA — ${f.desativado}`, f.id]).catch(() => {});
      plano.push({ f, roda: false });
      log(`  DESATIVADA ${f.id.padEnd(14)} ${f.desativado}`);
      continue;
    }
    let devido = false; try { devido = await f.devido(st); } catch {}
    const solicitado = st?.solicitado === true;
    const ma = f.id === "cnes"
      ? (Number((await db.query(`SELECT max(extract(year from atualizado))::int y FROM cnes_sc`).catch(() => ({ rows: [{}] }))).rows[0]?.y) || 0) // CNES é snapshot por competência (sem coluna ano)
      : await maxAno({ financas: "financas_sc", metas: "metas_fiscais_sc", rreo_const: "rreo_const_sc", receitas_det: "receitas_detalhe_sc", desp_subfuncao: "despesa_subfuncao_sc", rgf: "rgf_sc", siops: "siops_sc", rpps: "rpps_sc", rpps_atuarial: "rpps_atuarial_sc", pdde: "pdde_sc", pnld: "pnld_reserva_sc", acesso_financeiro: "acesso_financeiro_sc", estban: "estban_sc", bndes: "bndes_sc", cfem: "cfem_sc", queimadas: "queimadas_sc", anp: "anp_precos_sc", bolsa_atleta: "bolsa_atleta_sc", estatisticas_vitais: "estatisticas_vitais_sc", ans_cobertura: "ans_cobertura_sc", caged: "caged_sc", rais: "rais_sc", prodes: "prodes_sc", desastres: "desastres_sc", sinisa: "sinisa_sc", sinan_dengue: "sinan_dengue_sc", aneel_gd: "aneel_gd_sc", anatel_bl: "anatel_bl_sc", senatran_frota: "frota_sc", pronaf: "pronaf_sc", ibama_autos: "ibama_autos_sc", sinesp: "sinesp_vitimas_sc", incra_assentamentos: "incra_assentamentos_sc", icmbio_uc: "icmbio_uc_sc", ana_outorgas: "ana_outorgas_sc", ibge_producao: "ibge_producao_sc", arboviroses: "arboviroses_sc", datatran: "datatran_sc", anp_vendas: "anp_vendas_sc", capag: "capag_sc", rfb_arrecadacao: "rfb_arrecadacao_sc", sim: "sim_sc", sisagua: "sisagua_sc", bps_precos_ref: "bps_precos_ref", sia_producao: "sia_producao_sc", medicamentos_alto_custo: "medicamentos_alto_custo_sc", cnes_equipes: "cnes_equipes_sc", cnes_equipamentos: "cnes_equipamentos_sc", cnes_leitos: "cnes_leitos_sc", cnes_profissionais: "cnes_profissionais_sc", apac: "apac_sc", raas_saude_mental: "raas_saude_mental_sc", cobertura_vacinal: "cobertura_vacinal_sc", sinan_agravos: "sinan_agravos_sc", sinasc: "sinasc_sc", sih: "sih_sc", igdm: "igdm_sc", ibama_embargos: "ibama_embargos_sc", quilombos: "quilombos_sc", equipamentos_esporte: "equipamentos_esporte_sc", censo_especial: "educacao_especial_sc", fundeb_oficial: "fundeb_oficial_sc", fundeb_parametros: "fatores_fundeb", indicadores_inep: "indicadores_inep_sc", indicadores_inep_escola: "indicadores_inep_escola_sc", rpps_crp: "rpps_crp_sc", cadprev_full: "cadprev_sync_log", crp_alertas: "crp_alertas", compras: "compras_sc", contratos: "contratos_sc", pca: "pca_sc", indicadores: "indicadores_sc", transferencias: "transferencias_sc", sih: "saude_producao_sc", sia: "saude_producao_sc", previne: "previne_sc", indigena: "entes_sc", fns: "fns_repasse_sc", cnpj_loc: "cnpj_loc", empenhos: "empenhos_check", atas: "atas_sc", nf: "nf_sc", cauc: "cauc_sc", catalogo_govbr: "catalogo_govbr_sc", classificacao_itens: "itens_classificacao_sc", emendas_exec: "emendas_execucao_sc", equipamentos_suas: "equipamentos_suas_sc", equipamentos_endereco: "equipamentos_suas_sc", equipamentos_geo: "equipamentos_suas_sc", equipamentos_cep: "equipamentos_suas_sc", equipamentos_justica: "equipamentos_justica_sc" }[f.id] || "financas_sc", f.id === "contratos" ? "ano_compra" : "ano");
    await db.query(`UPDATE etl_catalogo SET max_ano=$1, devido=$2, atualizado_em=now() WHERE id=$3`, [ma, devido, f.id]);
    const roda = SOLIC ? solicitado : (devido || solicitado);
    plano.push({ f, roda });
    log(`  ${roda ? "RODA    " : "ok      "} ${f.id.padEnd(14)} max_ano=${ma}${solicitado ? " [solicitado]" : ""}`);
  }
  const devidos = plano.filter((p) => p.roda);
  log(`→ ${devidos.length} fonte(s) a coletar: ${devidos.map((p) => p.f.id).join(", ") || "(nenhuma)"}`);
  if (MODO === "plan") { log("MODO=plan — nada executado. Use MODO=run (ou =solicitados) para coletar."); await db.end(); return; }

  // 2) executar devidos, SERIAL por API (grupos diferentes em paralelo)
  const grupos = {};
  for (const p of devidos) (grupos[p.f.api] ??= []).push(p.f);
  await Promise.all(Object.values(grupos).map(async (lista) => {
    for (const f of lista) {
      const status = await rodar(f); // rodar() já é supervisionado e grava o estado no catálogo
      await db.query(`UPDATE etl_catalogo SET solicitado=false WHERE id=$1`, [f.id]).catch(() => {}); // limpa pedido manual atendido
      log(`✔ ${f.id}: ${status}`);
    }
  }));
  // 3) validação final + 4) regenerar documentação — só no ciclo completo (run), não no atende-solicitações
  if (MODO === "run") {
    const rodarScript = (s) => new Promise((res) => { const c = spawn(process.execPath, [s], { cwd: ROOT, stdio: "ignore" }); c.on("exit", () => res()); c.on("error", () => res()); });
    log("validando integridade…"); await rodarScript("scripts/auditoria_dados_sc.mjs");
    log("validando separação Estado×município…"); await rodarScript("scripts/validacao_estado_vazamento.mjs");
    log("varredura de frescor (série histórica + última competência)…"); await rodarScript("scripts/varredura_frescor.mjs");
    log("motor de notificações (delta — avisa o que mudou)…"); await rodarScript("scripts/motor_notificacoes.mjs");
    log("carteiro de notificações (envia se houver SMTP; simula caso contrário)…"); await rodarScript("scripts/enviar_notificacoes.mjs");
    log("carteiro WhatsApp (envia se houver Cloud API; simula caso contrário)…"); await rodarScript("scripts/enviar_notificacoes_whatsapp.mjs");
    log("regenerando documentação…"); await rodarScript("scripts/gerar_documentacao.mjs");
  }
  log("ciclo concluído.");
  await trava?.solta();
  await db.end();
}
// a trava é solta em qualquer saída: no fim normal, no erro fatal e no taskkill/Ctrl-C. Se ainda assim ficar
// órfã (queda de energia, máquina dormindo), a batida envelhece e o próximo orquestrador a toma — sem socorro manual.
for (const sinalSO of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
  process.on(sinalSO, async () => { await trava?.solta().catch(() => {}); process.exit(130); });
}
main().catch(async (e) => { log("ERRO FATAL: " + e); await trava?.solta().catch(() => {}); process.exit(1); });
