import { AlertTriangle, CheckCircle2, ClipboardList, Gauge, Scale, Sparkles, TrendingUp } from "lucide-react";
import type { Insight } from "@/lib/insights-sc";

// liga a ação (Estratégico) ao lugar onde ela se executa (Tático/Operacional) — coordenação visível
const AREA_TAB: Record<string, string> = {
  "Saúde": "saude", "Saúde indígena": "saude", "Educação": "educacao-cruz",
  "Fiscal": "financas", "Compras": "compras",
};

const SEV = {
  critico: { chip: "bg-rose-100 text-rose-700", dot: "bg-rose-500", n: "border-rose-300" },
  atencao: { chip: "bg-amber-100 text-amber-700", dot: "bg-amber-500", n: "border-amber-300" },
  oportunidade: { chip: "bg-sky-100 text-sky-700", dot: "bg-sky-500", n: "border-sky-300" },
  destaque: { chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", n: "border-emerald-300" },
} as const;

type Conf = { label: string; valor: number | null; ancora: string; nivel: "ok" | "warn" | "bad" };

function confNivel(valor: number | null, tipo: "saude" | "educacao" | "pessoal"): "ok" | "warn" | "bad" {
  if (valor == null) return "ok";
  if (tipo === "saude") return valor >= 15 ? "ok" : valor >= 14 ? "warn" : "bad";
  if (tipo === "educacao") return valor >= 25 ? "ok" : valor >= 24 ? "warn" : "bad";
  return valor < 51.3 ? "ok" : valor < 54 ? "warn" : "bad"; // pessoal LRF
}
const CONF_COR = { ok: "text-emerald-600", warn: "text-amber-600", bad: "text-rose-600" };
const CONF_BG = { ok: "border-emerald-200 bg-emerald-50", warn: "border-amber-200 bg-amber-50", bad: "border-rose-200 bg-rose-50" };

const PARECER = {
  ok: { rotulo: "Contas em ordem", cls: "bg-emerald-100 text-emerald-700" },
  ressalva: { rotulo: "Atenção em alguns pontos", cls: "bg-amber-100 text-amber-700" },
  critico: { rotulo: "Pontos críticos a tratar", cls: "bg-rose-100 text-rose-700" },
} as const;

export function PlacarEstrategico({
  nome, posicao, total, scoreFiscal, tom, saudePct, educPct, pessoalPct, insights, ano, iegm,
}: {
  nome: string; posicao: number | null; total: number | null; scoreFiscal: number | null;
  tom: "ok" | "ressalva" | "critico" | null;
  saudePct: number | null; educPct: number | null; pessoalPct: number | null; insights: Insight[]; ano: number;
  iegm?: { faixa: string; pct: number } | null;
}) {
  const iegmCor = iegm ? (iegm.faixa === "A" || iegm.faixa === "B+" ? "bg-emerald-100 text-emerald-700" : iegm.faixa === "B" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700") : "";
  const conformidades: Conf[] = [
    { label: "Saúde (ASPS)", valor: saudePct, ancora: "mín. 15% — LC 141", nivel: confNivel(saudePct, "saude") },
    { label: "Educação (MDE)", valor: educPct, ancora: "mín. 25% — CF art. 212", nivel: confNivel(educPct, "educacao") },
    { label: "Pessoal (folha)", valor: pessoalPct, ancora: "limite 54% — LRF", nivel: confNivel(pessoalPct, "pessoal") },
  ].filter((c) => c.valor != null);
  const foraConf = conformidades.filter((c) => c.nivel !== "ok").length;

  const atencoes = insights.filter((i) => i.severidade === "critico" || i.severidade === "atencao").slice(0, 3);
  const oportunidade = insights.find((i) => i.severidade === "oportunidade") || insights.find((i) => i.severidade === "destaque");
  const plano = insights.filter((i) => i.acao); // o Plano de Trabalho = insights com ação

  return (
    <div className="space-y-4">
      {/* faixa de boas-vindas pedagógica */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">Visão do Prefeito — {nome}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {iegm && <a href="#iegm" className={`rounded-full px-3 py-1 text-sm font-semibold hover:underline ${iegmCor}`}>IEGM (TCE): {iegm.faixa}</a>}
            {tom && <span className={`rounded-full px-3 py-1 text-sm font-semibold ${PARECER[tom].cls}`}>{PARECER[tom].rotulo}</span>}
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">Em uma olhada: como o município está, o que a lei exige, onde há oportunidade e <b>o que fazer</b>. Os detalhes ficam nos níveis Tático e Operacional.</p>
      </div>

      {/* 4 blocos */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Índice de gestão */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Gauge className="h-4 w-4 text-blue-600" /> Índice de Gestão</div>
          {scoreFiscal != null ? (
            <>
              <div className="mt-2 flex items-end gap-2">
                <span className="font-display text-4xl font-bold tabular-nums text-slate-900">{scoreFiscal.toFixed(1)}</span>
                <span className="pb-1 text-sm text-slate-500">/ 100</span>
                {posicao && total && <span className="mb-1 ml-auto rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-semibold text-blue-700">{posicao}º de {total} em SC</span>}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Índice fiscal do PNIGP · exercício {ano}</p>
            </>
          ) : <p className="mt-2 text-sm text-slate-500">Sem índice calculado.</p>}
        </div>

        {/* Conformidade legal */}
        <div className={`rounded-2xl border p-5 ${foraConf ? "border-amber-200 bg-white" : "border-emerald-200 bg-white"}`}>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Scale className="h-4 w-4 text-emerald-700" /> Conformidade legal {foraConf === 0 && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</div>
          <div className="mt-3 space-y-2">
            {conformidades.map((c) => (
              <div key={c.label} className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-600">{c.label}</span>
                <span className="flex items-center gap-2">
                  <span className={`text-sm font-bold tabular-nums ${CONF_COR[c.nivel]}`}>{c.valor!.toFixed(1)}%</span>
                  <span className="hidden text-[10px] text-slate-400 sm:inline">{c.ancora}</span>
                  <span className={`h-2 w-2 rounded-full ${c.nivel === "ok" ? "bg-emerald-500" : c.nivel === "warn" ? "bg-amber-500" : "bg-rose-500"}`} />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Oportunidade */}
        <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><TrendingUp className="h-4 w-4 text-sky-600" /> Maior oportunidade</div>
          {oportunidade ? (
            <>
              <p className="mt-2 text-sm font-semibold text-slate-800">{oportunidade.titulo}</p>
              <p className="mt-0.5 text-xs text-slate-600">{oportunidade.detalhe}</p>
              {oportunidade.acao && <p className="mt-1.5 text-xs text-sky-800">▶ {oportunidade.acao}</p>}
            </>
          ) : <p className="mt-2 text-sm text-slate-500">Sem oportunidade destacada no período.</p>}
        </div>

        {/* 3 pontos de atenção */}
        <div className={`rounded-2xl border p-5 ${atencoes.length ? "border-amber-200 bg-amber-50/40" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><AlertTriangle className="h-4 w-4 text-amber-600" /> Pontos de atenção</div>
          {atencoes.length ? (
            <ul className="mt-2 space-y-1.5">
              {atencoes.map((a, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-700">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${SEV[a.severidade].dot}`} />
                  <span><b>{a.titulo}</b> — {a.detalhe}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-emerald-700">Nenhum alerta relevante. Bom trabalho!</p>}
        </div>
      </div>

      {/* PLANO DE TRABALHO — sempre presente */}
      <div className="rounded-2xl border-2 border-teal-200 bg-gradient-to-br from-teal-50 to-white p-5">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-teal-700" />
          <h3 className="text-base font-bold text-slate-900">Plano de Trabalho sugerido</h3>
          <span className="ml-auto rounded-full bg-teal-600 px-2.5 py-0.5 text-xs font-semibold text-white">{plano.length} ações</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">Ações priorizadas a partir do diagnóstico — o que fazer primeiro, por quê e em qual área. Cada uma se aprofunda nos níveis Tático e Operacional.</p>
        {plano.length ? (
          <ol className="mt-3 space-y-2.5">
            {plano.map((p, i) => (
              <li key={i} className={`flex gap-3 rounded-xl border bg-white p-3 ${SEV[p.severidade].n}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-bold text-white">{i + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{p.acao}</span>
                    {AREA_TAB[p.area] ? (
                      <a href={`#${AREA_TAB[p.area]}`} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold hover:underline ${SEV[p.severidade].chip}`}>{p.area} ↗</a>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SEV[p.severidade].chip}`}>{p.area}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500"><b>Por quê:</b> {p.detalhe}{AREA_TAB[p.area] && <a href={`#${AREA_TAB[p.area]}`} className="ml-1 font-medium text-teal-700 hover:underline">ver onde executar →</a>}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="mt-3 rounded-xl bg-white p-4 text-sm text-emerald-700">Sem ações pendentes — indicadores dentro do esperado. Mantenha o monitoramento.</p>}
        <p className="mt-3 text-[11px] text-slate-500">Sugestões geradas do diagnóstico com dados oficiais. Tom orientativo, baseado na metodologia de cada indicador — sem juízo sobre a gestão.</p>
      </div>
    </div>
  );
}
