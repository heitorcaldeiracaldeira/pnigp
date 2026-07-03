"use client";

import { useState } from "react";
import { SlidersHorizontal, Sparkles, ArrowRight } from "lucide-react";
import { fmtBRLCompact } from "@/lib/ui";

type Props = { ano: number; receita: number; despesa: number; pessoal: number; investimento: number; rclAjustada: number; pessoalPctBase: number; tributaria: number; fundeb: number };

function faixaLRF(pct: number) {
  if (pct > 54) return { txt: "acima do limite (54%)", cls: "text-rose-700", bg: "bg-rose-100" };
  if (pct > 51.3) return { txt: "limite prudencial (51,3%)", cls: "text-amber-700", bg: "bg-amber-100" };
  if (pct > 48.6) return { txt: "alerta (48,6%)", cls: "text-amber-700", bg: "bg-amber-50" };
  return { txt: "dentro do limite", cls: "text-emerald-700", bg: "bg-emerald-100" };
}

export function SimuladorFiscal({ ano, receita, despesa, pessoal, investimento, rclAjustada, pessoalPctBase, tributaria, fundeb }: Props) {
  const [dp, setDp] = useState(0); // Δ% pessoal
  const [di, setDi] = useState(0); // Δ% investimento
  const [dr, setDr] = useState(0); // Δ% receita própria (IPTU/ISS/ITBI/taxas)
  const [df, setDf] = useState(0); // % de matrículas convertidas para tempo integral (ponderação FUNDEB)

  const extraRec = tributaria * (dr / 100); // receita própria adicional
  const fundebAdd = fundeb * (df / 100) * 0.5; // integral pondera ~1,5× → +0,5 de peso sobre a fatia convertida
  const novaReceita = receita + extraRec;
  const novaPessoal = pessoal * (1 + dp / 100);
  const novoInvest = investimento * (1 + di / 100);
  const novaDespesa = despesa + (novaPessoal - pessoal) + (novoInvest - investimento);
  const resultadoBase = receita - despesa;
  const resultadoNovo = novaReceita - novaDespesa;
  const novaRcl = rclAjustada + extraRec; // a arrecadação própria compõe a RCL → abre folga na LRF
  const pessoalPctNovo = novaRcl > 0 ? (novaPessoal / novaRcl) * 100 : pessoalPctBase;
  const invPctBase = despesa > 0 ? (investimento / despesa) * 100 : 0;
  const invPctNovo = novaDespesa > 0 ? (novoInvest / novaDespesa) * 100 : 0;
  const autoBase = receita > 0 ? (tributaria / receita) * 100 : 0;
  const autoNovo = novaReceita > 0 ? ((tributaria + extraRec) / novaReceita) * 100 : 0;
  const fb = faixaLRF(pessoalPctBase), fn = faixaLRF(pessoalPctNovo);

  // PONTE what-if → produto i10: cada alavanca que o gestor move e melhora o resultado aponta para a solução que a
  // torna real. O simulador cria o desejo ("simulei +R$X"); a i10 entrega o "como" (na aba Soluções i10).
  const pontes: { label: string; produto: string }[] = [];
  if (dr > 0) pontes.push({ label: `Reajustar receita própria (+${fmtBRLCompact(extraRec)}/ano)`, produto: "Recuperação de receita e atualização da planta genérica (IPTU/ISS)" });
  if (df > 0) pontes.push({ label: `Ampliar tempo integral (+${fmtBRLCompact(fundebAdd)} de FUNDEB)`, produto: "Educação: tempo integral, FUNDEB e BNCC" });
  if (dp < 0) pontes.push({ label: `Reenquadrar a folha (${dp}%)`, produto: "Gestão fiscal e adequação à LRF" });
  if (di > 0) pontes.push({ label: `Elevar o investimento (+${di}%)`, produto: "Captação de recursos para investir" });

  const Linha = ({ label, base, novo, fmt, bom }: { label: string; base: string; novo: string; fmt?: string; bom: boolean }) => (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-2 tabular-nums">
        <span className="text-slate-400">{base}</span>
        <span className="text-slate-300">→</span>
        <span className={`font-semibold ${bom ? "text-emerald-600" : "text-rose-600"}`}>{novo}{fmt}</span>
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><SlidersHorizontal className="h-4 w-4 text-teal-600" /> Simulador fiscal — exercício {ano}</div>
        <p className="mt-1 text-sm text-slate-600">Ajuste as alavancas — <b>reajuste de IPTU/ISS/ITBI</b>, folha de pessoal, investimento — e veja o impacto estimado no resultado, na <b>autonomia</b>, no <b>limite de pessoal da LRF</b> (sobre a RCL oficial) e na taxa de investimento. "E se eu atualizar a planta genérica do IPTU?" — responda aqui.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="flex items-center justify-between text-sm font-medium text-slate-700">Receita própria (IPTU/ISS/ITBI/taxas) <span className={`tabular-nums ${dr === 0 ? "text-slate-400" : dr > 0 ? "text-emerald-600" : "text-rose-600"}`}>{dr > 0 ? "+" : ""}{dr}%</span></label>
          <input type="range" min={-20} max={30} step={1} value={dr} onChange={(e) => setDr(Number(e.target.value))} className="mt-2 w-full accent-teal-600" />
          {dr !== 0 && <p className="mt-1 text-[11px] text-slate-500">{dr > 0 ? "+" : ""}{fmtBRLCompact(extraRec)} de arrecadação própria</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="flex items-center justify-between text-sm font-medium text-slate-700">Despesa de pessoal <span className={`tabular-nums ${dp === 0 ? "text-slate-400" : dp > 0 ? "text-rose-600" : "text-emerald-600"}`}>{dp > 0 ? "+" : ""}{dp}%</span></label>
          <input type="range" min={-20} max={20} step={1} value={dp} onChange={(e) => setDp(Number(e.target.value))} className="mt-2 w-full accent-teal-600" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="flex items-center justify-between text-sm font-medium text-slate-700">Investimento <span className={`tabular-nums ${di === 0 ? "text-slate-400" : di > 0 ? "text-emerald-600" : "text-rose-600"}`}>{di > 0 ? "+" : ""}{di}%</span></label>
          <input type="range" min={-20} max={20} step={1} value={di} onChange={(e) => setDi(Number(e.target.value))} className="mt-2 w-full accent-teal-600" />
        </div>
        {fundeb > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <label className="flex items-center justify-between text-sm font-medium text-slate-700">Matrículas em tempo integral <span className={`tabular-nums ${df === 0 ? "text-slate-400" : "text-blue-700"}`}>{df > 0 ? "+" : ""}{df}%</span></label>
          <input type="range" min={0} max={30} step={1} value={df} onChange={(e) => setDf(Number(e.target.value))} className="mt-2 w-full accent-blue-600" />
          <p className="mt-1 text-[11px] text-slate-500">{df > 0 ? `+${fmtBRLCompact(fundebAdd)} de FUNDEB (ponderação integral ~1,5×)` : "converta matrículas p/ integral e veja o FUNDEB extra"}</p>
        </div>
        )}
      </div>

      <div className="space-y-2">
        <Linha label="Resultado orçamentário" base={fmtBRLCompact(resultadoBase)} novo={fmtBRLCompact(resultadoNovo)} bom={resultadoNovo >= resultadoBase} />
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span className="text-slate-600">Pessoal / RCL (LRF)</span>
          <span className="flex items-center gap-2 tabular-nums">
            <span className={`rounded px-1.5 py-0.5 text-xs ${fb.bg} ${fb.cls}`}>{pessoalPctBase.toFixed(1)}%</span>
            <span className="text-slate-300">→</span>
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${fn.bg} ${fn.cls}`}>{pessoalPctNovo.toFixed(1)}% · {fn.txt}</span>
          </span>
        </div>
        <Linha label="Taxa de investimento" base={`${invPctBase.toFixed(1)}%`} novo={`${invPctNovo.toFixed(1)}`} fmt="%" bom={invPctNovo >= invPctBase} />
        <Linha label="Autonomia (receita própria / total)" base={`${autoBase.toFixed(1)}%`} novo={`${autoNovo.toFixed(1)}`} fmt="%" bom={autoNovo >= autoBase} />
        {fundeb > 0 && df > 0 && <Linha label="FUNDEB captado (educação)" base={fmtBRLCompact(fundeb)} novo={fmtBRLCompact(fundeb + fundebAdd)} bom={true} />}
      </div>

      {pontes.length > 0 && (
        <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-indigo-800"><Sparkles className="h-4 w-4 text-indigo-600" /> Como tornar esta simulação realidade</div>
          <p className="mt-0.5 text-[11px] text-slate-600">O simulador mostra o potencial; o <b>Instituto i10</b> executa. As alavancas que você moveu correspondem a estas soluções:</p>
          <ul className="mt-2 space-y-1.5">
            {pontes.map((p, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-700"><ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-indigo-500" /> <span>{p.label} → <b className="text-indigo-700">{p.produto}</b></span></li>
            ))}
          </ul>
          <a href="#solucoes-i10" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-700">Ver as Soluções i10 <ArrowRight className="h-3.5 w-3.5" /></a>
        </div>
      )}

      <p className="text-[11px] text-slate-400">Estimativa linear (mantém as demais receitas e despesas constantes). A receita própria adicional entra na RCL — por isso um reajuste de IPTU/ISS melhora o resultado <b>e</b> abre folga no limite de pessoal da LRF. O FUNDEB extra usa a ponderação da matrícula em tempo integral (~1,3–1,5× conforme a etapa); é estimativa (não considera a diluição no fundo estadual) e o recurso é vinculado à educação (mín. 70% aos profissionais). O % de pessoal parte da RCL ajustada oficial do RGF. Serve para explorar trade-offs, não como projeção formal.</p>
    </div>
  );
}
