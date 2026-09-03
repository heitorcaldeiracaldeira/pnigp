import BancoPrecosPainel from "@/components/banco-precos-painel";
import OrcamentoObraPainel from "@/components/orcamento-obra-painel";

// ENDEREÇO PRÓPRIO do Banco de Preços — a MESMA tela que vive na aba "Processo Licitatório" da página do
// município, servida sozinha. Existe por uma razão medida: a página do município leva ~106 s de SSR (ela
// monta 20+ seções), e uma ferramenta de trabalho não pode custar isso a cada consulta. Aqui abre na hora,
// porque não depende de nenhum dado do servidor: a tela busca tudo pela API, sob demanda.
export const metadata = { title: "Banco de Preços — PNIGP" };
export const dynamic = "force-static";

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-slate-800">Banco de Preços</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
          Formação do preço de referência a partir das contratações reais publicadas no PNCP, item a item.
          Busque o objeto, escolha quais contratações entram na conta e gere o documento com mediana, quartis,
          metodologia, ressalvas e o número de controle PNCP de cada preço.
        </p>
      </header>
      <BancoPrecosPainel />
      <OrcamentoObraPainel />
    </main>
  );
}
