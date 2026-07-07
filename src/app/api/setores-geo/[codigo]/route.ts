// Malha (GeoJSON) dos setores censitários do município sob demanda — o geojson (até ~1 MB) é buscado
// quando o mapa intraurbano entra na tela, não serializado no HTML inicial do painel /real.
import { NextResponse } from "next/server";
import { getSetoresGeoSC } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const geo = await getSetoresGeoSC(codigo).catch(() => null);
  return NextResponse.json(geo);
}
