"use client";

// Resolver alertas — fecha o ciclo do serviço: o gestor marca um alerta como resolvido (e informa o impacto:
// recurso destravado/captado). Grava resolvido_em + alimenta o notificacao_impacto → o painel de ROI ganha vida.
import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, ArrowUpCircle, Loader2, X } from "lucide-react";
import { adminHeaders, ensureAdminToken } from "@/lib/admin-client";

type Alerta = { id: number; alerta_id: string; severidade: string; titulo: string | null; secretaria: string | null; natureza: string | null; detectado: string; escalonado: boolean };
const NAT: Record<string, string> = { regularizacao: "🔴", oportunidade: "💰", obrigacao: "📅", risco: "⚠️", transparencia: "📄", positivo: "✅" };

export function ResolverAlertas({ codigo }: { codigo: string }) {
  const [lista, setLista] = useState<Alerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<number | null>(null);
  const [tipo, setTipo] = useState("resolvido");
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    fetch(`/api/notificacao-acao?cod=${codigo}`).then((r) => r.json()).then((d) => { setLista(d.alertas || []); setCarregando(false); }).catch(() => setCarregando(false));
  }, [codigo]);
  useEffect(() => { carregar(); }, [carregar]);

  const resolver = async (id: number) => {
    setSalvando(true);
    const body: Record<string, unknown> = { cod: codigo, resolver: id, tipo_impacto: tipo };
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    if (v > 0) body.valor = v;
    if (!ensureAdminToken()) return;
    await fetch(`/api/notificacao-acao`, { method: "POST", headers: adminHeaders(), body: JSON.stringify(body) }).catch(() => {});
    setSalvando(false); setAberto(null); setValor(""); setTipo("resolvido");
    setLista((l) => l.filter((a) => a.id !== id));
  };

  if (carregando) return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-[12px] text-slate-500"><Loader2 className="inline h-4 w-4 animate-spin text-teal-600" /> Carregando alertas ativos…</section>;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><CheckCircle2 className="h-4 w-4 text-teal-600" /> Resolver alertas — feche o ciclo</h3>
      <p className="mt-1 text-[11px] text-slate-500">Ao resolver, informe o <b>impacto</b> (recurso destravado/captado) — é o que alimenta o painel de resultado do serviço. {lista.length} alerta(s) ativo(s).</p>

      {lista.length === 0 ? (
        <p className="mt-3 text-[12px] text-emerald-600">✓ Nenhum alerta ativo pendente de resolução.</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {lista.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-start gap-1.5">
                  <span className="text-[13px]">{NAT[a.natureza || ""] || "•"}</span>
                  <div>
                    <div className="text-[12px] font-semibold text-slate-800">{a.titulo || a.alerta_id}</div>
                    <div className="text-[10px] text-slate-400 capitalize">{a.secretaria} · detectado {a.detectado}{a.escalonado ? <span className="ml-1 font-semibold text-rose-600"><ArrowUpCircle className="inline h-3 w-3" /> escalonado</span> : ""}</div>
                  </div>
                </div>
                {aberto !== a.id && <button onClick={() => setAberto(a.id)} className="shrink-0 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">Resolver</button>}
              </div>
              {aberto === a.id && (
                <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-2">
                  <label className="flex flex-col gap-0.5 text-[10px] font-medium text-slate-500">Resultado
                    <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-[12px] font-normal text-slate-800">
                      <option value="resolvido">Resolvido</option>
                      <option value="recurso_destravado">Recurso destravado</option>
                      <option value="recurso_captado">Recurso captado</option>
                    </select>
                  </label>
                  {tipo !== "resolvido" && (
                    <label className="flex flex-col gap-0.5 text-[10px] font-medium text-slate-500">Valor (R$)
                      <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="ex.: 250000" className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-[12px] font-normal text-slate-800" />
                    </label>
                  )}
                  <button onClick={() => resolver(a.id)} disabled={salvando} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Confirmar</button>
                  <button onClick={() => { setAberto(null); setValor(""); }} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
