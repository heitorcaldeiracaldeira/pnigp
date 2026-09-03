import { NextResponse } from "next/server";
import { getBuscaBancoPrecos, getCandidatosPrecoReferencia, getDocumentoSobreSelecao } from "@/lib/queries";

// BANCO DE PREÇOS — os três passos da formação do preço de referência, na ordem em que a pessoa decide:
//   GET  /api/candidatos-preco/<termo>                        → OBJETOS: o que existe na base com esse texto
//   POST /api/candidatos-preco/<termo>  { chaves }            → CONTRATAÇÕES dos objetos escolhidos
//   POST /api/candidatos-preco/<termo>  { chaves, selecao }   → DOCUMENTO sobre as contratações escolhidas
//
// A separação existe porque a IN 65 não pede um número, pede o CRITÉRIO: quem assina precisa ver os
// processos, decidir quais entram e justificar. Calcular a mediana sozinho entrega o número e tira dele
// justamente o que o tornaria defensável.
//
// A busca do passo 1 corre TODOS os processos licitatórios da base (dicionário `app.item_busca`), e não só
// os itens com código de catálogo — que são 5,2% das descrições.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ q: string }> }) {
  const { q } = await params;
  try {
    return NextResponse.json(await getBuscaBancoPrecos(decodeURIComponent(q)));
  } catch (e) {
    return NextResponse.json({ erro: String((e as Error)?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ q: string }> }) {
  const { q } = await params;
  const termo = decodeURIComponent(q);
  try {
    const body = await req.json().catch(() => ({}));
    const chaves: string[] = Array.isArray(body?.chaves) ? body.chaves.map(String) : [];
    const selecao: string[] | null = Array.isArray(body?.selecao) ? body.selecao.map(String) : null;
    if (selecao === null) return NextResponse.json(await getCandidatosPrecoReferencia(termo, chaves));
    // Seleção vazia devolve 400 e não um documento vazio: documento de preço sem preço nenhum, juntado aos
    // autos, seria lido como "pesquisa feita, nada encontrado" — que é uma afirmação diferente de "não
    // escolhi nada ainda".
    if (!selecao.length) return NextResponse.json({ erro: "seleção vazia: informe os ids das contratações escolhidas" }, { status: 400 });
    return NextResponse.json(await getDocumentoSobreSelecao(termo, selecao, chaves));
  } catch (e) {
    return NextResponse.json({ erro: String((e as Error)?.message || e) }, { status: 500 });
  }
}
