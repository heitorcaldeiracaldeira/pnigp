// Painel de Dívida do município — Dívida Consolidada Líquida (DCL) oficial do RGF/SICONFI: valor, % da RCL vs limite
// legal (120%, Res. SF 40/2001), margem p/ novas operações de crédito, série e posição em SC. Aba Finanças. Server component.
import type { DividaSC } from "@/lib/queries";
import { BaixarCsv } from "./baixar-csv";
import { Landmark, TrendingDown, Info } from "lucide-react";

const brlMi = (v: number) => (v >= 1e9 ? `R$ ${(v / 1e9).toFixed(2)} bi` : `R$ ${(v / 1e6).toFixed(1)} mi`);
const pc = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Spark({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const max = Math.max(...pts, 1), min = Math.min(...pts, 0); const W = 200, H = 32;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * H}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-full" preserveAspectRatio="none"><polyline points={d} fill="none" stroke="#7c3aed" strokeWidth="1.5" /></svg>;
}

export function DividaPanel({ data, nome }: { data: NonNullable<DividaSC>; nome: string }) {
  const d = data;
  const folga = d.limite - d.dclPct; // pontos percentuais até o limite
  const nivel = d.dclPct > d.limite ? "critico" : d.dclPct > d.limite * 0.6 ? "atencao" : "saudavel";
  const cor = nivel === "critico" ? "text-rose-700" : nivel === "atencao" ? "text-amber-700" : "text-emerald-700";
  const barCor = nivel === "critico" ? "bg-rose-500" : nivel === "atencao" ? "bg-amber-500" : "bg-emerald-500";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Landmark className="h-4 w-4 text-violet-600" /> Dívida de {nome} — Dívida Consolidada Líquida (DCL)</h3>
        <div className="flex items-center gap-2">
          <BaixarCsv nome={`divida-dcl-${nome}`} label="CSV" linhas={d.serie as unknown as Record<string, unknown>[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "DCL (R$)" }, { chave: "pct", rotulo: "DCL / RCL (%)" }]} />
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500">RGF {d.ano}</span>
        </div>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">A DCL é o endividamento líquido oficial do município. O limite legal é <b>120% da RCL</b> (Res. Senado 40/2001).</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
          <div className="text-[11px] text-slate-500">Dívida (DCL)</div>
          <div className="font-display text-2xl font-bold tabular-nums text-violet-700">{brlMi(d.dclValor)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="text-[11px] text-slate-500">DCL / RCL</div>
          <div className={`font-display text-2xl font-bold tabular-nums ${cor}`}>{pc(d.dclPct)}</div>
          <div className="text-[10px] text-slate-400">limite 120% · {nivel === "critico" ? "acima do limite" : nivel === "atencao" ? "atenção" : "saudável"}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="text-[11px] text-slate-500">Margem p/ novas operações</div>
          <div className="font-display text-2xl font-bold tabular-nums text-emerald-700">{brlMi(d.margem)}</div>
          <div className="text-[10px] text-slate-400">{pc(Math.max(0, folga))} da RCL até o limite</div>
        </div>
      </div>

      {/* barra vs limite */}
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[10px] text-slate-400"><span>0%</span><span>limite 120%</span></div>
        <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full ${barCor}`} style={{ width: `${Math.min(100, (d.dclPct / d.limite) * 100)}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="text-[11px] text-slate-500">
          <b className="text-slate-700">Posição em SC:</b> {d.posicao}º de {d.scTotal} municípios (do menos ao mais endividado) · mediana SC {pc(d.scMediana)}
        </div>
        {d.serie.length > 1 && <div className="w-40"><div className="text-[10px] text-slate-400">trajetória DCL/RCL {d.serie[0].ano}–{d.serie[d.serie.length - 1].ano}</div><Spark pts={d.serie.map((s) => s.pct)} /></div>}
      </div>

      <p className="mt-3 text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 font-semibold text-teal-700"><Info aria-hidden className="h-3 w-3" /> Dado oficial</span>Fonte: <b>RGF — Relatório de Gestão Fiscal (SICONFI/Tesouro Nacional)</b>, DCL {d.ano}. O detalhamento das operações de crédito por credor (SCR/CADIP do BCB) é fonte futura — a API pública do BCB está retornando vazio. Exibição neutra.</p>
    </section>
  );
}
