import type { PerfilEducacaoSC } from "@/lib/queries";

// Perfil da rede municipal de educação — quem é atendido (equidade, inclusão, idade), turmas e transporte. Tom neutro.
export function PerfilEducacao({ dados, nome }: { dados: PerfilEducacaoSC; nome: string }) {
  if (!dados) return null;
  const maxI = Math.max(1, ...dados.idade.map((i) => i.n));
  const eq = [
    { l: "Meninas", v: dados.femPct }, { l: "Pretos + pardos", v: dados.negrosPct },
    { l: "Indígenas", v: dados.indigenaPct }, { l: "Educação especial (inclusão)", v: dados.especialPct }, { l: "Tempo integral", v: dados.integralPct },
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">👥 Perfil da rede municipal — quem é atendido</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Censo Escolar</span>
      </div>
      <p className="text-sm text-slate-500">Composição da rede municipal de {nome}: equidade, inclusão, faixas etárias, organização em turmas e transporte escolar.</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.matriculas.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-600">matrículas</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.turmas.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-600">turmas</div></div>
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3"><div className="text-xl font-bold tabular-nums text-teal-700">{dados.alunoPorTurma ?? "—"}</div><div className="text-[11px] text-slate-600">alunos por turma (média)</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.transpPublico.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-600">usam transporte escolar</div></div>
      </div>

      {/* equidade / inclusão */}
      <div className="mt-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Equidade e inclusão (% das matrículas)</div>
        <div className="space-y-1.5">
          {eq.map((e) => (
            <div key={e.l} className="flex items-center gap-2 text-xs">
              <span className="w-44 shrink-0 text-slate-600">{e.l}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-3 rounded bg-teal-500" style={{ width: `${Math.min(100, e.v)}%` }} /></div>
              <span className="w-12 shrink-0 text-right tabular-nums text-slate-700">{e.v}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* faixa etária */}
      {dados.idade.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Por faixa etária</div>
          <div className="flex items-end gap-1.5" style={{ height: 70 }}>
            {dados.idade.map((i) => (
              <div key={i.faixa} className="flex flex-1 flex-col items-center justify-end" title={`${i.faixa}: ${i.n.toLocaleString("pt-BR")}`}>
                <div className="w-full rounded-t bg-slate-400" style={{ height: `${Math.max(3, (i.n / maxI) * 56)}px` }} />
                <span className="mt-0.5 text-center text-[9px] leading-tight text-slate-400">{i.faixa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dados.transpMun > 0 && <p className="mt-3 text-[11px] text-slate-500">🚌 Transporte escolar: {dados.transpPublico.toLocaleString("pt-BR")} alunos no total · {dados.transpMun.toLocaleString("pt-BR")} sob responsabilidade do município (relacione com o PNATE recebido do FNDE).</p>}
      <p className="mt-1 text-[11px] text-slate-400">Fonte: INEP — Censo Escolar (rede municipal). Perfil consolidado de todas as escolas municipais do ente.</p>
    </section>
  );
}
