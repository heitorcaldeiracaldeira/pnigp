import { HeartPulse, GraduationCap, ShieldCheck, Search } from "lucide-react";
import { CidadaoPicker } from "@/components/cidadao-picker";
import { getMunicipios } from "@/lib/queries";

export default async function CidadaoIndex() {
  const municipios = await getMunicipios();
  const destaque =
    municipios.find((m) => m.nome === "Niterói")?.codigo_ibge ?? municipios[0]?.codigo_ibge ?? "";

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-teal-700">
        <Search className="h-4 w-4" /> Transparência ao cidadão
      </div>
      <h1 className="text-3xl font-bold text-slate-900">Como está a sua cidade?</h1>
      <p className="mt-2 text-slate-600">
        Veja, em linguagem simples, a qualidade dos serviços públicos, o que melhorou e onde sua
        cidade precisa avançar — com base em dados oficiais.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <CidadaoPicker municipios={municipios} destaque={destaque} />
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { icon: HeartPulse, t: "Saúde", d: "Atendimento e cuidado" },
          { icon: GraduationCap, t: "Educação", d: "Ensino e aprendizado" },
          { icon: ShieldCheck, t: "Segurança", d: "Proteção e tranquilidade" },
        ].map(({ icon: Icon, t, d }) => (
          <div key={t} className="rounded-xl border border-slate-200 bg-white p-4">
            <Icon className="h-5 w-5 text-teal-700" />
            <div className="mt-2 font-semibold text-slate-800">{t}</div>
            <div className="text-sm text-slate-500">{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
