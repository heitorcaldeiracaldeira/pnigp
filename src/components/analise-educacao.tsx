import type { IdebSC, FndeEducacaoSC, CensoMatriculaSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

// Análise #80 — cruza o GARGALO (IDEB abaixo da meta) com o RECURSO (FNDE recebido) e sugere a AÇÃO/pleito.
// Tom neutro e didático; sem crítica à gestão. Base: INEP/IDEB + FNDE/SIMAD + Censo.
export function AnaliseEducacao({ ideb, fnde, censo, nome }: { ideb: IdebSC; fnde: FndeEducacaoSC; censo: CensoMatriculaSC; nome: string }) {
  if (!ideb) return null;
  const comMeta = ideb.etapas.filter((e) => e.atual && e.atual.meta != null);
  if (!comMeta.length) return null;
  const abaixo = comMeta.filter((e) => e.atual!.ideb < (e.atual!.meta as number));
  const acima = comMeta.filter((e) => e.atual!.ideb >= (e.atual!.meta as number));
  const temFnde = fnde && fnde.total > 0;

  // sugestão de pleito/aplicação por etapa em gargalo (programas FNDE/PAR pertinentes)
  const acaoEtapa = (et: string) =>
    et === "AI" ? "alfabetização e formação de professores (PAR-TD / PDDE Qualidade)"
      : et === "AF" ? "reforço de aprendizagem e tempo integral (Fomento à Escola em Tempo Integral / PAR-TD)"
        : "permanência e itinerários do Novo Ensino Médio (rede estadual — articular com a SED/SC)";

  return (
    <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🎯 Diagnóstico de Educação — gargalo, recurso e ação</h3>
        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">IDEB × FNDE</span>
      </div>
      <p className="text-sm text-slate-500">Cruza o resultado educacional ({nome}) com os recursos federais recebidos, apontando onde priorizar e o que pleitear. Exibição neutra; metodologia oficial (INEP/FNDE).</p>

      {/* situação por etapa */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {comMeta.map((e) => {
          const a = e.atual!; const ok = a.ideb >= (a.meta as number);
          return (
            <div key={e.etapa} className={`rounded-xl border p-3 ${ok ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}>
              <div className="text-[11px] text-slate-500">{e.label}</div>
              <div className="flex items-baseline gap-1"><span className={`text-xl font-bold tabular-nums ${ok ? "text-emerald-700" : "text-amber-700"}`}>{a.ideb.toFixed(1)}</span><span className="text-[11px] text-slate-400">/ meta {(a.meta as number).toFixed(1)}</span></div>
              <div className={`text-[11px] font-medium ${ok ? "text-emerald-600" : "text-amber-600"}`}>{ok ? "✓ cumpriu a meta" : "abaixo da meta"} ({a.ano})</div>
            </div>
          );
        })}
      </div>

      {/* leitura + ação */}
      <div className="mt-4 space-y-2 text-[13px] text-slate-700">
        {abaixo.length === 0 ? (
          <p>✅ <b>Todas as etapas com meta cumpriram o IDEB.</b> Recomendação: manter os programas que sustentam o resultado e usar a margem para ampliar tempo integral e creche.</p>
        ) : (
          <>
            <p>⚠️ <b>Gargalo:</b> {abaixo.map((e) => e.label).join(", ")} {abaixo.length > 1 ? "estão" : "está"} abaixo da meta do IDEB. É onde o recurso rende mais resultado.</p>
            {abaixo.map((e) => (
              <p key={e.etapa}>→ <b>{e.label}:</b> priorizar {acaoEtapa(e.etapa)}.</p>
            ))}
          </>
        )}
        {temFnde ? (
          <p>💰 <b>Recurso disponível:</b> {nome} recebeu <b>{fmtBRLCompact(fnde!.total)}</b> do FNDE (histórico){fnde!.anoUlt ? `, ${fmtBRLCompact(fnde!.totalUlt)} em ${fnde!.anoUlt}` : ""} — base para sustentar/ampliar as ações acima (PNAE, PNATE, FUNDEB).</p>
        ) : (
          <p className="text-slate-400">💰 Recursos do FNDE em coleta — entram aqui assim que disponíveis para dimensionar o investimento.</p>
        )}
        {abaixo.length > 0 && (
          <p>🎯 <b>O que pleitear:</b> via Transferegov/PAR, buscar programas do FNDE voltados a {abaixo.map((e) => e.label.split(" (")[0]).join(" e ")} — o casamento do gargalo com o programa certo aumenta a chance de aprovação.</p>
        )}
      </div>

      {censo && censo.total > 0 && <p className="mt-3 text-[11px] text-slate-400">Rede atendida: {censo.total.toLocaleString("pt-BR")} matrículas (Censo {censo.ano}). Fontes: INEP (IDEB/Censo) + FNDE/SIMAD.</p>}
    </section>
  );
}
