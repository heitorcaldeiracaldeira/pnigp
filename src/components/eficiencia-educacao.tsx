import type { EficienciaEducacaoSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

// Índice de Eficiência (Educação) — custo por aluno × IDEB vs pares. Quadrante + leitura/ação. Tom neutro.
const Q: Record<string, { t: string; cls: string; ler: (n: string) => string }> = {
  eficiente: { t: "✓ Eficiente (referência)", cls: "border-emerald-200 bg-emerald-50", ler: (n) => `${n} gasta menos que os pares por aluno e tem IDEB acima da mediana — boa relação custo×resultado. Manter o que funciona.` },
  alto_custo: { t: "Resultado bom, custo alto", cls: "border-sky-200 bg-sky-50", ler: (n) => `${n} entrega IDEB acima da mediana, mas gasta mais por aluno que os pares. Há margem para ganhar eficiência sem perder resultado.` },
  atencao: { t: "⚠️ Atenção: gasta mais, entrega menos", cls: "border-rose-200 bg-rose-50", ler: (n) => `${n} gasta acima da mediana por aluno e tem IDEB abaixo dela — sinal de baixa eficiência. Revisar onde o recurso está indo (e o registro).` },
  investir: { t: "Investir com foco", cls: "border-amber-200 bg-amber-50", ler: (n) => `${n} gasta abaixo da mediana e tem IDEB abaixo — pode precisar investir mais (e melhor) na aprendizagem.` },
};

export function EficienciaEducacao({ dados, nome }: { dados: EficienciaEducacaoSC; nome: string }) {
  if (!dados) return null;
  const q = Q[dados.quadrante];
  const maxC = Math.max(dados.custoAluno, dados.medianaCusto, 1);
  const maxI = Math.max(dados.ideb || 0, dados.medianaIdeb || 0, 1);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">📐 Índice de Eficiência — custo × resultado</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">gasto educação × IDEB</span>
      </div>
      <p className="text-sm text-slate-500">O quanto cada real investido em educação vira resultado, comparado a municípios do mesmo porte. Base {dados.ano} · {dados.nPares} pares.</p>

      <div className={`mt-3 rounded-xl border p-3 ${q.cls}`}>
        <div className="text-sm font-bold text-slate-800">{q.t}</div>
        <p className="mt-0.5 text-[13px] text-slate-700">{q.ler(nome)}</p>
        {dados.potencialEconomia > 1000 && <p className="mt-1 text-[13px] font-semibold text-rose-700">Potencial de economia (até o custo mediano): {fmtBRLCompact(dados.potencialEconomia)}/ano.</p>}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-[11px] text-slate-500">Custo por aluno/ano</div>
          <div className="text-xl font-bold tabular-nums text-slate-800">{fmtBRLCompact(dados.custoAluno)}</div>
          <div className="mt-1 h-2 w-full rounded bg-slate-100"><div className={`h-2 rounded ${dados.custoAluno > dados.medianaCusto ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${(dados.custoAluno / maxC) * 100}%` }} /></div>
          <div className="mt-0.5 text-[11px] text-slate-400">mediana dos pares: {fmtBRLCompact(dados.medianaCusto)} · {dados.matriculas.toLocaleString("pt-BR")} matrículas</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-[11px] text-slate-500">Resultado (IDEB médio)</div>
          <div className="text-xl font-bold tabular-nums text-slate-800">{dados.ideb != null ? dados.ideb.toFixed(1) : "—"}</div>
          {dados.medianaIdeb != null && <><div className="mt-1 h-2 w-full rounded bg-slate-100"><div className={`h-2 rounded ${(dados.ideb || 0) >= dados.medianaIdeb ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${((dados.ideb || 0) / maxI) * 100}%` }} /></div>
          <div className="mt-0.5 text-[11px] text-slate-400">mediana dos pares: {dados.medianaIdeb.toFixed(1)}</div></>}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Custo por aluno = despesa empenhada em Educação ÷ matrículas (Censo). Comparação por faixa populacional. Referência de eficiência, não meta — leia junto com o contexto local. Fontes: SICONFI + INEP.</p>
    </section>
  );
}
