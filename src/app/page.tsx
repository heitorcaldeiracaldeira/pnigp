import { BarChart3, Brain, Target } from "lucide-react";
import { Logo } from "@/components/brand";
import { LoginCard } from "@/components/login-card";
import { getEntesSC } from "@/lib/queries";

export default async function Home() {
  const entes = await getEntesSC();
  // municípios REAIS de SC (entes_sc) → vão para /real/{cod} (dados oficiais), não o demo /painel
  // Visão do Estado (Governador) bloqueada até haver comparação Estado×Estado — não carregamos `estados` aqui.
  const municipios = entes.filter((e) => e.tipo === "M").map((e) => ({ codigo_ibge: e.cod_ibge, nome: e.nome, uf: "SC" }));
  const destaqueMunicipio = municipios.find((m) => m.nome === "Florianópolis")?.codigo_ibge ?? municipios[0]?.codigo_ibge ?? "";

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Lado institucional */}
      <section className="flex flex-col justify-center bg-gradient-to-br from-teal-800 via-teal-700 to-cyan-800 p-10 text-white lg:p-16">
        <Logo className="mb-5 h-14 w-14" />
        <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-teal-200">
          Instituto I10
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
          i10 Gov 360
          <span className="mt-1 block font-sans text-xl font-medium text-teal-100 lg:text-2xl">
            Inteligência da gestão pública municipal
          </span>
        </h1>
        <p className="mt-5 max-w-md text-teal-50/90">
          Transformando dados em evidências, evidências em decisões e decisões em
          valor público para os municípios brasileiros.
        </p>

        <div className="mt-10 space-y-4">
          {[
            { icon: BarChart3, t: "Painel do Prefeito", d: "Indicadores de saúde, educação, segurança, fiscal, social e economia." },
            { icon: Brain, t: "Índices i10 Gov 360", d: "ICEB, INVP e IGP 360 — capacidade estatal e valor público." },
            { icon: Target, t: "Metas e benchmarking", d: "Acompanhe metas e compare municípios." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">{t}</div>
                <div className="text-sm text-teal-100/80">{d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Lado de acesso */}
      <section className="flex flex-col items-center justify-center gap-4 p-8">
        <LoginCard
          municipios={municipios}
          destaqueMunicipio={destaqueMunicipio}
        />
        <a
          href="/cidadao"
          className="text-sm text-slate-500 transition hover:text-teal-700"
        >
          É cidadão? <span className="font-semibold text-teal-700">Veja como está sua cidade →</span>
        </a>
        <a
          href="/real"
          className="text-sm text-slate-500 transition hover:text-teal-700"
        >
          🔎 <span className="font-semibold text-teal-700">Dados oficiais de Santa Catarina (SICONFI) →</span>
        </a>
      </section>
    </main>
  );
}
