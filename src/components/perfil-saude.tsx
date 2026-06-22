import type { PerfilSaudeSC } from "@/lib/queries";

// Perfil da rede de saúde — estrutura por nível de atenção, público×privado e cobertura per capita. Tom neutro/didático.
export function PerfilSaude({ dados, nome }: { dados: PerfilSaudeSC; nome: string }) {
  if (!dados) return null;
  const maxN = Math.max(1, ...dados.niveis.map((n) => n.n));
  const susPct = dados.total > 0 ? Math.round((dados.sus / dados.total) * 100) : 0;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🩺 Perfil da rede de saúde — como o município se organiza</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">CNES</span>
      </div>
      <p className="text-sm text-slate-500">A rede de saúde de {nome}: estrutura por nível de atenção, peso do público × privado e cobertura por habitante.</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.total.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-600">estabelecimentos</div></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"><div className="text-xl font-bold tabular-nums text-emerald-700">{dados.natureza.publico}</div><div className="text-[11px] text-slate-600">públicos</div></div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3"><div className="text-xl font-bold tabular-nums text-blue-700">{susPct}%</div><div className="text-[11px] text-slate-600">atendem SUS</div></div>
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3"><div className="text-xl font-bold tabular-nums text-teal-700">{dados.coberturaAPS ?? "—"}</div><div className="text-[11px] text-slate-600">unidades de atenção primária por 10 mil hab.</div></div>
      </div>

      {/* por nível de atenção */}
      <div className="mt-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Por nível de atenção (barra = total · trecho escuro = público)</div>
        <div className="space-y-1.5">
          {dados.niveis.map((nv) => (
            <div key={nv.nivel} className="flex items-center gap-2 text-xs">
              <span className="w-52 shrink-0 text-slate-600">{nv.nivel}</span>
              <div className="relative h-3 flex-1 overflow-hidden rounded bg-slate-100">
                <div className="absolute inset-y-0 left-0 rounded bg-teal-300" style={{ width: `${(nv.n / maxN) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 rounded bg-teal-600" style={{ width: `${(nv.pub / maxN) * 100}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right tabular-nums text-slate-700">{nv.n}<span className="text-slate-400"> ({nv.pub} púb)</span></span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-500">Atenção primária: {dados.apsTotal} unidades (UBS, postos, saúde da família) para {dados.populacao.toLocaleString("pt-BR")} habitantes. Cobertura e composição ajudam a planejar a regulação e onde expandir a rede.</p>
      <p className="mt-1 text-[11px] text-slate-400">Fonte: CNES (API DEMAS/Ministério da Saúde) + população (entes). Rede completa do município (todas as naturezas).</p>
    </section>
  );
}
