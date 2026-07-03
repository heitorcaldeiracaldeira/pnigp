// Geolocalização sob demanda — o mapa (846 KB, 1.669 equipamentos) é carregado quando a aba abre,
// não embutido no HTML inicial do painel. Reduz o peso da página /real.
import { NextResponse } from "next/server";
import { getMapaEquipamentosSC } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const data = await getMapaEquipamentosSC(codigo).catch(() => null);
  return NextResponse.json(data);
}
