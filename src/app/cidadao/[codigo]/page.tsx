import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  GraduationCap,
  HeartPulse,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { computeAreaScores } from "@/lib/audit";
import { getIndicadores, getIndicesSerie, getMunicipio, getRanking } from "@/lib/queries";
import { evalDelta, fmtValor } from "@/lib/ui";

type AreaKey = "saude" | "educacao" | "seguranca" | "social" | "economia";

const AREA_INFO: Record<AreaKey, { label: string; icon: LucideIcon; rep: string; repLabel: string }> = {
  saude: { label: "Saúde", icon: HeartPulse, rep: "cobertura_aps", repLabel: "Cobertura de atenção básica" },
  educacao: { label: "Educação", icon: GraduationCap, rep: "taxa_alfabetizacao", repLabel: "Taxa de alfabetização" },
  seguranca: { label: "Segurança", icon: ShieldCheck, rep: "homicidios_100mil", repLabel: "Homicídios por 100 mil hab." },
  social: { label: "Assistência social", icon: Users, rep: "extrema_pobreza_pct", repLabel: "População em extrema pobreza" },
  economia: { label: "Empregos e economia", icon: TrendingUp, rep: "empregos_formais_mil", repLabel: "Empregos formais por mil hab." },
};

const AREAS_CIDADAO: AreaKey[] = ["saude", "educacao", "seguranca", "social", "economia"];

function statusCidadao(score: number) {
  if (score >= 62) return { label: "Bom", chip: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500", frase: "acima de cidades parecidas" };
  if (score >= 45) return { label: "Regular", chip: "bg-amber-100 text-amber-700", bar: "bg-amber-500", frase: "na média de cidades parecidas" };
  return { label: "Precisa melhorar", chip: "bg-rose-100 text-rose-700", bar: "bg-rose-500", frase: "abaixo de cidades parecidas" };
}

function veredito(igp: number) {
  if (igp >= 80) return { txt: "muito boa", cor: "text-emerald-700" };
  if (igp >= 65) return { txt: "boa", cor: "text-emerald-700" };
  if (igp >= 50) return { txt: "regular", cor: "text-amber-700" };
  if (igp >= 35) return { txt: "abaixo do ideal", cor: "text-orange-700" };
  return { txt: "preocupante", cor: "text-rose-700" };
}

export default async function PainelCidadao({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const municipio = await getMunicipio(codigo);
  if (!municipio) notFound();

  const [serie, indicadores, ranking] = await Promise.all([
    getIndicesSerie(municipio.id),
    getIndicadores(municipio.id, municipio.porte),
    getRanking(),
  ]);

  const atual = serie[serie.length - 1];
  const anterior = serie[serie.length - 2] ?? null;
  const areas = computeAreaScores(indicadores);
  const minhaPos = ranking.find((r) => r.codigo_ibge === codigo);
  const total = ranking.length;
  const v = veredito(atual.igp360);
  const deltaIgp = anterior ? atual.igp360 - anterior.igp360 : null;

  const areaScore = (a: AreaKey) => areas.find((x) => x.area === a)?.score ?? 50;

  const fortes = AREAS_CIDADAO.filter((a) => areaScore(a) >= 62).map((a) => AREA_INFO[a].label);
  const fracas = AREAS_CIDADAO.filter((a) => areaScore(a) < 45).map((a) => AREA_INFO[a].label);

  return (
    <div className="space-y-6">
      <Link href="/cidadao" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700">
        <ArrowLeft className="h-4 w-4" /> Trocar cidade
      </Link>

      {/* Hero — nota da gestão em linguagem simples */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="font-display tracking-tight text-2xl font-bold text-slate-900 sm:text-3xl">
          {municipio.nome} <span className="text-lg font-semibold text-slate-500">— {municipio.uf}</span>
        </h1>
        <p className="mt-2 text-lg text-slate-700">
          A gestão da sua cidade está <strong className={v.cor}>{v.txt}</strong>.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <div className="text-xs text-slate-500">Nota geral da gestão</div>
            <div className="flex items-end gap-2">
              <span className="font-display text-4xl font-bold tracking-tight text-slate-900">{atual.igp360.toFixed(0)}</span>
              <span className="pb-1 text-sm text-slate-500">de 100</span>
              {deltaIgp != null && (
                <span className={`mb-1 inline-flex items-center gap-0.5 text-sm font-medium ${deltaIgp >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {deltaIgp >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  {Math.abs(deltaIgp).toFixed(1)} vs. ano anterior
                </span>
              )}
            </div>
          </div>
          {minhaPos && (
            <div>
              <div className="text-xs text-slate-500">Posição no país</div>
              <div className="text-lg font-semibold text-slate-800">
                {minhaPos.posicao}ª entre {total} cidades avaliadas
              </div>
            </div>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Essa nota reúne a capacidade da prefeitura e a qualidade dos serviços entregues à população.
        </p>
      </div>

      {/* Qualidade dos serviços */}
      <section aria-label="Qualidade dos serviços públicos">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Qualidade dos serviços públicos</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AREAS_CIDADAO.map((a) => {
            const info = AREA_INFO[a];
            const Icon = info.icon;
            const score = areaScore(a);
            const st = statusCidadao(score);
            const rep = indicadores.find((i) => i.codigo === info.rep);
            const delta = rep ? evalDelta(rep.valor, rep.valor_anterior, rep.direcao_melhor) : null;
            return (
              <div key={a} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-slate-800">{info.label}</h3>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.chip}`}>{st.label}</span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Está <strong>{st.frase}</strong>.
                </p>
                {rep && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="text-xs text-slate-500">{info.repLabel}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-900">{fmtValor(rep.valor, rep.unidade)}</span>
                      {delta && (
                        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${delta.bom ? "text-emerald-600" : "text-rose-600"}`}>
                          {delta.bom ? "melhorou" : "piorou"}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Pontos fortes e de atenção */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
          <h3 className="mb-2 font-semibold text-emerald-800">✅ Onde sua cidade vai bem</h3>
          {fortes.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {fortes.map((f) => <li key={f}>{f}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">Nenhuma área se destaca acima das cidades parecidas neste ciclo.</p>
          )}
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
          <h3 className="mb-2 font-semibold text-rose-800">⚠️ Onde precisa melhorar</h3>
          {fracas.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {fracas.map((f) => <li key={f}>{f}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">Nenhuma área está significativamente abaixo das cidades parecidas. 👏</p>
          )}
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-slate-500">
        Portal do Cidadão · PNIGP — Instituto I10 · Indicadores comparados a municípios de porte semelhante ·
        Dados simulados para demonstração
      </footer>
    </div>
  );
}
