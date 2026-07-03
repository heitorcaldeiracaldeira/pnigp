import { AlertTriangle, Database, Pill } from "lucide-react";
import type { SobreprecoMedicamentosSC } from "@/lib/queries";

const brl = (n: number) => "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mi = (n: number) => (Math.abs(n) >= 1e6 ? "R$ " + (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : Math.abs(n) >= 1e3 ? "R$ " + (n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil" : brl(n));
const n0 = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export function SobreprecoMedicamentos({ data, nome }: { data: NonNullable<SobreprecoMedicamentosSC>; nome: string }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><AlertTriangle aria-hidden className="h-4 w-4 text-amber-600" /> Indícios de sobrepreço em medicamentos (vs teto legal)</div>
        <span className="text-xs text-slate-500">{data.n} indício(s){data.economiaTotal > 0 ? ` · ${mi(data.economiaTotal)} de excesso potencial` : ""}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">Comparamos o preço pago <b>por comprimido</b> em {nome} com o <b>PMVG</b> (Preço Máximo de Venda ao Governo — teto legal da Anvisa/CMED) da mesma substância e dosagem. São <b>indícios a verificar</b>: a apresentação/embalagem exata pode diferir, e a decisão de compra é prerrogativa do órgão.</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-amber-200 text-left text-[11px] uppercase text-slate-500">
            <th className="py-1.5">Medicamento · dosagem</th><th className="text-right">Pago/comp.</th><th className="text-right">Teto PMVG</th><th className="text-right">Excesso</th><th className="text-right">Excesso potencial</th>
          </tr></thead>
          <tbody>
            {data.itens.map((it, i) => (
              <tr key={i} className="border-b border-amber-100/60 align-top">
                <td className="py-1.5"><div className="font-medium text-slate-700">{it.descricao}</div><div className="text-[11px] text-slate-500">{it.dose} · {n0(it.quantidade)} comp. no período</div></td>
                <td className="whitespace-nowrap text-right font-semibold tabular-nums text-rose-700">{brl(it.paga)}</td>
                <td className="whitespace-nowrap text-right tabular-nums text-slate-600">{brl(it.teto)}</td>
                <td className="whitespace-nowrap text-right font-semibold tabular-nums text-amber-700">+{it.excessoPct.toFixed(0)}%</td>
                <td className="whitespace-nowrap text-right tabular-nums text-slate-700">{mi(it.economia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database aria-hidden className="h-3 w-3" /> Dados oficiais</span>
        Metodologia (conservadora): casamento por substância + dosagem; o teto usado é o <b>PMVG mais alto</b> daquela dosagem (a apresentação mais cara), e só marcamos quando o preço pago supera esse teto em mais de 15%. SC = alíquota ICMS 17%. <Pill aria-hidden className="inline h-3 w-3" /> Fonte: Anvisa/CMED + compras do PNCP. O “excesso potencial” é acumulado no período coletado e serve de ponto de partida para a verificação, não de conclusão.
      </p>
    </section>
  );
}
