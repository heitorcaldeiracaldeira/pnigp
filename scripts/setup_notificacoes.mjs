// Fundação do sistema de NOTIFICAÇÕES — cria as 4 tabelas e popula a notificacao_regras com o catálogo
// (Secretaria × Natureza × Prazo). Idempotente (UPSERT). Tabelas NOVAS — não altera nenhum dado existente.
// node scripts/setup_notificacoes.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

// alerta_id, titulo, secretaria, natureza, severidade, tem_prazo, fonte_dado, solucao_i10, audiencia[], cadencia
const R = (alerta_id, titulo, secretaria, natureza, severidade, tem_prazo, fonte_dado, solucao_i10, audiencia, cadencia = "evento") =>
  ({ alerta_id, titulo, secretaria, natureza, severidade, tem_prazo, fonte_dado, solucao_i10, audiencia, cadencia });

const REGRAS = [
  // FAZENDA
  R("cauc_requisito_vencido", "Requisito do CAUC vencido", "fazenda", "regularizacao", "critico", true, "cauc_detalhe_sc", "regularizacao_cauc", ["tipo", "bloco"]),
  R("lrf_pessoal_limite", "Pessoal/RCL na banda de alerta da LRF", "fazenda", "risco", "alto", false, "rgf_sc", "gestao_fiscal_lrf", ["bloco", "gabinete"]),
  R("prazo_contabil", "Prazo de obrigação contábil (RREO/RGF/MSC/DCA)", "fazenda", "obrigacao", "medio", true, "calendario", "acompanhamento_contabil", ["tipo"]),
  R("resultado_deteriorando", "Resultado orçamentário deteriorando", "fazenda", "risco", "medio", false, "financas_sc", "acompanhamento_fiscal", ["bloco"]),
  R("arrecadacao_abaixo", "Arrecadação abaixo do previsto", "fazenda", "risco", "medio", false, "vies_previsao", "recuperacao_receita", ["bloco"]),
  R("autonomia_baixa", "Autonomia/receita própria baixa", "fazenda", "oportunidade", "oportunidade", false, "indice_fiscal", "recuperacao_receita", ["bloco", "gabinete"], "boletim"),
  R("precatorios_pressao", "Estoque de precatórios em pressão", "fazenda", "risco", "medio", false, "precatorios_sc", "gestao_precatorios", ["bloco"], "boletim"),
  // SAÚDE
  R("saude_minimo_15", "Aplicação em saúde abaixo de 15% (ASPS)", "saude", "regularizacao", "critico", true, "siops_sc", "ajuste_aplicacao", ["tipo", "bloco", "gabinete"]),
  R("previne_abaixo", "Indicadores do Previne abaixo dos pares", "saude", "oportunidade", "oportunidade", false, "previne_sc", "apoio_aps", ["tipo", "bloco"], "boletim"),
  R("lacuna_saude", "Lacuna de captação em saúde", "saude", "oportunidade", "oportunidade", false, "lacuna_saude", "projeto_saude", ["tipo"], "boletim"),
  R("programa_saude_aberto", "Programa de saúde aberto (UBS/SAMU/Policlínica)", "saude", "oportunidade", "oportunidade", true, "programas_federais_sc", "projetos_elegiveis", ["tipo", "bloco"]),
  R("sobrepreco_medicamento", "Indício de sobrepreço em medicamento (PMVG)", "saude", "risco", "medio", false, "sobrepreco_medicamentos_sc", "preco_teto_cmed", ["tipo"], "boletim"),
  // EDUCAÇÃO
  R("educacao_minimo_25", "Aplicação em educação abaixo de 25%", "educacao", "regularizacao", "critico", true, "rreo_const_sc", "ajuste_aplicacao", ["tipo", "bloco", "gabinete"]),
  R("fundeb_70", "FUNDEB — 70% em profissionais da educação", "educacao", "regularizacao", "alto", true, "rreo_const_sc", "ajuste_fundeb", ["tipo", "bloco"]),
  R("fundeb_integral", "Ampliar o FUNDEB via tempo integral", "educacao", "oportunidade", "oportunidade", false, "censo_matricula_sc", "educacao_integral", ["tipo"], "boletim"),
  R("ideb_tendencia", "IDEB abaixo da meta / em queda", "educacao", "risco", "medio", false, "ideb_sc", "apoio_pedagogico", ["tipo", "bloco"], "boletim"),
  R("lacuna_educacao", "Lacuna educação / programa aberto (Proinfância/PAR)", "educacao", "oportunidade", "oportunidade", true, "programas_federais_sc", "proinfancia_par", ["tipo"]),
  // ASSISTÊNCIA
  R("cras_cobertura", "Cobertura de CRAS/CREAS abaixo da NOB-SUAS", "assistencia", "risco", "medio", false, "assistencia_social_sc", "construcao_cras", ["tipo", "bloco"], "boletim"),
  R("bf_familias_fora", "Famílias pobres fora do Bolsa Família", "assistencia", "oportunidade", "oportunidade", false, "assistencia_social_sc", "busca_ativa", ["tipo"], "boletim"),
  R("bf_condicionalidade", "Condicionalidade de saúde do Bolsa Família baixa", "assistencia", "risco", "medio", false, "mi_social_serie_sc", "reforco_busca_ativa", ["tipo"], "boletim"),
  R("suas_expansao", "Aceite/expansão de cofinanciamento SUAS", "assistencia", "oportunidade", "oportunidade", true, "programas_federais_sc", "cofinanciamento_suas", ["tipo", "bloco"]),
  // ADMINISTRAÇÃO / COMPRAS & CONTRATOS
  R("contrato_a_vencer", "Contrato a vencer (30/60/90 dias)", "compras", "obrigacao", "alto", true, "contratos_sc", "compras_14133", ["tipo", "bloco"]),
  R("contrato_aditivo", "Janela de aditivo/prorrogação de contrato", "compras", "obrigacao", "medio", true, "contratos_sc", "compras_14133", ["tipo"]),
  R("contrato_vencido", "Contrato vencido ainda em execução", "compras", "risco", "critico", false, "contratos_sc", "compras_14133", ["tipo", "bloco"]),
  R("ata_a_vencer", "Ata de registro de preço a vencer", "compras", "obrigacao", "medio", true, "atas_sc", "planejamento_compras", ["tipo"]),
  R("pca_nao_publicado", "PCA (Plano de Contratações Anual) não publicado", "compras", "obrigacao", "alto", true, "pca_sc", "planejamento_compras", ["tipo", "bloco"]),
  R("dispensa_alta", "% de dispensa/inexigibilidade alto", "compras", "risco", "medio", false, "padroes_compras", "planejamento_pca", ["tipo", "bloco"], "boletim"),
  R("fornecedor_sancionado", "Fornecedor sancionado com contrato ativo", "compras", "risco", "alto", false, "fornecedores_sancionados_sc", "controle_fornecedores", ["tipo", "bloco"]),
  R("sobrepreco_redflag", "Sobrepreço / red flag de fornecedor", "compras", "risco", "medio", false, "sobrepreco_compras_sc", "preco_referencia", ["tipo"], "boletim"),
  // PREVIDÊNCIA
  R("crp_vencido", "CRP previdenciário vencido / a vencer", "previdencia", "regularizacao", "critico", true, "rpps_crp_sc", "regularizacao_crp", ["tipo", "bloco", "gabinete"]),
  R("deficit_atuarial", "Déficit atuarial sem plano de amortização", "previdencia", "risco", "alto", false, "rpps_atuarial_sc", "equacionamento_rpps", ["tipo", "bloco"], "boletim"),
  R("cadprev_obrigacao", "Obrigações CADPREV (DAIR/DIPR/DRAA)", "previdencia", "obrigacao", "medio", true, "cadprev_sync_log", "consultoria_previdenciaria", ["tipo"]),
  R("rpps_sem_draa", "RPPS sem estudo atuarial (DRAA) no CADPREV", "previdencia", "regularizacao", "alto", false, "rpps_atuarial_sc", "consultoria_previdenciaria", ["tipo", "bloco", "gabinete"]),
  R("sem_rreo_rgf", "Município não publica RREO/RGF no SICONFI", "fazenda", "transparencia", "medio", false, "rreo_const_sc", "acompanhamento_contabil", ["tipo", "bloco", "gabinete"]),
  // PLANEJAMENTO / CAPTAÇÃO
  R("emenda_na_mesa", "Emenda empenhada e não paga (recurso na mesa)", "planejamento", "oportunidade", "oportunidade", false, "emendas_execucao_sc", "radar_oficio", ["tipo", "bloco", "gabinete"], "boletim"),
  R("emenda_nova", "Nova emenda recebida", "planejamento", "oportunidade", "oportunidade", false, "emendas_indicacao_sc", "caderno_emendas", ["tipo", "bloco"]),
  R("programa_janela", "Programa federal aberto / janela fechando", "planejamento", "oportunidade", "oportunidade", true, "programas_transferegov", "projetos_elegiveis", ["tipo", "bloco"]),
  R("plano_ausente", "Plano ausente trava repasse (SNHIS/mobilidade/FUNDEB)", "planejamento", "oportunidade", "alto", false, "munic_sc", "elaboracao_plano", ["tipo", "bloco"], "boletim"),
  R("convenio_disponivel", "Convênio disponível a celebrar", "planejamento", "oportunidade", "oportunidade", true, "programas_transferegov", "estruturacao_convenio", ["tipo"]),
  // CONVÊNIOS
  R("convenio_inadimplente", "Convênio inadimplente / prestação rejeitada", "convenios", "regularizacao", "critico", false, "convenios_captados_sc", "regularizacao_convenios", ["tipo", "bloco", "gabinete"]),
  R("convenio_prestacao", "Prestação de contas de convênio a vencer/pendente", "convenios", "obrigacao", "alto", true, "convenios_captados_sc", "regularizacao_convenios", ["tipo", "bloco"]),
  // OBRAS / INFRA
  R("saneamento_concessao", "Déficit de esgoto/água — potencial de concessão", "obras", "oportunidade", "oportunidade", false, "saneamento_sc", "estudo_concessao", ["bloco", "gabinete"], "boletim"),
  R("habitacao_snhis", "Habitação — tripé SNHIS ausente", "obras", "oportunidade", "alto", false, "munic_sc", "projetos_his", ["tipo", "bloco"], "boletim"),
  R("programa_infra", "Programa de infraestrutura aberto (Novo PAC)", "obras", "oportunidade", "oportunidade", true, "programas_federais_sc", "captacao_obras", ["tipo", "bloco"]),
  // AGRICULTURA / CULTURA / AMBIENTE
  R("rural_pronaf", "PRONAF/CAF/CAR — extensão rural", "agricultura", "oportunidade", "oportunidade", false, "agropecuaria_sc", "desenvolvimento_rural", ["tipo"], "boletim"),
  R("cultura_sistema", "Sistema de Cultura ausente (destrava PNAB)", "cultura", "oportunidade", "alto", false, "munic_sc", "sistema_cultura", ["tipo", "bloco"], "boletim"),
  R("ambiente_zoneamento", "Zoneamento/licenciamento ausente", "ambiente", "transparencia", "medio", false, "munic_sc", "modernizacao_legislativa", ["tipo"], "boletim"),
  // GABINETE / CONTROLE INTERNO
  R("iegm_faixa", "IEGM abaixo da faixa", "gabinete", "risco", "medio", false, "iegm_sc", "governanca", ["gabinete"], "boletim"),
  R("transparencia_lgpd", "Transparência ativa / LGPD a reforçar", "gabinete", "transparencia", "medio", false, "munic_sc", "governanca", ["gabinete"], "boletim"),
  R("instrumentos_ausentes", "Instrumentos de gestão ausentes (planos/conselhos/fundos)", "gabinete", "regularizacao", "alto", false, "munic_sc", "governanca_planejamento", ["gabinete", "bloco"], "boletim"),
  R("escalonamento", "Escalonamento — alerta crítico não tratado", "gabinete", "risco", "alto", false, "notificacao_log", "monitoramento_i10", ["gabinete"]),
  // POSITIVOS (transversais)
  R("positivo_crp_renovado", "CRP renovado ✓", "previdencia", "positivo", "positivo", false, "rpps_crp_sc", "", ["tipo", "bloco", "gabinete"]),
  R("positivo_cauc_regular", "Requisito do CAUC regularizado ✓", "fazenda", "positivo", "positivo", false, "cauc_detalhe_sc", "", ["tipo", "bloco"]),
  R("positivo_convenio_regular", "Convênio regularizado ✓", "convenios", "positivo", "positivo", false, "convenios_captados_sc", "", ["tipo", "bloco"]),
  R("positivo_recurso_captado", "Recurso captado 🎉", "planejamento", "positivo", "positivo", false, "emendas_execucao_sc", "", ["tipo", "bloco", "gabinete"]),
];

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});

  // 1) REGRAS — o catálogo (Secretaria × Natureza × Prazo)
  await db.query(`CREATE TABLE IF NOT EXISTS notificacao_regras (
    alerta_id TEXT PRIMARY KEY, titulo TEXT NOT NULL, secretaria TEXT NOT NULL, natureza TEXT NOT NULL,
    severidade TEXT NOT NULL, tem_prazo BOOLEAN DEFAULT false, fonte_dado TEXT, solucao_i10 TEXT,
    audiencia TEXT[] DEFAULT '{}', cadencia TEXT DEFAULT 'evento', ativa BOOLEAN DEFAULT true, atualizado timestamptz DEFAULT now() )`);

  // 2) CADASTRO — a ficha do servidor (roteamento + validade + LGPD)
  await db.query(`CREATE TABLE IF NOT EXISTS notificacao_cadastro (
    id SERIAL PRIMARY KEY, cod_ibge TEXT NOT NULL, nome TEXT NOT NULL, cpf TEXT, matricula TEXT,
    cargo TEXT, secretaria TEXT, perfil TEXT, areas TEXT[] DEFAULT '{}',
    email TEXT, celular TEXT, canal_pref TEXT,
    data_nomeacao DATE, doc_nomeacao TEXT, validade DATE,
    consentimento_lgpd BOOLEAN DEFAULT false, contato_verificado BOOLEAN DEFAULT false, ativo BOOLEAN DEFAULT true,
    criado timestamptz DEFAULT now(), atualizado timestamptz DEFAULT now() )`);

  // 3) LOG — enviados (dedup por chave_delta, controle de leitura/resolução)
  await db.query(`CREATE TABLE IF NOT EXISTS notificacao_log (
    id SERIAL PRIMARY KEY, cod_ibge TEXT NOT NULL, alerta_id TEXT, chave_delta TEXT,
    destinatario_id INT, canal TEXT, severidade TEXT,
    enviado_em timestamptz DEFAULT now(), status_envio TEXT DEFAULT 'simulado', lido_em timestamptz, resolvido_em timestamptz )`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_notif_log_delta ON notificacao_log (cod_ibge, alerta_id, chave_delta)`);

  // 4) IMPACTO — o ROI (resolvido / recurso destravado / captado)
  await db.query(`CREATE TABLE IF NOT EXISTS notificacao_impacto (
    id SERIAL PRIMARY KEY, cod_ibge TEXT NOT NULL, alerta_id TEXT, tipo_impacto TEXT, valor NUMERIC,
    descricao TEXT, registrado_em timestamptz DEFAULT now() )`);

  // popular REGRAS (UPSERT idempotente)
  let n = 0;
  for (const r of REGRAS) {
    await db.query(`INSERT INTO notificacao_regras (alerta_id,titulo,secretaria,natureza,severidade,tem_prazo,fonte_dado,solucao_i10,audiencia,cadencia,atualizado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      ON CONFLICT (alerta_id) DO UPDATE SET titulo=EXCLUDED.titulo, secretaria=EXCLUDED.secretaria, natureza=EXCLUDED.natureza,
        severidade=EXCLUDED.severidade, tem_prazo=EXCLUDED.tem_prazo, fonte_dado=EXCLUDED.fonte_dado, solucao_i10=EXCLUDED.solucao_i10,
        audiencia=EXCLUDED.audiencia, cadencia=EXCLUDED.cadencia, atualizado=now()`,
      [r.alerta_id, r.titulo, r.secretaria, r.natureza, r.severidade, r.tem_prazo, r.fonte_dado, r.solucao_i10, r.audiencia, r.cadencia]);
    n++;
  }

  const porSec = (await db.query(`SELECT secretaria, count(*) n FROM notificacao_regras GROUP BY secretaria ORDER BY n DESC`)).rows;
  const porNat = (await db.query(`SELECT natureza, count(*) n FROM notificacao_regras GROUP BY natureza ORDER BY n DESC`)).rows;
  console.log(`✔ 4 tabelas criadas. notificacao_regras populada: ${n} regras.`);
  console.log("  por secretaria:", porSec.map((x) => `${x.secretaria}=${x.n}`).join(" · "));
  console.log("  por natureza:  ", porNat.map((x) => `${x.natureza}=${x.n}`).join(" · "));
  console.log("  com prazo:", (await db.query(`SELECT count(*) n FROM notificacao_regras WHERE tem_prazo`)).rows[0].n);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
