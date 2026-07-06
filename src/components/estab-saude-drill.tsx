"use client";

import type { EstabSaudeSC } from "@/lib/queries";

// Equipamentos públicos de saúde — rede CNES estabelecimento a estabelecimento. Foco em regulação: composição da rede,
// capacidade instalada (hospitalar/cirúrgico/obstétrico) e localização. Espelha o drill de escolas.
const NAT = { Público: "bg-emerald-100 text-emerald-700", Filantrópico: "bg-amber-100 text-amber-700", Privado: "bg-slate-100 text-slate-600" } as Record<string, string>;

export function EstabSaudeDrill({ dados, nome }: { dados: EstabSaudeSC; nome: string }) {
  if (!dados) return null;
  const maxT = Math.max(1, ...dados.porTipo.map((t) => t.n));
  const mapa = (lat: number, lon: number) => `https://www.google.com/maps?q=${lat},${lon}`;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-800">🏥 Estabelecimentos de saúde — a rede inteira</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">CNES</span>
      </div>
      <p className="text-sm text-slate-500">{dados.total} estabelecimentos em {nome} (público + privado + filantrópico). Composição da rede e capacidade instalada — base para regulação, referência e contrarreferência.</p>

      {/* composição da rede */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"><div className="text-xl font-bold tabular-nums text-emerald-700">{dados.natureza.publico}</div><div className="text-[11px] text-slate-600">públicos</div></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3"><div className="text-xl font-bold tabular-nums text-amber-700">{dados.natureza.filantropico}</div><div className="text-[11px] text-slate-600">filantrópicos</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="text-xl font-bold tabular-nums text-slate-700">{dados.natureza.privado}</div><div className="text-[11px] text-slate-600">privados</div></div>
      </div>

      {/* capacidade instalada (regulação) */}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[{ n: dados.capacidade.sus, t: "atendem SUS" }, { n: dados.capacidade.hospitalar, t: "com internação" }, { n: dados.capacidade.cirurgico, t: "centro cirúrgico" }, { n: dados.capacidade.obstetrico, t: "centro obstétrico" }].map((c) => (
          <div key={c.t} className="rounded-xl border border-slate-200 p-2.5 text-center"><div className="text-lg font-bold tabular-nums text-slate-800">{c.n}</div><div className="text-[11px] text-slate-600">{c.t}</div></div>
        ))}
      </div>

      {/* contador: equipes + equipamentos médicos + leitos (CNES EP/EQ/LT) */}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-2.5 text-center"><div className="text-lg font-bold tabular-nums text-teal-700">{dados.equipes.esf}</div><div className="text-[11px] text-slate-600">equipes Saúde da Família</div></div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-2.5 text-center"><div className="text-lg font-bold tabular-nums text-indigo-700">{dados.equipamentos.imagem}</div><div className="text-[11px] text-slate-600">equip. de imagem (TC/RX/US)</div></div>
        <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/50 p-2.5 text-center"><div className="text-lg font-bold tabular-nums text-fuchsia-700">{dados.equipamentos.vida}</div><div className="text-[11px] text-slate-600">equip. de suporte à vida</div></div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-2.5 text-center"><div className="text-lg font-bold tabular-nums text-sky-700">{dados.leitos.total.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-600">leitos ({dados.leitos.sus.toLocaleString("pt-BR")} SUS)</div></div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-2.5 text-center"><div className="text-lg font-bold tabular-nums text-rose-700">{dados.leitos.uti.toLocaleString("pt-BR")}</div><div className="text-[11px] text-slate-600">leitos de UTI</div></div>
      </div>

      {/* por tipo */}
      <div className="mt-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Por tipo de unidade</div>
        <div className="space-y-1">
          {dados.porTipo.slice(0, 10).map((t) => (
            <div key={t.tipo} className="flex items-center gap-2 text-xs">
              <span className="w-48 shrink-0 truncate text-slate-600" title={t.tipo}>{t.tipo}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-3 rounded bg-teal-500" style={{ width: `${(t.n / maxT) * 100}%` }} /></div>
              <span className="w-10 shrink-0 text-right tabular-nums text-slate-700">{t.n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* lista */}
      <div className="mt-3 max-h-[30rem] overflow-y-auto rounded-xl border border-slate-100">
        {dados.lista.map((e, i) => (
          <div key={i} className="border-b border-slate-50 p-2.5 last:border-0">
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <span className="text-[13px] font-medium text-slate-800">{e.nome}{e.bairro ? <span className="font-normal text-slate-400"> · {e.bairro}</span> : null}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${NAT[e.natureza] || "bg-slate-100 text-slate-500"}`}>{e.natureza}</span>
                {e.lat != null && e.lon != null && <a href={mapa(e.lat, e.lon)} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-teal-600 hover:underline">📍 mapa</a>}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
              <span className="font-medium text-slate-600">{e.tipo}</span>
              {e.sus && <span className="rounded bg-blue-50 px-1 text-blue-600">SUS</span>}
              {e.hospitalar && <span className="rounded bg-rose-50 px-1 text-rose-600">internação</span>}
              {e.cirurgico && <span className="rounded bg-violet-50 px-1 text-violet-600">cirúrgico</span>}
              {e.obstetrico && <span className="rounded bg-pink-50 px-1 text-pink-600">obstétrico</span>}
              {e.esf > 0 && <span className="rounded bg-teal-50 px-1 font-medium text-teal-700">{e.esf} ESF</span>}
              {e.equipImagem > 0 && <span className="rounded bg-indigo-50 px-1 text-indigo-600">{e.equipImagem} imagem</span>}
              {e.equipVida > 0 && <span className="rounded bg-fuchsia-50 px-1 text-fuchsia-700">{e.equipVida} suporte à vida</span>}
              {e.leitos > 0 && <span className="rounded bg-sky-50 px-1 font-medium text-sky-700">{e.leitos} leitos{e.leitosUti > 0 ? ` (${e.leitosUti} UTI)` : ""}</span>}
              {e.profissionais > 0 && <span className="rounded bg-slate-100 px-1 text-slate-600">{e.profissionais.toLocaleString("pt-BR")} profissionais</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Fonte: CNES — Cadastro Nacional de Estabelecimentos de Saúde (API DEMAS/Ministério da Saúde). Rede completa do município. Leitos por unidade entram em coleta futura (DATASUS).</p>
    </section>
  );
}