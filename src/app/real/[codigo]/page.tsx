import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, Database, FileText, Landmark, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Logo } from "@/components/brand";
import { AssuntoCaptacao } from "@/components/assunto-captacao";
import { LacunaCaptacaoEducacao, LacunaCaptacaoSaude, LacunaCaptacaoAssistencia } from "@/components/lacuna-captacao";
import { CatalogoProgramas } from "@/components/catalogo-programas";
import { MunicGestao } from "@/components/munic-gestao";
import { EmendasCard } from "@/components/emendas-card";
import { CaptacaoEmendas } from "@/components/captacao-emendas";
import { EstaduaisEmendas } from "@/components/estaduais-emendas";
import { ConveniosCard } from "@/components/convenios-card";
import { Donut } from "@/components/charts/donut";
import { LinhasFinanceiras } from "@/components/charts/linhas-financeiras";
import { AreaEmpilhada } from "@/components/charts/area-empilhada";
import { OrcadoExecutado } from "@/components/charts/orcado-executado";
import { ComprasSCSection } from "@/components/compras-sc-section";
import { AnaliseComprasItens } from "@/components/analise-compras-itens";
import { ComprasCategorias } from "@/components/compras-categorias";
import { SazonalidadePreco } from "@/components/sazonalidade-preco";
import { PesquisaPreco } from "@/components/pesquisa-preco";
import { FornecedoresCard } from "@/components/fornecedores-card";
import { FornecedoresSancionados } from "@/components/fornecedores-sancionados";
import BancoPrecos from "@/components/banco-precos";
import { SobreprecoCompras } from "@/components/sobrepreco-compras";
import { ConstrutorProcesso } from "@/components/construtor-processo";
import { ProcessoFases } from "@/components/processo-fases";
import { AnalisadorDocumentos } from "@/components/analisador-documentos";
import { VariacaoInterna } from "@/components/variacao-interna";
import { RedFlagsFornecedores } from "@/components/red-flags-fornecedores";
import { MislabelUnidade } from "@/components/mislabel-unidade";
import { ComprasExtraCard } from "@/components/compras-extra";
import { ResumoCompras } from "@/components/resumo-compras";
import { DiagnosticoGestor } from "@/components/diagnostico-gestor";
import { AuditoriaLazy } from "@/components/auditoria-lazy";
import { EstabSaudeLazy } from "@/components/estab-saude-lazy";
import { CmedConsulta } from "@/components/cmed-consulta";
import { SobreprecoMedicamentos } from "@/components/sobrepreco-medicamentos";
import { SimuladorFiscal } from "@/components/simulador-fiscal";
import { SaudeSC } from "@/components/saude-sc";
import { AssuntoAtencaoPrimaria } from "@/components/assunto-atencao-primaria";
import { RepassesSaudeFicha } from "@/components/repasses-saude-ficha";
import { AccountabilityAPS } from "@/components/accountability-aps";
import { AssuntoMAC } from "@/components/assunto-mac";
import { AssuntoReceitas, AssuntoDespesas } from "@/components/assunto-financas";
import { AssuntoEducacao } from "@/components/assunto-educacao";
import { AssuntoIEGM } from "@/components/assunto-iegm";
import { AssuntoPadroesCompras } from "@/components/assunto-padroes-compras";
import { ContratosGestao } from "@/components/contratos-gestao";
import { AtasPainel } from "@/components/atas-painel";
import { BaseMetodologica } from "@/components/base-metodologica";
import { IdebPainel } from "@/components/ideb-painel";
import { MatriculasCard } from "@/components/matriculas-card";
import { FndeEducacaoCard } from "@/components/fnde-educacao-card";
import { AnaliseEducacao } from "@/components/analise-educacao";
import { AnaliseSaude } from "@/components/analise-saude";
import { OtimizadorReceita } from "@/components/otimizador-receita";
import { EficienciaEducacao } from "@/components/eficiencia-educacao";
import { EficienciaSaude } from "@/components/eficiencia-saude";
import { CatalogoBoasPraticas } from "@/components/catalogo-boas-praticas";
import { EscolasDrill } from "@/components/escolas-drill";
import { PerfilEducacao } from "@/components/perfil-educacao";
import { CensoTendencias } from "@/components/censo-tendencias";
import { SerieExplicada } from "@/components/serie-explicada";
import { PlacarEstrategico } from "@/components/placar-estrategico";
import { CentralAlertas } from "@/components/central-alertas";
import { RadarCrpSC } from "@/components/radar-crp-sc";
import { CrpHistorico } from "@/components/crp-historico";
import { AssistenciaSocialSC } from "@/components/assistencia-social-sc";
import { EquipamentosSuasDrill } from "@/components/equipamentos-suas-drill";
import { GeolocalizacaoLazy } from "@/components/geolocalizacao-lazy";
import { InfraestruturaSC } from "@/components/infraestrutura-sc";
import { AcessoFinanceiro } from "@/components/acesso-financeiro-sc";
import { BndesPanel, VitaisPanel, AnpPanel, CfemPanel, QueimadasPanel, BolsaAtletaPanel, AnsCoberturaPanel, EquipamentosEsportePanel, CagedPanel, RaisPanel, CasamentoEmpregoPanel, ProdesPanel, DesastresPanel, SinisaPanel, SinanDenguePanel, AneelGdPanel, AnatelBlPanel, FrotaPanel, IbamaAutosPanel, SinespPanel, IncraAssentamentosPanel, PronafPanel, IcmbioUcPanel, AnaOutorgasPanel, IbgeProducaoPanel, IbgeCemprePanel, ArbovirosesPanel, DatatranPanel, AnpVendasPanel, CapagPanel, RfbArrecadacaoPanel, SimPanel, SinascPanel, SihPanel, IgdmPanel, IbamaEmbargosPanel, QuilombosPanel, SiaProducaoPanel, MedicamentosPanel, SinanAgravosPanel, ProfissionaisSaudePanel, ApacPanel, RaasSaudeMentalPanel, CoberturaVacinalPanel, SisaguaPanel, MortalidadeInfantilPanel, FarmaciaPopularPanel, FinanciamentoApsPanel, CoberturaApsPanel, ProducaoApsPanel, IndicadoresApsPanel, DinheiroMesaApsPanel, QualidadeIndicadoresApsPanel, VinculoApsPanel, SuasSaldoPanel, PddeSaldoPanel, PnaeAgriPanel, BarragensPanel, PaaPanel, LpgPanel, SalicPanel, NovoPacPanel, CensoCorRacaPanel, PopulacaoFaixaPanel, PibMunicipalPanel, IdhmPanel, CemadenPanel, DomiciliosPanel, AlfabetizacaoPanel, SetoresPanel, MuseusPanel, ReceitaComposicaoPanel, DespesaFuncaoPanel, TransferenciasSeriePanel, FolhaSeriePanel, InvestimentoPanel, DespesaNaturezaPanel, RankingTesouroPanel, RankingDetalhePanel, EscolaTurmasPanel, EtiDiagnosticoPanel, EtiPlanoPanel, EvasaoPanel, FundebGanhoEtiPanel, EscolasEtiPanel, DiagnosticoPnePanel, PmeRoteiroPanel, CicloPmePanel, PmeAcoesPanel, PrioridadesMetasPanel, ValorizacaoMagisterioPanel, TrajetoriaEducacaoPanel, LevantamentoInternoPanel, TransferenciasCguPanel, CaptacaoRelativaPanel, SaebPanel, ObrasPanel, SalarioEducacaoPanel } from "@/components/novas-fontes";
import { FundebPainel } from "@/components/fundeb-painel";
import { IndicadoresInep } from "@/components/indicadores-inep";
import { DividaPanel } from "@/components/divida-panel";
import { MapaAmbiental } from "@/components/mapa-ambiental";
import { Agropecuaria } from "@/components/agropecuaria-sc";
import { ViesPrevisao } from "@/components/vies-previsao";
import { RepassesStn } from "@/components/repasses-stn";
import { PecaCompleta } from "@/components/peca-completa";
import { PpaPrograma } from "@/components/ppa-programa";
import { Acompanhamento } from "@/components/acompanhamento";
import { AcompanhamentoFuncao } from "@/components/acompanhamento-funcao";
import { MscDespesa } from "@/components/msc-despesa";
import { MinutaLoa } from "@/components/minuta-loa";
import { CabecalhoArea } from "@/components/cabecalho-area";
import { EducacaoSC } from "@/components/educacao-sc";
import { CruzamentosSC } from "@/components/cruzamentos-sc";
import { PanoramaSC } from "@/components/panorama-sc";
import { PrintButton } from "@/components/print-button";
import { ComprasDestinosSCView } from "@/components/compras-destinos-sc";
import { FolhaSC } from "@/components/folha-sc";
import { PrevidenciaSC } from "@/components/previdencia-sc";
import { CaucSCView } from "@/components/cauc-sc";
import { AlertasNotificacao } from "@/components/alertas-notificacao";
import { CadastroServidor } from "@/components/cadastro-servidor";
import { CalendarioObrigacoes } from "@/components/calendario-obrigacoes";
import { gerarInsightsSC } from "@/lib/insights-sc";
import { ArvoreFinanceira } from "@/components/arvore-financeira";
import type { NoFin } from "@/lib/orcamento";
import type { FuncaoSC, ReceitaSC } from "@/lib/queries";
import { TransferenciasSCSection } from "@/components/transferencias-sc-section";
import { PanelTabs } from "@/components/panel-tabs";
import { RealSelector } from "@/components/real-selector";
import EtiPlanoDocumento from "@/components/eti-plano-documento";
import PmeProjetoDocumento from "@/components/pme-projeto-documento";
import { FONTE_SICONFI, getContratosResumoSC, getCruzamentosSC, getDiagnosticoEstadoSC, getDiagnosticoGestorSC, getEntesSC, getFinancasSC, getIndicadoresSetoriaisSC, getMetasFiscaisSC, getPcaResumoSC, getPibPerCapitaSC, getEducacaoSC, getRankingFiscalSC, getFnsSC, getFnsSerieSC, getRepassesSaudeFichaSC, getMacProducaoSC, getReceitasDetalheSC, getDespesaSubfuncaoSC, getPadroesComprasSC, getContratosComItensSC, getEconomicidadeSC, getAnaliseComprasItensSC, getSazonalidadePrecoSC, getFornecedoresSC, getComprasExtraSC, getContratosVencimentoSC, getAtasSC, getIdebSC, getCensoMatriculaSC, getEducacaoSerieSC, getIegmSC, getCaptacaoTransferegovSC, getEmendasSC, getConveniosSC, getFndeEducacaoSC, getOtimizadorReceitaSC, getEficienciaEducacaoSC, getEficienciaSaudeSC, getEscolasSC, getPerfilEducacaoSC, getEstabSaudeSC, getPerfilSaudeSC, getCensoTendenciaSC, getPrevineSC, getPrevineFichaSC, getRgfResumoSC, getSaudeSC, getSeriesIndicadoresSC, getComprasDestinosSC, getRppsSC, getCaucSC, getComprasCategoriasSC, getPerfilNecessidadeSC, getProgramasFederaisSC, getRadarCrpSC, getCrpHistoricoSC, getAssistenciaSocialSC, getEquipamentosSuasSC, getPrecatoriosSC, getSaneamentoSC, getViesPrevisaoSC, getMacroindicadoresSC, getViesDespesaSC, getProjecaoReceitaSC, getTransferenciasStnSC, getPecaCompletaSC, getPpaProgramaSC, getAcompanhamentoSC, getAcompanhamentoFuncaoSC, getMscDespesaSC, getFornecedoresSancionadosSC, getSobreprecoSC, getVariacaoInternaSC, getMunicSC, getRedFlagsSC, getMislabelUnidadeSC, getAlertasSC, getCatalogoProgramasSC, getSobreprecoMedicamentosSC, getAgropecuariaSC, getCaptacaoEmendasSC, getCadernoProgramasSC, getEmendasEstaduaisSC, getEmendasEstObjetosSC, getLacunaCaptacaoEducacaoSC, getLacunaCaptacaoSaudeSC, getLacunaCaptacaoAssistenciaSC, getCatalogoExtracao, getSiopsSerieSC, getConveniosRiscoSC, getNotificacaoResumoSC, getAcessoFinanceiroSC, getFundebSC, getIndicadoresInepSC, getDividaSC, getBndesSC, getVitaisSC, getAnpSC, getCfemSC, getQueimadasSC, getBolsaAtletaSC, getAnsCoberturaSC, getEquipamentosEsporteSC, getCagedSC, getRaisSC, getCasamentoEmpregoSC, getProdesSC, getMapaAmbientalSC, getDesastresSC, getSinisaSC, getSinanDengueSC, getAneelGdSC, getAnatelBlSC, getFrotaSC, getIbamaAutosSC, getSinespSC, getIncraAssentamentosSC, getPronafSC, getIcmbioUcSC, getAnaOutorgasSC, getIbgeProducaoSC, getArbovirosesSC, getDatatranSC, getAnpVendasSC, getCapagSC, getRfbArrecadacaoSC, getSimSC, getSinascSC, getSihSC, getIgdmSC, getIbamaEmbargosSC, getQuilombosSC, getSiaProducaoSC, getMedicamentosSC, getSinanAgravosSC, getProfissionaisSaudeSC, getApacSC, getRaasSaudeMentalSC, getCoberturaVacinalSC, getSisaguaSC, getMortalidadeInfantilSC, getFarmaciaPopularSC, getFinanciamentoApsSC, getCoberturaApsSC, getProducaoApsSC, getIndicadoresApsSC, getDinheiroMesaApsSC, getQualidadeIndicadoresApsSC, getVinculoApsSC, getSuasSaldoSC, getPddeSaldoSC, getPnaeAgriSC, getBarragensSC, getPaaSC, getLpgSC, getSalicSC, getNovoPacSC, getCensoCorRacaSC, getPopulacaoFaixaSC, getPibMunicipalSC, getIdhmSC, getCemadenSC, getDomiciliosSC, getAlfabetizacaoSC, getSetoresSC, getMuseusSC, getReceitaComposicaoSC, getDespesaFuncaoSerieSC, getTransferenciasSerieSC, getFolhaSerieSC, getInvestimentoSerieSC, getDespesaNaturezaSerieSC, getRankingTesouroSC, getRankingDetalheSC, getEscolaTurmasSC, getEtiDiagnosticoSC, getEvasaoEscolarSC, getFundebGanhoEtiSC, getEscolasEtiSC, getDiagnosticoEducacaoPneSC, getValorizacaoMagisterioSC, getEducacaoTrajetoriaSC, getTransferenciasCguSC, getCaptacaoRelativaSC, getSaebSC, getObrasSC, getSalarioEducacaoSC } from "@/lib/queries";
import { PainelImpacto } from "@/components/painel-impacto";
import { ResolverAlertas } from "@/components/resolver-alertas";
import { BoletimGestao } from "@/components/boletim-gestao";
import { Carimbo, CarimboFontes } from "@/components/carimbo";
import { BaixarCsv } from "@/components/baixar-csv";
import { PlanoEvolucaoI10, EstudoComprasI10, type FrenteI10 } from "@/components/plano-evolucao-i10";
import { planosAusentes } from "@/lib/planos-ausentes";
import { ProjetosElegiveis } from "@/components/projetos-elegiveis";
import { fmtBRL, fmtBRLCompact, fmtPop, fmtData } from "@/lib/ui";

export const metadata = { title: "i10 Gov 360 — Santa Catarina (dados oficiais SICONFI)" };
export const dynamic = "force-dynamic";

// Cabeçalho de nível de gestão (Gerencial → Tático → Técnico) — organiza a aba por camada de decisão sem esconder dados.
function NivelSaude({ icone, titulo, desc, cor }: { icone: string; titulo: string; desc: string; cor: string }) {
  return (
    <div className="mb-3 mt-7 border-l-4 pl-3 first:mt-2" style={{ borderColor: cor }}>
      <div className="text-sm font-bold text-slate-800">{icone} {titulo}</div>
      <div className="text-[11px] text-slate-500">{desc}</div>
    </div>
  );
}

export default async function RealEntePage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const [dados, entes, contratosResumo, pcaResumo, metasFiscais, rankingFiscal, pibPerCapita, indicadores, serieRenda, diagnostico, rgfResumo, saude, educacao, cruz, diagEstado, previne, fns, rpps, cauc, padroesCompras, contratosItens, economicidade, contratosVenc, atas, ideb, censoMatricula] = await Promise.all([getFinancasSC(codigo), getEntesSC(), getContratosResumoSC(codigo), getPcaResumoSC(codigo), getMetasFiscaisSC(codigo), getRankingFiscalSC(), getPibPerCapitaSC(codigo), getIndicadoresSetoriaisSC(codigo), getSeriesIndicadoresSC(codigo), getDiagnosticoGestorSC(codigo), getRgfResumoSC(codigo), getSaudeSC(codigo), getEducacaoSC(codigo), getCruzamentosSC(codigo), getDiagnosticoEstadoSC(codigo), getPrevineSC(codigo), getFnsSC(codigo), getRppsSC(codigo), getCaucSC(codigo), getPadroesComprasSC(codigo), getContratosComItensSC(codigo), getEconomicidadeSC(codigo), getContratosVencimentoSC(codigo), getAtasSC(codigo), getIdebSC(codigo), getCensoMatriculaSC(codigo)]);
  const [previneFicha, fnsSerie, repassesSaude, macProducao, receitasDetalhe, despSubfuncao, educacaoSerie, iegmDados, captacao, munic, emendas, convenios, fndeEdu, otimReceita, eficEdu, sobreMed, siopsSerie, conveniosRisco] = await Promise.all([
    getPrevineFichaSC(codigo), getFnsSerieSC(codigo), getRepassesSaudeFichaSC(codigo), getMacProducaoSC(codigo), getReceitasDetalheSC(codigo), getDespesaSubfuncaoSC(codigo), getEducacaoSerieSC(codigo), getIegmSC(codigo), getCaptacaoTransferegovSC(codigo), getMunicSC(codigo), getEmendasSC(codigo), getConveniosSC(codigo), getFndeEducacaoSC(codigo), getOtimizadorReceitaSC(codigo), getEficienciaEducacaoSC(codigo), getSobreprecoMedicamentosSC(codigo), getSiopsSerieSC(codigo), getConveniosRiscoSC(codigo)]);
  const [eficSaude, escolas, analiseItens, comprasCategorias, necessidade, alertas, assistSocial, equipSuas, precatorios, saneamento, viesPrev, macroLDO, viesDesp, projReceita, notifResumo, acessoFinanceiro, fundebPainel, indicadoresInep, divida, bndes, vitais, anp, cfem, queimadas, bolsaAtleta, ansCobertura, equipEsporte, caged, rais, casamento, prodes, mapaAmbiental, desastres, sinisa, arboviroses, anpVendas, aneelGd, anatelBl, frota, ibamaAutos, sinesp, icmbioUc, anaOutorgas, datatran, capag, rfbArrec, sim, sinasc, sih, igdm, ibamaEmbargos, quilombos, siaProd, medicamentos, sinanAgravos, profSaude, apac, raasMental, coberturaVacinal, sisagua, mortInfantil, farmPop, finAps, cobAps, prodAps, indAps, dinMesa, qualInd, vinculo, suasSaldo, pddeSaldo, pnaeAgri, barragens, paa, lpg, salic, novopac, censoCR, popFaixa, pib, idhm, cemaden, domicilios, alfab, setores, museus, receitaComp, despFuncao, transfSerie, folhaSerie, investSerie, despNatureza, rankTesouro, rankDet, escTurmas, etiDiag, evasao, fundebGanho, escolasEti, diagPne, valorMag, trajEdu, transfCgu, captRel, saeb, obras, salEduc] = await Promise.all([
    getEficienciaSaudeSC(codigo), getEscolasSC(codigo), getAnaliseComprasItensSC(codigo), getComprasCategoriasSC(codigo), getPerfilNecessidadeSC(codigo), getAlertasSC(codigo), getAssistenciaSocialSC(codigo), getEquipamentosSuasSC(codigo), getPrecatoriosSC(codigo), getSaneamentoSC(codigo), getViesPrevisaoSC(codigo), getMacroindicadoresSC(codigo), getViesDespesaSC(codigo), getProjecaoReceitaSC(codigo), getNotificacaoResumoSC(codigo), getAcessoFinanceiroSC(codigo), getFundebSC(codigo), getIndicadoresInepSC(codigo), getDividaSC(codigo), getBndesSC(codigo), getVitaisSC(codigo), getAnpSC(codigo), getCfemSC(codigo), getQueimadasSC(codigo), getBolsaAtletaSC(codigo), getAnsCoberturaSC(codigo), getEquipamentosEsporteSC(codigo), getCagedSC(codigo), getRaisSC(codigo), getCasamentoEmpregoSC(codigo), getProdesSC(codigo), getMapaAmbientalSC(codigo), getDesastresSC(codigo), getSinisaSC(codigo), getArbovirosesSC(codigo), getAnpVendasSC(codigo), getAneelGdSC(codigo), getAnatelBlSC(codigo), getFrotaSC(codigo), getIbamaAutosSC(codigo), getSinespSC(codigo), getIcmbioUcSC(codigo), getAnaOutorgasSC(codigo), getDatatranSC(codigo), getCapagSC(codigo), getRfbArrecadacaoSC(codigo), getSimSC(codigo), getSinascSC(codigo), getSihSC(codigo), getIgdmSC(codigo), getIbamaEmbargosSC(codigo), getQuilombosSC(codigo), getSiaProducaoSC(codigo), getMedicamentosSC(codigo), getSinanAgravosSC(codigo), getProfissionaisSaudeSC(codigo), getApacSC(codigo), getRaasSaudeMentalSC(codigo), getCoberturaVacinalSC(codigo), getSisaguaSC(codigo), getMortalidadeInfantilSC(codigo), getFarmaciaPopularSC(codigo), getFinanciamentoApsSC(codigo), getCoberturaApsSC(codigo), getProducaoApsSC(codigo), getIndicadoresApsSC(codigo), getDinheiroMesaApsSC(codigo), getQualidadeIndicadoresApsSC(codigo), getVinculoApsSC(codigo), getSuasSaldoSC(codigo), getPddeSaldoSC(codigo), getPnaeAgriSC(codigo), getBarragensSC(codigo), getPaaSC(codigo), getLpgSC(codigo), getSalicSC(codigo), getNovoPacSC(codigo), getCensoCorRacaSC(codigo), getPopulacaoFaixaSC(codigo), getPibMunicipalSC(codigo), getIdhmSC(codigo), getCemadenSC(codigo), getDomiciliosSC(codigo), getAlfabetizacaoSC(codigo), getSetoresSC(codigo), getMuseusSC(codigo), getReceitaComposicaoSC(codigo), getDespesaFuncaoSerieSC(codigo), getTransferenciasSerieSC(codigo), getFolhaSerieSC(codigo), getInvestimentoSerieSC(codigo), getDespesaNaturezaSerieSC(codigo), getRankingTesouroSC(codigo), getRankingDetalheSC(codigo), getEscolaTurmasSC(codigo), getEtiDiagnosticoSC(codigo), getEvasaoEscolarSC(codigo), getFundebGanhoEtiSC(codigo), getEscolasEtiSC(codigo), getDiagnosticoEducacaoPneSC(codigo), getValorizacaoMagisterioSC(codigo), getEducacaoTrajetoriaSC(codigo), getTransferenciasCguSC(codigo), getCaptacaoRelativaSC(codigo), getSaebSC(codigo), getObrasSC(codigo), getSalarioEducacaoSC(codigo)]);
  const [agropec, captacaoEmendas, cadernoProgramas, emendasEstaduais, emendasEstObjetos, lacunaEdu, lacunaSaude, lacunaAssist, extracao, incraAssent, pronaf, ibgeProducao] = await Promise.all([getAgropecuariaSC(codigo), getCaptacaoEmendasSC(codigo), getCadernoProgramasSC(codigo), getEmendasEstaduaisSC(codigo), getEmendasEstObjetosSC(), getLacunaCaptacaoEducacaoSC(codigo), getLacunaCaptacaoSaudeSC(codigo), getLacunaCaptacaoAssistenciaSC(codigo), getCatalogoExtracao(), getIncraAssentamentosSC(codigo), getPronafSC(codigo), getIbgeProducaoSC(codigo)]);
  const [repassesStn, pecaCompleta, ppaPrograma, mscDespesa, fornecSancionados, sobrepreco, variacaoInterna, redFlags, mislabel, acompanhamento, acompFuncao, programasFederais, catalogoProgramas, sazPreco, fornec, comprasExtra] = await Promise.all([
    getTransferenciasStnSC(codigo), getPecaCompletaSC(codigo), getPpaProgramaSC(codigo), getMscDespesaSC(codigo), getFornecedoresSancionadosSC(codigo), getSobreprecoSC(codigo), getVariacaoInternaSC(codigo), getRedFlagsSC(codigo), getMislabelUnidadeSC(codigo), getAcompanhamentoSC(codigo), getAcompanhamentoFuncaoSC(codigo), getProgramasFederaisSC(), getCatalogoProgramasSC(), getSazonalidadePrecoSC(), getFornecedoresSC(codigo), getComprasExtraSC(codigo)]);
  const estabSaude = await getEstabSaudeSC(codigo);
  const perfilSaude = await getPerfilSaudeSC(codigo);
  const perfilEdu = await getPerfilEducacaoSC(codigo);
  const censoTend = await getCensoTendenciaSC(codigo);
  const seriesInd = serieRenda as Record<string, { ano: number; valor: number }[]>;
  if (!dados || dados.serie.length === 0) notFound();
  const minhaPos = rankingFiscal.find((r) => r.cod_ibge === codigo) ?? null;
  const totalRank = rankingFiscal.length;
  // mediana do esforço de investimento de SC — base p/ dimensionar a oportunidade pela margem fiscal do município
  const investOrd = rankingFiscal.map((r) => r.investimento).filter((v) => v != null).sort((a, b) => a - b);
  const medianaInvestSC = investOrd.length ? investOrd[Math.floor(investOrd.length / 2)] : 0;

  const { ente, serie, funcoesLatest, receitasLatest } = dados;
  // Bloqueio: a visão própria do ESTADO ainda não existe (é meio-municipal). Só municípios (tipo 'M') renderizam.
  // Reabrir quando houver a comparação Estado×Estado (agregação de mais UFs). Ver memória feedback-estado-municipio-separados.
  if (ente.tipo !== "M") notFound();
  const a = serie[serie.length - 1];
  const anterior = serie[serie.length - 2] ?? null;
  const resultado = a.receita - a.despesa;
  const superavit = resultado >= 0;
  const pctArrec = a.receita_prevista > 0 ? (a.receita / a.receita_prevista) * 100 : 0;
  const deltaRec = anterior && anterior.receita ? ((a.receita - anterior.receita) / anterior.receita) * 100 : null;
  const anoIni = serie[0].ano;
  const anoFim = a.ano;

  const options = entes.filter((e) => e.tipo === "M").map((e) => ({ value: e.cod_ibge, label: e.nome })); // só municípios no seletor (Estado bloqueado até visão própria)
  const receitaData = [
    { label: "Receita tributária (própria)", valor: a.tributaria },
    { label: "Transferências", valor: a.transferencias },
    { label: "Outras receitas", valor: a.outras },
  ];
  const despesaData = [
    { label: "Pessoal e encargos", valor: a.pessoal },
    { label: "Custeio", valor: a.custeio },
    { label: "Investimentos", valor: a.investimento },
    { label: "Dívida", valor: a.divida },
  ];
  const funcData = funcoesLatest.slice(0, 8).map((f) => ({ label: f.nome, orcado: f.dotacao, executado: f.empenhado }));

  const tabs: { id: string; label: string; content: React.ReactNode; grupo?: string }[] = [
    {
      id: "visao",
      label: "Visão geral",
      content: (
        <>
          <CentralAlertas alertas={alertas} nome={ente.nome} />
          {minhaPos && (
            <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700"><Target className="h-4 w-4" /> Índice Fiscal i10 Gov 360 <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-slate-500">real · finanças SICONFI</span></div>
                  <div className="mt-1 font-display text-4xl font-bold tracking-tight text-slate-900">{minhaPos.score.toFixed(1)}<span className="text-lg font-semibold text-slate-400"> /100</span></div>
                  <div className="text-xs text-slate-600"><strong className="text-teal-700">{minhaPos.posicao}º</strong> de {totalRank} entes de SC · gestão fiscal</div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
                  <div className="flex justify-between gap-3"><span>Autonomia (receita própria)</span><strong className="tabular-nums text-slate-800">{minhaPos.autonomia.toFixed(0)}%</strong></div>
                  <div className="flex justify-between gap-3"><span>Esforço de investimento</span><strong className="tabular-nums text-slate-800">{minhaPos.investimento.toFixed(0)}%</strong></div>
                  <div className="flex justify-between gap-3"><span>Equilíbrio (resultado/receita)</span><strong className="tabular-nums text-slate-800">{minhaPos.equilibrio.toFixed(1)}%</strong></div>
                  <div className="flex justify-between gap-3"><span>Peso de pessoal</span><strong className="tabular-nums text-slate-800">{minhaPos.pessoal.toFixed(0)}%</strong></div>
                </div>
              </div>
              <details className="mt-3 border-t border-teal-200/60 pt-2 text-[11px] text-slate-600">
                <summary className="cursor-pointer select-none font-semibold text-teal-800">Ver cálculo do índice</summary>
                <p className="mt-1 text-slate-500">O índice é a <b>média dos percentis</b> (0–100) de 4 dimensões, comparando o município aos demais de SC. <a href="#metodologia-indice" className="font-medium text-indigo-600 hover:underline">metodologia completa →</a></p>
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-slate-100 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><span>Dimensão</span><span className="text-right">Valor do ente</span><span className="text-right">Percentil</span></div>
                  {[
                    { d: "Autonomia (tributária/receita)", v: `${minhaPos.autonomia.toFixed(0)}%`, p: minhaPos.pctAutonomia },
                    { d: "Investimento (invest./despesa)", v: `${minhaPos.investimento.toFixed(0)}%`, p: minhaPos.pctInvestimento },
                    { d: "Equilíbrio (resultado/receita)", v: `${minhaPos.equilibrio.toFixed(1)}%`, p: minhaPos.pctEquilibrio },
                    { d: "Pessoal (pessoal/receita · invertido)", v: `${minhaPos.pessoal.toFixed(0)}%`, p: minhaPos.pctPessoal },
                  ].map((r) => (
                    <div key={r.d} className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-slate-100 px-3 py-1 tabular-nums"><span className="text-slate-600">{r.d}</span><span className="text-right text-slate-500">{r.v}</span><strong className="text-right text-slate-800">{r.p.toFixed(1)}</strong></div>
                  ))}
                  <div className="grid grid-cols-[1fr_auto] gap-x-4 bg-teal-50/50 px-3 py-1 tabular-nums"><span className="font-semibold text-teal-800">Índice = média dos 4 percentis</span><strong className="text-right text-teal-800">{minhaPos.score.toFixed(1)}</strong></div>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Percentil 100 = melhor posição em SC; 0 = pior. Pessoal é invertido (menor gasto → maior percentil). Fonte: SICONFI/RREO · exercício {a.ano}.</p>
              </details>
              <Carimbo className="mt-2" fonte="SICONFI · RREO (Tesouro Nacional)" competencia={`exercício ${a.ano}`} extraido={extracao.financas} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><Wallet className="h-4 w-4 text-teal-600" /> Receita arrecadada {a.ano}</div>
              <div className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">{fmtBRLCompact(a.receita)}</div>
              {deltaRec != null && (
                <div className={`text-xs font-medium ${deltaRec >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {deltaRec >= 0 ? "▲" : "▼"} {Math.abs(deltaRec).toFixed(1)}% vs. {anterior!.ano}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><Landmark className="h-4 w-4 text-indigo-600" /> Despesa empenhada {a.ano}</div>
              <div className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">{fmtBRLCompact(a.despesa)}</div>
              <div className="text-xs text-slate-500">{pctArrec.toFixed(0)}% da receita prevista arrecadada</div>
            </div>
            <div className={`rounded-2xl border p-4 ${superavit ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                {superavit ? <TrendingUp className="h-4 w-4 text-emerald-600" /> : <TrendingDown className="h-4 w-4 text-rose-600" />} Resultado {a.ano}
              </div>
              <div className={`mt-1 font-display text-2xl font-bold tracking-tight ${superavit ? "text-emerald-700" : "text-rose-700"}`}>{fmtBRLCompact(resultado)}</div>
              <div className="text-xs font-medium text-slate-500">{superavit ? "Superávit" : "Déficit"}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><Wallet className="h-4 w-4 text-slate-500" /> Receita por habitante</div>
              <div className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">{ente.populacao ? fmtBRL(a.receita / ente.populacao) : "—"}</div>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-semibold text-slate-800">Evolução das finanças ({anoIni}–{anoFim})</h3>
            <p className="mb-2 text-xs text-slate-500">Receita arrecadada × despesa empenhada por exercício · dados oficiais SICONFI</p>
            <LinhasFinanceiras data={serie as unknown as Record<string, number>[]} linhas={[{ key: "receita", label: "Receita arrecadada", cor: "#0f766e" }, { key: "despesa", label: "Despesa empenhada", cor: "#e11d48" }]} />
          </section>

          {serie.some((s) => s.saude > 0) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-800">Composição da despesa por área</h3>
              <p className="mb-2 text-xs text-slate-500">Empenhado por função-chave, empilhado · {anoIni}–{anoFim} — mostra o peso de cada área e o total ao longo do tempo</p>
              <AreaEmpilhada data={serie as unknown as Record<string, number>[]} areas={[{ key: "saude", label: "Saúde", cor: "#0891b2" }, { key: "educacao", label: "Educação", cor: "#2563eb" }, { key: "infraestrutura", label: "Infraestrutura", cor: "#7c3aed" }, { key: "assistencia", label: "Assistência", cor: "#f59e0b" }]} />
            </section>
          )}
        </>
      ),
    },
    ...(indicadores.length > 0
      ? [{
          id: "indicadores",
          label: "Indicadores",
          content: (() => {
            const areas = Array.from(new Set(indicadores.map((i) => i.area)));
            const fmtVal = (v: number, un: string) => (un.includes("R$") ? fmtBRL(v) : v.toLocaleString("pt-BR")) + (un.includes("R$") ? "" : ` ${un}`);
            return (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Target className="h-4 w-4 text-teal-600" />
                    <h3 className="font-semibold text-slate-800">Indicadores setoriais</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
                  </div>
                  <p className="text-xs text-slate-500">Indicadores reais coletados (vs. média de SC). Em expansão — educação e segurança dependem de fontes adicionais.</p>
                </div>
                {areas.map((ar) => (
                  <section key={ar} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="mb-3 font-semibold text-slate-800">{indicadores.find((i) => i.area === ar)?.areaLabel}</h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {indicadores.filter((i) => i.area === ar).map((i) => {
                        const acima = i.valor >= i.media;
                        return (
                          <div key={i.codigo} className="rounded-xl border border-slate-200 p-4">
                            <div className="text-xs text-slate-500">{i.nome}</div>
                            <div className="mt-1 font-display text-xl font-bold tabular-nums text-slate-900">{fmtVal(i.valor, i.unidade)}</div>
                            <div className="mt-0.5 text-[11px] text-slate-500">Média SC: <span className="tabular-nums">{fmtVal(Math.round(i.media * 10) / 10, i.unidade)}</span> · <span className={acima ? "text-emerald-600" : "text-amber-600"}>{acima ? "▲ acima" : "▼ abaixo"}</span></div>
                            <div className="mt-0.5 text-[10px] text-slate-400">Fonte: {i.fonte}</div>
                          </div>
                        );
                      })}
                    </div>
                    {indicadores.filter((i) => i.area === ar && (seriesInd[i.codigo]?.length ?? 0) > 1).map((i) => (
                      <div key={`s-${i.codigo}`} className="mt-4 border-t border-slate-100 pt-4">
                        <h4 className="text-sm font-semibold text-slate-700">{i.nome} — série histórica</h4>
                        {i.codigo === "transferencia_renda_por_mil_hab" && <p className="mb-1 text-[11px] text-slate-500">Bolsa Família → Auxílio Brasil → Novo Bolsa Família</p>}
                        <LinhasFinanceiras data={seriesInd[i.codigo] as unknown as Record<string, number>[]} linhas={[{ key: "valor", label: i.unidade || "valor", cor: "#0f766e" }]} moeda={i.unidade.includes("R$")} />
                      </div>
                    ))}
                  </section>
                ))}
              </>
            );
          })(),
        }]
      : []),
    {
      id: "financas",
      label: "Finanças",
      content: (
        <>
          {divida && <div className="mb-4"><DividaPanel data={divida} nome={ente.nome} /></div>}{capag && <div className="mb-4"><CapagPanel d={capag} /></div>}{cfem && <div className="mb-4"><CfemPanel d={cfem} /></div>}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Carimbo fonte="SICONFI · RREO (Tesouro Nacional)" competencia={`série ${dados.serie[0]?.ano}–${a.ano}`} extraido={extracao.financas} />
            <BaixarCsv nome={`serie-financeira-${ente.nome}`} label="Baixar série financeira (CSV)" linhas={dados.serie as unknown as Record<string, unknown>[]}
              colunas={[
                { chave: "ano", rotulo: "Ano" }, { chave: "receita", rotulo: "Receita" }, { chave: "receita_prevista", rotulo: "Receita prevista" },
                { chave: "tributaria", rotulo: "Receita tributaria" }, { chave: "transferencias", rotulo: "Transferencias" }, { chave: "outras", rotulo: "Outras receitas" },
                { chave: "despesa", rotulo: "Despesa" }, { chave: "resultado", rotulo: "Resultado orcamentario" }, { chave: "pessoal", rotulo: "Pessoal" },
                { chave: "custeio", rotulo: "Custeio" }, { chave: "investimento", rotulo: "Investimento" }, { chave: "divida", rotulo: "Divida" },
                { chave: "saude", rotulo: "Funcao Saude" }, { chave: "educacao", rotulo: "Funcao Educacao" }, { chave: "seguranca", rotulo: "Funcao Seguranca" },
                { chave: "assistencia", rotulo: "Funcao Assistencia" }, { chave: "infraestrutura", rotulo: "Funcao Infraestrutura" }, { chave: "administracao", rotulo: "Funcao Administracao" },
              ]} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-800">De onde vem o dinheiro · {a.ano}</h3>
              <p className="mb-2 text-xs text-slate-500">Receita arrecadada por origem</p>
              <Donut data={receitaData} />
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-800">Como o dinheiro é gasto · {a.ano}</h3>
              <p className="mb-2 text-xs text-slate-500">Despesa empenhada por categoria econômica</p>
              <Donut data={despesaData} />
            </section>
          </div>
          {funcData.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-800">Orçado × Executado por função · LOA {a.ano}</h3>
              <p className="mb-2 text-xs text-slate-500">Dotação atualizada × despesa empenhada — principais funções</p>
              <OrcadoExecutado data={funcData} />
            </section>
          )}
          {/* PRECATÓRIOS — estoque em R$ (API TJSC, regime especial) + regularidade do pagamento (CAUC 1.2). */}
          {(precatorios || cauc?.itens.find((i) => i.codigo === "1.2")) && (() => {
            const prec = cauc?.itens.find((i) => i.codigo === "1.2");
            const meta = !prec ? null
              : prec.status === "regular" ? { chip: "bg-emerald-100 text-emerald-700", txt: `Pagamento regular${prec.validade ? ` · até ${prec.validade}` : ""}` }
              : prec.status === "vencido" ? { chip: "bg-rose-100 text-rose-700", txt: `Pagamento em atraso${prec.validade ? ` · venceu ${prec.validade}` : ""}` }
              : prec.status === "pendente" ? { chip: "bg-amber-100 text-amber-700", txt: "Não comprovado (CAUC)" }
              : { chip: "bg-slate-100 text-slate-500", txt: "Regularidade: N/A" };
            const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
            return (
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 font-semibold text-slate-800">⚖️ Precatórios judiciais</h3>
                  {meta && <span className={`rounded-full px-3 py-1 text-xs font-bold ${meta.chip}`}>{meta.txt}</span>}
                </div>
                {precatorios ? (
                  <>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-1">
                      <div><span className="text-2xl font-bold text-slate-800 tabular-nums">{brl(precatorios.valor)}</span> <span className="text-xs text-slate-500">estoque de precatórios</span></div>
                      <div><span className="text-lg font-semibold text-slate-700 tabular-nums">{precatorios.qtde.toLocaleString("pt-BR")}</span> <span className="text-xs text-slate-500">precatórios · {precatorios.nEntes} órgão(s) devedor(es)</span></div>
                    </div>
                    {precatorios.entes.length > 0 && (
                      <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-sm">
                        {precatorios.entes.map((e, i) => (
                          <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                            <span className="truncate text-slate-600">{e.nome}{e.regime && !/geral/i.test(e.regime) ? <span className="ml-1 text-[10px] text-amber-600">({e.regime})</span> : null}</span>
                            <span className="shrink-0 tabular-nums text-slate-700">{brl(e.valor)} <span className="text-[11px] text-slate-400">· {e.qtde}</span></span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-600">Sem precatórios registrados no Regime Especial do TJSC para este município.</p>
                )}
                <p className="mt-2 text-[11px] text-slate-400">Fonte: <b>TJSC — Regime Especial de Precatórios</b> (estoque e quantidade por órgão devedor) + <b>CAUC item 1.2</b>, Tesouro (regularidade do pagamento). Precatório não pago no prazo <b>impede transferências voluntárias</b> da União e pode levar a sequestro de recursos.</p>
              </section>
            );
          })()}
        </>
      ),
    },
    { id: "compras", label: "Compras", content: <>
      <CabecalhoArea titulo="Compras & Contratos" intro="Como o município compra e contrata: o que a Lei 14.133/2021 exige, onde mora o risco (compra sem licitação, sobrepreço) e onde economizar — do total contratado ao preço unitário, item a item." links={[{ label: "PNCP — Portal Nacional de Contratações Públicas", href: "https://pncp.gov.br" }, { label: "Lei 14.133/2021 — Nova Lei de Licitações", href: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm" }, { label: "TCE-SC", href: "https://www.tcesc.tc.br" }]} />
      {/* ESTUDOS COMPARATIVOS DE COMPRAS — FORA DO AR (distorção: comparação por valor TOTAL; refazer por VALOR UNITÁRIO item a item).
          Desativados: ResumoCompras (economia), PesquisaPreco, AnaliseComprasItens (sobrepreço/mais comprados), ComprasExtraCard (dispersão), SazonalidadePreco.
          Mantidos (dado do próprio município, sem comparação): ComprasSCSection, ComprasCategorias, FornecedoresCard. */}
      <Carimbo className="mb-3" fonte="PNCP · Compras.gov.br (Portal Nacional de Contratações Públicas)" competencia="todos os anos publicados" extraido={extracao.itens ?? extracao.processos ?? extracao.compras} />
      <div className="mb-4"><BancoPrecos /></div>
      <ComprasSCSection codigo={ente.cod_ibge} tipo={ente.tipo} />
      {fornec && <div className="mt-4"><FornecedoresCard dados={fornec} nome={ente.nome} /></div>}
      {sobrepreco && <div className="mt-4"><SobreprecoCompras data={sobrepreco} nome={ente.nome} /></div>}
      {variacaoInterna && <div className="mt-4"><VariacaoInterna data={variacaoInterna} nome={ente.nome} /></div>}
      {redFlags && <div className="mt-4"><RedFlagsFornecedores data={redFlags} nome={ente.nome} /></div>}
      {mislabel && <div className="mt-4"><MislabelUnidade data={mislabel} nome={ente.nome} /></div>}
      {fornecSancionados && <div className="mt-4"><FornecedoresSancionados data={fornecSancionados} nome={ente.nome} /></div>}
      <div className="mt-4"><BaseMetodologica area="compras" /></div>
    </> },
    ...(padroesCompras ? [{ id: "padroes-compras", label: "Planejamento de Compras", content: <><AssuntoPadroesCompras dados={padroesCompras} contratos={contratosResumo} pca={pcaResumo} economia={economicidade} nome={ente.nome} /><div className="mt-4"><CatalogoBoasPraticas area="compras" /></div></> }] : []),
    { id: "construtor-tr", label: "Processo Licitatório", content: <>
      <CabecalhoArea titulo="Construtor de Processo Licitatório" intro="Monte a licitação do jeito certo, de ponta a ponta: a partir de uma cesta de itens (com CATMAT e preço de referência do Banco de Preços) e um checador que evita a superespecificação, a plataforma gera todo o encadeamento da Lei 14.133/2021 — DFD → ETP → TR → Edital → Contrato — reaproveitando os mesmos dados. Cole também um documento pronto para uma análise de conformidade." links={[{ label: "Lei 14.133/2021 — Nova Lei de Licitações", href: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm" }, { label: "IN SEGES/ME 65/2021 — pesquisa de preços", href: "https://www.gov.br/compras/pt-br" }, { label: "TCE-SC", href: "https://www.tcesc.tc.br" }]} />
      <div className="mb-4"><ProcessoFases codigo={ente.cod_ibge} /></div>
      <ConstrutorProcesso nome={ente.nome} />
      <div className="mt-4"><AnalisadorDocumentos /></div>
    </> },
    ...(atas ? [{ id: "atas", label: "Atas (Registro de Preço)", content: <AtasPainel dados={atas} nome={ente.nome} /> }] : []),
    ...(contratosResumo
      ? [{
          id: "contratos",
          label: "Contratos",
          content: (
            <>
              {contratosVenc && contratosVenc.nCriticos > 0 && (
                <div className="mb-4 rounded-2xl border border-rose-300 bg-rose-50 p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div className="flex-1">
                      <div className="font-semibold text-rose-800">{contratosVenc.nCriticos} contrato(s) crítico(s) a vencer em menos de 30 dias</div>
                      <div className="text-sm text-rose-700">
                        {(() => { const cs = contratosVenc.aVencer.filter((x) => x.dias <= 30); if (!cs.length) return ""; const c = cs.reduce((a, b) => (b.valor > a.valor ? b : a)); return `Maior em risco: "${c.objeto.slice(0, 55)}" — ${fmtBRLCompact(c.valor)}, vence em ${c.dias} dia(s).`; })()} Planeje renovação ou nova licitação.
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <FileText className="h-4 w-4 text-teal-600" />
                  <h3 className="font-semibold text-slate-800">Contratos assinados · PNCP</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
                </div>
                <p className="mb-3 text-xs text-slate-500">Contratos efetivamente assinados (com fornecedor e vigência), vinculados aos processos licitatórios — fonte PNCP.</p>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Contratos assinados</div>
                    <div className="font-display text-xl font-bold tabular-nums text-slate-900">{contratosResumo.n.toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Valor global contratado</div>
                    <div className="font-display text-xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(contratosResumo.valor_total)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Fornecedores</div>
                    <div className="font-display text-xl font-bold tabular-nums text-slate-900">{contratosResumo.por_fornecedor.length}+</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Valor médio</div>
                    <div className="font-display text-xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(contratosResumo.n ? contratosResumo.valor_total / contratosResumo.n : 0)}</div>
                  </div>
                </div>
              </div>

              {/* Vigências + criticidade no topo (contador) */}
              <ContratosGestao vencimento={contratosVenc} itens={null} />

              {/* molde Niterói: cadeia de valor + accountability + como melhorar */}
              {(() => {
                const top1 = contratosResumo.por_fornecedor[0];
                const top1Pct = top1 && contratosResumo.valor_total > 0 ? (top1.valor / contratosResumo.valor_total) * 100 : 0;
                const irregulares = contratosResumo.por_fornecedor.filter((f) => f.situacao && f.situacao !== "ATIVA").length;
                const temEmpenho = !!contratosResumo.execucao && contratosResumo.execucao.empenhoTotal > 0;
                return (
                  <>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <h3 className="text-sm font-semibold text-slate-800">A cadeia de valor do contrato</h3>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3"><div className="text-sm font-semibold text-slate-800">💰 Dinheiro</div><div className="mt-1 text-base font-bold text-slate-800">{fmtBRLCompact(contratosResumo.valor_total)}</div><div className="text-[11px] text-slate-500">valor contratado</div></div>
                        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3"><div className="text-sm font-semibold text-slate-800">🏭 Produção</div><div className="mt-1 text-base font-bold text-slate-800">{contratosResumo.n} contratos</div><div className="text-[11px] text-slate-500">{contratosResumo.por_fornecedor.length}+ fornecedores</div></div>
                        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3"><div className="text-sm font-semibold text-slate-800">❤️ Benefício</div><div className="mt-1 text-base font-bold text-slate-800">Bens e serviços</div><div className="text-[11px] text-slate-500">entregues à população</div></div>
                      </div>
                      <h4 className="mt-4 text-xs font-semibold text-slate-700">Do contrato à entrega (accountability)</h4>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-400">1. Contratado</div><div className="text-lg font-bold tabular-nums text-slate-800">{fmtBRLCompact(contratosResumo.valor_total)}</div></div>
                        <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-400">2. Empenhado</div><div className="text-lg font-bold tabular-nums text-slate-800">{temEmpenho ? fmtBRLCompact(contratosResumo.execucao!.empenhoTotal) : "—"}</div><div className="text-[11px] text-slate-500">{temEmpenho ? "publicado no PNCP" : "ainda não publicado em SC"}</div></div>
                        <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] text-slate-400">3. Notas fiscais</div><div className="text-lg font-bold tabular-nums text-slate-800">{contratosResumo.execucao ? contratosResumo.execucao.nfTotal : 0}</div></div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-5">
                      <h3 className="text-sm font-semibold text-slate-800">✅ Como melhorar a gestão dos contratos</h3>
                      <ul className="mt-2 space-y-2 text-sm text-slate-700">
                        <li>⚖️ Designe <b>gestor e fiscal</b> para cada contrato e acompanhe a execução (prazos, qualidade, aderência). <span className="block text-[11px] text-slate-400">Base: Gabriela Verona Pércio / Tatiana Camarão — gestão de contratos</span></li>
                        {top1Pct > 30 && <li>⚠️ Um fornecedor concentra <b>{top1Pct.toFixed(0)}%</b> do valor contratado — avalie ampliar a competição e revisar a especificação. <span className="block text-[11px] text-slate-400">Base: Joel de Menezes Niebuhr — competitividade</span></li>}
                        {irregulares > 0 && <li>⚠️ <b>{irregulares}</b> fornecedor(es) com situação cadastral não-ATIVA — verifique a regularidade antes de pagar.</li>}
                        {!temEmpenho && <li>📡 Publique o <b>ciclo de execução</b> (empenho, nota fiscal, pagamento) no PNCP — accountability e conformidade com a Lei 14.133.</li>}
                        <li>📅 Acompanhe as <b>vigências</b> para renovar ou licitar com antecedência, evitando contratação emergencial. <span className="block text-[11px] text-slate-400">Base: Min. Zymler / Christianne Stroppa — governança e controle</span></li>
                      </ul>
                    </div>
                  </>
                );
              })()}

              <ContratosGestao vencimento={null} itens={contratosItens} />

              {contratosResumo.por_fornecedor.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="font-semibold text-slate-800">Maiores fornecedores</h3>
                  <p className="mb-2 text-xs text-slate-500">Valor global contratado por fornecedor · origem (cidade/UF) do vencedor</p>
                  {contratosResumo.localidade && (
                    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <b className="text-teal-700">{contratosResumo.localidade.scPct}%</b> do valor foi para fornecedores de <b>SC</b> · <b className="text-amber-700">{contratosResumo.localidade.foraPct}%</b> para fora do estado
                      {contratosResumo.localidade.topUF.length > 0 ? ` (principais origens externas: ${contratosResumo.localidade.topUF.map((u) => u.uf).join(", ")})` : ""}.
                      <span className="mt-0.5 block text-[11px] text-slate-500">Origem resolvida em {contratosResumo.localidade.resolvidoPct}% do valor (CNPJ → Receita Federal).</span>
                    </div>
                  )}
                  <div className="mb-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                          <th className="p-2 font-medium">Fornecedor</th>
                          <th className="p-2 font-medium">Origem (cidade/UF)</th>
                          <th className="hidden p-2 text-right font-medium sm:table-cell">Contratos</th>
                          <th className="p-2 text-right font-medium">Contratado</th>
                          <th className="p-2 text-right font-medium">Empenhado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contratosResumo.por_fornecedor.map((f) => (
                          <tr key={f.ni || f.nome} className="border-b border-slate-100 align-top">
                            <td className="p-2 text-slate-700">
                              <span className="line-clamp-1">{f.nome}</span>
                              {f.situacao && f.situacao !== "ATIVA" && <span className="mt-0.5 inline-block rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">⚠ {f.situacao}</span>}
                            </td>
                            <td className="p-2">
                              {f.uf
                                ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${f.uf === "SC" ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>{f.municipio ? `${f.municipio.charAt(0) + f.municipio.slice(1).toLowerCase()}/${f.uf}` : f.uf}{f.uf !== "SC" ? " · fora" : ""}</span>
                                : <span className="text-[11px] text-slate-400">em resolução</span>}
                            </td>
                            <td className="hidden p-2 text-right tabular-nums text-slate-500 sm:table-cell">{f.n}</td>
                            <td className="p-2 text-right font-semibold tabular-nums text-slate-800">{fmtBRLCompact(f.valor)}</td>
                            <td className="p-2 text-right tabular-nums text-slate-500">{f.empenhado > 0 ? fmtBRLCompact(f.empenhado) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mb-3 text-[11px] text-slate-500">
                    <b>Contratado</b> = valor do contrato (PNCP, disponível hoje). <b>Empenhado</b> preenche automaticamente quando o município publicar o ciclo da execução no PNCP (Lei 14.133) —
                    {contratosResumo.execucao && contratosResumo.execucao.empenhoTotal > 0 ? ` já há empenhos publicados.` : ` ainda 0 em SC.`}
                    {contratosResumo.execucao && contratosResumo.execucao.nfTotal > 0 ? ` Notas fiscais: ${contratosResumo.execucao.nfTotal}.` : ""}
                  </p>
                  <Donut data={contratosResumo.por_fornecedor.map((f) => ({ label: f.nome, valor: f.valor }))} />
                </section>
              )}

              {contratosResumo.top.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-3 font-semibold text-slate-800">Maiores contratos</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                          <th className="p-2 font-medium">Objeto</th>
                          <th className="hidden p-2 font-medium md:table-cell">Fornecedor</th>
                          <th className="p-2 text-right font-medium">Valor global</th>
                          <th className="hidden p-2 font-medium lg:table-cell">Vigência</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contratosResumo.top.map((t, i) => (
                          <tr key={i} className="border-b border-slate-100 align-top">
                            <td className="p-2 text-slate-700"><span className="line-clamp-2">{t.objeto}</span></td>
                            <td className="hidden p-2 text-slate-500 md:table-cell"><span className="line-clamp-1">{t.fornecedor}</span></td>
                            <td className="p-2 text-right font-semibold tabular-nums text-slate-800">{fmtBRLCompact(t.valor)}</td>
                            <td className="hidden p-2 text-slate-500 lg:table-cell">{fmtData(t.vigInicio)}{t.vigFim ? ` → ${fmtData(t.vigFim)}` : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Fonte: PNCP (/contratos). Cada contrato está vinculado ao seu processo licitatório (ver aba Compras).</p>
                </section>
              )}
            </>
          ),
        }]
      : []),
    ...(pcaResumo
      ? [{
          id: "planejamento",
          label: "Planejamento",
          content: (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-teal-600" />
                  <h3 className="font-semibold text-slate-800">Planejamento de compras · PCA</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
                </div>
                <p className="mb-3 text-xs text-slate-500">Plano Anual de Contratações (o que o ente <strong>planejou comprar</strong>) — fonte PNCP. Cruzamento inédito: <strong>planejado × contratado</strong>.</p>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Itens planejados</div>
                    <div className="font-display text-xl font-bold tabular-nums text-slate-900">{pcaResumo.n_itens.toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Valor planejado (PCA)</div>
                    <div className="font-display text-xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(pcaResumo.valor_total)}</div>
                  </div>
                  {contratosResumo && (
                    <div className="rounded-xl border border-slate-200 p-3">
                      <div className="text-xs text-slate-500">Contratado (PNCP)</div>
                      <div className="font-display text-xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(contratosResumo.valor_total)}</div>
                    </div>
                  )}
                  {contratosResumo && pcaResumo.valor_total > 0 && (
                    <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
                      <div className="text-xs text-slate-500">Contratado ÷ planejado</div>
                      <div className="font-display text-xl font-bold tabular-nums text-teal-700">{((contratosResumo.valor_total / pcaResumo.valor_total) * 100).toFixed(0)}%</div>
                    </div>
                  )}
                </div>
              </div>

              {pcaResumo.por_categoria.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="font-semibold text-slate-800">O que foi planejado, por categoria</h3>
                  <p className="mb-2 text-xs text-slate-500">Valor planejado por categoria do PCA</p>
                  <Donut data={pcaResumo.por_categoria.map((c) => ({ label: c.nome, valor: c.valor }))} />
                </section>
              )}

              {pcaResumo.top.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-3 font-semibold text-slate-800">Maiores itens planejados</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                          <th className="p-2 font-medium">Item planejado</th>
                          <th className="hidden p-2 font-medium md:table-cell">Categoria</th>
                          <th className="p-2 text-right font-medium">Valor estimado</th>
                          <th className="hidden p-2 text-center font-medium sm:table-cell">Ano PCA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pcaResumo.top.map((t, i) => (
                          <tr key={i} className="border-b border-slate-100 align-top">
                            <td className="p-2 text-slate-700"><span className="line-clamp-2">{t.descricao}</span></td>
                            <td className="hidden p-2 text-slate-500 md:table-cell"><span className="line-clamp-1">{t.categoria}</span></td>
                            <td className="p-2 text-right font-semibold tabular-nums text-slate-800">{fmtBRLCompact(t.valor)}</td>
                            <td className="hidden p-2 text-center tabular-nums text-slate-500 sm:table-cell">{t.anoPca || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Fonte: PNCP (/pca). O cruzamento planejado × contratado pode abranger anos/escopos distintos; use como indicativo de execução do plano.</p>
                </section>
              )}
            </>
          ),
        }]
      : []),
    ...(metasFiscais
      ? [{
          id: "metas",
          label: "Metas fiscais",
          content: (() => {
            const mf = metasFiscais.latest;
            const cumpriuPrim = mf.resultado_primario != null && mf.meta_primario != null ? mf.resultado_primario >= mf.meta_primario : null;
            const dclSerie = metasFiscais.serie.filter((s) => s.dcl_fim != null).map((s) => ({ ano: s.ano, dcl: Number(s.dcl_fim) }));
            return (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Target className="h-4 w-4 text-teal-600" />
                    <h3 className="font-semibold text-slate-800">Metas fiscais · LDO {mf.ano}</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
                  </div>
                  <p className="mb-3 text-xs text-slate-500">Meta fixada no <strong>Anexo de Metas Fiscais da LDO</strong> × resultado realizado — fonte SICONFI (RREO Anexo 06).</p>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className={`rounded-xl border p-4 ${cumpriuPrim == null ? "border-slate-200" : cumpriuPrim ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                      <div className="text-xs font-medium text-slate-500">Resultado Primário {mf.ano}</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-display text-2xl font-bold tabular-nums text-slate-900">{mf.resultado_primario != null ? fmtBRLCompact(mf.resultado_primario) : "—"}</span>
                        <span className="text-xs text-slate-500">realizado</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">Meta LDO: <strong>{mf.meta_primario != null ? fmtBRLCompact(mf.meta_primario) : "—"}</strong></div>
                      {cumpriuPrim != null && <div className={`mt-1 text-xs font-semibold ${cumpriuPrim ? "text-emerald-700" : "text-amber-700"}`}>{cumpriuPrim ? "✓ Meta atingida" : "Abaixo da meta"}</div>}
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="text-xs font-medium text-slate-500">Resultado Nominal {mf.ano}</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-display text-2xl font-bold tabular-nums text-slate-900">{mf.resultado_nominal != null ? fmtBRLCompact(mf.resultado_nominal) : "—"}</span>
                        <span className="text-xs text-slate-500">realizado</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">Meta LDO: <strong>{mf.meta_nominal != null ? fmtBRLCompact(mf.meta_nominal) : "—"}</strong></div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Receita primária prevista</div><div className="font-display text-lg font-bold tabular-nums text-slate-900">{mf.receita_prim_prev != null ? fmtBRLCompact(mf.receita_prim_prev) : "—"}</div></div>
                    <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Receita primária realizada</div><div className="font-display text-lg font-bold tabular-nums text-slate-900">{mf.receita_prim_real != null ? fmtBRLCompact(mf.receita_prim_real) : "—"}</div></div>
                    <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Despesa primária (dotação)</div><div className="font-display text-lg font-bold tabular-nums text-slate-900">{mf.despesa_prim_dot != null ? fmtBRLCompact(mf.despesa_prim_dot) : "—"}</div></div>
                    <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Despesa primária (empenhada)</div><div className="font-display text-lg font-bold tabular-nums text-slate-900">{mf.despesa_prim_emp != null ? fmtBRLCompact(mf.despesa_prim_emp) : "—"}</div></div>
                  </div>
                </div>

                {dclSerie.length > 1 && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="font-semibold text-slate-800">Dívida Consolidada Líquida (evolução)</h3>
                    <p className="mb-2 text-xs text-slate-500">Saldo da DCL por exercício · SICONFI</p>
                    <LinhasFinanceiras data={dclSerie as unknown as Record<string, number>[]} linhas={[{ key: "dcl", label: "Dívida Consolidada Líquida", cor: "#e11d48" }]} />
                  </section>
                )}
                <p className="px-1 text-[11px] text-slate-400">Fonte: SICONFI — RREO Anexo 06 (Demonstrativo do Resultado Primário e Nominal). Meta = Anexo de Metas Fiscais da LDO. No resultado primário, realizado ≥ meta indica cumprimento.</p>
              </>
            );
          })(),
        }]
      : []),
    { id: "transferencias", label: "Transferências", content: <TransferenciasSCSection codigo={ente.cod_ibge} /> },
    ...(rankingFiscal.length > 1
      ? [{
          id: "ranking",
          label: "Ranking",
          content: (() => {
            const top = rankingFiscal.slice(0, 15);
            const fora = minhaPos && minhaPos.posicao > 15 ? minhaPos : null;
            const medalha = (pos: number) => (pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : null);
            const Row = (r: typeof rankingFiscal[number], destaque: boolean) => (
              <tr key={r.cod_ibge} className={`border-b border-slate-100 ${destaque ? "bg-teal-50 font-semibold ring-1 ring-inset ring-teal-300" : ""}`}>
                <td className="p-2 tabular-nums text-slate-500"><span aria-hidden>{medalha(r.posicao) ?? `${r.posicao}º`}</span><span className="sr-only">{r.posicao}º</span></td>
                <td className="p-2 text-slate-700">{r.tipo === "E" ? `★ ${r.nome}` : r.nome}{destaque && <span className="ml-1.5 rounded bg-teal-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white align-middle">SEU MUNICÍPIO</span>}</td>
                <td className="p-2 text-right font-semibold tabular-nums text-teal-700">{r.score.toFixed(1)}</td>
                <td className="hidden p-2 text-right tabular-nums text-slate-500 sm:table-cell">{r.autonomia.toFixed(0)}%</td>
                <td className="hidden p-2 text-right tabular-nums text-slate-500 md:table-cell">{r.investimento.toFixed(0)}%</td>
                <td className="hidden p-2 text-right tabular-nums text-slate-500 md:table-cell">{r.equilibrio.toFixed(1)}%</td>
                <td className="hidden p-2 text-right tabular-nums text-slate-500 lg:table-cell">{r.pessoal.toFixed(0)}%</td>
              </tr>
            );
            return (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Target className="h-4 w-4 text-teal-600" />
                    <h3 className="font-semibold text-slate-800">Ranking fiscal · entes de Santa Catarina</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
                  </div>
                  <p className="text-xs text-slate-500">Índice Fiscal i10 Gov 360 (real) — média de percentis de autonomia, investimento, equilíbrio e peso de pessoal entre os {totalRank} entes.</p>
                  {minhaPos && <p className="mt-2 text-sm text-slate-700"><strong className="text-teal-700">{ente.nome}</strong>: índice <strong>{minhaPos.score.toFixed(1)}</strong> — <strong>{minhaPos.posicao}º</strong> de {totalRank}.</p>}
                </div>
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-3 font-semibold text-slate-800">Top 15 + sua posição</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                          <th className="p-2 font-medium">#</th>
                          <th className="p-2 font-medium">Ente</th>
                          <th className="p-2 text-right font-medium">Índice</th>
                          <th className="hidden p-2 text-right font-medium sm:table-cell">Autonomia</th>
                          <th className="hidden p-2 text-right font-medium md:table-cell">Investim.</th>
                          <th className="hidden p-2 text-right font-medium md:table-cell">Equilíbrio</th>
                          <th className="hidden p-2 text-right font-medium lg:table-cell">Pessoal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top.map((r) => Row(r, r.cod_ibge === codigo))}
                        {fora && (<><tr><td colSpan={7} className="p-1 text-center text-xs text-slate-400">⋯</td></tr>{Row(fora, true)}</>)}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Índice fiscal real (SICONFI). Os índices completos do i10 Gov 360 (ICEB/INVP/IGP 360) dependem de indicadores setoriais (saúde/educação/segurança/social/economia) ainda a coletar.</p>
                </section>
              </>
            );
          })(),
        }]
      : []),
  ];

  const comprasDestinos = await getComprasDestinosSC(codigo === "42" ? undefined : codigo); // Estado = agregado SC · município = destinos dele
  const diag = diagnostico ?? diagEstado; // município: vs pares · Estado: limites legais absolutos
  const insights = gerarInsightsSC({ diag, cruz, saude, educacao, pos: minhaPos, total: totalRank, rpps, captacao }); // análise automática (dado real)
  // Status da CRP + motivos do bloqueio (CRP vencida/judicial + pendência previdenciária no CAUC) — usado no Painel e na Captação
  const crpInfo = rpps?.crp ? (() => {
    const c = rpps.crp!; const motivos: string[] = [];
    if (c.vencido && c.validade) motivos.push(`certificado vencido em ${c.validade}${c.diasValidade != null && c.diasValidade < 0 ? ` (há ${Math.abs(c.diasValidade)} dias)` : ""}`);
    if (/judic/i.test(c.situacao)) motivos.push("regularidade obtida por decisão judicial (sub judice)");
    if (cauc) for (const g of cauc.grupos.filter((g) => /previd/i.test(g))) motivos.push(`pendência no CAUC (${g})`);
    return { vencido: c.vencido, dias: c.diasValidade, validade: c.validade, motivos };
  })() : null;
  tabs.push({ id: "alertas", label: `Central de Alertas${alertas.length ? ` (${alertas.length})` : ""}`, content: (
    <>
      <CentralAlertas alertas={alertas} nome={ente.nome} />
      <p className="mt-3 text-[11px] text-slate-400">A Central de Alertas cruza CRP (previdência), CAUC, convênios, assistência social e fornecedores para revelar o que trava recursos ou expõe o município a risco — o &quot;ponto cego&quot; do gestor. Fontes oficiais; cada alerta traz a ação recomendada.</p>
      <div className="mt-4"><PainelImpacto resumo={notifResumo} /></div>
      <div className="mt-4"><ResolverAlertas codigo={codigo} /></div>
      <div className="mt-4"><CalendarioObrigacoes hoje={new Date().toISOString().slice(0, 10)} crpValidade={crpInfo?.validade ?? null} contratos={contratosVenc?.aVencer.map((c) => ({ objeto: c.objeto, vigFim: c.vigFim, dias: c.dias }))} /></div>
      <div className="mt-4"><BoletimGestao nome={ente.nome} alertas={alertas} resumo={notifResumo} /></div>
      <div className="mt-4"><AlertasNotificacao alertas={alertas} nome={ente.nome} /></div>
      <div className="mt-4"><CadastroServidor codigo={codigo} nome={ente.nome} /></div>
    </>
  ) });
  tabs.push({ id: "placar", label: "Visão do Prefeito", content: (
    <PlacarEstrategico nome={ente.nome} posicao={minhaPos?.posicao ?? null} total={totalRank || null} scoreFiscal={minhaPos?.score ?? null}
      tom={!diag ? null : diag.nAlertas === 0 ? "ok" : diag.nAlertas <= 2 ? "ressalva" : "critico"}
      saudePct={saude?.saudePct ?? null} educPct={educacao?.educPct ?? null} pessoalPct={rgfResumo?.pessoalPct ?? null} insights={insights} ano={diag?.ano ?? anoFim}
      iegm={iegmDados ? { faixa: iegmDados.finalFaixa, pct: iegmDados.finalPct } : null} crp={crpInfo} />
  ) });
  if (codigo === "42") { // Radar estadual de CRP — só na visão do Estado (SC)
    const radarCrp = await getRadarCrpSC();
    if (radarCrp) tabs.push({ id: "radar-crp", label: "Radar de CRP (SC)", content: <><RadarCrpSC data={radarCrp} /><div className="mt-4"><BaseMetodologica area="previdencia" /></div></> });
  }
  if (iegmDados) tabs.push({ id: "iegm", label: "Qualidade da Gestão (IEGM/TCE)", content: <><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Carimbo fonte="TCE-SC · IRB — Instituto Rui Barbosa (iegm.irbcontas.org.br)" competencia={`índice oficial · exercício ${iegmDados.ano}`} extraido={extracao.iegm} /><BaixarCsv nome={`iegm-${ente.nome}-${iegmDados.ano}`} label="Baixar IEGM (CSV)" colunas={[{ chave: "nome", rotulo: "Dimensao" }, { chave: "pct", rotulo: "Indice (%)" }, { chave: "faixa", rotulo: "Faixa" }]} linhas={[...iegmDados.dimensoes, { nome: "IEGM (final)", pct: iegmDados.finalPct, faixa: iegmDados.finalFaixa }]} /></div><AssuntoIEGM dados={iegmDados} nome={ente.nome} /><div className="mt-4"><BaseMetodologica area="controle" /></div></> });
  if (diag) tabs.splice(1, 0, { id: "diagnostico", label: "Diagnóstico", content: <DiagnosticoGestor data={diag} /> });

  // PANORAMA 360° — cruza todas as dimensões num radar (50 = mediana dos pares)
  const scP = (v: number, m: number, inv = false) => (m > 0 ? Math.max(0, Math.min(100, inv ? (m / Math.max(v, 0.01)) * 50 : (v / m) * 50)) : 50);
  const pcr = (x: number) => x.toFixed(1) + "%";
  const radar: { dimensao: string; valor: number; bruto: string }[] = [];
  if (cruz?.fiscal) {
    radar.push({ dimensao: "Autonomia", valor: scP(cruz.fiscal.autonomia, cruz.fiscal.autonomiaPares), bruto: pcr(cruz.fiscal.autonomia) });
    radar.push({ dimensao: "Independência", valor: scP(cruz.fiscal.dependencia, cruz.fiscal.dependenciaPares, true), bruto: pcr(cruz.fiscal.dependencia) + " dep." });
  }
  if (cruz?.compras) radar.push({ dimensao: "Compras", valor: scP(cruz.compras.dispensaPct, cruz.compras.dispensaPares, true), bruto: pcr(cruz.compras.dispensaPct) + " s/lic." });
  if (educacao?.alfab != null) radar.push({ dimensao: "Educação", valor: scP(educacao.alfab, educacao.alfabPares), bruto: pcr(educacao.alfab) + " alfab." });
  if (saude) {
    radar.push({ dimensao: "Rede saúde", valor: scP(saude.estabMil, saude.estabMilPares), bruto: saude.estabMil.toFixed(1) + "/mil" });
    if (saude.internMil > 0) radar.push({ dimensao: "Produção saúde", valor: scP(saude.internMil, saude.internMilPares), bruto: saude.internMil.toFixed(1) + " int/mil" });
  }
  if (cruz?.social?.transfRendaMil != null) radar.push({ dimensao: "Social", valor: scP(cruz.social.transfRendaMil, cruz.social.transfPares), bruto: cruz.social.transfRendaMil.toFixed(0) + "/mil" });
  if (radar.length >= 3) tabs.splice(1, 0, { id: "panorama", label: "Panorama", content: <PanoramaSC radar={radar} grupo={saude?.grupo || educacao?.grupo || cruz?.grupo || ""} /> });

  const toNoFin = (f: FuncaoSC): NoFin => ({ nome: f.nome, previsto: f.dotacao, realizado: f.empenhado, pct: f.dotacao > 0 ? (f.empenhado / f.dotacao) * 100 : 0, filhos: f.filhos && f.filhos.length ? f.filhos.map(toNoFin).sort((a, b) => b.previsto - a.previsto) : undefined });
  // árvore de despesa com subfunções DETALHADAS (RREO Anexo 02), tudo no MESMO exercício:
  // função = soma das subfunções (batem exato); dotação da função no mesmo ano → % execução real.
  let arvoreFunc: NoFin[];
  if (despSubfuncao && Object.keys(despSubfuncao.porFuncao).length) {
    arvoreFunc = Object.entries(despSubfuncao.porFuncao).map(([nome, subs]): NoFin => {
      const empenhado = subs.reduce((s, x) => s + x.empenhado, 0);
      const dotacao = despSubfuncao.dotacaoPorFuncao[nome] || empenhado;
      return {
        nome, previsto: dotacao, realizado: empenhado, pct: dotacao > 0 ? (empenhado / dotacao) * 100 : 100,
        filhos: subs.map((s) => ({ nome: s.subfuncao, previsto: s.empenhado, realizado: s.empenhado, pct: empenhado > 0 ? (s.empenhado / empenhado) * 100 : 0 })).sort((a, b) => b.realizado - a.realizado),
      };
    }).sort((x, y) => y.realizado - x.realizado);
  } else {
    arvoreFunc = funcoesLatest.map(toNoFin).sort((x, y) => y.previsto - x.previsto);
  }
  const recToNoFin = (r: ReceitaSC): NoFin => ({ nome: r.nome, previsto: r.previsto, realizado: r.arrecadado, pct: r.previsto > 0 ? (r.arrecadado / r.previsto) * 100 : 0, filhos: r.filhos && r.filhos.length ? r.filhos.map(recToNoFin).sort((a, b) => b.realizado - a.realizado) : undefined });
  const arvoreRec: NoFin[] = (receitasLatest || []).map(recToNoFin).sort((x, y) => y.realizado - x.realizado);
  if (arvoreFunc.length || arvoreRec.length) tabs.push({
    id: "execucao", label: "Origem & Aplicação", content: (
      <div className="space-y-4">
        {arvoreRec.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-slate-800">💰 De onde vem o dinheiro — receita por fonte</h2>
            <p className="mb-3 text-sm text-slate-500">Previsto × arrecadado, por origem (receita própria, transferências, contribuições, capital). % = realização da receita.</p>
            <ArvoreFinanceira raizes={arvoreRec} colNome="Fonte da receita" colV1="Previsto" colV2="Arrecadado" />
          </div>
        )}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-slate-800">🏛️ Onde é gasto — despesa por função → subfunção</h2>
          <p className="mb-3 text-sm text-slate-500">Dotação × empenhado por função (RREO An.2, exercício {despSubfuncao?.anoUlt ?? ""}); clique para abrir as <b>subfunções</b> — a função é a <b>soma das subfunções</b> e a barra da subfunção mostra sua <b>participação na função</b>. <span className="text-slate-400">(inclui intra-orçamentárias; alinhamento ao total do resumo em andamento)</span></p>
          <ArvoreFinanceira raizes={arvoreFunc} colNome="Função" colV1="Dotação" colV2="Empenhado" />
        </div>
      </div>
    ),
  });
  if (diag) tabs.push({ id: "auditoria", label: "Auditoria", content: <AuditoriaLazy codigo={codigo} radar={radar} /> });
  // FRENTES DE EVOLUÇÃO COM O I10 — cenários acionáveis a partir do diagnóstico, ligados aos serviços de consultoria
  const frentesI10: FrenteI10[] = [];
  const naMesa = captacaoEmendas?.recursoNaMesa ?? 0;
  const lacSaude = lacunaSaude?.blocosAbaixo.reduce((s, b) => s + b.gap, 0) ?? 0;
  const lacEdu = lacunaEdu?.ausentes.reduce((s, a) => s + a.medianaPares, 0) ?? 0;
  const lacAssist = lacunaAssist?.blocosAbaixo.reduce((s, b) => s + b.gap, 0) ?? 0;
  const captTot = naMesa + lacSaude + lacEdu + lacAssist;
  if (captTot > 0) frentesI10.push({ area: "Captação", cor: "bg-amber-100 text-amber-700", titulo: "Captar recurso federal disponível", diagnostico: `${naMesa > 0 ? `${fmtBRLCompact(naMesa)} em emendas empenhadas aguardam pagamento. ` : ""}Há programas federais que municípios de mesmo porte captam e ${ente.nome} ainda não.`, ganho: `até ${fmtBRLCompact(captTot)}`, acao: "Cobrar a liberação das emendas na mesa e aderir aos programas ausentes.", servico: "Radar de Captação + articulação de emendas, convênios e programas federais." });
  if (minhaPos && minhaPos.autonomia < 25) frentesI10.push({ area: "Receita", cor: "bg-teal-100 text-teal-700", titulo: "Recuperar receita própria", diagnostico: `Autonomia de ${minhaPos.autonomia.toFixed(0)}% (receita própria ÷ total) — há espaço para ampliar a arrecadação local.`, acao: "Atualizar a planta genérica do IPTU, revisar o ISS e cobrar a dívida ativa.", servico: "Recuperação e otimização de receita municipal." });
  const fundebEvo = receitasDetalhe?.itens.find((i) => i.item === "FUNDEB")?.valor ?? 0;
  if (fundebEvo > 0) frentesI10.push({ area: "Educação", cor: "bg-blue-100 text-blue-700", titulo: "Ampliar o FUNDEB via tempo integral", diagnostico: `FUNDEB atual de ${fmtBRLCompact(fundebEvo)}; a matrícula em tempo integral pesa ~1,5× na distribuição do fundo.`, acao: "Expandir a oferta de tempo integral e ajustar o registro no Censo Escolar.", servico: "Educação: tempo integral, FUNDEB e BNCC Computação." });
  if (previne && previne.indicadores.length) { const avg = previne.indicadores.reduce((s, x) => s + x.pct, 0) / previne.indicadores.length; const avgP = previne.indicadores.reduce((s, x) => s + x.paresPct, 0) / previne.indicadores.length; if (avg < avgP - 2) frentesI10.push({ area: "Saúde", cor: "bg-rose-100 text-rose-700", titulo: "Elevar o incentivo da Atenção Primária (Previne)", diagnostico: `Indicadores do Previne Brasil em ${avg.toFixed(0)}% na média, contra ${avgP.toFixed(0)}% dos pares — o repasse de APS é por desempenho, então melhorar os indicadores aumenta o recurso.`, ganho: `+${(avgP - avg).toFixed(0)} p.p. de desempenho`, acao: "Fechar as lacunas dos indicadores (pré-natal, citopatológico, vacinação, hipertensão/diabetes).", servico: "Apoio à Atenção Primária e ao desempenho do Previne Brasil." }); }
  if (rgfResumo && rgfResumo.pessoalPct > 46) frentesI10.push({ area: "Fiscal", cor: "bg-purple-100 text-purple-700", titulo: "Reenquadrar a folha de pessoal", diagnostico: `Pessoal em ${rgfResumo.pessoalPct.toFixed(1)}% da RCL — próximo do limite prudencial da LRF (51,3%).`, acao: "Rever a estrutura de cargos e conter o crescimento vegetativo da folha.", servico: "Gestão fiscal e adequação à LRF." });
  // Previdência própria (RPPS) — déficit atuarial / CRP
  if (rpps && ((rpps.atuarial?.deficit ?? 0) < 0 || crpInfo?.vencido)) frentesI10.push({ area: "Previdência", cor: "bg-indigo-100 text-indigo-700", titulo: "Sanear o RPPS e garantir o CRP", diagnostico: `${(rpps.atuarial?.deficit ?? 0) < 0 ? `Déficit atuarial de ${fmtBRLCompact(-rpps.atuarial!.deficit)}. ` : ""}${crpInfo?.vencido ? "CRP vencido — bloqueia as transferências voluntárias da União." : "Atenção à regularidade previdenciária (CRP)."}`, acao: "Plano de amortização/equacionamento do déficit e regularização do CRP junto à SPREV.", servico: "Consultoria previdenciária: avaliação atuarial, equacionamento e CRP." });
  // Extensão rural / agricultura familiar
  if (agropec && agropec.estabFamiliar > 0) frentesI10.push({ area: "Rural", cor: "bg-lime-100 text-lime-700", titulo: "Projetos de extensão rural e agricultura familiar", diagnostico: `${agropec.estabFamiliar.toLocaleString("pt-BR")} estabelecimentos de agricultura familiar (${agropec.pctEstabFamiliar.toFixed(0)}% do total)${agropec.pronaf ? `; PRONAF de ${fmtBRLCompact(agropec.pronaf.vlTotal)}` : ""}.`, acao: "Patrulha mecanizada, adesão ao PRONAF/CAF, regularização no CAR, PAA e assistência técnica (EPAGRI/CIDASC).", servico: "Desenvolvimento rural: projetos de extensão e captação agro." });
  // Melhoria dos processos de compras
  if ((sobrepreco?.totalEconomia ?? 0) > 0 || (redFlags?.nCriticos ?? 0) > 0) frentesI10.push({ area: "Compras", cor: "bg-orange-100 text-orange-700", titulo: "Melhorar os processos de compras", diagnostico: `${(sobrepreco?.totalEconomia ?? 0) > 0 ? `Indícios de economia de até ${fmtBRLCompact(sobrepreco!.totalEconomia)} por preço unitário. ` : ""}${(redFlags?.nCriticos ?? 0) > 0 ? `${redFlags!.nCriticos} fornecedor(es) em situação crítica (concentração + sanção).` : ""}`, ganho: (sobrepreco?.totalEconomia ?? 0) > 0 ? `até ${fmtBRLCompact(sobrepreco!.totalEconomia)}` : undefined, acao: "Planejamento de compras (PCA), preço de referência item-a-item e controle de fornecedores, sob a Lei 14.133.", servico: "Compras públicas: planejamento, preço de referência e conformidade (Lei 14.133)." });
  // Governança e planejamento
  if (iegmDados && !/^(A|B\+)/.test(iegmDados.finalFaixa)) frentesI10.push({ area: "Governança", cor: "bg-slate-200 text-slate-700", titulo: "Fortalecer a governança e o planejamento", diagnostico: `IEGM (TCE-SC) na faixa ${iegmDados.finalFaixa} (${iegmDados.finalPct.toFixed(0)}%) — há espaço em planejamento, controle interno e instrumentos de gestão.`, acao: "Alinhar PPA/LDO/LOA, estruturar o controle interno e os planos setoriais, conselhos e fundos.", servico: "Governança, planejamento público (PPA/LDO/LOA) e controle interno." });
  if (rgfResumo) tabs.push({ id: "simulador", label: "Simulador", content: <SimuladorFiscal ano={rgfResumo.ano} receita={a.receita} despesa={a.despesa} pessoal={a.pessoal} investimento={a.investimento} rclAjustada={rgfResumo.rclAjustada} pessoalPctBase={rgfResumo.pessoalPct} tributaria={a.tributaria} fundeb={fundebEvo} /> });
  // SOLUÇÕES i10 — seção PRÓPRIA, separada das abas de dados (diretriz: não misturar comercial com dado, p/ não confundir o usuário)
  const prioridadesProj = [lacunaSaude ? "saude" : "", lacunaEdu ? "educacao" : "", lacunaAssist ? "assistencia" : ""].filter(Boolean);
  const pontosI10 = insights.filter((i) => i.severidade === "critico" || i.severidade === "atencao").map((i) => ({ severidade: i.severidade, area: i.area, titulo: i.titulo, detalhe: i.detalhe }));
  if (conveniosRisco) { const crit = conveniosRisco.criticoN > 0; pontosI10.unshift({ severidade: crit ? "critico" : "atencao", area: "Convênios", titulo: crit ? "Convênios inadimplentes — risco de bloqueio de captação" : "Convênios a regularizar (prestação de contas)", detalhe: `${conveniosRisco.criticoN > 0 ? `${conveniosRisco.criticoN} convênio(s) inadimplente(s)/rejeitado(s) (${fmtBRLCompact(conveniosRisco.criticoValor)}). ` : ""}${conveniosRisco.atencaoN > 0 ? `${conveniosRisco.atencaoN} pendente(s) de prestação de contas (${fmtBRLCompact(conveniosRisco.atencaoValor)}). ` : ""}A inadimplência em convênio bloqueia novas transferências voluntárias da União (CAUC).` }); }
  if (cauc && (!cauc.apto || cauc.nPendencias > 0)) { const bloq = !cauc.apto; pontosI10.unshift({ severidade: bloq ? "critico" : "atencao", area: "CAUC", titulo: bloq ? "Pendências no CAUC — transferências voluntárias bloqueadas" : "Pendências no CAUC a regularizar", detalhe: `${cauc.nPendencias} pendência(s) no CAUC${cauc.grupos.length ? ` (${cauc.grupos.slice(0, 3).join(", ")}${cauc.grupos.length > 3 ? "…" : ""})` : ""}${cauc.dataPesquisa ? `, consulta de ${cauc.dataPesquisa}` : ""}. O CAUC é a checagem de regularidade que a União faz antes de liberar convênios e transferências voluntárias — regularizar destrava a captação.` }); }
  tabs.push({ id: "solucoes-i10", label: "Soluções i10", content: <><PlanoEvolucaoI10 nome={ente.nome} frentes={frentesI10} pontos={pontosI10} ausencias={planosAusentes(munic)} resumo={{ oportunidade: captTot, nRiscos: pontosI10.length, nProjetos: programasFederais.length }} /><div className="mt-4"><ProjetosElegiveis nome={ente.nome} programas={programasFederais} prioridades={prioridadesProj} /></div><div className="mt-4"><EstudoComprasI10 nome={ente.nome} /></div></> });
  if (etiDiag) tabs.push({ id: "solucoes-eti", label: "Educação Integral (ETI)", content: <>
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-5">
      <h3 className="text-base font-bold text-slate-900">🎒 Plano de Expansão da Educação em Tempo Integral — {ente.nome}</h3>
      <p className="text-sm text-slate-500">Diagnóstico, metas e monitoramento (Guia MEC) + o financiamento federal — o serviço i10 de apoio à expansão da ETI e captação do recurso.</p>
    </div>
    <div className="mt-4"><EtiPlanoDocumento d={etiDiag} evasao={evasao} fundebGanho={fundebGanho} escolasEti={escolasEti} nome={ente.nome} /></div>
    <div className="mt-4"><EtiDiagnosticoPanel d={etiDiag} /></div>
    {fundebGanho && <div className="mt-4"><FundebGanhoEtiPanel d={fundebGanho} /></div>}{escolasEti && <div className="mt-4"><EscolasEtiPanel d={escolasEti} /></div>}
    <div className="mt-4"><EtiPlanoPanel d={etiDiag} evasao={evasao} /></div>
  </> });
  if (saude) {
    const saudeConf = saude.saudePct != null
      ? { label: "Aplicação em saúde (ASPS)", valor: saude.saudePct, ancora: "mín. 15% — LC 141", nivel: (saude.saudePct >= 15 ? "ok" : saude.saudePct >= 14 ? "warn" : "bad") as "ok" | "warn" | "bad" }
      : null;
    const saudeInd = [
      { label: "Estabelecimentos/mil hab", valor: saude.estabMil.toFixed(1), sub: `pares: ${saude.estabMilPares.toFixed(1)}` },
      { label: "Internações/mil hab", valor: saude.internMil.toFixed(1), sub: `pares: ${saude.internMilPares.toFixed(1)}` },
      ...(saude.transfUniaoPct != null ? [{ label: "Saúde via União", valor: `${saude.transfUniaoPct.toFixed(1)}%`, sub: "% das transferências de saúde" }] : []),
    ];
    const saudeLinks = [
      ...(previneFicha ? [{ label: "Previne — como melhorar", href: "#previne-ficha" }] : []),
      ...(fnsSerie.length > 1 ? [{ label: "Repasses (histórico)", href: "#fns-historico" }] : []),
    ];
    tabs.push({ id: "saude", label: "Saúde — visão geral", content: (
      <>
        <CabecalhoArea titulo="Saúde" intro="Como a saúde do município está hoje, o que a lei exige, o que fazer e onde aprofundar — da visão geral ao indicador." conformidade={saudeConf} indicadores={saudeInd} insights={insights.filter((i) => /sa[úu]de/i.test(i.area))} links={saudeLinks} /><CarimboFontes className="mb-3 mt-1" fontes={["SIOPS (DATASUS)", "CNES", "FNS", "Previne/SISAB"]} />
        {/* ═══ GERENCIAL / ESTRATÉGICO — financiamento e decisão de recurso (secretário / prefeito) ═══ */}
        <NivelSaude icone="🎯" titulo="Gerencial / Estratégico" desc="Financiamento, mínimo constitucional e decisão de recurso." cor="#0891b2" />
        {siopsSerie.length > 0 && <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Carimbo fonte="SIOPS · Ministério da Saúde (DATASUS)" competencia={`aplicação em saúde (ASPS) · série ${siopsSerie[0]?.ano}–${siopsSerie[siopsSerie.length - 1]?.ano}`} extraido={extracao.siops} /><BaixarCsv nome={`siops-ficha-${ente.nome}`} label="Baixar ficha SIOPS (CSV)" colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "saudePct", rotulo: "Aplicado em saude (%)" }, { chave: "saudeMin", rotulo: "Minimo constitucional (%)" }, { chave: "saudeValor", rotulo: "Valor aplicado saude" }, { chave: "transfSaudeValor", rotulo: "Transferencias saude" }, { chave: "transfUniaoValor", rotulo: "Transferencias da Uniao" }]} linhas={siopsSerie as unknown as Record<string, unknown>[]} /></div>}
        <SaudeSC data={saude} previne={previne} fns={fns} />
        <div className="mt-4"><AnaliseSaude previne={previne} fns={fns} saude={saude} nome={ente.nome} /></div>
        {eficSaude && <div className="mt-4"><EficienciaSaude dados={eficSaude} nome={ente.nome} /></div>}

        {/* ═══ TÁTICO — indicadores, epidemiologia e produção (coordenador de área) ═══ */}
        <NivelSaude icone="📊" titulo="Tático" desc="Indicadores do município, epidemiologia e produção — tendência, série e metas. A Atenção Primária (Previne/SISAB) tem aba própria." cor="#ea580c" />
        {vitais && <div className="mb-4"><VitaisPanel d={vitais} /></div>}{ansCobertura && <div className="mb-4"><AnsCoberturaPanel d={ansCobertura} /></div>}{arboviroses && <div className="mb-4"><ArbovirosesPanel d={arboviroses} /></div>}{sinanAgravos && <div className="mb-4"><SinanAgravosPanel d={sinanAgravos} /></div>}{coberturaVacinal && <div className="mb-4"><CoberturaVacinalPanel d={coberturaVacinal} /></div>}{sim && <div className="mb-4"><SimPanel d={sim} /></div>}{sinasc && <div className="mb-4"><SinascPanel d={sinasc} /></div>}{mortInfantil && <div className="mb-4"><MortalidadeInfantilPanel d={mortInfantil} /></div>}{sih && <div className="mb-4"><SihPanel d={sih} /></div>}{siaProd && <div className="mb-4"><SiaProducaoPanel d={siaProd} /></div>}{apac && <div className="mb-4"><ApacPanel d={apac} /></div>}{raasMental && <div className="mb-4"><RaasSaudeMentalPanel d={raasMental} /></div>}{profSaude && <div className="mb-4"><ProfissionaisSaudePanel d={profSaude} /></div>}

        {/* ═══ TÉCNICO / OPERACIONAL — granular, insumo e preço (profissional na ponta) ═══ */}
        <NivelSaude icone="🔧" titulo="Técnico / Operacional" desc={`Dado granular — medicamento a medicamento e preço. A rede unidade a unidade (equipes e equipamentos por estabelecimento) está na aba "Equipamentos Públicos".`} cor="#16a34a" />
        {medicamentos && <div className="mb-4"><MedicamentosPanel d={medicamentos} /></div>}{farmPop && <div className="mb-4"><FarmaciaPopularPanel d={farmPop} /></div>}
        {sobreMed && <div className="mt-4"><SobreprecoMedicamentos data={sobreMed} nome={ente.nome} /></div>}
        <div className="mt-4"><CmedConsulta /></div>
        <div className="mt-4"><CatalogoBoasPraticas area="saude" /></div>
        <div className="mt-4"><BaseMetodologica area="saude" /></div>
      </>
    ) });
  }
  if (estabSaude) tabs.push({ id: "equipamentos-saude", label: "Equipamentos Públicos", content: <>
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-teal-50 to-white p-5">
      <h3 className="text-base font-bold text-slate-900">🏥 Equipamentos Públicos — Saúde</h3>
      <p className="text-sm text-slate-500">A rede de saúde de {ente.nome}, estabelecimento a estabelecimento (UBS, hospitais, UPA, CAPS) — composição, capacidade instalada e localização. Base para a regulação, referência e contrarreferência.</p>
    </div>
    <EstabSaudeLazy estabSaude={estabSaude} perfilSaude={perfilSaude} nome={ente.nome} />
  </> });
  if (previneFicha || prodAps || cobAps || indAps || finAps || qualInd || dinMesa || vinculo) tabs.push({ id: "previne-ficha", label: "Atenção Primária", content: <>{previneFicha && <><Carimbo className="mb-3" fonte="Ministério da Saúde · SISAB / Previne Brasil" competencia="índice de desempenho da APS" extraido={extracao.previne} /><AssuntoAtencaoPrimaria dados={previneFicha} nome={ente.nome} cod={codigo} /></>}{prodAps && <div className="mt-4"><ProducaoApsPanel d={prodAps} /></div>}{cobAps && <div className="mt-4"><CoberturaApsPanel d={cobAps} /></div>}{indAps && <div className="mt-4"><IndicadoresApsPanel d={indAps} /></div>}{qualInd && <div className="mt-4"><QualidadeIndicadoresApsPanel d={qualInd} /></div>}{dinMesa && <div className="mt-4"><DinheiroMesaApsPanel d={dinMesa} /></div>}{vinculo && <div className="mt-4"><VinculoApsPanel d={vinculo} /></div>}{finAps && <div className="mt-4"><FinanciamentoApsPanel d={finAps} /></div>}</> });
  if (fnsSerie.length > 1) tabs.push({ id: "fns-historico", label: "Histórico de Repasses", content: <><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Carimbo fonte="FNS · Fundo Nacional de Saúde (fundo-a-fundo)" competencia={`repasses de saúde · série ${fnsSerie[0]?.ano}–${fnsSerie[fnsSerie.length - 1]?.ano}`} extraido={extracao.fns} /><BaixarCsv nome={`repasses-saude-fns-${ente.nome}`} label="Baixar repasses de saúde (CSV)" colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "total", rotulo: "Total repassado" }, { chave: "custeio", rotulo: "Custeio" }, { chave: "investimento", rotulo: "Investimento" }]} linhas={fnsSerie as unknown as Record<string, unknown>[]} /></div><SerieExplicada serie={fnsSerie} escopo="fns" cod={codigo} nome={ente.nome} /></> });
  if (repassesSaude) tabs.push({ id: "repasses-saude", label: "Repasses da Saúde", content: <RepassesSaudeFicha dados={repassesSaude} nome={ente.nome} /> });
  if (macProducao.length && saude) {
    const mac = repassesSaude?.programas.find((p) => p.key === "mac");
    tabs.push({ id: "mac", label: "Hospitais e Especialidades", content: <AssuntoMAC producao={macProducao} repasseValor={mac?.valorUlt ?? null} repasseAno={repassesSaude?.anoUlt ?? null} internMil={saude.internMil} internMilPares={saude.internMilPares} nome={ente.nome} /> });
  }
  tabs.push({ id: "receitas", label: "Receitas (de onde vem)", content: <>{receitasDetalhe && <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Carimbo fonte="SICONFI · RREO (Tesouro Nacional)" competencia="receitas por origem" extraido={extracao.receitas_det ?? extracao.financas} /><BaixarCsv nome={`receitas-detalhadas-${ente.nome}`} label="Baixar receitas por ano (CSV)" colunas={[{ chave: "item", rotulo: "Receita" }, { chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Valor" }]} linhas={receitasDetalhe.itens.flatMap((i) => i.serie.map((s) => ({ item: i.item, ano: s.ano, valor: s.valor })))} /></div>}<AssuntoReceitas serie={dados.serie} detalhe={receitasDetalhe} nome={ente.nome} />{otimReceita && <div className="mt-4"><OtimizadorReceita dados={otimReceita} nome={ente.nome} /></div>}<div className="mt-4"><CatalogoBoasPraticas area="receita" /></div></> });
  tabs.push({ id: "despesas", label: "Despesas (para onde vai)", content: <>{dados.funcoesLatest.length > 0 && <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Carimbo fonte="SICONFI · RREO (Tesouro Nacional)" competencia={`despesa por função · ${a.ano}`} extraido={extracao.financas} /><div className="flex flex-wrap gap-2"><BaixarCsv nome={`despesa-por-funcao-${ente.nome}-${a.ano}`} label="Por função (CSV)" colunas={[{ chave: "nome", rotulo: "Função" }, { chave: "dotacao", rotulo: "Dotação" }, { chave: "empenhado", rotulo: "Empenhado" }]} linhas={dados.funcoesLatest as unknown as Record<string, unknown>[]} />{despSubfuncao && <BaixarCsv nome={`despesa-por-subfuncao-${ente.nome}-${despSubfuncao.anoUlt}`} label="Por subfunção (CSV)" colunas={[{ chave: "funcao", rotulo: "Função" }, { chave: "subfuncao", rotulo: "Subfunção" }, { chave: "empenhado", rotulo: "Empenhado" }]} linhas={Object.entries(despSubfuncao.porFuncao).flatMap(([f, subs]) => subs.map((s) => ({ funcao: f, subfuncao: s.subfuncao, empenhado: s.empenhado })))} />}</div></div>}<AssuntoDespesas serie={dados.serie} funcoes={dados.funcoesLatest} subfuncoes={despSubfuncao} pessoalPct={rgfResumo?.pessoalPct ?? null} nome={ente.nome} />{despFuncao && <div className="mt-4"><DespesaFuncaoPanel d={despFuncao} /></div>}{despNatureza && <div className="mt-4"><DespesaNaturezaPanel d={despNatureza} /></div>}{investSerie && <div className="mt-4"><InvestimentoPanel d={investSerie} /></div>}<div className="mt-4"><BaseMetodologica area="financas" /></div></> });
  if (previneFicha) {
    const aps = repassesSaude?.programas.find((p) => p.key === "aps");
    tabs.push({ id: "accountability-aps", label: "Da verba ao resultado", content: (
      <AccountabilityAPS previne={previneFicha} apsValor={aps?.valorUlt ?? null} apsAno={repassesSaude?.anoUlt ?? null} saudePct={saude?.saudePct ?? null} cauc={cauc} nome={ente.nome} cod={codigo} />
    ) });
  }
  if (educacao && educacaoSerie.length) tabs.push({ id: "educacao", label: "Educação", content: <><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Carimbo fonte="SICONFI · RREO (Tesouro Nacional)" competencia={`aplicação em educação · série ${educacaoSerie[0]?.ano}–${educacaoSerie[educacaoSerie.length - 1]?.ano}`} extraido={extracao.rreo_const ?? extracao.financas} /><BaixarCsv nome={`educacao-serie-${ente.nome}`} label="Baixar série de educação (CSV)" colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "educPct", rotulo: "Aplicacao educacao (%)" }, { chave: "educValor", rotulo: "Valor aplicado" }, { chave: "fundebPct", rotulo: "FUNDEB (%)" }]} linhas={educacaoSerie as unknown as Record<string, unknown>[]} /></div>{fundebPainel && <div className="mb-4"><FundebPainel data={fundebPainel} nome={ente.nome} /></div>}{indicadoresInep && <div className="mb-4"><IndicadoresInep data={indicadoresInep} nome={ente.nome} /></div>}{evasao && <div className="mb-4"><EvasaoPanel d={evasao} /></div>}{saeb && <div className="mb-4"><SaebPanel d={saeb} /></div>}{salEduc && <div className="mb-4"><SalarioEducacaoPanel d={salEduc} /></div>}{(ideb || fndeEdu) && <div className="mb-4"><AnaliseEducacao ideb={ideb} fnde={fndeEdu} censo={censoMatricula} nome={ente.nome} /></div>}<AssuntoEducacao serie={educacaoSerie} edu={educacao} fundebValor={receitasDetalhe?.itens.find((i) => i.item === "FUNDEB")?.valor ?? null} matriculas={escolas?.matriculas ?? null} nome={ente.nome} />{censoMatricula && <div className="mt-4"><MatriculasCard dados={censoMatricula} nome={ente.nome} /></div>}{perfilEdu && <div className="mt-4"><PerfilEducacao dados={perfilEdu} nome={ente.nome} /></div>}{censoTend && <div className="mt-4"><CensoTendencias dados={censoTend} nome={ente.nome} /></div>}{ideb && <div className="mt-4"><Carimbo className="mb-2" fonte="INEP · IDEB (SAEB + Censo Escolar)" competencia="índice oficial (bianual)" extraido={extracao.ideb} /><IdebPainel dados={ideb} nome={ente.nome} /></div>}{fndeEdu && <div className="mt-4"><FndeEducacaoCard dados={fndeEdu} nome={ente.nome} /></div>}{eficEdu && <div className="mt-4"><EficienciaEducacao dados={eficEdu} nome={ente.nome} /></div>}{pddeSaldo && <div className="mt-4"><PddeSaldoPanel d={pddeSaldo} /></div>}{pnaeAgri && <div className="mt-4"><PnaeAgriPanel d={pnaeAgri} /></div>}<div className="mt-4"><CatalogoBoasPraticas area="educacao" /></div><div className="mt-4"><BaseMetodologica area="educacao" /></div></> });
  if (diagPne) tabs.push({ id: "solucoes-pme", label: "Plano Municipal de Educação (PME)", content: <><div className="mb-3"><Carimbo fonte="MEC — Diagnóstico da Educação Nacional / PNE (2025)" competencia="metas do PNE × dados oficiais do município" extraido={diagPne.extraido} /></div><PmeProjetoDocumento d={diagPne} nome={ente.nome} /><div className="mt-4"><CicloPmePanel temPme={diagPne.temPme} /></div><div className="mt-4"><PrioridadesMetasPanel d={diagPne} /></div><div className="mt-4"><DiagnosticoPnePanel d={diagPne} /></div>{trajEdu && <div className="mt-4"><TrajetoriaEducacaoPanel d={trajEdu} /></div>}<div className="mt-4"><PmeAcoesPanel d={diagPne} /></div>{valorMag && <div className="mt-4"><ValorizacaoMagisterioPanel d={valorMag} /></div>}<div className="mt-4"><LevantamentoInternoPanel /></div><div className="mt-4"><PmeRoteiroPanel temPme={diagPne.temPme} /></div></> });
  else if (fndeEdu || perfilEdu || escolas) tabs.push({ id: "educacao", label: "Educação", content: <>{perfilEdu && <div className="mb-4"><PerfilEducacao dados={perfilEdu} nome={ente.nome} /></div>}{fndeEdu && <div className="mb-4"><FndeEducacaoCard dados={fndeEdu} nome={ente.nome} /></div>}<div className="mt-4"><BaseMetodologica area="educacao" /></div></> });
  if (educacao) tabs.push({ id: "educacao-cruz", label: "Comparativo", content: <EducacaoSC data={educacao} /> });
  if (assistSocial) {
    const assistConf = assistSocial.cadTaxaAtualizacao != null
      ? { label: "Atualização do CadÚnico", valor: assistSocial.cadTaxaAtualizacao, ancora: "quanto maior, melhor (gestão do cadastro)", nivel: (assistSocial.cadTaxaAtualizacao >= 80 ? "ok" : assistSocial.cadTaxaAtualizacao >= 70 ? "warn" : "bad") as "ok" | "warn" | "bad" }
      : null;
    const assistInd = [
      { label: "Equipamentos (CRAS)", valor: `${assistSocial.cras}`, sub: `${assistSocial.creas} CREAS${assistSocial.habPorCras != null ? ` · 1/${Math.round(assistSocial.habPorCras).toLocaleString("pt-BR")} hab` : ""}` },
      { label: "Famílias no CadÚnico", valor: assistSocial.cadFamilias.toLocaleString("pt-BR"), sub: `${assistSocial.cadPessoas.toLocaleString("pt-BR")} pessoas` },
      { label: "Bolsa Família", valor: assistSocial.pbfFamilias.toLocaleString("pt-BR"), sub: "famílias beneficiárias" },
      { label: "Cofinanciamento FNAS", valor: fmtBRLCompact(assistSocial.fnasUltimoAno), sub: `repasse ${assistSocial.anoUlt}` },
    ];
    tabs.push({ id: "assistencia", label: "Assistência — visão geral", content: <>
      <CabecalhoArea titulo="Assistência Social" intro={`A rede de proteção social de ${ente.nome}: cobertura (CRAS/CREAS), demanda (CadÚnico e pobreza), transferência de renda (Bolsa Família) e o cofinanciamento federal (FNAS) — da visão geral à série histórica.`} conformidade={assistConf} indicadores={assistInd} insights={insights.filter((i) => /assist/i.test(i.area))} links={[]} /><CarimboFontes className="mb-3 mt-1" fontes={["SUAS/MDS", "CadÚnico", "FNAS", "MI Social"]} />
      <AssistenciaSocialSC data={assistSocial} nome={ente.nome} />
      {igdm && <div className="mt-4"><IgdmPanel d={igdm} /></div>}{suasSaldo && <div className="mt-4"><SuasSaldoPanel d={suasSaldo} /></div>}
      <div className="mt-4"><CatalogoBoasPraticas area="assistencia" /></div>
      <div className="mt-4"><BaseMetodologica area="assistencia" /></div>
    </> });
  }
  if (receitaComp || pib || idhm || transfSerie) tabs.push({ id: "economia", label: "Economia e Receita", content: <>
    {receitaComp && <div className="mt-4"><ReceitaComposicaoPanel d={receitaComp} /></div>}
    {transfSerie && <div className="mt-4"><TransferenciasSeriePanel d={transfSerie} /></div>}{transfCgu && <div className="mt-4"><TransferenciasCguPanel d={transfCgu} /></div>}
    {pib && <div className="mt-4"><PibMunicipalPanel d={pib} /></div>}
    {idhm && <div className="mt-4"><IdhmPanel d={idhm} /></div>}
  </> });
  if (popFaixa || censoCR || domicilios || alfab || setores || quilombos) tabs.push({ id: "populacao", label: "População e Território", content: <>
    {popFaixa && <div className="mt-4"><PopulacaoFaixaPanel d={popFaixa} /></div>}
    {censoCR && <div className="mt-4"><CensoCorRacaPanel d={censoCR} /></div>}
    {domicilios && <div className="mt-4"><DomiciliosPanel d={domicilios} /></div>}
    {alfab && <div className="mt-4"><AlfabetizacaoPanel d={alfab} /></div>}
    {setores && <div className="mt-4"><SetoresPanel d={setores} codigo={codigo} /></div>}
    {quilombos && <div className="mt-4"><QuilombosPanel d={quilombos} /></div>}
  </> });
  if (lpg || salic || museus) tabs.push({ id: "cultura", label: "Cultura", content: <>
    {lpg && <div className="mt-4"><LpgPanel d={lpg} /></div>}
    {salic && <div className="mt-4"><SalicPanel d={salic} /></div>}
    {museus && <div className="mt-4"><MuseusPanel d={museus} /></div>}
  </> });
  if (equipSuas) tabs.push({ id: "equipamentos-assistencia", label: "Equipamentos", content: <EquipamentosSuasDrill dados={equipSuas} nome={ente.nome} /> });
  tabs.push({ id: "geolocalizacao", label: "Geolocalização", content: <GeolocalizacaoLazy codigo={codigo} nome={ente.nome} /> });
  if (saneamento) tabs.push({ id: "infraestrutura", label: "Saneamento", content: <><CarimboFontes className="mb-3" fontes={["IBGE Censo 2022", "SNIS (Min. Cidades)"]} /><InfraestruturaSC data={saneamento} nome={ente.nome} />{sisagua && <div className="mt-4"><SisaguaPanel d={sisagua} /></div>}{sinisa && <div className="mt-4"><SinisaPanel d={sinisa} /></div>}{aneelGd && <div className="mt-4"><AneelGdPanel d={aneelGd} /></div>}{anatelBl && <div className="mt-4"><AnatelBlPanel d={anatelBl} /></div>}{frota && <div className="mt-4"><FrotaPanel d={frota} /></div>}{anp && <div className="mt-4"><AnpPanel d={anp} /></div>}{anpVendas && <div className="mt-4"><AnpVendasPanel d={anpVendas} /></div>}{novopac && <div className="mt-4"><NovoPacPanel d={novopac} /></div>}{obras && <div className="mt-4"><ObrasPanel d={obras} /></div>}</> });
  if (queimadas || prodes) tabs.push({ id: "meio_ambiente", label: "Meio Ambiente e Defesa Civil", content: (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="text-sm font-semibold text-slate-800">Meio Ambiente e Defesa Civil — pressão sobre o território</div>
        <p className="mt-1 text-sm text-slate-600">Focos de calor (queimadas, INPE) e desmatamento (PRODES, Mata Atlântica) por município — os dois sinais de pressão ambiental no território. Também usados como alerta de risco pela Defesa Civil.</p>
      </div>
      {desastres && <DesastresPanel d={desastres} />}{queimadas && <QueimadasPanel d={queimadas} />}
      {prodes && <ProdesPanel d={prodes} />}{ibamaAutos && <IbamaAutosPanel d={ibamaAutos} />}{ibamaEmbargos && <IbamaEmbargosPanel d={ibamaEmbargos} />}{icmbioUc && <IcmbioUcPanel d={icmbioUc} />}{anaOutorgas && <AnaOutorgasPanel d={anaOutorgas} />}{mapaAmbiental && <MapaAmbiental data={mapaAmbiental} nome={ente.nome} />}{cemaden && <CemadenPanel d={cemaden} />}{barragens && <BarragensPanel d={barragens} />}
    </div>
  ) });
  if (acessoFinanceiro) tabs.push({ id: "financeiro", label: "Sistema Financeiro", content: (<><AcessoFinanceiro data={acessoFinanceiro} nome={ente.nome} />{rfbArrec && <div className="mt-4"><RfbArrecadacaoPanel d={rfbArrec} /></div>}{bndes && <div className="mt-4"><BndesPanel d={bndes} /></div>}{caged && <div className="mt-4"><CagedPanel d={caged} /></div>}</>) });
  if (agropec) tabs.push({ id: "agropecuaria", label: "Agropecuária", content: <><CarimboFontes className="mb-3" fontes={["Censo Agro 2017 (IBGE)", "CAF (MDA)", "CAR (SICAR)", "PRONAF (BCB)"]} /><Agropecuaria data={agropec} nome={ente.nome} />{ibgeProducao && <div className="mt-4"><IbgeProducaoPanel d={ibgeProducao} /></div>}{pronaf && <div className="mt-4"><PronafPanel d={pronaf} /></div>}{incraAssent && <div className="mt-4"><IncraAssentamentosPanel d={incraAssent} /></div>}{paa && <div className="mt-4"><PaaPanel d={paa} /></div>}</> });
  if (acompanhamento) tabs.push({ id: "acompanhamento", label: "Acompanhamento", content: <><Carimbo className="mb-3" fonte="SICONFI · RREO (Tesouro Nacional)" competencia="execução intra-anual — RREO do bimestre" extraido={extracao.financas} /><Acompanhamento data={acompanhamento} nome={ente.nome} />{acompFuncao && <div className="mt-3"><AcompanhamentoFuncao data={acompFuncao} nome={ente.nome} /></div>}</> });
  if (viesPrev || repassesStn) tabs.push({ id: "planejamento", label: "Planejamento", content: <>
    {repassesStn && <RepassesStn data={repassesStn} nome={ente.nome} />}
    {viesPrev && <div className="mt-3"><ViesPrevisao data={viesPrev} macro={macroLDO} despesa={viesDesp} projecao={projReceita} nome={ente.nome} /></div>}
    {pecaCompleta && <div className="mt-3"><PecaCompleta data={pecaCompleta} nome={ente.nome} /></div>}
    {ppaPrograma && <div className="mt-3"><PpaPrograma data={ppaPrograma} nome={ente.nome} /></div>}
    {mscDespesa && <div className="mt-3"><MscDespesa data={mscDespesa} nome={ente.nome} /></div>}
    {pecaCompleta && projReceita && <div className="mt-3"><MinutaLoa peca={pecaCompleta} projecao={projReceita} mscDespesa={mscDespesa} nome={ente.nome} /></div>}
  </> });
  if (rgfResumo || folhaSerie) tabs.push({ id: "folha", label: "Folha / Pessoal", content: <>{rgfResumo && <FolhaSC rgf={rgfResumo} serie={serie} />}{folhaSerie && <div className="mt-4"><FolhaSeriePanel d={folhaSerie} /></div>}<div className="mt-4"><CatalogoBoasPraticas area="fiscal" /></div></> });
  if (rpps) {
    const crpHist = await getCrpHistoricoSC(codigo);
    const prevConf = rpps.coberturaPct > 0
      ? { label: "Cobertura das contribuições", valor: rpps.coberturaPct, ancora: "ideal ≥ 100% dos benefícios", nivel: (rpps.coberturaPct >= 100 ? "ok" : rpps.coberturaPct >= 70 ? "warn" : "bad") as "ok" | "warn" | "bad" }
      : null;
    const prevInd = [
      ...(rpps.crp ? [{ label: "CRP (regularidade)", valor: rpps.crp.vencido ? "Vencida" : "Válida", sub: rpps.crp.validade ? `validade ${rpps.crp.validade}${rpps.crp.diasValidade != null ? ` · ${rpps.crp.diasValidade}d` : ""}` : "" }] : []),
      ...(rpps.atuarial ? [{ label: "Déficit atuarial (DRAA)", valor: fmtBRLCompact(rpps.atuarial.deficit), sub: `exercício ${rpps.atuarial.exercicio}` }] : []),
      { label: "Resultado no exercício", valor: fmtBRLCompact(rpps.resultado), sub: `RPPS ${rpps.ano}` },
    ];
    const prevLinks = crpHist.length ? [{ label: "Histórico completo de CRP", href: "#crp-historico" }] : [];
    tabs.push({ id: "previdencia", label: "Previdência", content: <>
      <CabecalhoArea titulo="Previdência" intro={`Como está o RPPS de ${ente.nome}: a regularidade (CRP), o equilíbrio de caixa e o déficit atuarial — da visão geral ao histórico completo dos certificados.`} conformidade={prevConf} indicadores={prevInd} insights={insights.filter((i) => /previd/i.test(i.area))} links={prevLinks} /><Carimbo className="mb-3 mt-1" fonte="CADPREV/SPREV (Min. da Previdência)" competencia="regime próprio (RPPS)" extraido={extracao.rpps ?? extracao.rpps_crp} />
      {cauc && (() => {
        const prevPend = cauc.grupos.filter((g) => /previd/i.test(g));
        const ok = prevPend.length === 0;
        return (
          <div className={`mb-4 rounded-xl border p-2.5 text-[13px] ${ok ? "border-emerald-200 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>
            {ok
              ? <><b className="text-emerald-700">✓ Regularidade previdenciária OK no CAUC</b>{cauc.dataPesquisa ? ` (consulta ${cauc.dataPesquisa})` : ""} — sem pendência no grupo previdenciário, corroborando a CRP válida.</>
              : <><b className="text-rose-700">⚠️ Pendência de regularidade previdenciária no CAUC</b> — a CRP pode estar irregular/suspensa. {(cauc.pendencias.filter((p) => /previd/i.test(p)).join("; ") || prevPend.join("; "))}</>}
            <div className="mt-0.5 text-[11px] text-slate-400">Status derivado do CAUC (grupo "Regularidade previdenciária"), que lê o CADIN/CRP diariamente — 2ª fonte que corrobora a CRP.</div>
          </div>
        );
      })()}
      <PrevidenciaSC data={rpps} />
      {crpHist.length > 0 && <div className="mt-4"><CrpHistorico historico={crpHist} nome={ente.nome} /></div>}
      <div className="mt-4"><BaseMetodologica area="previdencia" /></div>
    </> });
  }
  if (cauc || rankTesouro || rankDet) tabs.push({ id: "cauc", label: "Regularidade (CAUC)", content: <>{rankTesouro && <div className="mb-4"><RankingTesouroPanel d={rankTesouro} /></div>}{rankDet && <div className="mb-4"><RankingDetalhePanel d={rankDet} /></div>}{cauc && <CaucSCView data={cauc} />}</> });
  if (cruz) tabs.push({ id: "cruzamentos", label: "Cruzamentos", content: <CruzamentosSC data={cruz} /> });
  if (comprasDestinos) tabs.push({ id: "compras-sc", label: codigo === "42" ? "Para onde vai (SC)" : "Para onde vai", content: <ComprasDestinosSCView data={comprasDestinos} escopo={codigo === "42" ? "dos municípios de SC" : `de ${ente.nome}`} /> });

  if (captacao || emendas || convenios || munic) tabs.push({ id: "captacao", label: "Captação", content: <><CarimboFontes className="mb-3" fontes={["Transferegov/SICONV", "Portal da Transparência (CGU)", "programas federais (curadoria)"]} />{captRel && <div className="mb-4"><CaptacaoRelativaPanel d={captRel} programas={catalogoProgramas} /></div>}{captacao && <AssuntoCaptacao dados={captacao} cod={codigo} nome={ente.nome} margem={minhaPos ? { investimento: minhaPos.investimento, medianaSC: medianaInvestSC } : undefined} necessidade={necessidade} programasFederais={programasFederais} crpBloqueio={crpInfo} />}{lacunaSaude && <div className="mt-4"><LacunaCaptacaoSaude data={lacunaSaude} nome={ente.nome} /></div>}{lacunaEdu && <div className="mt-4"><LacunaCaptacaoEducacao data={lacunaEdu} nome={ente.nome} /></div>}{lacunaAssist && <div className="mt-4"><LacunaCaptacaoAssistencia data={lacunaAssist} nome={ente.nome} /></div>}{catalogoProgramas.length > 0 && <div className="mt-4"><CatalogoProgramas programas={catalogoProgramas} /></div>}{munic && <div className="mt-4"><MunicGestao data={munic} nome={ente.nome} /></div>}{emendas && <div className="mt-4">{emendas.porParlamentar.length > 0 && <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><Carimbo fonte="SICONV/Transferegov + Portal da Transparência" competencia="emendas por parlamentar" extraido={extracao.emendas ?? extracao.emendas_exec} /><BaixarCsv nome={`emendas-por-parlamentar-${ente.nome}`} label="Baixar emendas por parlamentar (CSV)" colunas={[{ chave: "parlamentar", rotulo: "Parlamentar" }, { chave: "valor", rotulo: "Valor indicado" }, { chave: "n", rotulo: "Nº de emendas" }]} linhas={emendas.porParlamentar as unknown as Record<string, unknown>[]} /></div>}<EmendasCard dados={emendas} nome={ente.nome} /></div>}{convenios && <div className="mt-4"><ConveniosCard dados={convenios} nome={ente.nome} /></div>}</> });
  if (captacaoEmendas) tabs.push({ id: "emendas", label: "Federais", content: <CaptacaoEmendas data={captacaoEmendas} nome={ente.nome} necessidade={necessidade} programas={cadernoProgramas} cod={codigo} /> });
  if (emendasEstaduais) tabs.push({ id: "emendas-estaduais", label: "Estaduais", content: <EstaduaisEmendas data={emendasEstaduais} nome={ente.nome} necessidade={necessidade} cod={codigo} programas={emendasEstObjetos} /> });

  if (escolas || escTurmas) tabs.push({ id: "equipamentos", label: "Equipamentos Públicos", content: <>
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-teal-50 to-white p-5">
      <h3 className="text-base font-bold text-slate-900">🏛️ Equipamentos Públicos — Educação</h3>
      <p className="text-sm text-slate-500">As escolas de {ente.nome} com turmas, infraestrutura e lacunas — do panorama por rede ao detalhe de cada escola. (Saúde e Assistência terão suas próprias páginas de equipamentos.)</p>
    </div>
    {escTurmas && <div className="mt-4"><EscolaTurmasPanel d={escTurmas} /></div>}
    {escolas && <div className="mt-4"><EscolasDrill dados={escolas} nome={ente.nome} /></div>}
  </> });

  if (rais) tabs.push({ id: "rais", label: "RAIS — emprego formal", content: <div className="space-y-4"><RaisPanel d={rais} />{ibgeProducao && <IbgeCemprePanel d={ibgeProducao} />}</div> });
  if (casamento) tabs.push({ id: "emprego", label: "Emprego (RAIS × CAGED)", content: <CasamentoEmpregoPanel d={casamento} /> });
  if (bolsaAtleta) tabs.push({ id: "esporte", label: "Esporte", content: (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="text-sm font-semibold text-slate-800">Esporte — Bolsa Atleta</div>
        <p className="mt-1 text-sm text-slate-600">Atletas do município beneficiados pelo programa federal Bolsa Atleta (nível, modalidade e valor). Espaço para crescer: Lei de Incentivo ao Esporte e equipamentos esportivos.</p>
      </div>
      <BolsaAtletaPanel d={bolsaAtleta} />{equipEsporte && <EquipamentosEsportePanel d={equipEsporte} />}
    </div>
  ) });
  if (sinesp) tabs.push({ id: "seguranca", label: "Segurança", content: (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="text-sm font-semibold text-slate-800">Segurança pública</div>
        <p className="mt-1 text-sm text-slate-600">Indicadores oficiais por município (dados abertos SINESP/MJSP). Exibição neutra, sem juízo de gestão. Espaço para crescer: acidentes de trânsito (RENAEST) e violência por causas externas (DATASUS).</p>
      </div>
      <SinespPanel d={sinesp} />{datatran && <DatatranPanel d={datatran} />}
    </div>
  ) });
  // navegação temática: Resumo · Finanças · Compras · Saúde · Educação · ... · Segurança · Análise & Controle
  const GRUPOS: [string, string[]][] = [
    ["Resumo", ["placar", "visao", "panorama", "diagnostico", "geolocalizacao"]],
    ["Finanças", ["financas", "acompanhamento", "receitas", "despesas", "execucao", "planejamento", "captacao", "folha", "previdencia", "metas", "simulador"]],
    ["Emendas", ["emendas", "emendas-estaduais"]],
    ["Compras & Contratos", ["compras", "padroes-compras", "construtor-tr", "atas", "contratos", "planejamento", "compras-sc"]],
    ["Saúde", ["saude", "previne-ficha", "mac", "repasses-saude", "fns-historico", "accountability-aps", "equipamentos-saude"]],
    ["Educação", ["educacao", "educacao-cruz", "equipamentos", "indicadores"]],
    ["Assistência", ["assistencia", "equipamentos-assistencia"]],
    ["Esporte", ["esporte"]],
    ["Infraestrutura", ["infraestrutura", "meio_ambiente"]],
    ["Base Econômica", ["financeiro", "rais", "emprego", "agropecuaria"]],
    ["Segurança", ["seguranca"]],
    ["Análise & Controle", ["cruzamentos", "iegm", "ranking", "transferencias", "cauc", "auditoria"]],
    ["Soluções i10", ["solucoes-i10", "solucoes-eti", "solucoes-pme"]],
  ];
  const ORDEM = GRUPOS.flatMap(([, ids]) => ids);
  const grupoDe = (id: string) => GRUPOS.find(([, ids]) => ids.includes(id))?.[0];
  tabs.sort((x, y) => ((ORDEM.indexOf(x.id) + 1 || 99) - (ORDEM.indexOf(y.id) + 1 || 99)));
  tabs.forEach((t) => { t.grupo = grupoDe(t.id); });

  return (
    <div className="min-h-screen bg-slate-50" style={{ ["--header-h" as string]: "60px" } as React.CSSProperties}>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <div className="leading-tight">
              <div className="font-display text-base font-bold tracking-tight text-slate-900">i10 Gov 360</div>
              <div className="hidden text-xs text-slate-500 sm:block">Santa Catarina · dados oficiais</div>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <Link href={`/comparar?cods=${codigo}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-teal-700">
              <span aria-hidden>⚖️</span> Comparar
            </Link>
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" /> Início
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
        {/* Cabeçalho do ente + seletor */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                  {ente.nome} <span className="text-base font-semibold text-slate-500">— SC</span>
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  <Database className="h-3 w-3" /> Dados oficiais
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Município · {fmtPop(ente.populacao)} · série {anoIni}–{anoFim} · IBGE {ente.cod_ibge}
                {pibPerCapita ? ` · PIB per capita ${fmtBRL(pibPerCapita)}` : ""}
              </p>
            </div>
            <div className="lg:items-end">
              <span className="mb-1 block text-xs text-slate-500">Trocar ente (295 municípios + Estado)</span>
              <RealSelector options={options} atual={ente.cod_ibge} />
              <div className="no-print mt-2"><PrintButton /></div>
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <strong className="text-slate-700">Fonte:</strong> {FONTE_SICONFI}. Números reais publicados.
          </p>
        </div>

        {/* Resumo executivo + Insights agora vivem no Placar (aba Visão do Prefeito), num fluxo único */}

        {/* Seções em abas (mesmo layout do painel) */}
        <PanelTabs tabs={tabs} />

        <footer className="py-6 text-center text-xs text-slate-500">
          i10 Gov 360 · Instituto I10 — finanças do SICONFI ({anoIni}–{anoFim}), compras do PNCP e transferências do Transferegov/CGU. Bases oficiais usadas pelo TCE/SC.
        </footer>
      </main>
    </div>
  );
}
