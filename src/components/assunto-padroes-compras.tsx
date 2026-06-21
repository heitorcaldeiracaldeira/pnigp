import type { PadroesComprasSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";
import { CICLO_COMPRAS, DOUTRINADORES, MATERIAIS_LIVRES } from "@/lib/compras-doutrina";

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function AssuntoPadroesCompras({ dados, nome }: { dados: PadroesComprasSC; nome: string }) {
  if (!dados) return null;
  const { totalN, totalValor, porModalidade, porMes, serieAnual, dispensaPct, q4Pct, mesPico } = dados;
  const maxMes = Math.max(1, ...porMes.map((m) => m.n));
  const maxMod = Math.max(1, ...porModalidade.map((m) => m.n));
  const maxAnoV = Math.max(1, ...serieAnual.map((a) => a.valor));

  // recomendações de planejamento — pré-montadas, ancoradas na doutrina (o gestor confere)
  const recs: { txt: string; fonte: string; nivel: "alerta" | "dica" }[] = [];
  if (q4Pct > 35) recs.push({ txt: `${q4Pct.toFixed(0)}% das compras saem no último trimestre — sinal de planejamento tardio. Antecipe o PCA (Plano de Contratações Anual) para diluir a demanda no ano e evitar compras emergenciais.`, fonte: "Justen Filho — planejamento é pilar (art. 12, Lei 14.133)", nivel: "alerta" });
  if (dispensaPct > 40) recs.push({ txt: `${dispensaPct.toFixed(0)}% dos processos são dispensa/inexigibilidade. Verifique se não há fracionamento do mesmo objeto ao longo do ano — agrupar pode exigir (e viabilizar) pregão/registro de preços.`, fonte: "Jacoby Fernandes — vedação ao fracionamento (art. 75, §1º)", nivel: "alerta" });
  recs.push({ txt: `Para itens comprados com recorrência (combustível, material de consumo, gêneros), planeje via Sistema de Registro de Preços (ata): registra preço sem obrigar a compra imediata e ganha escala.`, fonte: "Jacoby Fernandes — SRP", nivel: "dica" });
  recs.push({ txt: `Dispensa por pequeno valor é legítima quando o custo de licitar supera o benefício — mas registre a justificativa de economicidade no processo.`, fonte: "Justen Filho — custo × benefício", nivel: "dica" });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">🧭 Padrões de compras — apoio ao planejamento</h2>
        <p className="mt-1 text-sm text-slate-500">Como {nome} compra hoje (todos os processos do PNCP, qualquer situação) — para planejar melhor o próximo ano. {totalN.toLocaleString("pt-BR")} processos · {fmtBRLCompact(totalValor)} estimados.</p>
      </div>

      {/* Ciclo da contratação — ancorado na doutrina */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">🔄 O ciclo da contratação — como fazer uma boa compra</h3>
        <p className="mb-3 text-xs text-slate-500">As quatro fases da contratação pública (Lei 14.133/2021), com as boas práticas e os autores que as fundamentam.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {CICLO_COMPRAS.map((f) => (
            <div key={f.id} className="rounded-xl border border-slate-200 p-3">
              <div className="text-sm font-semibold text-slate-800">{f.emoji} {f.titulo}</div>
              <p className="mt-0.5 text-xs text-slate-600">{f.resumo}</p>
              <ul className="mt-2 space-y-1">
                {f.praticas.map((p, i) => <li key={i} className="flex gap-1.5 text-[12px] text-slate-600"><span className="text-teal-600">•</span><span>{p}</span></li>)}
              </ul>
              <div className="mt-2 flex flex-wrap gap-1">
                {f.autores.map((a) => <span key={a} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{a}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sazonalidade */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">📅 Quando você compra (sazonalidade)</h3>
        <p className="mb-3 text-xs text-slate-500">Processos por mês (todos os anos somados). Pico em <b>{MES[mesPico - 1]}</b>; {q4Pct.toFixed(0)}% no último trimestre.</p>
        <div className="flex items-end gap-1.5" style={{ height: 110 }}>
          {porMes.map((m) => (
            <div key={m.mes} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className={`w-full rounded-t ${m.mes >= 10 ? "bg-amber-400" : "bg-teal-500"}`} style={{ height: `${(m.n / maxMes) * 90}px` }} title={`${m.n}`} />
              <span className="text-[10px] text-slate-400">{MES[m.mes - 1]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modalidades */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">⚖️ Como você compra (modalidades)</h3>
        <p className="mb-3 text-xs text-slate-500">Distribuição dos processos. Dispensa/inexigibilidade = <b>{dispensaPct.toFixed(0)}%</b>.</p>
        <div className="space-y-1.5">
          {porModalidade.slice(0, 8).map((m) => (
            <div key={m.modalidade} className="flex items-center gap-2 text-xs">
              <span className="w-40 shrink-0 truncate text-slate-600" title={m.modalidade}>{m.modalidade}</span>
              <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                <div className={`h-4 rounded ${/dispensa|inexig/i.test(m.modalidade) ? "bg-amber-400" : "bg-teal-500"}`} style={{ width: `${(m.n / maxMod) * 100}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right tabular-nums text-slate-500">{m.n.toLocaleString("pt-BR")} · {m.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Série anual */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">📈 Evolução anual</h3>
        <p className="mb-3 text-xs text-slate-500">Nº de processos e valor estimado por ano.</p>
        <div className="flex items-end gap-3" style={{ height: 110 }}>
          {serieAnual.map((a) => (
            <div key={a.ano} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] tabular-nums text-slate-500">{fmtBRLCompact(a.valor)}</span>
              <div className="w-full rounded-t bg-teal-500" style={{ height: `${(a.valor / maxAnoV) * 70}px` }} />
              <span className="text-[10px] text-slate-400">{a.ano}</span>
              <span className="text-[10px] tabular-nums text-slate-400">{a.n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recomendações ancoradas na doutrina */}
      <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-5">
        <h3 className="text-sm font-semibold text-slate-800">✅ Como planejar melhor (recomendações)</h3>
        <div className="mt-3 space-y-2.5">
          {recs.map((r, i) => (
            <div key={i} className={`rounded-xl border bg-white p-3 ${r.nivel === "alerta" ? "border-amber-200" : "border-slate-200"}`}>
              <div className="flex items-start gap-2">
                <span>{r.nivel === "alerta" ? "⚠️" : "💡"}</span>
                <div>
                  <p className="text-sm text-slate-700">{r.txt}</p>
                  <p className="mt-1 text-[11px] text-slate-400">Base: {r.fonte}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Doutrina — rol completo */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">📚 Base metodológica (doutrina de compras públicas)</h3>
        <p className="mb-3 text-xs text-slate-500">As orientações desta tela seguem a linha de contribuição destes autores — base metodológica, exibição neutra, sem juízo político.</p>
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

      {/* Biblioteca de materiais gratuitos */}
      <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-5">
        <h3 className="text-sm font-semibold text-slate-800">🔗 Biblioteca de materiais (gratuitos e oficiais)</h3>
        <p className="mb-3 text-xs text-slate-500">Guias e referências para a equipe de compras estudar e aplicar — todos de acesso livre.</p>
        <div className="space-y-1.5">
          {MATERIAIS_LIVRES.map((m) => (
            <a key={m.url} href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2.5 text-sm transition hover:border-teal-400 hover:bg-teal-50/50">
              <span className="text-slate-700">{m.titulo}</span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{m.fonte} ↗</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
