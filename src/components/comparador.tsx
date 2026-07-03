"use client";

// Comparador dinâmico — escolha 2 a 5 municípios e as ÁREAS (Fiscal/Saúde/Educação/Assistência/Compras/Captação).
// Neutro (sem "vencedor/perdedor"): valor + barra de percentil/relativo. Diretriz: não abrir disputa — é para o
// gestor se situar, não ranking político.
import { useEffect, useState, useCallback } from "react";
import { Scale, X, Search, Plus } from "lucide-react";

type Muni = { cod: string; nome: string };
type Item = { cod: string; nome: string } & Record<string, number>;
type Ind = { key: string; pct?: string; label: string; fmt: (v: number) => string; nota?: string };

const CORES = ["#0d9488", "#4f46e5", "#ea580c", "#db2777", "#65a30d"];
const n0 = (v: number) => Math.round(v).toLocaleString("pt-BR");
const p1 = (v: number) => v.toFixed(1) + "%";
const f1 = (v: number) => (v ? v.toFixed(1) : "—");
const brl = (v: number) => (v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)} mi` : v >= 1e3 ? `R$ ${(v / 1e3).toFixed(0)} mil` : v ? `R$ ${v.toFixed(0)}` : "—");

const GRUPOS: Record<string, Ind[]> = {
  Fiscal: [
    { key: "populacao", label: "População", fmt: n0 },
    { key: "score", label: "Índice de Gestão Fiscal (0–100)", fmt: (v) => v.toFixed(0), nota: "média de 4 percentis" },
    { key: "autonomia", pct: "pctAutonomia", label: "Autonomia — receita própria / total", fmt: p1 },
    { key: "investimento", pct: "pctInvestimento", label: "Investimento — % da despesa", fmt: p1 },
    { key: "equilibrio", pct: "pctEquilibrio", label: "Equilíbrio — resultado / receita", fmt: p1 },
    { key: "pessoal", pct: "pctPessoal", label: "Pessoal — % da receita (LRF)", fmt: p1, nota: "menor = melhor" },
  ],
  Saúde: [
    { key: "saudePct", label: "Aplicação em saúde (ASPS)", fmt: p1, nota: "mín. 15%" },
    { key: "transfUniao", label: "Transf. da União (% da saúde)", fmt: p1 },
    { key: "previne", label: "Previne — desempenho médio", fmt: p1 },
  ],
  Educação: [
    { key: "educPct", label: "Aplicação em educação", fmt: p1, nota: "mín. 25%" },
    { key: "fundebPct", label: "FUNDEB — % em profissionais", fmt: p1 },
    { key: "ideb", label: "IDEB (anos iniciais)", fmt: f1 },
  ],
  Assistência: [
    { key: "cras", label: "CRAS (unidades)", fmt: n0 },
    { key: "habPorCras", label: "Habitantes por CRAS", fmt: n0, nota: "ref. 1 / 20 mil" },
    { key: "cadAtualiza", label: "CadÚnico — taxa de atualização", fmt: p1 },
    { key: "pbf", label: "Famílias no Bolsa Família", fmt: n0 },
  ],
  Compras: [
    { key: "comprasValor", label: "Valor contratado (ano)", fmt: brl },
    { key: "comprasN", label: "Nº de contratações", fmt: n0 },
    { key: "dispensaPct", label: "Sem licitação (dispensa)", fmt: p1, nota: "menor = melhor" },
  ],
  Captação: [
    { key: "convCelebrado", label: "Convênios — celebrado", fmt: brl },
    { key: "convLiberado", label: "Convênios — liberado", fmt: brl },
  ],
  Governança: [
    { key: "iegm", label: "IEGM — média das dimensões (%)", fmt: p1, nota: "TCE-SC / IRB" },
  ],
  Território: [
    { key: "agua", label: "Abastecimento de água", fmt: p1 },
    { key: "esgoto", label: "Esgotamento sanitário", fmt: p1 },
  ],
};
const AREAS = Object.keys(GRUPOS);

export function Comparador() {
  const [munis, setMunis] = useState<Muni[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>(["Fiscal"]);
  const [itens, setItens] = useState<Item[]>([]);
  const [busca, setBusca] = useState("");
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch(`/api/comparar?list=1`).then((r) => r.json()).then((d) => setMunis(d.municipios || [])).catch(() => {});
    const urlCods = new URLSearchParams(window.location.search).get("cods");
    if (urlCods) setSel(urlCods.split(",").map((c) => c.replace(/\D/g, "")).filter((c) => c.length === 7).slice(0, 5));
  }, []);
  const carregar = useCallback(() => {
    if (sel.length < 2) { setItens([]); return; }
    fetch(`/api/comparar?cods=${sel.join(",")}`).then((r) => r.json()).then((d) => { setItens(d.itens || []); setTotal(d.total || 0); }).catch(() => {});
  }, [sel]);
  useEffect(() => { carregar(); }, [carregar]);

  const add = (cod: string) => { if (sel.length < 5 && !sel.includes(cod)) setSel([...sel, cod]); setBusca(""); };
  const rem = (cod: string) => setSel(sel.filter((c) => c !== cod));
  const toggleArea = (a: string) => setAreas((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
  const nomeDe = (cod: string) => munis.find((m) => m.cod === cod)?.nome || cod;
  const sugestoes = busca.length >= 2 ? munis.filter((m) => m.nome.toLowerCase().includes(busca.toLowerCase()) && !sel.includes(m.cod)).slice(0, 8) : [];
  const linhas = AREAS.filter((a) => areas.includes(a)).flatMap((a) => [{ grupo: a } as const, ...GRUPOS[a]]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Scale className="h-4 w-4 text-teal-600" /> Comparador de municípios — escolha 2 a 5</div>
        <p className="mt-1 text-[12px] text-slate-500">Comparação analítica neutra: o valor + o percentil relativo aos {total || 295} municípios de SC. Para o gestor se situar — não é ranking.</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sel.map((cod, i) => (
            <span key={cod} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white" style={{ backgroundColor: CORES[i] }}>
              {nomeDe(cod)} <button onClick={() => rem(cod)} aria-label="remover"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {sel.length < 5 && (
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"><Search className="h-3.5 w-3.5" /></span>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="adicionar município…" className="rounded-full border border-slate-300 py-1 pl-7 pr-3 text-[12px] text-slate-800" />
              {sugestoes.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-56 w-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {sugestoes.map((m) => <button key={m.cod} onClick={() => add(m.cod)} className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12px] text-slate-700 hover:bg-teal-50"><Plus className="h-3 w-3 text-teal-600" /> {m.nome}</button>)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-500">Áreas:</span>
          {AREAS.map((a) => (
            <button key={a} onClick={() => toggleArea(a)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${areas.includes(a) ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{a}</button>
          ))}
        </div>
      </div>

      {sel.length < 2 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-[13px] text-slate-400">Escolha pelo menos 2 municípios para comparar.</p>
      ) : itens.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="p-2 text-left font-medium text-slate-500">Indicador</th>
                {itens.map((it) => <th key={it.cod} className="p-2 text-right font-semibold" style={{ color: CORES[sel.indexOf(it.cod)] }}>{it.nome}</th>)}
              </tr>
            </thead>
            <tbody>
              {linhas.map((ln, ri) => {
                if ("grupo" in ln) return (
                  <tr key={"g" + ri} className="bg-slate-50"><td colSpan={itens.length + 1} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-700">{ln.grupo}</td></tr>
                );
                const ind = ln as Ind;
                const vals = itens.map((it) => Number(it[ind.key]) || 0);
                const max = Math.max(...vals, 1);
                return (
                  <tr key={ind.key} className="border-b border-slate-50 align-middle">
                    <td className="p-2 text-slate-600">{ind.label}{ind.nota && <span className="block text-[10px] text-slate-400">{ind.nota}</span>}</td>
                    {itens.map((it) => {
                      const v = Number(it[ind.key]) || 0;
                      const pct = ind.pct ? Number(it[ind.pct]) || 0 : Math.round((v / max) * 100);
                      const cor = CORES[sel.indexOf(it.cod)];
                      return (
                        <td key={it.cod} className="p-2">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-semibold tabular-nums text-slate-800">{ind.fmt(v)}</span>
                            <div className="h-1.5 w-full max-w-[90px] overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(v ? 3 : 0, pct))}%`, backgroundColor: cor }} /></div>
                            {ind.pct && <span className="text-[9px] text-slate-400">percentil {pct}</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[10px] text-slate-400">Fontes oficiais (SICONFI/RREO, SIOPS, INEP, PNCP, Transferegov, MDS). A barra mostra o percentil (indicadores fiscais) ou o valor relativo ao maior entre os selecionados. Exibição neutra, sem juízo de gestão.</p>
        </div>
      )}
    </div>
  );
}
