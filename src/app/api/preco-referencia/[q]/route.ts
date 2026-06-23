import { NextResponse } from "next/server";
import { getPesquisaPrecoSC } from "@/lib/queries";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ q: string }> }) {
  const { q } = await params;
  try {
    const data = await getPesquisaPrecoSC(decodeURIComponent(q));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
