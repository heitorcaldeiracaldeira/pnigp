"use client";

import { Fragment, useEffect, useState } from "react";
import { Building2, ChevronDown, ChevronRight, Database, Loader2, ShoppingCart, TriangleAlert } from "lucide-react";
import { Donut } from "@/components/charts/donut";
import { LinhasFinanceiras } from "@/components/charts/linhas-financeiras";
import { BaixarCsv } from "@/components/baixar-csv";
import { fmtBRL, fmtBRLCompact, fmtCNPJ, fmtData } from "@/lib/ui";

type Contrato = { objeto: string; modalidade: string; orgao: string; estimado: number; homologado: number; economia_pct: number | null; data: string; cnpj?: string; ano?: number; seq?: number };
type Item = { numero: number; descricao: string; unidade: string; quantidade: number; unitEstimado: number; totalEstimado: number; unitHomologado: number | null; fornecedor: string | null; cnpjFornecedor: string | null; porteFornecedor: string | null; beneficioLC: string | null; economiaPct: number | null; uf?: string | null; municipio?: string | null };
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
  if (competitiva && c.economia_pct != null && c.economia_pct < 1) { motivos.push("Variação agregada ~zero em modalidade competitiva — verificar preço UNITÁRIO dos itens (sobrepreço só se confirma no unitário)"); if (nivel === "ok") nivel = "medio"; }
  if (c.economia_pct != null && c.economia_pct > 40) { motivos.push("Economia muito alta (>40%) — possível superestimativa do valor de referência"); if (nivel === "ok") nivel = "baixo"; }
  return { nivel, motivos };
}

type Andamento = {
  linhas: { modalidade: string; familia: string; n_itens: number; homologado: number; andamento: number; aberto: number; perdido: number; cancelado: number; erros: number }[];
  totais: { n_itens: number; homologado: number; andamento: number; aberto: number; perdido: number; cancelado: number; erros: number };
  problemas: { modalidade: string; item: number; descricao: string; quantidade: number; unitEstimado: number; unitHomologado: number; valor: number; situacao: string; processo: string }[];
  suspeitos: { modalidade: string; processo: string; objeto: string; orgao: string; ano: number; estimado: number; homologado: number }[];
};

export function ComprasSCSection({ codigo, tipo }: { codigo: string; tipo: "M" | "E" }) {
  const [data, setData] = useState<Resp | null | undefined>(undefined);
  const [andamento, setAndamento] = useState<Andamento | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    setData(undefined);
    fetch(`/api/compras-sc/${codigo}`)
      .then((r) => r.json())
      .then((d) => vivo && setData(d))
      .catch(() => vivo && setData(null));
    return () => { vivo = false; };
  }, [codigo]);

  useEffect(() => {
    let vivo = true;
    setAndamento(undefined);
    fetch(`/api/andamento-compras/${codigo}`)
      .then((r) => r.json())
      .then((d) => vivo && setAndamento(d))
      .catch(() => vivo && setAndamento(null));
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
            <div className="ml-auto"><BaixarCsv nome={`compras-evolucao-${codigo}`} label="Evolução (CSV)" colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "n_contratos", rotulo: "Nº contratações" }, { chave: "valor_homologado", rotulo: "Valor contratado" }, { chave: "economia_pct", rotulo: "Variação estim.x homol. (%)" }, { chave: "dispensa_pct", rotulo: "Sem licitação (%)" }]} linhas={serie as unknown as Record<string, unknown>[]} /></div>
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
                <div className="text-xs text-slate-500">Variação estim. × homol. (total)</div>
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
            <ClassificacaoModalidade dados={latest.por_modalidade} ano={ano} />
          )}

          {andamento && andamento.linhas && andamento.linhas.length > 0 && (
            <AndamentoCompras dados={andamento} />
          )}

          {latest.por_modalidade.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-800">Compras por modalidade · {ano}</h3>
              <p className="mb-2 text-xs text-slate-500">Valor contratado por modalidade (PNCP)</p>
              <Donut data={latest.por_modalidade.map((m) => ({ label: m.modalidade, valor: m.valor }))} />
            </section>
          )}

          {latest.top.length > 0 && <TopContratos top={latest.top} ano={ano} />}
        </>
      )}
    </>
  );
}

// Nossa classificação: 13 tipos oficiais do PNCP → 4 famílias (Lei 14.133). Mostra PROCESSOS e VALOR (valor = decisão).
const FAMILIAS: { nome: string; teste: RegExp; cor: string }[] = [
  { nome: "Licitação", teste: /preg|concorr|concurso|di[aá]logo/i, cor: "bg-teal-600" },
  { nome: "Contratação direta", teste: /dispensa|inexig|credenc/i, cor: "bg-amber-500" },
  { nome: "Alienação", teste: /leil/i, cor: "bg-violet-500" },
  { nome: "Procedimento auxiliar", teste: /pr[eé].?qualif|manifesta/i, cor: "bg-slate-400" },
];

function ClassificacaoModalidade({ dados, ano }: { dados: { modalidade: string; n: number; valor: number }[]; ano: number }) {
  const totalN = dados.reduce((s, m) => s + m.n, 0);
  const totalV = dados.reduce((s, m) => s + m.valor, 0);
  if (!totalN) return null;
  const grupos = FAMILIAS
    .map((f) => {
      const itens = dados.filter((m) => f.teste.test(m.modalidade)).sort((a, b) => b.valor - a.valor);
      return { ...f, itens, n: itens.reduce((s, m) => s + m.n, 0), valor: itens.reduce((s, m) => s + m.valor, 0) };
    })
    .filter((g) => g.n > 0)
    .sort((a, b) => b.valor - a.valor);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-slate-800">Classificação dos processos por modalidade · {ano}</h3>
        <span className="text-xs tabular-nums text-slate-500">{totalN.toLocaleString("pt-BR")} processos · <b className="text-slate-700">{fmtBRLCompact(totalV)}</b></span>
      </div>
      <p className="mb-3 text-xs text-slate-500">Tipos oficiais do PNCP agrupados por família (Lei 14.133) — nº de processos e valor contratado</p>
      <div className="space-y-4">
        {grupos.map((g) => (
          <div key={g.nome}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><span className={`h-2.5 w-2.5 rounded-full ${g.cor}`} /> {g.nome}</span>
              <span className="text-xs tabular-nums text-slate-500">{g.n.toLocaleString("pt-BR")} proc · <b className="text-slate-800">{fmtBRLCompact(g.valor)}</b> · {totalV > 0 ? ((g.valor / totalV) * 100).toFixed(1) : "0"}% do valor</span>
            </div>
            <div className="space-y-1">
              {g.itens.map((m) => (
                <div key={m.modalidade} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 truncate text-xs text-slate-600" title={m.modalidade}>{m.modalidade}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full ${g.cor} opacity-80`} style={{ width: `${totalV > 0 ? (m.valor / totalV) * 100 : 0}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{m.n.toLocaleString("pt-BR")}</span>
                  <span className="w-20 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700">{fmtBRLCompact(m.valor)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Andamento: itens × modalidade × STATUS × valor. Barra empilhada por situação; erros p/ controle interno abaixo.
function AndamentoCompras({ dados }: { dados: Andamento }) {
  const { linhas, totais } = dados;
  if (!linhas.length || totais.n_itens === 0) return null;
  const grupos = FAMILIAS
    .map((f) => ({ nome: f.nome, itens: linhas.filter((l) => l.familia === f.nome).sort((a, b) => (b.homologado + b.andamento + b.aberto + b.perdido + b.cancelado) - (a.homologado + a.andamento + a.aberto + a.perdido + a.cancelado)) }))
    .filter((g) => g.itens.length);
  const maxTot = Math.max(...linhas.map((l) => l.homologado + l.andamento + l.aberto + l.perdido + l.cancelado), 1);
  const seg = (v: number, cor: string, t: string) => (v > 0 ? <div key={t} className={cor} style={{ width: `${(v / maxTot) * 100}%` }} title={`${t}: ${fmtBRLCompact(v)}`} /> : null);
  const kpi = [
    { r: "Homologado", a: "comprou · eficácia", v: totais.homologado, c: "text-emerald-600", b: "bg-emerald-500" },
    { r: "Em andamento", a: "na mesa", v: totais.andamento, c: "text-sky-600", b: "bg-sky-400" },
    { r: "Recebendo proposta", a: "agir hoje", v: totais.aberto, c: "text-teal-600", b: "bg-teal-500" },
    { r: "Deserto/Fracassado", a: "retrabalho", v: totais.perdido, c: "text-rose-600", b: "bg-rose-500" },
  ];
  const leg: [string, string][] = [["bg-emerald-500", "Homologado"], ["bg-sky-400", "Em andamento"], ["bg-teal-500", "Recebendo proposta"], ["bg-rose-500", "Deserto/Fracassado"], ["bg-slate-400", "Cancelado"]];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-800">Andamento das compras · modalidade × situação</h3>
      <p className="mb-3 text-xs text-slate-500">{totais.n_itens.toLocaleString("pt-BR")} itens · valor por situação — o andamento vive no <b>item</b> (98% dos processos são só &quot;Divulgada&quot;)</p>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpi.map((k) => (
          <div key={k.r} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><span className={`h-2 w-2 rounded-full ${k.b}`} /> {k.r}</div>
            <div className={`font-display text-lg font-bold tabular-nums ${k.c}`}>{fmtBRLCompact(k.v)}</div>
            <div className="text-[10px] text-slate-400">{k.a}</div>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {grupos.map((g) => (
          <div key={g.nome}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.nome}</div>
            <div className="space-y-1.5">
              {g.itens.map((l) => {
                const tot = l.homologado + l.andamento + l.aberto + l.perdido + l.cancelado;
                return (
                  <div key={l.modalidade} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 truncate text-xs text-slate-600" title={l.modalidade}>{l.modalidade}</span>
                    <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                      {seg(l.homologado, "bg-emerald-500", "Homologado")}{seg(l.andamento, "bg-sky-400", "Em andamento")}{seg(l.aberto, "bg-teal-500", "Recebendo proposta")}{seg(l.perdido, "bg-rose-500", "Deserto/Fracassado")}{seg(l.cancelado, "bg-slate-400", "Cancelado")}
                    </div>
                    <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{l.n_itens.toLocaleString("pt-BR")}</span>
                    <span className="w-20 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700">{fmtBRLCompact(tot)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {leg.map(([c, t]) => (<span key={t} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${c}`} /> {t}</span>))}
      </div>
      {totais.erros > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-start gap-2 text-xs text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span><strong>{totais.erros.toLocaleString("pt-BR")} {totais.erros === 1 ? "item" : "itens"} com valor implausível</strong> (&gt; R$ 100 mi/item — provável erro de digitação): <b>excluídos do valor</b>, contados na quantidade, preservados no dado bruto. <b>Controle interno:</b> revise e corrija na origem.</span>
          </div>
          {dados.problemas.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-amber-200">
              <table className="w-full text-xs">
                <thead className="bg-amber-50 text-amber-900">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Modalidade</th>
                    <th className="p-2 font-medium">Item</th>
                    <th className="p-2 text-right font-medium">Quantidade</th>
                    <th className="p-2 text-right font-medium">Preço unit.</th>
                    <th className="p-2 text-right font-medium">Valor</th>
                    <th className="hidden p-2 font-medium md:table-cell">Processo</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.problemas.map((p, i) => (
                    <tr key={i} className="border-t border-amber-100 align-top">
                      <td className="whitespace-nowrap p-2 text-slate-600">{p.modalidade}</td>
                      <td className="p-2 text-slate-700" title={p.descricao}>{p.descricao.length > 46 ? p.descricao.slice(0, 46) + "…" : p.descricao}</td>
                      <td className="whitespace-nowrap p-2 text-right tabular-nums text-slate-600">{p.quantidade.toLocaleString("pt-BR")}</td>
                      <td className="whitespace-nowrap p-2 text-right tabular-nums text-slate-600">{fmtBRL(Math.max(p.unitEstimado, p.unitHomologado))}</td>
                      <td className="whitespace-nowrap p-2 text-right font-semibold tabular-nums text-rose-700">{fmtBRLCompact(p.valor)}</td>
                      <td className="hidden whitespace-nowrap p-2 font-mono text-[10px] text-slate-400 md:table-cell">{p.processo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {dados.suspeitos && dados.suspeitos.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-start gap-2 text-xs text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span><strong>{dados.suspeitos.length} {dados.suspeitos.length === 1 ? "processo" : "processos"} com valor implausível</strong> (&gt; R$ 1 bi/processo — ex.: dispensa muito acima do teto legal, provável erro de digitação): <b>excluídos do valor</b> das compras, preservados no dado bruto. <b>Controle interno:</b> confira o valor na origem (PNCP).</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-amber-200">
            <table className="w-full text-xs">
              <thead className="bg-amber-50 text-amber-900">
                <tr className="text-left">
                  <th className="p-2 font-medium">Modalidade</th>
                  <th className="p-2 font-medium">Objeto</th>
                  <th className="p-2 text-right font-medium">Ano</th>
                  <th className="p-2 text-right font-medium">Estimado</th>
                  <th className="p-2 text-right font-medium">Homologado</th>
                  <th className="hidden p-2 font-medium md:table-cell">Processo</th>
                </tr>
              </thead>
              <tbody>
                {dados.suspeitos.map((s, i) => (
                  <tr key={i} className="border-t border-amber-100 align-top">
                    <td className="whitespace-nowrap p-2 text-slate-600">{s.modalidade}</td>
                    <td className="p-2 text-slate-700" title={s.objeto}>{s.objeto.length > 46 ? s.objeto.slice(0, 46) + "…" : s.objeto}</td>
                    <td className="whitespace-nowrap p-2 text-right tabular-nums text-slate-600">{s.ano}</td>
                    <td className="whitespace-nowrap p-2 text-right tabular-nums text-slate-600">{fmtBRLCompact(s.estimado)}</td>
                    <td className="whitespace-nowrap p-2 text-right font-semibold tabular-nums text-rose-700">{fmtBRLCompact(s.homologado)}</td>
                    <td className="hidden whitespace-nowrap p-2 font-mono text-[10px] text-slate-400 md:table-cell">{s.processo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function TopContratos({ top, ano }: { top: Contrato[]; ano: number }) {
  const [filtro, setFiltro] = useState("todas");
  const modalidades = Array.from(new Set(top.map((c) => c.modalidade).filter(Boolean)));
  const visiveis = filtro === "todas" ? top : top.filter((c) => c.modalidade === filtro);
  const chip = (val: string, label: string) => (
    <button key={val} onClick={() => setFiltro(val)} className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${filtro === val ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>
  );
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-800">Maiores contratações · {ano}</h3><BaixarCsv nome={`maiores-contratacoes-${ano}`} label="Baixar contratações (CSV)" colunas={[{ chave: "objeto", rotulo: "Objeto" }, { chave: "modalidade", rotulo: "Modalidade" }, { chave: "orgao", rotulo: "Orgao" }, { chave: "data", rotulo: "Data" }, { chave: "estimado", rotulo: "Valor estimado" }, { chave: "homologado", rotulo: "Valor contratado" }, { chave: "economia_pct", rotulo: "Variacao (%)" }, { chave: "cnpj", rotulo: "CNPJ fornecedor" }]} linhas={top as unknown as Record<string, unknown>[]} /></div>
      {modalidades.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 flex items-center gap-1 text-[11px] text-slate-500"><ShoppingCart className="h-3.5 w-3.5" /> Modalidade:</span>
          {chip("todas", "Todas")}
          {modalidades.map((m) => chip(m, m))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="p-2 font-medium">Objeto</th>
              <th className="hidden p-2 font-medium md:table-cell">Modalidade</th>
              <th className="p-2 text-right font-medium">Contratado</th>
              <th className="hidden p-2 text-right font-medium sm:table-cell">Economia (R$)</th>
              <th className="hidden p-2 text-right font-medium sm:table-cell">Economia (%)</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.slice(0, 10).map((c, i) => (
              <ContratoRow key={i} c={c} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Contratações publicadas no PNCP — clique numa linha para ver os <strong>itens do processo</strong>. Capitais podem ter cobertura parcial.</p>
    </section>
  );
}

function ContratoRow({ c }: { c: Contrato }) {
  const [open, setOpen] = useState(false);
  const [itens, setItens] = useState<Item[] | null | undefined>(undefined);
  // apontamentos do TCE DESTE processo — carregados junto do drill-down (mesmo padrão dos itens)
  const [tce, setTce] = useState<TceApont[] | null | undefined>(undefined);
  const [tceCtr, setTceCtr] = useState<TceApontCtr[] | null>(null);   // grão do CONTRATO, por CNPJ do fornecedor
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
    if (novo && tce === undefined) {
      setTce(null);
      fetch(`/api/tce-processo/${c.cnpj}/${c.ano}/${c.seq}`)
        .then((r) => r.json())
        .then((d) => { setTce(Array.isArray(d?.processo) ? d.processo : []); setTceCtr(Array.isArray(d?.contratos) ? d.contratos : []); })
        .catch(() => { setTce([]); setTceCtr([]); });
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
          {c.estimado > 0 && c.homologado > 0 && c.estimado > c.homologado ? <span className="text-emerald-600">{fmtBRLCompact(c.estimado - c.homologado)}</span> : <span className="text-slate-400">—</span>}
        </td>
        <td className="hidden p-2 text-right tabular-nums sm:table-cell">
          {c.economia_pct != null && c.economia_pct > 0 ? <span className="text-emerald-600">{c.economia_pct.toFixed(0)}%</span> : <span className="text-slate-400">—</span>}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={5} className="p-3">
            <TceDoProcesso apont={tce} />
            <ItensDetalhe c={c} itens={itens} tceCtr={tceCtr} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

type TceApontCtr = { ni: string; tipologia: string; documento: string | null; observacao: string | null; confianca: string };
type TceApont = { origem: string; tipologia: string; entidade: string | null; documento: string | null; observacao: string | null; confianca: string; notaVerificacao: string | null };

const TCE_ORIGEM: Record<string, string> = {
  participante: "no participante da licitação",
  contrato: "no contratado",
  processo: "desfecho do processo",
};

// O que o TCE/SC marcou NESTE processo. Aparece dentro da compra que o gestor abriu — é onde o dado vira ação.
function TceDoProcesso({ apont }: { apont: TceApont[] | null | undefined }) {
  if (apont === undefined || (Array.isArray(apont) && apont.length === 0)) return null;
  if (apont === null) return <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500">carregando apontamentos do TCE…</div>;
  // AGRUPA POR TIPOLOGIA: um processo com muitos contratados gera uma linha por contratado × tipologia
  // (263 num caso real). A lista crua vira parede de texto; o gestor quer ver O QUE foi marcado e, só então,
  // em quais empresas. Mesmo padrão de drill dos equipamentos da educação.
  const grupos = new Map<string, { origem: string; tipologia: string; itens: TceApont[] }>();
  for (const a of apont) {
    const k = `${a.origem}|${a.tipologia}`;
    const g = grupos.get(k) || { origem: a.origem, tipologia: a.tipologia, itens: [] };
    g.itens.push(a); grupos.set(k, g);
  }
  const lista = [...grupos.values()].sort((a, b) => b.itens.length - a.itens.length);
  const risco = lista.filter((g) => g.origem !== "processo");
  const desfecho = lista.filter((g) => g.origem === "processo");
  const nota = apont.find((a) => a.confianca !== "confirmado" && a.notaVerificacao)?.notaVerificacao;
  return (
    <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <TriangleAlert className="h-4 w-4 text-amber-600" aria-hidden />
        <h5 className="text-sm font-semibold text-amber-900">O TCE/SC marcou este processo</h5>
        <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
          {lista.length} {lista.length === 1 ? "tipologia" : "tipologias"} · {apont.length} {apont.length === 1 ? "registro" : "registros"}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-amber-800">
        Trilha de auditoria do Tribunal — não é irregularidade comprovada. Apuração e contraditório são etapas seguintes.
      </p>
      <ul className="mt-2 space-y-1">
        {risco.concat(desfecho).map((g) => (
          <li key={`${g.origem}|${g.tipologia}`}>
            <details className="group rounded border border-amber-200 bg-white/70">
              <summary className="flex cursor-pointer list-none items-start gap-2 px-2 py-1.5 text-xs hover:bg-white">
                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 transition group-open:rotate-90" aria-hidden />
                <span className="flex-1 font-medium text-slate-800">{g.tipologia}</span>
                <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-900">
                  {g.itens.length}
                </span>
                <span className="hidden shrink-0 text-[10px] text-slate-500 sm:inline">{TCE_ORIGEM[g.origem] || g.origem}</span>
              </summary>
              <ul className="space-y-1 border-t border-amber-200 px-2 py-1.5">
                {g.itens.slice(0, 20).map((a, i) => (
                  <li key={i} className="text-[11px] text-slate-600">
                    {(a.entidade || a.documento) && (
                      <span className="font-medium text-slate-700">
                        {a.entidade || "Empresa"}{a.documento ? ` · ${fmtCNPJ(a.documento)}` : ""}
                      </span>
                    )}
                    {a.observacao && <span className="block">{a.observacao}</span>}
                  </li>
                ))}
                {g.itens.length > 20 && <li className="text-[11px] text-slate-500">… e mais {g.itens.length - 20} registros</li>}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      {nota && (
        <p className="mt-2 rounded border border-amber-400 bg-white px-2 py-1.5 text-[11px] text-amber-900">
          <strong>Oportunidade de verificação.</strong> {nota}
        </p>
      )}
    </div>
  );
}

type ContratoAssinado = { fornecedor: string; ni: string; valor: number; vigInicio: string | null; vigFim: string | null; assinatura: string | null; objeto: string };

function ItensDetalhe({ c, itens, tceCtr }: { c: Contrato; itens: Item[] | null | undefined; tceCtr?: TceApontCtr[] | null }) {
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
  const fornMap: Record<string, { nome: string; cnpj: string; porte: string; itens: number; valor: number; lc: string | null; uf: string | null; municipio: string | null }> = {};
  for (const it of itens || []) {
    if (!it.fornecedor) continue;
    const k = it.cnpjFornecedor || it.fornecedor;
    (fornMap[k] ??= { nome: it.fornecedor, cnpj: it.cnpjFornecedor || "", porte: it.porteFornecedor || "", itens: 0, valor: 0, lc: null, uf: it.uf ?? null, municipio: it.municipio ?? null });
    fornMap[k].itens++;
    fornMap[k].valor += (it.unitHomologado ?? 0) * it.quantidade;
    if (it.beneficioLC) fornMap[k].lc = it.beneficioLC;
    if (!fornMap[k].porte && it.porteFornecedor) fornMap[k].porte = it.porteFornecedor;
    if (!fornMap[k].uf && it.uf) fornMap[k].uf = it.uf;
    if (!fornMap[k].municipio && it.municipio) fornMap[k].municipio = it.municipio;
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
        (() => {
          const totEstim = itens.reduce((s, it) => s + it.unitEstimado * it.quantidade, 0);
          const totReal = itens.reduce((s, it) => s + (it.unitHomologado ?? it.unitEstimado) * it.quantidade, 0);
          const totEcon = itens.reduce((s, it) => s + (it.unitHomologado != null ? (it.unitEstimado - it.unitHomologado) * it.quantidade : 0), 0);
          const pctEcon = totEstim > 0 ? (totEcon / totEstim) * 100 : 0;
          return (
        <>
          <div className="mb-1 flex items-center justify-between"><div className="text-xs font-semibold text-slate-600">Itens do processo licitatório</div><span className="text-[11px] text-slate-500">{itens.length} itens</span></div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th rowSpan={2} className="p-2 text-left align-bottom font-medium">Item</th>
              <th rowSpan={2} className="hidden p-2 text-left align-bottom font-medium md:table-cell">Fornecedor vencedor</th>
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
              <tr key={it.numero} className="border-b border-slate-50 align-top last:border-0">
                <td className="p-2 text-slate-700">
                  <span className="line-clamp-2">{it.descricao} <span className="text-slate-400">({it.unidade})</span></span>
                  {it.beneficioLC && <span className="mt-0.5 inline-block rounded bg-teal-100 px-1 py-0.5 text-[10px] font-semibold text-teal-700">LC 123: {it.beneficioLC}</span>}
                </td>
                <td className="hidden p-2 text-slate-500 md:table-cell">{it.fornecedor || "—"}</td>
                <td className="p-2 text-right tabular-nums text-slate-500">{it.quantidade.toLocaleString("pt-BR")}</td>
                <td className="border-l border-slate-100 p-2 text-right tabular-nums text-slate-500">{fmtBRL(it.unitEstimado)}</td>
                <td className="p-2 text-right tabular-nums font-medium text-slate-800">{it.unitHomologado != null ? fmtBRL(it.unitHomologado) : "—"}</td>
                <td className="border-l border-slate-100 p-2 text-right tabular-nums text-slate-700">{fmtBRL((it.unitHomologado ?? it.unitEstimado) * it.quantidade)}</td>
                <td className="border-l border-slate-100 p-2 text-right tabular-nums text-emerald-700">{it.unitHomologado != null && it.unitEstimado - it.unitHomologado > 0 ? fmtBRL((it.unitEstimado - it.unitHomologado) * it.quantidade) : <span className="text-slate-400">—</span>}</td>
                <td className="p-2 text-right tabular-nums">{it.economiaPct != null && it.economiaPct > 0 ? <span className="text-emerald-600">−{it.economiaPct.toFixed(0)}%</span> : <span className="text-slate-400">—</span>}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
              <td className="p-2" colSpan={5}>Total do processo</td>
              <td className="border-l border-slate-200 p-2 text-right tabular-nums">{fmtBRLCompact(totReal)}</td>
              <td className="border-l border-slate-200 p-2 text-right tabular-nums text-emerald-700">{totEcon > 0 ? fmtBRLCompact(totEcon) : "—"}</td>
              <td className="p-2 text-right tabular-nums text-emerald-700">{totEcon > 0 ? `−${pctEcon.toFixed(1)}%` : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
          <p className="mt-1 text-[10px] text-slate-400">Economia = (unitário estimado − homologado) × quantidade. Estimado: preço de referência do edital · Homologado: preço do vencedor. Fonte: PNCP (itens e resultados).</p>
        </>
          );
        })()
      )}

      {/* #3 Fornecedores consolidados do processo */}
      {fornecedores.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-600">Fornecedores vencedores</div>
          {fornecedores.some((f) => f.lc) && <p className="mb-2 text-[10px] text-slate-400">LC 123/2006 — tratamento diferenciado a ME/EPP nas licitações.</p>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fornecedores.slice(0, 6).map((f) => (
              <div key={f.cnpj || f.nome} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-1 text-xs font-semibold text-slate-800"><Building2 className="h-3 w-3 shrink-0 text-slate-400" /><span className="line-clamp-1">{f.nome}</span></span>
                  {f.porte && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${porteCor(f.porte)}`} title={f.porte}>{porteSigla(f.porte)}</span>}
                </div>
                <dl className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
                  {f.cnpj && <div className="flex justify-between gap-2"><dt>CNPJ</dt><dd className="tabular-nums text-slate-700">{fmtCNPJ(f.cnpj)}</dd></div>}
                  {(f.municipio || f.uf) && <div className="flex justify-between gap-2"><dt>Localidade</dt><dd className="text-right text-slate-700">{[f.municipio, f.uf].filter(Boolean).join(" · ")}</dd></div>}
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
                {contratos.map((ct, i) => {
                  // apontamentos do TCE DESTE contratado — casados no grão do contrato, não do processo
                  const ap = (tceCtr || []).filter((a) => a.ni && ct.ni && a.ni.replace(/\D/g, "") === ct.ni.replace(/\D/g, ""));
                  return (
                  <tr key={i} className={`border-t border-slate-100 align-top ${ap.length ? "bg-amber-50/50" : ""}`}>
                    <td className="p-1 text-slate-700">
                      <span className="line-clamp-1">{ct.fornecedor}</span>
                      {ap.length > 0 && (
                        <details className="mt-1 rounded border border-amber-300 bg-white/70">
                          <summary className="flex cursor-pointer list-none items-center gap-1 px-1.5 py-1 text-[10px] font-semibold text-amber-900">
                            <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
                            TCE marcou este contratado · {ap.length} {ap.length === 1 ? "tipologia" : "tipologias"}
                          </summary>
                          <ul className="space-y-1 border-t border-amber-200 px-2 py-1.5">
                            {ap.map((a, j) => (
                              <li key={j} className="text-[10px] text-slate-600">
                                <span className="font-medium text-slate-800">{a.tipologia}</span>
                                {a.confianca !== "confirmado" && <span className="ml-1 rounded bg-amber-200 px-1 text-[9px] font-semibold text-amber-900">conferir</span>}
                                {a.observacao && <span className="block">{a.observacao}</span>}
                              </li>
                            ))}
                          </ul>
                          <p className="border-t border-amber-200 px-2 py-1 text-[9px] text-amber-800">
                            Trilha de auditoria do TCE/SC — não é irregularidade comprovada.
                          </p>
                        </details>
                      )}
                    </td>
                    <td className="hidden p-1 tabular-nums text-slate-500 sm:table-cell">{fmtCNPJ(ct.ni)}</td>
                    <td className="p-1 text-right font-semibold tabular-nums text-slate-800">{fmtBRLCompact(ct.valor)}</td>
                    <td className="hidden p-1 text-slate-500 md:table-cell">{fmtData(ct.vigInicio)}{ct.vigFim ? ` → ${fmtData(ct.vigFim)}` : ""}</td>
                    <td className="hidden p-1 text-slate-500 lg:table-cell">{ct.assinatura || "—"}</td>
                  </tr>
                  );
                })}
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
