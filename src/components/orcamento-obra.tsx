"use client";
// ═══ ORÇAMENTO DE OBRA — o carrinho que soma preço unitário × quantidade (03/set/2026) ═══
// SINAPI, SICRO e SIE-SC entregam preço UNITÁRIO (por m², m³, kg, h…). Para virar orçamento de obra falta
// a quantidade — e essa é a única peça que só quem está olhando o projeto sabe, então o sistema não inventa,
// só multiplica e soma o que a pessoa informar. Compartilhado pelos três painéis (SinapiPainel, SicroPainel,
// SiescPainel) via o mesmo `onAdicionar`, para poder montar UM orçamento misturando fontes — que é como uma
// obra real funciona: SINAPI/SICRO para a maior parte, SIE-SC para o que só o estado calibra.
// Fica só no estado da tela (não persiste no banco) — mesma escolha do Banco de Preços; se um dia precisar
// salvar/retomar orçamentos, isso vira tabela.
import { useState } from "react";
import { Plus, Trash2, ClipboardList, Copy } from "lucide-react";

export type FonteObra = "PNCP" | "SINAPI" | "SICRO" | "SIE-SC";
export type NovoItemOrcamento = {
  fonte: FonteObra; codigo: string; descricao: string; unidade: string;
  precoNaoDesonerado: number | null; precoDesonerado: number | null;
};
export type ItemOrcamento = NovoItemOrcamento & { id: string; quantidade: number };

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Preço efetivo do item sob o regime escolhido — cai pro que existir quando a fonte só publica um preço
// (SIE-SC, materiais e equipamentos do SICRO não têm variante desonerada).
export function precoEfetivo(item: Pick<ItemOrcamento, "precoNaoDesonerado" | "precoDesonerado">, desonerado: boolean): number {
  if (desonerado && item.precoDesonerado != null) return item.precoDesonerado;
  return item.precoNaoDesonerado ?? item.precoDesonerado ?? 0;
}

// Campo de quantidade + botão, usado dentro de cada linha de resultado nos três painéis. Estado próprio
// (não do painel pai) para não empilhar um mapa de rascunho por código em cada tela que já tem bastante coisa.
export function AdicionarQtd({ onAdd }: { onAdd: (quantidade: number) => void }) {
  const [qtd, setQtd] = useState("");
  const n = Number(qtd.replace(",", "."));
  return (
    <div className="flex items-center justify-end gap-1">
      <input value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="qtd" inputMode="decimal"
        className="w-14 rounded border border-slate-200 px-1 py-0.5 text-right text-[10px] outline-none focus:border-slate-400" />
      <button
        onClick={() => { if (n > 0) { onAdd(n); setQtd(""); } }}
        disabled={!(n > 0)}
        title="Adicionar ao orçamento"
        className="rounded bg-slate-700 p-1 text-white disabled:opacity-25"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

const corFonte: Record<FonteObra, string> = {
  PNCP: "bg-teal-50 text-teal-700", SINAPI: "bg-orange-50 text-orange-700", SICRO: "bg-cyan-50 text-cyan-700", "SIE-SC": "bg-emerald-50 text-emerald-700",
};

export function OrcamentoCarrinho({
  itens, desonerado, onDesoneradoChange, onQtdChange, onRemover,
}: {
  itens: ItemOrcamento[]; desonerado: boolean; onDesoneradoChange: (v: boolean) => void;
  onQtdChange: (id: string, quantidade: number) => void; onRemover: (id: string) => void;
}) {
  const total = itens.reduce((acc, it) => acc + precoEfetivo(it, desonerado) * it.quantidade, 0);

  const copiar = () => {
    const L: string[] = [];
    L.push(`ORÇAMENTO DE OBRA (${desonerado ? "desonerado" : "não desonerado"})`);
    L.push("");
    for (const it of itens) {
      const p = precoEfetivo(it, desonerado);
      L.push(`  [${it.fonte} ${it.codigo}] ${it.descricao} — ${it.quantidade} ${it.unidade} × ${brl(p)} = ${brl(p * it.quantidade)}`);
    }
    L.push("");
    L.push(`TOTAL: ${brl(total)}`);
    navigator.clipboard?.writeText(L.join("\n"));
  };

  return (
    <section className="mt-4 rounded-2xl border-2 border-slate-800 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-slate-800"><ClipboardList className="h-4 w-4" /> Orçamento de obra</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <input type="checkbox" checked={desonerado} onChange={(e) => onDesoneradoChange(e.target.checked)} className="h-3.5 w-3.5 accent-slate-700" />
            usar preço desonerado (quando a fonte publicar)
          </label>
          {!!itens.length && (
            <button onClick={copiar} className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline"><Copy className="h-3 w-3" /> copiar</button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
        Some itens da Referência SINAPI, SICRO e SIE-SC acima informando a quantidade de cada um — o total abaixo
        é preço unitário × quantidade, somado por item. Nada aqui é salvo: copie o resultado antes de sair da tela.
      </p>

      {!itens.length ? (
        <p className="mt-3 text-[12px] text-slate-400">Nenhum item ainda. Busque acima e informe a quantidade de cada serviço para somar aqui.</p>
      ) : (
        <>
          <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-1.5">Fonte</th><th className="p-1.5">Descrição</th><th className="p-1.5">Un.</th>
                  <th className="p-1.5 text-right">Preço unit.</th><th className="p-1.5 text-right">Qtd.</th>
                  <th className="p-1.5 text-right">Subtotal</th><th className="w-6 p-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => {
                  const p = precoEfetivo(it, desonerado);
                  return (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap p-1.5 align-top"><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${corFonte[it.fonte]}`}>{it.fonte}</span></td>
                      <td className="max-w-[22rem] p-1.5 align-top text-slate-700">{it.descricao} <span className="font-mono text-[9px] text-slate-400">{it.codigo}</span></td>
                      <td className="p-1.5 align-top text-slate-500">{it.unidade}</td>
                      <td className="whitespace-nowrap p-1.5 text-right align-top tabular-nums text-slate-500">{brl(p)}</td>
                      <td className="p-1.5 text-right align-top">
                        <input type="text" inputMode="decimal" value={it.quantidade}
                          onChange={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v) && v >= 0) onQtdChange(it.id, v); }}
                          className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right text-[11px] outline-none focus:border-slate-400" />
                      </td>
                      <td className="whitespace-nowrap p-1.5 text-right align-top font-semibold tabular-nums text-slate-800">{brl(p * it.quantidade)}</td>
                      <td className="p-1.5 align-top">
                        <button onClick={() => onRemover(it.id)} title="Remover" className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex justify-end">
            <div className="rounded-lg bg-slate-800 px-4 py-2 text-right">
              <div className="text-[9px] uppercase tracking-wide text-slate-300">total do orçamento</div>
              <div className="font-display text-xl font-bold tabular-nums text-white">{brl(total)}</div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
