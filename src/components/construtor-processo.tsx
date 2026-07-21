"use client";
// Construtor de Processo Licitatório (Lei 14.133/2021) — o ciclo completo sobre uma CESTA DE ITENS compartilhada.
// O gestor monta a cesta (cada item com CATMAT + preço de referência do Banco de Preços + especificação checada contra
// superespecificação), preenche os dados gerais uma única vez e gera qualquer um dos 5 artefatos encadeados:
//   DFD → ETP → TR → Edital → Contrato. Os documentos reaproveitam os mesmos dados (fim do retrabalho entre fases).
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Search, AlertTriangle, ShieldCheck, Printer, Info, Plus, Trash2, Package, Sparkles } from "lucide-react";
import {
  type DadosProcesso, type ItemProcesso, type Lote, type Agrupamento, type TipoObjeto, type ModalidadeId, type Forma,
  type CriterioJulgamentoId, type ModoDisputaId, type OrdemFases, type TipoParticipacao, type InstrumentoAuxiliarId,
  ARTEFATOS, MODALIDADES, FORMA_LABEL, modalidadeDef, modalidadeIdRecomendada, resolverModalidade,
  CRITERIOS_JULGAMENTO, MODOS_DISPUTA, ORDENS_FASES, PARTICIPACAO, INSTRUMENTOS_AUXILIARES, srpAdmitido, pecasDoProcesso,
  novoItem, valorItem, valorTotal, alertasCesta, aberturaCesta, gerarArtefato, prontoPara, TIPO_OBJETO_LABEL, fmtBRL,
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

  // ── ADJUDICAÇÃO por ITEM ou por LOTE (excludente) ──
  const agrup: Agrupamento = dados.agrupamento ?? "item";
  const setAgrup = (a: Agrupamento) => setDados((d) => {
    if (a === "item") return { ...d, agrupamento: "item", itens: d.itens.map((i) => ({ ...i, loteId: null })) }; // limpa lotes dos itens
    const ls = d.lotes && d.lotes.length ? d.lotes : [{ id: "L" + Math.random().toString(36).slice(2, 7), nome: "Lote 1" }];
    return { ...d, agrupamento: "lote", lotes: ls };  // ao entrar em lote, garante ao menos 1 lote
  });
  // ── LOTES ── agrupam itens disputados JUNTOS (só no modo "lote"); lote pode ter critério próprio (art. 33)
  const lotes = dados.lotes ?? [];
  const addLote = () => setDados((d) => { const ls = d.lotes ?? []; return { ...d, lotes: [...ls, { id: "L" + Math.random().toString(36).slice(2, 7), nome: `Lote ${ls.length + 1}` }] }; });
  const updLote = (id: string, patch: Partial<Lote>) => setDados((d) => ({ ...d, lotes: (d.lotes ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const delLote = (id: string) => setDados((d) => ({ ...d, lotes: (d.lotes ?? []).filter((l) => l.id !== id), itens: d.itens.map((i) => (i.loteId === id ? { ...i, loteId: null } : i)) }));
  const itensDoLote = (loteId: string | null) => dados.itens.filter((i) => (i.loteId ?? null) === loteId);

  // ── JUNÇÃO — inteligência por item (spec real + banco de sucesso); busca ciente de marca ──
  type IntelData = { produto: string; marcaDetectada: string | null; specs: { texto: string; confianca: string | null; fonte: string | null }[]; marcas: { marca: string; n: number; menor: number | null; medio: number | null }[] };
  const [intel, setIntel] = useState<Record<string, IntelData | "loading">>({});
  async function buscarIntel(it: ItemProcesso) {
    const q = it.descricao.trim(); if (q.length < 2) return;
    setIntel((s) => ({ ...s, [it.id]: "loading" }));
    try { const r = await fetch("/api/inteligencia-item?q=" + encodeURIComponent(q)); const d = (await r.json()) as IntelData; setIntel((s) => ({ ...s, [it.id]: d })); }
    catch { setIntel((s) => ({ ...s, [it.id]: { produto: q, marcaDetectada: null, specs: [], marcas: [] } })); }
  }

  const total = useMemo(() => valorTotal(dados.itens), [dados.itens]);
  const alertas = useMemo(() => alertasCesta(dados.itens), [dados.itens]);
  const abertura = useMemo(() => aberturaCesta(dados.itens), [dados.itens]);
  const rec = useMemo(() => recomendarModalidade(dados.tipo, total), [dados.tipo, total]);
  const aberturaCor = abertura >= 80 ? "#059669" : abertura >= 50 ? "#d97706" : "#dc2626";

  // ── MODALIDADE × FORMA: escolha explícita (default = recomendada por valor/objeto) → conjunto de peças a montar ──
  const modIdRec = useMemo(() => modalidadeIdRecomendada(dados.tipo, total), [dados.tipo, total]);
  const modId: ModalidadeId = dados.modalidade ?? modIdRec;
  const def = modalidadeDef(modId);
  const forma: Forma = dados.forma && def.formas.includes(dados.forma) ? dados.forma : def.formaPadrao;
  // peças REAGEM ao SRP (Contrato → Ata de RP) via pecasDoProcesso
  const pecas = useMemo(() => pecasDoProcesso(dados, total).map((id) => ARTEFATOS.find((a) => a.id === id)!), [dados, total]);
  const podeSRP = srpAdmitido(modId);
  const aux = dados.instrumentosAuxiliares ?? [];
  const toggleAux = (id: InstrumentoAuxiliarId) =>
    setDados((d) => { const cur = d.instrumentosAuxiliares ?? []; return { ...d, instrumentosAuxiliares: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }; });

  function gerar(id: (typeof ARTEFATOS)[number]["id"]) {
    const html = gerarArtefato(id, dados, nome);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500";

  // card de um item da cesta (reusado); `mostrarLote` só no modo por lote
  const renderItem = (it: ItemProcesso, mostrarLote = false) => {
    const idx = dados.itens.indexOf(it);
    const al = alertasCesta([it]);
    return (
      <div key={it.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
        <div className="flex items-start gap-2">
          <span className="mt-1.5 text-[11px] font-bold text-slate-400">{idx + 1}</span>
          <div className="flex-1 space-y-2">
            <input value={it.descricao} onChange={(e) => updItem(it.id, { descricao: e.target.value })} placeholder="Descrição do item" className="w-full rounded border border-slate-200 px-2 py-1 text-[13px] font-medium text-slate-700 outline-none focus:border-teal-500" />
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              {it.catmat && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">CATMAT {it.catmat}</span>}
              {mostrarLote && (
                <label className="flex items-center gap-1 font-medium text-slate-600">Lote
                  <select value={it.loteId ?? ""} onChange={(e) => updItem(it.id, { loteId: e.target.value || null })} className="rounded border border-slate-300 px-1.5 py-0.5 text-[10.5px]">
                    <option value="">— escolher —</option>
                    {lotes.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-1">Qtd.<input type="number" min={0} value={it.quantidade || ""} onChange={(e) => updItem(it.id, { quantidade: Number(e.target.value) || 0 })} className="w-20 rounded border border-slate-300 px-2 py-0.5 text-right" /></label>
              <label className="flex items-center gap-1">Unid.<input value={it.unidade} onChange={(e) => updItem(it.id, { unidade: e.target.value })} className="w-20 rounded border border-slate-300 px-2 py-0.5" /></label>
              <label className="flex items-center gap-1">R$ unit.<input type="number" min={0} step="0.01" value={it.precoUnit || ""} onChange={(e) => updItem(it.id, { precoUnit: Number(e.target.value) || 0 })} className="w-24 rounded border border-slate-300 px-2 py-0.5 text-right" /></label>
              {valorItem(it) > 0 && <span className="font-semibold text-teal-700">= {fmtBRL(valorItem(it))}</span>}
            </div>
            {/* PARTICIPAÇÃO ME/EPP por item (art. 48) */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <label className="flex items-center gap-1 font-medium text-slate-600">Disputa
                <select value={it.participacao || "ampla"} onChange={(e) => updItem(it.id, { participacao: e.target.value as TipoParticipacao })} className="rounded border border-slate-300 px-1.5 py-0.5 text-[10.5px]">
                  {PARTICIPACAO.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </label>
              {it.participacao === "cota_reservada" && (
                <label className="flex items-center gap-1">reserva %<input type="number" min={1} max={25} value={it.cotaReservadaPct ?? 25} onChange={(e) => updItem(it.id, { cotaReservadaPct: Math.min(25, Number(e.target.value) || 25) })} className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-right" /></label>
              )}
            </div>
            {it.participacao === "cota_reservada" && (Number(it.quantidade) || 0) > 0 && (() => {
              const pct = Math.min(25, Number(it.cotaReservadaPct) || 25);
              const r = Math.round((Number(it.quantidade) * pct) / 100);
              return <div className="rounded bg-violet-50 px-2 py-1 text-[10.5px] text-violet-700">Divisão do quantitativo (art. 48, III): <b>{Number(it.quantidade) - r}</b> {it.unidade} na ampla + <b>{r}</b> {it.unidade} na cota ME/EPP ({pct}%).</div>;
            })()}
            {(!it.participacao || it.participacao === "ampla") && valorItem(it) > 0 && valorItem(it) <= 80000 && (
              <div className="rounded bg-amber-50 px-2 py-1 text-[10.5px] text-amber-700">Item ≤ R$ 80.000 — a lei tende à <b>exclusiva ME/EPP</b> (art. 48, I). Justifique se mantiver ampla.</div>
            )}
            <textarea value={it.espec} onChange={(e) => updItem(it.id, { espec: e.target.value })} rows={2} placeholder="Especificação técnica (por desempenho/função; evite marca, modelo, “primeira linha”)…" className="w-full rounded border border-slate-200 px-2 py-1 text-[12px] outline-none focus:border-teal-500" />
            {/* JUNÇÃO — inteligência: spec real (usar) + banco de sucesso. Busca por produto, produto+marca ou só produto. */}
            <div>
              <button type="button" onClick={() => buscarIntel(it)} disabled={it.descricao.trim().length < 2} className="inline-flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-0.5 text-[10.5px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">
                <Sparkles className="h-3 w-3" /> inteligência do item
              </button>
              {intel[it.id] === "loading" && <span className="ml-2 text-[10px] text-slate-400">buscando…</span>}
              {intel[it.id] && intel[it.id] !== "loading" && (() => {
                const d = intel[it.id] as IntelData;
                return (
                  <div className="mt-1.5 space-y-1.5 rounded-lg border border-indigo-100 bg-indigo-50/40 p-2 text-[10.5px]">
                    {d.marcaDetectada && <div className="text-indigo-700">Marca detectada: <b>{d.marcaDetectada}</b>{d.produto ? <> · produto: <b>{d.produto}</b></> : null}</div>}
                    {d.specs.length > 0 ? d.specs.map((s, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <button type="button" onClick={() => updItem(it.id, { espec: s.texto })} className="shrink-0 rounded bg-teal-600 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-teal-700">usar</button>
                        <span className="text-slate-600"><b className="text-indigo-700">spec ({s.fonte || "documento"}):</b> {s.texto.slice(0, 200)}{s.texto.length > 200 ? "…" : ""}</span>
                      </div>
                    )) : <div className="text-slate-400">Sem spec de documento para este produto (ainda).</div>}
                    {d.marcas.length > 0 && (
                      <div className="border-t border-indigo-100 pt-1.5">
                        <div className="font-semibold text-indigo-700">Banco de sucesso — venceram este item <span className="font-normal text-slate-400">(referência do gestor; não entra no edital, art. 41)</span>:</div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {d.marcas.map((m, i) => (
                            <span key={i} className="rounded bg-white px-1.5 py-0.5 text-slate-600 ring-1 ring-slate-200">{m.marca} <span className="text-slate-400">×{m.n}{m.menor ? ` · desde ${fmtBRL(m.menor)}` : ""}</span></span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
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
  };

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
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700"><Package className="h-3.5 w-3.5 text-teal-600" /> Objeto da compra {dados.itens.length > 0 && <span className="text-slate-400">({dados.itens.length} {dados.itens.length === 1 ? "item" : "itens"})</span>}</div>
          {total > 0 && <span className="rounded-full bg-teal-700 px-2.5 py-0.5 text-[12px] font-bold text-white">Total estimado: {fmtBRL(total)}</span>}
        </div>
        {/* JULGAMENTO por item OU por lote (excludente — não se mistura) */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-semibold text-slate-700">Julgamento:</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 font-semibold">
            <button onClick={() => setAgrup("item")} className={`rounded-md px-3 py-1 ${agrup === "item" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Julgamento por ITEM</button>
            <button onClick={() => setAgrup("lote")} className={`rounded-md px-3 py-1 ${agrup === "lote" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Julgamento por LOTE</button>
          </div>
          <span className="text-slate-500">{agrup === "item" ? "cada item é julgado e adjudicado separadamente (um vencedor por item)." : "cada lote é julgado como um todo (um único vencedor para o lote inteiro)."}</span>
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

        {/* novo lote — só no modo por lote */}
        {agrup === "lote" && (
          <div className="mt-2 flex items-center gap-2">
            <button onClick={addLote} className="inline-flex items-center gap-1 rounded-md border border-teal-300 px-2 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50"><Package className="h-3 w-3" /> novo lote</button>
            <span className="text-[10.5px] text-slate-400">Cada lote é adjudicado como um todo (um vencedor por lote).</span>
          </div>
        )}

        {/* renderização por MODO — item (lista plana) OU lote (grupos), nunca misturado */}
        {dados.itens.length === 0
          ? <p className="mt-3 text-center text-[11px] text-slate-400">Busque um item acima para adicionar com preço de referência, ou inclua um item em branco.</p>
          : agrup === "item"
          ? <div className="mt-3 space-y-2">{dados.itens.map((it) => renderItem(it))}</div>
          : <div className="mt-3 space-y-3">
              {lotes.map((l) => {
                const its = itensDoLote(l.id);
                return (
                  <div key={l.id} className="rounded-lg border-2 border-teal-200 bg-teal-50/40 p-2">
                    <div className="flex flex-wrap items-center gap-2 pb-1.5">
                      <Package className="h-3.5 w-3.5 text-teal-600" />
                      <input value={l.nome} onChange={(e) => updLote(l.id, { nome: e.target.value })} className="w-32 rounded border border-teal-200 bg-white px-2 py-0.5 text-[12px] font-semibold text-teal-800 outline-none focus:border-teal-500" />
                      <label className="flex items-center gap-1 text-[10.5px] text-slate-600">critério
                        <select value={l.criterio ?? ""} onChange={(e) => updLote(l.id, { criterio: (e.target.value || undefined) as CriterioJulgamentoId | undefined })} className="rounded border border-slate-300 px-1.5 py-0.5 text-[10.5px]">
                          <option value="">(do processo)</option>
                          {CRITERIOS_JULGAMENTO.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </label>
                      {valorTotal(its) > 0 && <span className="text-[11px] font-bold text-teal-700">{fmtBRL(valorTotal(its))}</span>}
                      <span className="text-[10px] text-slate-400">{its.length} {its.length === 1 ? "item" : "itens"}</span>
                      <button onClick={() => delLote(l.id)} className="ml-auto rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500" title="Remover lote (os itens ficam a atribuir)"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="space-y-2">
                      {its.length ? its.map((it) => renderItem(it, true)) : <p className="px-1 text-[10.5px] italic text-slate-400">Lote vazio — no seletor “Lote” de um item, escolha “{l.nome}”.</p>}
                    </div>
                  </div>
                );
              })}
              {(() => {
                const na = itensDoLote(null);
                if (!na.length) return null;
                return (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2">
                    <div className="mb-1 text-[10.5px] font-semibold text-amber-700">A atribuir a um lote ({na.length}) — escolha o lote no seletor de cada item</div>
                    <div className="space-y-2">{na.map((it) => renderItem(it, true))}</div>
                  </div>
                );
              })()}
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

      {/* ── MODALIDADE × FORMA (define o conjunto de peças a montar) ── */}
      <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-[12px]">
        <div className="flex items-center gap-1.5 font-semibold text-indigo-700"><Info className="h-3.5 w-3.5" /> Modalidade e forma {total > 0 && <span className="font-normal text-slate-500">· base: {fmtBRL(total)}</span>}</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-medium text-slate-600">Modalidade
            <select value={modId} onChange={(e) => setDados((d) => ({ ...d, modalidade: e.target.value as ModalidadeId, forma: undefined }))} className={inputCls}>
              {MODALIDADES.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.id === modIdRec ? " — recomendada" : ""}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-medium text-slate-600">Forma
            <select value={forma} onChange={(e) => set("forma", e.target.value as Forma)} disabled={def.formas.length < 2} className={inputCls}>
              {def.formas.map((f) => <option key={f} value={f}>{FORMA_LABEL[f]}{f === def.formaPadrao ? " (regra)" : ""}</option>)}
            </select>
          </label>
        </div>
        {/* critério · modo · ordem das fases */}
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <label className="text-[11px] font-medium text-slate-600">Critério de julgamento <span className="text-slate-400">(art. 33)</span>
            <select value={dados.criterio ?? "menor_preco"} onChange={(e) => set("criterio", e.target.value as CriterioJulgamentoId)} className={inputCls}>
              {CRITERIOS_JULGAMENTO.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-medium text-slate-600">Modo de disputa <span className="text-slate-400">(art. 56)</span>
            <select value={dados.modoDisputa ?? "aberto"} onChange={(e) => set("modoDisputa", e.target.value as ModoDisputaId)} className={inputCls}>
              {MODOS_DISPUTA.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-medium text-slate-600">Ordem das fases <span className="text-slate-400">(art. 17)</span>
            <select value={dados.ordemFases ?? "normal"} onChange={(e) => set("ordemFases", e.target.value as OrdemFases)} className={inputCls}>
              {ORDENS_FASES.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </label>
        </div>
        {/* SRP (separado — depende da modalidade base) + instrumentos auxiliares (art. 78) */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-indigo-100 pt-2">
          <label className={`flex items-center gap-1.5 text-[11px] font-medium ${podeSRP ? "text-slate-700" : "text-slate-300"}`} title={podeSRP ? "" : "SRP só em Pregão, Concorrência ou Dispensa (art. 82)"}>
            <input type="checkbox" checked={!!dados.srp && podeSRP} disabled={!podeSRP} onChange={(e) => set("srp", e.target.checked)} className="h-3.5 w-3.5 accent-teal-600" />
            SRP — Registro de Preços <span className="text-slate-400">(art. 82)</span>
          </label>
          {dados.srp && podeSRP && <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">→ gera <b>Ata de RP</b> no lugar do Contrato · vigência até 1 ano</span>}
          <span className="text-[11px] text-slate-400">|</span>
          <span className="text-[11px] font-medium text-slate-600">Instrumentos auxiliares (art. 78):</span>
          {INSTRUMENTOS_AUXILIARES.map((ia) => (
            <label key={ia.id} className="flex items-center gap-1 text-[10.5px] text-slate-600" title={ia.desc}>
              <input type="checkbox" checked={aux.includes(ia.id)} onChange={() => toggleAux(ia.id)} className="h-3 w-3 accent-teal-600" />
              {ia.nome.replace(/ \(.*\)/, "")}
            </label>
          ))}
        </div>
        <div className="mt-2 text-slate-700">Instrumento convocatório: <b>{def.instrumento === "ato" ? "Ato / Aviso de Contratação Direta" : dados.srp && podeSRP ? "Edital de Registro de Preços" : "Edital"}</b>.</div>
        <div className="mt-1 text-[11px] text-slate-500">{def.notaForma} <span className="text-slate-400">({def.base})</span></div>
        {modId !== modIdRec && <div className="mt-1 text-[11px] text-amber-700">⚠ Modalidade diferente da recomendada por valor/objeto (<b>{modalidadeDef(modIdRec).nome}</b>) — a escolha deve ser justificada nos autos.</div>}
        {rec.avisos.map((av, i) => <div key={i} className="mt-1 text-[11px] text-amber-700">⚠ {av}</div>)}
        <div className="mt-2 border-t border-indigo-100 pt-2 text-[11px] text-slate-600">Peças a montar nesta modalidade: <b className="text-teal-700">{pecas.map((p) => p.sigla).join(" → ")}</b></div>
      </div>

      {/* ── GERAÇÃO DOS ARTEFATOS ── */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-700"><FileText className="h-3.5 w-3.5 text-teal-600" /> Gerar documentos do processo</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pecas.map((a, i) => {
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
