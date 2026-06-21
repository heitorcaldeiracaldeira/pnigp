"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Award, BarChart3, BookOpen, ClipboardCheck, Database, Gauge } from "lucide-react";
import type { IegmSC } from "@/lib/queries";

type Visao = "estrategico" | "tatico" | "operacional" | "tecnico";
const PIL: { id: Visao; label: string; icon: typeof Gauge; desc: string }[] = [
  { id: "estrategico", label: "Estratégico", icon: Gauge, desc: "Nota do TCE e posição" },
  { id: "tatico", label: "Tático", icon: BarChart3, desc: "As 7 dimensões · onde está o gargalo" },
  { id: "operacional", label: "Operacional", icon: ClipboardCheck, desc: "Como melhorar cada dimensão" },
  { id: "tecnico", label: "Técnico", icon: Database, desc: "Série, cálculo e fonte" },
];
// conhecimento de cada dimensão (o que mede + como melhorar + cruzamento com nossos dados)
const DIM: Record<string, { label: string; oQue: string; melhorar: string; cruza?: { txt: string; href: string } }> = {
  "i-educ": { label: "Educação", oQue: "Infraestrutura, plano e gestão da educação municipal.", melhorar: "Plano Municipal de Educação ativo, infra das escolas, formação de professores.", cruza: { txt: "ver Educação", href: "#educacao" } },
  "i-saude": { label: "Saúde", oQue: "Conselho, plano e gestão da saúde.", melhorar: "Conselho de Saúde atuante, Plano de Saúde executado, APS forte.", cruza: { txt: "ver Atenção Primária", href: "#previne-ficha" } },
  "i-fiscal": { label: "Fiscal", oQue: "Equilíbrio das contas e cumprimento da LRF.", melhorar: "Gasto com pessoal sob controle (LRF), dívida e restos a pagar saudáveis.", cruza: { txt: "ver Folha/LRF", href: "#folha" } },
  "i-plan": { label: "Planejamento", oQue: "Coerência e execução de PPA/LDO/LOA.", melhorar: "Planejar o que se executa: alinhar PPA→LDO→LOA e cumprir metas.", cruza: { txt: "ver Metas", href: "#metas" } },
  "i-amb": { label: "Meio Ambiente", oQue: "Política e gestão ambiental, resíduos.", melhorar: "Plano de resíduos sólidos, política e conselho ambiental, coleta seletiva." },
  "i-cidade": { label: "Cidades", oQue: "Mobilidade, defesa civil, habitação.", melhorar: "Plano de mobilidade, plano de defesa civil, política habitacional." },
  "i-gov ti": { label: "Governança de TI", oQue: "Governança, segurança da informação e transparência digital.", melhorar: "Política de segurança da informação, transparência ativa, governança de TI." },
};
const norm = (s: string) => s.toLowerCase();
const cor = (f: string) => (f === "A" || f === "B+" ? "text-emerald-600" : f === "B" ? "text-amber-600" : "text-rose-600");
const corBar = (f: string) => (f === "A" || f === "B+" ? "bg-emerald-500" : f === "B" ? "bg-amber-500" : "bg-rose-500");
const ROTULO: Record<string, string> = { A: "Altamente efetiva", "B+": "Muito efetiva", B: "Efetiva", "C+": "Em adequação", C: "Baixa efetividade" };

export function AssuntoIEGM({ dados, nome }: { dados: NonNullable<IegmSC>; nome: string }) {
  const [v, setV] = useState<Visao>("estrategico");
  const dims = [...dados.dimensoes].sort((a, b) => a.pct - b.pct); // pior primeiro
  const fp = dados.finalPct * 100;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-gradient-to-br from-indigo-50 to-white px-5 py-3">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><Award className="h-4 w-4 text-indigo-600" /> IEGM — Qualidade da Gestão (TCE-SC)</h3>
        <p className="text-xs text-slate-500">A nota da gestão municipal pelo Tribunal de Contas, em 4 visões.</p>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
        {PIL.map((p) => { const Icon = p.icon; return <button key={p.id} onClick={() => setV(p.id)} title={p.desc} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${v === p.id ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}><Icon className="h-4 w-4" /> {p.label}</button>; })}
      </div>

      <div className="p-5">
        {v === "estrategico" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500">IEGM {dados.ano} (calculado das 7 dimensões)</div>
                <div className="flex items-end gap-2"><span className={`font-display text-4xl font-bold tabular-nums ${cor(dados.finalFaixa)}`}>{dados.finalFaixa}</span><span className="pb-1 text-sm text-slate-500">{fp.toFixed(0)}%</span></div>
                <div className="text-[11px] text-slate-500">{ROTULO[dados.finalFaixa]}</div>
              </div>
              {dados.pctil != null && <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700">percentil {dados.pctil} entre pares ({dados.totalPares})</span>}
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><b>O que é:</b> o IEGM é o índice do TCE que mede a <b>efetividade da gestão</b> em 7 áreas (educação, saúde, fiscal, planejamento, ambiente, cidades, TI). É a leitura do controle externo sobre a qualidade da administração — complementa os números brutos com a avaliação institucional.</p>
          </div>
        )}
        {v === "tatico" && (
          <div className="space-y-2.5">
            <p className="text-sm text-slate-600">As 7 dimensões ({dados.ano}) — as de cima puxam a nota para baixo:</p>
            {dims.map((d) => { const info = DIM[norm(d.nome)]; return (
              <div key={d.nome}>
                <div className="mb-0.5 flex justify-between text-xs"><span className="text-slate-600">{info?.label || d.nome}</span><span className="tabular-nums"><b className={cor(d.faixa)}>{d.faixa}</b> · {(d.pct * 100).toFixed(0)}%</span></div>
                <div className="h-2 w-full rounded-full bg-slate-100"><div className={`h-2 rounded-full ${corBar(d.faixa)}`} style={{ width: `${Math.min(100, d.pct * 100)}%` }} /></div>
              </div>
            ); })}
          </div>
        )}
        {v === "operacional" && (
          <div className="space-y-2.5">
            <p className="text-sm text-slate-600">Como melhorar cada dimensão (foco nas piores primeiro):</p>
            {dims.map((d) => { const info = DIM[norm(d.nome)]; if (!info) return null; return (
              <div key={d.nome} className={`rounded-xl border p-3 ${d.faixa === "A" || d.faixa === "B+" ? "border-emerald-200 bg-emerald-50/40" : d.faixa === "B" ? "border-amber-200 bg-amber-50/40" : "border-rose-200 bg-rose-50/40"}`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">{info.label} <span className={`text-xs ${cor(d.faixa)}`}>{d.faixa}</span></div>
                <p className="mt-0.5 text-xs text-slate-600"><BookOpen className="mr-1 inline h-3 w-3 text-emerald-700" />{info.melhorar}{info.cruza && <a href={info.cruza.href} className="ml-1 font-medium text-teal-700 hover:underline">{info.cruza.txt} →</a>}</p>
              </div>
            ); })}
          </div>
        )}
        {v === "tecnico" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Evolução do IEGM (calculado) e detalhe por dimensão.</p>
            {dados.serie.length >= 2 && (
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={dados.serie.map((s) => ({ ano: s.ano, pct: Math.round(s.pct * 1000) / 10 }))} margin={{ top: 6, right: 12, left: 4, bottom: 2 }}>
                  <defs><linearGradient id="gIegm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity={0.5} /><stop offset="100%" stopColor="#4f46e5" stopOpacity={0.05} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="ano" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(x) => [`${Number(x).toFixed(0)}%`, "IEGM"]} />
                  <Area type="monotone" dataKey="pct" stroke="#4f46e5" strokeWidth={2} fill="url(#gIegm)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            <p className="text-[11px] text-slate-500">Fonte: TCE-SC / IRB — IEGM, dados abertos (calculo_iegm). Nota final calculada das 7 dimensões com os pesos oficiais (Educ/Saúde/Fiscal 20%; Plan/Amb/Cidades/GovTI 10%).</p>
          </div>
        )}
      </div>
    </div>
  );
}
