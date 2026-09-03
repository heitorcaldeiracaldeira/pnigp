"use client";
// ═══ REFERÊNCIA SICRO (DNIT) — painel PRÓPRIO, par do SinapiPainel (03/set/2026) ═══
// SICRO cobre obra e serviço de infraestrutura de TRANSPORTES (estrada, ferrovia, porto, aeroporto);
// SINAPI cobre "as demais obras" (Lei 14.133, art. 23 §2º) — por isso os dois convivem, cada um com sua
// tabela e rota, nenhum misturado ao que a coleta do PNCP gera. Ver scripts/ingest_sicro_sc.mjs.
import { useEffect, useRef, useState } from "react";
import { Truck, Search, Loader2, AlertTriangle } from "lucide-react";
import { AdicionarQtd, type NovoItemOrcamento } from "@/components/orcamento-obra";

type Composicao = { codigo: string; descricao: string; unidade: string; custo: number | null };
type Insumo = { codigo: string; descricao: string; tipo: "material" | "mao_de_obra"; unidade: string; precoNaoDesonerado: number | null; precoDesonerado: number | null };
type Equipamento = { codigo: string; descricao: string; custoProdutivoHora: number | null; custoImprodutivoHora: number | null };

const brl = (v: number | null) => v == null ? "—" : "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SicroPainel({ onAdicionar }: { onAdicionar?: (item: NovoItemOrcamento, quantidade: number) => void }) {
  const [q, setQ] = useState("");
  const [comp, setComp] = useState<Composicao[]>([]);
  const [ins, setIns] = useState<Insumo[]>([]);
  const [equip, setEquip] = useState<Equipamento[]>([]);
  const [competencia, setCompetencia] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [buscou, setBuscou] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const termo = q.trim();
    timer.current = setTimeout(async () => {
      if (termo.length < 3) { setComp([]); setIns([]); setEquip([]); setBuscou(false); return; }
      setCarregando(true); setErro("");
      try {
        const r = await fetch("/api/sicro-precos/" + encodeURIComponent(termo));
        const j = await r.json();
        if (j.erro) throw new Error(j.erro);
        setComp(j.composicoes || []); setIns(j.insumos || []); setEquip(j.equipamentos || []); setCompetencia(j.competencia || "");
      } catch (e) { setErro(String((e as Error).message || e)); setComp([]); setIns([]); setEquip([]); }
      setBuscou(true); setCarregando(false);
    }, 400);
  }, [q]);

  const compet = competencia ? `${competencia.slice(4)}/${competencia.slice(0, 4)}` : "abr/2026";

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-cyan-700"><Truck className="h-4 w-4" /> Referência SICRO</h3>
        <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">infraestrutura de transportes</span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
        Preço de referência do <b>DNIT</b> para insumos, mão de obra, equipamentos e composições de obra de
        estrada, ferrovia, porto e aeroporto — a régua que a Lei 14.133/2021 (art. 23, §2º) manda usar para obra
        de infraestrutura de transportes, ao lado da Referência SINAPI acima (que cobre as demais obras) e do
        Banco de Preços (preço praticado, PNCP). Busque por código SICRO ou por descrição.
      </p>
      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-700">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Referência de <b>{compet}</b> — o mês mais recente que o DNIT publica hoje para Santa Catarina. Confira o
          valor no <a href="https://www.gov.br/dnit/pt-br/assuntos/planejamento-e-pesquisa/custos-referenciais/sistemas-de-custos/sicro" target="_blank" rel="noreferrer" className="underline">portal oficial do DNIT</a> antes de usar num processo.
        </span>
      </p>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 focus-within:border-cyan-500">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código SICRO ou descrição: terraplenagem, pavimentação, escavação de vala…"
          className="w-full bg-transparent text-sm outline-none" />
        {carregando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-500" />}
      </div>
      {erro && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{erro}</p>}

      {buscou && !comp.length && !ins.length && !equip.length && !erro && (
        <p className="mt-3 text-[12px] text-slate-400">Nenhuma composição, insumo ou equipamento SICRO (SC) com “{q.trim()}”.</p>
      )}

      {!!comp.length && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Composições <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">{comp.length} resultado(s)</span></p>
          <div className="mt-1.5 max-h-96 overflow-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr><th className="p-1.5">Código</th><th className="p-1.5">Descrição</th><th className="p-1.5">Un.</th><th className="p-1.5 text-right">Custo</th>{onAdicionar && <th className="p-1.5"></th>}</tr>
              </thead>
              <tbody>
                {comp.map((c) => (
                  <tr key={c.codigo} className="border-t border-slate-100">
                    <td className="whitespace-nowrap p-1.5 align-top font-mono text-[10px] text-slate-400">{c.codigo}</td>
                    <td className="max-w-[30rem] p-1.5 align-top text-slate-700">{c.descricao}</td>
                    <td className="p-1.5 align-top text-slate-500">{c.unidade}</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top font-semibold tabular-nums text-cyan-700">{brl(c.custo)}</td>
                    {onAdicionar && <td className="p-1.5 align-top">
                      <AdicionarQtd onAdd={(qtd) => onAdicionar({ fonte: "SICRO", codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, precoNaoDesonerado: c.custo, precoDesonerado: null }, qtd)} />
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!!ins.length && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Insumos (materiais e mão de obra) <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">{ins.length} resultado(s)</span></p>
          <div className="mt-1.5 max-h-72 overflow-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr><th className="p-1.5">Código</th><th className="p-1.5">Descrição</th><th className="p-1.5">Tipo</th><th className="p-1.5">Un.</th><th className="p-1.5 text-right">Não desonerado</th><th className="p-1.5 text-right">Desonerado</th>{onAdicionar && <th className="p-1.5"></th>}</tr>
              </thead>
              <tbody>
                {ins.map((i) => (
                  <tr key={i.codigo} className="border-t border-slate-100">
                    <td className="whitespace-nowrap p-1.5 align-top font-mono text-[10px] text-slate-400">{i.codigo}</td>
                    <td className="max-w-[24rem] p-1.5 align-top text-slate-700">{i.descricao}</td>
                    <td className="p-1.5 align-top text-slate-500">{i.tipo === "material" ? "material" : "mão de obra"}</td>
                    <td className="p-1.5 align-top text-slate-500">{i.unidade}</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top font-semibold tabular-nums text-cyan-700">{brl(i.precoNaoDesonerado)}</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top tabular-nums text-slate-500">{brl(i.precoDesonerado)}</td>
                    {onAdicionar && <td className="p-1.5 align-top">
                      <AdicionarQtd onAdd={(qtd) => onAdicionar({ fonte: "SICRO", codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, precoNaoDesonerado: i.precoNaoDesonerado, precoDesonerado: i.precoDesonerado }, qtd)} />
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!!equip.length && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Equipamentos <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">{equip.length} resultado(s)</span></p>
          <div className="mt-1.5 max-h-72 overflow-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr><th className="p-1.5">Código</th><th className="p-1.5">Descrição</th><th className="p-1.5">Un.</th><th className="p-1.5 text-right">Custo produtivo</th><th className="p-1.5 text-right">Custo improdutivo</th>{onAdicionar && <th className="p-1.5"></th>}</tr>
              </thead>
              <tbody>
                {equip.map((e) => (
                  <tr key={e.codigo} className="border-t border-slate-100">
                    <td className="whitespace-nowrap p-1.5 align-top font-mono text-[10px] text-slate-400">{e.codigo}</td>
                    <td className="max-w-[26rem] p-1.5 align-top text-slate-700">{e.descricao}</td>
                    <td className="p-1.5 align-top text-slate-500">h</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top font-semibold tabular-nums text-cyan-700">{brl(e.custoProdutivoHora)}</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top tabular-nums text-slate-500">{brl(e.custoImprodutivoHora)}</td>
                    {onAdicionar && <td className="p-1.5 align-top">
                      <AdicionarQtd onAdd={(qtd) => onAdicionar({ fonte: "SICRO", codigo: e.codigo, descricao: e.descricao, unidade: "h", precoNaoDesonerado: e.custoProdutivoHora, precoDesonerado: null }, qtd)} />
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
        Fonte: DNIT — SICRO, Santa Catarina. &quot;Desonerado&quot;/&quot;não desonerado&quot; são as duas variantes da folha
        que o DNIT publica para mão de obra (materiais e equipamentos têm preço único); a escolha de qual se aplica
        ao regime tributário do contratante é de quem assina o processo.
      </p>
    </section>
  );
}
