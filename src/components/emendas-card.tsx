import type { EmendasSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

// Emendas parlamentares recebidas (SICONV/Transferegov — via convênio). Tom NEUTRO: só valores e autor, sem leitura
// político-partidária. Mostra quanto o município captou via emenda e quais parlamentares destinaram.
export function EmendasCard({ dados, nome }: { dados: EmendasSC; nome: string }) {
  if (!dados) return null;
  const mx = Math.max(1, ...dados.porParlamentar.map((p) => p.valor));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🏛️ Emendas parlamentares — recursos captados</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">SICONV/Transferegov</span>
      </div>
      <p className="text-sm text-slate-500">Recursos que {nome} captou via <b>emenda parlamentar</b> (convênios). Exibição neutra — valores e autores, sem viés.</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3"><div className="text-xl font-bold tabular-nums text-amber-700">{fmtBRLCompact(dados.total)}</div><div className="text-[11px] text-slate-600">total em emendas</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.n}</div><div className="text-[11px] text-slate-600">emendas</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.impositivas}</div><div className="text-[11px] text-slate-600">impositivas ({fmtBRLCompact(dados.valorImpositivo)})</div></div>
      </div>

      {/* Execução orçamentária federal (Portal) — recurso na mesa (empenhado e ainda não pago) */}
      {dados.execucao && dados.execucao.empenhado > 0 && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">💰 Execução das emendas — recurso na mesa</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div><div className="text-lg font-bold tabular-nums text-slate-800">{fmtBRLCompact(dados.execucao.empenhado)}</div><div className="text-[11px] text-slate-600">empenhado (reservado p/ {nome})</div></div>
            <div><div className="text-lg font-bold tabular-nums text-slate-800">{fmtBRLCompact(dados.execucao.pago)}</div><div className="text-[11px] text-slate-600">pago ({dados.execucao.empenhado > 0 ? Math.round((dados.execucao.pago / dados.execucao.empenhado) * 100) : 0}% executado)</div></div>
            <div className="col-span-2 rounded-lg border border-emerald-300 bg-white/70 p-2 sm:col-span-1"><div className="text-lg font-bold tabular-nums text-emerald-700">{fmtBRLCompact(dados.execucao.restoPagar)}</div><div className="text-[11px] text-slate-600"><b>na mesa</b> — empenhado e não pago</div></div>
          </div>
          {dados.execucao.restoPagar > 0 && <p className="mt-1.5 text-[11px] text-slate-600">→ Há recurso de emenda <b>já reservado e não sacado</b>. Cobrar a liberação/execução junto ao órgão e ao parlamentar autor é ação de captação imediata, sem novo projeto.</p>}
        </div>
      )}

      {dados.porParlamentar.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Por parlamentar (autor da emenda)</div>
          <div className="space-y-1.5">
            {dados.porParlamentar.map((p) => (
              <div key={p.parlamentar} className="flex items-center gap-2 text-xs">
                <span className="w-44 shrink-0 truncate text-slate-600" title={p.parlamentar}>{p.parlamentar}</span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-3 rounded bg-amber-400" style={{ width: `${(p.valor / mx) * 100}%` }} /></div>
                <span className="w-16 shrink-0 text-right tabular-nums text-slate-700">{fmtBRLCompact(p.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">Fontes: <b>indicação</b> via SICONV/Transferegov (quem destinou e quanto){dados.execucao ? <> · <b>execução</b> via Portal da Transparência (empenhado×pago — o "recurso na mesa")</> : <> · execução orçamentária (empenhado/pago) entra na próxima coleta</>}. Não inclui emenda Pix/transferência especial (módulo do Transferegov instável). Exibição neutra, sem avaliação político-partidária.</p>
    </section>
  );
}
