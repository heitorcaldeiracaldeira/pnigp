import { notFound } from "next/navigation";
import { Relatorio } from "@/components/relatorio";
import { analisarAuditoria } from "@/lib/audit";
import { gerarInsights } from "@/lib/insights";
import {
  getCompras,
  getContratacoes,
  getEstado,
  getFinancas,
  getHistoricoIndicadoresEstado,
  getIndicadoresEstado,
  getIndicesSerieEstado,
  getMetasEstado,
  getRankingEstados,
} from "@/lib/queries";
import { planoSugerido, simular } from "@/lib/simulate";

export default async function RelatorioEstado({
  params,
}: {
  params: Promise<{ uf: string }>;
}) {
  const { uf } = await params;
  const estado = await getEstado(uf);
  if (!estado) notFound();

  const [serie, indicadores, ranking, historico, metas, financas, compras, contratacoes] =
    await Promise.all([
      getIndicesSerieEstado(estado.id),
      getIndicadoresEstado(estado.id, estado.regiao),
      getRankingEstados(),
      getHistoricoIndicadoresEstado(estado.id),
      getMetasEstado(estado.id),
      getFinancas("E", estado.id),
      getCompras("E", estado.id),
      getContratacoes("E", estado.id),
    ]);

  const atual = serie[serie.length - 1];
  const minhaPos = ranking.find((r) => r.uf === estado.uf);
  const total = ranking.length;

  const insights = gerarInsights({
    indicadores,
    historico,
    indices: atual,
    grupoLabel: "da sua região",
    posicao: minhaPos?.posicao,
    total,
  });

  const auditoria = analisarAuditoria({
    indicadores,
    indices: atual,
    populacao: estado.populacao,
    grupoLabel: "dos pares da sua região",
  });

  const outrosIgp = ranking.filter((r) => r.uf !== estado.uf).map((r) => r.igp360);
  const planoInvest = planoSugerido(auditoria.areas);
  const sim = simular({
    areas: auditoria.areas,
    investPerCapita: planoInvest,
    indices: atual,
    populacao: estado.populacao,
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
      tipo="Estado"
      voltarHref={`/governador/${estado.uf}`}
      nome={estado.nome}
      uf={estado.uf}
      regiao={estado.regiao}
      gestorLabel="Governador(a)"
      gestor={estado.governador}
      populacao={estado.populacao}
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
      seed={estado.uf}
      dataGeracao={dataGeracao}
    />
  );
}
