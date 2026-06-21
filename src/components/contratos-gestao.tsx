import type { ContratosVencimentoSC, ContratoComItens } from "@/lib/queries";
import { fmtBRL, fmtBRLCompact, fmtData } from "@/lib/ui";

const dt = (s: string | Date | null | undefined) => fmtData(s);
const CORF: Record<string, string> = { critico: "bg-rose-500", m1_2: "bg-orange-400", m2_3: "bg-amber-400", m3_6: "bg-yellow-400", m6_12: "bg-teal-400" };

// Índice de criticidade do vencimento — cresce conforme o prazo diminui (0 dias = 100).
// score = 100 × (1 − dias/365); níveis: Crítico ≤30d · Alto ≤90d · Médio ≤180d · Baixo ≤365d.
function criticidade(dias: number) {
  const score = Math.max(0, Math.min(100, Math.round((1 - Math.min(dias, 365) / 365) * 100)));
  if (dias <= 30) return { nivel: "Crítico", score, badge: "bg-rose-100 text-rose-700", bar: "bg-rose-500" };
  if (dias <= 90) return { nivel: "Alto", score, badge: "bg-orange-100 text-orange-700", bar: "bg-orange-400" };
  if (dias <= 180) return { nivel: "Médio", score, badge: "bg-amber-100 text-amber-700", bar: "bg-amber-400" };
  return { nivel: "Baixo", score, badge: "bg-teal-100 text-teal-700", bar: "bg-teal-400" };
}

export function ContratosGestao({ vencimento, itens }: { vencimento?: ContratosVencimentoSC; itens?: ContratoComItens[] }) {
  const maxF = vencimento ? Math.max(1, ...vencimento.faixas.map((f) => f.n)) : 1;
  return (
    <>
      {/* Vigências / contratos a vencer */}
      {vencimento && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800">📅 Vigências — contratos a vencer</h3>
          <p className="mb-3 text-xs text-slate-500">{vencimento.totalAtivos} contratos ativos{vencimento.vencidos > 0 ? ` · ${vencimento.vencidos} já vencidos` : ""}. Planeje a renovação/nova licitação com antecedência (gestão de contratos — Pércio/Camarão).</p>
          <div className="grid gap-2 sm:grid-cols-5">
            {vencimento.faixas.map((f) => (
              <div key={f.id} className={`rounded-xl border p-3 ${f.id === "critico" && f.n > 0 ? "border-rose-300 bg-rose-50/60" : "border-slate-200"}`}>
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-bold tabular-nums text-slate-800">{f.n}</span>
                  <span className="text-[10px] text-slate-400">{fmtBRLCompact(f.valor)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${CORF[f.id]}`} style={{ width: `${(f.n / maxF) * 100}%` }} /></div>
                <div className="mt-1 text-[11px] text-slate-600">{f.label}</div>
              </div>
            ))}
          </div>

          {vencimento.aVencer.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-slate-700">⏳ Contratos a vencer (próximos 12 meses) — por criticidade {vencimento.nCriticos > 0 && <span className="text-rose-700">· {vencimento.nCriticos} crítico(s) &lt; 30 dias</span>}</h4>
              <p className="mb-2 text-[11px] text-slate-400">Criticidade = 100 × (1 − dias/365), cresce conforme o prazo encurta. Níveis: <b className="text-rose-700">Crítico</b> ≤30d · <b className="text-orange-700">Alto</b> ≤90d · <b className="text-amber-700">Médio</b> ≤180d · <b className="text-teal-700">Baixo</b> ≤365d.</p>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-500"><th className="p-2 font-medium">Objeto</th><th className="hidden p-2 font-medium md:table-cell">Fornecedor</th><th className="p-2 font-medium">Fim</th><th className="p-2 text-right font-medium">Faltam</th><th className="p-2 font-medium">Criticidade</th><th className="p-2 text-right font-medium">Valor</th></tr></thead>
                  <tbody>
                    {vencimento.aVencer.map((c, i) => {
                      const k = criticidade(c.dias);
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
            </div>
          )}
        </section>
      )}

      {/* Itens dos maiores contratos (contrato → processo → itens) */}
      {itens && itens.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800">📦 Itens dos maiores contratos</h3>
          <p className="mb-3 text-xs text-slate-500">Cada linha mostra o <b>valor global do contrato</b> (à direita) e a <b>economia da licitação</b> que o originou (verde) — uma licitação pode gerar vários contratos, então a economia do processo costuma superar um contrato isolado. Os itens vêm do processo vinculado (PNCP): preço estimado → homologado, total, economia, situação e benefício LC 123 (ME/EPP). Clique para expandir.</p>
          <div className="space-y-2">
            {itens.map((c, i) => {
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
            })}
          </div>
        </section>
      )}
    </>
  );
}
