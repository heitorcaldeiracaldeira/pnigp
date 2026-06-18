import { NextResponse } from "next/server";
import { fetchItensPNCP } from "@/lib/pncp";
import { getItensPersistidosSC } from "@/lib/queries";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ cnpj: string; ano: string; seq: string }> }) {
  const { cnpj, ano, seq } = await params;
  try {
    // 1) banco (instantâneo) — itens persistidos no Neon
    const persistidos = await getItensPersistidosSC(cnpj, Number(ano), Number(seq));
    if (persistidos.length) return NextResponse.json(persistidos);
    // 2) sob demanda (PNCP) como fallback
    return NextResponse.json(await fetchItensPNCP(cnpj, Number(ano), Number(seq)));
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
