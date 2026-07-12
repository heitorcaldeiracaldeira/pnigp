// Alerta de UNIDADE TROCADA no lançamento — item cujo preço/unidade básica destoa ≥100× da mediana do grupo (CATMAT+base).
// Framing NEUTRO (verificar, não acusar): é qualidade de dado, não sobrepreço. Efeito colateral do Passe 2 (desempacotamento).
import { AlertTriangle } from "lucide-react";
import type { MislabelSC } from "@/lib/queries";

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const perBasica = (v: number, base: string) => {
  if (base === "g") return brl(v * 1000) + "/kg";
  if (base === "ml") return brl(v * 1000) + "/L";
  return brl(v) + "/" + base;
};

export function MislabelUnidade({ data, nome }: { data: NonNullable<MislabelSC>; nome: string }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-700"><AlertTriangle className="h-4 w-4" /> Possível unidade trocada no lançamento</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{data.n} a verificar</span>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">Ao reduzir cada compra à <b>unidade básica</b>, {nome} tem lançamentos cujo preço destoa <b>≥100×</b> da mediana do mesmo item (CATMAT) na mesma unidade — assinatura típica de <b>unidade digitada errada</b> (ex.: preço por kg marcado como “grama”) ou de <b>valor total lançado como unitário</b>. Não é indício de sobrepreço; é um ponto de <b>conferência do registro</b>.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead><tr className="border-b border-amber-200 text-[10px] uppercase tracking-wide text-slate-400">
            <th className="py-1 pr-2">Item</th><th className="px-2">Unidade lançada</th><th className="px-2 text-right">Preço/un. básica</th><th className="px-2 text-right">Mediana do grupo</th><th className="px-2 text-right">Desvio</th><th className="pl-2">Provável causa</th>
          </tr></thead>
          <tbody>
            {data.itens.map((it, i) => (
              <tr key={i} className="border-b border-amber-100/70 align-top">
                <td className="py-1.5 pr-2 font-medium text-slate-700">{it.descricao.length > 46 ? it.descricao.slice(0, 46) + "…" : it.descricao}</td>
                <td className="px-2 text-slate-500">{it.unidade} <span className="text-slate-400">({brl(it.unitHomologado)})</span></td>
                <td className="px-2 text-right font-semibold tabular-nums text-amber-700">{perBasica(it.precoBasico, it.unidadeBasica)}</td>
                <td className="px-2 text-right tabular-nums text-slate-500">{perBasica(it.mediana, it.unidadeBasica)}</td>
                <td className="px-2 text-right font-bold tabular-nums" style={{ color: it.alto ? "#b45309" : "#0369a1" }}>{it.alto ? "" : "1/"}{it.ratio}×</td>
                <td className="pl-2 text-[10px] text-slate-500">{it.causa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10px] text-slate-400">Método: compara o preço por unidade básica de cada lançamento à <b>mediana</b> do grupo <b>CATMAT + unidade básica</b> (mín. 8 compras). Sinaliza desvios ≥100× — que não se explicam por variação normal de preço no mesmo item/unidade. Framing conforme a diretriz de neutralidade: apontar para verificação, sem juízo sobre a gestão.</p>
    </section>
  );
}
