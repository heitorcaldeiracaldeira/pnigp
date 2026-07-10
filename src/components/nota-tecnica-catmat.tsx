"use client";

// Nota Técnica pública e versionada do Banco de Preços / classificação CATMAT-CATSER — torna auditável a cadeia
// dado (PNCP) → taxonomia (CATMAT/CATSER) → técnica (linha do controle interno da União, "Alice"). Mesmo padrão
// da NotaTecnicaIndice: publicar a metodologia é o que transforma o preço de referência em ativo defensável.
import { BookOpen } from "lucide-react";
import { NOTA_CATMAT } from "@/lib/metodologia-catmat";

export function NotaTecnicaCatmat({ compacto = false }: { compacto?: boolean }) {
  const n = NOTA_CATMAT;
  return (
    <details className={`rounded-xl border border-slate-200 bg-slate-50/60 ${compacto ? "" : "mt-3"}`}>
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-slate-700">
        <BookOpen aria-hidden className="h-3.5 w-3.5 text-teal-600" /> Metodologia do Banco de Preços — Nota Técnica v{n.versao}
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
