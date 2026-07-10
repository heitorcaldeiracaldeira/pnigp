"use client";
// Construtor de Termo de Referência (Lei 14.133/2021) — MVP do módulo "processo licitatório perfeito".
// Guia o gestor pela especificação, injetando: classificação CATMAT/CATSER + preço de referência (Banco de Preços),
// checador anti-superespecificação em tempo real (tese descrição→disputa→preço), recomendação de modalidade/critério
// e checklist TCE-SC. Ao final, emite o TR imprimível. Padrão de artefato do módulo PME.
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Search, AlertTriangle, ShieldCheck, Printer, Info } from "lucide-react";
import {
  SECOES_TR, checarEspecificacao, escoreAbertura, recomendarModalidade, CHECKLIST_TR,
  TIPO_OBJETO_LABEL, type TipoObjeto, type AlertaEspec,
} from "@/lib/tr-modelo";

type Preco = { item: string; unidade: string | null; mediana: number; faixaMin: number | null; faixaMax: number | null; n: number; nMunis: number | null; fonte: string; catmat: string | null; nacMediana: number | null };
const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: string) => String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));

export function ConstrutorTR({ nome }: { nome: string }) {
  const [objeto, setObjeto] = useState("");
  const [tipo, setTipo] = useState<TipoObjeto>("bem_comum");
  const [qtd, setQtd] = useState<number>(0);
  const [unidade, setUnidade] = useState("");
  const [espec, setEspec] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [busca, setBusca] = useState("");
  const [precos, setPrecos] = useState<Preco[]>([]);
  const [ref, setRef] = useState<Preco | null>(null);
  const [check, setCheck] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // busca de preço de referência (reusa /api/banco-precos → CATMAT + mediana)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (busca.trim().length < 2) { setPrecos([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/banco-precos?q=" + encodeURIComponent(busca.trim()));
        const j = await r.json();
        setPrecos((j.resultados || []).slice(0, 6));
      } catch { setPrecos([]); }
    }, 400);
  }, [busca]);

  const alertas = useMemo(() => checarEspecificacao(espec), [espec]);
  const abertura = useMemo(() => escoreAbertura(alertas), [alertas]);
  const valorEstimado = useMemo(() => (ref && qtd > 0 ? ref.mediana * qtd : 0), [ref, qtd]);
  const rec = useMemo(() => recomendarModalidade(tipo, valorEstimado), [tipo, valorEstimado]);
  const nCheck = Object.values(check).filter(Boolean).length;

  const aberturaCor = abertura >= 80 ? "#059669" : abertura >= 50 ? "#d97706" : "#dc2626";
  const aberturaLbl = abertura >= 80 ? "boa abertura à concorrência" : abertura >= 50 ? "atenção — há restrições" : "alto risco de direcionamento";

  function gerarDocumento() {
    const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const val = (s: string) => {
      if (s === "objeto") return esc(objeto) || "<i>[definir o objeto]</i>";
      if (s === "requisitos") return esc(espec).replace(/\n/g, "<br>") || "<i>[especificação técnica]</i>";
      if (s === "fundamentacao") return esc(justificativa).replace(/\n/g, "<br>") || "<i>[fundamentar a necessidade — ver ETP/PCA]</i>";
      if (s === "selecao") return `<b>${esc(rec.modalidade)}</b> — critério: ${esc(rec.criterio)}.<br><span style="color:#475569">${esc(rec.justificativa)} (${esc(rec.base)})</span>`;
      if (s === "preco") return ref
        ? `Valor unitário de referência (mediana): <b>${brl(ref.mediana)}</b> por ${esc(ref.unidade || "unidade")}${ref.n ? ` — base ${ref.n} compras em ${ref.nMunis} municípios` : ""}.${qtd > 0 ? ` Quantidade: <b>${qtd.toLocaleString("pt-BR")}</b>. Valor total estimado: <b>${brl(valorEstimado)}</b>.` : ""}<br><span style="color:#475569">Fonte: ${esc(ref.fonte)}. Medida: mediana (IN SEGES/ME 65/2021).</span>`
        : "<i>[realizar pesquisa de preços — IN 65/2021]</i>";
      return `<i>[${esc(SECOES_TR.find((x) => x.chave === s)?.ajuda || "")}]</i>`;
    };
    const secoes = SECOES_TR.map((sec, i) => `<h2>${i + 1}. ${esc(sec.titulo)} <span class="lb">(${esc(sec.base)})</span></h2><p>${val(sec.chave)}</p>`).join("");
    const checklist = CHECKLIST_TR.map((c) => `<tr><td style="text-align:center">${check[c.chave] ? "☑" : "☐"}</td><td>${esc(c.texto)}</td><td class="lb">${esc(c.base)}</td></tr>`).join("");
    const alertasHtml = alertas.length
      ? `<div class="warn"><b>Pontos de atenção na especificação (abertura à concorrência: ${abertura}/100):</b><ul>${alertas.map((a) => `<li><b>“${esc(a.termo)}”</b> — ${esc(a.motivo)} <i>Sugestão:</i> ${esc(a.sugestao)} <span class="lb">(${esc(a.base)})</span></li>`).join("")}</ul></div>`
      : `<div class="ok"><b>Especificação sem termos restritivos detectados</b> — boa abertura à concorrência (${abertura}/100).</div>`;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termo de Referência — ${esc(nome)}</title>
<style>
@page { size: A4; margin: 22mm 18mm; }
* { box-sizing: border-box; }
body { font-family: Georgia,'Times New Roman',serif; color:#1e293b; line-height:1.5; font-size:11.5pt; }
h1 { font-size:16pt; text-align:center; margin:0 0 2px; }
h2 { font-size:12.5pt; border-bottom:2px solid #0f766e; color:#0f766e; padding-bottom:3px; margin:18px 0 6px; }
.lb { font-size:8.5pt; color:#64748b; font-weight:normal; }
.sub { text-align:center; color:#475569; font-size:10pt; } .base { text-align:center; color:#64748b; font-size:9pt; margin-bottom:14px; }
table { width:100%; border-collapse:collapse; margin:8px 0; font-size:9.5pt; } th,td { border:1px solid #cbd5e1; padding:4px 7px; text-align:left; } th { background:#f0fdfa; color:#0f766e; }
.warn { border:1px solid #fbbf24; background:#fffbeb; border-radius:6px; padding:10px; margin:8px 0; font-size:9.5pt; } .warn ul { margin:6px 0 0 0; padding-left:18px; }
.ok { border:1px solid #6ee7b7; background:#ecfdf5; border-radius:6px; padding:10px; margin:8px 0; font-size:9.5pt; }
.assin { margin-top:38px; display:flex; justify-content:space-around; text-align:center; font-size:10pt; } .assin div { border-top:1px solid #334155; width:40%; padding-top:4px; }
.foot { margin-top:20px; border-top:1px solid #e2e8f0; padding-top:8px; font-size:8pt; color:#94a3b8; text-align:center; }
.bar { position:sticky; top:0; background:#0f766e; color:#fff; padding:8px 14px; font-family:system-ui,sans-serif; font-size:12px; display:flex; gap:10px; align-items:center; }
.bar button { background:#fff; color:#0f766e; border:none; border-radius:6px; padding:6px 12px; font-weight:600; cursor:pointer; }
@media print { .bar { display:none; } }
</style></head><body>
<div class="bar">Termo de Referência gerado — revise e ajuste antes de usar no processo. <button onclick="window.print()">Salvar como PDF / Imprimir</button></div>
<div style="padding:0 4px">
<h1>Termo de Referência</h1>
<div class="sub"><b>Prefeitura Municipal de ${esc(nome)}</b></div>
<div class="base">Elaborado conforme a Lei nº 14.133/2021 (art. 6º, XXIII) · gerado pela PNIGP em ${hoje}</div>
${secoes}
<h2>${SECOES_TR.length + 1}. Análise de abertura à concorrência</h2>
${alertasHtml}
<h2>${SECOES_TR.length + 2}. Checklist de conformidade (${nCheck}/${CHECKLIST_TR.length})</h2>
<table><thead><tr><th style="width:8%">✓</th><th>Requisito</th><th style="width:32%">Base legal</th></tr></thead><tbody>${checklist}</tbody></table>
<div class="assin"><div>Responsável pela elaboração</div><div>Autoridade competente</div></div>
<div class="foot">Documento gerado como MINUTA de apoio à elaboração, a partir de bases públicas (PNCP, CATMAT/CATSER) e da legislação vigente. Não substitui a análise técnica e jurídica do órgão. PNIGP · Instituto i10.</div>
</div></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  const podeGerar = objeto.trim().length > 2;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-teal-700"><FileText className="h-4 w-4" /> Construtor de Termo de Referência</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">novo</span>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">Monte a especificação da compra com a legislação (Lei 14.133/2021) e os dados da plataforma: preço de referência do Banco de Preços, classificação CATMAT/CATSER e um checador que evita a superespecificação — a redação restritiva é o que <b>fecha a disputa e encarece</b>. Ao final, gere o TR pronto para revisar e imprimir.</p>

      {/* 1. Objeto + tipo */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] font-medium text-slate-600">Objeto da contratação
          <input value={objeto} onChange={(e) => setObjeto(e.target.value)} placeholder="Ex.: Aquisição de material de expediente" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500" />
        </label>
        <label className="text-[12px] font-medium text-slate-600">Natureza do objeto
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoObjeto)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500">
            {(Object.keys(TIPO_OBJETO_LABEL) as TipoObjeto[]).map((t) => <option key={t} value={t}>{TIPO_OBJETO_LABEL[t]}</option>)}
          </select>
        </label>
      </div>

      {/* 2. Preço de referência (Banco de Preços) */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700"><Search className="h-3.5 w-3.5 text-teal-600" /> Preço de referência (Banco de Preços)</div>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar o item (ex.: caneta, dipirona, pneu)…" className="w-full bg-transparent text-sm outline-none" />
        </div>
        {precos.length > 0 && (
          <div className="mt-2 space-y-1">
            {precos.map((p, i) => (
              <button key={i} onClick={() => { setRef(p); setUnidade(p.unidade || ""); }} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${ref?.item === p.item ? "border-teal-500 bg-teal-50" : "border-slate-100 bg-white hover:border-slate-300"}`}>
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600">{p.item}{p.catmat ? <span className="ml-1 text-[9px] text-slate-400">CATMAT {p.catmat}</span> : null}</span>
                <span className="shrink-0 text-[12px] font-bold tabular-nums text-teal-700">{brl(p.mediana)}<span className="ml-0.5 text-[9px] font-normal text-slate-400">/{p.unidade || "un"}</span></span>
              </button>
            ))}
          </div>
        )}
        {ref && (
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-teal-50 px-3 py-2 text-[12px]">
            <span className="text-slate-600">Referência: <b className="text-teal-700">{brl(ref.mediana)}</b>/{ref.unidade || "un"}{ref.catmat ? <span className="ml-1 text-[10px] text-slate-400">CATMAT {ref.catmat}</span> : null}</span>
            <label className="ml-auto text-slate-600">Qtd.: <input type="number" min={0} value={qtd || ""} onChange={(e) => setQtd(Number(e.target.value) || 0)} className="w-24 rounded border border-slate-300 px-2 py-0.5 text-right text-sm" /> {unidade}</label>
            {valorEstimado > 0 && <span className="rounded-full bg-teal-700 px-2 py-0.5 font-bold text-white">Estimado: {brl(valorEstimado)}</span>}
          </div>
        )}
      </div>

      {/* 3. Especificação + checador anti-superespecificação */}
      <div className="mt-4">
        <label className="text-[12px] font-medium text-slate-600">Especificação técnica (requisitos)
          <textarea value={espec} onChange={(e) => setEspec(e.target.value)} rows={4} placeholder="Descreva por desempenho e função. Evite marca, modelo, “primeira linha” — descreva o que o item precisa fazer." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500" />
        </label>
        {espec.trim().length > 2 && (
          <div className="mt-2">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-semibold text-slate-600">Abertura à concorrência:</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: abertura + "%", background: aberturaCor }} /></div>
              <span className="font-bold tabular-nums" style={{ color: aberturaCor }}>{abertura}/100</span>
              <span className="text-slate-500">{aberturaLbl}</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {alertas.length === 0
                ? <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Sem termos restritivos detectados — a redação favorece a disputa.</div>
                : alertas.map((a: AlertaEspec, i) => (
                  <div key={i} className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${a.severidade === "alto" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                    <div className="flex items-center gap-1.5 font-semibold" style={{ color: a.severidade === "alto" ? "#b91c1c" : "#b45309" }}><AlertTriangle className="h-3.5 w-3.5" /> “{a.termo}” — {a.motivo}</div>
                    <div className="mt-0.5 pl-5 text-slate-600"><b>Sugestão:</b> {a.sugestao} <span className="text-slate-400">({a.base})</span></div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Fundamentação */}
      <div className="mt-4">
        <label className="text-[12px] font-medium text-slate-600">Fundamentação da necessidade
          <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={2} placeholder="Por que a Administração precisa contratar — referencie o ETP e o PCA quando houver." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500" />
        </label>
      </div>

      {/* 5. Recomendação de modalidade */}
      <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-[12px]">
        <div className="flex items-center gap-1.5 font-semibold text-indigo-700"><Info className="h-3.5 w-3.5" /> Modalidade e critério recomendados</div>
        <div className="mt-1 text-slate-700"><b>{rec.modalidade}</b> — critério: {rec.criterio}.</div>
        <div className="mt-0.5 text-slate-500">{rec.justificativa} <span className="text-slate-400">({rec.base})</span></div>
        {rec.avisos.map((av, i) => <div key={i} className="mt-1 text-[11px] text-amber-700">⚠ {av}</div>)}
      </div>

      {/* 6. Checklist */}
      <div className="mt-4">
        <div className="text-[12px] font-semibold text-slate-700">Checklist de conformidade <span className="text-slate-400">({nCheck}/{CHECKLIST_TR.length})</span></div>
        <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
          {CHECKLIST_TR.map((c) => (
            <label key={c.chave} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 text-[11px] hover:bg-slate-50">
              <input type="checkbox" checked={!!check[c.chave]} onChange={(e) => setCheck((s) => ({ ...s, [c.chave]: e.target.checked }))} className="mt-0.5 accent-teal-600" />
              <span className="text-slate-600">{c.texto} <span className="text-slate-400">({c.base})</span></span>
            </label>
          ))}
        </div>
      </div>

      {/* Gerar */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-[11px] text-slate-400">Minuta de apoio — não substitui a análise técnica e jurídica do órgão.</p>
        <button disabled={!podeGerar} onClick={gerarDocumento} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          <Printer className="h-4 w-4" /> Gerar Termo de Referência
        </button>
      </div>
    </section>
  );
}
