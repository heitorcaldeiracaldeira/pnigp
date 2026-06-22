import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, Database, FileText, Landmark, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Logo } from "@/components/brand";
import { AssuntoCaptacao } from "@/components/assunto-captacao";
import { Donut } from "@/components/charts/donut";
import { LinhasFinanceiras } from "@/components/charts/linhas-financeiras";
import { AreaEmpilhada } from "@/components/charts/area-empilhada";
import { OrcadoExecutado } from "@/components/charts/orcado-executado";
import { ComprasSCSection } from "@/components/compras-sc-section";
import { DiagnosticoGestor } from "@/components/diagnostico-gestor";
import { AuditoriaSC } from "@/components/auditoria-sc";
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
import { SerieExplicada } from "@/components/serie-explicada";
import { PlacarEstrategico } from "@/components/placar-estrategico";
import { CabecalhoArea } from "@/components/cabecalho-area";
import { EducacaoSC } from "@/components/educacao-sc";
import { CruzamentosSC } from "@/components/cruzamentos-sc";
import { PanoramaSC } from "@/components/panorama-sc";
import { PrintButton } from "@/components/print-button";
import { ComprasDestinosSCView } from "@/components/compras-destinos-sc";
import { FolhaSC } from "@/components/folha-sc";
import { PrevidenciaSC } from "@/components/previdencia-sc";
import { CaucSCView } from "@/components/cauc-sc";
import { gerarInsightsSC } from "@/lib/insights-sc";
import { ArvoreFinanceira } from "@/components/arvore-financeira";
import type { NoFin } from "@/lib/orcamento";
import type { FuncaoSC, ReceitaSC } from "@/lib/queries";
import { TransferenciasSCSection } from "@/components/transferencias-sc-section";
import { PanelTabs } from "@/components/panel-tabs";
import { RealSelector } from "@/components/real-selector";
import { FONTE_SICONFI, getContratosResumoSC, getCruzamentosSC, getDiagnosticoEstadoSC, getDiagnosticoGestorSC, getEntesSC, getFinancasSC, getIndicadoresSetoriaisSC, getMetasFiscaisSC, getPcaResumoSC, getPibPerCapitaSC, getEducacaoSC, getRankingFiscalSC, getFnsSC, getFnsSerieSC, getRepassesSaudeFichaSC, getMacProducaoSC, getReceitasDetalheSC, getDespesaSubfuncaoSC, getPadroesComprasSC, getContratosComItensSC, getEconomicidadeSC, getContratosVencimentoSC, getAtasSC, getIdebSC, getCensoMatriculaSC, getEducacaoSerieSC, getIegmSC, getCaptacaoTransferegovSC, getFndeEducacaoSC, getOtimizadorReceitaSC, getPrevineSC, getPrevineFichaSC, getRgfResumoSC, getSaudeSC, getSeriesIndicadoresSC, getComprasDestinosSC, getRppsSC, getCaucSC } from "@/lib/queries";
import { fmtBRL, fmtBRLCompact, fmtPop, fmtData } from "@/lib/ui";

export const metadata = { title: "PNIGP — Santa Catarina (dados oficiais SICONFI)" };
export const dynamic = "force-dynamic";

export default async function RealEntePage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const [dados, entes, contratosResumo, pcaResumo, metasFiscais, rankingFiscal, pibPerCapita, indicadores, serieRenda, diagnostico, rgfResumo, saude, educacao, cruz, diagEstado, previne, fns, rpps, cauc, padroesCompras, contratosItens, economicidade, contratosVenc, atas, ideb, censoMatricula] = await Promise.all([getFinancasSC(codigo), getEntesSC(), getContratosResumoSC(codigo), getPcaResumoSC(codigo), getMetasFiscaisSC(codigo), getRankingFiscalSC(), getPibPerCapitaSC(codigo), getIndicadoresSetoriaisSC(codigo), getSeriesIndicadoresSC(codigo), getDiagnosticoGestorSC(codigo), getRgfResumoSC(codigo), getSaudeSC(codigo), getEducacaoSC(codigo), getCruzamentosSC(codigo), getDiagnosticoEstadoSC(codigo), getPrevineSC(codigo), getFnsSC(codigo), getRppsSC(codigo), getCaucSC(codigo), getPadroesComprasSC(codigo), getContratosComItensSC(codigo), getEconomicidadeSC(codigo), getContratosVencimentoSC(codigo), getAtasSC(codigo), getIdebSC(codigo), getCensoMatriculaSC(codigo)]);
  const previneFicha = await getPrevineFichaSC(codigo);
  const fnsSerie = await getFnsSerieSC(codigo);
  const repassesSaude = await getRepassesSaudeFichaSC(codigo);
  const macProducao = await getMacProducaoSC(codigo);
  const receitasDetalhe = await getReceitasDetalheSC(codigo);
  const despSubfuncao = await getDespesaSubfuncaoSC(codigo);
  const educacaoSerie = await getEducacaoSerieSC(codigo);
  const iegmDados = await getIegmSC(codigo);
  const captacao = await getCaptacaoTransferegovSC(codigo);
  const fndeEdu = await getFndeEducacaoSC(codigo);
  const otimReceita = await getOtimizadorReceitaSC(codigo);
  const seriesInd = serieRenda as Record<string, { ano: number; valor: number }[]>;
  if (!dados || dados.serie.length === 0) notFound();
  const minhaPos = rankingFiscal.find((r) => r.cod_ibge === codigo) ?? null;
  const totalRank = rankingFiscal.length;

  const { ente, serie, funcoesLatest, receitasLatest } = dados;
  const a = serie[serie.length - 1];
  const anterior = serie[serie.length - 2] ?? null;
  const resultado = a.receita - a.despesa;
  const superavit = resultado >= 0;
  const pctArrec = a.receita_prevista > 0 ? (a.receita / a.receita_prevista) * 100 : 0;
  const deltaRec = anterior && anterior.receita ? ((a.receita - anterior.receita) / anterior.receita) * 100 : null;
  const anoIni = serie[0].ano;
  const anoFim = a.ano;

  const options = entes.map((e) => ({ value: e.cod_ibge, label: e.tipo === "E" ? `★ ${e.nome}` : e.nome }));
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
          {minhaPos && (
            <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700"><Target className="h-4 w-4" /> Índice Fiscal PNIGP <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-slate-500">real · finanças SICONFI</span></div>
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
        </>
      ),
    },
    { id: "compras", label: "Compras", content: <ComprasSCSection codigo={ente.cod_ibge} tipo={ente.tipo} /> },
    ...(padroesCompras ? [{ id: "padroes-compras", label: "Planejamento de Compras", content: <AssuntoPadroesCompras dados={padroesCompras} contratos={contratosResumo} pca={pcaResumo} economia={economicidade} nome={ente.nome} /> }] : []),
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
                  <p className="text-xs text-slate-500">Índice Fiscal PNIGP (real) — média de percentis de autonomia, investimento, equilíbrio e peso de pessoal entre os {totalRank} entes.</p>
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
                  <p className="mt-2 text-[11px] text-slate-400">Índice fiscal real (SICONFI). Os índices completos PNIGP (ICEB/INVP/IGP 360) dependem de indicadores setoriais (saúde/educação/segurança/social/economia) ainda a coletar.</p>
                </section>
              </>
            );
          })(),
        }]
      : []),
  ];

  const comprasDestinos = await getComprasDestinosSC(codigo === "42" ? undefined : codigo); // Estado = agregado SC · município = destinos dele
  const diag = diagnostico ?? diagEstado; // município: vs pares · Estado: limites legais absolutos
  const insights = gerarInsightsSC({ diag, cruz, saude, educacao, pos: minhaPos, total: totalRank }); // análise automática (dado real)
  tabs.push({ id: "placar", label: "Visão do Prefeito", content: (
    <PlacarEstrategico nome={ente.nome} posicao={minhaPos?.posicao ?? null} total={totalRank || null} scoreFiscal={minhaPos?.score ?? null}
      tom={!diag ? null : diag.nAlertas === 0 ? "ok" : diag.nAlertas <= 2 ? "ressalva" : "critico"}
      saudePct={saude?.saudePct ?? null} educPct={educacao?.educPct ?? null} pessoalPct={rgfResumo?.pessoalPct ?? null} insights={insights} ano={diag?.ano ?? anoFim}
      iegm={iegmDados ? { faixa: iegmDados.finalFaixa, pct: iegmDados.finalPct } : null} />
  ) });
  if (iegmDados) tabs.push({ id: "iegm", label: "Qualidade da Gestão (IEGM/TCE)", content: <><AssuntoIEGM dados={iegmDados} nome={ente.nome} /><div className="mt-4"><BaseMetodologica area="controle" /></div></> });
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
  if (diag) tabs.push({ id: "auditoria", label: "Auditoria", content: <AuditoriaSC data={diag} radar={radar} /> });
  if (rgfResumo) tabs.push({ id: "simulador", label: "Simulador", content: <SimuladorFiscal ano={rgfResumo.ano} receita={a.receita} despesa={a.despesa} pessoal={a.pessoal} investimento={a.investimento} rclAjustada={rgfResumo.rclAjustada} pessoalPctBase={rgfResumo.pessoalPct} /> });
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
    tabs.push({ id: "saude", label: "Visão geral", content: (
      <>
        <CabecalhoArea titulo="Saúde" intro="Como a saúde do município está hoje, o que a lei exige, o que fazer e onde aprofundar — da visão geral ao indicador." conformidade={saudeConf} indicadores={saudeInd} insights={insights.filter((i) => /sa[úu]de/i.test(i.area))} links={saudeLinks} />
        <div className="mb-4"><AnaliseSaude previne={previne} fns={fns} saude={saude} nome={ente.nome} /></div>
        <SaudeSC data={saude} previne={previne} fns={fns} />
        <div className="mt-4"><BaseMetodologica area="saude" /></div>
      </>
    ) });
  }
  if (previneFicha) tabs.push({ id: "previne-ficha", label: "Atenção Primária", content: <AssuntoAtencaoPrimaria dados={previneFicha} nome={ente.nome} cod={codigo} /> });
  if (fnsSerie.length > 1) tabs.push({ id: "fns-historico", label: "Histórico de Repasses", content: <SerieExplicada serie={fnsSerie} escopo="fns" cod={codigo} nome={ente.nome} /> });
  if (repassesSaude) tabs.push({ id: "repasses-saude", label: "Repasses da Saúde", content: <RepassesSaudeFicha dados={repassesSaude} nome={ente.nome} /> });
  if (macProducao.length && saude) {
    const mac = repassesSaude?.programas.find((p) => p.key === "mac");
    tabs.push({ id: "mac", label: "Hospitais e Especialidades", content: <AssuntoMAC producao={macProducao} repasseValor={mac?.valorUlt ?? null} repasseAno={repassesSaude?.anoUlt ?? null} internMil={saude.internMil} internMilPares={saude.internMilPares} nome={ente.nome} /> });
  }
  tabs.push({ id: "receitas", label: "Receitas (de onde vem)", content: <><AssuntoReceitas serie={dados.serie} detalhe={receitasDetalhe} nome={ente.nome} />{otimReceita && <div className="mt-4"><OtimizadorReceita dados={otimReceita} nome={ente.nome} /></div>}</> });
  tabs.push({ id: "despesas", label: "Despesas (para onde vai)", content: <><AssuntoDespesas serie={dados.serie} funcoes={dados.funcoesLatest} subfuncoes={despSubfuncao} pessoalPct={rgfResumo?.pessoalPct ?? null} nome={ente.nome} /><div className="mt-4"><BaseMetodologica area="financas" /></div></> });
  if (previneFicha) {
    const aps = repassesSaude?.programas.find((p) => p.key === "aps");
    tabs.push({ id: "accountability-aps", label: "Da verba ao resultado", content: (
      <AccountabilityAPS previne={previneFicha} apsValor={aps?.valorUlt ?? null} apsAno={repassesSaude?.anoUlt ?? null} saudePct={saude?.saudePct ?? null} cauc={cauc} nome={ente.nome} cod={codigo} />
    ) });
  }
  if (educacao && educacaoSerie.length) tabs.push({ id: "educacao", label: "Educação", content: <>{(ideb || fndeEdu) && <div className="mb-4"><AnaliseEducacao ideb={ideb} fnde={fndeEdu} censo={censoMatricula} nome={ente.nome} /></div>}<AssuntoEducacao serie={educacaoSerie} edu={educacao} fundebValor={receitasDetalhe?.itens.find((i) => i.item === "FUNDEB")?.valor ?? null} nome={ente.nome} />{censoMatricula && <div className="mt-4"><MatriculasCard dados={censoMatricula} nome={ente.nome} /></div>}{ideb && <div className="mt-4"><IdebPainel dados={ideb} nome={ente.nome} /></div>}{fndeEdu && <div className="mt-4"><FndeEducacaoCard dados={fndeEdu} nome={ente.nome} /></div>}<div className="mt-4"><BaseMetodologica area="educacao" /></div></> });
  if (educacao) tabs.push({ id: "educacao-cruz", label: "Comparativo", content: <EducacaoSC data={educacao} /> });
  if (rgfResumo) tabs.push({ id: "folha", label: "Folha / Pessoal", content: <FolhaSC rgf={rgfResumo} serie={serie} /> });
  if (rpps) tabs.push({ id: "previdencia", label: "Previdência", content: <>
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 text-sm text-slate-700">
      <div className="font-semibold text-slate-800">🔖 Certidão de Regularidade Previdenciária (CRP)</div>
      <p className="mt-1">A CRP atesta que o RPPS de {ente.nome} cumpre os critérios da Lei 9.717/1998 — é <b>exigida para receber transferências voluntárias da União e contratar operações de crédito</b>. É emitida semestralmente pelo Ministério da Previdência, com validade própria.</p>
      {cauc && (() => {
        const prevPend = cauc.grupos.filter((g) => /previd/i.test(g));
        const ok = prevPend.length === 0;
        return (
          <div className={`mt-2 rounded-xl border p-2.5 text-[13px] ${ok ? "border-emerald-200 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>
            {ok
              ? <><b className="text-emerald-700">✓ Regularidade previdenciária OK no CAUC</b>{cauc.dataPesquisa ? ` (consulta ${cauc.dataPesquisa})` : ""} — sem pendência no grupo previdenciário, indicando CRP válida para transferências.</>
              : <><b className="text-rose-700">⚠️ Pendência de regularidade previdenciária no CAUC</b> — a CRP pode estar irregular/suspensa. {(cauc.pendencias.filter((p) => /previd/i.test(p)).join("; ") || prevPend.join("; "))}</>}
            <div className="mt-0.5 text-[11px] text-slate-400">Status derivado do CAUC (grupo "Regularidade previdenciária"), que lê o CADIN/CRP diariamente — mesma lógica do nosso indicador de Regularidade.</div>
          </div>
        );
      })()}
      <p className="mt-2 text-slate-500">Para o <b>documento e a validade exatos</b>, consulte a CRP atual direto na fonte oficial:</p>
      <a href="https://cadprev.previdencia.gov.br/Cadprev/pages/publico/crp/pesquisarEnteCrp.xhtml" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded-lg bg-teal-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700">Consultar a CRP de {ente.nome} no CADPREV ↗</a>
      <p className="mt-2 text-[11px] text-slate-400">Fonte: CADPREV / Ministério da Previdência Social. (A consulta é pública; busque o ente pela UF/nome.)</p>
    </div>
    <PrevidenciaSC data={rpps} />
    <div className="mt-4"><BaseMetodologica area="previdencia" /></div>
  </> });
  if (cauc) tabs.push({ id: "cauc", label: "Regularidade (CAUC)", content: <CaucSCView data={cauc} /> });
  if (cruz) tabs.push({ id: "cruzamentos", label: "Cruzamentos", content: <CruzamentosSC data={cruz} /> });
  if (comprasDestinos) tabs.push({ id: "compras-sc", label: codigo === "42" ? "Para onde vai (SC)" : "Para onde vai", content: <ComprasDestinosSCView data={comprasDestinos} escopo={codigo === "42" ? "dos municípios de SC" : `de ${ente.nome}`} /> });

  if (captacao) tabs.push({ id: "captacao", label: "Captação", content: <AssuntoCaptacao dados={captacao} cod={codigo} nome={ente.nome} /> });

  // navegação temática (6 clusters): Resumo · Finanças · Compras & Contratos · Saúde · Educação · Análise & Controle
  const GRUPOS: [string, string[]][] = [
    ["Resumo", ["placar", "visao", "panorama", "diagnostico"]],
    ["Finanças", ["financas", "receitas", "despesas", "execucao", "captacao", "folha", "previdencia", "metas", "simulador"]],
    ["Compras & Contratos", ["compras", "padroes-compras", "atas", "contratos", "planejamento", "compras-sc"]],
    ["Saúde", ["saude", "previne-ficha", "mac", "repasses-saude", "fns-historico", "accountability-aps"]],
    ["Educação", ["educacao", "educacao-cruz", "indicadores"]],
    ["Análise & Controle", ["cruzamentos", "iegm", "ranking", "transferencias", "cauc", "auditoria"]],
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
              <div className="font-display text-base font-bold tracking-tight text-slate-900">PNIGP</div>
              <div className="hidden text-xs text-slate-500 sm:block">Santa Catarina · dados oficiais</div>
            </div>
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Início
          </Link>
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
                {ente.tipo === "E" ? "Governo estadual" : "Município"} · {fmtPop(ente.populacao)} · série {anoIni}–{anoFim} · IBGE {ente.cod_ibge}
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
          PNIGP · Instituto I10 — finanças do SICONFI ({anoIni}–{anoFim}), compras do PNCP e transferências do Transferegov/CGU. Bases oficiais usadas pelo TCE/SC.
        </footer>
      </main>
    </div>
  );
}
