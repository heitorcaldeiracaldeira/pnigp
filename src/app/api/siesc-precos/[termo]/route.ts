import { NextResponse } from "next/server";
import { getBuscaSiescEdificacoes, SIESC_COMPETENCIA } from "@/lib/queries-sinapi";

// Rota PRÓPRIA do Referencial de Preços da SIE-SC (edificações) — separada de /api/candidatos-preco (PNCP).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ termo: string }> }) {
  const { termo } = await params;
  try {
    const r = await getBuscaSiescEdificacoes(decodeURIComponent(termo));
    return NextResponse.json({ ...r, competencia: SIESC_COMPETENCIA });
  } catch (e) {
    return NextResponse.json({ erro: String((e as Error)?.message || e) }, { status: 500 });
  }
}
