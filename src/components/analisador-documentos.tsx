"use client";
// Analisador de Documentos — cola-se um edital/TR pronto e recebe análise de conformidade com alertas graduados por
// gravidade + sugestão + base legal (acórdão/prejulgado verificado). Recurso inspirado no analisador do licito.guru,
// com o diferencial de citar a jurisprudência confirmada (TCU/TCE-SC). Motor: analisarDocumento() em tr-modelo.ts.
import { useMemo, useState } from "react";
import { FileSearch, AlertTriangle, ShieldCheck, Info, Upload } from "lucide-react";
import { analisarDocumento, SEVERIDADE_LABEL, type Achado, type Severidade } from "@/lib/tr-modelo";

const COR: Record<Severidade, { bg: string; bd: string; tx: string }> = {
  alto: { bg: "bg-red-50", bd: "border-red-200", tx: "#b91c1c" },
  medio: { bg: "bg-amber-50", bd: "border-amber-200", tx: "#b45309" },
  baixo: { bg: "bg-slate-50", bd: "border-slate-200", tx: "#475569" },
  ok: { bg: "bg-emerald-50", bd: "border-emerald-200", tx: "#047857" },
};

export function AnalisadorDocumentos() {
  const [texto, setTexto] = useState("");
  const [analisar, setAnalisar] = useState(false);
  const res = useMemo(() => (analisar && texto.trim().length > 20 ? analisarDocumento(texto) : null), [analisar, texto]);
  const scoreCor = !res ? "#64748b" : res.score >= 80 ? "#059669" : res.score >= 50 ? "#d97706" : "#dc2626";

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setTexto(String(r.result || "")); setAnalisar(false); };
    r.readAsText(f);
  };

  const riscos = res ? res.achados.filter((a) => a.severidade !== "ok") : [];
  const positivos = res ? res.achados.filter((a) => a.severidade === "ok") : [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-teal-700"><FileSearch className="h-4 w-4" /> Analisador de Edital / Termo de Referência</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">novo</span>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">Cole o texto de um edital ou TR já pronto e receba uma análise de conformidade: pontos que restringem a competição ou fragilizam o processo, <b>graduados por gravidade</b>, com sugestão de correção e a <b>base legal</b> (súmula/acórdão/prejulgado verificado do TCU e do TCE-SC). Apoio automatizado — não substitui a análise jurídica do órgão.</p>

      <textarea value={texto} onChange={(e) => { setTexto(e.target.value); setAnalisar(false); }} rows={6} placeholder="Cole aqui o texto do edital ou do termo de referência…" className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => setAnalisar(true)} disabled={texto.trim().length < 20} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          <FileSearch className="h-4 w-4" /> Analisar documento
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-50">
          <Upload className="h-3.5 w-3.5" /> Carregar .txt
          <input type="file" accept=".txt,text/plain" onChange={onFile} className="hidden" />
        </label>
        <span className="text-[11px] text-slate-400">{texto.trim().length.toLocaleString("pt-BR")} caracteres</span>
      </div>

      {res && (
        <div className="mt-4">
          {/* placar */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-bold tabular-nums" style={{ color: scoreCor }}>{res.score}</span>
              <span className="text-[11px] text-slate-400">/100 conformidade</span>
            </div>
            <div className="flex gap-1.5 text-[11px]">
              {res.nAlto > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">{res.nAlto} alta</span>}
              {res.nMedio > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">{res.nMedio} atenção</span>}
              {res.nBaixo > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{res.nBaixo} baixa</span>}
              {positivos.length > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">{positivos.length} boa prática</span>}
            </div>
            <p className="w-full text-[12px] text-slate-600">{res.resumo}</p>
          </div>

          {/* achados */}
          <div className="mt-3 space-y-2">
            {riscos.map((a: Achado, i) => {
              const c = COR[a.severidade];
              return (
                <div key={i} className={`rounded-lg border ${c.bd} ${c.bg} px-3 py-2`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: c.tx }}>
                      {a.severidade === "alto" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
                      {a.categoria}
                    </div>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: c.tx }}>{SEVERIDADE_LABEL[a.severidade]}</span>
                  </div>
                  {a.trecho && <div className="mt-1 rounded bg-white/60 px-2 py-1 text-[11px] italic text-slate-500">“{a.trecho}”</div>}
                  <div className="mt-1 text-[11px] text-slate-600">{a.motivo}</div>
                  {a.sugestao && <div className="mt-0.5 text-[11px] text-slate-700"><b>Sugestão:</b> {a.sugestao}</div>}
                  <div className="mt-0.5 text-[10px] text-slate-400">Base: {a.base}</div>
                </div>
              );
            })}
            {riscos.length === 0 && <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700"><ShieldCheck className="h-4 w-4" /> Nenhum risco relevante detectado pelas regras automáticas.</div>}
          </div>

          {positivos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {positivos.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"><ShieldCheck className="h-3 w-3" /> {a.categoria}</span>
              ))}
            </div>
          )}
          <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-400">Análise automatizada por regras ancoradas na Lei 14.133/2021 e na jurisprudência verificada do TCU e do TCE-SC. É apoio ao gestor — não substitui a análise técnica e jurídica do órgão nem constitui manifestação de órgão de controle.</p>
        </div>
      )}
    </section>
  );
}
