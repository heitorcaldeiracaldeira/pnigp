import { NextResponse } from "next/server";
import { getAndamentoCompras } from "@/lib/queries";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  try {
    return NextResponse.json(await getAndamentoCompras(codigo));
  } catch {
    return NextResponse.json(null, { status: 200 });
  }
}
