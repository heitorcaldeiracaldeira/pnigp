"use client";
// ═══ REFERÊNCIA SINAPI — painel PRÓPRIO, ao lado do Banco de Preços (03/set/2026) ═══
// Não é a mesma coisa que o Banco de Preços: aquele é preço PRATICADO (o que o município realmente pagou,
// tirado do PNCP); este é preço DE REFERÊNCIA da Caixa/IBGE para obra e serviço de engenharia — a régua que
// a Lei 14.133 manda usar quando o objeto é obra (art. 23, §2º). Por isso é busca, tabela e rota à parte —
// pedido do Heitor: "não misture com os arquivos que são gerados do PNCP, deixe em um local próprio".
import { useEffect, useRef, useState } from "react";
import { HardHat, Search, Loader2, AlertTriangle } from "lucide-react";

type Composicao = {
  codigo: number; descricao: string; unidade: string; classe: string; siglaClasse: string; tipo1: string;
  origemPreco: string; vinculo: string; custoNaoDesonerado: number | null; custoDesonerado: number | null;
};
type Insumo = {
  codigo: number; descricao: string; unidade: string; origemPreco: string;
  precoNaoDesonerado: number | null; precoDesonerado: number | null;
};

const brl = (v: number | null) => v == null ? "—" : "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SinapiPainel() {
  const [q, setQ] = useState("");
  const [comp, setComp] = useState<Composicao[]>([]);
  const [ins, setIns] = useState<Insumo[]>([]);
  const [competencia, setCompetencia] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [buscou, setBuscou] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const termo = q.trim();
    timer.current = setTimeout(async () => {
      if (termo.length < 3) { setComp([]); setIns([]); setBuscou(false); return; }
      setCarregando(true); setErro("");
      try {
        const r = await fetch("/api/sinapi-precos/" + encodeURIComponent(termo));
        const j = await r.json();
        if (j.erro) throw new Error(j.erro);
        setComp(j.composicoes || []); setIns(j.insumos || []); setCompetencia(j.competencia || "");
      } catch (e) { setErro(String((e as Error).message || e)); setComp([]); setIns([]); }
      setBuscou(true); setCarregando(false);
    }, 400);
  }, [q]);

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-orange-700"><HardHat className="h-4 w-4" /> Referência SINAPI</h3>
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">obras e serviços de engenharia</span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
        Preço de referência da <b>Caixa Econômica Federal / IBGE</b> para insumos e composições de obra — a régua que a
        Lei 14.133/2021 (art. 23, §2º) manda usar quando o objeto é obra ou serviço de engenharia, ao lado (não em
        substituição) do preço praticado do Banco de Preços acima. Busque por código SINAPI ou por descrição.
      </p>
      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-700">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <b>Referência defasada: competência {competencia ? `${competencia.slice(4)}/${competencia.slice(0, 4)}` : "dez/2024"}.</b> É
          a mais recente que o canal público da Caixa disponibiliza hoje para Santa Catarina — o site da Caixa não
          publica insumos/composições por UF desde então, embora o SINAPI continue ativo (o IBGE já cita resultado de
          jul/2026). Confira o valor no <a href="https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi/Paginas/default.aspx" target="_blank" rel="noreferrer" className="underline">portal oficial da Caixa</a> antes de usar num processo.
        </span>
      </p>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 focus-within:border-orange-500">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código SINAPI ou descrição: 87280, reaterro de vala, alvenaria de bloco…"
          className="w-full bg-transparent text-sm outline-none" />
        {carregando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-orange-500" />}
      </div>
      {erro && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{erro}</p>}

      {buscou && !comp.length && !ins.length && !erro && (
        <p className="mt-3 text-[12px] text-slate-400">Nenhuma composição ou insumo SINAPI (SC) com “{q.trim()}”.</p>
      )}

      {!!comp.length && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Composições <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">{comp.length} resultado(s)</span></p>
          <div className="mt-1.5 max-h-96 overflow-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr><th className="p-1.5">Código</th><th className="p-1.5">Descrição</th><th className="p-1.5">Grupo</th><th className="p-1.5">Un.</th><th className="p-1.5 text-right">Não desonerado</th><th className="p-1.5 text-right">Desonerado</th></tr>
              </thead>
              <tbody>
                {comp.map((c) => (
                  <tr key={c.codigo} className="border-t border-slate-100">
                    <td className="whitespace-nowrap p-1.5 align-top font-mono text-[10px] text-slate-400">{c.codigo}</td>
                    <td className="max-w-[26rem] p-1.5 align-top text-slate-700">{c.descricao}</td>
                    <td className="p-1.5 align-top text-slate-500">{c.classe}</td>
                    <td className="p-1.5 align-top text-slate-500">{c.unidade}</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top font-semibold tabular-nums text-orange-700">{brl(c.custoNaoDesonerado)}</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top tabular-nums text-slate-500">{brl(c.custoDesonerado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!!ins.length && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Insumos <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">{ins.length} resultado(s)</span></p>
          <div className="mt-1.5 max-h-72 overflow-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr><th className="p-1.5">Código</th><th className="p-1.5">Descrição</th><th className="p-1.5">Un.</th><th className="p-1.5 text-right">Não desonerado</th><th className="p-1.5 text-right">Desonerado</th></tr>
              </thead>
              <tbody>
                {ins.map((i) => (
                  <tr key={i.codigo} className="border-t border-slate-100">
                    <td className="whitespace-nowrap p-1.5 align-top font-mono text-[10px] text-slate-400">{i.codigo}</td>
                    <td className="max-w-[26rem] p-1.5 align-top text-slate-700">{i.descricao}</td>
                    <td className="p-1.5 align-top text-slate-500">{i.unidade}</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top font-semibold tabular-nums text-orange-700">{brl(i.precoNaoDesonerado)}</td>
                    <td className="whitespace-nowrap p-1.5 text-right align-top tabular-nums text-slate-500">{brl(i.precoDesonerado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
        Fonte: Caixa Econômica Federal / IBGE — SINAPI, Santa Catarina, localidade de referência Florianópolis.
        “Desonerado” e “não desonerado” são as duas variantes da folha que a Caixa publica; a escolha de qual se
        aplica ao regime tributário do contratante é de quem assina o processo.
      </p>
    </section>
  );
}
