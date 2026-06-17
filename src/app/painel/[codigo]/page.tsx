import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, FileDown, LayoutDashboard, MapPin, Users, Wallet } from "lucide-react";
import { AuditPanel } from "@/components/audit-panel";
import { AreaPerformance } from "@/components/charts/area-performance";
import { CapacityRadar } from "@/components/charts/capacity-radar";
import { Donut } from "@/components/charts/donut";
import { OrcadoExecutado } from "@/components/charts/orcado-executado";
import { ComprasPanel } from "@/components/compras-panel";
import { DecisionSimulator } from "@/components/decision-simulator";
import { FinancasPanel } from "@/components/financas-panel";
import { IndexTrend } from "@/components/charts/index-trend";
import { IndicatorsSection } from "@/components/indicators-section";
import { InsightsPanel } from "@/components/insights-panel";
import { PlanejamentoSection } from "@/components/planejamento-section";
import { MunicipioSelector } from "@/components/municipio-selector";
import { PanelTabs } from "@/components/panel-tabs";
import { PanoramaCard } from "@/components/panorama-card";
import { RankingTable } from "@/components/ranking-table";
import { ResumoBanner } from "@/components/resumo-banner";
import { ScoreCard } from "@/components/score-card";
import { analisarAuditoria } from "@/lib/audit";
import { resumoFornecedores } from "@/lib/contratacao-detalhe";
import { gerarInsights } from "@/lib/insights";
import { despesaFuncaoArvore } from "@/lib/orcamento";
import {
  getCompras,
  getContratacoes,
  getFinancas,
  getHistoricoIndicadores,
  getIndicadores,
  getIndicesSerie,
  getMetas,
  getMunicipio,
  getMunicipios,
  getRanking,
} from "@/lib/queries";
import { fmtBRL, fmtBRLCompact, fmtPop, PORTE_LABEL } from "@/lib/ui";

export default async function PainelPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const municipio = await getMunicipio(codigo);
  if (!municipio) notFound();

  const [municipios, serie, indicadores, ranking, metas, historico, financas, compras, contratacoes] =
    await Promise.all([
      getMunicipios(),
      getIndicesSerie(municipio.id),
      getIndicadores(municipio.id, municipio.porte),
      getRanking(),
      getMetas(municipio.id),
      getHistoricoIndicadores(municipio.id),
      getFinancas("M", municipio.id),
      getCompras("M", municipio.id),
      getContratacoes("M", municipio.id),
    ]);

  const atual = serie[serie.length - 1];
  const anterior = serie[serie.length - 2] ?? null;
  const minhaPos = ranking.find((r) => r.codigo_ibge === codigo);
  const total = ranking.length;

  const insights = gerarInsights({
    indicadores,
    historico,
    indices: atual,
    grupoLabel: "do seu porte",
    posicao: minhaPos?.posicao,
    total,
  });

  const auditoria = analisarAuditoria({
    indicadores,
    indices: atual,
    populacao: municipio.populacao,
    grupoLabel: "dos pares do seu porte",
  });

  const outrosIgp = ranking.filter((r) => r.codigo_ibge !== codigo).map((r) => r.igp360);

  const rankRows = ranking.map((r) => ({
    posicao: r.posicao,
    codigo: r.codigo_ibge,
    nome: r.nome,
    uf: r.uf,
    grupo: PORTE_LABEL[r.porte] ?? r.porte,
    igp360: r.igp360,
    iceb: r.iceb,
    invp: r.invp,
  }));

  const radar = [
    { dimensao: "Planejamento", valor: atual.cap_planejamento },
    { dimensao: "Fiscal", valor: atual.cap_fiscal },
    { dimensao: "Gestão", valor: atual.cap_gestao },
    { dimensao: "Transparência", valor: atual.cap_transparencia },
  ];

  const areaPanorama = auditoria.areas.map((a) => ({ label: a.label, score: a.score, classe: a.classe }));
  const fin = financas.atual;
  const orcExecData = fin
    ? despesaFuncaoArvore(fin, codigo).map((n) => ({ label: n.nome, orcado: n.previsto, executado: n.realizado }))
    : [];
  const recOrigData = fin
    ? [
        { label: "Receita própria", valor: fin.rec_tributaria },
        { label: "Transferências", valor: fin.rec_transferencias },
        { label: "Outras", valor: fin.rec_outras },
      ]
    : [];
  const forn = resumoFornecedores(contratacoes, codigo);
  const fornData = [
    { label: "Do município", valor: forn.local.valor },
    { label: "De fora", valor: forn.fora.valor },
  ];
  const totalEstimado = contratacoes.reduce((s, c) => s + c.valor_estimado, 0);
  const totalContratado = contratacoes.reduce((s, c) => s + c.valor_contratado, 0);
  const economiaV = totalEstimado - totalContratado;
  const economiaPct = totalEstimado > 0 ? (economiaV / totalEstimado) * 100 : 0;
  const pctContratado = totalEstimado > 0 ? (totalContratado / totalEstimado) * 100 : 0;

  const info = [
    { icon: MapPin, label: "Região", valor: `${municipio.regiao} · ${municipio.uf}` },
    { icon: Users, label: "População", valor: fmtPop(municipio.populacao) },
    { icon: Building2, label: "Porte", valor: PORTE_LABEL[municipio.porte] ?? municipio.porte },
    { icon: Wallet, label: "PIB per capita", valor: fmtBRL(municipio.pib_per_capita) },
  ];

  const tabs = [
    {
      id: "visao",
      label: "Visão geral",
      content: (
        <>
          <InsightsPanel insights={insights} />
          <section aria-label="Índices PNIGP">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Índices PNIGP · 2024
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <ScoreCard sigla="IGP 360" nome="Índice Integrado de Gestão Pública" valor={atual.igp360} anterior={anterior?.igp360 ?? null} posicao={minhaPos?.posicao} total={total} descricao="Nota geral da gestão (0 a 100). Combina a capacidade do Estado (ICEB) e o valor entregue ao cidadão (INVP)." />
              <ScoreCard sigla="ICEB" nome="Capacidade Estatal Brasileira" valor={atual.iceb} anterior={anterior?.iceb ?? null} descricao="Mede o quanto a máquina pública está preparada para planejar, arrecadar, gerir e ser transparente." />
              <ScoreCard sigla="INVP" nome="Índice Nacional de Valor Público" valor={atual.invp} anterior={anterior?.invp ?? null} descricao="Mede quanto benefício concreto (saúde, educação, segurança…) chega de fato à população." />
            </div>
          </section>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
              <h3 className="mb-4 font-semibold text-slate-800">Evolução dos índices (2020–2024)</h3>
              <IndexTrend data={serie} />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-1 font-semibold text-slate-800">Capacidade estatal</h3>
              <p className="mb-2 text-xs text-slate-500">Subdimensões do ICEB</p>
              <CapacityRadar data={radar} />
            </div>
          </div>

          <section aria-label="Panorama para decisão">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Panorama para decisão</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <PanoramaCard href="#auditoria" titulo="Desempenho por área" sub="Comparado a entes do mesmo porte (50 = média)">
                <AreaPerformance data={areaPanorama} />
              </PanoramaCard>
              {fin && (
                <PanoramaCard href="#financas" titulo="Orçado × Executado" sub="Despesa por função — quanto foi planejado e realizado">
                  <OrcadoExecutado data={orcExecData} />
                </PanoramaCard>
              )}
              {fin && (
                <PanoramaCard href="#financas" titulo="De onde vem o dinheiro" sub="Receita por origem">
                  <Donut data={recOrigData} />
                </PanoramaCard>
              )}
              {contratacoes.length > 0 && (
                <PanoramaCard href="#compras" titulo="Fornecedores" sub="Valor contratado: do município × de fora">
                  <Donut data={fornData} />
                </PanoramaCard>
              )}
              {contratacoes.length > 0 && (
                <PanoramaCard href="#compras" titulo="Resumo das compras" sub="Estimado (orçado) × contratado (adquirido)" className="lg:col-span-2">
                  <div className="mt-2 grid gap-4 sm:grid-cols-3">
                    <div>
                      <div className="text-xs text-slate-500">Estimado (orçado)</div>
                      <div className="font-display text-2xl font-bold tabular-nums text-slate-800">{fmtBRLCompact(totalEstimado)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Contratado (adquirido)</div>
                      <div className="font-display text-2xl font-bold tabular-nums text-teal-700">{fmtBRLCompact(totalContratado)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Economia</div>
                      <div className="font-display text-2xl font-bold tabular-nums text-emerald-600">{fmtBRLCompact(economiaV)} · {economiaPct.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-slate-500">
                      <span>Contratado sobre o estimado</span>
                      <span className="tabular-nums">{pctContratado.toFixed(0)}%</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100">
                      <div className="h-2.5 rounded-full bg-teal-600" style={{ width: `${Math.min(100, pctContratado)}%` }} />
                    </div>
                  </div>
                </PanoramaCard>
              )}
            </div>
          </section>
        </>
      ),
    },
    {
      id: "indicadores",
      label: "Indicadores",
      content: (
        <section aria-label="Indicadores setoriais" className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 font-semibold text-slate-800">Indicadores setoriais</h3>
          <IndicatorsSection indicadores={indicadores} />
        </section>
      ),
    },
    {
      id: "financas",
      label: "Finanças",
      content: financas.atual ? (
        <FinancasPanel financas={financas.atual} anterior={financas.anterior} populacao={municipio.populacao} seed={codigo} tipo="M" />
      ) : (
        <p className="text-sm text-slate-500">Sem dados financeiros para este ente.</p>
      ),
    },
    {
      id: "compras",
      label: "Compras",
      content: <ComprasPanel compras={compras.atual} contratacoes={contratacoes} />,
    },
    {
      id: "auditoria",
      label: "Auditoria",
      content: (
        <AuditPanel
          parecer={auditoria.parecer}
          areas={auditoria.areas}
          achados={auditoria.achados}
          oportunidades={auditoria.oportunidades}
        />
      ),
    },
    {
      id: "simulador",
      label: "Simulador",
      content: (
        <DecisionSimulator
          areas={auditoria.areas}
          indices={atual}
          populacao={municipio.populacao}
          outrosIgp={outrosIgp}
          posAtual={minhaPos?.posicao ?? total}
          total={total}
        />
      ),
    },
    {
      id: "metas",
      label: "Planejamento",
      content: (
        <section aria-label="Planejamento da gestão">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Planejamento da gestão · PPA · LDO · LOA
          </h2>
          <PlanejamentoSection
            metas={metas}
            financas={financas.atual}
            fiscal={indicadores.filter((i) => i.area === "fiscal")}
            seed={codigo}
            tipo="M"
          />
        </section>
      ),
    },
    {
      id: "ranking",
      label: "Ranking",
      content: (
        <section aria-label="Benchmarking nacional" className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-1 font-semibold text-slate-800">Benchmarking nacional</h3>
          <p className="mb-4 text-xs text-slate-500">Ranking dos municípios por IGP 360 · 2024</p>
          <RankingTable ranking={rankRows} codigoAtual={codigo} grupoHeader="Porte" destaqueLabel="SEU MUNICÍPIO" />
        </section>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho do município */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-display tracking-tight text-2xl font-bold text-slate-900">
            {municipio.nome}
            <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-sm font-semibold text-slate-500">
              {municipio.uf}
            </span>
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Prefeito(a): <strong className="text-slate-700">{municipio.prefeito}</strong> · Dados do exercício 2024 (último consolidado)
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div className="flex flex-col items-start gap-1 lg:items-end">
            <span className="text-xs text-slate-500">Trocar município</span>
            <MunicipioSelector municipios={municipios} atual={codigo} />
          </div>
          <div className="flex gap-2">
            <Link
              href={`/painel/${codigo}/gestao`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              <LayoutDashboard className="h-4 w-4" />
              Painel Executivo
            </Link>
            <Link
              href={`/relatorio/municipio/${codigo}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-700 px-3 py-1.5 text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
            >
              <FileDown className="h-4 w-4" />
              Exportar PDF
            </Link>
          </div>
        </div>
      </div>

      {/* Resumo executivo — resposta em 5 segundos */}
      <ResumoBanner
        nome={municipio.nome}
        igp360={atual.igp360}
        posicao={minhaPos?.posicao}
        total={total}
        insights={insights}
        parecer={auditoria.parecer}
      />

      {/* Faixa de informações */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {info.map(({ icon: Icon, label, valor }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs text-slate-500">{label}</div>
              <div className="text-sm font-semibold text-slate-800">{valor}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Seções em abas */}
      <PanelTabs tabs={tabs} />

      <footer className="py-6 text-center text-xs text-slate-500">
        PNIGP · Plataforma Nacional de Inteligência da Gestão Pública — Instituto I10 ·
        Dados simulados para demonstração
      </footer>
    </div>
  );
}
