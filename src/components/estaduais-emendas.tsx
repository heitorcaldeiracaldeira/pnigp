"use client";

import { useMemo, useState } from "react";
import { Landmark, Vote, Info, FileText, Copy, Download, Mail, Phone, ExternalLink } from "lucide-react";
import type { EmendasEstaduaisSC, PerfilNecessidade, CadernoPrograma } from "@/lib/queries";
import { CadernoSugestoes } from "@/components/captacao-emendas";
import { htmlDoc, SECRETARIAS_ESTADUAIS, rotuloAreaPub } from "@/lib/caderno-emendas";

const nf = (n: number) => Number(n).toLocaleString("pt-BR");

export function EstaduaisEmendas({ data, nome, necessidade, cod, programas = [] }: { data: NonNullable<EmendasEstaduaisSC>; nome: string; necessidade?: PerfilNecessidade | null; cod?: string; programas?: CadernoPrograma[] }) {
  const { bench, eleitores } = data;
  const comVotos = bench.filter((b) => b.votos > 0);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-violet-50 to-white p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Landmark aria-hidden className="h-4 w-4 text-violet-600" /> Emendas Parlamentares Estaduais · {nome}</div>
        <p className="mt-1 text-sm text-slate-600">Os <b>40 deputados estaduais</b> da ALESC também destinam <b>emendas impositivas</b> ao orçamento do Estado (LOA estadual), executadas pela SEF-SC via transferência especial. Aqui: quem procurar (por votos no município), como pedir e um caderno de sugestões voltado às <b>Secretarias de Estado de SC</b>.</p>
      </div>

      {/* Quem procurar — bancada estadual */}
      <div>
        <div className="mb-1 text-sm font-semibold text-slate-800">Quem procurar — bancada estadual (ALESC)</div>
        <p className="mb-2 text-[11px] text-slate-500">40 deputados estaduais eleitos em 2022, em <b>ordem alfabética</b>. {comVotos.length} tiveram votos em {nome} (a base eleitoral local é o maior vínculo). O % é sobre o eleitorado do município.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {bench.map((b, i) => (
            <div key={i} className={`flex items-center gap-3 rounded-xl border p-3 ${b.votos > 0 ? "border-violet-200 bg-violet-50/40" : "border-slate-200 bg-white"}`}>
              {b.foto ? <img src={b.foto} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" /> : <div className="h-11 w-11 shrink-0 rounded-full bg-slate-200" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">{b.nome}</div>
                <div className="text-[11px] text-slate-500">Dep. Estadual · {b.partido}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] tabular-nums text-slate-600">
                  <Vote aria-hidden className="h-3 w-3 text-slate-400" />
                  {b.votos > 0 ? <span className="font-semibold text-slate-700">{nf(b.votos)} votos{b.votosPct > 0 ? <span className="text-violet-700"> · {b.votosPct.toLocaleString("pt-BR")}% do eleitorado</span> : null}</span> : <span className="text-slate-400">sem votos no município</span>}
                </div>
                {b.emendasTotal > 0 && <div className="text-[11px] tabular-nums text-slate-600"><b className="text-violet-700">{b.emendasTotal >= 1e6 ? "R$ " + (b.emendasTotal / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : "R$ " + b.emendasTotal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</b> em emendas (total no estado)</div>}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {b.email && <a href={`mailto:${b.email}`} title={b.email} className="text-slate-400 hover:text-violet-600"><Mail className="h-4 w-4" /></a>}
                {b.telefone && <span title={b.telefone} className="text-slate-400"><Phone className="h-4 w-4" /></span>}
                {b.pagina && <a href={b.pagina} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-violet-600"><ExternalLink className="h-4 w-4" /></a>}
              </div>
            </div>
          ))}
        </div>
        {eleitores > 0 && <p className="mt-1 text-[11px] text-slate-400">Eleitorado de {nome}: {nf(eleitores)} (TSE 2022).</p>}
      </div>

      {/* Como pedir — impositivas estaduais */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex items-center gap-1 text-sm font-semibold text-slate-800"><Info aria-hidden className="h-4 w-4 text-violet-600" /> Como pedir — emenda impositiva estadual</div>
        <ol className="mt-2 grid gap-2 text-[12px] text-slate-700 sm:grid-cols-2">
          {[
            ["1. Defina o projeto", "Necessidade + objeto + valor, mapeado à Secretaria de Estado da área (SES, SED, SIE, etc.)."],
            ["2. Escolha o deputado estadual", "Priorize quem tem base de votos no município (acima). Cada deputado tem cota impositiva anual na LOA estadual."],
            ["3. Procure o gabinete na ALESC", "Ofício + projeto pronto; o deputado indica a emenda na tramitação da LOA estadual."],
            ["4. Execução pela SEF-SC", "Após a LOA, a SEF-SC executa via transferência especial ao município; acompanhe o pagamento no painel da SEF."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-lg border border-slate-200 bg-white p-2"><span className="font-semibold text-slate-800">{t}.</span> {d.replace(/^[^.]+\. /, "")}</li>
          ))}
        </ol>
        <OficioEstadual bench={bench} nome={nome} />
      </div>

      {/* O que a emenda estadual financia — Secretarias de Estado (o "QDD" das emendas estaduais) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-1 text-sm font-semibold text-slate-800"><Landmark aria-hidden className="h-4 w-4 text-violet-600" /> O que a emenda estadual financia — por Secretaria de Estado</div>
        <p className="text-[11px] text-slate-500">A emenda impositiva estadual é executada por uma Secretaria de Estado. Escolha a área, defina o objeto e direcione o pedido à secretaria correta.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {[...SECRETARIAS_ESTADUAIS].sort((a, b) => {
            const def = (k: string) => ((necessidade as Record<string, { deficit: boolean } | null> | null | undefined)?.[k]?.deficit ? 0 : 1);
            return def(a.area) - def(b.area);
          }).map((s) => {
            const deficit = (necessidade as Record<string, { deficit: boolean } | null> | null | undefined)?.[s.area]?.deficit;
            return (
              <div key={s.orgao} className={`rounded-lg border p-2.5 ${deficit ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-slate-50/40"}`}>
                <div className="flex items-center gap-1 text-[12px] font-semibold text-slate-800">{rotuloAreaPub(s.area)} {deficit && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700">déficit no município</span>}</div>
                <div className="text-[11px] text-slate-600">{s.orgao}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{s.finalidades}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Caderno de sugestões — escopo estadual (objetos reais 2026 como possibilidades; contagem pedido×realizado por deputado) */}
      <CadernoSugestoes necessidade={necessidade} nome={nome} programas={programas} escopo="estadual" cod={cod} parlamentares={bench.map((b) => ({ nome: b.nome, entregue: b.emendasTotal }))} />

      <p className="text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><FileText aria-hidden className="h-3 w-3" /> Dados oficiais</span>Bancada e votos: TSE (eleição 2022, deputados estaduais eleitos). Regras: ALESC — Manual de Emendas Impositivas. Execução por município: painel da SEF-SC (Power BI). Conteúdo apartidário.</p>
    </section>
  );
}

function OficioEstadual({ bench, nome }: { bench: NonNullable<EmendasEstaduaisSC>["bench"]; nome: string }) {
  const [idx, setIdx] = useState(0);
  const [objeto, setObjeto] = useState("");
  const [valor, setValor] = useState("");
  const [area, setArea] = useState("Saúde");
  const [copiado, setCopiado] = useState(false);
  const p = bench[idx];
  const texto = useMemo(() => {
    const obj = objeto.trim() || "[objeto: obra, equipamento ou custeio]";
    const val = valor.trim() ? `no valor de R$ ${valor.trim()}` : "no valor de R$ [valor]";
    return `OFÍCIO Nº ____/${new Date().getFullYear()} — Gabinete do Prefeito de ${nome}

A Sua Excelência o(a) Deputado(a) Estadual ${p?.nome || "[deputado]"}${p?.partido ? ` (${p.partido})` : ""}
Assembleia Legislativa do Estado de Santa Catarina — ALESC

Assunto: Solicitação de emenda parlamentar impositiva estadual — ${area}

Senhor(a) Deputado(a),

O Município de ${nome} solicita o apoio de Vossa Excelência por meio de emenda parlamentar impositiva ao orçamento do Estado ${val}, para ${obj}, na área de ${area}, a ser executada pela Secretaria de Estado competente via transferência especial.

Colocamo-nos à disposição para apresentar o plano de trabalho e a documentação técnica.

Respeitosamente,
${nome}, ${new Date().toLocaleDateString("pt-BR")}.

_______________________________
Prefeito(a) Municipal de ${nome}`;
  }, [p, objeto, valor, area, nome]);
  const copiar = () => { navigator.clipboard?.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); };
  const baixar = () => { const esc = texto.replace(/&/g, "&amp;").replace(/</g, "&lt;"); const html = htmlDoc("Ofício estadual — " + nome, `<pre style="font-family:Calibri,Arial,sans-serif;font-size:11pt;white-space:pre-wrap">${esc}</pre>`); const b = new Blob(["﻿", html], { type: "application/msword" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `oficio-emenda-estadual-${nome.toLowerCase().replace(/\s+/g, "-")}.doc`; a.click(); };

  return (
    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex items-center gap-1 text-[12px] font-semibold text-slate-800"><FileText aria-hidden className="h-3.5 w-3.5 text-violet-600" /> Gerador de ofício ao deputado estadual</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] text-slate-600">Deputado(a)
          <select value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-800">
            {bench.map((b, i) => <option key={i} value={i}>{b.nome} ({b.partido})</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-600">Área
          <select value={area} onChange={(e) => setArea(e.target.value)} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-800">
            {["Saúde", "Educação", "Infraestrutura", "Assistência Social", "Agricultura", "Esporte e Lazer", "Cultura"].map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-600">Objeto
          <input value={objeto} onChange={(e) => setObjeto(e.target.value)} placeholder="ex.: aquisição de ambulância" className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px]" />
        </label>
        <label className="text-[11px] text-slate-600">Valor (R$)
          <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="ex.: 300.000,00" className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px]" />
        </label>
      </div>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-[11px] leading-relaxed text-slate-700">{texto}</pre>
      <div className="mt-2 flex gap-2">
        <button onClick={copiar} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-violet-700"><Copy className="h-3.5 w-3.5" /> {copiado ? "Copiado!" : "Copiar"}</button>
        <button onClick={baixar} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" /> Baixar (Word)</button>
      </div>
    </div>
  );
}
