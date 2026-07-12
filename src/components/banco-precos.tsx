"use client";
// PROTÓTIPO — Banco de Preços: busca por descrição sobre preços de referência (compras municipais SC + BPS saúde).
import { useEffect, useRef, useState } from "react";
import { Search, Database } from "lucide-react";
import { NotaTecnicaCatmat } from "@/components/nota-tecnica-catmat";

type Item = { item: string; unidade: string | null; mediana: number; faixaMin: number | null; faixaMax: number | null; n: number; nMunis: number | null; fonte: string; catmat: string | null; nacMediana: number | null; nacN: number | null; indicioPct: number | null; avulso: number | null; escala: number | null; escalaN: number | null; escalaEconomiaPct: number | null; precoBasico: number | null; unidadeBasica: string | null; nBasico: number | null; exclBasico: number | null };
const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// preço por unidade básica em forma legível: grama→R$/kg, mililitro→R$/L (multiplica p/ a unidade comercial usual)
const brl4 = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: v < 0.1 ? 4 : 2 });
function precoBasico(v: number, base: string): { txt: string; un: string } {
  if (base === "g") return { txt: brl4(v * 1000), un: "kg" };
  if (base === "ml") return { txt: brl4(v * 1000), un: "L" };
  if (base === "m2") return { txt: brl4(v), un: "m²" };
  if (base === "m3") return { txt: brl4(v), un: "m³" };
  return { txt: brl4(v), un: base };
}

export default function BancoPrecos() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setRes([]); setBuscou(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/banco-precos?q=" + encodeURIComponent(q.trim()));
        const j = await r.json();
        setRes(j.resultados || []); setBuscou(true);
      } catch { setRes([]); }
      setLoading(false);
    }, 400);
  }, [q]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-teal-700"><Search className="h-4 w-4" /> Banco de Preços — busque o preço de referência</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">protótipo</span>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">Digite a descrição do material ou serviço (ex.: <i>abraçadeira</i>, <i>papel</i>, <i>dipirona</i>) e veja o preço de referência — a partir das compras reais dos municípios de SC e do Banco de Preços em Saúde.</p>
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
        <Search className="h-4 w-4 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar item…" className="w-full bg-transparent text-sm outline-none" />
        {loading && <span className="text-[11px] text-slate-400">buscando…</span>}
      </div>
      {buscou && !res.length && !loading && <p className="mt-3 text-[12px] text-slate-400">Nada encontrado para “{q}”. Tente outro termo (a cobertura ainda é parcial neste protótipo).</p>}
      <div className="mt-3 space-y-1.5">
        {res.map((it, i) => (
          <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-slate-700">{it.item}{it.catmat ? <span className="ml-1 text-[10px] text-slate-400">CATMAT {it.catmat}</span> : null}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{it.unidade ? it.unidade + " · " : ""}{it.n > 0 ? `${it.n} compras · ${it.nMunis} municípios · ` : ""}<span className="font-semibold text-teal-600">{it.fonte}</span></div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[9px] uppercase tracking-wide text-slate-400">{it.fonte.includes("municipais") ? "mediana SC" : "referência"}</div>
                <div className="font-display text-base font-bold tabular-nums text-teal-700">{brl(it.mediana)}</div>
                <div className="text-[10px] font-semibold text-slate-500">por {it.unidade || (it.catmat ? "unid. do CATMAT" : "unidade")}</div>
                {it.faixaMin != null && it.faixaMax != null && <div className="text-[10px] text-slate-400">faixa {brl(it.faixaMin)}–{brl(it.faixaMax)}</div>}
                {it.precoBasico != null && it.unidadeBasica && (() => { const pb = precoBasico(it.precoBasico, it.unidadeBasica); return (
                  <div className="mt-0.5 border-t border-slate-100 pt-0.5 text-[10px] text-teal-600" title="Preço desempacotado à unidade básica — comparável entre embalagens diferentes (Passe 2)"><span className="font-semibold">{pb.txt}</span>/{pb.un} <span className="text-slate-400">un. básica{it.nBasico ? ` · ${it.nBasico} compras` : ""}{it.exclBasico ? ` · ${it.exclBasico} fora` : ""}</span></div>
                ); })()}
                {it.nacMediana != null && <div className="mt-0.5 border-t border-slate-100 pt-0.5 text-[10px] text-slate-500">Nacional: <b className="text-slate-700">{brl(it.nacMediana)}</b> <span className="text-slate-400">({it.nacN} obs)</span>{it.indicioPct != null && Math.abs(it.indicioPct) >= 10 ? <span className="ml-1 font-bold" style={{ color: it.indicioPct > 0 ? "#dc2626" : "#059669" }}>{it.indicioPct > 0 ? "SC +" : "SC "}{it.indicioPct}%</span> : null}</div>}
              </div>
            </div>
            {it.avulso != null && it.escala != null && it.escalaEconomiaPct != null && (
              <div className="mt-1.5 flex items-center gap-2 rounded-md bg-indigo-50 px-2 py-1 text-[10px]">
                <span className="font-semibold text-indigo-700">Como comprar:</span>
                <span className="text-slate-600">avulso <b className="tabular-nums">{brl(it.avulso)}</b>/un</span>
                <span className="text-slate-400">×</span>
                <span className="text-slate-600">em escala (caixa/pacote) <b className="tabular-nums">{brl(it.escala)}</b>/un{it.escalaN ? <span className="text-slate-400"> ({it.escalaN})</span> : null}</span>
                {it.escalaEconomiaPct > 2 ? <span className="ml-auto rounded-full bg-emerald-600 px-1.5 py-0.5 font-bold text-white">comprar em escala −{it.escalaEconomiaPct}%</span>
                  : it.escalaEconomiaPct < -2 ? <span className="ml-auto rounded-full bg-amber-500 px-1.5 py-0.5 font-bold text-white">avulso sai melhor +{Math.abs(it.escalaEconomiaPct)}%</span>
                  : <span className="ml-auto text-slate-400">equivalentes</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database aria-hidden className="h-3 w-3" /> Dado oficial</span>Preço de referência = <b>mediana</b> (robusta a outliers, conforme a IN SEGES/ME 65/2021), <b>por unidade de medida</b> — pacote, unidade avulsa, quilograma etc. são calculados separadamente (não misturamos unidades diferentes). Comparamos a <b>mediana de SC × a referência nacional</b> (Painel de Preços do Compras.gov.br, casado por CATMAT e por unidade) — "SC +X%" indica que os municípios de SC pagam acima do nacional (indício, não acusação: a especificação pode diferir). <b>Como comprar</b>: convertemos toda embalagem ao <b>preço por unidade</b> (valor ÷ quantidade da caixa/pacote) e comparamos <b>comprar avulso × comprar em escala</b> — mostra qual forma sai mais eficiente por unidade. Fontes: compras municipais de SC (item a item) + Painel de Preços (nacional) + Banco de Preços em Saúde (Min. Saúde).</p>
      <NotaTecnicaCatmat />
    </section>
  );
}
