// Diagnóstico da Auditoria sob demanda — o `diag` (~2,6 MB) é buscado quando a aba Auditoria abre,
// não serializado no HTML inicial do painel /real.
import { NextResponse } from "next/server";
import { getDiagnosticoGestorSC, getDiagnosticoEstadoSC } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const diag = (await getDiagnosticoGestorSC(codigo).catch(() => null)) ?? (await getDiagnosticoEstadoSC(codigo).catch(() => null));
  return NextResponse.json(diag);
}
