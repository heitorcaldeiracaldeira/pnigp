import { AlertTriangle, CheckCircle2, Gauge, ShieldAlert, Trophy } from "lucide-react";

type Prioridade = { titulo: string; sugestao: string } | null;
const TOM = {
  ok: { rotulo: "Sem alertas críticos", cls: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50", chip: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2 },
  ressalva: { rotulo: "Com ressalvas", cls: "border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50", chip: "bg-amber-100 text-amber-700", Icon: AlertTriangle },
  critico: { rotulo: "Atenção — pontos críticos", cls: "border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50", chip: "bg-rose-100 text-rose-700", Icon: ShieldAlert },
};

export function ResumoExecutivo({ nome, tom, nAlertas, prioridade, posicao, total, scoreFiscal, ano }: {
  nome: string; tom: "ok" | "ressalva" | "critico"; nAlertas: number; prioridade: Prioridade;
  posicao?: number | null; total?: number | null; scoreFiscal?: number | null; ano?: number | null;
}) {
  const t = TOM[tom];
  return (
    <div className={`mb-4 rounded-2xl border p-5 ${t.cls}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <t.Icon className="h-5 w-5 text-slate-700" />
          <span className="text-sm font-semibold text-slate-800">Resumo executivo — {nome}</span>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.chip}`}>{t.rotulo}{ano ? ` · ${ano}` : ""}</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/60 bg-white/70 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><AlertTriangle className="h-3.5 w-3.5" /> Pontos de atenção (LRF/CF)</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{nAlertas}</div>
          <div className="text-[11px] text-slate-500">{nAlertas === 0 ? "nenhum indicador fora do limite" : "indicador(es) fora do parâmetro legal"}</div>
        </div>
        {posicao != null && total != null && (
          <div className="rounded-xl border border-white/60 bg-white/70 p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><Trophy className="h-3.5 w-3.5" /> Posição fiscal em SC</div>
            <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{posicao}º<span className="text-sm font-normal text-slate-400">/{total}</span></div>
            <div className="text-[11px] text-slate-500">{scoreFiscal != null ? `índice fiscal ${scoreFiscal.toFixed(1)}` : "ranking estadual"}</div>
          </div>
        )}
        <div className="rounded-xl border border-white/60 bg-white/70 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><Gauge className="h-3.5 w-3.5" /> Prioridade nº 1</div>
          {prioridade ? (
            <>
              <div className="text-sm font-semibold text-slate-800">{prioridade.titulo}</div>
              <div className="text-[11px] text-slate-500">{prioridade.sugestao || "ver aba Diagnóstico"}</div>
            </>
          ) : (
            <div className="text-sm text-slate-600">Gestão dentro dos parâmetros legais — manter o equilíbrio.</div>
          )}
        </div>
      </div>
    </div>
  );
}
