import { redirect } from "next/navigation";
import { getMunicipios } from "@/lib/queries";

export default async function PainelIndex() {
  const municipios = await getMunicipios();
  const destino =
    municipios.find((m) => m.nome === "Niterói")?.codigo_ibge ??
    municipios[0]?.codigo_ibge;
  redirect(destino ? `/painel/${destino}` : "/");
}
