import { NextResponse } from "next/server";
import { getContratosDoProcesso } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ cnpj: string; ano: string; seq: string }> }) {
  const { cnpj, ano, seq } = await params;
  try {
    return NextResponse.json(await getContratosDoProcesso(cnpj, Number(ano), Number(seq)));
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
