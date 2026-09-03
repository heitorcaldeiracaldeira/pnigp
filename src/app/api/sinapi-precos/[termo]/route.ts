import { NextResponse } from "next/server";
import { getBuscaSinapi, SINAPI_COMPETENCIA } from "@/lib/queries-sinapi";

// Rota PRÓPRIA do SINAPI — separada de /api/candidatos-preco (PNCP). Ver src/lib/queries-sinapi.ts.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ termo: string }> }) {
  const { termo } = await params;
  try {
    const r = await getBuscaSinapi(decodeURIComponent(termo));
    return NextResponse.json({ ...r, competencia: SINAPI_COMPETENCIA });
  } catch (e) {
    return NextResponse.json({ erro: String((e as Error)?.message || e) }, { status: 500 });
  }
}
