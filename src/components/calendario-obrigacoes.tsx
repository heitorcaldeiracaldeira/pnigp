"use client";

// Calendário de obrigações — a camada PROATIVA das notificações: avisa ANTES dos prazos legais recorrentes
// (RREO/RGF/MSC/DCA) e dos vencimentos do próprio município (CRP, contratos). "faltam N dias" prioriza a agenda.
import { CalendarClock, FileText, ShieldAlert, FileSignature } from "lucide-react";
import { fmtData } from "@/lib/ui";

// prazos legais recorrentes (mês 1-12, dia). Aproximados — confirmar no calendário do TCE-SC.
const RECORRENTES = [
  { nome: "DCA — Declaração de Contas Anuais", cad: "anual", datas: [[4, 30]], icone: FileText },
  { nome: "RGF — Relatório de Gestão Fiscal", cad: "quadrimestral", datas: [[1, 30], [5, 30], [9, 30]], icone: FileText },
  { nome: "RREO — Relatório Resumido de Execução Orçamentária", cad: "bimestral", datas: [[1, 30], [3, 30], [5, 30], [7, 30], [9, 30], [11, 30]], icone: FileText },
  { nome: "MSC — Matriz de Saldos Contábeis", cad: "mensal", datas: Array.from({ length: 12 }, (_, i) => [i + 1, 28]), icone: FileText },
];

function proxima(datas: number[][], hoje: Date): Date {
  const y = hoje.getFullYear();
  const cand = datas.flatMap(([m, d]) => [new Date(y, m - 1, d), new Date(y + 1, m - 1, d)]).filter((dt) => dt >= hoje).sort((a, b) => +a - +b);
  return cand[0];
}
const dias = (dt: Date, hoje: Date) => Math.ceil((+dt - +hoje) / 86400000);
const fmt = (dt: Date) => dt.toLocaleDateString("pt-BR");
const cor = (d: number) => (d <= 15 ? "text-rose-700 bg-rose-50 border-rose-200" : d <= 45 ? "text-amber-700 bg-amber-50 border-amber-200" : "text-slate-600 bg-slate-50 border-slate-200");

export function CalendarioObrigacoes({ hoje, crpValidade, contratos }: { hoje: string; crpValidade?: string | null; contratos?: { objeto: string; vigFim: string; dias: number }[] }) {
  const ref = new Date(hoje + "T00:00:00");

  const itens: { nome: string; cad: string; venc: Date; d: number; icone: typeof FileText }[] = RECORRENTES.map((o) => {
    const venc = proxima(o.datas, ref);
    return { nome: o.nome, cad: o.cad, venc, d: dias(venc, ref), icone: o.icone };
  });
  // CRP do município
  if (crpValidade && /^\d{2}\/\d{2}\/\d{4}$/.test(crpValidade)) {
    const [dd, mm, yy] = crpValidade.split("/").map(Number);
    const venc = new Date(yy, mm - 1, dd);
    itens.push({ nome: "CRP — Certificado de Regularidade Previdenciária", cad: "validade do ente", venc, d: dias(venc, ref), icone: ShieldAlert });
  }
  itens.sort((a, b) => a.d - b.d);

  const contr = (contratos || []).filter((c) => c.dias <= 120).sort((a, b) => a.dias - b.dias).slice(0, 6);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><CalendarClock className="h-4 w-4 text-teal-600" /> Calendário de obrigações — o que vence primeiro</h3>
      <p className="mt-1 text-[11px] text-slate-500">A agenda proativa: avisa <b>antes</b> dos prazos legais e dos vencimentos do município. Prazos recorrentes aproximados — confirmar no calendário do TCE-SC.</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {itens.map((o, i) => (
          <div key={i} className={`flex items-center justify-between rounded-xl border p-3 ${cor(o.d)}`}>
            <div className="flex items-start gap-2">
              <o.icone className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
              <div>
                <div className="text-[12px] font-semibold leading-tight">{o.nome}</div>
                <div className="text-[10px] opacity-70">{o.cad} · próx. {fmt(o.venc)}</div>
              </div>
            </div>
            <div className="shrink-0 text-right"><div className="font-display text-lg font-bold tabular-nums">{o.d}</div><div className="text-[9px] opacity-70">dias</div></div>
          </div>
        ))}
      </div>

      {contr.length > 0 && (
        <>
          <h4 className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-slate-700"><FileSignature className="h-3.5 w-3.5 text-orange-600" /> Contratos a vencer (próximos 120 dias)</h4>
          <div className="mt-2 space-y-1.5">
            {contr.map((c, i) => (
              <div key={i} className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-[11px] ${cor(c.dias)}`}>
                <span className="line-clamp-1 pr-2">{c.objeto}</span>
                <span className="shrink-0 font-semibold tabular-nums">{c.dias} dias · {c.vigFim ? fmtData(c.vigFim) : ""}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">Planeje a renovação ou a nova licitação com antecedência — evita contratação emergencial (apontamento do TCE).</p>
        </>
      )}
    </section>
  );
}
