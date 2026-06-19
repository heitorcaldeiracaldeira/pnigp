import { AlertTriangle, Database, Landmark, ShoppingCart, Users } from "lucide-react";
import type { Cruzamentos } from "@/lib/queries";

const n1 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const brl = (x: number) => "R$ " + x.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
function tag(v: number, m: number, inv = false) {
  if (m <= 0) return { t: "—", c: "text-slate-400" };
  const acima = v >= m * 1.1, abaixo = v <= m * 0.9;
  const bom = inv ? abaixo : acima;
  if (!acima && !abaixo) return { t: "≈ pares", c: "text-slate-500" };
  return { t: `${acima ? "▲" : "▼"} pares ${n1(m)}`, c: bom ? "text-emerald-600" : "text-amber-600" };
}

function Card({ icon, titulo, valor, nota }: { icon: React.ReactNode; titulo: string; valor: string; nota: { t: string; c: string } | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">{icon} {titulo}</div>
      <div className="font-display text-2xl font-bold tabular-nums text-slate-900">{valor}</div>
      <div className={`text-[11px] ${typeof nota === "string" ? "text-slate-500" : nota.c}`}>{typeof nota === "string" ? nota : nota.t}</div>
    </div>
  );
}

export function CruzamentosSC({ data }: { data: NonNullable<Cruzamentos> }) {
  const { compras: c, fiscal: f, social: s } = data;
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">Cruzamentos por município, comparados aos pares de porte (<b>{data.grupo}</b>) — sempre com a evidência ao lado.</p>

      {f && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Landmark className="h-4 w-4 text-teal-600" /> Capacidade fiscal × economia local</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card icon={<Landmark className="h-3.5 w-3.5" />} titulo="Autonomia tributária" valor={`${n1(f.autonomia)}%`} nota={tag(f.autonomia, f.autonomiaPares)} />
            <Card icon={<Landmark className="h-3.5 w-3.5" />} titulo="Dependência de transferências" valor={`${n1(f.dependencia)}%`} nota={tag(f.dependencia, f.dependenciaPares, true)} />
            <Card icon={<Landmark className="h-3.5 w-3.5" />} titulo="PIB per capita" valor={f.pib == null ? "—" : brl(f.pib)} nota={f.pib == null ? "—" : tag(f.pib, f.pibPares)} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Leitura: PIB alto com autonomia baixa = receita própria a explorar (IPTU/ISS/dívida ativa).</p>
        </section>
      )}

      {c && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><ShoppingCart className="h-4 w-4 text-violet-600" /> Eficiência de compras</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card icon={<ShoppingCart className="h-3.5 w-3.5" />} titulo="Sem licitação (dispensa/inexig.)" valor={`${n1(c.dispensaPct)}%`} nota={tag(c.dispensaPct, c.dispensaPares, true)} />
            <Card icon={<ShoppingCart className="h-3.5 w-3.5" />} titulo="Valor em modalidade competitiva" valor={`${n1(c.competPct)}%`} nota="pregão + concorrência sobre o total" />
            <Card icon={<ShoppingCart className="h-3.5 w-3.5" />} titulo="Economia unitária (itens)" valor={c.economiaUnit == null ? "—" : `${n1(c.economiaUnit)}%`} nota={c.economiaUnit == null ? "itens ainda não coletados p/ este ente" : `base: ${c.itensCobertura} itens (preço unitário)`} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Leitura: muita dispensa + pouca competição = risco de preço e governança. Economia real só no preço unitário.</p>
          {(() => {
            const flags: { nivel: "alto" | "medio"; txt: string }[] = [];
            if (c.dispensaPct > c.dispensaPares && c.dispensaPct >= 25) flags.push({ nivel: "alto", txt: `Compras sem licitação em ${n1(c.dispensaPct)}% — acima dos pares (${n1(c.dispensaPares)}%). Risco de preço e direcionamento.` });
            else if (c.dispensaPct > c.dispensaPares * 1.3) flags.push({ nivel: "medio", txt: `Dispensa acima da mediana dos pares (${n1(c.dispensaPct)}% vs ${n1(c.dispensaPares)}%).` });
            if (c.competPct < 40) flags.push({ nivel: "medio", txt: `Só ${n1(c.competPct)}% do valor em modalidade competitiva (pregão/concorrência) — pouca disputa.` });
            if (c.economiaUnit != null && c.economiaUnit < 0) flags.push({ nivel: "alto", txt: `Indício de sobrepreço unitário (${n1(c.economiaUnit)}%) em ${c.itensCobertura} itens com preço unitário.` });
            return (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-900 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Sinais de risco em compras (red flags)</div>
                {flags.length === 0 ? (
                  <p className="mt-2 text-sm text-emerald-300">Sem red flags evidentes nas compras deste ente.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {flags.map((f, i) => (
                      <li key={i} className={`rounded-lg border-l-4 bg-white/5 px-3 py-1.5 text-sm text-slate-100 ${f.nivel === "alto" ? "border-l-rose-500" : "border-l-amber-400"}`}>
                        <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${f.nivel === "alto" ? "bg-rose-500/20 text-rose-300" : "bg-amber-400/20 text-amber-200"}`}>{f.nivel === "alto" ? "ALTO" : "MÉDIO"}</span>
                        {f.txt}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-slate-500">Inspirado nos red flags de controle (TCU/TCE). Sinais ≠ irregularidade — apontam o que auditar.</p>
              </div>
            );
          })()}
        </section>
      )}

      {s && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Users className="h-4 w-4 text-amber-600" /> Proteção social</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card icon={<Users className="h-3.5 w-3.5" />} titulo="Transf. de renda / mil hab" valor={s.transfRendaMil == null ? "—" : n1(s.transfRendaMil)} nota={s.transfRendaMil == null ? "sem dado" : tag(s.transfRendaMil, s.transfPares)} />
            <Card icon={<Users className="h-3.5 w-3.5" />} titulo="BPC / mil hab" valor={s.bpcMil == null ? "—" : n1(s.bpcMil)} nota="benefício de prestação continuada" />
            <Card icon={<Users className="h-3.5 w-3.5" />} titulo="Cobertura vs pares" valor={s.transfRendaMil == null ? "—" : tag(s.transfRendaMil, s.transfPares).t} nota="mediana do grupo de porte" />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Leitura: alta transferência por mil hab indica maior vulnerabilidade atendida — cruzar com PIB per capita acima.</p>
        </section>
      )}

      <p className="text-[11px] text-slate-500">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
        Fiscal: SICONFI. Compras: PNCP. Social/PIB: CGU/IBGE. Benchmarks por grupo de porte. Economia de compras só é válida por preço unitário (itens) — cobertura cresce com a coleta.
      </p>
    </div>
  );
}
