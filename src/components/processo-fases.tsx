"use client";

// CONTADOR POR FASE do processo licitatório. Lê /api/processo-fases/[codigo] (tabela processo_fase_sc).
// As fases são as que o PNCP PUBLICA — a Lei 14.133 (art. 17) tem 7, mas "adjudicado" e "em fase de lances"
// acontecem na plataforma e não são publicados. Não inventamos fase que não existe.
// "Em análise" é rótulo honesto: contém processos cancelados no portal que o PNCP nunca soube (não é escondido).

import { useEffect, useState } from "react";
import { Loader2, Radio, CheckCircle2, FileSignature, TriangleAlert, Ban, HelpCircle } from "lucide-react";
import { fmtBRLCompact } from "@/lib/ui";

type Fase = { fase: string; label: string; n: number; valor: number };

const META: Record<string, { Icon: typeof Radio; cor: string; bg: string; nota?: string }> = {
  recebendo_proposta: { Icon: Radio, cor: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", nota: "Aberto agora — fornecedor pode participar" },
  homologada: { Icon: CheckCircle2, cor: "text-sky-700", bg: "bg-sky-50 border-sky-200" },
  contratada: { Icon: FileSignature, cor: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  deserta_fracassada: { Icon: TriangleAlert, cor: "text-amber-700", bg: "bg-amber-50 border-amber-200", nota: "Ninguém apareceu ou todos inabilitados" },
  cancelada: { Icon: Ban, cor: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
  em_analise: { Icon: HelpCircle, cor: "text-slate-600", bg: "bg-slate-50 border-slate-200", nota: "Sem desfecho publicado no PNCP — inclui processos encerrados no portal de origem" },
};

export function ProcessoFases({ codigo }: { codigo: string }) {
  const [fases, setFases] = useState<Fase[] | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setFases(null); setErro(false);
    fetch(`/api/processo-fases/${codigo}`)
      .then((r) => r.json())
      .then((d) => { if (vivo) setFases(Array.isArray(d.fases) ? d.fases : []); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [codigo]);

  if (erro) return null;
  if (!fases) return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando fases dos processos…
    </div>
  );

  const total = fases.reduce((a, f) => a + f.n, 0);
  if (!total) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Processos licitatórios por fase</h3>
        <span className="text-xs text-slate-400">{total.toLocaleString("pt-BR")} processos</span>
      </div>
      <p className="mb-3 text-[11px] text-slate-400">
        Fase atual de cada processo, conforme o PNCP publica. Um processo aparece em uma fase só.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fases.map((f) => {
          const m = META[f.fase] ?? META.em_analise;
          const pct = total ? (100 * f.n) / total : 0;
          return (
            <div key={f.fase} className={`rounded-lg border p-3 ${m.bg}`} title={m.nota ?? ""}>
              <div className="flex items-center gap-1.5">
                <m.Icon className={`h-4 w-4 ${m.cor}`} />
                <span className="text-[11px] font-medium text-slate-600">{f.label}</span>
              </div>
              <div className={`mt-1 text-2xl font-bold tabular-nums ${m.cor}`}>{f.n.toLocaleString("pt-BR")}</div>
              <div className="text-[11px] text-slate-500">
                {pct.toFixed(1)}% · {fmtBRLCompact(f.valor)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Fonte: PNCP. “Em análise” inclui processos sem desfecho publicado — o município às vezes encerra no portal de
        origem sem atualizar o PNCP. As demais fases refletem o estado registrado.
      </p>
    </section>
  );
}
