import type { CensoTendenciaSC } from "@/lib/queries";

// Tendência histórica da rede municipal (Censo escola×ano) — mini-gráficos de linha por métrica. Tom neutro.
function Spark({ valores, fmt, cor }: { valores: number[]; fmt: (v: number) => string; cor: string }) {
  const min = Math.min(...valores), max = Math.max(...valores), span = max - min || 1;
  const w = 200, h = 40;
  const pts = valores.map((v, i) => `${(i / (valores.length - 1)) * w},${h - ((v - min) / span) * (h - 6) - 3}`).join(" ");
  const first = valores[0], last = valores[valores.length - 1];
  const delta = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: 40 }}>
        <polyline points={pts} fill="none" stroke={cor} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-slate-500">{fmt(first)}</span>
        <span className={`font-semibold ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 10) / 10)}%</span>
        <span className="font-medium text-slate-700">{fmt(last)}</span>
      </div>
    </div>
  );
}

export function CensoTendencias({ dados, nome }: { dados: CensoTendenciaSC; nome: string }) {
  if (!dados) return null;
  const p = dados.pontos;
  const a0 = p[0].ano, a1 = p[p.length - 1].ano;
  const nf = (v: number) => v.toLocaleString("pt-BR");
  const metrs = [
    { t: "Matrículas (rede municipal)", v: p.map((x) => x.matriculas), fmt: nf, cor: "#0d9488" },
    { t: "Docentes", v: p.map((x) => x.docentes), fmt: nf, cor: "#2563eb" },
    { t: "Alunos por professor", v: p.map((x) => x.alunoPorDoc ?? 0), fmt: (v: number) => String(v), cor: "#7c3aed" },
    { t: "% inclusão (educação especial)", v: p.map((x) => x.especialPct), fmt: (v: number) => v + "%", cor: "#db2777" },
    { t: "% tempo integral", v: p.map((x) => x.integralPct), fmt: (v: number) => v + "%", cor: "#ea580c" },
    { t: "Escolas em atividade", v: p.map((x) => x.escolas), fmt: nf, cor: "#475569" },
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">📈 Tendências da rede municipal ({a0}–{a1})</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Censo · {p.length} anos</span>
      </div>
      <p className="text-sm text-slate-500">Como a rede municipal de {nome} evoluiu — matrículas, corpo docente, inclusão e tempo integral ao longo do tempo. Variação = do primeiro ao último ano.</p>
      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrs.map((m) => (
          <div key={m.t}>
            <div className="mb-1 text-xs font-medium text-slate-600">{m.t}</div>
            <Spark valores={m.v} fmt={m.fmt} cor={m.cor} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Fonte: INEP — Censo Escolar, série {a0}–{a1} (rede municipal). Tendência consolidada de todas as escolas municipais.</p>
    </section>
  );
}
