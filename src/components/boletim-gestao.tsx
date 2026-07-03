"use client";

// Boletim de Gestão — o "resumo de tudo para TODOS" (periódico), que mantém a equipe inteira informada do quadro
// completo. Diferente do alerta pontual (delta), é o panorama: números-âncora + prioridades + agenda. Texto pronto
// para enviar ao grupo/lista da gestão. Não precisa de provedor — gera e copia.
import { useState } from "react";
import { Newspaper, Copy, Check } from "lucide-react";
import type { Alerta } from "@/lib/queries";

const SEV = { critico: "🔴 CRÍTICO", alto: "🟠 ALTO", medio: "🟡 ATENÇÃO" } as Record<string, string>;

export function BoletimGestao({ nome, alertas, resumo }: { nome: string; alertas: Alerta[]; resumo?: { ativos: number; criticosAtivos: number; valorImpacto: number } | null }) {
  const [copiado, setCopiado] = useState(false);
  const criticos = alertas.filter((a) => a.sev === "critico");
  const outros = alertas.filter((a) => a.sev !== "critico");
  const porArea: Record<string, Alerta[]> = {};
  for (const a of alertas) (porArea[a.area] ??= []).push(a);

  const brl = (v: number) => (v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)} mi` : v >= 1e3 ? `R$ ${(v / 1e3).toFixed(0)} mil` : `R$ ${v.toFixed(0)}`);
  const boletim =
    `📋 *BOLETIM DE GESTÃO — ${nome}*\n` +
    `_Panorama para a equipe · gerado pelo i10 Gov 360_\n\n` +
    `📊 *PANORAMA*\n` +
    `• ${alertas.length} ponto(s) de atenção${criticos.length ? ` — *${criticos.length} crítico(s)*` : ""}\n` +
    (resumo?.valorImpacto ? `• Impacto acumulado: ${brl(resumo.valorImpacto)} destravado/captado 🎉\n` : "") +
    `• Áreas com alerta: ${Object.keys(porArea).join(", ") || "—"}\n\n` +
    (criticos.length ? `🔴 *PRIORIDADES* (travam recursos)\n` + criticos.map((a, i) => `${i + 1}. ${a.titulo}\n   → ${a.acao}`).join("\n") + "\n\n" : "") +
    (outros.length ? `📌 *TAMBÉM ACOMPANHAR*\n` + outros.map((a) => `• [${a.area}] ${a.titulo}`).join("\n") + "\n\n" : "") +
    `Cada ponto tem a solução no painel. Regularizar destrava novas captações.\n` +
    `_Fonte: dados públicos oficiais · i10 Gov 360_`;

  const copiar = () => navigator.clipboard?.writeText(boletim).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }).catch(() => {});

  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Newspaper className="h-4 w-4 text-indigo-600" /> Boletim de gestão — resumo de tudo, para toda a equipe</h3>
        <button onClick={copiar} className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50">{copiado ? <><Check className="h-3 w-3 text-emerald-600" /> Copiado</> : <><Copy className="h-3 w-3" /> Copiar boletim</>}</button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">O panorama periódico que mantém prefeito, secretários e servidores na mesma página. Diferente do alerta pontual — é o &quot;tudo, para todos&quot;. Copie e envie ao grupo/lista da gestão.</p>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-snug text-slate-600">{boletim}</pre>
    </section>
  );
}
