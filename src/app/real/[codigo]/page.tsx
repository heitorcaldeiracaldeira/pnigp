import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, Database, FileText, Landmark, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Logo } from "@/components/brand";
import { Donut } from "@/components/charts/donut";
import { LinhasFinanceiras } from "@/components/charts/linhas-financeiras";
import { OrcadoExecutado } from "@/components/charts/orcado-executado";
import { ComprasSCSection } from "@/components/compras-sc-section";
import { DiagnosticoGestor } from "@/components/diagnostico-gestor";
import { AuditoriaSC } from "@/components/auditoria-sc";
import { SimuladorFiscal } from "@/components/simulador-fiscal";
import { SaudeSC } from "@/components/saude-sc";
import { EducacaoSC } from "@/components/educacao-sc";
import { CruzamentosSC } from "@/components/cruzamentos-sc";
import { ArvoreFinanceira } from "@/components/arvore-financeira";
import type { NoFin } from "@/lib/orcamento";
import type { FuncaoSC } from "@/lib/queries";
import { TransferenciasSCSection } from "@/components/transferencias-sc-section";
import { PanelTabs } from "@/components/panel-tabs";
import { RealSelector } from "@/components/real-selector";
import { FONTE_SICONFI, getContratosResumoSC, getCruzamentosSC, getDiagnosticoGestorSC, getEntesSC, getFinancasSC, getIndicadoresSetoriaisSC, getMetasFiscaisSC, getPcaResumoSC, getPibPerCapitaSC, getEducacaoSC, getRankingFiscalSC, getRgfResumoSC, getSaudeSC, getSeriesIndicadoresSC } from "@/lib/queries";
import { fmtBRL, fmtBRLCompact, fmtPop } from "@/lib/ui";

export const metadata = { title: "PNIGP — Santa Catarina (dados oficiais SICONFI)" };
export const dynamic = "force-dynamic";

export default async function RealEntePage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const [dados, entes, contratosResumo, pcaResumo, metasFiscais, rankingFiscal, pibPerCapita, indicadores, serieRenda, diagnostico, rgfResumo, saude, educacao, cruz] = await Promise.all([getFinancasSC(codigo), getEntesSC(), getContratosResumoSC(codigo), getPcaResumoSC(codigo), getMetasFiscaisSC(codigo), getRankingFiscalSC(), getPibPerCapitaSC(codigo), getIndicadoresSetoriaisSC(codigo), getSeriesIndicadoresSC(codigo), getDiagnosticoGestorSC(codigo), getRgfResumoSC(codigo), getSaudeSC(codigo), getEducacaoSC(codigo), getCruzamentosSC(codigo)]);
  const seriesInd = serieRenda as Record<string, { ano: number; valor: number }[]>;
  if (!dados || dados.serie.length === 0) notFound();
  const minhaPos = rankingFiscal.find((r) => r.cod_ibge === codigo) ?? null;
  const totalRank = rankingFiscal.length;

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
          {minhaPos && (
            <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700"><Target className="h-4 w-4" /> Índice Fiscal PNIGP <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-slate-500">real · finanças SICONFI</span></div>
                  <div className="mt-1 font-display text-4xl font-bold tracking-tight text-slate-900">{minhaPos.score.toFixed(1)}<span className="text-lg font-semibold text-slate-400"> /100</span></div>
                  <div className="text-xs text-slate-600"><strong className="text-teal-700">{minhaPos.posicao}º</strong> de {totalRank} entes de SC · gestão fiscal</div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
                  <div className="flex justify-between gap-3"><span>Autonomia (receita própria)</span><strong className="tabular-nums text-slate-800">{minhaPos.autonomia.toFixed(0)}%</strong></div>
                  <div className="flex justify-between gap-3"><span>Esforço de investimento</span><strong className="tabular-nums text-slate-800">{minhaPos.investimento.toFixed(0)}%</strong></div>
                  <div className="flex justify-between gap-3"><span>Equilíbrio (resultado/receita)</span><strong className="tabular-nums text-slate-800">{minhaPos.equilibrio.toFixed(1)}%</strong></div>
                  <div className="flex justify-between gap-3"><span>Peso de pessoal</span><strong className="tabular-nums text-slate-800">{minhaPos.pessoal.toFixed(0)}%</strong></div>
                </div>
              </div>
            </div>
          )}
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
    ...(indicadores.length > 0
      ? [{
          id: "indicadores",
          label: "Indicadores",
          content: (() => {
            const areas = Array.from(new Set(indicadores.map((i) => i.area)));
            const fmtVal = (v: number, un: string) => (un.includes("R$") ? fmtBRL(v) : v.toLocaleString("pt-BR")) + (un.includes("R$") ? "" : ` ${un}`);
            return (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Target className="h-4 w-4 text-teal-600" />
                    <h3 className="font-semibold text-slate-800">Indicadores setoriais</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
                  </div>
                  <p className="text-xs text-slate-500">Indicadores reais coletados (vs. média de SC). Em expansão — educação e segurança dependem de fontes adicionais.</p>
                </div>
                {areas.map((ar) => (
                  <section key={ar} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="mb-3 font-semibold text-slate-800">{indicadores.find((i) => i.area === ar)?.areaLabel}</h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {indicadores.filter((i) => i.area === ar).map((i) => {
                        const acima = i.valor >= i.media;
                        return (
                          <div key={i.codigo} className="rounded-xl border border-slate-200 p-4">
                            <div className="text-xs text-slate-500">{i.nome}</div>
                            <div className="mt-1 font-display text-xl font-bold tabular-nums text-slate-900">{fmtVal(i.valor, i.unidade)}</div>
                            <div className="mt-0.5 text-[11px] text-slate-500">Média SC: <span className="tabular-nums">{fmtVal(Math.round(i.media * 10) / 10, i.unidade)}</span> · <span className={acima ? "text-emerald-600" : "text-amber-600"}>{acima ? "▲ acima" : "▼ abaixo"}</span></div>
                            <div className="mt-0.5 text-[10px] text-slate-400">Fonte: {i.fonte}</div>
                          </div>
                        );
                      })}
                    </div>
                    {indicadores.filter((i) => i.area === ar && (seriesInd[i.codigo]?.length ?? 0) > 1).map((i) => (
                      <div key={`s-${i.codigo}`} className="mt-4 border-t border-slate-100 pt-4">
                        <h4 className="text-sm font-semibold text-slate-700">{i.nome} — série histórica</h4>
                        {i.codigo === "transferencia_renda_por_mil_hab" && <p className="mb-1 text-[11px] text-slate-500">Bolsa Família → Auxílio Brasil → Novo Bolsa Família</p>}
                        <LinhasFinanceiras data={seriesInd[i.codigo] as unknown as Record<string, number>[]} linhas={[{ key: "valor", label: i.unidade || "valor", cor: "#0f766e" }]} moeda={i.unidade.includes("R$")} />
                      </div>
                    ))}
                  </section>
                ))}
              </>
            );
          })(),
        }]
      : []),
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
    ...(contratosResumo
      ? [{
          id: "contratos",
          label: "Contratos",
          content: (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <FileText className="h-4 w-4 text-teal-600" />
                  <h3 className="font-semibold text-slate-800">Contratos assinados · PNCP</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
                </div>
                <p className="mb-3 text-xs text-slate-500">Contratos efetivamente assinados (com fornecedor e vigência), vinculados aos processos licitatórios — fonte PNCP.</p>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Contratos assinados</div>
                    <div className="font-display text-xl font-bold tabular-nums text-slate-900">{contratosResumo.n.toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Valor global contratado</div>
                    <div className="font-display text-xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(contratosResumo.valor_total)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Fornecedores</div>
                    <div className="font-display text-xl font-bold tabular-nums text-slate-900">{contratosResumo.por_fornecedor.length}+</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Valor médio</div>
                    <div className="font-display text-xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(contratosResumo.n ? contratosResumo.valor_total / contratosResumo.n : 0)}</div>
                  </div>
                </div>
              </div>

              {contratosResumo.por_fornecedor.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="font-semibold text-slate-800">Maiores fornecedores</h3>
                  <p className="mb-2 text-xs text-slate-500">Valor global contratado por fornecedor</p>
                  <Donut data={contratosResumo.por_fornecedor.map((f) => ({ label: f.nome, valor: f.valor }))} />
                </section>
              )}

              {contratosResumo.top.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-3 font-semibold text-slate-800">Maiores contratos</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                          <th className="p-2 font-medium">Objeto</th>
                          <th className="hidden p-2 font-medium md:table-cell">Fornecedor</th>
                          <th className="p-2 text-right font-medium">Valor global</th>
                          <th className="hidden p-2 font-medium lg:table-cell">Vigência</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contratosResumo.top.map((t, i) => (
                          <tr key={i} className="border-b border-slate-100 align-top">
                            <td className="p-2 text-slate-700"><span className="line-clamp-2">{t.objeto}</span></td>
                            <td className="hidden p-2 text-slate-500 md:table-cell"><span className="line-clamp-1">{t.fornecedor}</span></td>
                            <td className="p-2 text-right font-semibold tabular-nums text-slate-800">{fmtBRLCompact(t.valor)}</td>
                            <td className="hidden p-2 text-slate-500 lg:table-cell">{t.vigInicio || "—"}{t.vigFim ? ` → ${t.vigFim}` : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Fonte: PNCP (/contratos). Cada contrato está vinculado ao seu processo licitatório (ver aba Compras).</p>
                </section>
              )}
            </>
          ),
        }]
      : []),
    ...(pcaResumo
      ? [{
          id: "planejamento",
          label: "Planejamento",
          content: (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-teal-600" />
                  <h3 className="font-semibold text-slate-800">Planejamento de compras · PCA</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
                </div>
                <p className="mb-3 text-xs text-slate-500">Plano Anual de Contratações (o que o ente <strong>planejou comprar</strong>) — fonte PNCP. Cruzamento inédito: <strong>planejado × contratado</strong>.</p>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Itens planejados</div>
                    <div className="font-display text-xl font-bold tabular-nums text-slate-900">{pcaResumo.n_itens.toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Valor planejado (PCA)</div>
                    <div className="font-display text-xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(pcaResumo.valor_total)}</div>
                  </div>
                  {contratosResumo && (
                    <div className="rounded-xl border border-slate-200 p-3">
                      <div className="text-xs text-slate-500">Contratado (PNCP)</div>
                      <div className="font-display text-xl font-bold tabular-nums text-slate-900">{fmtBRLCompact(contratosResumo.valor_total)}</div>
                    </div>
                  )}
                  {contratosResumo && pcaResumo.valor_total > 0 && (
                    <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
                      <div className="text-xs text-slate-500">Contratado ÷ planejado</div>
                      <div className="font-display text-xl font-bold tabular-nums text-teal-700">{((contratosResumo.valor_total / pcaResumo.valor_total) * 100).toFixed(0)}%</div>
                    </div>
                  )}
                </div>
              </div>

              {pcaResumo.por_categoria.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="font-semibold text-slate-800">O que foi planejado, por categoria</h3>
                  <p className="mb-2 text-xs text-slate-500">Valor planejado por categoria do PCA</p>
                  <Donut data={pcaResumo.por_categoria.map((c) => ({ label: c.nome, valor: c.valor }))} />
                </section>
              )}

              {pcaResumo.top.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-3 font-semibold text-slate-800">Maiores itens planejados</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                          <th className="p-2 font-medium">Item planejado</th>
                          <th className="hidden p-2 font-medium md:table-cell">Categoria</th>
                          <th className="p-2 text-right font-medium">Valor estimado</th>
                          <th className="hidden p-2 text-center font-medium sm:table-cell">Ano PCA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pcaResumo.top.map((t, i) => (
                          <tr key={i} className="border-b border-slate-100 align-top">
                            <td className="p-2 text-slate-700"><span className="line-clamp-2">{t.descricao}</span></td>
                            <td className="hidden p-2 text-slate-500 md:table-cell"><span className="line-clamp-1">{t.categoria}</span></td>
                            <td className="p-2 text-right font-semibold tabular-nums text-slate-800">{fmtBRLCompact(t.valor)}</td>
                            <td className="hidden p-2 text-center tabular-nums text-slate-500 sm:table-cell">{t.anoPca || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Fonte: PNCP (/pca). O cruzamento planejado × contratado pode abranger anos/escopos distintos; use como indicativo de execução do plano.</p>
                </section>
              )}
            </>
          ),
        }]
      : []),
    ...(metasFiscais
      ? [{
          id: "metas",
          label: "Metas fiscais",
          content: (() => {
            const mf = metasFiscais.latest;
            const cumpriuPrim = mf.resultado_primario != null && mf.meta_primario != null ? mf.resultado_primario >= mf.meta_primario : null;
            const dclSerie = metasFiscais.serie.filter((s) => s.dcl_fim != null).map((s) => ({ ano: s.ano, dcl: Number(s.dcl_fim) }));
            return (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Target className="h-4 w-4 text-teal-600" />
                    <h3 className="font-semibold text-slate-800">Metas fiscais · LDO {mf.ano}</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
                  </div>
                  <p className="mb-3 text-xs text-slate-500">Meta fixada no <strong>Anexo de Metas Fiscais da LDO</strong> × resultado realizado — fonte SICONFI (RREO Anexo 06).</p>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className={`rounded-xl border p-4 ${cumpriuPrim == null ? "border-slate-200" : cumpriuPrim ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                      <div className="text-xs font-medium text-slate-500">Resultado Primário {mf.ano}</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-display text-2xl font-bold tabular-nums text-slate-900">{mf.resultado_primario != null ? fmtBRLCompact(mf.resultado_primario) : "—"}</span>
                        <span className="text-xs text-slate-500">realizado</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">Meta LDO: <strong>{mf.meta_primario != null ? fmtBRLCompact(mf.meta_primario) : "—"}</strong></div>
                      {cumpriuPrim != null && <div className={`mt-1 text-xs font-semibold ${cumpriuPrim ? "text-emerald-700" : "text-amber-700"}`}>{cumpriuPrim ? "✓ Meta atingida" : "Abaixo da meta"}</div>}
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="text-xs font-medium text-slate-500">Resultado Nominal {mf.ano}</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-display text-2xl font-bold tabular-nums text-slate-900">{mf.resultado_nominal != null ? fmtBRLCompact(mf.resultado_nominal) : "—"}</span>
                        <span className="text-xs text-slate-500">realizado</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">Meta LDO: <strong>{mf.meta_nominal != null ? fmtBRLCompact(mf.meta_nominal) : "—"}</strong></div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Receita primária prevista</div><div className="font-display text-lg font-bold tabular-nums text-slate-900">{mf.receita_prim_prev != null ? fmtBRLCompact(mf.receita_prim_prev) : "—"}</div></div>
                    <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Receita primária realizada</div><div className="font-display text-lg font-bold tabular-nums text-slate-900">{mf.receita_prim_real != null ? fmtBRLCompact(mf.receita_prim_real) : "—"}</div></div>
                    <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Despesa primária (dotação)</div><div className="font-display text-lg font-bold tabular-nums text-slate-900">{mf.despesa_prim_dot != null ? fmtBRLCompact(mf.despesa_prim_dot) : "—"}</div></div>
                    <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">Despesa primária (empenhada)</div><div className="font-display text-lg font-bold tabular-nums text-slate-900">{mf.despesa_prim_emp != null ? fmtBRLCompact(mf.despesa_prim_emp) : "—"}</div></div>
                  </div>
                </div>

                {dclSerie.length > 1 && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="font-semibold text-slate-800">Dívida Consolidada Líquida (evolução)</h3>
                    <p className="mb-2 text-xs text-slate-500">Saldo da DCL por exercício · SICONFI</p>
                    <LinhasFinanceiras data={dclSerie as unknown as Record<string, number>[]} linhas={[{ key: "dcl", label: "Dívida Consolidada Líquida", cor: "#e11d48" }]} />
                  </section>
                )}
                <p className="px-1 text-[11px] text-slate-400">Fonte: SICONFI — RREO Anexo 06 (Demonstrativo do Resultado Primário e Nominal). Meta = Anexo de Metas Fiscais da LDO. No resultado primário, realizado ≥ meta indica cumprimento.</p>
              </>
            );
          })(),
        }]
      : []),
    { id: "transferencias", label: "Transferências", content: <TransferenciasSCSection codigo={ente.cod_ibge} /> },
    ...(rankingFiscal.length > 1
      ? [{
          id: "ranking",
          label: "Ranking",
          content: (() => {
            const top = rankingFiscal.slice(0, 15);
            const fora = minhaPos && minhaPos.posicao > 15 ? minhaPos : null;
            const Row = (r: typeof rankingFiscal[number], destaque: boolean) => (
              <tr key={r.cod_ibge} className={`border-b border-slate-100 ${destaque ? "bg-teal-50 font-medium" : ""}`}>
                <td className="p-2 tabular-nums text-slate-500">{r.posicao}º</td>
                <td className="p-2 text-slate-700">{r.tipo === "E" ? `★ ${r.nome}` : r.nome}</td>
                <td className="p-2 text-right font-semibold tabular-nums text-teal-700">{r.score.toFixed(1)}</td>
                <td className="hidden p-2 text-right tabular-nums text-slate-500 sm:table-cell">{r.autonomia.toFixed(0)}%</td>
                <td className="hidden p-2 text-right tabular-nums text-slate-500 md:table-cell">{r.investimento.toFixed(0)}%</td>
                <td className="hidden p-2 text-right tabular-nums text-slate-500 md:table-cell">{r.equilibrio.toFixed(1)}%</td>
                <td className="hidden p-2 text-right tabular-nums text-slate-500 lg:table-cell">{r.pessoal.toFixed(0)}%</td>
              </tr>
            );
            return (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Target className="h-4 w-4 text-teal-600" />
                    <h3 className="font-semibold text-slate-800">Ranking fiscal · entes de Santa Catarina</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Database className="h-3 w-3" /> Dados oficiais</span>
                  </div>
                  <p className="text-xs text-slate-500">Índice Fiscal PNIGP (real) — média de percentis de autonomia, investimento, equilíbrio e peso de pessoal entre os {totalRank} entes.</p>
                  {minhaPos && <p className="mt-2 text-sm text-slate-700"><strong className="text-teal-700">{ente.nome}</strong>: índice <strong>{minhaPos.score.toFixed(1)}</strong> — <strong>{minhaPos.posicao}º</strong> de {totalRank}.</p>}
                </div>
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-3 font-semibold text-slate-800">Top 15 + sua posição</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                          <th className="p-2 font-medium">#</th>
                          <th className="p-2 font-medium">Ente</th>
                          <th className="p-2 text-right font-medium">Índice</th>
                          <th className="hidden p-2 text-right font-medium sm:table-cell">Autonomia</th>
                          <th className="hidden p-2 text-right font-medium md:table-cell">Investim.</th>
                          <th className="hidden p-2 text-right font-medium md:table-cell">Equilíbrio</th>
                          <th className="hidden p-2 text-right font-medium lg:table-cell">Pessoal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top.map((r) => Row(r, r.cod_ibge === codigo))}
                        {fora && (<><tr><td colSpan={7} className="p-1 text-center text-xs text-slate-400">⋯</td></tr>{Row(fora, true)}</>)}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Índice fiscal real (SICONFI). Os índices completos PNIGP (ICEB/INVP/IGP 360) dependem de indicadores setoriais (saúde/educação/segurança/social/economia) ainda a coletar.</p>
                </section>
              </>
            );
          })(),
        }]
      : []),
  ];

  if (diagnostico) tabs.splice(1, 0, { id: "diagnostico", label: "Diagnóstico", content: <DiagnosticoGestor data={diagnostico} /> });

  const toNoFin = (f: FuncaoSC): NoFin => ({ nome: f.nome, previsto: f.dotacao, realizado: f.empenhado, pct: f.dotacao > 0 ? (f.empenhado / f.dotacao) * 100 : 0, filhos: f.filhos && f.filhos.length ? f.filhos.map(toNoFin).sort((a, b) => b.previsto - a.previsto) : undefined });
  const arvoreFunc: NoFin[] = funcoesLatest.map(toNoFin).sort((x, y) => y.previsto - x.previsto);
  if (arvoreFunc.length) tabs.push({
    id: "execucao", label: "Execução", content: (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-slate-800">Despesa por função — execução</h2>
        <p className="mb-3 text-sm text-slate-500">Dotação atualizada × empenhado, por função de governo (clique nas colunas para ler; % de execução na barra).</p>
        <ArvoreFinanceira raizes={arvoreFunc} colNome="Função" colV1="Dotação" colV2="Empenhado" />
      </div>
    ),
  });
  if (diagnostico) tabs.push({ id: "auditoria", label: "Auditoria", content: <AuditoriaSC data={diagnostico} /> });
  if (rgfResumo) tabs.push({ id: "simulador", label: "Simulador", content: <SimuladorFiscal ano={rgfResumo.ano} receita={a.receita} despesa={a.despesa} pessoal={a.pessoal} investimento={a.investimento} rclAjustada={rgfResumo.rclAjustada} pessoalPctBase={rgfResumo.pessoalPct} /> });
  if (saude) tabs.push({ id: "saude", label: "Saúde", content: <SaudeSC data={saude} /> });
  if (educacao) tabs.push({ id: "educacao-cruz", label: "Educação", content: <EducacaoSC data={educacao} /> });
  if (cruz) tabs.push({ id: "cruzamentos", label: "Cruzamentos", content: <CruzamentosSC data={cruz} /> });

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
                {pibPerCapita ? ` · PIB per capita ${fmtBRL(pibPerCapita)}` : ""}
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
