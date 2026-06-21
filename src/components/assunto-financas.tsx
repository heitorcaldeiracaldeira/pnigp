"use client";

import { useState } from "react";
import { BarChart3, BookOpen, ClipboardCheck, Database, Gauge } from "lucide-react";
import type { FinancaSCAno, FuncaoSC, ReceitasDetalheSC, DespesaSubfuncaoSC, ReceitaConexaoSC, CaucSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

type Visao = "estrategico" | "tatico" | "operacional" | "tecnico";
const PIL: { id: Visao; label: string; icon: typeof Gauge }[] = [
  { id: "estrategico", label: "Estratégico", icon: Gauge },
  { id: "tatico", label: "Tático", icon: BarChart3 },
  { id: "operacional", label: "Operacional", icon: ClipboardCheck },
  { id: "tecnico", label: "Técnico", icon: Database },
];
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

function Pilulas({ v, setV }: { v: Visao; setV: (x: Visao) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
      {PIL.map((p) => { const Icon = p.icon; return (
        <button key={p.id} onClick={() => setV(p.id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${v === p.id ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}>
          <Icon className="h-4 w-4" /> {p.label}
        </button>
      ); })}
    </div>
  );
}
function Plano({ titulo, porque, passos }: { titulo: string; porque: string; passos: string[] }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><BookOpen className="h-4 w-4" /> {titulo}</p>
      <p className="mt-1 text-xs text-slate-600">{porque}</p>
      <ol className="mt-2 space-y-1.5">{passos.map((p, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">{i + 1}</span>{p}</li>)}</ol>
    </div>
  );
}
function Barra({ label, valor, max, cor, sub }: { label: string; valor: number; max: number; cor: string; sub?: string }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs"><span className="text-slate-600">{label}</span><span className="tabular-nums text-slate-500">{fmtBRLCompact(valor)}{sub ? ` · ${sub}` : ""}</span></div>
      <div className="h-2 w-full rounded-full bg-slate-100"><div className={`h-2 rounded-full ${cor}`} style={{ width: `${Math.min(100, max > 0 ? (valor / max) * 100 : 0)}%` }} /></div>
    </div>
  );
}

// ============ RECEITAS — de onde vem o dinheiro ============
export function AssuntoReceitas({ serie, detalhe, conexao, cauc, nome }: { serie: FinancaSCAno[]; detalhe: ReceitasDetalheSC; conexao?: ReceitaConexaoSC; cauc?: CaucSC; nome: string }) {
  const [v, setV] = useState<Visao>("estrategico");
  const u = serie[serie.length - 1];
  const maxDet = detalhe ? Math.max(...detalhe.itens.map((i) => i.valor), 1) : 1;
  const propria = pct(u.tributaria, u.receita);
  const dep = pct(u.transferencias, u.receita);
  const execRec = pct(u.receita, u.receita_prevista);
  const parecer = propria >= 25 ? { t: "Boa autonomia tributária", c: "bg-emerald-100 text-emerald-700" } : propria >= 12 ? { t: "Autonomia moderada", c: "bg-amber-100 text-amber-700" } : { t: "Alta dependência de transferências", c: "bg-rose-100 text-rose-700" };
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50 to-white px-5 py-3"><h3 className="text-base font-bold text-slate-900">💰 Receitas — de onde vem o dinheiro</h3><p className="text-xs text-slate-500">Origem do recurso e autonomia do município, em 4 visões.</p></div>
      <Pilulas v={v} setV={setV} />
      <div className="p-5">
        {v === "estrategico" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs text-slate-500">Receita total ({u.ano})</div><div className="font-display text-3xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(u.receita)}</div></div><span className={`rounded-full px-3 py-1 text-sm font-semibold ${parecer.c}`}>{parecer.t}</span></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Receita própria (tributária)</div><div className="text-xl font-bold tabular-nums text-slate-900">{propria.toFixed(1)}%</div></div>
              <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Transferências</div><div className="text-xl font-bold tabular-nums text-slate-900">{dep.toFixed(1)}%</div></div>
              <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Arrecadado/previsto</div><div className={`text-xl font-bold tabular-nums ${execRec >= 95 ? "text-emerald-600" : "text-amber-600"}`}>{execRec.toFixed(0)}%</div></div>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><b>Leitura:</b> {nome} arrecada {propria.toFixed(0)}% por conta própria e depende {dep.toFixed(0)}% de transferências. Mais receita própria = mais autonomia e menos vulnerabilidade a cortes federais/estaduais.</p>

            {/* conexão: o que entra → o que pode entrar → o que não estamos aptos */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="text-xs font-semibold text-emerald-800">📥 O que entra</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">{fmtBRLCompact(u.receita)}</div>
                <div className="text-[11px] text-slate-500">receita total · {propria.toFixed(0)}% própria</div>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3">
                <div className="text-xs font-semibold text-sky-800">📈 O que pode entrar</div>
                {conexao ? (() => { const gap = conexao.transfPCpares - conexao.transfPC; return (
                  <><div className={`mt-1 text-lg font-bold tabular-nums ${gap > 0 ? "text-amber-600" : "text-emerald-600"}`}>{gap > 0 ? `+${fmtBRLCompact(gap)}/hab` : "no nível dos pares"}</div>
                  <div className="text-[11px] text-slate-500">{gap > 0 ? `recebe menos transferências/hab que os pares (${fmtBRLCompact(conexao.transfPCpares)}/hab) — espaço a captar` : `transferências/hab ≥ pares (${fmtBRLCompact(conexao.transfPCpares)}/hab)`}</div></>
                ); })() : <div className="mt-1 text-sm text-slate-400">—</div>}
                <div className="mt-1 text-[10px] text-teal-700">+ Radar de Convênios (União+Estado) — em breve</div>
              </div>
              <div className={`rounded-xl border p-3 ${cauc && !cauc.apto ? "border-rose-200 bg-rose-50/50" : "border-emerald-200 bg-emerald-50/50"}`}>
                <div className="text-xs font-semibold text-slate-700">🔒 O que não estamos aptos</div>
                {cauc ? (cauc.apto
                  ? <><div className="mt-1 text-lg font-bold text-emerald-700">Apto ✓</div><div className="text-[11px] text-slate-500">sem pendências p/ transferências voluntárias (CAUC)</div></>
                  : <><div className="mt-1 text-lg font-bold text-rose-700">{cauc.nPendencias} pendência(s)</div><div className="text-[11px] text-slate-500">bloqueiam voluntárias (CAUC): {cauc.grupos.slice(0, 3).join(" · ") || "—"}</div></>)
                  : <div className="mt-1 text-sm text-slate-400">sem dado CAUC</div>}
              </div>
            </div>
          </div>
        )}
        {v === "tatico" && (
          <div className="space-y-2.5">
            <p className="text-sm text-slate-600">Composição da receita por origem ({u.ano}):</p>
            <Barra label="Tributária (própria: IPTU, ISS, taxas)" valor={u.tributaria} max={u.receita} cor="bg-emerald-500" sub={`${propria.toFixed(0)}%`} />
            <Barra label="Transferências (FPM, SUS, convênios)" valor={u.transferencias} max={u.receita} cor="bg-sky-500" sub={`${dep.toFixed(0)}%`} />
            <Barra label="Outras receitas" valor={u.outras} max={u.receita} cor="bg-slate-400" sub={`${pct(u.outras, u.receita).toFixed(0)}%`} />
            {detalhe && detalhe.itens.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">Principais tributos e transferências (nominais · {detalhe.anoUlt})</p>
                <div className="space-y-2">
                  {detalhe.itens.map((it) => <Barra key={it.item} label={it.item} valor={it.valor} max={maxDet} cor="bg-teal-500" />)}
                </div>
              </div>
            )}
          </div>
        )}
        {v === "operacional" && <Plano titulo="Como aumentar a receita própria" porque="Receita própria dá autonomia e não some quando o repasse cai. É o caminho para sair da dependência." passos={["Atualizar a Planta Genérica de Valores e o cadastro imobiliário (IPTU justo e atualizado).", "Modernizar a cobrança do ISS (nota fiscal eletrônica, fiscalização de serviços).", "Cobrar a dívida ativa (protesto em cartório, parcelamento, REFIS).", "Revisar taxas pelo custo real dos serviços prestados.", "Combater a sonegação e renúncias sem contrapartida."]} />}
        {v === "tecnico" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Série anual e execução da receita (arrecadado × previsto).</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium"><th>Ano</th><th className="text-right">Prevista</th><th className="text-right">Arrecadada</th><th className="text-right">Execução</th><th className="text-right">Própria %</th></tr></thead><tbody>
              {serie.map((r) => <tr key={r.ano} className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-700">{r.ano}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{fmtBRLCompact(r.receita_prevista)}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtBRLCompact(r.receita)}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{pct(r.receita, r.receita_prevista).toFixed(0)}%</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{pct(r.tributaria, r.receita).toFixed(0)}%</td></tr>)}
            </tbody></table></div>
            <p className="text-[11px] text-slate-500">Fonte: SICONFI (RREO). Execução = arrecadado ÷ previsto.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ DESPESAS — para onde vai o dinheiro ============
export function AssuntoDespesas({ serie, funcoes, subfuncoes, pessoalPct, nome }: { serie: FinancaSCAno[]; funcoes: FuncaoSC[]; subfuncoes: DespesaSubfuncaoSC; pessoalPct: number | null; nome: string }) {
  const [v, setV] = useState<Visao>("estrategico");
  const [aberta, setAberta] = useState<string | null>(null);
  const u = serie[serie.length - 1];
  const resultado = u.receita - u.despesa;
  const pess = pessoalPct ?? pct(u.pessoal, u.receita);
  const nvPess = pess < 51.3 ? "ok" : pess < 54 ? "warn" : "bad";
  const corP = nvPess === "ok" ? "text-emerald-600" : nvPess === "warn" ? "text-amber-600" : "text-rose-600";
  const funcs = [...funcoes].sort((a, b) => b.empenhado - a.empenhado).slice(0, 8);
  const maxF = Math.max(...funcs.map((f) => f.empenhado), 1);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-gradient-to-br from-blue-50 to-white px-5 py-3"><h3 className="text-base font-bold text-slate-900">🏛️ Despesas — para onde vai o dinheiro</h3><p className="text-xs text-slate-500">Onde o recurso é aplicado e a saúde fiscal, em 4 visões.</p></div>
      <Pilulas v={v} setV={setV} />
      <div className="p-5">
        {v === "estrategico" && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Despesa total ({u.ano})</div><div className="text-xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(u.despesa)}</div></div>
              <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Resultado (receita − despesa)</div><div className={`text-xl font-bold tabular-nums ${resultado >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtBRLCompact(resultado)}</div></div>
              <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Gasto com pessoal (LRF)</div><div className={`text-xl font-bold tabular-nums ${corP}`}>{pess.toFixed(1)}%</div><div className="text-[10px] text-slate-400">prudencial 51,3% · limite 54%</div></div>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><b>Leitura:</b> {resultado >= 0 ? "as contas fecharam no azul" : "a despesa superou a receita no ano"}; o gasto com pessoal está {nvPess === "ok" ? "dentro do prudencial" : nvPess === "warn" ? "na faixa de alerta (prudencial)" : "acima do limite legal"}. Pessoal alto reduz o espaço para investir.</p>
          </div>
        )}
        {v === "tatico" && (
          <div className="space-y-2.5">
            <p className="text-sm text-slate-600">Para onde vai — por função/área ({u.ano}, empenhado).{subfuncoes ? " Clique para ver as subfunções." : ""}</p>
            {funcs.map((f) => {
              const subs = subfuncoes?.porFuncao[f.nome];
              const temDrill = subs && subs.length > 0;
              const maxS = temDrill ? Math.max(...subs.map((s) => s.empenhado), 1) : 1;
              return (
                <div key={f.nome}>
                  <button disabled={!temDrill} onClick={() => setAberta(aberta === f.nome ? null : f.nome)} className={`w-full text-left ${temDrill ? "cursor-pointer" : "cursor-default"}`}>
                    <div className="mb-0.5 flex justify-between text-xs">
                      <span className="text-slate-600">{temDrill && <span className="mr-1 text-slate-400">{aberta === f.nome ? "▾" : "▸"}</span>}{f.nome}</span>
                      <span className="tabular-nums text-slate-500">{fmtBRLCompact(f.empenhado)} · exec {pct(f.empenhado, f.dotacao).toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, maxF > 0 ? (f.empenhado / maxF) * 100 : 0)}%` }} /></div>
                  </button>
                  {temDrill && aberta === f.nome && (
                    <div className="mt-1.5 ml-3 space-y-1.5 border-l-2 border-slate-100 pl-3">
                      {subs!.map((s) => (
                        <div key={s.subfuncao}>
                          <div className="mb-0.5 flex justify-between text-[11px]"><span className="text-slate-500">{s.subfuncao}</span><span className="tabular-nums text-slate-400">{fmtBRLCompact(s.empenhado)}</span></div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-sky-400" style={{ width: `${Math.min(100, (s.empenhado / maxS) * 100)}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {v === "operacional" && <Plano titulo="Como qualificar a despesa" porque="Gastar bem é tão importante quanto arrecadar: controlar pessoal libera caixa para investir e cumprir a lei." passos={["Manter o gasto com pessoal abaixo do prudencial (51,3% da RCL) — LRF.", "Priorizar investimento sobre custeio quando houver folga fiscal.", "Melhorar a execução (empenhado/dotação) para não perder recurso no fim do ano.", "Cumprir os mínimos de saúde (15%) e educação (25%) com qualidade do gasto.", "Renegociar e controlar a dívida dentro do limite (120% da RCL)."]} />}
        {v === "tecnico" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Série da despesa por natureza e execução por função (empenhado × dotação).</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium"><th>Ano</th><th className="text-right">Despesa</th><th className="text-right">Pessoal</th><th className="text-right">Custeio</th><th className="text-right">Investimento</th></tr></thead><tbody>
              {serie.map((r) => <tr key={r.ano} className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-700">{r.ano}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmtBRLCompact(r.despesa)}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmtBRLCompact(r.pessoal)}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmtBRLCompact(r.custeio)}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmtBRLCompact(r.investimento)}</td></tr>)}
            </tbody></table></div>
            <p className="text-[11px] text-slate-500">Fonte: SICONFI (RREO/RGF). Execução por função = empenhado ÷ dotação.</p>
          </div>
        )}
      </div>
    </div>
  );
}
