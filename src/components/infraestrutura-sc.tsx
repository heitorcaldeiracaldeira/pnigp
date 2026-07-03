// Aba INFRAESTRUTURA — começa pelo Saneamento (Censo 2022 IBGE). Extensível: SNIS (índices operacionais),
// habitação, mobilidade, energia entram aqui depois. Exibição neutra/didática com metodologia.
import { Database, Droplets } from "lucide-react";
import type { SaneamentoSC } from "@/lib/queries";

const COR: Record<string, string> = { agua_rede: "#0ea5e9", esgoto_adeq: "#7c3aed", lixo_coletado: "#16a34a" };
const fmt = (n: number) => n.toLocaleString("pt-BR");

export function InfraestruturaSC({ data, nome }: { data: NonNullable<SaneamentoSC>; nome: string }) {
  const pior = [...data.itens].sort((a, b) => a.pct - b.pct)[0];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-50 to-white p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Droplets className="h-4 w-4 text-sky-600" /> Infraestrutura — Saneamento básico de {nome}</div>
        <p className="mt-1 text-sm text-slate-600">Cobertura dos serviços de saneamento por domicílio, segundo o Censo {data.ano}. O déficit dimensiona a necessidade — e a elegibilidade a programas federais de investimento (Novo PAC, FUNASA, Caixa).</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {data.itens.map((it) => {
          const cor = COR[it.ch] || "#0ea5e9";
          const acimaUF = it.pct >= it.mediaUF;
          return (
            <section key={it.ch} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-700">{it.label}</h3>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tabular-nums" style={{ color: cor }}>{it.pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
                <span className="text-xs text-slate-500">dos domicílios</span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, it.pct)}%`, backgroundColor: cor }} />
              </div>
              <dl className="mt-3 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between"><dt>Domicílios atendidos</dt><dd className="tabular-nums font-medium text-slate-700">{fmt(it.atendidos)}</dd></div>
                <div className="flex justify-between"><dt>Sem cobertura (déficit)</dt><dd className="tabular-nums font-semibold text-rose-600">{fmt(it.deficit)}</dd></div>
                <div className="flex justify-between border-t border-slate-100 pt-1"><dt>Média de SC</dt><dd className={`tabular-nums font-medium ${acimaUF ? "text-emerald-600" : "text-amber-600"}`}>{it.mediaUF.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% {acimaUF ? "▲ acima" : "▼ abaixo"}</dd></div>
              </dl>
            </section>
          );
        })}
      </div>

      {data.snis && data.snis.prestadores.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-800">Indicadores operacionais do prestador — SNIS {data.snis.ano}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Quem opera o saneamento e a eficiência real (Ministério das Cidades). Complementa o Censo: aqui é o desempenho do prestador, não a cobertura domiciliar.</p>
          {data.snis.prestadores.map((p, i) => {
            const nat = /economia mista/i.test(p.natureza) ? { l: "Companhia estadual", c: "bg-blue-100 text-blue-700" }
              : /autarquia/i.test(p.natureza) ? { l: "Autarquia municipal", c: "bg-emerald-100 text-emerald-700" }
              : /direta/i.test(p.natureza) ? { l: "Município (adm. direta)", c: "bg-emerald-100 text-emerald-700" }
              : /privada/i.test(p.natureza) ? { l: "Empresa privada", c: "bg-amber-100 text-amber-700" }
              : { l: p.natureza, c: "bg-slate-100 text-slate-600" };
            const ind = [
              { k: "Atend. água", v: p.atendAgua }, { k: "Atend. esgoto", v: p.atendEsgoto },
              { k: "Coleta esgoto", v: p.coletaEsgoto }, { k: "Trat. esgoto", v: p.tratEsgoto }, { k: "Perdas água", v: p.perdas },
            ];
            return (
              <div key={i} className="mt-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">{p.sigla || p.prestador}</span>
                  {p.sigla && <span className="text-xs text-slate-500">{p.prestador}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${nat.c}`}>{nat.l}</span>
                  {p.abrangencia && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{p.abrangencia}</span>}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {ind.map((x) => (
                    <div key={x.k} className="rounded-lg bg-white px-2 py-1.5 text-center">
                      <div className="text-sm font-bold tabular-nums text-slate-700">{x.v == null ? "—" : `${x.v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</div>
                      <div className="text-[10px] leading-tight text-slate-500">{x.k}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {data.snis.serie.filter((x) => x.agua != null || x.esgoto != null).length >= 2 && (() => {
            const s = data.snis!.serie;
            const W = 480, H = 150, P = 30;
            const anos = s.map((x) => x.ano), xmin = Math.min(...anos), xmax = Math.max(...anos);
            const X = (a: number) => P + (xmax === xmin ? 0 : (a - xmin) / (xmax - xmin)) * (W - 2 * P);
            const Y = (v: number) => H - P - (v / 100) * (H - 2 * P);
            const linha = (key: "agua" | "esgoto" | "perdas", cor: string) => {
              const pts = s.filter((x) => x[key] != null).map((x) => `${X(x.ano)},${Y(x[key] as number)}`);
              return pts.length ? <polyline points={pts.join(" ")} fill="none" stroke={cor} strokeWidth={2} /> : null;
            };
            const pontos = (key: "agua" | "esgoto" | "perdas", cor: string) => s.filter((x) => x[key] != null).map((x) => <circle key={key + x.ano} cx={X(x.ano)} cy={Y(x[key] as number)} r={2.5} fill={cor} />);
            return (
              <div className="mt-4">
                <div className="mb-1 text-xs font-semibold text-slate-600">Evolução temporal — SNIS {xmin}–{xmax}</div>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolução dos indicadores de saneamento">
                  {[0, 50, 100].map((v) => (<g key={v}><line x1={P} y1={Y(v)} x2={W - P} y2={Y(v)} stroke="#e2e8f0" strokeWidth={1} /><text x={6} y={Y(v) + 3} fontSize={9} fill="#94a3b8">{v}%</text></g>))}
                  {linha("agua", "#0ea5e9")}{linha("esgoto", "#7c3aed")}{linha("perdas", "#f59e0b")}
                  {pontos("agua", "#0ea5e9")}{pontos("esgoto", "#7c3aed")}{pontos("perdas", "#f59e0b")}
                  {anos.map((a) => <text key={a} x={X(a)} y={H - 8} fontSize={9} fill="#94a3b8" textAnchor="middle">{a}</text>)}
                </svg>
                <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
                  <span><span className="text-sky-500">●</span> Atendimento de água</span>
                  <span><span className="text-violet-600">●</span> Atendimento de esgoto</span>
                  <span><span className="text-amber-500">●</span> Perdas na distribuição</span>
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {pior && pior.deficit > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-sm font-semibold text-amber-800">Maior lacuna: {pior.label.toLowerCase()}</h3>
          <p className="mt-1 text-sm text-slate-700"><b>{fmt(pior.deficit)} domicílios</b> de {nome} estão sem {pior.label.toLowerCase()} ({pior.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de cobertura). Déficit dessa magnitude é a base técnica para pleitear recursos no <b>Novo PAC Seleções (Saneamento)</b>, na <b>FUNASA</b> e em financiamentos da <b>Caixa/BNDES</b> — desde que o município tenha o Plano Municipal de Saneamento e projeto.</p>
        </section>
      )}

      <p className="text-[11px] text-slate-500">
        <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
Fontes: cobertura domiciliar — <b>{data.fonte}</b> (domicílios particulares permanentes; água por rede geral; esgoto por rede/pluvial/fossa ligada; lixo coletado). Indicadores operacionais e prestador — <b>SNIS / Ministério das Cidades</b> (desagregado por município). Duas óticas complementares: cobertura (domicílios) × desempenho do operador.
      </p>
    </div>
  );
}
