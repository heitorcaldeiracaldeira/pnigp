// CEIS/CNEP × FORNECEDORES — controle: fornecedores do município com sanção VIGENTE, com o órgão sancionador e o motivo.
// Tom neutro/didático: a sanção pode ser posterior ao contrato; sinaliza para verificação, sem juízo de gestão.
import { ShieldAlert, Building2, ScrollText } from "lucide-react";
import type { FornecedoresSancionadosSC } from "@/lib/queries";

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export function FornecedoresSancionados({ data, nome }: { data: NonNullable<FornecedoresSancionadosSC>; nome: string }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><ShieldAlert className="h-4 w-4 text-amber-600" /> Fornecedores com sanção vigente — CEIS/CNEP</h3>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{data.total} fornecedor{data.total > 1 ? "es" : ""}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">Fornecedores que já contrataram com {nome} e constam com <b>sanção vigente</b> no Cadastro de Empresas Inidôneas e Suspensas (CEIS) ou no Cadastro Nacional de Empresas Punidas (CNEP). {data.comContratoVigente > 0 && <><b>{data.comContratoVigente}</b> com contrato ainda em vigência.</>}</p>

      <div className="mt-3 space-y-2">
        {data.itens.slice(0, 20).map((f, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">{f.fornecedor}</span>
              <div className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${f.fonte === "CNEP" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{f.fonte}</span>
                {f.vigente && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">contrato vigente</span>}
              </div>
            </div>
            <div className="mt-1 text-xs font-medium text-slate-600">{f.tipoSancao}{f.dataFim ? ` · até ${f.dataFim.split("-").reverse().join("/")}` : ""}</div>
            {f.orgao && <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-slate-500"><Building2 className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" /><span><b className="text-slate-600">Onde:</b> {f.orgao}</span></div>}
            {f.fundamentacao && <div className="mt-1 flex items-start gap-1.5 text-[11px] text-slate-500"><ScrollText className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" /><span><b className="text-slate-600">Motivo:</b> {f.fundamentacao.length > 240 ? f.fundamentacao.slice(0, 240) + "…" : f.fundamentacao}</span></div>}
            <div className="mt-1.5 text-[11px] text-slate-400">{f.nContratos} contrato{f.nContratos > 1 ? "s" : ""} com o município · {brl(f.valorTotal)}</div>
          </div>
        ))}
        {data.itens.length > 20 && <div className="text-center text-xs text-slate-400">+ {data.itens.length - 20} outros fornecedores sancionados</div>}
      </div>

      <p className="mt-3 text-[11px] text-slate-400">Fonte: Portal da Transparência da CGU (CEIS/CNEP), cruzado com os contratos do município (PNCP) pelo CNPJ. Metodologia: apenas sanções <b>vigentes</b> (sem data-fim ou com data-fim futura). <b>Atenção:</b> a sanção pode ser posterior à assinatura do contrato e/ou de abrangência restrita ao órgão sancionador — o registro é informativo, para verificação da regularidade antes de novas contratações ou pagamentos, sem juízo sobre a gestão.</p>
    </section>
  );
}
