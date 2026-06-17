import { notFound } from "next/navigation";
import { ExecutiveDashboard } from "@/components/executive-dashboard";
import { analisarAuditoria, type AreaScore } from "@/lib/audit";
import {
  getCompras,
  getContratacoes,
  getEstado,
  getFinancas,
  getIndicadoresEstado,
  getIndicesSerieEstado,
} from "@/lib/queries";

const CIDADAO = ["saude", "educacao", "seguranca", "social"] as const;

export default async function PainelExecutivoEstado({
  params,
}: {
  params: Promise<{ uf: string }>;
}) {
  const { uf } = await params;
  const estado = await getEstado(uf);
  if (!estado) notFound();

  const [serie, indicadores, compras, financas, contratacoes] = await Promise.all([
    getIndicesSerieEstado(estado.id),
    getIndicadoresEstado(estado.id, estado.regiao),
    getCompras("E", estado.id),
    getFinancas("E", estado.id),
    getContratacoes("E", estado.id),
  ]);

  const atual = serie[serie.length - 1];
  const auditoria = analisarAuditoria({
    indicadores,
    indices: atual,
    populacao: estado.populacao,
    grupoLabel: "dos pares da sua região",
  });
  const citizenAreas = CIDADAO.map((k) => auditoria.areas.find((a) => a.area === k)).filter(
    (a): a is AreaScore => Boolean(a),
  );

  return (
    <ExecutiveDashboard
      tipo="Estado"
      nome={estado.nome}
      uf={estado.uf}
      gestorLabel="Governador(a)"
      gestor={estado.governador}
      voltarHref={`/governador/${estado.uf}`}
      indices={atual}
      parecer={auditoria.parecer}
      citizenAreas={citizenAreas}
      fiscal={indicadores.filter((i) => i.area === "fiscal")}
      compras={compras.atual}
      financas={financas.atual}
      contratacoes={contratacoes}
      seed={estado.uf}
    />
  );
}
