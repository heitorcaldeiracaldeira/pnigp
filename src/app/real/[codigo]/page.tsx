import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Database, Landmark, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Logo } from "@/components/brand";
import { Donut } from "@/components/charts/donut";
import { LinhasFinanceiras } from "@/components/charts/linhas-financeiras";
import { OrcadoExecutado } from "@/components/charts/orcado-executado";
import { ComprasSCSection } from "@/components/compras-sc-section";
import { TransferenciasSCSection } from "@/components/transferencias-sc-section";
import { PanelTabs } from "@/components/panel-tabs";
import { RealSelector } from "@/components/real-selector";
import { FONTE_SICONFI, getEntesSC, getFinancasSC } from "@/lib/queries";
import { fmtBRL, fmtBRLCompact, fmtPop } from "@/lib/ui";

export const metadata = { title: "PNIGP — Santa Catarina (dados oficiais SICONFI)" };
export const dynamic = "force-dynamic";

export default async function RealEntePage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const [dados, entes] = await Promise.all([getFinancasSC(codigo), getEntesSC()]);
  if (!dados || dados.serie.length === 0) notFound();

  const { ente, serie, funcoesLatest } = dados;
  const a = serie[serie.length - 1];
  const anterior = serie[serie.length - 2] ?? null;
  const resultado = a.receita - a.despesa;
  const superavit = resultado >= 0;
  const pctArrec = a.receita_prevista > 0 ? (a.receita / a.receita_prevista) * 100 : 0;
  const deltaRec = anterior && anterior.receita ? ((a.receita - anterior.receita) / anterior.receita) * 100 : null;
  const anoIni = serie[0].ano;
  const anoFim = a.ano;

  const options = entes.map((e) => ({ value: e.cod_ibge, label: e.tipo === "E" ? `★ ${e.nome}` : e.nome }));
  const receitaData = [
    { label: "Receita tributária (própria)", valor: a.tributaria },
    { label: "Transferências", valor: a.transferencias },
    { label: "Outras receitas", valor: a.outras },
  ];
  const despesaData = [
    { label: "Pessoal e encargos", valor: a.pessoal },
    { label: "Custeio", valor: a.custeio },
    { label: "Investimentos", valor: a.investimento },
    { label: "Dívida", valor: a.divida },
  ];
  const funcData = funcoesLatest.slice(0, 8).map((f) => ({ label: f.nome, orcado: f.dotacao, executado: f.empenhado }));

  const tabs = [
    {
      id: "visao",
      label: "Visão geral",
      content: (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><Wallet className="h-4 w-4 text-teal-600" /> Receita arrecadada {a.ano}</div>
              <div className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">{fmtBRLCompact(a.receita)}</div>
              {deltaRec != null && (
                <div className={`text-xs font-medium ${deltaRec >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {deltaRec >= 0 ? "▲" : "▼"} {Math.abs(deltaRec).toFixed(1)}% vs. {anterior!.ano}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><Landmark className="h-4 w-4 text-indigo-600" /> Despesa empenhada {a.ano}</div>
              <div className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">{fmtBRLCompact(a.despesa)}</div>
              <div className="text-xs text-slate-500">{pctArrec.toFixed(0)}% da receita prevista arrecadada</div>
            </div>
            <div className={`rounded-2xl border p-4 ${superavit ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                {superavit ? <TrendingUp className="h-4 w-4 text-emerald-600" /> : <TrendingDown className="h-4 w-4 text-rose-600" />} Resultado {a.ano}
              </div>
              <div className={`mt-1 font-display text-2xl font-bold tracking-tight ${superavit ? "text-emerald-700" : "text-rose-700"}`}>{fmtBRLCompact(resultado)}</div>
              <div className="text-xs font-medium text-slate-500">{superavit ? "Superávit" : "Déficit"}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><Wallet className="h-4 w-4 text-slate-500" /> Receita por habitante</div>
              <div className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">{ente.populacao ? fmtBRL(a.receita / ente.populacao) : "—"}</div>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-semibold text-slate-800">Evolução das finanças ({anoIni}–{anoFim})</h3>
            <p className="mb-2 text-xs text-slate-500">Receita arrecadada × despesa empenhada por exercício · dados oficiais SICONFI</p>
            <LinhasFinanceiras data={serie as unknown as Record<string, number>[]} linhas={[{ key: "receita", label: "Receita arrecadada", cor: "#0f766e" }, { key: "despesa", label: "Despesa empenhada", cor: "#e11d48" }]} />
          </section>

          {serie.some((s) => s.saude > 0) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-800">Investimento nas áreas ao longo do tempo</h3>
              <p className="mb-2 text-xs text-slate-500">Despesa empenhada por função-chave · {anoIni}–{anoFim}</p>
              <LinhasFinanceiras data={serie as unknown as Record<string, number>[]} linhas={[{ key: "saude", label: "Saúde", cor: "#0891b2" }, { key: "educacao", label: "Educação", cor: "#2563eb" }, { key: "infraestrutura", label: "Infraestrutura", cor: "#7c3aed" }, { key: "assistencia", label: "Assistência", cor: "#f59e0b" }]} />
            </section>
          )}
        </>
      ),
    },
    {
      id: "financas",
      label: "Finanças",
      content: (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-800">De onde vem o dinheiro · {a.ano}</h3>
              <p className="mb-2 text-xs text-slate-500">Receita arrecadada por origem</p>
              <Donut data={receitaData} />
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-800">Como o dinheiro é gasto · {a.ano}</h3>
              <p className="mb-2 text-xs text-slate-500">Despesa empenhada por categoria econômica</p>
              <Donut data={despesaData} />
            </section>
          </div>
          {funcData.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-800">Orçado × Executado por função · LOA {a.ano}</h3>
              <p className="mb-2 text-xs text-slate-500">Dotação atualizada × despesa empenhada — principais funções</p>
              <OrcadoExecutado data={funcData} />
            </section>
          )}
        </>
      ),
    },
    { id: "compras", label: "Compras", content: <ComprasSCSection codigo={ente.cod_ibge} tipo={ente.tipo} /> },
    { id: "transferencias", label: "Transferências", content: <TransferenciasSCSection codigo={ente.cod_ibge} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50" style={{ ["--header-h" as string]: "60px" } as React.CSSProperties}>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <div className="leading-tight">
              <div className="font-display text-base font-bold tracking-tight text-slate-900">PNIGP</div>
              <div className="hidden text-xs text-slate-500 sm:block">Santa Catarina · dados oficiais</div>
            </div>
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Início
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
        {/* Cabeçalho do ente + seletor */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                  {ente.nome} <span className="text-base font-semibold text-slate-500">— SC</span>
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  <Database className="h-3 w-3" /> Dados oficiais
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {ente.tipo === "E" ? "Governo estadual" : "Município"} · {fmtPop(ente.populacao)} · série {anoIni}–{anoFim} · IBGE {ente.cod_ibge}
              </p>
            </div>
            <div className="lg:items-end">
              <span className="mb-1 block text-xs text-slate-500">Trocar ente (295 municípios + Estado)</span>
              <RealSelector options={options} atual={ente.cod_ibge} />
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <strong className="text-slate-700">Fonte:</strong> {FONTE_SICONFI}. Números reais publicados.
          </p>
        </div>

        {/* Seções em abas (mesmo layout do painel) */}
        <PanelTabs tabs={tabs} />

        <footer className="py-6 text-center text-xs text-slate-500">
          PNIGP · Instituto I10 — finanças do SICONFI ({anoIni}–{anoFim}), compras do PNCP e transferências do Transferegov/CGU. Bases oficiais usadas pelo TCE/SC.
        </footer>
      </main>
    </div>
  );
}
