import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Coins,
  HeartHandshake,
  Landmark,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import type { AreaScore, Parecer } from "@/lib/audit";
import { OrcadoExecutado } from "@/components/charts/orcado-executado";
import { resumoFornecedores } from "@/lib/contratacao-detalhe";
import { despesaFuncaoArvore, unidadesOrcamentarias } from "@/lib/orcamento";
import type { Compras, Contratacao, Financas, IndicadorRow, Indices } from "@/lib/queries";
import { classifyIndex, fmtBRL, fmtBRLCompact, fmtValor } from "@/lib/ui";

type Nivel = "ok" | "warn" | "bad";
const NIVEL_COR: Record<Nivel, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-rose-600",
};
const NIVEL_DOT: Record<Nivel, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
};

/** Classifica um valor em ok/warn/bad. bomAcima: maior é melhor. */
function nivel(v: number, bomAcima: boolean, limOk: number, limWarn: number): Nivel {
  if (bomAcima) return v >= limOk ? "ok" : v >= limWarn ? "warn" : "bad";
  return v <= limOk ? "ok" : v <= limWarn ? "warn" : "bad";
}

function BlocoHeader({ icon: Icon, titulo, cor }: { icon: LucideIcon; titulo: string; cor: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${cor}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <h3 className="text-sm font-bold text-slate-800">{titulo}</h3>
    </div>
  );
}

function MiniBar({
  label,
  valor,
  cor,
  status,
}: {
  label: string;
  valor: number;
  cor: string;
  status?: string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="tabular-nums text-slate-500">
          {valor.toFixed(0)}
          {status && <span className="ml-1.5 font-medium">· {status}</span>}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${cor}`} style={{ width: `${Math.max(0, Math.min(100, valor))}%` }} />
      </div>
    </div>
  );
}

function StatTile({
  label,
  valor,
  nv,
  sub,
}: {
  label: string;
  valor: string;
  nv?: Nivel;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1.5">
        {nv && <span className={`h-2 w-2 rounded-full ${NIVEL_DOT[nv]}`} />}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${nv ? NIVEL_COR[nv] : "text-slate-900"}`}>{valor}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export type ExecProps = {
  tipo: "Município" | "Estado";
  nome: string;
  uf: string;
  gestorLabel: string;
  gestor: string | null;
  voltarHref: string;
  indices: Indices;
  parecer: Parecer;
  citizenAreas: AreaScore[];
  fiscal: IndicadorRow[];
  compras: Compras | null;
  financas: Financas | null;
  contratacoes?: Contratacao[];
  seed?: string;
};

const PARECER_COR: Record<Parecer["tom"], string> = {
  ok: "bg-emerald-100 text-emerald-700",
  ressalva: "bg-amber-100 text-amber-700",
  critico: "bg-rose-100 text-rose-700",
};

export function ExecutiveDashboard(props: ExecProps) {
  const { indices, fiscal, compras, citizenAreas, financas, seed = "" } = props;
  const unidades = financas ? unidadesOrcamentarias(financas, seed).slice(0, 6) : [];
  const orcExec = financas ? despesaFuncaoArvore(financas, seed).map((n) => ({ label: n.nome, orcado: n.previsto, executado: n.realizado })) : [];
  const contratacoes = props.contratacoes ?? [];
  const totalEstimado = contratacoes.reduce((s, c) => s + c.valor_estimado, 0);
  const totalContratado = contratacoes.reduce((s, c) => s + c.valor_contratado, 0);
  const economiaV = totalEstimado - totalContratado;
  const economiaPct = totalEstimado > 0 ? (economiaV / totalEstimado) * 100 : 0;
  const forn = resumoFornecedores(contratacoes, seed);
  const localLabel = props.tipo === "Estado" ? "do estado" : "do município";
  const fGet = (codigo: string) => fiscal.find((f) => f.codigo === codigo);
  const icebCls = classifyIndex(indices.iceb);
  const invpCls = classifyIndex(indices.invp);

  const gp = fGet("gasto_pessoal_rcl");
  const rp = fGet("receita_propria_pct");
  const liq = fGet("liquidez_corrente");
  const inv = fGet("investimento_per_capita");

  const gpNivel: Nivel = gp ? (gp.valor >= 54 ? "bad" : gp.valor >= 51 ? "warn" : "ok") : "ok";

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href={props.voltarHref} className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-600">
            <ArrowLeft className="h-3 w-3" /> Painel detalhado
          </Link>
          <h1 className="font-display tracking-tight text-2xl font-bold text-slate-900">
            Painel Executivo de Gestão
          </h1>
          <p className="text-sm text-slate-500">
            {props.nome} — {props.uf} · {props.gestorLabel}: <strong className="text-slate-700">{props.gestor}</strong>
          </p>
        </div>
        <span className={`self-start rounded-full px-3 py-1 text-sm font-semibold ${PARECER_COR[props.parecer.tom]}`}>
          {props.parecer.rotulo}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* BLOCO 1 — GESTÃO */}
        <section className="break-avoid rounded-2xl border border-slate-200 bg-white p-5">
          <BlocoHeader icon={Building2} titulo="Gestão — Capacidade Estatal" cor="bg-blue-600" />
          <div className="flex items-end gap-3">
            <span className="font-display text-4xl font-bold tracking-tight text-slate-900">{indices.iceb.toFixed(1)}</span>
            <span className="pb-1 text-sm text-slate-500">/ 100 · ICEB</span>
            <span className={`mb-1 ml-auto rounded-full px-2 py-0.5 text-xs font-semibold text-white ${icebCls.color}`}>
              {icebCls.label}
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            <MiniBar label="Planejamento" valor={indices.cap_planejamento} cor="bg-blue-500" />
            <MiniBar label="Capacidade fiscal" valor={indices.cap_fiscal} cor="bg-blue-500" />
            <MiniBar label="Gestão" valor={indices.cap_gestao} cor="bg-blue-500" />
            <MiniBar label="Transparência" valor={indices.cap_transparencia} cor="bg-blue-500" />
          </div>
        </section>

        {/* BLOCO 2 — CONDIÇÕES FINANCEIRAS */}
        <section className="break-avoid rounded-2xl border border-slate-200 bg-white p-5">
          <BlocoHeader icon={Coins} titulo="Condições Financeiras" cor="bg-emerald-600" />

          {/* Resumo orçamentário (receitas e despesas) */}
          {financas && (
            <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2.5">
              <div>
                <div className="text-[11px] text-slate-500">Receita</div>
                <div className="text-sm font-bold text-slate-800">{fmtBRLCompact(financas.receita_total)}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Despesa</div>
                <div className="text-sm font-bold text-slate-800">{fmtBRLCompact(financas.despesa_total)}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Resultado</div>
                <div className={`text-sm font-bold ${financas.receita_total - financas.despesa_total >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {fmtBRLCompact(financas.receita_total - financas.despesa_total)}
                </div>
              </div>
            </div>
          )}

          {/* LRF — gasto com pessoal */}
          {gp && (
            <div className="mb-3">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-600">Gasto com pessoal (folha)</span>
                <span className={`font-semibold tabular-nums ${NIVEL_COR[gpNivel]}`}>{fmtValor(gp.valor, "%")}</span>
              </div>
              <div className="relative h-2.5 w-full rounded-full bg-slate-100">
                <div className={`h-2.5 rounded-full ${gpNivel === "bad" ? "bg-rose-500" : gpNivel === "warn" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (gp.valor / 60) * 100)}%` }} />
                {/* limite LRF 54% (de 0 a 60 → 90%) */}
                <div className="absolute inset-y-0" style={{ left: `${(54 / 60) * 100}%` }}>
                  <div className="h-2.5 w-px bg-slate-700" />
                </div>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">% da receita gasta com salários · teto legal (LRF): 54%</div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {rp && (
              <StatTile
                label="Receita própria"
                valor={fmtValor(rp.valor, "%")}
                nv={nivel(rp.valor, true, 30, 18)}
                sub={`pares: ${fmtValor(rp.media, "%")}`}
              />
            )}
            {liq && (
              <StatTile
                label="Liquidez corrente"
                valor={fmtValor(liq.valor, "índice")}
                nv={nivel(liq.valor, true, 1.2, 1.0)}
                sub="caixa p/ cada R$ 1 devido"
              />
            )}
            {inv && (
              <StatTile
                label="Invest./hab"
                valor={fmtBRL(inv.valor)}
                nv={nivel(inv.valor, true, inv.media, inv.media * 0.7)}
                sub={`pares: ${fmtBRL(inv.media)}`}
              />
            )}
          </div>
        </section>

        {/* BLOCO 3 — COMPRAS PÚBLICAS */}
        <section className="break-avoid rounded-2xl border border-slate-200 bg-white p-5">
          <BlocoHeader icon={ShoppingCart} titulo="Compras Públicas (PNCP)" cor="bg-orange-600" />
          {compras ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <StatTile label="Valor contratado/hab" valor={fmtBRL(compras.valor_contratado_pc)} sub="total comprado por habitante" />
                <StatTile label="Pregão eletrônico" valor={fmtValor(compras.pct_pregao_eletronico, "%")} nv={nivel(compras.pct_pregao_eletronico, true, 75, 60)} sub="+ concorrência · maior é melhor" />
                <StatTile label="Dispensa/inexig." valor={fmtValor(compras.pct_dispensa, "%")} nv={nivel(compras.pct_dispensa, false, 15, 25)} sub="compra sem licitação · menor é melhor" />
                <StatTile label="Economia em pregões" valor={fmtValor(compras.economia_pregao, "%")} nv={nivel(compras.economia_pregao, true, 15, 10)} sub="desconto obtido · maior é melhor" />
                <StatTile label="Transparência (PNCP)" valor={fmtValor(compras.transparencia_pncp, "%")} nv={nivel(compras.transparencia_pncp, true, 85, 70)} sub="contratos publicados · ideal ≥ 85%" />
                <StatTile label="Compras com MPE" valor={fmtValor(compras.pct_mpe, "%")} nv={nivel(compras.pct_mpe, true, 40, 30)} sub="micro e pequenas empresas locais" />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <StatTile label="Fornecedores ativos / mil hab" valor={fmtValor(compras.fornecedores_mil, "índice")} nv={nivel(compras.fornecedores_mil, true, 9, 5)} sub="mais fornecedores = mais competição" />
                <StatTile label="Prazo médio de contratação" valor={`${compras.prazo_medio_dias.toFixed(0)} dias`} nv={nivel(compras.prazo_medio_dias, false, 45, 75)} sub="da abertura à assinatura · menor é melhor" />
              </div>
              {contratacoes.length > 0 && (
                <>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <StatTile label="Estimado (orçado)" valor={fmtBRLCompact(totalEstimado)} sub="valor de referência" />
                    <StatTile label="Contratado (adquirido)" valor={fmtBRLCompact(totalContratado)} sub="valor efetivamente contratado" />
                    <StatTile label="Economia" valor={`${fmtBRLCompact(economiaV)} · ${economiaPct.toFixed(1)}%`} nv="ok" sub="estimado − contratado" />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <StatTile label={`Fornecedores ${localLabel}`} valor={fmtBRLCompact(forn.local.valor)} sub={`${forn.local.qtd} contratos · mantém o recurso na economia local`} />
                    <StatTile label="Fornecedores de fora" valor={fmtBRLCompact(forn.fora.valor)} sub={`${forn.fora.qtd} contratos`} />
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Sem dados de compras para este ente.</p>
          )}
        </section>

        {/* BLOCO 4 — VALOR PÚBLICO */}
        <section className="break-avoid rounded-2xl border border-slate-200 bg-white p-5">
          <BlocoHeader icon={HeartHandshake} titulo="Valor Público ao Cidadão" cor="bg-violet-600" />
          <div className="flex items-end gap-3">
            <span className="font-display text-4xl font-bold tracking-tight text-slate-900">{indices.invp.toFixed(1)}</span>
            <span className="pb-1 text-sm text-slate-500">/ 100 · INVP</span>
            <span className={`mb-1 ml-auto rounded-full px-2 py-0.5 text-xs font-semibold text-white ${invpCls.color}`}>
              {invpCls.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Benefícios efetivamente percebidos pela população nas áreas finalísticas:
          </p>
          <div className="mt-3 space-y-2.5">
            {citizenAreas.map((a) => (
              <MiniBar
                key={a.area}
                label={a.label}
                valor={a.score}
                cor={a.classe === "acima" ? "bg-emerald-500" : a.classe === "media" ? "bg-amber-500" : "bg-rose-500"}
                status={a.classe === "acima" ? "Acima" : a.classe === "media" ? "Na média" : "Abaixo"}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Desempenho por área vs. pares (50 = média).</p>
        </section>
      </div>

      {/* Orçado × Executado por função */}
      {orcExec.length > 0 && (
        <section className="break-avoid rounded-2xl border border-slate-200 bg-white p-5" aria-label="Orçado x Executado por função">
          <h3 className="mb-1 font-semibold text-slate-800">Orçado × Executado por função</h3>
          <p className="mb-2 text-xs text-slate-500">Quanto foi planejado e quanto foi realizado em cada área</p>
          <OrcadoExecutado data={orcExec} />
        </section>
      )}

      {/* Execução orçamentária por órgão (principais) */}
      {unidades.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Execução por órgão">
          <h3 className="mb-1 font-semibold text-slate-800">Execução orçamentária por órgão</h3>
          <p className="mb-4 text-xs text-slate-500">Principais unidades · orçado × executado</p>
          <div className="space-y-2.5">
            {unidades.map((u) => (
              <div key={u.nome} className="flex items-center gap-3">
                <span className="w-48 shrink-0 truncate text-sm text-slate-700">{u.nome}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div
                    className={`h-2 rounded-full ${u.execucao >= 90 ? "bg-emerald-500" : u.execucao >= 80 ? "bg-amber-500" : "bg-rose-500"}`}
                    style={{ width: `${u.execucao}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">
                  {fmtBRLCompact(u.executado)}
                </span>
                <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-slate-500 sm:inline">
                  {u.execucao.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-center text-xs text-slate-500">
        PNIGP · Painel Executivo · dados simulados para demonstração
      </p>
    </div>
  );
}
