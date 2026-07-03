// Carimbo de proveniência reusável — "fonte · competência · extraído em".
// Padroniza a rastreabilidade do dado (recomendação do documento de soluções: credibilidade de dado público é
// 50% frescor declarado). Server-safe (sem estado). Usar em cards que exibem número de fonte oficial.
import { Database } from "lucide-react";

export function Carimbo({ fonte, competencia, extraido, className = "" }: { fonte: string; competencia?: string; extraido?: string | null; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-slate-400 ${className}`}>
      <span className="inline-flex items-center gap-1 font-medium text-slate-500"><Database aria-hidden className="h-2.5 w-2.5" /> {fonte}</span>
      {competencia && <span>· {competencia}</span>}
      {extraido && <span>· extraído em {extraido.split("-").reverse().join("/")}</span>}
    </div>
  );
}

// Variante para abas MULTI-FONTE (ex.: saúde = SIOPS+FNS+CNES+Previne): lista as fontes sem uma data única
// (que seria enganosa). As datas específicas ficam nos sub-cards de cada fonte.
export function CarimboFontes({ fontes, className = "" }: { fontes: string[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-slate-400 ${className}`}>
      <span className="inline-flex items-center gap-1 font-medium text-slate-500"><Database aria-hidden className="h-2.5 w-2.5" /> Fontes oficiais</span>
      <span>· {fontes.join(" · ")}</span>
    </div>
  );
}
