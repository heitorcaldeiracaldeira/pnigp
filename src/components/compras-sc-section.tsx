"use client";

import { Fragment, useEffect, useState } from "react";
import { Building2, ChevronDown, ChevronRight, Database, Loader2, ShoppingCart, TriangleAlert } from "lucide-react";
import { Donut } from "@/components/charts/donut";
import { LinhasFinanceiras } from "@/components/charts/linhas-financeiras";
import { fmtBRL, fmtBRLCompact } from "@/lib/ui";

type Contrato = { objeto: string; modalidade: string; orgao: string; estimado: number; homologado: number; economia_pct: number | null; data: string; cnpj?: string; ano?: number; seq?: number };
type Item = { numero: number; descricao: string; unidade: string; quantidade: number; unitEstimado: number; totalEstimado: number; unitHomologado: number | null; fornecedor: string | null; cnpjFornecedor: string | null; porteFornecedor: string | null; beneficioLC: string | null; economiaPct: number | null };
type Compras = {
  n_contratos: number; valor_estimado: number; valor_homologado: number; economia_pct: number; dispensa_pct: number;
  por_modalidade: { modalidade: string; n: number; valor: number }[];
  top: Contrato[];
};
type Ano = { ano: number; n_contratos: number; valor_homologado: number; economia_pct: number; dispensa_pct: number };
type Resp = { latest: Compras | null; serie: Ano[] };

type Nivel = "alto" | "medio" | "baixo" | "ok";
const RISCO_META: Record<Nivel, { label: string; dot: string; txt: string; chip: string }> = {
  alto: { label: "Alto", dot: "bg-rose-500", txt: "text-rose-700", chip: "bg-rose-100 text-rose-700" },
  medio: { label: "Médio", dot: "bg-amber-500", txt: "text-amber-700", chip: "bg-amber-100 text-amber-700" },
  baixo: { label: "Baixo", dot: "bg-sky-500", txt: "text-sky-700", chip: "bg-sky-100 text-sky-700" },
  ok: { label: "OK", dot: "bg-emerald-500", txt: "text-emerald-600", chip: "bg-emerald-100 text-emerald-700" },
};
function riscoContrato(c: Contrato): { nivel: Nivel; motivos: string[] } {
  const motivos: string[] = [];
  let nivel: Nivel = "ok";
  const direta = /dispensa|inexig/i.test(c.modalidade);
  const competitiva = /preg|concorr|leil/i.test(c.modalidade);
  if (direta) { motivos.push("Contratação direta (sem licitação)"); nivel = c.homologado >= 1_000_000 ? "alto" : "medio"; }
  if (competitiva && c.economia_pct != null && c.economia_pct < 1) { motivos.push("Economia próxima de zero em modalidade competitiva — possível sobrepreço"); if (nivel === "ok") nivel = "medio"; }
  if (c.economia_pct != null && c.economia_pct > 40) { motivos.push("Economia muito alta (>40%) — possível superestimativa do valor de referência"); if (nivel === "ok") nivel = "baixo"; }
  return { nivel, motivos };
}

export function ComprasSCSection({ codigo, tipo }: { codigo: string; tipo: "M" | "E" }) {
  const [data, setData] = useState<Resp | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    setData(undefined);
    fetch(`/api/compras-sc/${codigo}`)
      .then((r) => r.json())
      .then((d) => vivo && setData(d))
      .catch(() => vivo && setData(null));
    return () => { vivo = false; };
  }, [codigo]);

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
        Carregando compras públicas do PNCP… (primeira consulta pode levar alguns segundos)
      </div>
    );
  }
  const latest = data?.latest ?? null;
  const serie = data?.serie ?? [];
  if ((!latest || latest.n_contratos === 0) && serie.length === 0) return null;
  const ano = serie.length ? serie[serie.length - 1].ano : 2024;

  return (
    <>
      {/* Evolução das compras (quando há ≥ 2 anos) */}
      {serie.length >= 2 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-orange-600" />
            <h3 className="font-semibold text-slate-800">Evolução das compras ({serie[0].ano}–{serie[serie.length - 1].ano})</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              <Database className="h-3 w-3" /> PNCP
            </span>
          </div>
          <p className="mb-2 text-xs text-slate-500">Valor contratado por exercício{serie.some((s) => s.ano >= 2026) ? " · 2026 é parcial (ano corrente)" : ""}</p>
          <LinhasFinanceiras
            data={serie as unknown as Record<string, number>[]}
            linhas={[{ key: "valor_homologado", label: "Valor contratado", cor: "#ea580c" }]}
            altura={230}
          />
        </section>
      )}

      {/* Detalhe do último ano */}
      {latest && latest.n_contratos > 0 && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-orange-600" />
              <h3 className="font-semibold text-slate-800">Compras públicas · PNCP {ano}{ano >= 2026 ? " (parcial)" : ""}</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                <Database className="h-3 w-3" /> Dados oficiais
              </span>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Contratações no Portal Nacional de Contratações Públicas — esfera {tipo === "E" ? "estadual" : "municipal"}.
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Valor contratado</div>
                <div className="font-display text-xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(latest.valor_homologado)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Contratações</div>
                <div className="font-display text-xl font-bold tabular-nums text-slate-900">{latest.n_contratos.toLocaleString("pt-BR")}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Economia (estimado × homologado)</div>
                <div className="font-display text-xl font-bold tabular-nums text-emerald-600">{latest.economia_pct.toFixed(1)}%</div>
              </div>
              <div className={`rounded-xl border p-3 ${latest.dispensa_pct >= 40 ? "border-rose-200 bg-rose-50" : latest.dispensa_pct >= 25 ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}>
                <div className="text-xs text-slate-500">Sem licitação (dispensa/inexig.)</div>
                <div className={`font-display text-xl font-bold tabular-nums ${latest.dispensa_pct >= 40 ? "text-rose-700" : latest.dispensa_pct >= 25 ? "text-amber-700" : "text-slate-900"}`}>{latest.dispensa_pct.toFixed(1)}%</div>
              </div>
            </div>
            {latest.dispensa_pct >= 25 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span><strong>Ponto de atenção (TCU):</strong> {latest.dispensa_pct.toFixed(0)}% do valor contratado foi por dispensa/inexigibilidade — possível fuga à licitação.</span>
              </div>
            )}
          </div>

          {latest.por_modalidade.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-800">Compras por modalidade · {ano}</h3>
              <p className="mb-2 text-xs text-slate-500">Valor contratado por modalidade (PNCP)</p>
              <Donut data={latest.por_modalidade.map((m) => ({ label: m.modalidade, valor: m.valor }))} />
            </section>
          )}

          {latest.top.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-slate-800">Maiores contratações · {ano}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="p-2 font-medium">Objeto</th>
                      <th className="hidden p-2 font-medium md:table-cell">Modalidade</th>
                      <th className="p-2 text-right font-medium">Contratado</th>
                      <th className="hidden p-2 text-right font-medium sm:table-cell">Economia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.top.slice(0, 10).map((c, i) => (
                      <ContratoRow key={i} c={c} />
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">Contratações publicadas no PNCP — clique numa linha para ver os <strong>itens do processo</strong>. Capitais podem ter cobertura parcial.</p>
            </section>
          )}
        </>
      )}
    </>
  );
}

function ContratoRow({ c }: { c: Contrato }) {
  const [open, setOpen] = useState(false);
  const [itens, setItens] = useState<Item[] | null | undefined>(undefined);
  const podeDrill = !!(c.cnpj && c.ano && c.seq);
  function toggle() {
    if (!podeDrill) return;
    const novo = !open;
    setOpen(novo);
    if (novo && itens === undefined) {
      setItens(null);
      fetch(`/api/compras-item/${c.cnpj}/${c.ano}/${c.seq}`)
        .then((r) => r.json())
        .then((d) => setItens(Array.isArray(d) ? d : []))
        .catch(() => setItens([]));
    }
  }
  const risco = riscoContrato(c);
  const rm = RISCO_META[risco.nivel];
  return (
    <Fragment>
      <tr className={`border-b border-slate-100 align-top ${open ? "bg-slate-50/70" : ""}`}>
        <td className="p-2 text-slate-700">
          {podeDrill ? (
            <button onClick={toggle} aria-expanded={open} className="flex items-start gap-1.5 text-left transition hover:text-teal-700">
              {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
              <span>
                <span className="line-clamp-2">{c.objeto}</span>
                {risco.nivel !== "ok" && (
                  <span className={`mt-0.5 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold ${rm.chip}`} title={risco.motivos.join(" · ")}>
                    <span className={`h-1.5 w-1.5 rounded-full ${rm.dot}`} /> Risco {rm.label.toLowerCase()}
                  </span>
                )}
              </span>
            </button>
          ) : (
            <span className="line-clamp-2 pl-[22px]">{c.objeto}</span>
          )}
        </td>
        <td className="hidden p-2 text-slate-500 md:table-cell">{c.modalidade}</td>
        <td className="p-2 text-right font-semibold tabular-nums text-slate-800">{fmtBRLCompact(c.homologado)}</td>
        <td className="hidden p-2 text-right tabular-nums sm:table-cell">
          {c.economia_pct != null && c.economia_pct > 0 ? <span className="text-emerald-600">−{c.economia_pct.toFixed(0)}%</span> : <span className="text-slate-400">—</span>}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={4} className="p-3">
            <ItensDetalhe c={c} itens={itens} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

type ContratoAssinado = { fornecedor: string; ni: string; valor: number; vigInicio: string | null; vigFim: string | null; assinatura: string | null; objeto: string };

function ItensDetalhe({ c, itens }: { c: Contrato; itens: Item[] | null | undefined }) {
  const risco = riscoContrato(c);
  const rm = RISCO_META[risco.nivel];
  const [contratos, setContratos] = useState<ContratoAssinado[] | null>(null);
  useEffect(() => {
    if (!(c.cnpj && c.ano && c.seq)) return;
    let v = true;
    fetch(`/api/contratos-processo/${c.cnpj}/${c.ano}/${c.seq}`)
      .then((r) => r.json())
      .then((d) => v && setContratos(Array.isArray(d) ? d : []))
      .catch(() => v && setContratos([]));
    return () => { v = false; };
  }, [c.cnpj, c.ano, c.seq]);
  // fornecedores consolidados a partir dos itens (nome, CNPJ, porte, LC123, valor)
  const fornMap: Record<string, { nome: string; cnpj: string; porte: string; itens: number; valor: number; lc: string | null }> = {};
  for (const it of itens || []) {
    if (!it.fornecedor) continue;
    const k = it.cnpjFornecedor || it.fornecedor;
    (fornMap[k] ??= { nome: it.fornecedor, cnpj: it.cnpjFornecedor || "", porte: it.porteFornecedor || "", itens: 0, valor: 0, lc: null });
    fornMap[k].itens++;
    fornMap[k].valor += (it.unitHomologado ?? 0) * it.quantidade;
    if (it.beneficioLC) fornMap[k].lc = it.beneficioLC;
    if (!fornMap[k].porte && it.porteFornecedor) fornMap[k].porte = it.porteFornecedor;
  }
  const fornecedores = Object.values(fornMap).sort((a, b) => b.valor - a.valor);
  const porteSigla = (p: string) => /micro\s*empresa|^me\b/i.test(p) ? "ME" : /pequeno|epp/i.test(p) ? "EPP" : /m[eé]dia/i.test(p) ? "Média" : /grande|demais/i.test(p) ? "Grande" : (p || "—");
  const porteCor = (p: string) => { const s = porteSigla(p); return s === "ME" ? "bg-emerald-100 text-emerald-700" : s === "EPP" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"; };

  return (
    <div className="space-y-3">
      {/* #1 Análise de risco do processo */}
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          Análise de risco (TCU)
          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${rm.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${rm.dot}`} /> Risco {rm.label.toLowerCase()}
          </span>
        </div>
        {risco.motivos.length ? (
          <ul className="ml-1 space-y-0.5 text-[11px] text-slate-600">{risco.motivos.map((m) => <li key={m} className="flex gap-1"><span className="text-slate-300">•</span> {m}</li>)}</ul>
        ) : <p className="text-[11px] text-slate-500">Sem apontamentos de risco neste processo.</p>}
      </div>

      {itens === null ? (
        <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" /> Carregando itens do processo (PNCP)…</div>
      ) : !itens || itens.length === 0 ? (
        <p className="text-xs text-slate-500">Sem itens detalhados disponíveis no PNCP para este processo.</p>
      ) : (
        <>
          <div className="mb-1 text-xs font-semibold text-slate-600">Itens do processo licitatório</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-1 font-medium">Item</th>
              <th className="p-1 text-right font-medium">Qtd</th>
              <th className="p-1 text-right font-medium">Unit. estimado</th>
              <th className="p-1 text-right font-medium">Unit. homologado</th>
              <th className="hidden p-1 font-medium md:table-cell">Fornecedor vencedor</th>
              <th className="p-1 text-right font-medium">Economia</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => (
              <tr key={it.numero} className="border-t border-slate-100 align-top">
                <td className="p-1 text-slate-700">
                  <span className="line-clamp-2">{it.descricao}</span>
                  {it.beneficioLC && <span className="mt-0.5 inline-block rounded bg-teal-100 px-1 py-0.5 text-[10px] font-semibold text-teal-700">LC 123: {it.beneficioLC}</span>}
                </td>
                <td className="p-1 text-right tabular-nums text-slate-600">{it.quantidade.toLocaleString("pt-BR")} {it.unidade}</td>
                <td className="p-1 text-right tabular-nums text-slate-500">{fmtBRL(it.unitEstimado)}</td>
                <td className="p-1 text-right tabular-nums text-slate-800">{it.unitHomologado != null ? fmtBRL(it.unitHomologado) : "—"}</td>
                <td className="hidden p-1 text-slate-600 md:table-cell">{it.fornecedor || "—"}</td>
                <td className="p-1 text-right tabular-nums">{it.economiaPct != null && it.economiaPct > 0 ? <span className="text-emerald-600">−{it.economiaPct.toFixed(0)}%</span> : <span className="text-slate-400">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
          <p className="mt-1 text-[10px] text-slate-400">Fonte: PNCP (itens e resultados). Valor unitário homologado e fornecedor exibidos quando já publicados.</p>
        </>
      )}

      {/* #3 Fornecedores consolidados do processo */}
      {fornecedores.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-600">Fornecedores vencedores</div>
          <p className="mb-2 text-[10px] text-slate-400">LC 123/2006 — tratamento diferenciado a ME/EPP nas licitações.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fornecedores.slice(0, 6).map((f) => (
              <div key={f.cnpj || f.nome} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-1 text-xs font-semibold text-slate-800"><Building2 className="h-3 w-3 shrink-0 text-slate-400" /><span className="line-clamp-1">{f.nome}</span></span>
                  {f.porte && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${porteCor(f.porte)}`} title={f.porte}>{porteSigla(f.porte)}</span>}
                </div>
                <dl className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
                  {f.cnpj && <div className="flex justify-between gap-2"><dt>CNPJ</dt><dd className="tabular-nums text-slate-700">{f.cnpj}</dd></div>}
                  <div className="flex justify-between gap-2"><dt>Itens vencidos</dt><dd className="text-slate-700">{f.itens}</dd></div>
                  <div className="flex justify-between gap-2 border-t border-slate-100 pt-1"><dt>Contratado</dt><dd className="font-semibold text-slate-800">{fmtBRLCompact(f.valor)}</dd></div>
                  {f.lc && <div className="rounded bg-emerald-50 px-1.5 py-1 text-[10px] leading-snug text-emerald-700">LC 123: {f.lc}</div>}
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contratos assinados gerados deste processo (conexão PNCP) */}
      {contratos && contratos.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-600">Contratos assinados gerados deste processo</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="p-1 font-medium">Fornecedor</th>
                  <th className="hidden p-1 font-medium sm:table-cell">CNPJ</th>
                  <th className="p-1 text-right font-medium">Valor global</th>
                  <th className="hidden p-1 font-medium md:table-cell">Vigência</th>
                  <th className="hidden p-1 font-medium lg:table-cell">Assinatura</th>
                </tr>
              </thead>
              <tbody>
                {contratos.map((ct, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="p-1 text-slate-700"><span className="line-clamp-1">{ct.fornecedor}</span></td>
                    <td className="hidden p-1 tabular-nums text-slate-500 sm:table-cell">{ct.ni}</td>
                    <td className="p-1 text-right font-semibold tabular-nums text-slate-800">{fmtBRLCompact(ct.valor)}</td>
                    <td className="hidden p-1 text-slate-500 md:table-cell">{ct.vigInicio || "—"}{ct.vigFim ? ` → ${ct.vigFim}` : ""}</td>
                    <td className="hidden p-1 text-slate-500 lg:table-cell">{ct.assinatura || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Contratos do PNCP vinculados a este processo (numeroControlePncpCompra). Fonte: PNCP /contratos.</p>
        </div>
      )}

      {/* #2 Empenhos — não disponível no PNCP */}
      <p className="text-[10px] text-slate-400">Empenhos/pagamentos não são publicados no PNCP. A execução orçamentária (empenhado/pago) fica no <strong>sistema próprio de cada ente</strong> — cada município e estado tem o seu (o SIAFI é federal) — e é consolidada no SICONFI e nos portais de transparência/TCE.</p>
    </div>
  );
}
