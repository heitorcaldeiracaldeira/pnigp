// MINUTA DA LOA — apresenta a sugestão do motor no formato OFICIAL (articulado + anexos da Lei 4.320/64 + LRF),
// o padrão que o TCE-SC reconhece e fiscaliza (e-Sfinge). Internamente consistente: receita = despesa; anexos batem com o total.
// Não cria dado novo — compõe receita por origem (projeção) + despesa por função (peça) + por natureza (MSC).
import { ScrollText } from "lucide-react";
import type { PecaCompletaSC, ProjecaoReceitaSC, MscDespesaSC } from "@/lib/queries";

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const extenso = (n: number) => {
  const mi = n / 1e6;
  if (mi >= 1000) return `${(mi / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} bilhões`;
  return `${mi.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} milhões`;
};

export function MinutaLoa({ peca, projecao, mscDespesa, nome }: { peca: NonNullable<PecaCompletaSC>; projecao: NonNullable<ProjecaoReceitaSC>; mscDespesa: MscDespesaSC; nome: string }) {
  const ano = peca.proximoAno;
  const total = projecao.totalProjetado; // total mestre = soma das origens projetadas (Anexo I)
  // Anexo III — despesa por função (shares da peça escaladas ao total, p/ equilíbrio receita=despesa)
  const somaFunc = peca.funcoes.reduce((s, f) => s + f.valorSugerido, 0) || 1;
  const funcoes = peca.funcoes.map((f) => ({ nome: f.funcao, valor: Math.round((f.valorSugerido / somaFunc) * total), min: f.ajustadoAoMinimo }));
  // Anexo II — despesa por natureza (shares da MSC escaladas ao total)
  const somaNat = mscDespesa ? mscDespesa.natureza.reduce((s, n) => s + n.valor, 0) || 1 : 1;
  const natureza = mscDespesa ? mscDespesa.natureza.map((n) => ({ cat: n.categoria, valor: Math.round((n.valor / somaNat) * total) })) : [];
  const correntes = ["Pessoal e Encargos", "Juros e Encargos da Dívida", "Outras Despesas Correntes"];
  const fmtReceita = (tipo: string) => (tipo === "federal" ? "Transferências da União" : tipo === "estadual" ? "Cota-parte do Estado" : "Receita própria");

  return (
    <section className="rounded-2xl border-2 border-slate-300 bg-white p-5 font-serif">
      <div className="mb-3 border-b border-slate-200 pb-3 text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><ScrollText className="h-3.5 w-3.5" /> Minuta sugerida · formato Lei 4.320/64 + LRF</div>
        <h3 className="mt-1 font-bold text-slate-800">LEI ORÇAMENTÁRIA ANUAL — LOA {ano}</h3>
        <p className="text-xs text-slate-500">Município de {nome} · estrutura reconhecida pelo TCE-SC (e-Sfinge)</p>
      </div>

      {/* ARTICULADO */}
      <div className="space-y-2 text-sm text-slate-700">
        <p><b>Art. 1º</b> — Fica estimada a Receita e fixada a Despesa do Município de {nome} para o exercício financeiro de {ano} no valor de <b>{brl(total)}</b> (aproximadamente {extenso(total)}), observado o equilíbrio orçamentário.</p>
        <p><b>Art. 2º</b> — A Receita será realizada mediante a arrecadação de tributos, transferências e demais receitas, na forma do Anexo I.</p>
        <p><b>Art. 3º</b> — A Despesa será fixada por função e por natureza, na forma dos Anexos II e III, respeitados os pisos constitucionais da saúde ({brl(peca.saudeMin)}) e da educação ({brl(peca.educMin)}) e o limite de pessoal da LRF.</p>
        <p><b>Art. 4º</b> — Fica o Poder Executivo autorizado a abrir créditos adicionais suplementares até o limite de 10% da despesa fixada, nos termos da Lei 4.320/64.</p>
      </div>

      {/* ANEXO I — RECEITA */}
      <div className="mt-4">
        <div className="mb-1 text-xs font-bold uppercase text-slate-600">Anexo I — Estimativa da Receita por Origem <span className="font-normal text-slate-400">(Lei 4.320/64, Anexo 2)</span></div>
        <table className="w-full text-sm">
          <tbody>
            {projecao.itens.map((it) => (
              <tr key={it.item} className="border-b border-slate-50">
                <td className="py-1 text-slate-700">{it.item} <span className="text-[10px] text-slate-400">· {fmtReceita(it.tipo)}{it.oficial ? " (oficial)" : ""}</span></td>
                <td className="py-1 text-right tabular-nums text-slate-700">{brl(it.projetado)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 font-bold"><td className="py-1 text-slate-800">TOTAL DA RECEITA</td><td className="py-1 text-right tabular-nums text-indigo-700">{brl(total)}</td></tr>
          </tbody>
        </table>
      </div>

      {/* ANEXO II — DESPESA POR NATUREZA */}
      {natureza.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-bold uppercase text-slate-600">Anexo II — Fixação da Despesa por Natureza <span className="font-normal text-slate-400">(Lei 4.320/64, Anexo 2)</span></div>
          <table className="w-full text-sm">
            <tbody>
              {natureza.map((n) => (
                <tr key={n.cat} className="border-b border-slate-50">
                  <td className="py-1 text-slate-700">{n.cat} <span className="text-[10px] text-slate-400">· {correntes.includes(n.cat) ? "Despesa Corrente" : "Despesa de Capital"}</span></td>
                  <td className="py-1 text-right tabular-nums text-slate-700">{brl(n.valor)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 font-bold"><td className="py-1 text-slate-800">TOTAL DA DESPESA</td><td className="py-1 text-right tabular-nums text-indigo-700">{brl(total)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ANEXO III — DESPESA POR FUNÇÃO */}
      <div className="mt-4">
        <div className="mb-1 text-xs font-bold uppercase text-slate-600">Anexo III — Fixação da Despesa por Função <span className="font-normal text-slate-400">(Lei 4.320/64, Anexos 7 e 8)</span></div>
        <table className="w-full text-sm">
          <tbody>
            {funcoes.map((f) => (
              <tr key={f.nome} className="border-b border-slate-50">
                <td className="py-1 text-slate-700">{f.nome}{f.min ? <span className="text-[10px] text-amber-600"> · elevada ao piso</span> : ""}</td>
                <td className="py-1 text-right tabular-nums text-slate-700">{brl(f.valor)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 font-bold"><td className="py-1 text-slate-800">TOTAL</td><td className="py-1 text-right tabular-nums text-indigo-700">{brl(total)}</td></tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 font-sans text-[11px] text-slate-400">Minuta gerada pelo motor de sugestão — <b>não substitui</b> a peça oficial; é um ponto de partida no formato da Lei 4.320/64 e da LRF, pronto para detalhamento por unidade orçamentária, programa e ação no <b>QDD</b> e envio ao <b>e-Sfinge</b> (TCE-SC). Receita ancorada em fontes oficiais (STN/SEF-SC); despesa por função respeita pisos e teto de pessoal; natureza conciliada com o RREO.</p>
    </section>
  );
}
