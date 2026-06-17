import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand";
import { PrintButton } from "@/components/print-button";
import type { Achado, AchadoTipo, AreaScore, Oportunidade, Parecer } from "@/lib/audit";
import type { Insight, Severidade } from "@/lib/insights";
import { analisarRiscosCompras } from "@/lib/compras-risco";
import { resumoFornecedores } from "@/lib/contratacao-detalhe";
import { despesaFuncaoArvore, unidadesOrcamentarias } from "@/lib/orcamento";
import type { Compras, Contratacao, Financas, Meta } from "@/lib/queries";
import type { SimResult } from "@/lib/simulate";
import { classifyIndex, fmtPop, fmtValor } from "@/lib/ui";

function brlCompact(v: number): string {
  if (v >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi`;
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function progressoMeta(m: Meta): number {
  const total = m.direcao_melhor === "alta" ? m.valor_alvo - m.valor_base : m.valor_base - m.valor_alvo;
  const feito = m.direcao_melhor === "alta" ? m.valor_atual - m.valor_base : m.valor_base - m.valor_atual;
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, (feito / total) * 100));
}

const SEV: Record<Severidade, { label: string; cor: string }> = {
  critico: { label: "Crítico", cor: "#e11d48" },
  atencao: { label: "Atenção", cor: "#f59e0b" },
  oportunidade: { label: "Oportunidade", cor: "#0ea5e9" },
  destaque: { label: "Destaque", cor: "#10b981" },
};

const TIP: Record<AchadoTipo, { label: string; cor: string }> = {
  risco: { label: "Risco", cor: "#e11d48" },
  ressalva: { label: "Ressalva", cor: "#f59e0b" },
  recomendacao: { label: "Recomendação", cor: "#0ea5e9" },
  boa_pratica: { label: "Boa prática", cor: "#10b981" },
};

const PARECER_COR: Record<Parecer["tom"], string> = {
  ok: "#10b981",
  ressalva: "#f59e0b",
  critico: "#e11d48",
};

const AREA_COR: Record<AreaScore["classe"], string> = {
  acima: "#10b981",
  media: "#f59e0b",
  abaixo: "#e11d48",
};

export type RelatorioProps = {
  tipo: "Município" | "Estado";
  voltarHref: string;
  nome: string;
  uf: string;
  regiao: string;
  gestorLabel: string;
  gestor: string | null;
  populacao: number;
  indices: { iceb: number; invp: number; igp360: number };
  posicao?: number;
  total: number;
  insights: Insight[];
  auditoria: { parecer: Parecer; areas: AreaScore[]; achados: Achado[]; oportunidades: Oportunidade[] };
  metas: Meta[];
  plano: { itens: { label: string; rs: number; ganho: number }[]; sim: SimResult; posAtual: number };
  financas: Financas | null;
  compras: Compras | null;
  contratacoes: Contratacao[];
  seed: string;
  dataGeracao: string;
};

const NIVEL_RISCO_LABEL: Record<string, string> = { alto: "ALTO", medio: "MÉDIO", baixo: "BAIXO" };
const NIVEL_RISCO_COR: Record<string, string> = { alto: "#be123c", medio: "#b45309", baixo: "#0369a1" };

export function Relatorio(props: RelatorioProps) {
  const { indices, auditoria } = props;
  const fin = props.financas;
  const resultadoFin = fin ? fin.receita_total - fin.despesa_total : 0;
  const receitaOrigem = fin
    ? [
        { label: "Receita própria (tributos)", v: fin.rec_tributaria },
        { label: "Transferências", v: fin.rec_transferencias },
        { label: "Outras", v: fin.rec_outras },
      ]
    : [];
  const unidades = fin ? unidadesOrcamentarias(fin, props.seed).slice(0, 6) : [];
  const funcExec = fin ? despesaFuncaoArvore(fin, props.seed) : [];
  const riscosCompras = analisarRiscosCompras(props.compras, props.contratacoes);
  const topContratos = props.contratacoes.slice(0, 6);
  const totalContratadoPdf = props.contratacoes.reduce((s, c) => s + c.valor_contratado, 0);
  const totalEstimadoPdf = props.contratacoes.reduce((s, c) => s + c.valor_estimado, 0);
  const economiaPdf = totalEstimadoPdf - totalContratadoPdf;
  const economiaPctPdf = totalEstimadoPdf > 0 ? (economiaPdf / totalEstimadoPdf) * 100 : 0;
  const fornPdf = resumoFornecedores(props.contratacoes, props.seed);
  const localLabelPdf = props.tipo === "Estado" ? "do estado" : "do município";
  const despesaFuncao = fin
    ? [
        { label: "Saúde", v: fin.func_saude },
        { label: "Educação", v: fin.func_educacao },
        { label: "Segurança", v: fin.func_seguranca },
        { label: "Assistência social", v: fin.func_assistencia },
        { label: "Infraestrutura", v: fin.func_infraestrutura },
        { label: "Administração", v: fin.func_administracao },
      ].sort((a, b) => b.v - a.v)
    : [];
  const indicesArr = [
    { sigla: "IGP 360", nome: "Índice Integrado de Gestão Pública", valor: indices.igp360 },
    { sigla: "ICEB", nome: "Capacidade Estatal Brasileira", valor: indices.iceb },
    { sigla: "INVP", nome: "Índice Nacional de Valor Público", valor: indices.invp },
  ];

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      {/* Barra de ações (não imprime) */}
      <div className="no-print mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4">
        <Link href={props.voltarHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao painel
        </Link>
        <PrintButton />
      </div>

      {/* Documento A4 */}
      <article className="print-page mx-auto max-w-[820px] bg-white p-10 shadow-lg">
        {/* Cabeçalho */}
        <header className="flex items-start justify-between border-b-2 border-teal-700 pb-4">
          <div className="flex items-center gap-3">
            <Logo className="h-11 w-11" />
            <div>
              <div className="font-display text-lg font-bold tracking-tight text-slate-900">PNIGP</div>
              <div className="text-xs text-slate-500">Plataforma Nacional de Inteligência da Gestão Pública</div>
              <div className="text-xs text-slate-500">Instituto I10</div>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>Relatório Executivo de Gestão</div>
            <div>Emitido em {props.dataGeracao}</div>
            <div>Exercício 2024</div>
          </div>
        </header>

        {/* Identificação */}
        <section className="mt-5">
          <h1 className="text-2xl font-bold text-slate-900">
            {props.nome} <span className="text-base font-semibold text-slate-500">— {props.uf}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {props.tipo} · {props.regiao} · {fmtPop(props.populacao)} · {props.gestorLabel}:{" "}
            <strong className="text-slate-700">{props.gestor}</strong>
          </p>
        </section>

        {/* Índices */}
        <section className="mt-6 break-avoid">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-teal-700">Índices PNIGP</h2>
          <div className="grid grid-cols-3 gap-3">
            {indicesArr.map((m) => {
              const c = classifyIndex(m.valor);
              return (
                <div key={m.sigla} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800">{m.sigla}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold text-white ${c.color}`}>
                      {c.label}
                    </span>
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{m.valor.toFixed(1)}<span className="text-sm text-slate-500">/100</span></div>
                  <div className="text-[11px] text-slate-500">{m.nome}</div>
                </div>
              );
            })}
          </div>
          {props.posicao && (
            <p className="mt-2 text-sm text-slate-600">
              Posição no ranking nacional: <strong>{props.posicao}º de {props.total}</strong> ·{" "}
              Parecer da auditoria:{" "}
              <strong style={{ color: PARECER_COR[auditoria.parecer.tom] }}>{auditoria.parecer.rotulo}</strong>
            </p>
          )}
        </section>

        {/* Diagnóstico */}
        <section className="mt-6 break-avoid">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-teal-700">
            Síntese do diagnóstico — o que os dados revelam
          </h2>
          <div className="space-y-2">
            {props.insights.map((i) => (
              <div key={i.id} className="break-avoid rounded border border-slate-200 p-2.5" style={{ borderLeft: `4px solid ${SEV[i.severidade].cor}` }}>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase" style={{ color: SEV[i.severidade].cor }}>
                    {SEV[i.severidade].label}
                  </span>
                  <span className="text-sm font-semibold text-slate-800">{i.titulo}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{i.detalhe}</p>
                {i.acao && <p className="mt-1 text-xs text-slate-600">→ {i.acao}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* Auditoria — desempenho por área */}
        <section className="mt-6 break-avoid">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-teal-700">
            Visão do auditor — desempenho por área
          </h2>
          <div className="space-y-1.5">
            {auditoria.areas.map((a) => (
              <div key={a.area} className="flex items-center gap-3">
                <span className="w-28 text-xs text-slate-600">{a.label}</span>
                <div className="relative h-2 flex-1 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full" style={{ width: `${a.score}%`, backgroundColor: AREA_COR[a.classe] }} />
                  <div className="absolute inset-y-0 left-1/2 w-px bg-slate-400" />
                </div>
                <span className="w-10 text-right text-xs tabular-nums text-slate-500">{a.score}</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Referência: 50 = média dos pares.</p>
        </section>

        {/* Achados */}
        <section className="mt-6 break-avoid">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-teal-700">Achados e recomendações</h2>
          <div className="space-y-2">
            {auditoria.achados.map((a) => (
              <div key={a.id} className="break-avoid rounded border border-slate-200 p-2.5" style={{ borderLeft: `4px solid ${TIP[a.tipo].cor}` }}>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase" style={{ color: TIP[a.tipo].cor }}>{TIP[a.tipo].label}</span>
                  <span className="text-sm font-semibold text-slate-800">{a.titulo}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{a.fundamentacao}</p>
                <p className="mt-1 text-xs text-slate-700"><strong>Recomendação:</strong> {a.recomendacao}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Oportunidades */}
        {auditoria.oportunidades.length > 0 && (
          <section className="mt-6 break-avoid">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-teal-700">Onde focar para o cidadão</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              {auditoria.oportunidades.map((o) => (
                <li key={o.area}>
                  <strong>{o.label}</strong> — maior alavanca de valor público (+{o.ganho} pts até os pares); beneficia ~{fmtPop(o.habitantes)}.
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Finanças — receitas e despesas */}
        {fin && (
          <section className="mt-6 break-avoid">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-teal-700">
              Finanças — receitas e despesas
            </h2>
            <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded border border-slate-200 px-2.5 py-1.5">
                Receita: <strong>{brlCompact(fin.receita_total)}</strong>
              </div>
              <div className="rounded border border-slate-200 px-2.5 py-1.5">
                Despesa: <strong>{brlCompact(fin.despesa_total)}</strong>
              </div>
              <div className="rounded border border-slate-200 px-2.5 py-1.5">
                Resultado:{" "}
                <strong style={{ color: resultadoFin >= 0 ? "#047857" : "#be123c" }}>
                  {brlCompact(resultadoFin)} ({resultadoFin >= 0 ? "superávit" : "déficit"})
                </strong>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="mb-1 font-semibold text-slate-700">De onde vem o dinheiro</div>
                <ul className="space-y-0.5 text-slate-600">
                  {receitaOrigem.map((o) => (
                    <li key={o.label} className="flex justify-between">
                      <span>{o.label}</span>
                      <span className="tabular-nums">{brlCompact(o.v)} · {((o.v / fin.receita_total) * 100).toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 font-semibold text-slate-700">Para onde vai (principais áreas)</div>
                <ul className="space-y-0.5 text-slate-600">
                  {despesaFuncao.slice(0, 5).map((o) => (
                    <li key={o.label} className="flex justify-between">
                      <span>{o.label}</span>
                      <span className="tabular-nums">{brlCompact(o.v)} · {((o.v / fin.despesa_total) * 100).toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {unidades.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-slate-700">Execução por órgão (principais)</div>
                <table className="w-full text-[11px]">
                  <tbody>
                    {unidades.map((u) => (
                      <tr key={u.nome} className="border-t border-slate-100">
                        <td className="py-0.5 text-slate-600">{u.nome}</td>
                        <td className="py-0.5 text-right tabular-nums text-slate-500">{brlCompact(u.orcado)}</td>
                        <td className="py-0.5 text-right tabular-nums text-slate-700">{brlCompact(u.executado)}</td>
                        <td className="py-0.5 text-right tabular-nums text-slate-500">{u.execucao.toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {funcExec.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-slate-700">Orçado × executado por função</div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-1 font-medium">Função</th>
                      <th className="py-1 text-right font-medium">Orçado</th>
                      <th className="py-1 text-right font-medium">Executado</th>
                      <th className="py-1 text-right font-medium">% exec.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funcExec.map((n) => (
                      <tr key={n.nome} className="border-b border-slate-100">
                        <td className="py-0.5 text-slate-700">{n.nome}</td>
                        <td className="py-0.5 text-right tabular-nums text-slate-500">{brlCompact(n.previsto)}</td>
                        <td className="py-0.5 text-right tabular-nums text-slate-700">{brlCompact(n.realizado)}</td>
                        <td className="py-0.5 text-right tabular-nums text-slate-500">{n.pct.toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Compras públicas — contratações e riscos */}
        {props.compras && props.contratacoes.length > 0 && (
          <section className="mt-6 break-avoid">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-teal-700">
              Compras públicas — contratações e riscos
            </h2>
            <div className="mb-2 grid grid-cols-4 gap-2 text-xs">
              <div className="rounded border border-slate-200 px-2 py-1.5">Estimado (orçado)<br /><strong>{brlCompact(totalEstimadoPdf)}</strong></div>
              <div className="rounded border border-slate-200 px-2 py-1.5">Contratado (adquirido)<br /><strong>{brlCompact(totalContratadoPdf)}</strong></div>
              <div className="rounded border border-slate-200 px-2 py-1.5">Economia<br /><strong className="text-emerald-700">{brlCompact(economiaPdf)} · {economiaPctPdf.toFixed(1)}%</strong></div>
              <div className="rounded border border-slate-200 px-2 py-1.5">Transparência PNCP<br /><strong>{props.compras.transparencia_pncp.toFixed(0)}%</strong></div>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-slate-200 px-2 py-1.5">Fornecedores {localLabelPdf}<br /><strong>{brlCompact(fornPdf.local.valor)}</strong> <span className="text-slate-500">· {fornPdf.local.qtd} contratos</span></div>
              <div className="rounded border border-slate-200 px-2 py-1.5">Fornecedores de fora<br /><strong>{brlCompact(fornPdf.fora.valor)}</strong> <span className="text-slate-500">· {fornPdf.fora.qtd} contratos</span></div>
            </div>

            <div className="mb-1 text-xs font-semibold text-slate-700">Principais contratações</div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-1 font-medium">Objeto</th>
                  <th className="py-1 font-medium">Modalidade</th>
                  <th className="py-1 text-right font-medium">Contratado</th>
                  <th className="py-1 text-right font-medium">Economia</th>
                </tr>
              </thead>
              <tbody>
                {topContratos.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-0.5 text-slate-700">{c.objeto}</td>
                    <td className="py-0.5 text-slate-500">{c.modalidade}</td>
                    <td className="py-0.5 text-right tabular-nums text-slate-700">{brlCompact(c.valor_contratado)}</td>
                    <td className="py-0.5 text-right tabular-nums text-emerald-700">{c.economia_pct > 0 ? `−${c.economia_pct.toFixed(0)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {riscosCompras.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-slate-700">Riscos identificados (metodologia TCU)</div>
                <ul className="space-y-1 text-xs text-slate-600">
                  {riscosCompras.map((r) => (
                    <li key={r.id}>
                      <span className="font-semibold" style={{ color: NIVEL_RISCO_COR[r.nivel] }}>[{NIVEL_RISCO_LABEL[r.nivel]}]</span>{" "}
                      <strong>{r.titulo}.</strong> {r.detalhe} <span className="text-slate-500">({r.ref})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Plano de investimento recomendado (simulador) */}
        {props.plano.itens.length > 0 && (
          <section className="mt-6 break-avoid">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-teal-700">
              Plano de investimento recomendado
            </h2>
            <p className="mb-2 text-xs text-slate-500">
              Simulação com foco nas áreas finalísticas de menor desempenho (retornos decrescentes):
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <ul className="space-y-1 text-sm text-slate-700">
                  {props.plano.itens.map((it) => (
                    <li key={it.label} className="flex items-center justify-between rounded border border-slate-200 px-2.5 py-1.5">
                      <span>{it.label}</span>
                      <span className="tabular-nums">
                        <strong>R$ {it.rs}/hab</strong>
                        <span className="ml-2 text-xs font-semibold text-emerald-600">+{it.ganho.toFixed(0)} pts</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 rounded border border-slate-200 px-2.5 py-1.5 text-sm">
                  Investimento total estimado: <strong>{brlCompact(props.plano.sim.totalInvest)}</strong>
                </div>
              </div>
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm">
                <div className="mb-1 font-semibold text-teal-800">Impacto projetado</div>
                <div className="flex justify-between"><span>IGP 360</span><span className="tabular-nums">{props.indices.igp360.toFixed(1)} → <strong>{props.plano.sim.igp360.toFixed(1)}</strong> <span className="text-emerald-600">(+{props.plano.sim.dIgp.toFixed(1)})</span></span></div>
                <div className="flex justify-between"><span>INVP</span><span className="tabular-nums">{props.indices.invp.toFixed(1)} → <strong>{props.plano.sim.invp.toFixed(1)}</strong></span></div>
                <div className="flex justify-between"><span>Ranking</span><span className="tabular-nums">{props.plano.posAtual}º → <strong>{props.plano.sim.novaPos}º</strong> de {props.total}</span></div>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Projeção didática — não é previsão; apoia a priorização.</p>
          </section>
        )}

        {/* Metas */}
        {props.metas.length > 0 && (
          <section className="mt-6 break-avoid">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-teal-700">Metas da gestão · 2025</h2>
            <div className="space-y-1.5">
              {props.metas.map((m) => {
                const p = progressoMeta(m);
                return (
                  <div key={m.codigo} className="flex items-center gap-3">
                    <span className="w-44 truncate text-xs text-slate-600">{m.nome}</span>
                    <div className="relative h-2 flex-1 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-teal-600" style={{ width: `${p}%` }} />
                    </div>
                    <span className="w-36 text-right text-xs tabular-nums text-slate-500">
                      {fmtValor(m.valor_atual, m.unidade)} → {fmtValor(m.valor_alvo, m.unidade)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Rodapé */}
        <footer className="mt-8 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500">
          Documento gerado automaticamente pela PNIGP — Plataforma Nacional de Inteligência da Gestão Pública (Instituto I10).
          Análise inspirada em metodologias de controle externo; não substitui auditoria oficial. Dados simulados para demonstração.
        </footer>
      </article>
    </div>
  );
}
