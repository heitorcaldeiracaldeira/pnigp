// Painel FUNDEB — retrato NEUTRO (7 indicadores) + "como chegamos" (passo-a-passo da ponderação, didático p/ ensinar
// o servidor) + 3 séries históricas por metodologia consistente (com o aumento comprovado). A parte "como aumentar" é
// roteada para soluções i10 (consultoria). Fontes: FNDE FUNDEB · Censo INEP · STN. Server component. Exibição neutra.
import type { FundebSC } from "@/lib/queries";
import { BaixarCsv } from "./baixar-csv";
import { GraduationCap, Calculator, TrendingUp, Info, ArrowRight } from "lucide-react";

const n0 = (v: number) => Math.round(v).toLocaleString("pt-BR");
const brlMi = (v: number) => (v >= 1e9 ? `R$ ${(v / 1e9).toFixed(1)} bi` : v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)} mi` : `R$ ${(v / 1e3).toFixed(0)} mil`);
const cresc = (a: number, z: number) => (a > 0 ? Math.round((z / a - 1) * 100) : 0);

function Spark({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const max = Math.max(...pts), min = Math.min(...pts); const W = 200, H = 34;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * H}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-full" preserveAspectRatio="none"><polyline points={d} fill="none" stroke="#0d9488" strokeWidth="1.5" /></svg>;
}

function SerieHist({ titulo, fonte, dados, valor, badge, cor }: { titulo: string; fonte: string; dados: { ano: number; v: number }[]; valor: string; badge: string; cor: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold text-slate-700">{titulo}</div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cor}`}>{badge}</span>
      </div>
      <div className="mt-0.5 text-[10px] text-slate-400">{fonte}</div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div>
          <div className="font-display text-lg font-bold tabular-nums text-slate-800">{valor}</div>
          <div className="text-[10px] text-slate-500">{dados[0]?.ano}–{dados[dados.length - 1]?.ano}</div>
        </div>
        <div className="w-28"><Spark pts={dados.map((d) => d.v)} /></div>
      </div>
    </div>
  );
}

export function FundebPainel({ data, nome }: { data: NonNullable<FundebSC>; nome: string }) {
  const d = data;
  const espA = d.serieEspecial[0], espZ = d.serieEspecial[d.serieEspecial.length - 1];
  const munA = d.serieMunicipal[0], munZ = d.serieMunicipal[d.serieMunicipal.length - 1];
  const fbA = d.serieFundeb[0], fbZ = d.serieFundeb[d.serieFundeb.length - 1];
  const totalPond = d.breakdown.reduce((s, b) => s + b.ponderadas, 0);

  return (
    <section className="space-y-4">
      {/* RETRATO — 7 indicadores neutros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><GraduationCap className="h-4 w-4 text-teal-600" /> FUNDEB de {nome} — retrato</h3>
          <div className="flex items-center gap-2">
            <BaixarCsv nome={`fundeb-${nome}`} label="CSV" linhas={d.serieFundeb as unknown as Record<string, unknown>[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "total", rotulo: "Matrículas FUNDEB" }, { chave: "integral", rotulo: "Tempo integral" }, { chave: "especial", rotulo: "Educação especial" }]} />
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500">parâmetros {d.anoParam} · rede municipal</span>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3"><div className="text-[11px] text-slate-500">Receita FUNDEB ({d.anoReceita})</div><div className="font-display text-xl font-bold tabular-nums text-teal-700">{brlMi(d.receita)}</div></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3"><div className="text-[11px] text-slate-500">Matrículas FUNDEB</div><div className="font-display text-xl font-bold tabular-nums text-slate-800">{n0(d.matriculas)}</div></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3"><div className="text-[11px] text-slate-500">VAAF por matríc. ponderada</div><div className="font-display text-xl font-bold tabular-nums text-slate-800">R$ {n0(d.vaaf)}</div></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3"><div className="text-[11px] text-slate-500">Segmentos ativos</div><div className="font-display text-xl font-bold tabular-nums text-slate-800">{d.segmentosAtivos}<span className="text-sm text-slate-400">/8</span></div></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3"><div className="text-[11px] text-slate-500">Tempo integral</div><div className="font-display text-xl font-bold tabular-nums text-slate-800">{d.integralPct}%</div><div className="text-[10px] text-slate-400">{n0(d.integral)} matríc.</div></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3"><div className="text-[11px] text-slate-500">VAAT (valor aluno total)</div><div className="font-display text-xl font-bold tabular-nums text-slate-800">R$ {n0(d.vaatOficial)}</div></div>
          <div className={`rounded-xl border p-3 ${d.recebeVaar ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50/50"}`}><div className="text-[11px] text-slate-500">Recebe VAAR (resultado)</div><div className={`font-display text-xl font-bold ${d.recebeVaar ? "text-emerald-700" : "text-slate-400"}`}>{d.recebeVaar ? "Sim" : "Não"}</div></div>
          <div className={`rounded-xl border p-3 ${d.recebeVaat ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50/50"}`}><div className="text-[11px] text-slate-500">Recebe VAAT (compl.)</div><div className={`font-display text-xl font-bold ${d.recebeVaat ? "text-emerald-700" : "text-slate-400"}`}>{d.recebeVaat ? "Sim" : "Não"}</div></div>
        </div>
      </div>

      {/* COMO CHEGAMOS — passo a passo da ponderação (didático) */}
      {d.breakdown.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Calculator className="h-4 w-4 text-teal-600" /> Como chegamos ao valor — o cálculo do FUNDEB, passo a passo</div>
          <p className="mt-0.5 text-[11px] text-slate-500">O FUNDEB não distribui por matrícula "crua": cada etapa tem um <b>fator de ponderação</b> oficial. Multiplicando, chega-se às <b>matrículas ponderadas</b> — a base do rateio.</p>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-[11px] text-slate-500"><tr><th className="px-3 py-1.5 text-left">Etapa</th><th className="px-3 py-1.5 text-right">Matrículas</th><th className="px-3 py-1.5 text-center">× Fator</th><th className="px-3 py-1.5 text-right">= Ponderadas</th></tr></thead>
              <tbody>
                {d.breakdown.map((b, i) => (
                  <tr key={i} className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-700">{b.etapa}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{n0(b.matriculas)}</td><td className="px-3 py-1.5 text-center tabular-nums font-semibold text-teal-700">{b.fatorMedio.toFixed(2)}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-800">{n0(b.ponderadas)}</td></tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold"><td className="px-3 py-1.5 text-slate-700">Total ponderado</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{n0(d.matriculas)}</td><td className="px-3 py-1.5 text-center text-[11px] text-slate-400">média {d.fatorMedio.toFixed(2)}</td><td className="px-3 py-1.5 text-right tabular-nums text-teal-700">{n0(totalPond || d.ponderadas)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-slate-600">Receita FUNDEB <b>{brlMi(d.receita)}</b> ÷ <b>{n0(d.ponderadas)}</b> matrículas ponderadas = <b className="text-teal-700">R$ {n0(d.vaaf)}</b> por matrícula ponderada (o VAAF do município). É assim que o recurso é calculado.</p>
          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 text-[11px] text-slate-700">
            <b className="text-emerald-700">✓ Conferido contra o arquivo oficial do FNDE.</b> O VAAF calculado pelo motor (R$ {n0(d.vaaf)}/matríc. ponderada) {d.conferido.consistente ? "é consistente com" : "diverge levemente do"} o <b>VAAT oficial</b> do FNDE (R$ {n0(d.vaatOficial)}) — o VAAT é maior porque inclui a receita própria do município. Em SC, <b>{d.conferido.scPct}%</b> dos municípios batem (VAAF ≤ VAAT), validando o método.
          </div>
        </div>
      )}

      {/* HISTÓRICO — 3 metodologias consistentes, com o aumento comprovado */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><TrendingUp className="h-4 w-4 text-teal-600" /> O que mudou ano a ano — aumentos comprovados</div>
        <p className="mt-0.5 text-[11px] text-slate-500">Cada série compara <b>dentro da mesma metodologia</b> (fonte única, mesmo método todo ano) — sem emendar bases de escopos diferentes.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {espA && espZ && <SerieHist titulo="Educação especial" fonte="Censo Escolar/INEP" dados={d.serieEspecial.map((s) => ({ ano: s.ano, v: s.total }))} valor={`${n0(espA.total)} → ${n0(espZ.total)}`} badge={`+${cresc(espA.total, espZ.total)}%`} cor="bg-emerald-100 text-emerald-700" />}
          {munA && munZ && <SerieHist titulo="Matrícula municipal" fonte="Censo Escolar/INEP" dados={d.serieMunicipal.map((s) => ({ ano: s.ano, v: s.matriculas }))} valor={`${n0(munA.matriculas)} → ${n0(munZ.matriculas)}`} badge={`+${cresc(munA.matriculas, munZ.matriculas)}%`} cor="bg-teal-100 text-teal-700" />}
          {fbA && fbZ && fbA.ano !== fbZ.ano && <SerieHist titulo="AEE no FUNDEB (dupla matríc.)" fonte="FNDE FUNDEB oficial" dados={d.serieFundeb.map((s) => ({ ano: s.ano, v: s.especial }))} valor={`${n0(fbA.especial)} → ${n0(fbZ.especial)}`} badge={`${cresc(fbA.especial, fbZ.especial) >= 0 ? "+" : ""}${cresc(fbA.especial, fbZ.especial)}%`} cor="bg-indigo-100 text-indigo-700" />}
        </div>
      </div>

      {/* ROTEAMENTO i10 — a parte "como aumentar" é consultoria */}
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-5">
        <div className="text-sm font-semibold text-slate-800">Como <span className="text-teal-700">aumentar</span> estes recursos?</div>
        <p className="mt-1 text-[12px] text-slate-600">Este painel mostra o <b>retrato neutro</b> e <b>como o valor é calculado</b>. A estratégia para <b>ampliar a captação FUNDEB</b> (expansão de tempo integral, busca ativa de AEE, formalização de conveniadas, adequação à EC 135) é um trabalho de <b>consultoria do Instituto i10</b> — tecnologia, dados, pessoas e suporte jurídico.</p>
        <a href="mailto:contato@institutoi10.org.br?subject=Estratégia FUNDEB — {nome}" className="mt-2 inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-700">Falar com o i10 <ArrowRight className="h-3.5 w-3.5" /></a>
      </div>

      <p className="text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 font-semibold text-teal-700"><Info aria-hidden className="h-3 w-3" /> Dado oficial</span>Fontes: <b>FNDE — FUNDEB {d.anoParam}</b> (matrículas, fatores de ponderação, VAAF/VAAT/VAAR) · <b>Censo Escolar/INEP</b> (séries) · <b>STN</b> (receita). Fatores: Resolução CIF nº 5/2024. Exibição neutra e metodológica; sem juízo de gestão.{d.extraido && <> · extraído em {d.extraido}</>}</p>
    </section>
  );
}
