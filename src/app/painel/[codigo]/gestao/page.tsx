import { notFound } from "next/navigation";
import { ExecutiveDashboard } from "@/components/executive-dashboard";
import { analisarAuditoria, type AreaScore } from "@/lib/audit";
import {
  getCompras,
  getContratacoes,
  getFinancas,
  getIndicadores,
  getIndicesSerie,
  getMunicipio,
} from "@/lib/queries";

const CIDADAO = ["saude", "educacao", "seguranca", "social"] as const;

export default async function PainelExecutivoMunicipio({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const municipio = await getMunicipio(codigo);
  if (!municipio) notFound();

  const [serie, indicadores, compras, financas, contratacoes] = await Promise.all([
    getIndicesSerie(municipio.id),
    getIndicadores(municipio.id, municipio.porte),
    getCompras("M", municipio.id),
    getFinancas("M", municipio.id),
    getContratacoes("M", municipio.id),
  ]);

  const atual = serie[serie.length - 1];
  const auditoria = analisarAuditoria({
    indicadores,
    indices: atual,
    populacao: municipio.populacao,
    grupoLabel: "dos pares do seu porte",
  });
  const citizenAreas = CIDADAO.map((k) => auditoria.areas.find((a) => a.area === k)).filter(
    (a): a is AreaScore => Boolean(a),
  );

  return (
    <ExecutiveDashboard
      tipo="Município"
      nome={municipio.nome}
      uf={municipio.uf}
      gestorLabel="Prefeito(a)"
      gestor={municipio.prefeito}
      voltarHref={`/painel/${codigo}`}
      indices={atual}
      parecer={auditoria.parecer}
      citizenAreas={citizenAreas}
      fiscal={indicadores.filter((i) => i.area === "fiscal")}
      compras={compras.atual}
      financas={financas.atual}
      contratacoes={contratacoes}
      seed={codigo}
    />
  );
}
