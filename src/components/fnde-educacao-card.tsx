import type { FndeEducacaoSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

// Recursos federais da educação (FNDE/SIMAD) recebidos pelo município — PNAE, PNATE, FUNDEB, salário-educação…
export function FndeEducacaoCard({ dados, nome }: { dados: FndeEducacaoSC; nome: string }) {
  if (!dados) return null;
  const maxP = Math.max(1, ...dados.porPrograma.map((p) => p.valor));
  const maxS = Math.max(1, ...dados.serie.map((s) => s.valor));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">💰 Recursos do FNDE recebidos · {nome}</h3>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">FNDE/SIMAD</span>
      </div>
      <p className="text-sm text-slate-500">Dinheiro federal da educação repassado à prefeitura — PNAE (alimentação), PNATE (transporte), FUNDEB, salário-educação. Fonte oficial, série histórica.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"><div className="text-xl font-bold tabular-nums text-emerald-700">{fmtBRLCompact(dados.total)}</div><div className="text-[11px] text-slate-600">total recebido (histórico)</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{fmtBRLCompact(dados.totalUlt)}</div><div className="text-[11px] text-slate-600">em {dados.anoUlt}</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.nLib.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-600">liberações registradas</div></div>
      </div>

      {dados.porPrograma.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Por programa</div>
          <div className="space-y-1.5">
            {dados.porPrograma.map((p) => (
              <div key={p.programa} className="flex items-center gap-2 text-xs">
                <span className="w-44 shrink-0 truncate text-slate-600" title={p.programa}>{p.programa}</span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-3 rounded bg-emerald-500" style={{ width: `${(p.valor / maxP) * 100}%` }} /></div>
                <span className="w-16 shrink-0 text-right tabular-nums text-slate-700">{fmtBRLCompact(p.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dados.serie.length > 1 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Série histórica</div>
          <div className="flex items-end gap-1" style={{ height: 64 }}>
            {dados.serie.map((s) => (
              <div key={s.ano} className="flex flex-1 flex-col items-center justify-end" title={`${s.ano}: ${fmtBRLCompact(s.valor)}`}>
                <div className="w-full rounded-t bg-teal-400" style={{ height: `${Math.max(3, (s.valor / maxS) * 54)}px` }} />
                <span className="mt-0.5 text-[8px] text-slate-400">{String(s.ano).slice(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-400">Fonte: FNDE/SIMAD liberações (dado oficial). Coleta em andamento — a série se completa conforme a coleta avança.</p>
    </section>
  );
}
