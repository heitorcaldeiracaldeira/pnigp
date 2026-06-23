import type { AnaliseComprasItens } from "@/lib/queries";
import { fmtBRL, fmtBRLCompact } from "@/lib/ui";

// Análise de compras por ITEM (descritivo, sem CATMAT): onde o município paga acima dos pares de SC (economia potencial)
// e o que mais compra. Tom neutro/didático. Compara só itens equivalentes (descrição normalizada + mesma unidade).
export function AnaliseComprasItens({ dados, nome }: { dados: AnaliseComprasItens; nome: string }) {
  if (!dados) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🔎 Análise de itens — preço comparado aos pares de SC</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">PNCP · item a item</span>
      </div>
      <p className="text-sm text-slate-500">Mesmo item (descrição equivalente + mesma unidade) comprado por {nome} × a <b>mediana dos municípios de SC</b>. <b>Dois grupos:</b> 🟢 <b>compras efetivadas</b> (contrato — gasto certo) e 🟡 <b>registro de preço/atas</b> (teto registrado — compra eventual). O sobrepreço abaixo usa só as <b>efetivadas</b> (gasto real).</p>

      {/* Economia potencial (o destaque) */}
      {dados.sobrepreco.length > 0 && (
        <>
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <div className="text-[11px] uppercase tracking-wide text-amber-700">Economia potencial estimada</div>
            <div className="text-2xl font-bold tabular-nums text-amber-700">{fmtBRLCompact(dados.economiaTotal)}</div>
            <div className="text-[11px] text-slate-600">se os itens abaixo fossem comprados ao preço mediano dos pares de SC ({dados.sobrepreco.length} itens acima do 3º quartil).</div>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[640px] text-xs">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="p-2 font-medium">Item (unidade)</th><th className="p-2 text-right font-medium">Qtd</th>
                <th className="p-2 text-right font-medium">Preço pago</th><th className="p-2 text-right font-medium">Mediana SC</th>
                <th className="p-2 text-right font-medium">Acima</th><th className="p-2 text-right font-medium">Economia poss.</th></tr></thead>
              <tbody>
                {dados.sobrepreco.map((s, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0 align-top">
                    <td className="p-2 text-slate-700">{s.item.slice(0, 44).toLowerCase()} <span className="text-slate-400">({s.unidade})</span></td>
                    <td className="p-2 text-right tabular-nums text-slate-500">{s.qtd.toLocaleString("pt-BR")}</td>
                    <td className="p-2 text-right tabular-nums text-slate-800">{fmtBRL(s.precoMun)}</td>
                    <td className="p-2 text-right tabular-nums text-slate-500">{fmtBRL(s.mediana)} <span className="text-[10px] text-slate-400">({s.nMuns})</span></td>
                    <td className="p-2 text-right tabular-nums font-semibold text-rose-600">+{s.acimaPct}%</td>
                    <td className="p-2 text-right tabular-nums font-semibold text-emerald-700">{fmtBRLCompact(s.economia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Mais comprados */}
      {dados.maisComprados.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">O que {nome} mais compra (por valor)</div>
          <div className="space-y-1">
            {(() => { const mx = Math.max(1, ...dados.maisComprados.map((m) => m.valor)); return dados.maisComprados.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-56 shrink-0 truncate text-slate-600" title={m.item}>{m.item.slice(0, 44).toLowerCase()}</span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-3 rounded bg-teal-500" style={{ width: `${(m.valor / mx) * 100}%` }} /></div>
                <span className="w-16 shrink-0 text-right tabular-nums text-slate-700">{fmtBRLCompact(m.valor)}</span>
              </div>
            )); })()}
          </div>
        </div>
      )}

      {/* Grupo 2 — Registro de preço (atas) + comparação entre os grupos */}
      {dados.atas && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">🟡 Registro de preço (atas) — compra eventual</div>
          <p className="mt-0.5 text-[12px] text-slate-600"><b>{dados.atas.nItens.toLocaleString("pt-BR")}</b> itens com preço registrado em ata · {fmtBRLCompact(dados.atas.valorRegistrado)} de teto registrado. <span className="text-slate-500">Não é gasto efetivado — é o preço que o município pode usar na vigência da ata.</span></p>
        </div>
      )}

      {dados.comparacao.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Comparação: teto da ata × preço efetivado (mesmo item)</div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[560px] text-xs">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="p-2 font-medium">Item (unidade)</th><th className="p-2 text-right font-medium">Preço em ata</th><th className="p-2 text-right font-medium">Preço efetivado</th><th className="p-2 text-right font-medium">Diferença</th></tr></thead>
              <tbody>
                {dados.comparacao.map((c, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="p-2 text-slate-700">{c.item.slice(0, 40).toLowerCase()} <span className="text-slate-400">({c.unidade})</span></td>
                    <td className="p-2 text-right tabular-nums text-amber-700">{fmtBRL(c.precoAta)}</td>
                    <td className="p-2 text-right tabular-nums text-emerald-700">{fmtBRL(c.precoEf)}</td>
                    <td className={`p-2 text-right tabular-nums font-semibold ${c.diffPct > 0 ? "text-rose-600" : "text-emerald-600"}`}>{c.diffPct > 0 ? "+" : ""}{c.diffPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Efetivado <b>abaixo</b> do teto da ata (verde) = comprou bem; <b>acima</b> (vermelho) = pagou mais do que o próprio preço registrado — ponto de atenção.</p>
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-400">Metodologia: itens agrupados pela <b>descrição normalizada + unidade</b> (PNCP não traz CATMAT). Compara só itens equivalentes presentes em ≥5 municípios de SC. "Acima" = preço médio do município vs mediana dos pares; economia possível = (preço − mediana) × quantidade. É estimativa indicativa — confirmar especificação do item antes de concluir sobrepreço.</p>
    </section>
  );
}
