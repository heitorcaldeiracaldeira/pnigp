import { Progress } from "@/components/ui/progress";
import { fmtValor } from "@/lib/ui";

type Meta = {
  codigo: string;
  nome: string;
  unidade: string;
  direcao_melhor: "alta" | "baixa";
  valor_atual: number;
  valor_alvo: number;
  ano_alvo: number;
  descricao: string;
};

function progresso(m: Meta): number {
  const p =
    m.direcao_melhor === "alta"
      ? (m.valor_atual / m.valor_alvo) * 100
      : (m.valor_alvo / m.valor_atual) * 100;
  return Math.max(0, Math.min(100, p));
}

export function MetasSection({ metas }: { metas: Meta[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {metas.map((m) => {
        const p = progresso(m);
        const atingida = p >= 99.5;
        return (
          <div key={m.codigo} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-800">{m.nome}</div>
                <div className="text-xs text-slate-500">{m.descricao}</div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  atingida ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {atingida ? "Atingida" : `Meta ${m.ano_alvo}`}
              </span>
            </div>
            <div className="mt-3">
              <Progress value={p} className="h-2" />
              <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                <span>
                  Atual:{" "}
                  <strong className="text-slate-700">{fmtValor(m.valor_atual, m.unidade)}</strong>
                </span>
                <span>
                  Meta:{" "}
                  <strong className="text-slate-700">{fmtValor(m.valor_alvo, m.unidade)}</strong>
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
