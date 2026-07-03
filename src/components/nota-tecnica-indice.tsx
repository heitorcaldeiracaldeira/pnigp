"use client";

// Nota Técnica pública e versionada do Índice de Gestão Fiscal — torna a metodologia auditável (recomendação do
// documento de soluções: publicar dimensões/pesos/normalização transforma o índice de passivo em ativo).
import { BookOpen } from "lucide-react";
import { NOTA_INDICE } from "@/lib/metodologia-indice";

export function NotaTecnicaIndice({ compacto = false }: { compacto?: boolean }) {
  const n = NOTA_INDICE;
  return (
    <details className={`rounded-xl border border-slate-200 bg-slate-50/60 ${compacto ? "" : "mt-2"}`}>
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-slate-700">
        <BookOpen aria-hidden className="h-3.5 w-3.5 text-indigo-600" /> Metodologia do índice — Nota Técnica v{n.versao}
        <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">atualizada {n.atualizada.split("-").reverse().join("/")}</span>
      </summary>
      <div className="space-y-3 px-4 pb-4 pt-1 text-[12px] leading-relaxed text-slate-600">
        <p className="text-slate-700">{n.resumo}</p>
        {n.secoes.map((s, i) => (
          <div key={i}>
            <div className="text-[12px] font-semibold text-slate-800">{s.titulo}</div>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
              {s.itens.map((it, j) => <li key={j}>{it}</li>)}
            </ul>
          </div>
        ))}
        <p className="border-t border-slate-200 pt-2 text-[11px] text-slate-400">{n.nota}</p>
      </div>
    </details>
  );
}
