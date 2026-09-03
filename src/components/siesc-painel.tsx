"use client";
// ═══ REFERENCIAL DE PREÇOS SIE-SC (Edificações) — painel PRÓPRIO (03/set/2026) ═══
// A terceira régua de obra, ao lado de SinapiPainel e SicroPainel: a ÚNICA calibrada pelo próprio estado
// para edificação. Fonte é PDF (a SIE-SC não publica planilha) — ver scripts/ingest_siesc_edificacoes_sc.mjs.
import { useEffect, useRef, useState } from "react";
import { Building2, Search, Loader2, AlertTriangle } from "lucide-react";
import { AdicionarQtd, type NovoItemOrcamento } from "@/components/orcamento-obra";

type Servico = {
  codigo: string; grupo: string; descricao: string; unidade: string;
  custoExecucao: number | null; custoMaterial: number | null; custoSubservico: number | null; precoUnitario: number | null;
};

const brl = (v: number | null) => v == null ? "—" : "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SiescPainel({ onAdicionar }: { onAdicionar?: (item: NovoItemOrcamento, quantidade: number) => void }) {
  const [q, setQ] = useState("");
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [competencia, setCompetencia] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [buscou, setBuscou] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const termo = q.trim();
    timer.current = setTimeout(async () => {
      if (termo.length < 3) { setServicos([]); setBuscou(false); return; }
      setCarregando(true); setErro("");
      try {
        const r = await fetch("/api/siesc-precos/" + encodeURIComponent(termo));
        const j = await r.json();
        if (j.erro) throw new Error(j.erro);
        setServicos(j.servicos || []); setCompetencia(j.competencia || "");
      } catch (e) { setErro(String((e as Error).message || e)); setServicos([]); }
      setBuscou(true); setCarregando(false);
    }, 400);
  }, [q]);

  const compet = competencia && competencia.length === 6 ? `${competencia.slice(4)}/${competencia.slice(0, 4)}` : "jan/2021";

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-emerald-700"><Building2 className="h-4 w-4" /> Referencial de Preços SIE-SC</h3>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">obras de edificações — Santa Catarina</span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
        Preço de referência da <b>Secretaria de Infraestrutura e Mobilidade de Santa Catarina (SIE-SC)</b> para
        serviços de obra de edificação — a única das três referências calibrada pelo próprio estado (SINAPI é
        federal, SICRO é do DNIT para infraestrutura de transportes). Já inclui a bonificação de 25% que a SIE-SC
        aplica sobre o custo direto. Busque por código ou por descrição do serviço.
      </p>
      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-700">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <b>Referência bem mais antiga: competência {compet}.</b> É a versão mais recente que a SIE-SC publica hoje
          para edificações (a de obras rodoviárias daquela mesma página é apenas uma cópia do SICRO, mais velha do
          que a Referência SICRO acima — por isso não entrou aqui). Confira o valor no <a href="https://www.sie.sc.gov.br/referencial-de-precos" target="_blank" rel="noreferrer" className="underline">portal oficial da SIE-SC</a> antes de usar num processo.
        </span>
      </p>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 focus-within:border-emerald-500">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código SIE-SC ou descrição: alvenaria, revestimento cerâmico, pintura…"
          className="w-full bg-transparent text-sm outline-none" />
        {carregando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-500" />}
      </div>
      {erro && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{erro}</p>}

      {buscou && !servicos.length && !erro && (
        <p className="mt-3 text-[12px] text-slate-400">Nenhum serviço SIE-SC (edificações) com “{q.trim()}”.</p>
      )}

      {!!servicos.length && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Serviços <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">{servicos.length} resultado(s)</span></p>
          <div className="mt-1.5 max-h-96 overflow-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr><th className="p-1.5">Código</th><th className="p-1.5">Descrição</th><th className="p-1.5">Grupo</th><th className="p-1.5">Un.</th><th className="p-1.5 text-right">Execução</th><th className="p-1.5 text-right">Material</th><th className="p-1.5 text-right">Preço unitário</th>{onAdicionar && <th className="p-1.5"></th>}</tr>
              </thead>
              <tbody>
                {servicos.map((s) => (
                  <tr key={s.codigo} className="border-t border-slate-100">
                    <td className="whitespace-nowrap p-1.5 align-top font-mono text-[10px] text-slate-400">{s.codigo}</td>
                    <td className="max-w-[22rem] p-1.5 align-top text-slate-700">{s.descricao}</td>
                    <td className="p-1.5 align-top text-slate-500">{s.grupo.replace(/^\d{2} - /, "")}</td>
                    <td className="p-1.5 align-top text-slate-500">{s.unidade}</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top tabular-nums text-slate-500">{brl(s.custoExecucao)}</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top tabular-nums text-slate-500">{brl(s.custoMaterial)}</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top font-semibold tabular-nums text-emerald-700">{brl(s.precoUnitario)}</td>
                    {onAdicionar && <td className="p-1.5 align-top">
                      <AdicionarQtd onAdd={(qtd) => onAdicionar({ fonte: "SIE-SC", codigo: s.codigo, descricao: s.descricao, unidade: s.unidade, precoNaoDesonerado: s.precoUnitario, precoDesonerado: null }, qtd)} />
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
        Fonte: Secretaria de Infraestrutura e Mobilidade de Santa Catarina (SIE-SC) — Referencial de Preços de
        Obras de Edificações, janeiro/2021. Preço unitário = (execução + material + sub-serviço/transporte) × 1,25.
      </p>
    </section>
  );
}
