import { BookOpen, Database, GraduationCap, TrendingUp } from "lucide-react";
import type { EducacaoSC } from "@/lib/queries";

const n1 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
function cmp(v: number, m: number) {
  if (m <= 0) return { txt: "—", cls: "text-slate-400" };
  if (v >= m * 1.05) return { txt: "▲ acima dos pares", cls: "text-emerald-600" };
  if (v <= m * 0.95) return { txt: "▼ abaixo dos pares", cls: "text-amber-600" };
  return { txt: "≈ na média dos pares", cls: "text-slate-500" };
}

export function EducacaoSC({ data }: { data: NonNullable<EducacaoSC> }) {
  const d = data;
  const mdeOk = d.educPct == null ? null : d.educPct >= 25;
  const fundebOk = d.fundebPct == null ? null : d.fundebPct >= 70;
  const cAlfab = d.alfab == null ? null : cmp(d.alfab, d.alfabPares);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-700"><GraduationCap className="h-4 w-4" /> Educação — gasto × resultado ({n1(d.pop)} hab · grupo {d.grupo})</div>
        <p className="mt-1 text-sm text-slate-600">Cruza o <b>esforço de gasto</b> (mínimo constitucional MDE + FUNDEB) com o <b>resultado</b> (taxa de alfabetização), comparado aos municípios de porte semelhante.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`rounded-xl border p-4 ${mdeOk === false ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><BookOpen className="h-3.5 w-3.5" /> Aplicação em Educação (MDE)</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{d.educPct == null ? "—" : `${n1(d.educPct)}%`}</div>
          <div className="text-[11px] text-slate-500">mínimo CF 25%{d.ano ? ` · ${d.ano}` : ""} {mdeOk === false ? "· ⚠ abaixo" : mdeOk ? "· ✓" : ""}</div>
        </div>
        <div className={`rounded-xl border p-4 ${fundebOk === false ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><BookOpen className="h-3.5 w-3.5" /> FUNDEB em remuneração</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{d.fundebPct == null ? "—" : `${n1(d.fundebPct)}%`}</div>
          <div className="text-[11px] text-slate-500">mínimo 70% {fundebOk === false ? "· ⚠ abaixo" : fundebOk ? "· ✓" : ""}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><GraduationCap className="h-3.5 w-3.5" /> Taxa de alfabetização</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{d.alfab == null ? "—" : `${n1(d.alfab)}%`}</div>
          <div className={`text-[11px] ${cAlfab?.cls ?? "text-slate-400"}`}>{cAlfab ? `pares ${n1(d.alfabPares)} · ${cAlfab.txt}` : "sem dado"}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><TrendingUp className="h-3.5 w-3.5" /> PIB per capita (contexto)</div>
          <div className="font-display text-xl font-bold tabular-nums text-slate-900">{d.pib == null ? "—" : `R$ ${d.pib.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}</div>
          <div className="text-[11px] text-slate-500">fator socioeconômico do resultado</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p className="mb-1 font-semibold text-slate-800">Leitura (insumo × resultado)</p>
        <p>
          Aplicou <b>{d.educPct == null ? "—" : `${n1(d.educPct)}%`}</b> em educação (mín. 25%){d.alfab != null ? <> e tem <b>{n1(d.alfab)}%</b> de alfabetização ({cAlfab?.txt.replace("▲ ", "").replace("▼ ", "")})</> : null}.
          {mdeOk === false ? " Atenção: abaixo do mínimo constitucional — risco de contas." : ""}
          {cAlfab?.txt.startsWith("▼") ? " Resultado abaixo dos pares apesar do gasto — investigar eficiência da rede de ensino." : ""}
        </p>
      </div>

      <p className="text-[11px] text-slate-400">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Gasto MDE/FUNDEB: RREO Anexo 14 (SICONFI). Alfabetização e PIB: IBGE. Benchmarks por grupo de porte. Gasto é insumo; alfabetização é resultado multifatorial (não atribuível só ao município).
      </p>
    </div>
  );
}
