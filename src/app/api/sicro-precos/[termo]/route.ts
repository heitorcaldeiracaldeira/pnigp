import { NextResponse } from "next/server";
import { getBuscaSicro, SICRO_COMPETENCIA } from "@/lib/queries-sinapi";

// Rota PRÓPRIA do SICRO (DNIT) — separada de /api/candidatos-preco (PNCP). Ver src/lib/queries-sinapi.ts.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ termo: string }> }) {
  const { termo } = await params;
  try {
    const r = await getBuscaSicro(decodeURIComponent(termo));
    return NextResponse.json({ ...r, competencia: SICRO_COMPETENCIA });
  } catch (e) {
    return NextResponse.json({ erro: String((e as Error)?.message || e) }, { status: 500 });
  }
}
