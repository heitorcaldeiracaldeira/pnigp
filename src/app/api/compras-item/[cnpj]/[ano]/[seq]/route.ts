import { NextResponse } from "next/server";
import { fetchItensPNCP } from "@/lib/pncp";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ cnpj: string; ano: string; seq: string }> }) {
  const { cnpj, ano, seq } = await params;
  try {
    const itens = await fetchItensPNCP(cnpj, Number(ano), Number(seq));
    return NextResponse.json(itens);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
