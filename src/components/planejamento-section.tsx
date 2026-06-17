"use client";

import { useState } from "react";
import { CalendarRange, Landmark, Wallet } from "lucide-react";
import { MetasSection } from "@/components/metas-section";
import { OrcadoExecutado } from "@/components/charts/orcado-executado";
import { despesaFuncaoArvore, receitaClassificacao } from "@/lib/orcamento";
import type { Financas, IndicadorRow } from "@/lib/queries";
import { fmtBRLCompact, fmtValor } from "@/lib/ui";

type Meta = {
  codigo: string;
  nome: string;
  unidade: string;
  direcao_melhor: "alta" | "baixa";
  valor_atual: number;
  valor_alvo: number;
  valor_base: number;
  ano_alvo: number;
  descricao: string;
};

type Nivel = "ok" | "warn" | "bad";
const DOT: Record<Nivel, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-rose-500" };
const TXT: Record<Nivel, string> = { ok: "text-emerald-700", warn: "text-amber-700", bad: "text-rose-700" };

function FiscalCard({ label, valor, meta, nivel, contexto }: { label: string; valor: string; meta: string; nivel: Nivel; contexto?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className={`h-2 w-2 rounded-full ${DOT[nivel]}`} />
        {label}
      </div>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums tracking-tight ${TXT[nivel]}`}>{valor}</div>
      <div className="text-[11px] text-slate-500">{meta}</div>
      {contexto && <div className="mt-1 text-[11px] text-slate-400">{contexto}</div>}
    </div>
  );
}

const INSTRUMENTOS = [
  { id: "ppa", sigla: "PPA", nome: "Plano Plurianual", icon: CalendarRange, desc: "Plano de médio prazo (4 anos) — define os programas e as metas físicas da gestão." },
  { id: "ldo", sigla: "LDO", nome: "Diretrizes Orçamentárias", icon: Landmark, desc: "Diretrizes do ano — fixa o Anexo de Metas Fiscais e as prioridades do exercício." },
  { id: "loa", sigla: "LOA", nome: "Orçamento Anual", icon: Wallet, desc: "Orçamento do ano — quanto foi previsto arrecadar e fixado para gastar, e o quanto já foi executado." },
] as const;

export function PlanejamentoSection({
  metas,
  financas,
  fiscal,
  seed,
  tipo,
  ano = 2025,
}: {
  metas: Meta[];
  financas: Financas | null;
  fiscal: IndicadorRow[];
  seed: string;
  tipo: "M" | "E";
  ano?: number;
}) {
  const [aba, setAba] = useState<"ppa" | "ldo" | "loa">("ppa");
  const ativo = INSTRUMENTOS.find((i) => i.id === aba)!;

  // LDO — Anexo de Metas Fiscais
  const fGet = (c: string) => fiscal.find((f) => f.codigo === c);
  const resultado = financas ? financas.receita_total - financas.despesa_total : 0;
  const pessoal = fGet("gasto_pessoal_rcl");
  const limitePessoal = tipo === "E" ? 49 : 54; // limite LRF do Poder Executivo
  const liquidez = fGet("liquidez_corrente");
  const recProp = fGet("receita_propria_pct");

  // LOA — receita prevista × arrecadada · despesa fixada × executada
  const recArvore = financas ? receitaClassificacao(financas, seed, tipo) : [];
  const recPrev = recArvore.reduce((s, n) => s + n.previsto, 0);
  const recArrec = recArvore.reduce((s, n) => s + n.realizado, 0);
  const funcExec = financas ? despesaFuncaoArvore(financas, seed) : [];
  const despFixada = funcExec.reduce((s, n) => s + n.previsto, 0);
  const despExec = funcExec.reduce((s, n) => s + n.realizado, 0);
  const orcExecData = funcExec.map((n) => ({ label: n.nome, orcado: n.previsto, executado: n.realizado }));
  const pctRec = recPrev > 0 ? (recArrec / recPrev) * 100 : 0;
  const pctDesp = despFixada > 0 ? (despExec / despFixada) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Seletor de instrumento */}
      <div className="grid gap-2 sm:grid-cols-3">
        {INSTRUMENTOS.map((i) => {
          const Icon = i.icon;
          const on = aba === i.id;
          return (
            <button
              key={i.id}
              onClick={() => setAba(i.id)}
              className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                on ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${on ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className={`text-sm font-bold ${on ? "text-teal-800" : "text-slate-800"}`}>{i.sigla}</div>
                <div className="text-[11px] text-slate-500">{i.nome}</div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <strong className="text-slate-700">{ativo.sigla} · {ativo.nome}.</strong> {ativo.desc}
      </p>

      {/* PPA */}
      {aba === "ppa" && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Metas físicas dos programas · PPA 2022–2025</h3>
          <MetasSection metas={metas} />
        </div>
      )}

      {/* LDO */}
      {aba === "ldo" && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Anexo de Metas Fiscais · LDO {ano}</h3>
          {financas ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FiscalCard
                label="Resultado orçamentário"
                valor={fmtBRLCompact(resultado)}
                meta={resultado >= 0 ? "Meta: equilíbrio — superávit" : "Meta: equilíbrio — déficit"}
                nivel={resultado >= 0 ? "ok" : "bad"}
                contexto="Receita total − despesa total"
              />
              {pessoal && (
                <FiscalCard
                  label="Gasto com pessoal"
                  valor={fmtValor(pessoal.valor, pessoal.unidade)}
                  meta={`Limite LRF: ${limitePessoal}% da RCL`}
                  nivel={pessoal.valor <= limitePessoal * 0.9 ? "ok" : pessoal.valor <= limitePessoal ? "warn" : "bad"}
                  contexto={`Poder Executivo · ${tipo === "E" ? "estado" : "município"}`}
                />
              )}
              {liquidez && (
                <FiscalCard
                  label="Liquidez corrente"
                  valor={fmtValor(liquidez.valor, liquidez.unidade)}
                  meta="Meta: ≥ 1,0 (paga compromissos de curto prazo)"
                  nivel={liquidez.valor >= 1 ? "ok" : liquidez.valor >= 0.8 ? "warn" : "bad"}
                />
              )}
              {recProp && (
                <FiscalCard
                  label="Receita própria (autonomia)"
                  valor={fmtValor(recProp.valor, recProp.unidade)}
                  meta={`Pares: ${fmtValor(recProp.media, recProp.unidade)} · maior = mais autonomia`}
                  nivel={recProp.valor >= recProp.media ? "ok" : recProp.valor >= recProp.media * 0.85 ? "warn" : "bad"}
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sem dados fiscais para este ente.</p>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            Metas fiscais inspiradas no Anexo de Metas Fiscais da LDO (LC 101/2000 — Lei de Responsabilidade Fiscal).
          </p>
        </div>
      )}

      {/* LOA */}
      {aba === "loa" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Execução orçamentária · LOA {ano}</h3>
          {financas ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FiscalCard label="Receita prevista" valor={fmtBRLCompact(recPrev)} meta="Estimativa da LOA" nivel="ok" />
                <FiscalCard label="Receita arrecadada" valor={fmtBRLCompact(recArrec)} meta={`${pctRec.toFixed(0)}% do previsto`} nivel={pctRec >= 95 ? "ok" : pctRec >= 85 ? "warn" : "bad"} />
                <FiscalCard label="Despesa fixada" valor={fmtBRLCompact(despFixada)} meta="Dotação autorizada" nivel="ok" />
                <FiscalCard label="Despesa executada" valor={fmtBRLCompact(despExec)} meta={`${pctDesp.toFixed(0)}% da dotação`} nivel={pctDesp >= 90 ? "ok" : pctDesp >= 80 ? "warn" : "bad"} />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h4 className="mb-1 font-semibold text-slate-800">Dotação × execução por função</h4>
                <p className="mb-2 text-xs text-slate-500">Quanto foi orçado e quanto foi executado em cada área</p>
                <OrcadoExecutado data={orcExecData} />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Sem dados orçamentários para este ente.</p>
          )}
        </div>
      )}
    </div>
  );
}
