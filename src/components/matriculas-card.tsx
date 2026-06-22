import type { CensoMatriculaSC } from "@/lib/queries";

// Matrículas (Censo Escolar) — a "produção" da cadeia da educação (💰 financiamento → 🏭 matrículas → ❤️ IDEB).
export function MatriculasCard({ dados, nome }: { dados: CensoMatriculaSC; nome: string }) {
  if (!dados) return null;
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  // etapas-chave para exibir como pílulas
  const CHAVE = ["Educação Infantil", "Ensino Fundamental", "Ensino Médio", "EJA", "Educação Especial"];
  const pilulas = dados.etapas.filter((e) => CHAVE.includes(e.etapa));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-800">🏭 Matrículas — produção da educação</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Censo Escolar · INEP {dados.ano}</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">Quantos alunos {nome} atende na educação básica — a etapa intermediária da cadeia: 💰 financiamento (FUNDEB/MDE) → <b>🏭 matrículas</b> → ❤️ aprendizado (IDEB).</p>
      <div className="flex items-end gap-3">
        <div><div className="text-3xl font-bold tabular-nums text-slate-900">{fmt(dados.total)}</div><div className="text-[11px] text-slate-500">matrículas na educação básica</div></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {pilulas.map((e) => (
          <div key={e.etapa} className="rounded-xl border border-slate-200 p-2.5">
            <div className="text-base font-bold tabular-nums text-slate-800">{fmt(e.matriculas)}</div>
            <div className="text-[10px] text-slate-500">{e.etapa}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Anos Iniciais e Finais compõem o Ensino Fundamental. Fonte: Sinopse Estatística da Educação Básica (INEP).</p>
    </section>
  );
}
