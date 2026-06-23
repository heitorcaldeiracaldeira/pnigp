import type { FornecedoresSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

// Fornecedores do município (PNCP): concentração, ME/EPP (fomento local), de fora (vazamento), recorrentes. Tom neutro.
const ORIG = { local: { l: "no município", c: "bg-emerald-100 text-emerald-700" }, sc: { l: "outro município SC", c: "bg-sky-100 text-sky-700" }, fora: { l: "fora de SC", c: "bg-rose-100 text-rose-700" }, "?": { l: "—", c: "bg-slate-100 text-slate-500" } } as const;
const porteSigla = (p: string) => /micro/i.test(p) ? "ME" : /pequen|epp/i.test(p) ? "EPP" : /m[eé]dia/i.test(p) ? "Média" : /grande|demais/i.test(p) ? "Grande" : "—";

export function FornecedoresCard({ dados, nome }: { dados: FornecedoresSC; nome: string }) {
  if (!dados) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🏢 Fornecedores — para onde vai o dinheiro das compras</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">PNCP</span>
      </div>
      <p className="text-sm text-slate-500">{dados.nForn.toLocaleString("pt-BR")} fornecedores em {nome}. Concentração, peso das pequenas empresas (ME/EPP) e quanto fica na economia local × vaza para fora.</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={`rounded-xl border p-3 ${dados.concentracaoTop5 >= 60 ? "border-amber-200 bg-amber-50/60" : "border-slate-200"}`}><div className={`text-xl font-bold tabular-nums ${dados.concentracaoTop5 >= 60 ? "text-amber-700" : "text-slate-800"}`}>{dados.concentracaoTop5}%</div><div className="text-[11px] text-slate-600">nos 5 maiores (concentração)</div></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"><div className="text-xl font-bold tabular-nums text-emerald-700">{dados.meEppPct}%</div><div className="text-[11px] text-slate-600">em ME/EPP (LC 123)</div></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"><div className="text-xl font-bold tabular-nums text-emerald-700">{dados.localPct}%</div><div className="text-[11px] text-slate-600">fica no próprio município</div></div>
        <div className={`rounded-xl border p-3 ${dados.foraScPct >= 40 ? "border-rose-200 bg-rose-50/50" : "border-slate-200"}`}><div className={`text-xl font-bold tabular-nums ${dados.foraScPct >= 40 ? "text-rose-700" : "text-slate-800"}`}>{dados.foraScPct}%</div><div className="text-[11px] text-slate-600">vaza para fora de SC</div></div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[600px] text-xs">
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="p-2 font-medium">Fornecedor</th><th className="p-2 font-medium">Porte</th><th className="p-2 font-medium">Origem</th><th className="p-2 text-right font-medium">Contratado</th><th className="p-2 text-right font-medium">Processos</th></tr></thead>
          <tbody>
            {dados.top.map((f, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0">
                <td className="p-2 text-slate-700">{f.nome.slice(0, 40)}</td>
                <td className="p-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{porteSigla(f.porte)}</span></td>
                <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ORIG[f.origem].c}`}>{ORIG[f.origem].l}</span></td>
                <td className="p-2 text-right font-semibold tabular-nums text-slate-800">{fmtBRLCompact(f.valor)}</td>
                <td className="p-2 text-right tabular-nums text-slate-500">{f.processos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Fonte: PNCP (itens homologados) + Receita (localização do CNPJ). Concentração alta (≥60% nos 5 maiores) ou muito "fora de SC" merecem atenção (competição/economia local). Origem "—" = CNPJ sem localização na base. Outliers (&gt;R$200M/linha) excluídos.</p>
    </section>
  );
}
