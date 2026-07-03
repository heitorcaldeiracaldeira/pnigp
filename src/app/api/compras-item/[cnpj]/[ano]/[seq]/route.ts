import { NextResponse } from "next/server";
import { fetchItensPNCP } from "@/lib/pncp";
import { getItensPersistidosSC, resolverLocalidadesCNPJ } from "@/lib/queries";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// anexa UF/município do fornecedor (via CNPJ) a cada item — resolve ao vivo + cacheia os ausentes
async function comLocalidade(itens: Array<Record<string, unknown>>) {
  const loc = await resolverLocalidadesCNPJ(itens.map((i) => String(i.cnpjFornecedor || "")));
  return itens.map((i) => { const l = loc[String(i.cnpjFornecedor || "")]; return { ...i, uf: l?.uf ?? null, municipio: l?.municipio ?? null }; });
}

export async function GET(_req: Request, { params }: { params: Promise<{ cnpj: string; ano: string; seq: string }> }) {
  const { cnpj, ano, seq } = await params;
  try {
    // 1) banco (instantâneo) — itens persistidos no Neon
    const persistidos = await getItensPersistidosSC(cnpj, Number(ano), Number(seq));
    if (persistidos.length) return NextResponse.json(await comLocalidade(persistidos));
    // 2) sob demanda (PNCP) como fallback
    return NextResponse.json(await comLocalidade(await fetchItensPNCP(cnpj, Number(ano), Number(seq)) as Array<Record<string, unknown>>));
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
