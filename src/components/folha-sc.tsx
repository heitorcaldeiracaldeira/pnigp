import { Database, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { LinhasFinanceiras } from "@/components/charts/linhas-financeiras";
import { Termo, GlossarioStrip } from "@/components/termo";

const brl = (x: number) => (Math.abs(x) >= 1e9 ? "R$ " + (x / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " bi" : "R$ " + (x / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi");
const n1 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

// Limites LRF do Executivo (% sobre a RCL): alerta 48,6 · prudencial 51,3 · máximo 54
const ALERTA = 48.6, PRUDENCIAL = 51.3, LIMITE = 54;

export function FolhaSC({ rgf, serie }: {
  rgf: { ano: number; pessoalPct: number; rclAjustada: number } | null;
  serie: { ano: number; pessoal: number }[];
}) {
  if (!rgf || rgf.rclAjustada <= 0) {
    return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Folha de pagamento depende do RGF oficial (pessoal/RCL), ainda não disponível para este ente.</div>;
  }
  const pct = rgf.pessoalPct, rcl = rgf.rclAjustada;
  const folha = (pct / 100) * rcl;
  const margPrud = ((PRUDENCIAL - pct) / 100) * rcl; // >0 pode crescer até o prudencial; <0 já passou
  const margLim = ((LIMITE - pct) / 100) * rcl;
  const faixa = pct >= LIMITE ? { t: "Acima do limite legal", c: "bg-rose-100 text-rose-700", barra: "bg-rose-500" }
    : pct >= PRUDENCIAL ? { t: "Faixa prudencial (vedações da LRF)", c: "bg-orange-100 text-orange-700", barra: "bg-orange-500" }
    : pct >= ALERTA ? { t: "Faixa de alerta", c: "bg-amber-100 text-amber-700", barra: "bg-amber-500" }
    : { t: "Dentro do confortável", c: "bg-emerald-100 text-emerald-700", barra: "bg-emerald-500" };
  const larguraGauge = Math.min(100, (pct / 60) * 100); // escala 0–60%

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Users className="h-4 w-4 text-teal-600" /> Folha de pagamento × limite LRF — RGF {rgf.ano}</div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${faixa.c}`}>{faixa.t}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">Despesa de <Termo k="pessoal" /> sobre a <Termo k="RCL" /> ajustada. A <Termo k="LRF" /> limita o Executivo a <b>54%</b> (prudencial 51,3% · alerta 48,6%).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Folha (pessoal) atual</div>
          <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{brl(folha)}</div>
          <div className="text-[11px] text-slate-500">{n1(pct)}% da RCL ({brl(rcl)})</div>
        </div>
        <div className={`rounded-xl border p-4 ${margPrud >= 0 ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
          <div className="flex items-center gap-1 text-xs text-slate-600">{margPrud >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> : <TrendingDown className="h-3.5 w-3.5 text-rose-600" />} {margPrud >= 0 ? "Pode crescer até o prudencial" : "Acima do prudencial — corte sugerido"}</div>
          <div className={`font-display text-2xl font-bold tabular-nums ${margPrud >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{brl(Math.abs(margPrud))}</div>
          <div className="text-[11px] text-slate-500">até 51,3% da RCL</div>
        </div>
        <div className={`rounded-xl border p-4 ${margLim >= 0 ? "border-slate-200 bg-white" : "border-rose-200 bg-rose-50"}`}>
          <div className="flex items-center gap-1 text-xs text-slate-600"><Wallet className="h-3.5 w-3.5" /> {margLim >= 0 ? "Margem até o limite (54%)" : "Acima do limite legal"}</div>
          <div className={`font-display text-2xl font-bold tabular-nums ${margLim >= 0 ? "text-slate-900" : "text-rose-700"}`}>{brl(Math.abs(margLim))}</div>
          <div className="text-[11px] text-slate-500">{margLim >= 0 ? "espaço antes do teto da LRF" : "recondução obrigatória (2 quadrimestres)"}</div>
        </div>
      </div>

      {/* Régua LRF */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs font-semibold text-slate-700">Posição na régua da LRF (0–60% da RCL)</div>
        <div className="relative h-4 rounded-full bg-slate-100">
          <div className="absolute inset-y-0 left-0 rounded-full bg-amber-200" style={{ width: `${(ALERTA / 60) * 100}%` }} />
          <div className="absolute inset-y-0 left-0 bg-orange-200" style={{ width: `${(PRUDENCIAL / 60) * 100}%`, clipPath: `inset(0 0 0 ${(ALERTA / PRUDENCIAL) * 100}%)` }} />
          <div className={`absolute inset-y-0 left-0 rounded-l-full ${faixa.barra}`} style={{ width: `${larguraGauge}%` }} />
          <div className="absolute -top-1 h-6 w-0.5 bg-slate-700" style={{ left: `${(LIMITE / 60) * 100}%` }} title="Limite 54%" />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>0%</span><span>alerta 48,6</span><span>prud. 51,3</span><span className="font-bold text-slate-600">limite 54</span><span>60%</span></div>
      </div>

      {serie.filter((s) => s.pessoal > 0).length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-800">Evolução da folha de pessoal</h3>
          <p className="mb-2 text-xs text-slate-500">Despesa de pessoal empenhada por ano</p>
          <LinhasFinanceiras data={serie as unknown as Record<string, number>[]} linhas={[{ key: "pessoal", label: "Pessoal", cor: "#0f766e" }]} />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p className="mb-1 font-semibold text-slate-800">Como usar para decidir crescer ou cortar</p>
        <p>{margPrud >= 0
          ? `Há folga de ${brl(margPrud)} até o limite prudencial (51,3%) — é o teto seguro para novas contratações/reajustes sem disparar as vedações da LRF.`
          : `A folha já passou o prudencial: a LRF veda novos aumentos e exige recondução. Seria necessário reduzir ~${brl(Math.abs(margPrud))} para voltar à zona segura.`}</p>
      </div>

      <p className="text-[11px] text-slate-500">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Pessoal/RCL: RGF (SICONFI, % oficial sobre RCL ajustada). Limites: LRF/LC 101. Folha por servidor/órgão não é dado aberto unificado (portais municipais).
      </p>
      <GlossarioStrip ks={["pessoal", "RCL", "LRF"]} />
    </div>
  );
}
