import { NextResponse } from "next/server";
import { getProcessoFasesSC } from "@/lib/queries";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  try {
    const fases = await getProcessoFasesSC(codigo);
    return NextResponse.json({ fases });
  } catch {
    return NextResponse.json({ fases: [] }, { status: 200 });
  }
}
