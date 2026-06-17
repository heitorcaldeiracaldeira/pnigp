import { BarChart3, Brain, Target } from "lucide-react";
import { Logo } from "@/components/brand";
import { LoginCard } from "@/components/login-card";
import { getEstados, getMunicipios } from "@/lib/queries";

export default async function Home() {
  const [municipios, estados] = await Promise.all([getMunicipios(), getEstados()]);
  const destaqueMunicipio =
    municipios.find((m) => m.nome === "Niterói")?.codigo_ibge ??
    municipios[0]?.codigo_ibge ??
    "";
  const destaqueEstado = estados.find((e) => e.uf === "SP")?.uf ?? estados[0]?.uf ?? "";

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Lado institucional */}
      <section className="flex flex-col justify-center bg-gradient-to-br from-teal-800 via-teal-700 to-cyan-800 p-10 text-white lg:p-16">
        <Logo className="mb-5 h-14 w-14" />
        <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-teal-200">
          Instituto I10
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
          PNIGP
          <span className="mt-1 block font-sans text-xl font-medium text-teal-100 lg:text-2xl">
            Plataforma Nacional de Inteligência da Gestão Pública
          </span>
        </h1>
        <p className="mt-5 max-w-md text-teal-50/90">
          Transformando dados em evidências, evidências em decisões e decisões em
          valor público para os municípios brasileiros.
        </p>

        <div className="mt-10 space-y-4">
          {[
            { icon: BarChart3, t: "Painéis do Prefeito e do Governador", d: "Indicadores de saúde, educação, segurança, fiscal, social e economia." },
            { icon: Brain, t: "Índices PNIGP", d: "ICEB, INVP e IGP 360 — capacidade estatal e valor público." },
            { icon: Target, t: "Metas e benchmarking", d: "Acompanhe metas e compare municípios e estados." },
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
          estados={estados}
          destaqueMunicipio={destaqueMunicipio}
          destaqueEstado={destaqueEstado}
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
