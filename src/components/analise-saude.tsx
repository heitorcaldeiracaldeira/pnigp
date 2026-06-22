import type { PrevineSC, FnsSC, SaudeSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

// Análise #80 (saúde) — cruza GARGALO (indicadores de APS abaixo dos pares / mínimo de 15%) com RECURSO (FNS) e AÇÃO.
// Gancho central: o Previne Brasil paga POR DESEMPENHO → melhorar o indicador aumenta o repasse federal.
// Tom neutro/didático. Base: Previne Brasil + FNS + SIOPS/SICONFI.
export function AnaliseSaude({ previne, fns, saude, nome }: { previne: PrevineSC; fns: FnsSC; saude: SaudeSC; nome: string }) {
  const inds = previne?.indicadores ?? [];
  const abaixo = inds.filter((i) => i.pct < i.paresPct).sort((a, b) => (a.pct - a.paresPct) - (b.pct - b.paresPct));
  const acima = inds.filter((i) => i.pct >= i.paresPct);
  const temFns = fns && fns.total > 0;
  const saudePct = saude?.saudePct ?? null;
  const abaixoMin = saudePct != null && saudePct < 15;
  if (!inds.length && !temFns && saudePct == null) return null;

  return (
    <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🎯 Diagnóstico de Saúde — gargalo, recurso e ação</h3>
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">APS × FNS</span>
      </div>
      <p className="text-sm text-slate-500">Cruza os indicadores de atenção primária de {nome} com os recursos federais da saúde. <b>O Previne Brasil paga por desempenho</b> — então o gargalo aqui é, literalmente, dinheiro na mesa.</p>

      {/* mínimo constitucional */}
      {saudePct != null && (
        <div className={`mt-3 rounded-xl border p-3 text-[13px] ${abaixoMin ? "border-rose-300 bg-rose-50" : "border-emerald-200 bg-emerald-50/50"}`}>
          {abaixoMin
            ? <><b className="text-rose-700">⚠️ Aplicação em saúde: {saudePct.toFixed(1)}%</b> — abaixo do mínimo constitucional de 15% (risco de rejeição de contas). Ação: ajustar a aplicação até o fechamento.</>
            : <><b className="text-emerald-700">✓ Aplicação em saúde: {saudePct.toFixed(1)}%</b> — acima do mínimo de 15%.</>}
        </div>
      )}

      {/* indicadores APS abaixo dos pares */}
      {inds.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Indicadores de APS (Previne) vs pares de mesmo porte</div>
          {abaixo.length === 0 ? (
            <p className="text-[13px] text-emerald-700">✅ Todos os indicadores de APS estão iguais ou acima da média dos pares.</p>
          ) : (
            <div className="space-y-1.5">
              {abaixo.slice(0, 6).map((i) => (
                <div key={i.nome} className="flex items-center gap-2 text-xs">
                  <span className="w-56 shrink-0 truncate text-slate-600" title={i.nome}>{i.nome}</span>
                  <div className="relative h-3 flex-1 overflow-hidden rounded bg-slate-100">
                    <div className="absolute h-3 w-0.5 bg-slate-400" style={{ left: `${Math.min(100, i.paresPct)}%` }} title={`pares: ${i.paresPct.toFixed(0)}%`} />
                    <div className="h-3 rounded bg-rose-400" style={{ width: `${Math.min(100, i.pct)}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums text-rose-700">{i.pct.toFixed(0)}% <span className="text-slate-400">/ {i.paresPct.toFixed(0)}%</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* leitura + ação */}
      <div className="mt-4 space-y-2 text-[13px] text-slate-700">
        {abaixo.length > 0 && (
          <p>⚠️ <b>Gargalo (= recurso na mesa):</b> {abaixo.length} indicador(es) de APS abaixo dos pares. Como o Previne é pago por desempenho, elevá-los ao nível dos pares <b>aumenta o repasse do FNS</b>. Priorize: {abaixo.slice(0, 3).map((i) => i.nome.replace(/^Percentual de |^Proporção de /i, "").toLowerCase()).join(", ")}.</p>
        )}
        {temFns ? (
          <p>💰 <b>Recurso recebido:</b> {nome} recebeu <b>{fmtBRLCompact(fns!.total)}</b> do FNS em {fns!.ano} (custeio {fmtBRLCompact(fns!.custeio)} · investimento {fmtBRLCompact(fns!.investimento)}). Parte é variável e responde à melhoria dos indicadores acima.</p>
        ) : (
          <p className="text-slate-400">💰 Repasses do FNS em consolidação para este ente.</p>
        )}
        <p>🎯 <b>O que pleitear:</b> habilitação de novas equipes (eSF/eAP) e custeio de saúde bucal/NASF junto ao Ministério da Saúde (Transferegov fundo a fundo) — amplia a base de financiamento da APS.</p>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Fontes: Previne Brasil (APS), FNS (repasses), SIOPS/SICONFI (mínimo de 15%). Exibição neutra.</p>
    </section>
  );
}
