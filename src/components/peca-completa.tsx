// PEÇA ORÇAMENTÁRIA COMPLETA (sugestão) — síntese do motor: receita projetada → despesa por função
// respeitando vinculações constitucionais (saúde 15%, educação 25%) e o limite de pessoal da LRF.
import { FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PecaCompletaSC } from "@/lib/queries";

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const mi = (n: number) => `R$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;

export function PecaCompleta({ data, nome }: { data: NonNullable<PecaCompletaSC>; nome: string }) {
  const saudeOk = data.funcoes.find((f) => f.funcao === "Saúde")!.valorSugerido >= data.saudeMin;
  const educOk = data.funcoes.find((f) => f.funcao === "Educação")!.valorSugerido >= data.educMin;
  const lrfPct = data.pessoalPctRCL ?? data.pessoalPctReceita;
  const lrfBase = data.pessoalPctRCL != null ? "da RCL" : "da receita";
  const pessoalOk = lrfPct <= 54;
  return (
    <section className="rounded-2xl border border-indigo-300 bg-gradient-to-br from-indigo-50/70 to-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><FileText className="h-4 w-4 text-indigo-600" /> Peça orçamentária sugerida — LOA {data.proximoAno} <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">protótipo</span></h3>
        <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white">Receita projetada {mi(data.receitaProjetada)}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">Sugestão fechada: a receita projetada (base {data.anoBase}, crescimento {data.crescimento >= 0 ? "+" : ""}{data.crescimento}%) define a despesa total, distribuída por função pelo padrão histórico — <b>com os pisos constitucionais e o teto de pessoal garantidos</b>.</p>

      {/* vinculações */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          { l: "Saúde ≥ 15%", ok: saudeOk, det: `mínimo ${mi(data.saudeMin)}` },
          { l: "Educação ≥ 25%", ok: educOk, det: `mínimo ${mi(data.educMin)}` },
          { l: "Pessoal ≤ 54% (LRF)", ok: pessoalOk, det: `${lrfPct}% ${lrfBase}` },
        ].map((v) => (
          <div key={v.l} className={`flex items-center gap-2 rounded-xl border p-2.5 ${v.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            {v.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
            <div><div className="text-xs font-semibold text-slate-700">{v.l}</div><div className="text-[10px] text-slate-500">{v.det}</div></div>
          </div>
        ))}
      </div>

      {/* despesa por função */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-400">
            <th className="py-1.5">Função</th><th className="text-right">% histórico</th><th className="text-right">Despesa sugerida {data.proximoAno}</th><th>Observação</th>
          </tr></thead>
          <tbody>
            {data.funcoes.map((f) => (
              <tr key={f.funcao} className="border-b border-slate-50">
                <td className="py-1.5 font-medium text-slate-700">{f.funcao}</td>
                <td className="text-right tabular-nums text-slate-500">{f.pctHist.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                <td className="text-right font-semibold tabular-nums text-slate-800">{brl(f.valorSugerido)}</td>
                <td className="text-[10px] text-slate-400">{f.ajustadoAoMinimo ? <b className="text-amber-600">elevada ao piso constitucional</b> : f.minimo ? "acima do piso" : ""}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <td className="py-1.5 text-slate-800">TOTAL (= receita projetada)</td><td></td>
              <td className="text-right tabular-nums text-indigo-700">{brl(data.despesaTotal)}</td><td className="text-[10px] text-slate-400">orçamento equilibrado</td>
            </tr>
          </tbody>
        </table>
      </div>

      {data.ldo && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
          <div className="mb-1 font-semibold text-slate-700">Ancoragem na sua LDO (Anexo de Metas Fiscais {data.ldo.ano})</div>
          <div className="grid gap-2 text-slate-600 sm:grid-cols-3">
            <div>Receita primária prevista: <b className="tabular-nums text-slate-800">{mi(data.ldo.receitaPrev)}</b></div>
            <div>Despesa autorizada (dotação): <b className="tabular-nums text-slate-800">{mi(data.ldo.despesaDot)}</b></div>
            <div>Meta de resultado primário: <b className={`tabular-nums ${data.ldo.metaResultado >= 0 ? "text-emerald-700" : "text-amber-700"}`}>{data.ldo.metaResultado >= 0 ? "+" : ""}{mi(data.ldo.metaResultado)}</b></div>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">A peça sugerida deve dialogar com a sua última LDO — a cadeia PPA → LDO → LOA é exigência do TCE-SC. Bases distintas: a LDO traz o resultado primário; a sugestão projeta a receita total.</p>
        </div>
      )}

      {data.alertas.length > 0 && (
        <ul className="mt-3 space-y-1">
          {data.alertas.map((a, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{a}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-1.5 text-xs font-semibold text-slate-700">Conformidade com os padrões do TCE-SC</div>
        <ul className="space-y-1 text-xs">
          {[
            { ok: saudeOk, t: "Vinculação da saúde (≥ 15% de impostos+transferências)" },
            { ok: educOk, t: "Vinculação da educação / MDE (≥ 25%)" },
            { ok: pessoalOk, t: "Limite de pessoal — LRF (≤ 54% da RCL)" },
            { ok: true, t: "Previsão de receita realista (corrigida pelo viés histórico)" },
            { ok: true, t: "Orçamento equilibrado (despesa fixada = receita prevista)" },
            { ok: null, t: "Metas físicas e financeiras por programa (requer detalhamento do PPA)" },
            { ok: null, t: "Alinhamento PPA → LDO → LOA" },
          ].map((c, i) => (
            <li key={i} className="flex items-center gap-1.5">
              {c.ok === true ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : c.ok === false ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" /> : <span className="h-3.5 w-3.5 shrink-0 text-center text-slate-300">○</span>}
              <span className={c.ok === null ? "text-slate-400" : "text-slate-600"}>{c.t}{c.ok === null ? " — a detalhar" : ""}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[10px] text-slate-400">Pontos de controle do TCE-SC na elaboração do orçamento (Guia do Mandato vigente, Manual e-Sfinge e Instruções Normativas atuais — ex.: IN TC-37/2025). O motor já garante os itens em verde; os pendentes dependem do PPA por programa.</p>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">Protótipo do motor. Método: receita = última realizada × crescimento mediano (exclui pandemia); transferências federais (FPM/FUNDEB/ITR) ancoradas na fonte oficial (STN); despesa por função = padrão histórico de execução, com pisos de saúde/educação garantidos e checagem do teto de pessoal (LRF). Base: SICONFI + STN. Refinamento: PPA por programa e detalhamento por subfunção.</p>
    </section>
  );
}
