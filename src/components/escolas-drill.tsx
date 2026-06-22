import type { EscolasSC } from "@/lib/queries";

// Drill escola a escola (rede municipal) — matrículas, quadro de pessoal (docentes/profissionais), relação aluno/professor
// e infraestrutura. Permite estudo de distribuição (escolas fora da média) e mapa. Nível operacional/técnico.
const ICO = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{ok ? "✓" : "✗"} {label}</span>
);

export function EscolasDrill({ dados, nome }: { dados: EscolasSC; nome: string }) {
  if (!dados) return null;
  const L = dados.lacunas;
  const lac = [
    { n: L.semInternet, t: "sem internet" }, { n: L.semBiblioteca, t: "sem biblioteca" }, { n: L.semQuadra, t: "sem quadra" },
    { n: L.semEsgoto, t: "sem esgoto" }, { n: L.semAcessibilidade, t: "sem acessibilidade" },
  ];
  const media = dados.alunoPorDocente; // alunos por docente do município
  const mapa = (lat: number, lon: number) => `https://www.google.com/maps?q=${lat},${lon}`;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🏫 Escolas da rede municipal — uma a uma</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">INEP {dados.ano}</span>
      </div>
      <p className="text-sm text-slate-500">{dados.total} escolas municipais em {nome} · {dados.matriculas.toLocaleString("pt-BR")} matrículas. Quadro de pessoal, relação aluno/professor e infraestrutura — para estudar atendimento e distribuição.</p>

      {/* índice de infraestrutura + quadro de pessoal */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(() => { const m = dados.infraMedia; const cls = m >= 75 ? "border-emerald-200 bg-emerald-50/60 text-emerald-700" : m >= 50 ? "border-amber-200 bg-amber-50/60 text-amber-700" : "border-rose-200 bg-rose-50/60 text-rose-700"; return (
          <div className={`rounded-xl border p-3 ${cls}`}><div className="text-xl font-bold tabular-nums">{m}<span className="text-sm">/100</span></div><div className="text-[11px] text-slate-600">índice de infraestrutura (média)</div></div>
        ); })()}
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.docentes.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-600">docentes (professores)</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.profissionais.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-600">profissionais de apoio</div></div>
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3"><div className="text-xl font-bold tabular-nums text-teal-700">{media ?? "—"}</div><div className="text-[11px] text-slate-600">alunos por professor (média)</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.alunoPorProf ?? "—"}</div><div className="text-[11px] text-slate-600">alunos por profissional de apoio</div></div>
      </div>

      {/* lacunas de infraestrutura */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {lac.map((c) => (
          <div key={c.t} className={`rounded-xl border p-2.5 text-center ${c.n > 0 ? "border-rose-200 bg-rose-50/50" : "border-emerald-200 bg-emerald-50/50"}`}>
            <div className={`text-lg font-bold tabular-nums ${c.n > 0 ? "text-rose-700" : "text-emerald-700"}`}>{c.n}</div>
            <div className="text-[11px] text-slate-600">{c.t}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 max-h-[30rem] overflow-y-auto rounded-xl border border-slate-100">
        {dados.lista.map((e, i) => {
          // estudo de distribuição: escola muito acima da média de alunos/professor = sobrecarregada
          const sobrec = media != null && e.alunoPorDoc != null && e.alunoPorDoc > media * 1.3;
          return (
          <div key={i} className="border-b border-slate-50 p-2.5 last:border-0">
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <span className="text-[13px] font-medium text-slate-800">{e.nome}{e.bairro ? <span className="font-normal text-slate-400"> · {e.bairro}</span> : null}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${e.infraScore >= 75 ? "bg-emerald-100 text-emerald-700" : e.infraScore >= 50 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>infra {e.infraScore}</span>
                {e.lat != null && e.lon != null && <a href={mapa(e.lat, e.lon)} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-teal-600 hover:underline">📍 mapa</a>}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
              <span>{e.matriculas.toLocaleString("pt-BR")} alunos</span>
              <span>{e.docentes} prof.</span>
              <span>{e.profissionais} apoio</span>
              {e.alunoPorDoc != null && <span className={sobrec ? "font-semibold text-rose-600" : "text-slate-600"}>{e.alunoPorDoc} alunos/prof.{sobrec ? " ⚠️ acima da média" : ""}</span>}
              {e.zona === 2 && <span>· rural</span>}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <ICO ok={e.infra.internet} label="internet" /><ICO ok={e.infra.biblioteca} label="biblioteca" /><ICO ok={e.infra.quadra} label="quadra" />
              <ICO ok={e.infra.labInfo} label="lab. info" /><ICO ok={e.infra.refeitorio} label="refeitório" /><ICO ok={e.infra.esgoto} label="esgoto" /><ICO ok={e.infra.acessibilidade} label="acessib." />
            </div>
          </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Fonte: INEP — Censo Escolar {dados.ano}. Rede municipal, escolas em atividade. Docentes = QT_DOC_BAS; profissionais = soma do pessoal de apoio. ⚠️ = mais de 30% acima da média de alunos/professor do município.</p>
    </section>
  );
}
