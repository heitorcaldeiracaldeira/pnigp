"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert, ShoppingCart } from "lucide-react";
import { ComprasRiscos } from "@/components/compras-riscos";
import { analisarRiscosCompras, fornecedorConcentrado, riscoContratacao, type NivelContrato, type RiscoContrato } from "@/lib/compras-risco";
import { empenhosDoContrato, fornecedoresDoProcesso, itensDoContrato } from "@/lib/contratacao-detalhe";
import type { Compras, Contratacao } from "@/lib/queries";
import { fmtBRL, fmtBRLCompact, fmtValor } from "@/lib/ui";

const MOD_COR: Record<string, string> = {
  "Pregão Eletrônico": "bg-emerald-100 text-emerald-700",
  Concorrência: "bg-sky-100 text-sky-700",
  "Pregão Presencial": "bg-teal-100 text-teal-700",
  Dispensa: "bg-amber-100 text-amber-700",
  Inexigibilidade: "bg-rose-100 text-rose-700",
};
const SIT_COR: Record<string, string> = {
  Homologado: "bg-emerald-100 text-emerald-700",
  "Em andamento": "bg-sky-100 text-sky-700",
  Deserto: "bg-slate-100 text-slate-600",
  Cancelado: "bg-rose-100 text-rose-700",
};
const RISCO_META: Record<NivelContrato, { label: string; dot: string; txt: string }> = {
  alto: { label: "Alto", dot: "bg-rose-500", txt: "text-rose-700" },
  medio: { label: "Médio", dot: "bg-amber-500", txt: "text-amber-700" },
  baixo: { label: "Baixo", dot: "bg-sky-500", txt: "text-sky-700" },
  ok: { label: "OK", dot: "bg-emerald-500", txt: "text-emerald-600" },
};

function KpiTile({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{valor}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function ComprasPanel({
  compras,
  contratacoes,
}: {
  compras: Compras | null;
  contratacoes: Contratacao[];
}) {
  const modalidades = Array.from(new Set(contratacoes.map((c) => c.modalidade)));
  const [filtro, setFiltro] = useState<string>("todas");
  const [aberto, setAberto] = useState<number | null>(null);
  const visiveis = filtro === "todas" ? contratacoes : contratacoes.filter((c) => c.modalidade === filtro);

  const totalContratado = contratacoes.reduce((s, c) => s + c.valor_contratado, 0);
  const totalEstimado = contratacoes.reduce((s, c) => s + c.valor_estimado, 0);
  const economiaPct = totalEstimado > 0 ? ((totalEstimado - totalContratado) / totalEstimado) * 100 : 0;
  const riscos = analisarRiscosCompras(compras, contratacoes);
  const ctxRisco = { fornecedorConcentrado: fornecedorConcentrado(contratacoes) };

  const chip = (val: string, label: string) => (
    <button
      key={val}
      onClick={() => setFiltro(val)}
      className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
        filtro === val ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Riscos (TCU) — protagonista */}
      <ComprasRiscos riscos={riscos} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile label="Total contratado (amostra)" valor={fmtBRLCompact(totalContratado)} sub={`${contratacoes.length} contratos`} />
        <KpiTile label="Economia obtida" valor={`${economiaPct.toFixed(1)}%`} sub={fmtBRLCompact(totalEstimado - totalContratado)} />
        {compras && <KpiTile label="Pregão eletrônico" valor={fmtValor(compras.pct_pregao_eletronico, "%")} sub="das compras" />}
        {compras && <KpiTile label="Transparência (PNCP)" valor={fmtValor(compras.transparencia_pncp, "%")} sub="contratos publicados" />}
      </div>

      {/* Filtro por modalidade */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 flex items-center gap-1 text-xs text-slate-500">
          <ShoppingCart className="h-3.5 w-3.5" /> Modalidade:
        </span>
        {chip("todas", "Todas")}
        {modalidades.map((m) => chip(m, m))}
      </div>

      {/* Tabela de contratações (desktop) */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="p-3 font-medium">Objeto</th>
              <th className="hidden p-3 font-medium md:table-cell">Órgão</th>
              <th className="p-3 font-medium">Modalidade</th>
              <th className="p-3 font-medium">Risco</th>
              <th className="p-3 text-right font-medium">Contratado</th>
              <th className="hidden p-3 text-right font-medium sm:table-cell">Economia</th>
              <th className="hidden p-3 font-medium lg:table-cell">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((c) => {
              const open = aberto === c.id;
              const risco = riscoContratacao(c, ctxRisco);
              const rm = RISCO_META[risco.nivel];
              return (
                <Fragment key={c.id}>
                  <tr className={`border-b border-slate-100 align-top transition-colors hover:bg-slate-50/70 ${open ? "bg-slate-50/70" : ""}`}>
                    <td className="p-3">
                      <button
                        onClick={() => setAberto(open ? null : c.id)}
                        aria-expanded={open}
                        className="flex items-start gap-1.5 text-left transition hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                      >
                        {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
                        <span>
                          <span className="font-medium text-slate-800">{c.objeto}</span>
                          <span className="block text-xs text-slate-500">{c.numero} · {c.fornecedor} · {c.data}</span>
                        </span>
                      </button>
                    </td>
                    <td className="hidden p-3 text-sm text-slate-500 md:table-cell">{c.orgao}</td>
                    <td className="p-3">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${MOD_COR[c.modalidade] ?? "bg-slate-100 text-slate-600"}`}>
                        {c.modalidade}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${rm.txt}`}
                        title={risco.motivos.length ? risco.motivos.join(" · ") : "Sem apontamentos"}
                      >
                        <span className={`h-2 w-2 rounded-full ${rm.dot}`} />
                        {rm.label}
                      </span>
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums text-slate-800">{fmtBRLCompact(c.valor_contratado)}</td>
                    <td className="hidden p-3 text-right tabular-nums sm:table-cell">
                      {c.economia_pct > 0 ? <span className="text-emerald-600">−{c.economia_pct.toFixed(1)}%</span> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="hidden p-3 lg:table-cell">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SIT_COR[c.situacao] ?? "bg-slate-100 text-slate-600"}`}>
                        {c.situacao}
                      </span>
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <td colSpan={7} className="p-4">
                        <DetalheContrato contrato={c} risco={risco} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards de contratações (mobile) */}
      <div className="space-y-2 md:hidden">
        {visiveis.map((c) => {
          const open = aberto === c.id;
          const risco = riscoContratacao(c, ctxRisco);
          const rm = RISCO_META[risco.nivel];
          return (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => setAberto(open ? null : c.id)}
                aria-expanded={open}
                className="flex w-full items-start gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800">{c.objeto}</div>
                  <div className="text-xs text-slate-500">{c.numero} · {c.fornecedor}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${MOD_COR[c.modalidade] ?? "bg-slate-100 text-slate-600"}`}>{c.modalidade}</span>
                    <span className={`inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium ${rm.txt}`}>
                      <span className={`h-2 w-2 rounded-full ${rm.dot}`} /> Risco {rm.label.toLowerCase()}
                    </span>
                    {c.economia_pct > 0 && <span className="text-[11px] font-medium text-emerald-600">−{c.economia_pct.toFixed(0)}%</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums text-slate-800">{fmtBRLCompact(c.valor_contratado)}</div>
                  <div className="text-[11px] text-slate-500">{c.situacao}</div>
                </div>
              </button>
              {open && (
                <div className="border-t border-slate-100 bg-slate-50/60 p-3">
                  <DetalheContrato contrato={c} risco={risco} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-500">
        Fonte: PNCP / Portal de Compras · amostra de contratações de 2024 · dados simulados para demonstração
      </p>
    </div>
  );
}

function DetalheContrato({ contrato, risco }: { contrato: Contratacao; risco: RiscoContrato }) {
  const rm = RISCO_META[risco.nivel];
  const itens = itensDoContrato(contrato);
  const empenhos = empenhosDoContrato(contrato);
  const totalEmpenhado = empenhos.reduce((s, e) => s + e.empenhado, 0);
  const totalPago = empenhos.reduce((s, e) => s + e.pago, 0);

  const fornecedores = fornecedoresDoProcesso(itens);
  const totEstim = itens.reduce((s, it) => s + it.valorUnitarioEstimado * it.quantidade, 0);
  const totReal = itens.reduce((s, it) => s + it.valorTotal, 0);
  const totEcon = itens.reduce((s, it) => s + it.economiaValor, 0);
  const pctEcon = totEstim > 0 ? (totEcon / totEstim) * 100 : 0;

  const porteCor = (s: string) =>
    s === "ME" ? "bg-emerald-100 text-emerald-700" : s === "EPP" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600";

  return (
    <div className="space-y-5">
      {/* Análise de risco do processo (TCU) */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-700">Análise de risco do processo</h4>
          <span className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold ${rm.txt}`}>
            <span className={`h-2 w-2 rounded-full ${rm.dot}`} /> Risco {rm.label.toLowerCase()}
          </span>
        </div>
        {risco.motivos.length ? (
          <ul className="ml-1 space-y-0.5 text-xs text-slate-600">
            {risco.motivos.map((m) => (
              <li key={m} className="flex gap-1.5">
                <span className="text-slate-400">•</span> {m}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">Nenhum apontamento de risco identificado neste processo.</p>
        )}
      </div>

      {/* Itens do processo licitatório */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700">Itens do processo licitatório</h4>
          <span className="text-xs text-slate-500">{itens.length} itens</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[680px] text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th rowSpan={2} className="p-2 text-left align-bottom font-medium">Item</th>
                <th rowSpan={2} className="p-2 text-left align-bottom font-medium">Fornecedor vencedor</th>
                <th rowSpan={2} className="p-2 text-right align-bottom font-medium">Qtd.</th>
                <th colSpan={2} className="border-l border-slate-200 p-2 text-center font-medium">Valor unitário (R$)</th>
                <th rowSpan={2} className="border-l border-slate-200 p-2 text-right align-bottom font-medium">Valor total</th>
                <th colSpan={2} className="border-l border-slate-200 p-2 text-center font-medium">Economia</th>
              </tr>
              <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                <th className="border-l border-slate-200 p-2 text-right font-medium">Estimado</th>
                <th className="p-2 text-right font-medium">Homologado</th>
                <th className="border-l border-slate-200 p-2 text-right font-medium">em R$</th>
                <th className="p-2 text-right font-medium">em %</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it) => (
                <tr key={it.descricao} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 text-slate-700">
                    {it.descricao} <span className="text-slate-500">({it.unidade})</span>
                  </td>
                  <td className="p-2 text-slate-500">{it.fornecedor}</td>
                  <td className="p-2 text-right tabular-nums text-slate-500">{it.quantidade.toLocaleString("pt-BR")}</td>
                  <td className="border-l border-slate-100 p-2 text-right tabular-nums text-slate-500">{fmtBRL(it.valorUnitarioEstimado)}</td>
                  <td className="p-2 text-right font-medium tabular-nums text-slate-800">{fmtBRL(it.valorUnitarioHomologado)}</td>
                  <td className="border-l border-slate-100 p-2 text-right tabular-nums text-slate-700">{fmtBRL(it.valorTotal)}</td>
                  <td className="border-l border-slate-100 p-2 text-right tabular-nums text-emerald-700">
                    {it.economiaValor > 0 ? fmtBRL(it.economiaValor) : "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums text-emerald-600">
                    {it.economiaItem > 0 ? `−${it.economiaItem.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <td className="p-2" colSpan={5}>Total do processo</td>
                <td className="border-l border-slate-200 p-2 text-right tabular-nums">{fmtBRL(totReal)}</td>
                <td className="border-l border-slate-200 p-2 text-right tabular-nums text-emerald-700">{fmtBRL(totEcon)}</td>
                <td className="p-2 text-right tabular-nums text-emerald-700">−{pctEcon.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Economia = (valor unitário estimado − homologado) × quantidade. Estimado: preço de referência do edital · Homologado: preço do vencedor.
        </p>
      </div>

      {/* Fornecedores do processo */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700">Fornecedores vencedores</h4>
        <p className="mb-2 text-[11px] text-slate-500">
          LC 123/2006 — Estatuto da Microempresa e da Empresa de Pequeno Porte: concede tratamento
          diferenciado a ME/EPP nas licitações.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fornecedores.map((f) => (
            <div key={f.nome} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800">{f.nome}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${porteCor(f.porteSigla)}`} title={f.porteLabel}>
                  {f.porteSigla}
                </span>
              </div>
              <dl className="mt-2 space-y-0.5 text-xs text-slate-500">
                <div className="flex justify-between gap-2">
                  <dt>CNPJ</dt>
                  <dd className="tabular-nums text-slate-700">{f.cnpj}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Município/UF</dt>
                  <dd className="text-slate-700">{f.cidade}/{f.uf}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Porte fiscal</dt>
                  <dd className="text-slate-700">{f.porteLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>LC 123/2006</dt>
                  <dd className={f.beneficiarioLC123 ? "font-semibold text-emerald-700" : "text-slate-500"}>
                    {f.beneficiarioLC123 ? "Beneficiário ✓" : "Não beneficiário"}
                  </dd>
                </div>
                {f.beneficiarioLC123 && (
                  <div className="rounded bg-emerald-50 px-1.5 py-1 text-[11px] leading-snug text-emerald-700">
                    Benefício: {f.beneficioLC}
                  </div>
                )}
                <div className="flex justify-between gap-2 border-t border-slate-100 pt-1">
                  <dt>Contratado</dt>
                  <dd className="font-semibold text-slate-800">{fmtBRLCompact(f.valorGanho)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>

      {/* Empenhos e pagamentos */}
      <div className="max-w-2xl">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Empenhos e pagamentos</h4>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="p-2 font-medium">Nº do empenho</th>
                <th className="p-2 font-medium">Data</th>
                <th className="p-2 text-right font-medium">Empenhado</th>
                <th className="p-2 text-right font-medium">Pago</th>
                <th className="p-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {empenhos.map((e) => (
                <tr key={e.numero} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 tabular-nums text-slate-700">{e.numero}</td>
                  <td className="p-2 tabular-nums text-slate-500">{e.data}</td>
                  <td className="p-2 text-right tabular-nums text-slate-600">{fmtBRL(e.empenhado)}</td>
                  <td className="p-2 text-right tabular-nums text-emerald-700">{fmtBRL(e.pago)}</td>
                  <td className="p-2 text-right tabular-nums text-slate-500">{fmtBRL(e.empenhado - e.pago)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <td className="p-2" colSpan={2}>Total</td>
                <td className="p-2 text-right tabular-nums">{fmtBRL(totalEmpenhado)}</td>
                <td className="p-2 text-right tabular-nums text-emerald-700">{fmtBRL(totalPago)}</td>
                <td className="p-2 text-right tabular-nums">{fmtBRL(totalEmpenhado - totalPago)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Fornecedor principal: <strong className="text-slate-600">{contrato.fornecedor}</strong> · Executado: {totalEmpenhado > 0 ? ((totalPago / totalEmpenhado) * 100).toFixed(0) : 0}% do empenhado.
        </p>
      </div>
    </div>
  );
}
