// RED FLAGS DE FORNECEDORES — sinais de risco de integridade por fornecedor: concentração de mercado, sanção vigente
// e sobrepreço. Tom neutro: são indícios para verificação (não acusação). Cruzamento exclusivo (compras+sanções+preços).
import { Siren, TrendingUp, ShieldAlert, Tag } from "lucide-react";
import type { RedFlagsSC } from "@/lib/queries";

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const mi = (n: number) => `R$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;

export function RedFlagsFornecedores({ data, nome }: { data: NonNullable<RedFlagsSC>; nome: string }) {
  const concentrado = data.topConcentracao >= 25;
  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Siren className="h-4 w-4 text-rose-600" /> Red flags de fornecedores</h3>
        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">{data.nFlagged} com sinal{data.nCriticos > 0 ? ` · ${data.nCriticos} crítico${data.nCriticos > 1 ? "s" : ""}` : ""}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">Fornecedores de {nome} com indícios de risco de integridade, cruzando <b>concentração</b> de mercado, <b>sanção vigente</b> (CEIS/CNEP) e <b>sobrepreço</b>. São pontos para verificação — não juízo sobre a contratação.</p>

      <div className={`mt-3 rounded-xl border p-3 ${concentrado ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><TrendingUp className="h-3.5 w-3.5 text-amber-600" /> Concentração de mercado</div>
        <p className="mt-1 text-sm text-slate-600">Seu maior fornecedor concentra <b className={concentrado ? "text-amber-700" : "text-slate-700"}>{data.topConcentracao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b> do valor contratado. {concentrado ? "Concentração elevada — avalie ampliar a competição para reduzir dependência e risco de direcionamento." : "Distribuição saudável entre fornecedores."}</p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-400">
            <th className="py-1.5">Fornecedor</th><th className="text-right">Contratos</th><th className="text-right">Valor</th><th className="text-right">Fatia</th><th>Sinais</th>
          </tr></thead>
          <tbody>
            {data.itens.map((f, i) => (
              <tr key={i} className={`border-b border-slate-50 ${f.flags >= 2 ? "bg-rose-50/50" : ""}`}>
                <td className="py-1.5 font-medium text-slate-700"><span className="line-clamp-1">{f.fornecedor}</span>{f.sancionado && f.sancOrgao && <span className="block text-[10px] font-normal text-slate-400">⚖ sancionado em: {f.sancOrgao.length > 60 ? f.sancOrgao.slice(0, 60) + "…" : f.sancOrgao}</span>}</td>
                <td className="text-right tabular-nums text-slate-500">{f.nContratos}</td>
                <td className="text-right tabular-nums text-slate-700">{f.valorTotal >= 1e6 ? mi(f.valorTotal) : brl(f.valorTotal)}</td>
                <td className={`text-right tabular-nums font-semibold ${f.sharePct >= 25 ? "text-amber-700" : "text-slate-500"}`}>{f.sharePct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {f.sharePct >= 25 && <span className="flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"><TrendingUp className="h-2.5 w-2.5" />concentração</span>}
                    {f.sancionado && <span className="flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700" title={f.sancTipo}><ShieldAlert className="h-2.5 w-2.5" />{f.sancTipo ? (f.sancTipo.length > 28 ? f.sancTipo.slice(0, 28) + "…" : f.sancTipo) : "sanção vigente"}</span>}
                    {f.sobreprecoEconomia > 50000 && <span className="flex items-center gap-0.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700" title="Diferença vs a referência de SC — indício a verificar, não sobrepreço confirmado"><Tag className="h-2.5 w-2.5" />indício de sobrepreço {brl(f.sobreprecoEconomia)}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Sinais: <b>concentração</b> = fatia &gt; 25% do valor total contratado pelo município; <b>sanção</b> = registro vigente no CEIS/CNEP, com o <b>órgão sancionador</b> (onde) e a <b>pena</b> indicados; <b>indício de sobrepreço</b> = itens pagos acima da referência de SC (&gt; R$ 50 mil) — a diferença é um indício a verificar, não sobrepreço confirmado (pode refletir especificação, marca, prazo). Fonte: PNCP (contratos/itens) + CGU (sanções). <b>Importante:</b> a sanção pode ter sido aplicada por <b>outro órgão</b> e ter <b>abrangência restrita</b> (nem toda sanção impede contratar em todo o país) — o registro é <b>informativo</b> e <b>não significa proibição</b>. A <b>decisão de contratar é prerrogativa discricionária do órgão</b>, que avalia a vigência, o alcance da sanção e a conveniência; estes indícios apenas <b>subsidiam</b> essa análise, sem juízo sobre a contratação.</p>
    </section>
  );
}
