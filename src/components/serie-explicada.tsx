"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BookMarked, Info, Plus } from "lucide-react";
import { EVENTOS_FNS, analisarSerieFns, type Camada } from "@/lib/fns-eventos";
import type { FnsSerieSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

const CAMADA: Record<Camada, { tag: string; cor: string; borda: string; chip: string }> = {
  fato: { tag: "Fato", cor: "text-sky-700", borda: "border-l-sky-400", chip: "bg-sky-100 text-sky-700" },
  contexto: { tag: "Contexto", cor: "text-amber-700", borda: "border-l-amber-400", chip: "bg-amber-100 text-amber-700" },
  metodologia: { tag: "Metodologia", cor: "text-violet-700", borda: "border-l-violet-400", chip: "bg-violet-100 text-violet-700" },
  local: { tag: "Registro local", cor: "text-emerald-700", borda: "border-l-emerald-400", chip: "bg-emerald-100 text-emerald-700" },
};

type Anot = { ano: number; texto: string };
type Momento = { ano: number; camada: Camada; titulo: string; desc: string; fonte?: string };

export function SerieExplicada({ serie, escopo, cod, nome }: { serie: FnsSerieSC; escopo: string; cod: string; nome: string }) {
  const [anots, setAnots] = useState<Anot[]>([]);
  const [form, setForm] = useState<{ ano: string; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch(`/api/serie-anotacao?escopo=${escopo}&cod=${cod}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => setAnots(d.anotacoes || [])).catch(() => {});
  }, [escopo, cod]);

  const { variacoes, anoParcial } = useMemo(() => analisarSerieFns(serie), [serie]);
  const anos = serie.map((s) => s.ano);
  const eventos = EVENTOS_FNS.filter((e) => e.ano >= (anos[0] ?? 0) && e.ano <= (anos[anos.length - 1] ?? 9999));

  const momentos: Momento[] = [
    ...eventos.map((e) => ({ ano: e.ano, camada: e.camada, titulo: e.titulo, desc: e.desc, fonte: e.fonte })),
    ...variacoes.map((v) => ({ ano: v.ano, camada: v.camada, titulo: v.titulo, desc: v.desc })),
    ...anots.map((a) => ({ ano: a.ano, camada: "local" as Camada, titulo: `Registro de ${nome} (${a.ano})`, desc: a.texto })),
  ].sort((a, b) => a.ano - b.ano || (a.camada === "fato" ? -1 : 1));

  const anosEvento = [...new Set(eventos.map((e) => e.ano))];

  async function salvar() {
    if (!form || !form.texto.trim() || !form.ano) return;
    setSalvando(true);
    try {
      await fetch("/api/serie-anotacao", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ escopo, cod, ano: Number(form.ano), texto: form.texto.trim() }) });
      setAnots((a) => [...a, { ano: Number(form.ano), texto: form.texto.trim() }]);
      setForm(null);
    } catch {}
    setSalvando(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-bold text-slate-900">Repasses federais de saúde (FNS) — série histórica explicada</h3>
        <p className="mt-1 text-sm text-slate-600">
          Cada subida e descida tem uma explicação <b>metodológica</b>: como a regra de repasse funciona e o que mudou no período. Abaixo, a linha do tempo separa <b>fato</b> (o que o dado mostra), <b>contexto</b> (mudança de regra/normativo), <b>metodologia</b> (por que a regra move o valor) e seu <b>registro local</b>.
        </p>

        <div className="mt-4">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={serie} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="gradFns" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d9488" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#0d9488" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="ano" tick={{ fontSize: 12, fill: "#475569" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis tickFormatter={(v) => fmtBRLCompact(Number(v))} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }} formatter={(v) => [fmtBRLCompact(Number(v)), "Repasse"]} />
              {anosEvento.map((a) => (
                <ReferenceLine key={a} x={a} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.7} label={{ value: a, position: "top", fontSize: 10, fill: "#b45309" }} />
              ))}
              <Area type="monotone" dataKey="total" name="Repasse" stroke="#0d9488" strokeWidth={2} fill="url(#gradFns)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
          {anoParcial && <p className="mt-1 text-[11px] text-amber-600">⚠️ {anoParcial} pode estar incompleto (ano em andamento — repasses ainda sendo publicados).</p>}
        </div>

        {/* legenda das camadas */}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {(Object.keys(CAMADA) as Camada[]).map((c) => (
            <span key={c} className={`rounded-full px-2 py-0.5 font-medium ${CAMADA[c].chip}`}>{CAMADA[c].tag}</span>
          ))}
        </div>
      </div>

      {/* linha do tempo explicada */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Info className="h-4 w-4 text-slate-400" /> Linha do tempo — o que explica cada variação</h4>
          <button onClick={() => setForm({ ano: String(anos[anos.length - 1] ?? ""), texto: "" })} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
            <Plus className="h-3.5 w-3.5" /> Registrar o que aconteceu
          </button>
        </div>

        {form && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-800"><BookMarked className="h-3.5 w-3.5" /> Memória local — registre um fato real do município (vira contexto para os próximos gestores)</p>
            <div className="flex flex-wrap gap-2">
              <input type="number" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value })} placeholder="ano" className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              <input type="text" value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} placeholder="ex.: trocamos o sistema de prontuário em mar/2024" className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              <button onClick={salvar} disabled={salvando} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{salvando ? "salvando…" : "Salvar"}</button>
              <button onClick={() => setForm(null)} className="rounded-lg px-2 py-1.5 text-sm text-slate-500">cancelar</button>
            </div>
          </div>
        )}

        {momentos.map((m, i) => (
          <div key={i} className={`rounded-r-xl border border-l-4 border-slate-200 bg-white p-3 ${CAMADA[m.camada].borda}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tabular-nums text-slate-400">{m.ano}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CAMADA[m.camada].chip}`}>{CAMADA[m.camada].tag}</span>
              <span className={`text-sm font-semibold ${CAMADA[m.camada].cor}`}>{m.titulo}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{m.desc}{m.fonte && <span className="text-slate-400"> · {m.fonte}</span>}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-500">
        Fonte: Fundo Nacional de Saúde (repasses fundo-a-fundo). As explicações descrevem a metodologia de financiamento e mudanças normativas do período — sem juízo sobre a gestão.
      </p>
    </div>
  );
}
