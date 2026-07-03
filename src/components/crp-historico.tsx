import { FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import type { CrpHistItem } from "@/lib/queries";

// Histórico completo da CRP do ente (todos os certificados) — o vigente em destaque + a série completa.
// Mesma base da Consulta Pública do CADPREV ao abrir um ente, agora dentro da plataforma.
export function CrpHistorico({ historico, nome }: { historico: CrpHistItem[]; nome: string }) {
  if (!historico.length) return null;
  const atual = historico[0];
  const venc = atual.vencido;
  return (
    <section id="crp-historico" className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><FileText className="h-4 w-4 text-teal-600" /> Certificados de Regularidade Previdenciária (CRP) — histórico completo</div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 tabular-nums">{historico.length} certificados</span>
          <a href="https://cadprev.previdencia.gov.br/Cadprev/pages/publico/crp/pesquisarEnteCrp.xhtml" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-teal-700 hover:underline">ver no CADPREV ↗</a>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-600">Todos os CRPs já emitidos para {nome} pela SPREV/Ministério da Previdência. O <b>primeiro é o vigente</b>; os demais formam o histórico de regularidade.</p>

      {/* CRP vigente em destaque */}
      <div className={`mt-3 rounded-xl border p-4 ${venc ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            {venc ? <ShieldAlert className="h-4 w-4 text-rose-600" /> : <ShieldCheck className="h-4 w-4 text-emerald-600" />} CRP vigente
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${venc ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
            {venc ? (atual.dias != null ? `Vencida há ${Math.abs(atual.dias)}d` : "Vencida") : atual.dias != null ? `Válida — vence em ${atual.dias}d` : "Válida"}
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div><div className="text-[11px] text-slate-500">Nº do CRP</div><div className="font-display text-base font-bold tabular-nums text-slate-900">{atual.nrCrp || "—"}</div></div>
          <div><div className="text-[11px] text-slate-500">Emissão</div><div className="font-display text-base font-bold tabular-nums text-slate-900">{atual.emissao ?? "—"}</div></div>
          <div><div className="text-[11px] text-slate-500">Validade</div><div className={`font-display text-base font-bold tabular-nums ${venc ? "text-rose-700" : "text-slate-900"}`}>{atual.validade ?? "—"}</div></div>
          <div><div className="text-[11px] text-slate-500">Base de emissão</div><div className="font-display text-base font-bold text-slate-900">{atual.situacao || "—"}</div></div>
        </div>
      </div>

      {/* histórico completo */}
      <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
            <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">
              <th>Nº do CRP</th>
              <th>Emissão</th>
              <th>Validade</th>
              <th>Tipo</th>
              <th>Base de emissão</th>
            </tr>
          </thead>
          <tbody>
            {historico.map((c, i) => (
              <tr key={`${c.nrCrp}-${i}`} className={`border-t border-slate-100 ${i === 0 ? "bg-teal-50/40" : ""}`}>
                <td className="px-4 py-2.5 font-medium tabular-nums text-slate-800">
                  {c.nrCrp || "—"}{i === 0 && <span className="ml-1.5 rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">vigente</span>}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-600">{c.emissao ?? "—"}</td>
                <td className="px-4 py-2.5 tabular-nums text-slate-600">{c.validade ?? "—"}</td>
                <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${/venc/i.test(c.tipo) ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>{c.tipo || "—"}</span></td>
                <td className="px-4 py-2.5 text-slate-600">{c.situacao || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Fonte: CADPREV/SPREV — Ministério da Previdência Social (Consulta Pública, coletada via API e casada por ente). <b>Tipo</b> = situação do certificado na fonte (válido/vencido na emissão). <b>Base</b> = administrativa ou judicial (sub judice). O status do vigente é recalculado pela data de validade real.</p>
    </section>
  );
}
