// PROTÓTIPO — Viés de previsão de receita (semente do motor de sugestão de peças orçamentárias).
// Mostra se o município super/subestima a receita e quão acurada é a previsão, com sugestão de calibração.
import { TrendingUp, Lightbulb, Target, BarChart3, Calculator } from "lucide-react";
import type { ViesPrevisaoSC, MacroLDOSC, ViesDespesaSC, ProjecaoReceitaSC } from "@/lib/queries";

const milBRL = (n: number) => `R$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;

export function ViesPrevisao({ data, macro, despesa, projecao, nome }: { data: NonNullable<ViesPrevisaoSC>; macro: MacroLDOSC; despesa: ViesDespesaSC; projecao: ProjecaoReceitaSC; nome: string }) {
  const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const diag = data.direcao === "subestima"
    ? <>{nome} historicamente <b>arrecada acima do previsto</b> ({fmtPct(data.viesMedio)} em média) — tende a <b>subestimar</b> a receita. Há margem real para um orçamento mais ambicioso, com cautela.</>
    : data.direcao === "superestima"
      ? <>A previsão de {nome} tende a ser <b>otimista</b>: a receita vem <b>{fmtPct(data.viesMedio)}</b> em média — risco de <b>frustração de receita</b> e contingenciamento no meio do ano.</>
      : <>{nome} tem a previsão <b>bem calibrada</b> (desvio médio de apenas {fmtPct(data.viesMedio)}).</>;
  const melhorQueUF = data.erroMedioAbs <= data.ufErroMedio;
  // gráfico de barras do viés por ano (0 no centro)
  const W = 520, H = 170, P = 30, mid = H / 2;
  const max = Math.max(12, ...data.serie.map((s) => Math.abs(s.vies)));
  const bw = (W - 2 * P) / data.serie.length;
  return (
    <div className="space-y-3">
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><TrendingUp className="h-4 w-4 text-indigo-600" /> Acurácia da previsão de receita <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">protótipo</span></h3>
        <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: `${data.classe.cor}22`, color: data.classe.cor }}>{data.classe.label} · erro médio {data.erroMedioAbs.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">Comparação <b>previsto (LOA) × arrecadado</b> ano a ano. Revela o viés sistemático do município — base para sugerir uma previsão calibrada.</p>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Viés de previsão por ano">
        <line x1={P} y1={mid} x2={W - P} y2={mid} stroke="#94a3b8" strokeWidth={1} />
        <text x={4} y={mid - 3} fontSize={9} fill="#94a3b8">0%</text>
        {data.serie.map((s, i) => {
          const h = (Math.abs(s.vies) / max) * (mid - P);
          const x = P + i * bw + bw * 0.2, w = bw * 0.6;
          const pos = s.vies >= 0;
          const cor = s.pandemia ? "#cbd5e1" : pos ? "#16a34a" : "#dc2626";
          return (
            <g key={s.ano}>
              <rect x={x} y={pos ? mid - h : mid} width={w} height={h} rx={2} fill={cor} />
              <text x={x + w / 2} y={pos ? mid - h - 3 : mid + h + 10} fontSize={8.5} fill="#475569" textAnchor="middle">{fmtPct(s.vies)}</text>
              <text x={x + w / 2} y={H - 8} fontSize={9} fill="#94a3b8" textAnchor="middle">{s.ano}{s.pandemia ? "*" : ""}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span><span className="text-emerald-600">●</span> arrecadou acima do previsto</span>
        <span><span className="text-rose-600">●</span> abaixo do previsto</span>
        <span><span className="text-slate-400">●</span> pandemia (2020–21, atípico — fora da média)</span>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm text-slate-700">{diag}</p>
        <p className="mt-1.5 text-xs text-slate-500">Acurácia vs. estado: erro médio de {nome} é <b className={melhorQueUF ? "text-emerald-600" : "text-amber-600"}>{data.erroMedioAbs.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b> contra <b>{data.ufErroMedio.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b> da média de SC ({melhorQueUF ? "mais preciso" : "menos preciso"} que a média).</p>
      </div>

      {data.direcao !== "neutro" && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-slate-700"><b>Sugestão para a LOA {data.proximoAno}:</b> dado o viés histórico, uma previsão de receita calibrada {data.direcao === "subestima" ? "pode ser ajustada para CIMA" : "deveria ser ajustada para BAIXO"} em torno de <b>{fmtPct(data.ajusteSugerido)}</b> em relação à simples repetição do previsto — aproximando a peça do que o município realmente arrecada.</p>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">Fonte: SICONFI (receita prevista na LOA × arrecadada). Protótipo do <b>motor de sugestão de peças orçamentárias</b> — anos de pandemia (2020–21) são marcados e excluídos da média por serem atípicos.</p>
    </section>

    {macro && (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Target className="h-4 w-4 text-indigo-600" /> Macroindicadores — metas da LDO × realizado · {macro.ano}</h3>
          {macro.primarioTotal > 0 && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Meta primária cumprida em {macro.primarioCumpridos}/{macro.primarioTotal} anos</span>}
        </div>
        <p className="mt-1 text-sm text-slate-600">O que o município <b>consolidou como meta</b> na Lei de Diretrizes Orçamentárias, mapeado contra o que de fato realizou. Base dos macroindicadores que o motor vai propor.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {macro.itens.map((it) => {
            const ok = it.cumpriu;
            const rotMeta = it.tipo === "meta" ? "Meta LDO" : it.chave === "dcl" ? "Início do ano" : "Previsto/dotação";
            const rotReal = it.chave === "dcl" ? "Fim do ano" : "Realizado";
            return (
              <div key={it.chave} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">{it.label}</span>
                  {ok != null && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{ok ? "cumpriu" : "não cumpriu"}</span>}
                </div>
                <div className="mt-1.5 flex items-baseline justify-between text-xs">
                  <span className="text-slate-500">{rotMeta}</span>
                  <span className="tabular-nums text-slate-600">{it.meta == null ? "—" : milBRL(it.meta)}</span>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-slate-500">{rotReal}</span>
                  <span className="font-bold tabular-nums text-slate-800">{milBRL(it.realizado)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Fonte: SICONFI — Anexo de Metas Fiscais da LDO (RREO). Resultado primário/nominal: meta legal × realizado. Receita/despesa/dívida: a execução dos macroagregados.</p>
      </section>
    )}

    {despesa && despesa.itens.length >= 2 && (() => {
      const totD = despesa.itens.reduce((s, x) => s + x.dotacao, 0);
      const rel = despesa.itens.filter((x) => x.dotacao >= totD * 0.015).sort((a, b) => a.execucao - b.execucao).slice(0, 9);
      const corExec = (e: number) => (e >= 90 ? "#16a34a" : e >= 75 ? "#d97706" : "#dc2626");
      const anos = despesa.anos.length ? `${despesa.anos[0]}–${despesa.anos[despesa.anos.length - 1]}` : "";
      return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><BarChart3 className="h-4 w-4 text-indigo-600" /> Viés de despesa por função — orçado × executado{anos ? ` · ${anos}` : ""}</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Execução global {despesa.execGlobal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">Taxa de execução (empenhado ÷ dotação) por função. <b>Execução baixa = orçamento inflado/contingenciado</b> — candidato a calibração na próxima LOA.</p>
          <div className="mt-3 space-y-1.5">
            {rel.map((it) => (
              <div key={it.funcao} className="flex items-center gap-2 text-xs">
                <span className="w-36 shrink-0 truncate text-slate-600" title={it.funcao}>{it.funcao}</span>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <div className="h-full rounded" style={{ width: `${Math.min(100, it.execucao)}%`, backgroundColor: corExec(it.execucao) }} />
                </div>
                <span className="w-12 shrink-0 text-right font-semibold tabular-nums" style={{ color: corExec(it.execucao) }}>{it.execucao.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</span>
                <span className="hidden w-28 shrink-0 text-right tabular-nums text-slate-400 sm:inline">{milBRL(it.dotacao)}→{milBRL(it.empenhado)}</span>
              </div>
            ))}
          </div>
          {despesa.maisInflada && despesa.maisInflada.execucao < 80 && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm text-slate-700"><b>Sugestão:</b> a função <b>{despesa.maisInflada.funcao}</b> é orçada em {milBRL(despesa.maisInflada.dotacao)} mas executa só <b>{despesa.maisInflada.execucao.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</b> — dotação historicamente inflada. Uma LOA calibrada aproximaria a dotação do realizado (~{milBRL(despesa.maisInflada.empenhado)}), liberando previsão para onde de fato se executa.</p>
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-400">Fonte: SICONFI — RREO Anexo 02 (dotação atualizada × despesa empenhada), despesa normal exceto intra-orçamentária. Agregado dos anos com dado de orçado disponível.</p>
        </section>
      );
    })()}

    {projecao && projecao.itens.length >= 2 && (() => {
      const TBADGE: Record<string, { l: string; c: string }> = {
        federal: { l: "federal · STN", c: "bg-blue-100 text-blue-700" },
        estadual: { l: "estadual · SEF-SC", c: "bg-violet-100 text-violet-700" },
        propria: { l: "própria", c: "bg-emerald-100 text-emerald-700" },
      };
      const crescTotal = projecao.totalAtual ? ((projecao.totalProjetado - projecao.totalAtual) / projecao.totalAtual) * 100 : 0;
      return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Calculator className="h-4 w-4 text-indigo-600" /> Projeção de receita por origem · LOA {projecao.proximoAno}</h3>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">Total projetado {milBRL(projecao.totalProjetado)} ({crescTotal >= 0 ? "+" : ""}{crescTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">Projeção de cada origem para a próxima LOA, partindo do <b>arrecadado real</b> (já corrige o viés). Transferências <b>ancoradas na fonte oficial</b> (federais → STN; ICMS/IPVA → cota-parte do SEF-SC); receitas próprias seguem a tendência histórica.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-400">
                <th className="py-1.5">Origem</th><th>Tipo</th><th className="text-right">Atual</th><th className="text-right">Projetado {projecao.proximoAno}</th><th className="text-right">Δ</th><th>Fonte</th>
              </tr></thead>
              <tbody>
                {projecao.itens.map((it) => {
                  const b = TBADGE[it.tipo];
                  return (
                    <tr key={it.item} className="border-b border-slate-50">
                      <td className="py-1.5 font-medium text-slate-700">{it.item}</td>
                      <td><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.c}`}>{b.l}</span></td>
                      <td className="text-right tabular-nums text-slate-500">{milBRL(it.atual)}</td>
                      <td className="text-right font-semibold tabular-nums text-slate-800">{milBRL(it.projetado)}</td>
                      <td className={`text-right tabular-nums ${it.crescimento >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{it.crescimento >= 0 ? "+" : ""}{it.crescimento.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                      <td className="text-[10px] text-slate-400">{it.oficial ? <b className="text-indigo-600">{it.fonteProjecao}</b> : "tendência"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Método: mediana do crescimento anual real (limitada a ±), por origem. As transferências usam a <b>fonte oficial</b> (federais no STN/Tesouro; ICMS/IPVA na cota-parte estadual do SEF-SC, conferida com a FECAM); as receitas próprias seguem a tendência histórica do arrecadado.</p>
        </section>
      );
    })()}
    </div>
  );
}
