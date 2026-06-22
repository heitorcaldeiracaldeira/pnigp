"use client";

import { useState } from "react";
import { Gauge, BarChart3, ClipboardCheck, Database } from "lucide-react";
import type { PadroesComprasSC, ContratosResumoSC, PcaResumoSC, EconomicidadeSC } from "@/lib/queries";
import { fmtBRL, fmtBRLCompact } from "@/lib/ui";
import { CICLO_COMPRAS, DOUTRINADORES, MATERIAIS_LIVRES } from "@/lib/compras-doutrina";

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
type Visao = "estrategico" | "tatico" | "operacional" | "tecnico";
const PILULAS: { id: Visao; label: string; icon: typeof Gauge; desc: string }[] = [
  { id: "estrategico", label: "Estratégico", icon: Gauge, desc: "Como compra e por que importa" },
  { id: "tatico", label: "Tático", icon: BarChart3, desc: "Como e quando compra · onde está o gargalo" },
  { id: "operacional", label: "Operacional", icon: ClipboardCheck, desc: "O que fazer para comprar melhor" },
  { id: "tecnico", label: "Técnico", icon: Database, desc: "A prova: série, doutrina e fontes" },
];

export function AssuntoPadroesCompras({ dados, contratos, pca, economia, nome }: { dados: PadroesComprasSC; contratos?: ContratosResumoSC | null; pca?: PcaResumoSC | null; economia?: EconomicidadeSC; nome: string }) {
  const [v, setV] = useState<Visao>("estrategico");
  if (!dados) return null;
  const { totalN, totalValor, porModalidade, porMes, serieAnual, dispensaPct, q4Pct, mesPico } = dados;
  const maxMes = Math.max(1, ...porMes.map((m) => m.n));
  const maxMod = Math.max(1, ...porModalidade.map((m) => m.n));
  const maxAnoV = Math.max(1, ...serieAnual.map((a) => a.valor));
  const empenhadoContr = (contratos?.por_fornecedor || []).reduce((s, f) => s + (f.empenhado || 0), 0);
  const top1 = contratos?.por_fornecedor?.[0];
  const top1Pct = contratos && contratos.valor_total > 0 && top1 ? (top1.valor / contratos.valor_total) * 100 : 0;

  // accountability — funil do ciclo (planejado → licitado → contratado → executado)
  const funil = [
    { etapa: "Planejado (PCA)", valor: pca?.valor_total ?? null, sub: pca ? `${pca.n_itens} itens` : "sem PCA publicado" },
    { etapa: "Licitado (processos)", valor: totalValor, sub: `${totalN.toLocaleString("pt-BR")} processos` },
    { etapa: "Contratado", valor: contratos?.valor_total ?? null, sub: contratos ? `${contratos.n} contratos` : "—" },
    { etapa: "Executado (empenhado)", valor: empenhadoContr || null, sub: "nos contratos" },
  ];

  const recs: { txt: string; fonte: string; nivel: "alerta" | "dica" }[] = [];
  if (q4Pct > 35) recs.push({ txt: `${q4Pct.toFixed(0)}% das compras saem no último trimestre — sinal de planejamento tardio. Antecipe o PCA para diluir a demanda e evitar compras emergenciais.`, fonte: "Justen Filho — planejamento é pilar (art. 12)", nivel: "alerta" });
  if (dispensaPct > 40) recs.push({ txt: `${dispensaPct.toFixed(0)}% dos processos são dispensa/inexigibilidade. Verifique fracionamento do mesmo objeto ao longo do ano — agrupar pode exigir (e viabilizar) pregão/registro de preços.`, fonte: "Jacoby Fernandes — vedação ao fracionamento (art. 75, §1º)", nivel: "alerta" });
  if (top1Pct > 30) recs.push({ txt: `Um único fornecedor concentra ${top1Pct.toFixed(0)}% do valor contratado. Avalie ampliar a competição e revisar a especificação para não restringir o mercado.`, fonte: "Niebuhr — competitividade/isonomia", nivel: "alerta" });
  recs.push({ txt: `Para itens recorrentes (combustível, material de consumo, gêneros), planeje via Sistema de Registro de Preços (ata): registra preço sem obrigar a compra imediata e ganha escala.`, fonte: "Jacoby Fernandes — SRP", nivel: "dica" });
  recs.push({ txt: `Dispensa por pequeno valor é legítima quando licitar custa mais que o benefício — registre a justificativa de economicidade no processo.`, fonte: "Justen Filho — custo × benefício", nivel: "dica" });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">🧭 Compras — padrões e planejamento</h2>
        <p className="mt-1 text-sm text-slate-500">Como {nome} compra hoje (todos os processos do PNCP, qualquer situação), para planejar melhor — do panorama à prova. {totalN.toLocaleString("pt-BR")} processos · {fmtBRLCompact(totalValor)} estimados.</p>
      </div>

      {/* pílulas das 4 visões */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PILULAS.map((p) => {
          const Icon = p.icon; const on = v === p.id;
          return (
            <button key={p.id} onClick={() => setV(p.id)} className={`rounded-xl border p-3 text-left transition ${on ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300"}`}>
              <div className="flex items-center gap-1.5"><Icon className={`h-4 w-4 ${on ? "text-teal-600" : "text-slate-400"}`} /><span className={`text-sm font-semibold ${on ? "text-teal-800" : "text-slate-700"}`}>{p.label}</span></div>
              <p className="mt-0.5 text-[11px] text-slate-500">{p.desc}</p>
            </button>
          );
        })}
      </div>

      {/* ESTRATÉGICO */}
      {v === "estrategico" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi t="Processos" v={totalN.toLocaleString("pt-BR")} s="todas as situações" />
            <Kpi t="Valor estimado" v={fmtBRLCompact(totalValor)} s="soma dos processos" />
            <Kpi t="Dispensa/inexig." v={`${dispensaPct.toFixed(0)}%`} s="dos processos" alerta={dispensaPct > 40} />
            <Kpi t="Concentração fim de ano" v={`${q4Pct.toFixed(0)}%`} s="no 4º trimestre" alerta={q4Pct > 35} />
          </div>

          {/* cadeia de valor das compras */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">A cadeia de valor da compra</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Cadeia emoji="💰" titulo="Dinheiro" valor={fmtBRLCompact(totalValor)} desc="recursos mobilizados em contratações" cor="amber" />
              <Cadeia emoji="🏭" titulo="Produção" valor={`${totalN.toLocaleString("pt-BR")} proc.${contratos ? ` · ${contratos.n} contratos` : ""}`} desc="licitações e contratos gerados" cor="sky" />
              <Cadeia emoji="❤️" titulo="Benefício" valor="Bens e serviços" desc="entregues à população (saúde, educação, obras)" cor="rose" />
            </div>
          </div>

          {/* accountability — funil */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">Do plano à entrega (accountability)</h3>
            <p className="mb-3 text-xs text-slate-500">Planejou → licitou → contratou → executou. Quebras entre as etapas mostram onde o ciclo trava.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {funil.map((f, i) => (
                <div key={f.etapa} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-400">{i + 1}. {f.etapa}</div>
                  <div className="mt-1 text-lg font-bold tabular-nums text-slate-800">{f.valor != null ? fmtBRLCompact(f.valor) : "—"}</div>
                  <div className="text-[11px] text-slate-500">{f.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {economia && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
              <h3 className="text-sm font-semibold text-slate-800">💸 Economicidade — preço estimado → homologado</h3>
              <p className="mb-2 text-xs text-slate-500">Quanto a disputa reduziu o preço unitário (estimado → homologado), por item. Medimos pela <b>mediana</b> (robusta a erros e a quantidades de registro de preço).</p>
              <div className="flex flex-wrap items-end gap-6">
                <div><div className="text-3xl font-bold text-emerald-600">{economia.economiaMediana != null ? economia.economiaMediana.toFixed(1) : "—"}%</div><div className="text-[11px] text-slate-500">economia típica por item (mediana)</div></div>
                <div><div className="text-base font-semibold tabular-nums text-slate-700">{economia.nItens.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-500">itens com preço homologado</div></div>
              </div>
              {economia.porModalidade.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Por modalidade — competição gera economia</div>
                  <div className="space-y-1">
                    {economia.porModalidade.map((m) => (
                      <div key={m.modalidade} className="flex items-center gap-2 text-xs">
                        <span className="w-44 shrink-0 truncate text-slate-600">{m.modalidade}</span>
                        <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className={`h-3 rounded ${m.mediana >= 5 ? "bg-emerald-500" : "bg-slate-300"}`} style={{ width: `${Math.min(100, m.mediana * 2)}%` }} /></div>
                        <span className="w-24 shrink-0 text-right tabular-nums text-slate-700">{m.mediana.toFixed(1)}% · {m.n.toLocaleString("pt-BR")}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">Modalidades competitivas (pregão, concorrência, concurso, diálogo competitivo) reduzem preço; <b>dispensa e inexigibilidade</b> (contratação direta) tendem a ~0%.</p>
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-400">Metodologia: preço unitário por item; exclui {economia.nOutliers.toLocaleString("pt-BR")} itens com erro de digitação (homologado &gt; estimado, ou economia &gt; 95%). <b>Não somamos R$ total</b> — a base inclui registro de preço (quantidade máxima ≠ comprada). A economia em R$ <b>por contrato</b> (real) está na aba Contratos.</p>
            </div>
          )}

          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><b>Leitura:</b> {nome} mobiliza {fmtBRLCompact(totalValor)} em {totalN.toLocaleString("pt-BR")} processos. {dispensaPct > 40 ? `A alta proporção de dispensa (${dispensaPct.toFixed(0)}%) e ` : ""}{q4Pct > 35 ? `a concentração no fim do ano (${q4Pct.toFixed(0)}%) sugerem ganhos com planejamento antecipado.` : "o padrão pode ser otimizado com planejamento e registro de preços."} Veja o que fazer na visão <b>Operacional</b>.</p>
        </div>
      )}

      {/* TÁTICO */}
      {v === "tatico" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">📅 Quando compra (sazonalidade)</h3>
            <p className="mb-3 text-xs text-slate-500">Processos por mês (todos os anos). Pico em <b>{MES[mesPico - 1]}</b>; {q4Pct.toFixed(0)}% no 4º trimestre {q4Pct > 35 ? "— concentração alta (gargalo de planejamento)" : ""}.</p>
            <div className="flex items-end gap-1.5" style={{ height: 110 }}>
              {porMes.map((m) => (
                <div key={m.mes} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <div className={`w-full rounded-t ${m.mes >= 10 ? "bg-amber-400" : "bg-teal-500"}`} style={{ height: `${(m.n / maxMes) * 90}px` }} title={`${m.n}`} />
                  <span className="text-[10px] text-slate-400">{MES[m.mes - 1]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">⚖️ Como compra (modalidades)</h3>
            <p className="mb-3 text-xs text-slate-500">Distribuição dos processos. Dispensa/inexigibilidade = <b>{dispensaPct.toFixed(0)}%</b>{dispensaPct > 40 ? " — verifique fracionamento" : ""}.</p>
            <div className="space-y-1.5">
              {porModalidade.slice(0, 8).map((m) => (
                <div key={m.modalidade} className="flex items-center gap-2 text-xs">
                  <span className="w-40 shrink-0 truncate text-slate-600" title={m.modalidade}>{m.modalidade}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100"><div className={`h-4 rounded ${/dispensa|inexig/i.test(m.modalidade) ? "bg-amber-400" : "bg-teal-500"}`} style={{ width: `${(m.n / maxMod) * 100}%` }} /></div>
                  <span className="w-24 shrink-0 text-right tabular-nums text-slate-500">{m.n.toLocaleString("pt-BR")} · {m.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* OPERACIONAL */}
      {v === "operacional" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-5">
            <h3 className="text-sm font-semibold text-slate-800">✅ O que fazer para comprar melhor</h3>
            <div className="mt-3 space-y-2.5">
              {recs.map((r, i) => (
                <div key={i} className={`rounded-xl border bg-white p-3 ${r.nivel === "alerta" ? "border-amber-200" : "border-slate-200"}`}>
                  <div className="flex items-start gap-2"><span>{r.nivel === "alerta" ? "⚠️" : "💡"}</span><div><p className="text-sm text-slate-700">{r.txt}</p><p className="mt-1 text-[11px] text-slate-400">Base: {r.fonte}</p></div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">🔄 O ciclo da contratação (passo a passo)</h3>
            <p className="mb-3 text-xs text-slate-500">As quatro fases (Lei 14.133), com boas práticas e os autores que as fundamentam.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {CICLO_COMPRAS.map((f) => (
                <div key={f.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-sm font-semibold text-slate-800">{f.emoji} {f.titulo}</div>
                  <p className="mt-0.5 text-xs text-slate-600">{f.resumo}</p>
                  <ul className="mt-2 space-y-1">{f.praticas.map((p, i) => <li key={i} className="flex gap-1.5 text-[12px] text-slate-600"><span className="text-teal-600">•</span><span>{p}</span></li>)}</ul>
                  <div className="mt-2 flex flex-wrap gap-1">{f.autores.map((a) => <span key={a} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{a}</span>)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TÉCNICO */}
      {v === "tecnico" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">📈 Evolução anual</h3>
            <p className="mb-3 text-xs text-slate-500">Nº de processos e valor estimado por ano (fonte: PNCP).</p>
            <div className="flex items-end gap-3" style={{ height: 110 }}>
              {serieAnual.map((a) => (
                <div key={a.ano} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] tabular-nums text-slate-500">{fmtBRLCompact(a.valor)}</span>
                  <div className="w-full rounded-t bg-teal-500" style={{ height: `${(a.valor / maxAnoV) * 70}px` }} />
                  <span className="text-[10px] text-slate-400">{a.ano}</span><span className="text-[10px] tabular-nums text-slate-400">{a.n}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">📚 Base metodológica (doutrina)</h3>
            <p className="mb-3 text-xs text-slate-500">Linha de contribuição de cada autor — base metodológica, exibição neutra.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {DOUTRINADORES.map((d) => (
                <div key={d.nome} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[13px] font-semibold text-slate-800">{d.nome}</div>
                  <p className="mt-0.5 text-[11px] text-slate-500">{d.foco}</p>
                  {d.obra && <p className="mt-1 text-[11px] italic text-slate-400">📖 {d.obra}</p>}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-5">
            <h3 className="text-sm font-semibold text-slate-800">🔗 Biblioteca de materiais (gratuitos e oficiais)</h3>
            <p className="mb-3 text-xs text-slate-500">Órgãos de controle e doutrina — acesso livre.</p>
            {[...new Set(MATERIAIS_LIVRES.map((m) => m.cat))].map((cat) => (
              <div key={cat} className="mt-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{cat}</div>
                <div className="space-y-1.5">
                  {MATERIAIS_LIVRES.filter((m) => m.cat === cat).map((m) => (
                    <a key={m.url} href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2.5 text-sm transition hover:border-teal-400 hover:bg-teal-50/50">
                      <span className="text-slate-700">{m.titulo}</span><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{m.fonte} ↗</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ t, v, s, alerta }: { t: string; v: string; s: string; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alerta ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-white"}`}>
      <div className="text-[11px] text-slate-400">{t}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums text-slate-800">{v}</div>
      <div className="text-[11px] text-slate-500">{s}</div>
    </div>
  );
}
function Cadeia({ emoji, titulo, valor, desc, cor }: { emoji: string; titulo: string; valor: string; desc: string; cor: "amber" | "sky" | "rose" }) {
  const c = cor === "amber" ? "border-amber-200 bg-amber-50/50" : cor === "sky" ? "border-sky-200 bg-sky-50/50" : "border-rose-200 bg-rose-50/50";
  return (
    <div className={`rounded-xl border p-3 ${c}`}>
      <div className="text-sm font-semibold text-slate-800">{emoji} {titulo}</div>
      <div className="mt-1 text-base font-bold text-slate-800">{valor}</div>
      <div className="text-[11px] text-slate-500">{desc}</div>
    </div>
  );
}
