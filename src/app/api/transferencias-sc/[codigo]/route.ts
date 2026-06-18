import { NextResponse } from "next/server";
import { getOrFetchTransferenciasSC } from "@/lib/queries";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  try {
    const data = await getOrFetchTransferenciasSC(codigo);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null, { status: 200 });
  }
}
