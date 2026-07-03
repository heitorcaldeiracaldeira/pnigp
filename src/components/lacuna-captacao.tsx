"use client";

import { PiggyBank, TrendingDown, CheckCircle2, Info, HeartPulse, HandHeart } from "lucide-react";
import type { LacunaCaptacaoSC, LacunaSaudeSC, LacunaAssistenciaSC } from "@/lib/queries";

const brl = (n: number) => (n >= 1e6 ? "R$ " + (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : "R$ " + Math.round(n).toLocaleString("pt-BR"));

export function LacunaCaptacaoEducacao({ data, nome }: { data: NonNullable<LacunaCaptacaoSC>; nome: string }) {
  const { totalRecebido, porAluno, medianaPorAluno, matriculas, abaixoDaMediana, ausentes, recebidos, pdde, pnld } = data;
  const potencial = ausentes.reduce((s, a) => s + a.medianaPares, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><PiggyBank aria-hidden className="h-4 w-4 text-emerald-600" /> Lacuna de captação — Educação (recursos que não dependem de emenda)</div>
      <p className="mt-1 text-[12px] text-slate-600">Comparação, a partir das <b>liberações reais do FNDE</b> (SIMAD, 2023–2025), entre o que {nome} capta e o que a maioria dos municípios de SC capta. Programas que os pares acessam e ainda não aparecem aqui podem indicar <b>adesão pendente</b> — recurso disponível sem emenda. Sinalização neutra: a decisão de aderir é do gestor.</p>

      {/* KPIs */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="text-[11px] text-slate-500">FNDE recebido (2023–2025)</div>
          <div className="font-display text-xl font-bold tabular-nums text-slate-900">{brl(totalRecebido)}</div>
          <div className="text-[11px] text-slate-500">{matriculas > 0 ? `${matriculas.toLocaleString("pt-BR")} matrículas` : "—"}</div>
        </div>
        <div className={`rounded-xl border p-3 ${abaixoDaMediana ? "border-amber-300 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/50"}`}>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">{abaixoDaMediana ? <TrendingDown className="h-3.5 w-3.5 text-amber-600" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} R$ por aluno</div>
          <div className={`font-display text-xl font-bold tabular-nums ${abaixoDaMediana ? "text-amber-700" : "text-emerald-700"}`}>{brl(porAluno)}</div>
          <div className="text-[11px] text-slate-500">mediana SC: {brl(medianaPorAluno)} {abaixoDaMediana ? "· abaixo" : "· na média ou acima"}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="text-[11px] text-slate-500">Potencial estimado na mesa</div>
          <div className="font-display text-xl font-bold tabular-nums text-emerald-700">{ausentes.length > 0 ? brl(potencial) : "—"}</div>
          <div className="text-[11px] text-slate-500">{ausentes.length} programa(s) que os pares captam</div>
        </div>
      </div>

      {/* Programas ausentes = dinheiro na mesa */}
      {ausentes.length > 0 && (
        <div className="mt-3">
          <div className="text-[12px] font-semibold text-slate-800">Programas que a maioria dos municípios capta e ainda não aparecem em {nome}</div>
          <div className="mt-1.5 space-y-1">
            {ausentes.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px]">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{a.programa}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{a.penetracaoPct}% dos municípios captam</span>
                <span className="shrink-0 tabular-nums text-emerald-700">mediana dos pares <b>{brl(a.medianaPares)}</b></span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">"Mediana dos pares" = valor típico recebido por município que acessa o programa (não é garantia de valor; depende de elegibilidade, matrícula e adesão).</p>
        </div>
      )}

      {/* PDDE — pago direto à escola (fora do SIMAD): adesão/execução por aluno vs pares do porte */}
      {pdde && pdde.recebido > 0 && (
        <div className={`mt-3 rounded-xl border p-3 ${pdde.abaixo ? "border-amber-300 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/40"}`}>
          <div className="flex items-center gap-1 text-[12px] font-semibold text-slate-800">🏫 Dinheiro Direto na Escola (PDDE) — {pdde.ano}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
            <span className="text-slate-600">Recebido: <b className="tabular-nums text-slate-800">{brl(pdde.recebido)}</b> em <b>{pdde.nEscolas}</b> escola(s)</span>
            <span className="text-slate-600">R$/aluno: <b className={`tabular-nums ${pdde.abaixo ? "text-amber-700" : "text-emerald-700"}`}>{brl(pdde.porAluno)}</b></span>
            <span className="text-[11px] text-slate-500">mediana do porte: {brl(pdde.medianaPorAluno)} {pdde.abaixo ? "· abaixo (adesão/execução a melhorar)" : "· na média ou acima"}</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">O PDDE é pago direto à conta da escola (UEx), não ao tesouro — não aparece no SIMAD. Baixa execução/adesão das escolas deixa recurso na conta ou não pleiteado.</p>
        </div>
      )}

      {/* PNLD reserva técnica — ADEQUAÇÃO de material didático (não é captação); honesto sobre o ciclo aberto */}
      {pnld && (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3">
          <div className="flex items-center gap-1 text-[12px] font-semibold text-slate-800">📚 Material didático (PNLD — reserva técnica) — {pnld.ano}</div>
          <div className="mt-1 text-[12px] text-slate-600">
            Escolas municipais demandaram <b className="tabular-nums text-slate-800">{pnld.demandada}</b> livro(s) em <b>{pnld.nVolumes}</b> título(s) na reserva técnica{pnld.cicloAberto ? <span className="text-slate-500"> — <b>ciclo em andamento</b> (atendimento ainda não consolidado)</span> : <span> · atendidos: <b className="tabular-nums">{pnld.atendimento}</b></span>}.
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Indicador de adequação de material, não de captação — o PNLD principal é distribuição universal. A reserva técnica cobre livros que faltaram na escola.</p>
        </div>
      )}

      {/* Recebidos (contexto) */}
      {recebidos.length > 0 && (
        <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/40">
          <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-semibold text-slate-700">O que {nome} já capta do FNDE ({recebidos.length})</summary>
          <div className="space-y-0.5 px-3 pb-2">
            {recebidos.map((r, i) => (
              <div key={i} className="flex items-center justify-between border-t border-slate-100 pt-0.5 text-[11px]">
                <span className="min-w-0 truncate text-slate-600">{r.programa}</span>
                <span className="shrink-0 tabular-nums text-slate-500">{brl(r.valor)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="mt-3 text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Info aria-hidden className="h-3 w-3" /> Dado de sistema</span>Fonte: FNDE/SIMAD (liberações por município) + FNDE/PDDE (execução por escola, Plataforma Antonieta de Barros) × Censo Escolar/INEP (matrículas). Sem cartilha; comparação entre pares de SC. Recurso não-emenda.</p>
    </section>
  );
}

export function LacunaCaptacaoSaude({ data, nome }: { data: NonNullable<LacunaSaudeSC>; nome: string }) {
  const { totalRecebido, porHab, medianaPorHab, populacao, abaixoDaMediana, blocosAbaixo, blocos } = data;
  const potencial = blocosAbaixo.reduce((s, b) => s + b.gap, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><HeartPulse aria-hidden className="h-4 w-4 text-rose-600" /> Lacuna de captação — Saúde (recursos que não dependem de emenda)</div>
      <p className="mt-1 text-[12px] text-slate-600">Comparação, a partir das <b>transferências fundo-a-fundo do FNS</b> (2023–2025), do que {nome} recebe <b>por habitante</b> nos blocos <b>por residente</b> (Atenção Primária, Assistência Farmacêutica, Vigilância e Gestão) versus a mediana dos municípios de <b>mesmo porte</b> — o repasse per capita é regressivo, então a comparação é sempre por tamanho. Como boa parte é por <b>desempenho/cobertura</b> (Previne Brasil, PAP), receber pouco por habitante indica <b>captação abaixo do potencial</b>. Média e alta complexidade ficam de fora (dependem de produção e do papel de referência regional). Sinalização neutra — a decisão é do gestor.</p>

      {/* KPIs */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="text-[11px] text-slate-500">FNS por residente (2023–2025)</div>
          <div className="font-display text-xl font-bold tabular-nums text-slate-900">{brl(totalRecebido)}</div>
          <div className="text-[11px] text-slate-500">{populacao > 0 ? `${populacao.toLocaleString("pt-BR")} hab · APS+farmácia+vigil.+gestão` : "—"}</div>
        </div>
        <div className={`rounded-xl border p-3 ${abaixoDaMediana ? "border-amber-300 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/50"}`}>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">{abaixoDaMediana ? <TrendingDown className="h-3.5 w-3.5 text-amber-600" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} R$ por habitante</div>
          <div className={`font-display text-xl font-bold tabular-nums ${abaixoDaMediana ? "text-amber-700" : "text-emerald-700"}`}>{brl(porHab)}</div>
          <div className="text-[11px] text-slate-500">mediana do porte: {brl(medianaPorHab)} {abaixoDaMediana ? "· abaixo" : "· na média ou acima"}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
          <div className="text-[11px] text-slate-500">Potencial estimado na mesa</div>
          <div className="font-display text-xl font-bold tabular-nums text-rose-700">{blocosAbaixo.length > 0 ? brl(potencial) : "—"}</div>
          <div className="text-[11px] text-slate-500">{blocosAbaixo.length} bloco(s) abaixo dos pares</div>
        </div>
      </div>

      {/* Blocos abaixo da mediana */}
      {blocosAbaixo.length > 0 && (
        <div className="mt-3">
          <div className="text-[12px] font-semibold text-slate-800">Blocos do SUS em que {nome} recebe menos por habitante que municípios de mesmo porte</div>
          <div className="mt-1.5 space-y-1">
            {blocosAbaixo.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px]">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{b.bloco}</span>
                <span className="shrink-0 tabular-nums text-slate-500">R$ {b.seuPorHab.toLocaleString("pt-BR")}/hab <span className="text-slate-400">(mediana R$ {b.medianaPorHab.toLocaleString("pt-BR")})</span></span>
                <span className="shrink-0 tabular-nums text-rose-700">≈ <b>{brl(b.gap)}</b> na mesa</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">"Na mesa" = diferença até a mediana dos pares × população (estimativa; depende de produção, cobertura e habilitação de serviços — não é valor garantido).</p>
        </div>
      )}

      {/* Blocos recebidos (contexto) */}
      {blocos.length > 0 && (
        <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/40">
          <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-semibold text-slate-700">O que {nome} recebe do FNS por bloco ({blocos.length})</summary>
          <div className="space-y-0.5 px-3 pb-2">
            {blocos.map((r, i) => (
              <div key={i} className="flex items-center justify-between border-t border-slate-100 pt-0.5 text-[11px]">
                <span className="min-w-0 truncate text-slate-600">{r.bloco}</span>
                <span className="shrink-0 tabular-nums text-slate-500">{brl(r.valor)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="mt-3 text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700"><Info aria-hidden className="h-3 w-3" /> Dado de sistema</span>Fonte: FNS — transferências fundo-a-fundo por bloco (Sala de Apoio à Gestão / DATASUS) × população (IBGE). Sem cartilha; comparação por porte de população (o repasse per capita é regressivo). Recurso não-emenda.</p>
    </section>
  );
}

export function LacunaCaptacaoAssistencia({ data, nome }: { data: NonNullable<LacunaAssistenciaSC>; nome: string }) {
  const { totalRecebido, porFamilia, medianaPorFamilia, cadFamilias, abaixoDaMediana, blocosAbaixo, blocos } = data;
  const potencial = blocosAbaixo.reduce((s, b) => s + b.gap, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><HandHeart aria-hidden className="h-4 w-4 text-amber-600" /> Lacuna de captação — Assistência Social (recursos que não dependem de emenda)</div>
      <p className="mt-1 text-[12px] text-slate-600">Comparação, a partir do <b>cofinanciamento federal do SUAS</b> (FNAS fundo-a-fundo, 2023–2025), do que {nome} recebe <b>por família do CadÚnico</b> em Proteção Social Básica (CRAS/PAIF) e Especial (CREAS) versus a mediana dos municípios de <b>mesmo porte</b>. O SUAS escala com <b>vulnerabilidade</b> — por isso o denominador é famílias do CadÚnico, não população. Receber pouco por família costuma indicar <b>captação abaixo do potencial</b> (adesão a serviços/pisos). Sinalização neutra — a decisão é do gestor.</p>

      {/* KPIs */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="text-[11px] text-slate-500">FNAS recebido (2023–2025)</div>
          <div className="font-display text-xl font-bold tabular-nums text-slate-900">{brl(totalRecebido)}</div>
          <div className="text-[11px] text-slate-500">{cadFamilias > 0 ? `${cadFamilias.toLocaleString("pt-BR")} famílias no CadÚnico` : "—"}</div>
        </div>
        <div className={`rounded-xl border p-3 ${abaixoDaMediana ? "border-amber-300 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/50"}`}>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">{abaixoDaMediana ? <TrendingDown className="h-3.5 w-3.5 text-amber-600" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} R$ por família CadÚnico</div>
          <div className={`font-display text-xl font-bold tabular-nums ${abaixoDaMediana ? "text-amber-700" : "text-emerald-700"}`}>{brl(porFamilia)}</div>
          <div className="text-[11px] text-slate-500">mediana do porte: {brl(medianaPorFamilia)} {abaixoDaMediana ? "· abaixo" : "· na média ou acima"}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <div className="text-[11px] text-slate-500">Potencial estimado na mesa</div>
          <div className="font-display text-xl font-bold tabular-nums text-amber-700">{blocosAbaixo.length > 0 ? brl(potencial) : "—"}</div>
          <div className="text-[11px] text-slate-500">{blocosAbaixo.length} bloco(s) abaixo dos pares</div>
        </div>
      </div>

      {/* Blocos abaixo */}
      {blocosAbaixo.length > 0 && (
        <div className="mt-3">
          <div className="text-[12px] font-semibold text-slate-800">Blocos do SUAS em que {nome} recebe menos por família que municípios de mesmo porte</div>
          <div className="mt-1.5 space-y-1">
            {blocosAbaixo.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px]">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{b.bloco}</span>
                <span className="shrink-0 tabular-nums text-slate-500">R$ {b.seuPorFamilia.toLocaleString("pt-BR")}/fam <span className="text-slate-400">(mediana R$ {b.medianaPorFamilia.toLocaleString("pt-BR")})</span></span>
                <span className="shrink-0 tabular-nums text-amber-700">≈ <b>{brl(b.gap)}</b> na mesa</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">"Na mesa" = diferença até a mediana dos pares × famílias do CadÚnico (estimativa; depende de adesão a serviços, habilitação de CRAS/CREAS e pisos — não é valor garantido).</p>
        </div>
      )}

      {/* Blocos recebidos */}
      {blocos.length > 0 && (
        <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/40">
          <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-semibold text-slate-700">O que {nome} recebe do FNAS por bloco ({blocos.length})</summary>
          <div className="space-y-0.5 px-3 pb-2">
            {blocos.map((r, i) => (
              <div key={i} className="flex items-center justify-between border-t border-slate-100 pt-0.5 text-[11px]">
                <span className="min-w-0 truncate text-slate-600">{r.bloco}</span>
                <span className="shrink-0 tabular-nums text-slate-500">{brl(r.valor)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="mt-3 text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700"><Info aria-hidden className="h-3 w-3" /> Dado de sistema</span>Fonte: FNAS — cofinanciamento fundo-a-fundo (PSB/PSE) × CadÚnico (MDS/MI Social). Sem cartilha; comparação por porte de população. Recurso não-emenda.</p>
    </section>
  );
}
