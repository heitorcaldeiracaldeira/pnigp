import type { CaptacaoSC } from "@/lib/queries";
import { fmtBRLCompact } from "@/lib/ui";

function dt(s: string | null) {
  if (!s) return "—";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s);
}

// Radar de Captação (Transferegov, fonte original viva) — o ponto cego: quanto captou × vs pares × o que pode captar.
export function AssuntoCaptacao({ dados, cod, nome }: { dados: CaptacaoSC; cod: string; nome: string }) {
  if (!dados) return null;
  const docLink = (id: string) => `/api/plano-trabalho?ente=${cod}&programa=${id}`;
  const vsMedia = dados.benchmark.media > 0 ? dados.totalCaptado / dados.benchmark.media : 0;
  const maxOrg = Math.max(1, ...dados.porOrgao.map((o) => o.valor));
  const maxAno = Math.max(1, ...dados.porAno.map((a) => a.valor));
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-slate-800">🎯 Radar de Captação de Recursos</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Transferegov · fundo a fundo</span>
        </div>
        <p className="text-sm text-slate-500">O ponto cego mais caro da gestão: <b>recurso da União que o servidor não sabe que existe</b>. Aqui {nome} vê <b>quanto já captou</b>, como está <b>frente aos pares</b> e o que <b>pode captar agora</b> — gerando o projeto em 1 clique.</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          <span>🌐 <b>Universo monitorado:</b> {dados.universo.nProgramas} programas {dados.universo.nAbertos > 0 && <span className="text-emerald-700">({dados.universo.nAbertos} abertos)</span>} · {fmtBRLCompact(dados.universo.totalSC)} captados por {dados.universo.nMunicipios} municípios de SC</span>
          <span className="text-teal-700">🎯 <b>Recorte de {nome}:</b> seleção personalizada abaixo</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"><div className="text-xl font-bold tabular-nums text-emerald-700">{fmtBRLCompact(dados.totalCaptado)}</div><div className="text-[11px] text-slate-600">já captado (fundo a fundo)</div></div>
          <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{dados.nPlanos}</div><div className="text-[11px] text-slate-600">planos de ação</div></div>
          <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-800">{fmtBRLCompact(dados.benchmark.media)}</div><div className="text-[11px] text-slate-600">média dos municípios SC</div></div>
          <div className={`rounded-xl border p-3 ${vsMedia >= 1 ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}><div className={`text-xl font-bold tabular-nums ${vsMedia >= 1 ? "text-emerald-700" : "text-amber-700"}`}>{vsMedia ? `${vsMedia.toFixed(1)}×` : "—"}</div><div className="text-[11px] text-slate-600">vs média {vsMedia >= 1 ? "(acima)" : "(abaixo — oportunidade)"}</div></div>
        </div>
      </div>

      {/* PODERÁ ACESSAR — janelas abertas hoje */}
      <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-emerald-800">✅ Pode captar agora — janela de proposta ABERTA</h3>
        {dados.abertos.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {dados.abertos.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800"><span className="line-clamp-1">{o.nome}</span></div>
                  <div className="text-[11px] text-slate-500">{o.orgao}</div>
                </div>
                <div className="flex items-center gap-2">
                  {o.dias != null && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.dias <= 30 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>até {dt(o.dtFim)} · {o.dias}d</span>}
                  <a href={docLink(o.id)} className="rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-700">Gerar Plano de Trabalho ↓</a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Sem janela aberta neste momento nos programas monitorados. O monitoramento é contínuo — quando abrir um programa, ele aparece aqui (e poderá disparar alerta).</p>
        )}
      </section>

      {/* JÁ CAPTOU — por órgão + por ano */}
      {dados.porOrgao.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">💰 O que {nome} já captou — por órgão repassador</h3>
          <div className="mt-2 space-y-1.5">
            {dados.porOrgao.map((o) => (
              <div key={o.orgao} className="flex items-center gap-2 text-xs">
                <span className="w-44 shrink-0 truncate text-slate-600" title={o.orgao}>{o.orgao}</span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-3 rounded bg-emerald-500" style={{ width: `${(o.valor / maxOrg) * 100}%` }} /></div>
                <span className="w-16 shrink-0 text-right tabular-nums text-slate-700">{fmtBRLCompact(o.valor)}</span>
              </div>
            ))}
          </div>
          {dados.porAno.length > 1 && (
            <div className="mt-4">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Por ano</div>
              <div className="flex items-end gap-1" style={{ height: 60 }}>
                {dados.porAno.map((a) => (
                  <div key={a.ano} className="flex flex-1 flex-col items-center justify-end" title={`${a.ano}: ${fmtBRLCompact(a.valor)}`}>
                    <div className="w-full rounded-t bg-teal-400" style={{ height: `${Math.max(3, (a.valor / maxAno) * 50)}px` }} />
                    <span className="mt-0.5 text-[9px] text-slate-400">{String(a.ano).slice(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* BENCHMARK — o ponto cego */}
      <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 text-[13px] text-slate-700">
        <b>Leitura do ponto cego:</b> {nome} captou <b>{fmtBRLCompact(dados.totalCaptado)}</b>; a média dos municípios de SC é <b>{fmtBRLCompact(dados.benchmark.media)}</b> e o maior captou <b>{fmtBRLCompact(dados.benchmark.max)}</b>.{" "}
        {vsMedia < 1 ? <span className="text-amber-700">Está <b>abaixo da média</b> — há espaço para captar mais.</span> : <span className="text-emerald-700">Está acima da média.</span>}
        {dados.benchmark.melhores.length > 0 && <span className="text-slate-500"> Quem mais capta em SC: {dados.benchmark.melhores.map((m) => m.nome).slice(0, 3).join(", ")}.</span>}
        <div className="mt-1 text-[11px] text-slate-400">Fonte: Transferegov (api.transferegov.gestao.gov.br, fundo a fundo) — dado oficial. Cobre Cultura/Segurança/Trabalho/etc.; saúde, educação e assistência (FNS/FNDE/FNAS) entram nas próximas integrações.</div>
      </div>
    </div>
  );
}
