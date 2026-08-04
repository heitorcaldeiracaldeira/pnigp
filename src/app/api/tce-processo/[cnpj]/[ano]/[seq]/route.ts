import { NextResponse } from "next/server";
import { getTceApontamentosDoProcesso, getTceApontamentosDoContrato } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Apontamentos do TCE/SC de UM processo, separados por GRÃO:
//   processo  → trilha de participante + ocorrência (pertencem à licitação)
//   contratos → tipologia de contratado, por CNPJ (pertence ao contrato assinado)
// Misturar os dois inflava o número em 12× por fan-out do vínculo contrato→processo.
export async function GET(_req: Request, { params }: { params: Promise<{ cnpj: string; ano: string; seq: string }> }) {
  const { cnpj, ano, seq } = await params;
  try {
    const [processo, contratos] = await Promise.all([
      getTceApontamentosDoProcesso(cnpj, Number(ano), Number(seq)),
      getTceApontamentosDoContrato(cnpj, Number(ano), Number(seq)),
    ]);
    return NextResponse.json({ processo, contratos });
  } catch {
    return NextResponse.json({ processo: [], contratos: [] }, { status: 200 });
  }
}
