import { Accessibility, Database, HandHeart, Home, TrendingDown, Users, Wallet } from "lucide-react";
import { LinhasFinanceiras } from "@/components/charts/linhas-financeiras";
import { GlossarioStrip } from "@/components/termo";
import type { AssistenciaSocialSC } from "@/lib/queries";

const brl = (x: number) => (Math.abs(x) >= 1e9 ? "R$ " + (x / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " bi" : Math.abs(x) >= 1e6 ? "R$ " + (x / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : "R$ " + x.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
const n0 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export function AssistenciaSocialSC({ data, nome }: { data: NonNullable<AssistenciaSocialSC>; nome: string }) {
  const d = data;
  const pobrezaPct = d.cadFamilias > 0 ? (d.cadPobreza / d.cadFamilias) * 100 : 0;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><HandHeart className="h-4 w-4 text-teal-600" /> Assistência Social (SUAS){d.refMes ? ` · ref. ${d.refMes}` : ""}</div>
          {d.deficitCras && <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">Déficit de CRAS</span>}
        </div>
        <p className="mt-1 text-sm text-slate-600">A rede de proteção social de {nome}: equipamentos (CRAS/CREAS), o CadÚnico (porta de entrada dos programas), o Bolsa Família e o cofinanciamento federal (FNAS). Base para dimensionar a demanda e a cobertura.</p>
      </div>

      <div className={`grid gap-3 sm:grid-cols-2 ${d.bpcBeneficiarios > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <div className={`rounded-xl border p-4 ${d.deficitCras ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center gap-1 text-xs text-slate-500"><Home className="h-3.5 w-3.5" /> Equipamentos</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{d.cras} <span className="text-base font-semibold text-slate-500">CRAS</span></div>
          <div className="text-[11px] text-slate-500">{d.creas} CREAS · {d.acolhimento} acolhimento{d.habPorCras != null ? ` · 1 CRAS/${n0(Math.round(d.habPorCras))} hab` : ""}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> CadÚnico</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{n0(d.cadFamilias)}</div>
          <div className="text-[11px] text-slate-500">famílias · {n0(d.cadPessoas)} pessoas{d.cadTaxaAtualizacao != null ? ` · atualização ${d.cadTaxaAtualizacao.toFixed(0)}%` : ""}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><HandHeart className="h-3.5 w-3.5" /> Bolsa Família</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{n0(d.pbfFamilias)}</div>
          <div className="text-[11px] text-slate-500">famílias beneficiárias{d.pbfBeneficioMedio != null ? ` · média ${brl(d.pbfBeneficioMedio)}` : ""}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex items-center gap-1 text-xs text-slate-500"><Wallet className="h-3.5 w-3.5" /> Cofinanciamento FNAS</div>
          <div className="font-display text-2xl font-bold tabular-nums text-emerald-700">{brl(d.fnasUltimoAno)}</div>
          <div className="text-[11px] text-slate-500">repasse federal · {d.anoUlt}</div>
        </div>
        {d.bpcBeneficiarios > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex items-center gap-1 text-xs text-slate-500"><Accessibility className="h-3.5 w-3.5" /> BPC (idoso/deficiência)</div>
            <div className="font-display text-2xl font-bold tabular-nums text-emerald-700">{brl(d.bpcValorMes)}<span className="text-base font-semibold text-slate-500">/mês</span></div>
            <div className="text-[11px] text-slate-500">{n0(d.bpcBeneficiarios)} beneficiários (idosos e pessoas com deficiência)</div>
          </div>
        )}
      </div>

      {/* Vulnerabilidade: pobreza no CadÚnico */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 font-semibold text-slate-700"><Users className="h-4 w-4 text-teal-600" /> Famílias em situação de pobreza (CadÚnico)</span>
          <span className="font-display text-lg font-bold tabular-nums text-rose-700">{pobrezaPct.toFixed(1)}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-rose-500" style={{ width: `${Math.min(100, pobrezaPct)}%` }} /></div>
        <p className="mt-1.5 text-[11px] text-slate-500">{n0(d.cadPobreza)} de {n0(d.cadFamilias)} famílias do CadÚnico em situação de pobreza{d.cadRendaZero > 0 ? ` · ${n0(d.cadRendaZero)} com renda declarada zero` : ""}. Quanto maior, maior a demanda por proteção social.</p>
      </div>

      {/* Ponto cego: gap de cobertura do Bolsa Família (busca ativa) */}
      {d.gapCobertura > 0 && (
        <div className="flex items-start gap-2 rounded-xl border-l-4 border-l-amber-500 bg-amber-50/50 p-3 text-sm shadow-sm">
          <HandHeart className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span className="text-slate-700">
            <b className="tabular-nums">{n0(d.gapCobertura)} famílias</b> em situação de pobreza no CadÚnico ainda não recebem o Bolsa Família
            <span className="text-slate-500"> ({n0(d.cadPobreza)} em pobreza × {n0(d.pbfFamilias)} beneficiárias)</span>. A <b>busca ativa</b> dessas famílias amplia a transferência de renda federal ao município — sem custo próprio.
            <span className="mt-0.5 block text-[11px] text-slate-500">Indicativo: compara famílias em pobreza no CadÚnico com beneficiárias do PBF no mesmo mês; a elegibilidade final segue os critérios do programa (renda, condicionalidades, fila).</span>
          </span>
        </div>
      )}

      {/* Ponto cego: condicionalidade de saúde do Bolsa Família (risco de bloqueio do benefício) */}
      {d.condSaude?.deficit && (
        <div className="flex items-start gap-2 rounded-xl border-l-4 border-l-amber-500 bg-amber-50/50 p-3 text-sm shadow-sm">
          <HandHeart className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span className="text-slate-700">
            Apenas <b className="tabular-nums">{(d.condSaude.cobertura * 100).toFixed(0)}%</b> das famílias do Bolsa Família tiveram acompanhamento de saúde (mediana de SC: {(d.condSaude.mediana * 100).toFixed(0)}%). Cobertura baixa da condicionalidade indica <b>risco de bloqueio do benefício</b> — reforçar a busca ativa de saúde (vacinação, pré-natal, acompanhamento infantil) protege a renda das famílias.
            <span className="mt-0.5 block text-[11px] text-slate-500">Vigência {d.condSaude.periodo} (última disponível na fonte). Condicionalidade de saúde do PBF — Sistema de Condicionalidades / MDS.</span>
          </span>
        </div>
      )}

      {d.deficitCras && (
        <div className="flex items-start gap-2 rounded-xl border-l-4 border-l-rose-500 bg-white p-3 text-sm shadow-sm">
          <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <span className="text-slate-700">{d.cras === 0 ? <>Nenhum CRAS para {n0(d.populacao)} habitantes</> : <>Cobertura de CRAS abaixo da referência (1 para {n0(Math.round(d.habPorCras!))} hab)</>} — referência NOB-SUAS: <b>1 CRAS por 20 mil habitantes</b>. Ampliar a rede ou pactuar regionalmente destrava cofinanciamento e atendimento.</span>
        </div>
      )}

      {d.serie.filter((s) => s.total > 0).length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800">Cofinanciamento federal (FNAS) ao longo do tempo</h3>
          <p className="mb-2 text-xs text-slate-500">Repasse fundo a fundo do FNAS — total e por nível de proteção: básica (PSB) e especial (PSE).</p>
          <LinhasFinanceiras data={d.serie as unknown as Record<string, number>[]} linhas={[
            { key: "total", label: "FNAS total", cor: "#0f766e" },
            { key: "psb", label: "Proteção básica (PSB)", cor: "#0ea5e9" },
            { key: "pse", label: "Proteção especial (PSE)", cor: "#f59e0b" },
          ]} />
        </div>
      )}

      {d.serieVulnerab.length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800">Trajetória da proteção social</h3>
          <p className="mb-2 text-xs text-slate-500">
            Famílias no Bolsa Família e beneficiários do BPC ao longo dos anos — o retrato atual não mostra a direção; a série, sim.
            {d.trajetoria && (d.trajetoria.pbfVar != null || d.trajetoria.bpcVar != null) ? (
              <> Em {d.trajetoria.anos} anos: {d.trajetoria.pbfVar != null ? <b className={d.trajetoria.pbfVar >= 0 ? "text-rose-600" : "text-emerald-600"}>Bolsa Família {d.trajetoria.pbfVar >= 0 ? "+" : ""}{d.trajetoria.pbfVar}%</b> : null}
                {d.trajetoria.pbfVar != null && d.trajetoria.bpcVar != null ? " · " : ""}
                {d.trajetoria.bpcVar != null ? <b className={d.trajetoria.bpcVar >= 0 ? "text-rose-600" : "text-emerald-600"}>BPC {d.trajetoria.bpcVar >= 0 ? "+" : ""}{d.trajetoria.bpcVar}%</b> : null}.</>
            ) : null}
          </p>
          <LinhasFinanceiras data={d.serieVulnerab as unknown as Record<string, number>[]} moeda={false} linhas={[
            { key: "pbf", label: "Famílias no Bolsa Família", cor: "#0f766e" },
            { key: "bpc", label: "Beneficiários do BPC", cor: "#6366f1" },
          ]} />
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Fonte: MDS — MI Social / CadSUAS (CRAS, CREAS, CadÚnico, Bolsa Família, BPC) e FNAS (repasse fundo a fundo, série histórica). BPC: Benefício de Prestação Continuada (1 salário mínimo a idosos e pessoas com deficiência de baixa renda), último mês disponível. Referência de cobertura: NOB-SUAS.
      </p>
      <GlossarioStrip ks={["NOB-SUAS", "CadÚnico", "PBF", "BPC", "FNAS", "IGD"]} />
    </div>
  );
}
