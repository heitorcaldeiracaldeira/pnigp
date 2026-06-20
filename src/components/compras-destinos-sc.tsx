import { MapPin, Tags, TrendingUp } from "lucide-react";
import type { ComprasDestinosSC } from "@/lib/queries";

const brl = (x: number) => (x >= 1e9 ? "R$ " + (x / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " bi" : "R$ " + (x / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi");
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function ComprasDestinosSCView({ data }: { data: NonNullable<ComprasDestinosSC> }) {
  const max = Math.max(...data.destinos.map((d) => d.valor), 1);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-violet-700"><TrendingUp className="h-4 w-4" /> Para onde vai o dinheiro das compras — municípios de SC</div>
        <p className="mt-1 text-sm text-slate-600">Destino (cidade do fornecedor) e categoria das empresas que mais venderam aos municípios. <b className="text-teal-700">{brl(data.scValor)}</b> ficaram em SC · <b className="text-amber-700">{brl(data.foraValor)}</b> saíram do estado <span className="text-[11px] text-slate-500">(origem resolvida em {data.coberturaPct}% do valor contratado).</span></p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><MapPin className="h-4 w-4 text-violet-600" /> Top 10 cidades/UF que mais receberam</h3>
          <div className="space-y-2">
            {data.destinos.map((d, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{i + 1}. {cap(d.municipio)}<span className={`ml-1 rounded px-1 py-0.5 text-[9px] font-bold ${d.uf === "SC" ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>{d.uf}</span></span>
                  <span className="tabular-nums font-semibold text-slate-800">{brl(d.valor)}</span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${d.uf === "SC" ? "bg-teal-500" : "bg-amber-500"}`} style={{ width: `${Math.max(3, (d.valor / max) * 100)}%` }} /></div>
                <div className="text-[11px] text-slate-500">{d.fornecedores} fornecedor(es)</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Tags className="h-4 w-4 text-violet-600" /> Top 5 categorias das empresas (CNAE)</h3>
          <div className="space-y-2">
            {data.categorias.map((c, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-slate-700">{i + 1}. {c.cnae}</span>
                  <span className="shrink-0 tabular-nums font-semibold text-slate-800">{brl(c.valor)}</span>
                </div>
                <div className="text-[11px] text-slate-500">{c.fornecedores} empresa(s)</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">Fonte: contratos PNCP × localidade/CNAE do CNPJ (Receita Federal). Cobertura cresce conforme a resolução dos fornecedores.</p>
    </div>
  );
}
