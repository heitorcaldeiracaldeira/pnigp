// Rota legada (modelo antigo `municipios`, 26 demos) → redireciona para o painel SC de produção (`/real`, 296 entes).
import { redirect } from "next/navigation";

export default async function RelatorioLegadoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  redirect(`/real/${codigo}`);
}
