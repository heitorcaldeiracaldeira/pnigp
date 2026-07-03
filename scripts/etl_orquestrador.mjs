// ORQUESTRADOR de coleta — detecta novidade por fonte e roda só os ETLs devidos (incremental,
// idempotente, serial por API). Grava estado em etl_catalogo. node scripts/etl_orquestrador.mjs
//   MODO=plan (padrão) → só detecta e reporta o que está pendente, sem rodar.
//   MODO=run           → detecta e executa os ETLs devidos.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import { spawn, execSync } from "child_process"; import pg from "pg";
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
  { id: "compras", label: "Compras (PNCP ano corrente)", api: "pncp", script: "scripts/ingest_compras_sc.mjs", env: { ANO: String(ANO_CORRENTE), REFRESH: "1" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 25 },
  { id: "contratos", label: "Contratos (PNCP ano corrente, append)", api: "pncp", script: "scripts/ingest_contratos_sc.mjs", env: { APPEND: "1", ANOS: String(ANO_CORRENTE), REFRESH: "1" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 25 },
  { id: "pca", label: "PCA (PNCP)", api: "pncp", script: "scripts/ingest_pca_sc.mjs", env: { ANOS: `${ANO_CORRENTE},${ANO_CORRENTE + 1}` },
    devido: async (st) => diasDesde(st?.ultima_exec) > 35 },
  { id: "processos", label: "Processos PNCP — TODOS (todas modalidades/anos)", api: "pncp", script: "scripts/ingest_processos_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 20 },
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
    devido: async (st) => diasDesde(st?.ultima_exec) > 7 }, // janelas de proposta mudam — recoleta semanal
  { id: "programas_agil", label: "Catálogo de programas Transferegov — gestão ágil (fundoafundo/programa_gestao_agil); complementa o catálogo unificado de 335 programas", api: "transferegov", script: "scripts/ingest_programas_agil.mjs", env: {},
    devido: async (st) => Number((await db.query(`SELECT count(*) n FROM programas_transferegov WHERE modalidade='GESTAO_AGIL'`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n) === 0 || diasDesde(st?.ultima_exec) > 30 },
  { id: "fnde_simad", label: "FNDE liberações por município (SIMAD, Playwright)", api: "inep", script: "scripts/ingest_fnde_simad.mjs", env: { UF: "SC" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 60 }, // browser-only; recoleta esparsa
  { id: "escolas", label: "Escolas por município + infraestrutura (INEP Censo Escolar)", api: "inep", script: "scripts/ingest_escolas_sc.mjs", env: { ANO: "2025" },
    devido: async (st) => diasDesde(st?.ultima_exec) > 300 }, // anual
  { id: "cnes_estab", label: "Estabelecimentos de saúde por município (CNES — rede p/ regulação, API DEMAS)", api: "datasus", script: "scripts/ingest_cnes_estab_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 45 }, // CNES atualiza mensalmente
  { id: "precos_referencia", label: "Preço de referência por item (mediana SC) + classificação ata/efetivada — base da análise de preços", api: "pncp", script: "scripts/ingest_precos_referencia_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 }, // recalcula quando itens_sc atualiza
  { id: "sazonalidade_preco", label: "Sazonalidade de preço por categoria (melhor mês de compra, SC)", api: "pncp", script: "scripts/ingest_sazonalidade_preco_sc.mjs", env: {},
    devido: async (st) => diasDesde(st?.ultima_exec) > 30 },
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
  for (const f of FONTES) await db.query(`INSERT INTO etl_catalogo (id,label,api) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label, api=EXCLUDED.api`, [f.id, f.label, f.api]);
}
const estado = async (id) => (await db.query(`SELECT * FROM etl_catalogo WHERE id=$1`, [id])).rows[0];

// ===== SUPERVISÃO (lógica do PNCP aplicada a TODA fonte) =====
// Tabela cujo count(*) cresce durante a coleta = sinal de progresso de cada fonte.
const TAB = { financas: "financas_sc", metas: "metas_fiscais_sc", rreo_const: "rreo_const_sc", receitas_det: "receitas_detalhe_sc", desp_subfuncao: "despesa_subfuncao_sc", rgf: "rgf_sc", siops: "siops_sc", rpps: "rpps_sc", rpps_atuarial: "rpps_atuarial_sc", pdde: "pdde_sc", pnld: "pnld_reserva_sc", rpps_crp: "rpps_crp_sc", cadprev_full: "cadprev_sync_log", crp_alertas: "crp_alertas", compras: "compras_sc", contratos: "contratos_sc", pca: "pca_sc_feitos", processos: "processos_sc", itens: "itens_sc", indicadores: "indicadores_sc", transferencias: "transferencias_sc", cnes: "cnes_sc", sih: "saude_producao_sc", sia: "saude_producao_sc", previne: "previne_sc", indigena: "entes_sc", fns: "fns_repasse_sc", cnpj_loc: "cnpj_loc", empenhos: "empenhos_check", atas: "atas_sc", nf: "nf_sc", cauc: "cauc_sc", catalogo_govbr: "catalogo_govbr_sc", classificacao_itens: "itens_classificacao_sc", emendas: "emendas_indicacao_sc", emendas_exec: "emendas_execucao_sc", programa_beneficiario: "programa_beneficiario_sc", programas_federais: "programas_federais_sc", suas: "suas_sc", assistencia_social: "assistencia_repasse_sc", equipamentos_suas: "equipamentos_suas_sc", equipamentos_endereco: "equipamentos_suas_sc", equipamentos_geo: "equipamentos_suas_sc", equipamentos_cep: "equipamentos_suas_sc", equipamentos_justica: "equipamentos_justica_sc", precatorios: "precatorios_sc", saneamento: "saneamento_sc", snis: "snis_sc", transferencias_stn: "transferencias_stn_sc", sancoes: "sancoes", munic: "munic_sc", acompanhamento: "acompanhamento_sc", acompanhamento_funcao: "acompanhamento_funcao_sc", msc_despesa: "msc_despesa_sc", precos_compras: "sobrepreco_compras_sc", variacao_interna: "variacao_interna_sc", red_flags: "red_flags_fornecedores_sc", mcmv: "mcmv_sc", programas_agil: "programas_transferegov", cmed: "cmed_pmvg", sobrepreco_med: "sobrepreco_medicamentos_sc", agropecuaria: "agropecuaria_sc", caf: "caf_sc", car: "car_sc", pronaf: "pronaf_sc", bancada: "bancada_federal_sc" };
const conta = async (id) => { try { return Number((await db.query(`SELECT count(*) n FROM ${TAB[id] || "financas_sc"}`)).rows[0].n) || 0; } catch { return 0; } };
const STALL_MS = 20 * 60 * 1000;   // 20 min sem progresso => mata e religa (folga p/ não matar ente pesado)
const CHECK_MS = 60 * 1000;
const MAX_TENT = 5;
const killTree = (pid) => { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" }); } catch {} };

// roda 1 vez sob monitoramento; "ok" | "retry"(estagnado) | "erro(n)"
function runOnce(f, reinicios) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [f.script], { cwd: ROOT, env: { ...process.env, ...f.env }, stdio: "ignore" });
    let last = -1, lastChange = Date.now(), settled = false, timer = null;
    const fin = (v) => { if (settled) return; settled = true; if (timer) clearInterval(timer); resolve(v); };
    timer = setInterval(async () => {
      let p; try { p = await conta(f.id); } catch { return; }
      if (p !== last) { last = p; lastChange = Date.now(); }
      const idle = Math.round((Date.now() - lastChange) / 1000);
      await db.query(`UPDATE etl_catalogo SET msg=$1, atualizado_em=now() WHERE id=$2`, [`rodando: ${p} regs · ${reinicios} reinício(s)${idle > 120 ? ` · quieto ${idle}s` : ""}`, f.id]).catch(() => {});
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

async function main() {
  await ensure();
  log(`MODO=${MODO} | ano fechado=${ANO_FECHADO} | corrente=${ANO_CORRENTE}`);
  // 1) detectar (MODO=solicitados → roda só o que foi pedido na tela; run → devidos OU solicitados; plan → só reporta)
  const SOLIC = MODO === "solicitados";
  const plano = [];
  for (const f of FONTES) {
    const st = await estado(f.id);
    let devido = false; try { devido = await f.devido(st); } catch {}
    const solicitado = st?.solicitado === true;
    const ma = f.id === "cnes"
      ? (Number((await db.query(`SELECT max(extract(year from atualizado))::int y FROM cnes_sc`).catch(() => ({ rows: [{}] }))).rows[0]?.y) || 0) // CNES é snapshot por competência (sem coluna ano)
      : await maxAno({ financas: "financas_sc", metas: "metas_fiscais_sc", rreo_const: "rreo_const_sc", receitas_det: "receitas_detalhe_sc", desp_subfuncao: "despesa_subfuncao_sc", rgf: "rgf_sc", siops: "siops_sc", rpps: "rpps_sc", rpps_atuarial: "rpps_atuarial_sc", pdde: "pdde_sc", pnld: "pnld_reserva_sc", rpps_crp: "rpps_crp_sc", cadprev_full: "cadprev_sync_log", crp_alertas: "crp_alertas", compras: "compras_sc", contratos: "contratos_sc", pca: "pca_sc", indicadores: "indicadores_sc", transferencias: "transferencias_sc", sih: "saude_producao_sc", sia: "saude_producao_sc", previne: "previne_sc", indigena: "entes_sc", fns: "fns_repasse_sc", cnpj_loc: "cnpj_loc", empenhos: "empenhos_check", atas: "atas_sc", nf: "nf_sc", cauc: "cauc_sc", catalogo_govbr: "catalogo_govbr_sc", classificacao_itens: "itens_classificacao_sc", emendas_exec: "emendas_execucao_sc", equipamentos_suas: "equipamentos_suas_sc", equipamentos_endereco: "equipamentos_suas_sc", equipamentos_geo: "equipamentos_suas_sc", equipamentos_cep: "equipamentos_suas_sc", equipamentos_justica: "equipamentos_justica_sc" }[f.id] || "financas_sc", f.id === "contratos" ? "ano_compra" : "ano");
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
  await db.end();
}
main().catch((e) => { log("ERRO FATAL: " + e); process.exit(1); });
