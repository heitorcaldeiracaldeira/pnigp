import type { EscolasSC } from "@/lib/queries";

// Drill escola a escola (rede municipal) — matrículas + infraestrutura + lacunas. Nível operacional/técnico.
const ICO = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{ok ? "✓" : "✗"} {label}</span>
);

export function EscolasDrill({ dados, nome }: { dados: EscolasSC; nome: string }) {
  if (!dados) return null;
  const L = dados.lacunas;
  const cards = [
    { n: L.semInternet, t: "sem internet" }, { n: L.semBiblioteca, t: "sem biblioteca" }, { n: L.semQuadra, t: "sem quadra" },
    { n: L.semEsgoto, t: "sem esgoto" }, { n: L.semAcessibilidade, t: "sem acessibilidade" },
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🏫 Escolas da rede municipal — uma a uma</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">INEP {dados.ano}</span>
      </div>
      <p className="text-sm text-slate-500">{dados.total} escolas municipais em {nome} · {dados.matriculas.toLocaleString("pt-BR")} matrículas. Onde estão as lacunas de infraestrutura (alvos de investimento e pleito no PAR).</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.t} className={`rounded-xl border p-2.5 text-center ${c.n > 0 ? "border-rose-200 bg-rose-50/50" : "border-emerald-200 bg-emerald-50/50"}`}>
            <div className={`text-xl font-bold tabular-nums ${c.n > 0 ? "text-rose-700" : "text-emerald-700"}`}>{c.n}</div>
            <div className="text-[11px] text-slate-600">{c.t}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-xl border border-slate-100">
        {dados.lista.map((e, i) => (
          <div key={i} className="border-b border-slate-50 p-2.5 last:border-0">
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <span className="text-[13px] font-medium text-slate-800">{e.nome}</span>
              <span className="text-[11px] text-slate-500">{e.matriculas.toLocaleString("pt-BR")} matrículas{e.zona === 2 ? " · rural" : ""}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <ICO ok={e.infra.internet} label="internet" />
              <ICO ok={e.infra.biblioteca} label="biblioteca" />
              <ICO ok={e.infra.quadra} label="quadra" />
              <ICO ok={e.infra.labInfo} label="lab. info" />
              <ICO ok={e.infra.refeitorio} label="refeitório" />
              <ICO ok={e.infra.esgoto} label="esgoto" />
              <ICO ok={e.infra.agua} label="água" />
              <ICO ok={e.infra.acessibilidade} label="acessib." />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Fonte: INEP — Censo Escolar {dados.ano} (microdados). Rede municipal, escolas em atividade. ✓ = possui · ✗ = não possui.</p>
    </section>
  );
}
