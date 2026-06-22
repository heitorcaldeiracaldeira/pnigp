import type { ContratosVencimentoSC, ContratoComItens } from "@/lib/queries";
import { fmtBRL, fmtBRLCompact, fmtData } from "@/lib/ui";

const dt = (s: string | Date | null | undefined) => fmtData(s);
function diasAte(s: string | null) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return null;
  const fim = Date.UTC(+m[1], +m[2] - 1, +m[3]); const hoje = new Date(); const h = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((fim - h) / 86400000);
}

// Índice de criticidade do vencimento — combina URGÊNCIA do prazo (70%) e MAGNITUDE do valor (30%).
// urgência = 1 − dias/365 (cresce ao encurtar o prazo); magnitude = valor/maiorValor (entre os a vencer).
// score = 100 × (0,7·urgência + 0,3·magnitude). Níveis por score: Crítico ≥75 · Alto ≥50 · Médio ≥30 · Baixo <30.
function criticidade(dias: number, valor: number, valorMax: number) {
  const urg = 1 - Math.min(dias, 365) / 365;
  const mag = valorMax > 0 ? valor / valorMax : 0;
  const score = Math.max(0, Math.min(100, Math.round((0.7 * urg + 0.3 * mag) * 100)));
  if (score >= 75 || dias <= 30) return { nivel: "Crítico", score, badge: "bg-rose-100 text-rose-700", bar: "bg-rose-500" };
  if (score >= 50) return { nivel: "Alto", score, badge: "bg-orange-100 text-orange-700", bar: "bg-orange-400" };
  if (score >= 30) return { nivel: "Médio", score, badge: "bg-amber-100 text-amber-700", bar: "bg-amber-400" };
  return { nivel: "Baixo", score, badge: "bg-teal-100 text-teal-700", bar: "bg-teal-400" };
}

export function ContratosGestao({ vencimento, itens }: { vencimento?: ContratosVencimentoSC | null; itens?: ContratoComItens[] | null }) {
  return (
    <>
      {/* Vigências / contratos a vencer */}
      {vencimento && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800">📅 Vigências — contratos a vencer</h3>
          <p className="mb-3 text-xs text-slate-500">Criticidade = 100 × (0,7·urgência do prazo + 0,3·magnitude do valor) — alto valor + prazo curto = mais crítico. Planeje renovação/nova licitação com antecedência (gestão de contratos — Pércio/Camarão).</p>
          {(() => {
            const aVencer = vencimento.aVencer;
            const vmax = Math.max(1, ...aVencer.map((c) => c.valor));
            const lista = [...aVencer].sort((a, b) => criticidade(b.dias, b.valor, vmax).score - criticidade(a.dias, a.valor, vmax).score);
            const NIVEIS = [
              { nivel: "Crítico", cls: "border-rose-200 bg-rose-50 text-rose-700" },
              { nivel: "Alto", cls: "border-orange-200 bg-orange-50 text-orange-700" },
              { nivel: "Médio", cls: "border-amber-200 bg-amber-50 text-amber-700" },
              { nivel: "Baixo", cls: "border-teal-200 bg-teal-50 text-teal-700" },
            ];
            const cont: Record<string, number> = { "Crítico": 0, "Alto": 0, "Médio": 0, "Baixo": 0 };
            const contV: Record<string, number> = { "Crítico": 0, "Alto": 0, "Médio": 0, "Baixo": 0 };
            lista.forEach((c) => { const nv = criticidade(c.dias, c.valor, vmax).nivel; cont[nv]++; contV[nv] += c.valor; });
            const aVencer90 = lista.filter((c) => c.dias <= 90).length;
            const kpis = [
              { v: (vencimento.totalAtivos + vencimento.vencidos).toLocaleString("pt-BR"), l: "contratos (total)", cor: "" },
              { v: vencimento.totalAtivos.toLocaleString("pt-BR"), l: "vigentes", cor: "text-emerald-600" },
              { v: aVencer90.toLocaleString("pt-BR"), l: "a vencer (≤90 dias)", cor: aVencer90 > 0 ? "text-amber-600" : "" },
              { v: vencimento.vencidos.toLocaleString("pt-BR"), l: "vencidos", cor: "" },
            ];
            return (<>
              {/* KPIs (espelham as atas) */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {kpis.map((k) => <div key={k.l} className="rounded-xl border border-slate-200 p-3"><div className={`text-xl font-bold tabular-nums ${k.cor || "text-slate-800"}`}>{k.v}</div><div className="text-[11px] text-slate-500">{k.l}</div></div>)}
              </div>
              {/* contadores por nível de criticidade (mesma metodologia das atas) */}
              <div className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Por nível de criticidade {vencimento.nCriticos > 0 && <span className="text-rose-700">· {vencimento.nCriticos} crítico(s) &lt; 30 dias</span>}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {NIVEIS.map((n) => (
                  <div key={n.nivel} className={`rounded-xl border p-3 ${n.cls}`}>
                    <div className="text-2xl font-bold tabular-nums">{cont[n.nivel]}</div>
                    <div className="text-[11px] font-medium">{n.nivel}</div>
                    <div className="mt-0.5 text-[11px] tabular-nums opacity-80">{fmtBRLCompact(contV[n.nivel])}</div>
                  </div>
                ))}
              </div>
              {lista.length > 0 && (<>
              <h4 className="mt-4 text-xs font-semibold text-slate-700">Contratos a vencer (ordenados por criticidade)</h4>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-500"><th className="p-2 font-medium">Objeto</th><th className="hidden p-2 font-medium md:table-cell">Fornecedor</th><th className="p-2 font-medium">Fim</th><th className="p-2 text-right font-medium">Faltam</th><th className="p-2 font-medium">Criticidade</th><th className="p-2 text-right font-medium">Valor</th></tr></thead>
                  <tbody>
                    {lista.map((c, i) => {
                      const k = criticidade(c.dias, c.valor, vmax);
                      return (
                      <tr key={i} className="border-b border-slate-100 align-top">
                        <td className="p-2 text-slate-700"><span className="line-clamp-2">{c.objeto}</span></td>
                        <td className="hidden p-2 text-slate-500 md:table-cell"><span className="line-clamp-1">{c.fornecedor}</span></td>
                        <td className="p-2 tabular-nums text-slate-700">{dt(c.vigFim)}</td>
                        <td className="p-2 text-right"><span className={`rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${k.badge}`}>{c.dias}d</span></td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${k.bar}`} style={{ width: `${k.score}%` }} /></div>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${k.badge}`}>{k.nivel} {k.score}</span>
                          </div>
                        </td>
                        <td className="p-2 text-right tabular-nums text-slate-700">{fmtBRLCompact(c.valor)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>)}
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] font-medium text-slate-500">Detalhe por faixa de prazo (mês)</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-5">
                  {vencimento.faixas.map((f) => (
                    <div key={f.id} className={`rounded-xl border p-3 ${f.id === "critico" && f.n > 0 ? "border-rose-300 bg-rose-50/60" : "border-slate-200"}`}>
                      <div className="flex items-end justify-between"><span className="text-2xl font-bold tabular-nums text-slate-800">{f.n}</span><span className="text-[10px] text-slate-400">{fmtBRLCompact(f.valor)}</span></div>
                      <div className="mt-1 text-[11px] text-slate-600">{f.label}</div>
                    </div>
                  ))}
                </div>
              </details>
            </>);
          })()}
        </section>
      )}

      {/* Itens dos maiores contratos (contrato → processo → itens) */}
      {itens && itens.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800">📦 Itens dos maiores contratos</h3>
          <p className="mb-3 text-xs text-slate-500">Cada linha mostra o <b>valor global do contrato</b> (à direita) e a <b>economia da licitação</b> que o originou (verde) — uma licitação pode gerar vários contratos, então a economia do processo costuma superar um contrato isolado. Os itens vêm do processo vinculado (PNCP): preço estimado → homologado, total, economia, situação e benefício LC 123 (ME/EPP). Clique para expandir.</p>
          <div className="space-y-2">
            {(() => { const vmaxI = Math.max(1, ...itens.map((c) => c.valor)); return itens.map((c, i) => {
              const dias = diasAte(c.vigFim); const k = dias != null && dias >= 0 ? criticidade(dias, c.valor, vmaxI) : null;
              const cons = c.itens.filter((it) => it.est != null && it.hom != null && it.est > 0 && it.hom <= it.est);
              const ecoProc = cons.reduce((s, it) => s + (it.est! - it.hom!) * it.quantidade, 0);
              const homProc = cons.reduce((s, it) => s + it.hom! * it.quantidade, 0);
              const ratio = homProc > 0 ? Math.min(1, c.valor / homProc) : 0;
              const ecoRateada = ecoProc * ratio; // economia atribuída a ESTE contrato (proporcional ao valor)
              return (
              <details key={i} className="rounded-xl border border-slate-200 p-3">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800"><span className="line-clamp-1 inline">{c.objeto}</span></span>
                  <span className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">{dt(c.vigInicio)} → {dt(c.vigFim)}</span>
                    {k && <span className={`rounded border px-1.5 py-0.5 font-semibold ${k.badge}`} title="Criticidade do vencimento (prazo + valor)">{k.nivel} {k.score}{dias != null && dias <= 90 ? ` · ${dias}d` : ""}</span>}
                    {ecoRateada > 0 && <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700" title={`Economia atribuída a este contrato (rateio da economia da licitação pela participação no valor homologado). Economia total da licitação: ${fmtBRLCompact(ecoProc)}.`}>economia ~{fmtBRLCompact(ecoRateada)}</span>}
                    <span className="font-semibold text-slate-700">{fmtBRLCompact(c.valor)}</span>
                  </span>
                </summary>
                <div className="mt-1 text-[11px] text-slate-400">{c.fornecedor}</div>
                {ecoProc > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
                    <span>Economia da licitação: <b className="text-emerald-700">{fmtBRL(ecoProc)}</b></span>
                    <span>Atribuída a este contrato (rateio {(ratio * 100).toFixed(0)}%): <b className="text-emerald-700">~{fmtBRL(ecoRateada)}</b></span>
                  </div>
                )}
                {c.itens.length > 0 ? (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-500"><th className="p-1.5 font-medium">Item</th><th className="p-1.5 text-right font-medium">Qtd</th><th className="p-1.5 text-right font-medium">Unit. estim.</th><th className="p-1.5 text-right font-medium">Unit. homol.</th><th className="p-1.5 text-right font-medium">Total (R$)</th><th className="p-1.5 text-right font-medium">Economia</th><th className="p-1.5 font-medium">Situação</th></tr></thead>
                      <tbody>
                        {c.itens.map((it, j) => {
                          const ok = it.est != null && it.hom != null && it.est > 0 && it.hom <= it.est;
                          const ecoPct = ok ? ((it.est! - it.hom!) / it.est!) * 100 : null;
                          const totalNom = it.hom != null ? it.hom * it.quantidade : null;
                          const ecoRs = ok ? (it.est! - it.hom!) * it.quantidade : null;
                          return (
                            <tr key={j} className="border-b border-slate-50 align-top">
                              <td className="p-1.5 text-slate-700"><span className="line-clamp-2">{it.descricao}</span>{it.lc123 && <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold text-emerald-700">LC 123 · {it.porte || "ME/EPP"}</span>}</td>
                              <td className="p-1.5 text-right tabular-nums text-slate-500">{it.quantidade.toLocaleString("pt-BR")}</td>
                              <td className="p-1.5 text-right tabular-nums text-slate-400">{it.est != null ? fmtBRL(it.est) : "—"}</td>
                              <td className="p-1.5 text-right tabular-nums text-slate-700">{it.hom != null ? fmtBRL(it.hom) : "—"}</td>
                              <td className="p-1.5 text-right tabular-nums font-semibold text-slate-800">{totalNom != null ? fmtBRLCompact(totalNom) : "—"}</td>
                              <td className="p-1.5 text-right tabular-nums">{ecoRs != null ? <span className="text-emerald-600">{fmtBRLCompact(ecoRs)} <span className="text-[10px] text-slate-400">({ecoPct!.toFixed(0)}%)</span></span> : "—"}</td>
                              <td className="p-1.5 text-[11px] text-slate-500">{it.situacao || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="mt-2 text-xs text-slate-400">Itens deste processo ainda não coletados (coleta em andamento).</div>}
              </details>
              );
            }); })()}
          </div>
        </section>
      )}
    </>
  );
}
