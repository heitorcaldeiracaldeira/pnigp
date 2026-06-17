import { redirect } from "next/navigation";
import { getEstados } from "@/lib/queries";

export default async function GovernadorIndex() {
  const estados = await getEstados();
  const destino =
    estados.find((e) => e.uf === "SP")?.uf ?? estados[0]?.uf;
  redirect(destino ? `/governador/${destino}` : "/");
}
