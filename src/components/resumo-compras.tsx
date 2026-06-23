import type { AnaliseComprasItens, FornecedoresSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

// Resumo executivo da aba Compras — 4 números-chave para o gestor leigo bater o olho. Tom neutro.
export function ResumoCompras({ analise, fornec }: { analise: AnaliseComprasItens; fornec: FornecedoresSC }) {
  if (!analise && !fornec) return null;
  const cards = [
    analise?.economiaTotal ? { v: fmtBRLCompact(analise.economiaTotal), l: "economia potencial", h: "itens pagos acima da mediana de SC", c: "text-emerald-700", b: "border-emerald-200 bg-emerald-50/50" } : null,
    analise?.tempo ? { v: `${analise.tempo.diasMedio} dias`, l: "tempo médio do processo", h: "da publicação ao contrato", c: "text-slate-800", b: "border-slate-200" } : null,
    fornec ? { v: `${fornec.meEppPct}%`, l: "em ME/EPP", h: "valor que vai a pequenas empresas (LC 123)", c: "text-emerald-700", b: "border-emerald-200 bg-emerald-50/50" } : null,
    fornec ? { v: `${fornec.foraScPct}%`, l: "vaza para fora de SC", h: "valor contratado de fornecedores de outro estado", c: fornec.foraScPct >= 40 ? "text-rose-700" : "text-slate-800", b: fornec.foraScPct >= 40 ? "border-rose-200 bg-rose-50/50" : "border-slate-200" } : null,
  ].filter(Boolean) as { v: string; l: string; h: string; c: string; b: string }[];
  if (!cards.length) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-2 font-semibold text-slate-800">📌 Resumo de Compras — o essencial</h3>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <div key={i} className={`rounded-xl border p-3 ${c.b}`}>
            <div className={`text-2xl font-bold tabular-nums ${c.c}`}>{c.v}</div>
            <div className="text-[12px] font-medium text-slate-700">{c.l}</div>
            <div className="mt-0.5 text-[10px] text-slate-500">{c.h}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Estimativas indicativas sobre dados oficiais do PNCP (compras efetivadas) — detalhes e metodologia nas seções abaixo.</p>
    </section>
  );
}
