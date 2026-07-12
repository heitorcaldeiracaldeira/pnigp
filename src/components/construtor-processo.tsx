"use client";
// Construtor de Processo Licitatório (Lei 14.133/2021) — o ciclo completo sobre uma CESTA DE ITENS compartilhada.
// O gestor monta a cesta (cada item com CATMAT + preço de referência do Banco de Preços + especificação checada contra
// superespecificação), preenche os dados gerais uma única vez e gera qualquer um dos 5 artefatos encadeados:
//   DFD → ETP → TR → Edital → Contrato. Os documentos reaproveitam os mesmos dados (fim do retrabalho entre fases).
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Search, AlertTriangle, ShieldCheck, Printer, Info, Plus, Trash2, Package } from "lucide-react";
import {
  type DadosProcesso, type ItemProcesso, type TipoObjeto, ARTEFATOS, novoItem, valorItem, valorTotal,
  alertasCesta, aberturaCesta, gerarArtefato, prontoPara, TIPO_OBJETO_LABEL, fmtBRL,
} from "@/lib/processo-licitatorio";
import { recomendarModalidade } from "@/lib/tr-modelo";

type Preco = { item: string; unidade: string | null; mediana: number; n: number; nMunis: number | null; fonte: string; catmat: string | null };

export function ConstrutorProcesso({ nome }: { nome: string }) {
  const [dados, setDados] = useState<DadosProcesso>({
    orgao: "", responsavel: "", tipo: "bem_comum", necessidade: "", prazoEntrega: "", local: "", dotacao: "", prioridade: "", itens: [],
  });
  const set = <K extends keyof DadosProcesso>(k: K, v: DadosProcesso[K]) => setDados((d) => ({ ...d, [k]: v }));

  // busca de preço → adiciona item à cesta
  const [busca, setBusca] = useState("");
  const [precos, setPrecos] = useState<Preco[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = busca.trim();
    timer.current = setTimeout(async () => {
      if (q.length < 2) { setPrecos([]); return; }
      try {
        const r = await fetch("/api/banco-precos?q=" + encodeURIComponent(q));
        const j = await r.json();
        setPrecos((j.resultados || []).slice(0, 6));
      } catch { setPrecos([]); }
    }, q.length < 2 ? 0 : 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [busca]);

  function addDoPreco(p: Preco) {
    const it = novoItem();
    it.descricao = p.item; it.catmat = p.catmat; it.unidade = p.unidade || "unidade"; it.precoUnit = p.mediana; it.fonte = p.fonte; it.quantidade = 1;
    setDados((d) => ({ ...d, itens: [...d.itens, it] }));
    setBusca(""); setPrecos([]);
  }
  const addVazio = () => setDados((d) => ({ ...d, itens: [...d.itens, novoItem()] }));
  const updItem = (id: string, patch: Partial<ItemProcesso>) => setDados((d) => ({ ...d, itens: d.itens.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const delItem = (id: string) => setDados((d) => ({ ...d, itens: d.itens.filter((i) => i.id !== id) }));

  const total = useMemo(() => valorTotal(dados.itens), [dados.itens]);
  const alertas = useMemo(() => alertasCesta(dados.itens), [dados.itens]);
  const abertura = useMemo(() => aberturaCesta(dados.itens), [dados.itens]);
  const rec = useMemo(() => recomendarModalidade(dados.tipo, total), [dados.tipo, total]);
  const aberturaCor = abertura >= 80 ? "#059669" : abertura >= 50 ? "#d97706" : "#dc2626";

  function gerar(id: (typeof ARTEFATOS)[number]["id"]) {
    const html = gerarArtefato(id, dados, nome);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-teal-700"><FileText className="h-4 w-4" /> Construtor de Processo Licitatório</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">novo</span>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">Monte a <b>cesta de itens</b> (com CATMAT e preço de referência do Banco de Preços), preencha os dados uma vez e gere o processo de ponta a ponta conforme a Lei 14.133/2021: <b>DFD → ETP → TR → Edital → Contrato</b>. Um checador evita a superespecificação — a redação restritiva é o que <b>fecha a disputa e encarece</b>.</p>

      {/* ── DADOS GERAIS ── */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] font-medium text-slate-600">Secretaria / setor demandante
          <input value={dados.orgao} onChange={(e) => set("orgao", e.target.value)} placeholder="Ex.: Secretaria Municipal de Saúde" className={inputCls} />
        </label>
        <label className="text-[12px] font-medium text-slate-600">Natureza do objeto
          <select value={dados.tipo} onChange={(e) => set("tipo", e.target.value as TipoObjeto)} className={inputCls}>
            {(Object.keys(TIPO_OBJETO_LABEL) as TipoObjeto[]).map((t) => <option key={t} value={t}>{TIPO_OBJETO_LABEL[t]}</option>)}
          </select>
        </label>
      </div>

      {/* ── CESTA DE ITENS ── */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700"><Package className="h-3.5 w-3.5 text-teal-600" /> Cesta de itens {dados.itens.length > 0 && <span className="text-slate-400">({dados.itens.length})</span>}</div>
          {total > 0 && <span className="rounded-full bg-teal-700 px-2.5 py-0.5 text-[12px] font-bold text-white">Total estimado: {fmtBRL(total)}</span>}
        </div>

        {/* busca de preço */}
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item no Banco de Preços (ex.: caneta, dipirona, pneu)…" className="w-full bg-transparent text-sm outline-none" />
          <button onClick={addVazio} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"><Plus className="h-3 w-3" /> item em branco</button>
        </div>
        {precos.length > 0 && (
          <div className="mt-2 space-y-1">
            {precos.map((p, i) => (
              <button key={i} onClick={() => addDoPreco(p)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 text-left transition hover:border-teal-400 hover:bg-teal-50">
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600">{p.item}{p.catmat ? <span className="ml-1 text-[9px] text-slate-400">CATMAT {p.catmat}</span> : null}</span>
                <span className="shrink-0 text-[12px] font-bold tabular-nums text-teal-700">{fmtBRL(p.mediana)}<span className="ml-0.5 text-[9px] font-normal text-slate-400">/{p.unidade || "un"}</span></span>
                <Plus className="h-3.5 w-3.5 shrink-0 text-teal-600" />
              </button>
            ))}
          </div>
        )}

        {/* itens da cesta */}
        {dados.itens.length === 0
          ? <p className="mt-3 text-center text-[11px] text-slate-400">Busque um item acima para adicionar com preço de referência, ou inclua um item em branco.</p>
          : <div className="mt-3 space-y-2">
              {dados.itens.map((it, idx) => {
                const al = alertasCesta([it]);
                return (
                  <div key={it.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 text-[11px] font-bold text-slate-400">{idx + 1}</span>
                      <div className="flex-1 space-y-2">
                        <input value={it.descricao} onChange={(e) => updItem(it.id, { descricao: e.target.value })} placeholder="Descrição do item" className="w-full rounded border border-slate-200 px-2 py-1 text-[13px] font-medium text-slate-700 outline-none focus:border-teal-500" />
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          {it.catmat && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">CATMAT {it.catmat}</span>}
                          <label className="flex items-center gap-1">Qtd.<input type="number" min={0} value={it.quantidade || ""} onChange={(e) => updItem(it.id, { quantidade: Number(e.target.value) || 0 })} className="w-20 rounded border border-slate-300 px-2 py-0.5 text-right" /></label>
                          <label className="flex items-center gap-1">Unid.<input value={it.unidade} onChange={(e) => updItem(it.id, { unidade: e.target.value })} className="w-20 rounded border border-slate-300 px-2 py-0.5" /></label>
                          <label className="flex items-center gap-1">R$ unit.<input type="number" min={0} step="0.01" value={it.precoUnit || ""} onChange={(e) => updItem(it.id, { precoUnit: Number(e.target.value) || 0 })} className="w-24 rounded border border-slate-300 px-2 py-0.5 text-right" /></label>
                          {valorItem(it) > 0 && <span className="font-semibold text-teal-700">= {fmtBRL(valorItem(it))}</span>}
                        </div>
                        <textarea value={it.espec} onChange={(e) => updItem(it.id, { espec: e.target.value })} rows={2} placeholder="Especificação técnica (por desempenho/função; evite marca, modelo, “primeira linha”)…" className="w-full rounded border border-slate-200 px-2 py-1 text-[12px] outline-none focus:border-teal-500" />
                        {al.map((a, i) => (
                          <div key={i} className={`flex items-start gap-1.5 rounded px-2 py-1 text-[10.5px] ${a.severidade === "alto" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span><b>“{a.termo}”</b> — {a.motivo} <i>{a.sugestao}</i></span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => delItem(it.id)} className="mt-1 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500" title="Remover item"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>}

        {/* abertura à concorrência da cesta */}
        {alertas.length >= 0 && dados.itens.some((i) => i.espec.trim().length > 2) && (
          <div className="mt-3 flex items-center gap-2 text-[11px]">
            <span className="font-semibold text-slate-600">Abertura à concorrência:</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full transition-all" style={{ width: abertura + "%", background: aberturaCor }} /></div>
            <span className="font-bold tabular-nums" style={{ color: aberturaCor }}>{abertura}/100</span>
          </div>
        )}
      </div>

      {/* ── DADOS COMPLEMENTARES ── */}
      <div className="mt-4">
        <label className="text-[12px] font-medium text-slate-600">Fundamentação da necessidade (problema público a atender)
          <textarea value={dados.necessidade} onChange={(e) => set("necessidade", e.target.value)} rows={2} placeholder="Por que a Administração precisa contratar — usado no DFD, ETP e TR." className={inputCls} />
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] font-medium text-slate-600">Prazo de entrega / execução
          <input value={dados.prazoEntrega} onChange={(e) => set("prazoEntrega", e.target.value)} placeholder="Ex.: 30 dias corridos" className={inputCls} />
        </label>
        <label className="text-[12px] font-medium text-slate-600">Local de entrega
          <input value={dados.local} onChange={(e) => set("local", e.target.value)} placeholder="Ex.: Almoxarifado central" className={inputCls} />
        </label>
        <label className="text-[12px] font-medium text-slate-600">Dotação orçamentária / fonte
          <input value={dados.dotacao} onChange={(e) => set("dotacao", e.target.value)} placeholder="Ex.: 10.301.0002.2015 — Fonte 500" className={inputCls} />
        </label>
        <label className="text-[12px] font-medium text-slate-600">Responsável pela demanda
          <input value={dados.responsavel} onChange={(e) => set("responsavel", e.target.value)} placeholder="Nome e cargo" className={inputCls} />
        </label>
      </div>

      {/* ── RECOMENDAÇÃO DE MODALIDADE ── */}
      <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-[12px]">
        <div className="flex items-center gap-1.5 font-semibold text-indigo-700"><Info className="h-3.5 w-3.5" /> Modalidade e critério recomendados {total > 0 && <span className="font-normal text-slate-500">· base: {fmtBRL(total)}</span>}</div>
        <div className="mt-1 text-slate-700"><b>{rec.modalidade}</b> — critério: {rec.criterio}.</div>
        <div className="mt-0.5 text-slate-500">{rec.justificativa} <span className="text-slate-400">({rec.base})</span></div>
        {rec.avisos.map((av, i) => <div key={i} className="mt-1 text-[11px] text-amber-700">⚠ {av}</div>)}
      </div>

      {/* ── GERAÇÃO DOS ARTEFATOS ── */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-700"><FileText className="h-3.5 w-3.5 text-teal-600" /> Gerar documentos do processo</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ARTEFATOS.map((a, i) => {
            const pr = prontoPara(a.id, dados);
            return (
              <div key={a.id} className={`flex flex-col rounded-xl border p-3 ${pr.ok ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50/60"}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${a.fase === "interna" ? "bg-teal-100 text-teal-700" : "bg-indigo-100 text-indigo-700"}`}>{i + 1}</span>
                  <span className="text-[12px] font-semibold text-slate-700">{a.sigla}</span>
                  <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-medium ${a.fase === "interna" ? "bg-teal-50 text-teal-600" : "bg-indigo-50 text-indigo-600"}`}>fase {a.fase}</span>
                </div>
                <div className="mt-1 text-[11px] font-medium text-slate-600">{a.nome}</div>
                <div className="mt-0.5 flex-1 text-[10.5px] text-slate-400">{a.desc}</div>
                <button onClick={() => gerar(a.id)} disabled={!pr.ok} title={pr.ok ? "" : "Falta: " + pr.falta.join(", ")} className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                  <Printer className="h-3.5 w-3.5" /> Gerar {a.sigla}
                </button>
                {!pr.ok && <div className="mt-1 text-[10px] text-slate-400">Falta: {pr.falta.join(", ")}</div>}
              </div>
            );
          })}
        </div>
        {abertura >= 80 && dados.itens.some((i) => i.espec.trim().length > 2) && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Cesta sem termos restritivos relevantes — a redação favorece a disputa.</div>
        )}
      </div>

      <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">Minutas de apoio geradas a partir de bases públicas (PNCP, CATMAT/CATSER) e da Lei 14.133/2021 — não substituem a análise técnica e jurídica do órgão.</p>
    </section>
  );
}
