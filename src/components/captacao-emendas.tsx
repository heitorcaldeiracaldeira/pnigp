"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Landmark, Users, Wallet, CalendarClock, FileText, Copy, Download, Star, Mail, Phone, ExternalLink, Info, BookMarked, Vote, Save } from "lucide-react";
import type { CaptacaoEmendasSC, PerfilNecessidade, CadernoPrograma } from "@/lib/queries";
import { gerarCaderno, cadernoParaTexto, cadernoParaHtml, htmlDoc, rotuloAreaPub, CARDAPIOS_EMENDAS_2026, CARDAPIO_HUB_2026, CARDAPIOS_ESTADUAIS, criarDemandaManual, AREAS_CADERNO, ACOES_FEDERAIS_CURADAS, MODALIDADES_EMENDA, labelModalidade, type SugestaoEmenda } from "@/lib/caderno-emendas";
import { Plus, X } from "lucide-react";

const brl = (n: number) => n >= 1e6 ? "R$ " + (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const casaLabel = (c: string) => (c === "senado" ? "Senador(a)" : "Dep. Federal");
const TODOS = "Todos (a bancada)"; // pedir a mesma demanda para toda a bancada

export function CaptacaoEmendas({ data, nome, necessidade, programas = [], cod }: { data: NonNullable<CaptacaoEmendasSC>; nome: string; necessidade?: PerfilNecessidade | null; programas?: CadernoPrograma[]; cod?: string }) {
  const { bancada, recursoNaMesa, recursoItens, jaRecebido, indicadoTotal, impositivasN, janelas, execucaoFuncao } = data;
  const aliados = bancada.filter((b) => b.aliado);
  const senadores = bancada.filter((b) => b.casa === "senado");
  const deputados = bancada.filter((b) => b.casa === "camara");

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-white p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Landmark aria-hidden className="h-4 w-4 text-indigo-600" /> Captação de Emendas Parlamentares · {nome}</div>
        <p className="mt-1 text-sm text-slate-600">O ponto cego mais caro da gestão: o recurso existe e é <b>impositivo</b>, mas falta saber <b>a quem pedir</b>, <b>o que pedir</b> e <b>como pedir</b>. Esta tela reúne a bancada federal de SC, o que já veio, o que está na mesa e o roteiro para solicitar — de forma neutra e apartidária.</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><Wallet aria-hidden className="h-3.5 w-3.5" /> Já recebido (executado)</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{brl(jaRecebido)}</div>
          <div className="text-[11px] text-slate-500">emendas pagas ao município</div>
        </div>
        {indicadoTotal > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><FileText aria-hidden className="h-3.5 w-3.5" /> Indicado (em tramitação)</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{brl(indicadoTotal)}</div>
          <div className="text-[11px] text-slate-500">{impositivasN > 0 ? `${impositivasN} impositivas · ` : ""}emendas indicadas (Transferegov)</div>
        </div>
        )}
        <div className={`rounded-xl border p-4 ${recursoNaMesa > 0 ? "border-amber-300 bg-amber-50/60" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center gap-1 text-xs text-slate-500"><CalendarClock aria-hidden className="h-3.5 w-3.5" /> Recurso na mesa</div>
          <div className={`font-display text-2xl font-bold tabular-nums ${recursoNaMesa > 0 ? "text-amber-700" : "text-slate-900"}`}>{brl(recursoNaMesa)}</div>
          <div className="text-[11px] text-slate-500">empenhado, ainda não pago — cobre agora</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><Users aria-hidden className="h-3.5 w-3.5" /> Aliados na bancada</div>
          <div className="font-display text-2xl font-bold tabular-nums text-indigo-700">{aliados.length}<span className="text-base font-semibold text-slate-400">/{bancada.length}</span></div>
          <div className="text-[11px] text-slate-500">já destinaram emenda ao município</div>
        </div>
      </div>

      {/* BLOCO 2 — Recurso na mesa (detalhe) */}
      {recursoItens.length > 0 && (
        <div className="rounded-xl border-l-4 border-l-amber-500 bg-white p-3 text-sm shadow-sm">
          <div className="font-semibold text-slate-800">Não deixe na mesa — {brl(recursoNaMesa)} empenhados aguardam pagamento</div>
          <p className="mt-0.5 text-[12px] text-slate-600">Emenda empenhada vira <b>restos a pagar</b> e pode caducar. Vale ao gabinete/ministério cobrar a liberação.</p>
          <div className="mt-2 space-y-1">
            {recursoItens.map((r, i) => (
              <div key={i} className="flex items-center justify-between border-t border-slate-100 pt-1 text-[12px]">
                <span className="text-slate-700">{r.autor}{!r.naBancada && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">mandato anterior</span>}</span>
                <span className="tabular-nums text-amber-700">{brl(r.naMesa)} na mesa <span className="text-slate-400">(de {brl(r.empenhado)})</span></span>
              </div>
            ))}
            <p className="mt-1 text-[10px] text-slate-400">Emendas de mandato anterior seguem a receber — cobre pelo órgão/Ministério, não pelo ex-parlamentar.</p>
          </div>
        </div>
      )}

      {/* O que a emenda federal financiou — por função/subfunção (área). Dado do Portal da Transparência que estava coletado e não exibido. */}
      {execucaoFuncao.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1 text-sm font-semibold text-slate-800"><Wallet aria-hidden className="h-4 w-4 text-indigo-600" /> O que as emendas federais financiaram no seu município — por área</div>
          <p className="text-[11px] text-slate-500">Execução das emendas federais classificada por <b>função e subfunção orçamentária</b> (Portal da Transparência). "Na mesa" = empenhado ainda não pago; "restos" = restos a pagar ainda a receber.</p>
          <div className="mt-2 space-y-1">
            {execucaoFuncao.map((g, i) => (
              <details key={i} open={execucaoFuncao.length <= 2} className="rounded-lg border border-slate-200 bg-slate-50/50">
                <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-1 px-3 py-2 text-[12px] font-semibold text-slate-700">
                  <span>{g.funcao} <span className="text-slate-400">({g.subfuncoes.length})</span></span>
                  <span className="tabular-nums text-slate-500"><b className="text-slate-800">{brl(g.pago)}</b> pago{g.naMesa > 0 ? <span className="text-amber-700"> · {brl(g.naMesa)} na mesa</span> : null}{g.restoAReceber > 0 ? <span className="text-amber-700"> · {brl(g.restoAReceber)} restos</span> : null}</span>
                </summary>
                <div className="space-y-0.5 px-3 pb-2">
                  {g.subfuncoes.map((s, j) => (
                    <div key={j} className="flex items-center justify-between gap-1 border-t border-slate-100 pt-0.5 text-[11px]">
                      <span className="min-w-0 truncate text-slate-600">{s.subfuncao}</span>
                      <span className="shrink-0 tabular-nums text-slate-500">{brl(s.pago)}{s.naMesa > 0 ? <span className="text-amber-700"> · {brl(s.naMesa)} na mesa</span> : null}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* BLOCO 1 — Bancada completa (todos os parlamentares) */}
      <div>
        <div className="mb-1 text-sm font-semibold text-slate-800">Bancada federal de Santa Catarina — {bancada.length} parlamentares</div>
        <p className="mb-2 text-[11px] text-slate-500">Todos os {senadores.length} senadores e {deputados.length} deputados federais de SC (ordem alfabética). ★ = já destinou emenda ao município (últimos 4 anos). Votos = eleição do parlamentar no município; para <b>senadores suplentes</b>, exibimos os votos do <b>titular</b> que representam. Emenda pode vir de qualquer um — priorize quem já tem vínculo, votos no município e a bancada do estado.</p>
        {senadores.length > 0 && <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-600">Senadores</div>}
        <div className="grid gap-2 sm:grid-cols-2">
          {senadores.map((b, i) => <BancadaCard key={"s" + i} b={b} />)}
        </div>
        {deputados.length > 0 && <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-indigo-600">Deputados Federais</div>}
        <div className="grid gap-2 sm:grid-cols-2">
          {deputados.map((b, i) => <BancadaCard key={"d" + i} b={b} />)}
        </div>
      </div>

      {/* BLOCO 3 — Janelas de emenda abertas */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-1 text-sm font-semibold text-slate-800"><CalendarClock aria-hidden className="h-4 w-4 text-indigo-600" /> Janelas de programa com recebimento de emenda</div>
        {janelas.length > 0 ? (
          <div className="mt-2 space-y-1">
            {janelas.map((j, i) => (
              <div key={i} className="flex items-center justify-between border-t border-slate-100 pt-1 text-[12px]">
                <span className="min-w-0 truncate text-slate-700">{j.nome} <span className="text-slate-400">· {j.orgao}</span></span>
                <span className="shrink-0 tabular-nums text-slate-500">até {j.dtFim.split("-").reverse().join("/")}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[12px] text-slate-600">Nenhuma janela de emenda aberta neste momento. O ciclo de <b>indicação</b> acompanha a LOA: as emendas são apresentadas entre <b>agosto e outubro</b> (na tramitação do PLOA) para execução no ano seguinte. Articule o projeto antes dessa janela.</p>
        )}
      </div>

      {/* BLOCO 4 — Como pedir: roteiro + gerador */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="text-sm font-semibold text-slate-800">Como pedir — roteiro prático</div>
        <ol className="mt-2 grid gap-2 text-[12px] text-slate-700 sm:grid-cols-2">
          {[
            ["1. Defina o projeto", "Necessidade concreta + objeto (obra, equipamento, custeio) e valor. Use os diagnósticos das outras abas para justificar."],
            ["2. Escolha o parlamentar", "Priorize aliados e a bancada de SC (acima). Emenda individual e de bancada são impositivas — têm execução obrigatória."],
            ["3. Procure o gabinete", "Ofício + reunião com o projeto pronto (plano de trabalho, valor, justificativa). Use o gerador abaixo."],
            ["4. Indicação na LOA", "O parlamentar registra a emenda na tramitação do orçamento (ago–out). Confirme o nº da emenda e a ação orçamentária."],
            ["5. Formalize no Transferegov", "Após a sanção da LOA, apresente o plano de ação/proposta no Transferegov (transferência com finalidade definida) ou receba direto (transferência especial)."],
            ["6. Acompanhe e cobre", "Monitore empenho × pagamento. O que ficar 'na mesa' precisa ser cobrado antes de virar restos a pagar que caducam."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-lg border border-slate-200 bg-white p-2"><span className="font-semibold text-slate-800">{t}.</span> {d.replace(/^[^.]+\. /, "")}</li>
          ))}
        </ol>

        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-[12px] text-slate-600">
          <div className="flex items-center gap-1 font-semibold text-slate-700"><Info aria-hidden className="h-3.5 w-3.5" /> Tipos de emenda (base legal)</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li><b>Individual (RP6)</b> — impositiva (EC 86/2015); cota anual por parlamentar definida na LDO, com <b>50% obrigatório para saúde</b>.</li>
            <li><b>De bancada estadual (RP7)</b> — impositiva (EC 100/2019); projetos estruturantes de interesse do estado (a bancada de SC decide em conjunto).</li>
            <li><b>Transferência especial ("emenda Pix", EC 105/2019)</b> — vai direto ao ente, sem convênio; ≥60% em investimento.</li>
            <li><b>Transferência com finalidade definida</b> — vinculada a um programa/objeto, executada via Transferegov.</li>
          </ul>
        </div>

        <OficioGenerator bancada={bancada} nome={nome} />
      </div>

      <CadernoSugestoes necessidade={necessidade} nome={nome} programas={programas} cod={cod} parlamentares={bancada.map((b) => ({ nome: b.nome, entregue: b.jaMunicipio }))} />

      <p className="text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><FileText aria-hidden className="h-3 w-3" /> Dados oficiais</span>Bancada: Câmara dos Deputados e Senado Federal (dados abertos). Emendas: SICONV/Transferegov (indicação) e Portal da Transparência (execução). Conteúdo informativo e apartidário — a escolha do parlamentar e a decisão de articulação são do gestor.</p>
    </section>
  );
}

export function CadernoSugestoes({ necessidade, nome, programas, escopo = "federal", cod, parlamentares = [] }: { necessidade?: PerfilNecessidade | null; nome: string; programas: CadernoPrograma[]; escopo?: "federal" | "estadual"; cod?: string; parlamentares?: { nome: string; entregue?: number }[] }) {
  const [copiado, setCopiado] = useState(false);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // "pedir a" — atribui cada demanda a um parlamentar (key "a{i}"/"m{i}" → nome); base do contador por parlamentar
  const [pedidos, setPedidos] = useState<Record<string, string>>({});
  const sugestoes = useMemo(() => gerarCaderno(necessidade ?? null, nome, escopo), [necessidade, nome, escopo]);
  // valores e OBJETO (o que será aplicado) EDITÁVEIS pelo município — a referência é só o ponto de partida
  const [valores, setValores] = useState<Record<number, number>>(() => Object.fromEntries(sugestoes.map((s, i) => [i, s.valorRef])));
  const [objetos, setObjetos] = useState<Record<number, string>>({});
  // DEMANDAS MANUAIS incluídas pelo município
  const [manuais, setManuais] = useState<SugestaoEmenda[]>([]);
  const [mForm, setMForm] = useState<{ chave: string; titulo: string; objeto: string; valor: string; tipo: string }>({ chave: "saude", titulo: "", objeto: "", valor: "", tipo: "individual" });
  const addManual = () => {
    if (!mForm.titulo.trim() && !mForm.objeto.trim()) return;
    const v = Number(mForm.valor.replace(/[^\d]/g, "")) || 0;
    setManuais((m) => [...m, criarDemandaManual(mForm.chave, mForm.titulo.trim(), mForm.objeto.trim() || mForm.titulo.trim(), v, mForm.tipo, "manual", escopo)]);
    setMForm({ chave: mForm.chave, titulo: "", objeto: "", valor: "", tipo: mForm.tipo });
  };
  const removeManual = (i: number) => setManuais((m) => m.filter((_, k) => k !== i));
  const editManualVal = (i: number, raw: string) => { const n = Number(raw.replace(/[^\d]/g, "")) || 0; setManuais((m) => m.map((x, k) => (k === i ? { ...x, valorRef: n } : x))); };
  const editManualObj = (i: number, val: string) => setManuais((m) => m.map((x, k) => (k === i ? { ...x, objeto: val } : x)));
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const manuaisRef = useRef<HTMLDivElement>(null);
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);
  const usarPrograma = (p: CadernoPrograma) => {
    const ni = manuais.length; // índice do novo item
    setManuais((m) => [...m, criarDemandaManual(p.area, p.nome, p.objetivo || p.nome, 0, "individual", "programa", escopo)]);
    setAddedIds((a) => [...a, p.id]);
    setTimeout(() => setAddedIds((a) => a.filter((x) => x !== p.id)), 2500);
    setHighlightIdx(ni);
    setTimeout(() => manuaisRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    setTimeout(() => setHighlightIdx(null), 3200);
  };
  // programas: prioriza os das áreas com déficit diagnosticado; limita a 10
  // mescla os programas do Transferegov com as AÇÕES CURADAS (saúde/FNS, educação/FNDE, assistência/MDS — ausentes da base)
  const programasFull = useMemo(() => [
    ...programas,
    ...(escopo === "federal" ? ACOES_FEDERAIS_CURADAS.map((a) => ({ id: "cur-" + a.nome, nome: a.nome, orgao: a.orgao, area: a.area, valor: 0, objetivo: a.objetivo, elegivel: true, janelaEmenda: null as string | null })) : []),
  ], [programas, escopo]);
  // TODAS as possibilidades, agrupadas por área (áreas com déficit diagnosticado primeiro)
  const gruposProg = useMemo(() => {
    const defAreas = new Set(Object.entries((necessidade || {}) as Record<string, { deficit: boolean } | null>).filter(([, v]) => v?.deficit).map(([k]) => k));
    const byArea = new Map<string, CadernoPrograma[]>();
    for (const p of programasFull) { if (!byArea.has(p.area)) byArea.set(p.area, []); byArea.get(p.area)!.push(p); }
    return [...byArea.entries()].sort((a, b) => (Number(defAreas.has(b[0])) - Number(defAreas.has(a[0]))) || (b[1].length - a[1].length)).map(([area, itens]) => ({ area, itens, deficit: defAreas.has(area) }));
  }, [programasFull, necessidade]);
  const progs = programasFull;
  // carrega o caderno salvo do banco (por município + escopo) ao abrir
  useEffect(() => {
    if (!cod) return;
    let vivo = true;
    fetch(`/api/caderno-emendas?cod=${cod}&escopo=${escopo}`).then((r) => r.json()).then((d) => {
      if (!vivo || !d?.caderno) return;
      if (d.caderno.valores) setValores((v) => ({ ...v, ...d.caderno.valores }));
      if (d.caderno.objetos) setObjetos(d.caderno.objetos);
      if (Array.isArray(d.caderno.manuais)) setManuais(d.caderno.manuais);
      if (d.caderno.pedidos) setPedidos(d.caderno.pedidos);
      if (d.atualizado) setSalvoEm(d.atualizado);
      setResumoSalvo(calcResumo(d.caderno.pedidos || {}, d.caderno.valores || {}, Array.isArray(d.caderno.manuais) ? d.caderno.manuais : []));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [cod, escopo]);
  const salvarCaderno = async () => {
    if (!cod) return;
    setSalvando(true);
    try {
      await fetch(`/api/caderno-emendas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cod, escopo, valores, objetos, manuais, pedidos }) });
      setSalvoEm(new Date().toISOString().slice(0, 16));
      setResumoSalvo(calcResumo(pedidos, valores, manuais)); // conta por parlamentar só no salvar
    } catch { /* ignore */ }
    setSalvando(false);
  };
  const parlMap = useMemo(() => { const m = new Map(parlamentares.map((p) => [p.nome, p.entregue || 0])); m.set(TODOS, parlamentares.reduce((s, p) => s + (p.entregue || 0), 0)); return m; }, [parlamentares]);
  // a contagem por parlamentar é um SNAPSHOT — só é (re)calculada ao SALVAR (ou ao abrir o caderno salvo)
  const calcResumo = (peds: Record<string, string>, vals: Record<number, number>, mans: SugestaoEmenda[]) => {
    const m = new Map<string, number>();
    sugestoes.forEach((s, i) => { const p = peds["a" + i]; if (p) m.set(p, (m.get(p) || 0) + (vals[i] ?? s.valorRef ?? 0)); });
    mans.forEach((s, i) => { const p = peds["m" + i]; if (p) m.set(p, (m.get(p) || 0) + s.valorRef); });
    return [...m.entries()].map(([pnome, pedido]) => ({ nome: pnome, pedido, entregue: parlMap.get(pnome) || 0 })).sort((a, b) => b.pedido - a.pedido);
  };
  const [resumoSalvo, setResumoSalvo] = useState<{ nome: string; pedido: number; entregue: number }[]>([]);
  const setPedirA = (k: string, v: string) => setPedidos((p) => ({ ...p, [k]: v }));
  if (!sugestoes.length && !progs.length) return null;
  const total = sugestoes.reduce((s, _, i) => s + (valores[i] || 0), 0) + manuais.reduce((s, m) => s + m.valorRef, 0);
  const totalPedido = resumoSalvo.reduce((s, r) => s + r.pedido, 0);

  const sugestoesComValor = sugestoes.map((s, i) => ({ ...s, valorRef: valores[i] || 0, objeto: objetos[i] ?? s.objeto }));
  const texto = () => cadernoParaTexto([...sugestoesComValor, ...manuais], nome, progs.map((p) => ({ nome: p.nome, orgao: p.orgao, area: p.area, objetivo: p.objetivo, elegivel: p.elegivel, janelaEmenda: p.janelaEmenda })), escopo);
  const copiar = () => { navigator.clipboard?.writeText(texto()); setCopiado(true); setTimeout(() => setCopiado(false), 2000); };
  const baixar = () => { const html = cadernoParaHtml([...sugestoesComValor, ...manuais], nome, progs.map((p) => ({ nome: p.nome, orgao: p.orgao, area: p.area, objetivo: p.objetivo, elegivel: p.elegivel, janelaEmenda: p.janelaEmenda })), escopo); const b = new Blob(["﻿", html], { type: "application/msword" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `caderno-emendas-${nome.toLowerCase().replace(/\s+/g, "-")}.doc`; a.click(); };
  const setVal = (i: number, raw: string) => { const n = Number(raw.replace(/[^\d]/g, "")); setValores((v) => ({ ...v, [i]: Number.isFinite(n) ? n : 0 })); };

  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 to-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><BookMarked aria-hidden className="h-4 w-4 text-indigo-600" /> Caderno de Sugestões de Emendas — {nome}</div>
          <p className="mt-0.5 text-[12px] text-slate-600">Portfólio de projetos financiáveis montado a partir do <b>diagnóstico do município</b>, no formato que a bancada espera receber. <b>Defina o valor pretendido de cada demanda</b> — a referência é só um ponto de partida.</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex gap-2">
            {cod && <button onClick={salvarCaderno} disabled={salvando} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><Save className="h-3.5 w-3.5" /> {salvando ? "Salvando…" : "Salvar"}</button>}
            <button onClick={copiar} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-700"><Copy className="h-3.5 w-3.5" /> {copiado ? "Copiado!" : "Copiar"}</button>
            <button onClick={baixar} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" /> Baixar (Word)</button>
          </div>
          {salvoEm && <span className="text-[10px] text-slate-400">salvo em {salvoEm.replace("T", " ").slice(0, 16)}</span>}
        </div>
      </div>
      <div className="mt-2 text-[12px] text-slate-500">{sugestoes.length + manuais.length} demandas · total pretendido <b className="tabular-nums text-indigo-700">{brl(total)}</b></div>

      {parlamentares.length > 0 && resumoSalvo.length > 0 && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <div className="text-[12px] font-semibold text-slate-800">Pedido por parlamentar · total alocado {brl(totalPedido)}</div>
          <p className="text-[11px] text-slate-500">{escopo === "estadual" ? <>Quanto o município está pedindo a cada deputado × o volume total de emendas dele no estado (capacidade) — para o gestor comparar depois o que foi <b>conquistado</b>.</> : <>Quanto o município está pedindo a cada um × quanto ele já entregou ao município — para o gestor comparar depois o que foi <b>conquistado</b>.</>}</p>
          <div className="mt-2 space-y-1">
            {resumoSalvo.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-1 border-t border-amber-100 pt-1 text-[12px]">
                <span className="font-medium text-slate-700">{r.nome}</span>
                <span className="tabular-nums"><b className="text-amber-700">pedido {brl(r.pedido)}</b>{r.entregue > 0 ? (escopo === "estadual" ? <span className="text-slate-500"> · {brl(r.entregue)} em emendas no estado</span> : <span className="text-slate-500"> · já entregou {brl(r.entregue)} (4 anos) · <b className={r.pedido > r.entregue ? "text-rose-600" : "text-emerald-600"}>{r.entregue >= r.pedido ? "histórico cobre" : `falta ${brl(r.pedido - r.entregue)}`}</b></span>) : <span className="text-slate-400"> · {escopo === "estadual" ? "sem emendas registradas" : "sem entrega recente"}</span>}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* I — Projetos estruturais (valor editável) */}
      <div className="mt-3 space-y-2">
        {sugestoes.map((s, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <div className="text-[13px] font-semibold text-slate-800">{i + 1}. {s.titulo}</div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">ODS {s.odsNum}</span>
                <span className={`rounded-full px-2 py-0.5 font-semibold ${s.tipoEmenda === "bancada" ? "bg-violet-100 text-violet-700" : "bg-teal-100 text-teal-700"}`}>{s.tipoEmenda === "bancada" ? "Bancada" : "Individual"}</span>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
              <span><b className="text-slate-600">{escopo === "estadual" ? "Secretaria de Estado" : "Ministério"}:</b> {s.ministerio}</span>
              <span><b className="text-slate-600">Despesa:</b> {s.categoria}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500"><b className="text-slate-600">Onde cadastrar:</b> {s.sistema}</div>
            <div className="mt-1 italic text-[11px] text-slate-500">{s.justificativa}</div>
            <label className="mt-2 block text-[11px] text-slate-600"><span className="font-semibold">O que será aplicado (objeto):</span>
              <textarea rows={2} value={objetos[i] ?? s.objeto} onChange={(e) => setObjetos((o) => ({ ...o, [i]: e.target.value }))} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-700" />
            </label>
            <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-600">
              <span className="font-semibold">Valor pretendido (R$):</span>
              <input inputMode="numeric" value={(valores[i] || 0).toLocaleString("pt-BR")} onChange={(e) => setVal(i, e.target.value)} className="w-40 rounded border border-slate-300 bg-white px-2 py-1 text-right tabular-nums text-[12px] font-semibold text-indigo-700" />
              <span className="text-slate-400">sugestão: {brl(s.valorRef)}</span>
            </label>
            {parlamentares.length > 0 && (
              <label className="mt-1 flex items-center gap-2 text-[11px] text-slate-600"><span className="font-semibold">Pedir a:</span>
                <select value={pedidos["a" + i] || ""} onChange={(e) => setPedirA("a" + i, e.target.value)} className="max-w-[220px] rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"><option value="">— escolha o parlamentar —</option><option value={TODOS}>★ {TODOS}</option>{parlamentares.map((pp) => <option key={pp.nome} value={pp.nome}>{pp.nome}</option>)}</select>
              </label>
            )}
          </div>
        ))}
      </div>

      {/* Demandas incorporadas/incluídas pelo município */}
      {manuais.length > 0 && (
        <div ref={manuaisRef} className="mt-2 space-y-2">
          {manuais.map((s, i) => (
            <div key={i} className={`rounded-xl border bg-emerald-50/40 p-3 transition-all ${highlightIdx === i ? "border-emerald-500 ring-2 ring-emerald-400" : "border-emerald-200"}`}>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <div className="text-[13px] font-semibold text-slate-800">{sugestoes.length + i + 1}. {s.titulo} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${s.origem === "programa" ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>{s.origem === "programa" ? "programa incorporado ao caderno" : "incluída pelo município"}</span></div>
                <button onClick={() => removeManual(i)} title="Remover" className="text-slate-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500"><span><b className="text-slate-600">Área:</b> {s.area} · ODS {s.odsNum}</span><span><b className="text-slate-600">Modalidade:</b> {labelModalidade(s.tipoEmenda)}</span><span><b className="text-slate-600">{escopo === "estadual" ? "Secretaria de Estado" : "Ministério"}:</b> {s.ministerio}</span></div>
              <div className="mt-0.5 text-[11px] text-slate-500"><b className="text-slate-600">Onde cadastrar:</b> {s.sistema}</div>
              <label className="mt-2 block text-[11px] text-slate-600"><span className="font-semibold">O que será aplicado (objeto):</span>
                <textarea rows={2} value={s.objeto} onChange={(e) => editManualObj(i, e.target.value)} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-700" />
              </label>
              <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-600"><span className="font-semibold">Valor pretendido (R$):</span>
                <input inputMode="numeric" value={s.valorRef.toLocaleString("pt-BR")} onChange={(e) => editManualVal(i, e.target.value)} className="w-40 rounded border border-slate-300 bg-white px-2 py-1 text-right tabular-nums text-[12px] font-semibold text-emerald-700" />
              </label>
              {parlamentares.length > 0 && (
                <label className="mt-1 flex items-center gap-2 text-[11px] text-slate-600"><span className="font-semibold">Pedir a:</span>
                  <select value={pedidos["m" + i] || ""} onChange={(e) => setPedirA("m" + i, e.target.value)} className="max-w-[220px] rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"><option value="">— escolha o parlamentar —</option><option value={TODOS}>★ {TODOS}</option>{parlamentares.map((pp) => <option key={pp.nome} value={pp.nome}>{pp.nome}</option>)}</select>
                </label>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form de inclusão manual */}
      <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-white p-3">
        <div className="flex items-center gap-1 text-[12px] font-semibold text-slate-700"><Plus aria-hidden className="h-3.5 w-3.5 text-emerald-600" /> Incluir demanda do município no caderno</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input value={mForm.titulo} onChange={(e) => setMForm({ ...mForm, titulo: e.target.value })} placeholder="Título (ex.: Reforma da Praça Central)" className="rounded border border-slate-300 px-2 py-1 text-[12px]" />
          <input value={mForm.objeto} onChange={(e) => setMForm({ ...mForm, objeto: e.target.value })} placeholder="Objeto (o que será feito)" className="rounded border border-slate-300 px-2 py-1 text-[12px]" />
          <select value={mForm.chave} onChange={(e) => setMForm({ ...mForm, chave: e.target.value })} className="rounded border border-slate-300 bg-white px-2 py-1 text-[12px]">
            {AREAS_CADERNO.map((a) => <option key={a.chave} value={a.chave}>{a.rotulo}</option>)}
          </select>
          <div className="flex gap-2">
            <input inputMode="numeric" value={mForm.valor} onChange={(e) => setMForm({ ...mForm, valor: e.target.value })} placeholder="Valor (R$)" className="w-full rounded border border-slate-300 px-2 py-1 text-right text-[12px]" />
            <select value={mForm.tipo} onChange={(e) => setMForm({ ...mForm, tipo: e.target.value })} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]">{MODALIDADES_EMENDA.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}</select>
          </div>
        </div>
        <button onClick={addManual} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700"><Plus className="h-3.5 w-3.5" /> Adicionar ao caderno</button>
      </div>

      {/* II — Possibilidades reais (federal: programas Transferegov; estadual: objetos reais de emendas 2026) */}
      {progs.length > 0 && (
        <div className="mt-4">
          <div className="text-[12px] font-semibold text-slate-800">{escopo === "estadual" ? `Objetos reais de emendas estaduais 2026 — todas as possibilidades (${progs.length}) executadas pela SEF-SC` : `Programas federais aplicáveis — todas as possibilidades (${progs.length}) na base Transferegov`}</div>
          <p className="text-[11px] text-slate-500">{escopo === "estadual" ? "O que emendas estaduais de SC efetivamente financiaram em 2026, agrupado por área (as com déficit no município primeiro). Cada objeto é um exemplo real — use-o como base para o seu pedido." : "Todos os programas federais classificados, agrupados por área (as com déficit diagnosticado primeiro). Cada um pode virar uma demanda de emenda; o valor você define no plano de trabalho."}</p>
          {gruposProg.map((g) => (
            <details key={g.area} open={g.deficit} className="mt-2 rounded-lg border border-slate-200 bg-slate-50/50">
              <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-semibold text-slate-700">
                {rotuloAreaPub(g.area)} <span className="text-slate-400">({g.itens.length})</span>
                {g.deficit && <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700">déficit diagnosticado</span>}
              </summary>
              <div className="space-y-1.5 px-3 pb-3">
                {g.itens.map((p, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="text-[12px] font-semibold text-slate-800">{p.nome}</div>
                      <div className="flex items-center gap-1 text-[10px]">
                        {escopo === "estadual" ? (
                          p.valor > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-700 tabular-nums">R$ {p.valor >= 1e6 ? (p.valor / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : p.valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
                        ) : (<>
                          {p.elegivel ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">elegível</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500">verificar</span>}
                          {p.janelaEmenda && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">janela {p.janelaEmenda.split("-").reverse().join("/")}</span>}
                        </>)}
                      </div>
                    </div>
                    {p.orgao && <div className="mt-0.5 text-[11px] text-slate-500"><b className="text-slate-600">Órgão:</b> {p.orgao}</div>}
                    {p.objetivo && <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{p.objetivo}</div>}
                    <button onClick={() => usarPrograma(p)} className={`mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${addedIds.includes(p.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}><Plus className="h-3 w-3" /> {addedIds.includes(p.id) ? "✓ Adicionado ao caderno (acima)" : "Usar no caderno (definir objeto e valor)"}</button>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {/* III — Documentos/cardápios oficiais (federal: ministérios 2026; estadual: ALESC + SEF-SC) */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1 text-[12px] font-semibold text-slate-800"><ExternalLink aria-hidden className="h-3.5 w-3.5 text-indigo-600" /> {escopo === "estadual" ? "Documentos oficiais — emendas estaduais (ALESC / SEF-SC)" : "Cardápios oficiais de emendas 2026 (ações financiáveis por ministério)"}</div>
        <p className="text-[11px] text-slate-500">{escopo === "estadual" ? "Manual da ALESC (como elaborar/executar) e painel da SEF-SC (execução por município)." : "Cada ministério publica as ações que aceitam emenda. Consulte o da área antes de fechar o valor e o objeto."}</p>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {(escopo === "estadual" ? CARDAPIOS_ESTADUAIS : [...CARDAPIOS_EMENDAS_2026].sort((a, b) => {
            const def = (k: string) => ((necessidade as Record<string, { deficit: boolean } | null> | null | undefined)?.[k]?.deficit ? 0 : 1);
            return def(a.area) - def(b.area);
          })).map((c) => (
            <a key={c.orgao} href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40">
              <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" /> <span className="truncate">{c.orgao}</span>
            </a>
          ))}
        </div>
        {escopo === "federal" && <a href={CARDAPIO_HUB_2026} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline"><ExternalLink className="h-3 w-3" /> Portal Federativo — todos os cardápios de emendas 2026</a>}
      </div>

      <p className="mt-2 text-[10px] text-slate-400">Os valores são <b>definidos pelo município</b> conforme o projeto e o plano de trabalho (a referência é só ponto de partida). Finalidades e sistemas de cadastro conforme as cartilhas oficiais de emendas PLOA 2026 (Saúde/FNS — Ambiente Parlamentar; Educação/MEC-FNDE módulo PAR; Assistência/MDS-SUAS) e a base de programas do Transferegov. A priorização é do gestor.</p>
    </div>
  );
}

function BancadaCard({ b }: { b: NonNullable<CaptacaoEmendasSC>["bancada"][number] }) {
  const nf = (n: number) => n.toLocaleString("pt-BR");
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${b.aliado ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-white"}`}>
      {b.foto ? <img src={b.foto} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" /> : <div className="h-11 w-11 shrink-0 rounded-full bg-slate-200" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-sm font-semibold text-slate-800">
          {b.aliado && <Star aria-hidden className="h-3.5 w-3.5 shrink-0 fill-indigo-500 text-indigo-500" />}
          <span className="truncate">{b.nome}</span>
        </div>
        <div className="text-[11px] text-slate-500">{casaLabel(b.casa)} · {b.partido}</div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] tabular-nums text-slate-600">
          <Vote aria-hidden className="h-3 w-3 text-slate-400" />
          {b.votos > 0 ? <span className="font-semibold text-slate-700">{nf(b.votos)} votos{b.votosPct > 0 ? <span className="text-indigo-700"> · {b.votosPct.toLocaleString("pt-BR")}% do eleitorado</span> : null}</span> : <span className="text-slate-400">sem votos no município</span>}
        </div>
        <div className="text-[11px] tabular-nums text-slate-600">
          {b.jaMunicipio > 0 ? <span className="font-semibold text-indigo-700">{b.jaMunicipio >= 1e6 ? "R$ " + (b.jaMunicipio / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : "R$ " + b.jaMunicipio.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} em emendas (4 anos)</span> : <span className="text-slate-400">sem emenda recente ao município</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        {b.email && <a href={`mailto:${b.email}`} title={b.email} className="text-slate-400 hover:text-indigo-600"><Mail className="h-4 w-4" /></a>}
        {b.telefone && <span title={b.telefone} className="text-slate-400"><Phone className="h-4 w-4" /></span>}
        {b.pagina && <a href={b.pagina} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-600"><ExternalLink className="h-4 w-4" /></a>}
      </div>
    </div>
  );
}

function OficioGenerator({ bancada, nome }: { bancada: NonNullable<CaptacaoEmendasSC>["bancada"]; nome: string }) {
  const [idx, setIdx] = useState(0);
  const [objeto, setObjeto] = useState("");
  const [valor, setValor] = useState("");
  const [area, setArea] = useState("Saúde");
  const [copiado, setCopiado] = useState(false);
  const p = bancada[idx];

  const texto = useMemo(() => {
    const trat = p?.casa === "senado" ? "Exmo. Sr. Senador / Exma. Sra. Senadora" : "Exmo. Sr. Deputado / Exma. Sra. Deputada";
    const obj = objeto.trim() || "[descreva o objeto: obra, equipamento ou custeio]";
    const val = valor.trim() ? `no valor de R$ ${valor.trim()}` : "no valor de R$ [valor]";
    return `OFÍCIO Nº ____/${new Date().getFullYear()} — Gabinete do Prefeito de ${nome}

A Sua Excelência
${trat} ${p?.nome || "[parlamentar]"}${p?.partido ? ` (${p.partido})` : ""}

Assunto: Solicitação de emenda parlamentar — ${area}

Senhor(a) Parlamentar,

O Município de ${nome} vem, respeitosamente, solicitar o apoio de Vossa Excelência por meio da destinação de emenda parlamentar ${val}, para ${obj}, na área de ${area}.

A iniciativa atende a uma necessidade prioritária do município, com impacto direto na população, e está apta a ser formalizada junto à plataforma Transferegov após a sanção da Lei Orçamentária. Colocamo-nos à disposição para apresentar o plano de trabalho detalhado e demais documentos técnicos.

Certos de contar com o valioso apoio de Vossa Excelência, renovamos protestos de estima e consideração.

${nome}, ${new Date().toLocaleDateString("pt-BR")}.

_______________________________
Prefeito(a) Municipal de ${nome}`;
  }, [p, objeto, valor, area, nome]);

  const copiar = () => { navigator.clipboard?.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); };
  const baixar = () => {
    const esc = texto.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const html = htmlDoc("Ofício — " + nome, `<pre style="font-family:Calibri,Arial,sans-serif;font-size:11pt;white-space:pre-wrap">${esc}</pre>`);
    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `oficio-emenda-${nome.toLowerCase().replace(/\s+/g, "-")}.doc`; a.click();
  };

  return (
    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="flex items-center gap-1 text-[12px] font-semibold text-slate-800"><FileText aria-hidden className="h-3.5 w-3.5 text-indigo-600" /> Gerador de ofício de solicitação</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] text-slate-600">Parlamentar
          <select value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-800">
            {bancada.map((b, i) => <option key={i} value={i}>{b.nome} — {casaLabel(b.casa)} ({b.partido}){b.aliado ? " ★" : ""}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-600">Área
          <select value={area} onChange={(e) => setArea(e.target.value)} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-800">
            {["Saúde", "Educação", "Infraestrutura", "Assistência Social", "Agricultura", "Esporte e Lazer", "Cultura"].map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-600">Objeto
          <input value={objeto} onChange={(e) => setObjeto(e.target.value)} placeholder="ex.: aquisição de ambulância" className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-800" />
        </label>
        <label className="text-[11px] text-slate-600">Valor (R$)
          <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="ex.: 500.000,00" className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-800" />
        </label>
      </div>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-[11px] leading-relaxed text-slate-700">{texto}</pre>
      <div className="mt-2 flex gap-2">
        <button onClick={copiar} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-700"><Copy className="h-3.5 w-3.5" /> {copiado ? "Copiado!" : "Copiar"}</button>
        <button onClick={baixar} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" /> Baixar (Word)</button>
      </div>
      <p className="mt-1 text-[10px] text-slate-400">Modelo de referência — ajuste ao padrão de ofício do município e anexe o plano de trabalho. O tratamento e os dados do prefeito devem ser conferidos.</p>
    </div>
  );
}
