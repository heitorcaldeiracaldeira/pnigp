import { notFound } from "next/navigation";
import { Relatorio } from "@/components/relatorio";
import { analisarAuditoria } from "@/lib/audit";
import { gerarInsights } from "@/lib/insights";
import {
  getCompras,
  getContratacoes,
  getFinancas,
  getHistoricoIndicadores,
  getIndicadores,
  getIndicesSerie,
  getMetas,
  getMunicipio,
  getRanking,
} from "@/lib/queries";
import { planoSugerido, simular } from "@/lib/simulate";

export default async function RelatorioMunicipio({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const municipio = await getMunicipio(codigo);
  if (!municipio) notFound();

  const [serie, indicadores, ranking, historico, metas, financas, compras, contratacoes] =
    await Promise.all([
      getIndicesSerie(municipio.id),
      getIndicadores(municipio.id, municipio.porte),
      getRanking(),
      getHistoricoIndicadores(municipio.id),
      getMetas(municipio.id),
      getFinancas("M", municipio.id),
      getCompras("M", municipio.id),
      getContratacoes("M", municipio.id),
    ]);

  const atual = serie[serie.length - 1];
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
  const planoInvest = planoSugerido(auditoria.areas);
  const sim = simular({
    areas: auditoria.areas,
    investPerCapita: planoInvest,
    indices: atual,
    populacao: municipio.populacao,
    outrosIgp,
  });
  const planoItens = auditoria.areas
    .filter((a) => (planoInvest[a.area] ?? 0) > 0)
    .map((a) => ({ label: a.label, rs: planoInvest[a.area], ganho: sim.deltasArea[a.area] ?? 0 }));

  const dataGeracao = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Relatorio
      tipo="Município"
      voltarHref={`/painel/${codigo}`}
      nome={municipio.nome}
      uf={municipio.uf}
      regiao={municipio.regiao}
      gestorLabel="Prefeito(a)"
      gestor={municipio.prefeito}
      populacao={municipio.populacao}
      indices={atual}
      posicao={minhaPos?.posicao}
      total={total}
      insights={insights}
      auditoria={auditoria}
      metas={metas}
      plano={{ itens: planoItens, sim, posAtual: minhaPos?.posicao ?? total }}
      financas={financas.atual}
      compras={compras.atual}
      contratacoes={contratacoes}
      seed={codigo}
      dataGeracao={dataGeracao}
    />
  );
}
