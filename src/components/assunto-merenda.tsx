"use client";

import { useState } from "react";
import { Utensils, HandCoins, Sprout, ShoppingCart, Landmark, Users, LayoutGrid, Star } from "lucide-react";
import type { MerendaSC } from "@/lib/queries";
import type { MerendaCurado } from "@/lib/merenda-floripa";
import { fmtBRL, fmtNumber } from "@/lib/ui";

const DIAS_LETIVOS = 200;
const PESOS_PNAE = [
  { grupo: "Creche/integral", peso: 1.57 },
  { grupo: "Pré-escola", peso: 0.82 },
  { grupo: "Fund./Médio/EJA", peso: 0.57 },
];

type Sec = "panorama" | "contrato" | "camadas" | "portfolio" | "contabilidade" | "escolas" | "licitacoes";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-5 ${className}`}>{children}</div>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{children}</h3>;
}
function Kpi({ v, l }: { v: string; l: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">{v}</div>
      <div className="mt-0.5 text-xs text-slate-500">{l}</div>
    </div>
  );
}
function Nota({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-slate-200 border-l-[3px] border-l-teal-600 bg-teal-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">{children}</div>;
}
const mi = (v: number) => `R$ ${fmtNumber(v / 1e6, 2)} mi`;

export default function AssuntoMerenda({ dados, curado, nome }: { dados: NonNullable<MerendaSC>; curado: MerendaCurado | null; nome: string }) {
  const secoes: { id: Sec; label: string; icon: typeof Utensils }[] = [
    { id: "panorama", label: "Panorama", icon: Utensils },
    ...(curado?.contrato ? [{ id: "contrato" as Sec, label: "Contrato", icon: HandCoins }] : []),
    ...(curado?.camadas ? [{ id: "camadas" as Sec, label: "Camadas", icon: LayoutGrid }] : []),
    ...(curado?.portfolio ? [{ id: "portfolio" as Sec, label: "Portfólio", icon: ShoppingCart }] : []),
    ...(curado?.cadeia ? [{ id: "contabilidade" as Sec, label: "Contabilidade", icon: Landmark }] : []),
    ...(curado?.processo || curado?.processos ? [{ id: "licitacoes" as Sec, label: "Licitações & setor", icon: ShoppingCart }] : []),
    ...(curado?.escolas ? [{ id: "escolas" as Sec, label: "Escolas & equipe", icon: Users }] : []),
  ];
  const [sec, setSec] = useState<Sec>("panorama");

  const anosFull = dados.pnaeSerie.filter((s) => dados.pnaeAno == null || s.ano <= dados.pnaeAno);
  const ultimos = anosFull.slice(-2);
  const pnaeAno = dados.pnaeAno;
  const pnaeUlt = anosFull.length ? anosFull[anosFull.length - 1].valor : 0;
  const mat = dados.rede?.matriculas ?? 0;
  const custoDia = (v: number) => (mat > 0 ? v / mat / DIAS_LETIVOS : 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {secoes.map((s) => {
          const Ic = s.icon;
          const on = sec === s.id;
          return (
            <button key={s.id} onClick={() => setSec(s.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
              <Ic className="h-3.5 w-3.5" /> {s.label}
            </button>
          );
        })}
      </div>

      {/* ---------------- PANORAMA (núcleo, todo município) ---------------- */}
      {sec === "panorama" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {dados.rede && <Kpi v={fmtNumber(dados.rede.escolas, 0)} l="escolas municipais" />}
            {dados.rede && <Kpi v={fmtNumber(dados.rede.matriculas, 0)} l={`alunos da rede municipal (${dados.rede.ano})`} />}
            {dados.rede && <Kpi v={`${dados.rede.escolas ? Math.round((dados.rede.comRefeitorio / dados.rede.escolas) * 100) : 0}%`} l="escolas com refeitório" />}
            {pnaeAno != null && <Kpi v={mi(pnaeUlt)} l={`PNAE federal recebido (${pnaeAno})`} />}
          </div>

          {/* destaque editorial (ex.: agricultura familiar) */}
          {curado?.destaque && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-5">
              <div className="mb-1 flex items-center gap-2 text-sm font-bold text-teal-800"><Star className="h-4 w-4" /> {curado.destaque.titulo}</div>
              <p className="text-sm leading-relaxed text-slate-700">{curado.destaque.texto}</p>
            </div>
          )}

          {/* tri-ente completo (3 fontes) OU execução bipartite (União × Município) OU só núcleo */}
          {curado?.triente ? (
            <Card>
              <H2>De onde vem o recurso — por ano (empenhado)</H2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-1.5">Ano</th>
                      <th className="px-2 py-1.5 text-right">PNAE (fed.)</th>
                      <th className="px-2 py-1.5 text-right">Salário-Educ. (fed.)</th>
                      <th className="px-2 py-1.5 text-right">Impostos próprios</th>
                      <th className="px-2 py-1.5 text-right">Total</th>
                      <th className="px-2 py-1.5 text-right">% próprio</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {curado.triente.map((t) => (
                      <tr key={t.ano} className="border-b border-slate-100">
                        <td className="px-2 py-1.5 font-semibold">{t.ano}</td>
                        <td className="px-2 py-1.5 text-right">{mi(t.pnae)}</td>
                        <td className="px-2 py-1.5 text-right">{mi(t.salarioEducacao)}</td>
                        <td className="px-2 py-1.5 text-right">{mi(t.proprio)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{mi(t.total)}</td>
                        <td className="px-2 py-1.5 text-right">{t.pctProprio}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <Nota>
                  <b>Só {Math.round((curado.triente.reduce((a, t) => a + t.pnae, 0) / curado.triente.reduce((a, t) => a + t.total, 0)) * 100)}% da merenda vem de recurso federal carimbado (PNAE)</b> — o único que a lei destina à alimentação escolar (Lei 11.947/2009). Os impostos próprios saem do bolso do município e <b>não contam no piso de 25% do MDE</b> (art. 71, V da LDB). O município banca a maior parte.
                </Nota>
              </div>
            </Card>
          ) : curado?.execucao ? (
            <Card>
              <H2>Quanto custa e quem paga — subfunção Alimentação</H2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-1.5">Ano</th>
                      <th className="px-2 py-1.5 text-right">Empenhado</th>
                      <th className="px-2 py-1.5 text-right">Pago</th>
                      <th className="px-2 py-1.5 text-right">União (PNAE)</th>
                      <th className="px-2 py-1.5 text-right">Município (resto)</th>
                      <th className="px-2 py-1.5 text-right">% próprio</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {curado.execucao.map((x) => (
                      <tr key={x.ano} className="border-b border-slate-100">
                        <td className="px-2 py-1.5 font-semibold">{x.ano}</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{mi(x.total)}</td>
                        <td className="px-2 py-1.5 text-right">{mi(x.pago)}</td>
                        <td className="px-2 py-1.5 text-right">{mi(x.pnae)}</td>
                        <td className="px-2 py-1.5 text-right">{mi(x.residual)}</td>
                        <td className="px-2 py-1.5 text-right">{x.pctProprio}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {curado.execucao[0]?.nota && <p className="mt-2 text-xs text-slate-500">{curado.execucao[0].nota}</p>}
              <div className="mt-2"><Nota>A União cobre <b>{curado.execucao[0] ? 100 - curado.execucao[0].pctProprio : 0}%</b> via PNAE; o resto sai do caixa do município. Fonte: {curado.fonte}.</Nota></div>
            </Card>
          ) : (
            <Card>
              <H2>Quem paga — o que a base nacional revela</H2>
              <p className="text-sm text-slate-600">
                A base nacional mostra com precisão o <b>lado federal</b>: a União transferiu <b>{mi(pnaeUlt)}</b> de PNAE em {pnaeAno} a {nome}. O <b>gasto municipal residual</b> roda no sistema interno da prefeitura e <b>não está nas bases nacionais</b> — aparece só nos municípios com garimpo local.
              </p>
            </Card>
          )}

          {/* folha própria das merendeiras (município não-terceirizado) */}
          {curado?.folhaPropria && (
            <Card>
              <H2><Users className="mr-1 inline h-4 w-4 text-teal-600" />Merendeiras — quadro próprio (folha) · {curado.folhaPropria.competencia}</H2>
              <p className="mb-3 text-lg font-semibold text-slate-800">
                <b>{fmtNumber(curado.folhaPropria.servidores, 0)}</b> servidores · <b>{fmtBRL(curado.folhaPropria.brutoMes)}</b>/mês de folha bruta — a mão de obra que <b>não aparece na subfunção Alimentação</b>.
              </p>

              {/* QUEM PAGA — por fonte (provado pela lotação) */}
              {curado.folhaPropria.fontes && (() => {
                const fontes = curado.folhaPropria!.fontes!;
                const bruto = curado.folhaPropria!.brutoMes;
                const fundeb = fontes.filter((f) => /fundeb/i.test(f.fonte)).reduce((a, f) => a + f.bruto, 0);
                const pctFundeb = bruto > 0 ? Math.round((fundeb / bruto) * 100) : 0;
                return (
                  <>
                    <div className="mb-3 rounded-lg border border-slate-200 border-l-[3px] border-l-teal-600 bg-teal-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
                      <b>{pctFundeb}% da folha das merendeiras é custeada pelo FUNDEB</b> — legal: são profissionais de apoio da educação básica, despesa elegível ao fundo (Lei 14.113/2020). A fonte é <b>provada pela lotação</b> no Farol TCE-SC, não inferida.
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
                            <th className="px-2 py-1.5">Fonte de recurso (pela lotação)</th>
                            <th className="px-2 py-1.5 text-right">Servidores</th>
                            <th className="px-2 py-1.5 text-right">Folha/mês</th>
                            <th className="px-2 py-1.5 text-right">% da folha</th>
                          </tr>
                        </thead>
                        <tbody className="tabular-nums">
                          {fontes.map((f) => (
                            <tr key={f.fonte} className={`border-b border-slate-100 ${/fundeb/i.test(f.fonte) ? "bg-teal-50/40" : ""}`}>
                              <td className="px-2 py-1.5">{f.fonte}{f.carimbada
                                ? <span className="ml-1.5 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">fonte declarada</span>
                                : <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">sem lotação</span>}</td>
                              <td className="px-2 py-1.5 text-right">{fmtNumber(f.servidores, 0)}</td>
                              <td className="px-2 py-1.5 text-right font-semibold">{fmtBRL(f.bruto)}</td>
                              <td className="px-2 py-1.5 text-right">{bruto > 0 ? Math.round((f.bruto / bruto) * 100) : 0}%</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-slate-200 font-bold">
                            <td className="px-2 py-1.5">Total (quadro escolar)</td>
                            <td className="px-2 py-1.5 text-right">{fmtNumber(curado.folhaPropria!.servidores, 0)}</td>
                            <td className="px-2 py-1.5 text-right">{fmtBRL(bruto)}</td>
                            <td className="px-2 py-1.5 text-right">100%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {curado.folhaPropria!.vinculoNota && <p className="mt-2 text-xs text-slate-500">{curado.folhaPropria!.vinculoNota}</p>}
                  </>
                );
              })()}

              {/* vínculo por cargo — só quando o garimpo rendeu números consistentes */}
              {curado.folhaPropria.cargos && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-1.5">Cargo</th>
                        <th className="px-2 py-1.5 text-right">Servidores</th>
                        <th className="px-2 py-1.5 text-right">Bruto/mês</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {curado.folhaPropria.cargos.map((c) => (
                        <tr key={c.cargo} className="border-b border-slate-100">
                          <td className="px-2 py-1.5">{c.cargo}</td>
                          <td className="px-2 py-1.5 text-right">{fmtNumber(c.n, 0)}</td>
                          <td className="px-2 py-1.5 text-right font-semibold">{fmtBRL(c.bruto)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200 font-bold">
                        <td className="px-2 py-1.5">Total</td>
                        <td className="px-2 py-1.5 text-right">{fmtNumber(curado.folhaPropria.servidores, 0)}</td>
                        <td className="px-2 py-1.5 text-right">{fmtBRL(curado.folhaPropria.brutoMes)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              {curado.execucao?.[0] && (
                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl border border-slate-200 p-3"><div className="text-lg font-bold tabular-nums text-slate-900">{mi(curado.execucao[0].total)}</div><div className="text-xs text-slate-500">gêneros (empenhado/ano)</div></div>
                  <div className="rounded-xl border border-slate-200 p-3"><div className="text-lg font-bold tabular-nums text-slate-900">{mi(curado.folhaPropria.brutoMes * 13.33)}</div><div className="text-xs text-slate-500">folha própria (bruto/ano)</div></div>
                  <div className="rounded-xl border border-t-4 border-teal-600 border-slate-200 p-3"><div className="text-lg font-bold tabular-nums text-slate-900">≈ {mi(curado.execucao[0].total + curado.folhaPropria.brutoMes * 13.33)}</div><div className="text-xs text-slate-500">custo total/ano</div></div>
                </div>
              )}
              {curado.folhaPropria.nota && <p className="mt-2 text-xs text-slate-500">{curado.folhaPropria.nota}</p>}
            </Card>
          )}

          {/* custo por aluno — federal (núcleo) */}
          {dados.rede && ultimos.length > 0 && (
            <Card>
              <H2>Quanto a União cobre por aluno</H2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-1.5">Ano</th>
                      <th className="px-2 py-1.5 text-right">PNAE recebido</th>
                      <th className="px-2 py-1.5 text-right">/ aluno / ano</th>
                      <th className="px-2 py-1.5 text-right">/ aluno / dia (200d)</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {ultimos.map((s) => (
                      <tr key={s.ano} className="border-b border-slate-100">
                        <td className="px-2 py-1.5 font-semibold">{s.ano}</td>
                        <td className="px-2 py-1.5 text-right">{mi(s.valor)}</td>
                        <td className="px-2 py-1.5 text-right">{fmtBRL(mat > 0 ? s.valor / mat : 0)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{fmtBRL(custoDia(s.valor))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">Base: {fmtNumber(mat, 0)} alunos da rede municipal (Censo INEP {dados.rede.ano}) ÷ {DIAS_LETIVOS} dias. Peso do PNAE por grupo: {PESOS_PNAE.map((p) => `${p.grupo} R$ ${fmtNumber(p.peso, 2)}`).join(" · ")}.</p>
            </Card>
          )}

          {dados.pnaePorEtapa.length > 0 && (
            <Card>
              <H2>Repasse do PNAE por etapa — {pnaeAno}</H2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1.5">Etapa</th><th className="px-2 py-1.5 text-right">Recebido</th></tr></thead>
                  <tbody className="tabular-nums">
                    {dados.pnaePorEtapa.map((e) => (
                      <tr key={e.etapa} className="border-b border-slate-100"><td className="px-2 py-1.5">{e.etapa}</td><td className="px-2 py-1.5 text-right font-semibold">{mi(e.valor)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {dados.agri && (
            <Card>
              <H2><Sprout className="mr-1 inline h-4 w-4 text-teal-600" />Agricultura familiar no PNAE (Lei 11.947/2009, mín. 30%)</H2>
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <div className={`text-3xl font-bold tabular-nums ${dados.agri.cumpre ? "text-teal-700" : "text-amber-600"}`}>{fmtNumber(dados.agri.percentual, 1)}%</div>
                  <div className="text-xs text-slate-500">do PNAE comprado da agricultura familiar ({dados.agri.ano}) · {dados.agri.cumpre ? "cumpre os 30%" : "abaixo dos 30%"}</div>
                </div>
                <div className="text-sm text-slate-600">
                  <div>Transferido: <b>{fmtBRL(dados.agri.valorTransferido)}</b></div>
                  <div>Da agricultura familiar: <b>{fmtBRL(dados.agri.valorAgri)}</b></div>
                </div>
              </div>
            </Card>
          )}

          {dados.compras.length > 0 && (
            <Card>
              <H2><ShoppingCart className="mr-1 inline h-4 w-4 text-teal-600" />Compras de merenda identificadas no PNCP</H2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1.5">Ano</th><th className="px-2 py-1.5 text-right">Processos</th><th className="px-2 py-1.5 text-right">Valor homologado</th></tr></thead>
                  <tbody className="tabular-nums">
                    {dados.compras.map((c) => (
                      <tr key={c.ano} className="border-b border-slate-100"><td className="px-2 py-1.5 font-semibold">{c.ano}</td><td className="px-2 py-1.5 text-right">{c.n}</td><td className="px-2 py-1.5 text-right font-semibold">{fmtBRL(c.valor)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500"><b>Valor parcial, não o gasto total.</b> Só compras da esfera municipal, excluídas as atas de Registro de Preço (o valor homologado da SRP é teto, não gasto).</p>
            </Card>
          )}
        </div>
      )}

      {/* ---------------- CONTRATO ---------------- */}
      {sec === "contrato" && curado?.contrato && (
        <div className="space-y-4">
          <Card>
            <H2>De cada R$ 1,00 do contrato terceirizado</H2>
            <p className="mb-3 text-lg font-semibold text-slate-800">Só <b>{curado.contrato.salarioPct} centavos</b> viram salário. O resto é encargo, benefício, estrutura, imposto e lucro.</p>
            <div className="flex h-11 overflow-hidden rounded-lg border border-slate-200">
              <div className="flex items-center justify-center bg-teal-600 text-xs font-bold text-white" style={{ width: `${curado.contrato.salarioPct}%` }}>{curado.contrato.salarioPct}%</div>
              <div className="flex items-center justify-center bg-amber-500 text-xs font-bold text-white" style={{ width: `${curado.contrato.encargosPct}%` }}>{curado.contrato.encargosPct}%</div>
              <div className="flex items-center justify-center bg-slate-400 text-xs font-bold text-white" style={{ width: `${curado.contrato.restoPct}%` }}>{curado.contrato.restoPct}%</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-teal-600" />Salário</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-amber-500" />Encargos + benefícios</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-slate-400" />Estrutura + deslocamento + BDI + tributos + lucro</span>
            </div>
          </Card>
          <Card>
            <H2>Custo por posto (mensal) — {curado.contrato.fornecedor}</H2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1.5">Posto</th><th className="px-2 py-1.5 text-right">Qtd</th><th className="px-2 py-1.5 text-right">Salário</th><th className="px-2 py-1.5 text-right">Custo total/posto</th><th className="px-2 py-1.5 text-right">Fator</th></tr></thead>
                <tbody className="tabular-nums">
                  {curado.contrato.postosDetalhe.map((p) => (
                    <tr key={p.nome} className="border-b border-slate-100"><td className="px-2 py-1.5">{p.nome}</td><td className="px-2 py-1.5 text-right">{p.qtd}</td><td className="px-2 py-1.5 text-right">{fmtBRL(p.salario)}</td><td className="px-2 py-1.5 text-right font-semibold">{fmtBRL(p.custo)}</td><td className="px-2 py-1.5 text-right">{fmtNumber(p.fator, 2)}×</td></tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 font-bold"><td className="px-2 py-1.5">Total mensal</td><td className="px-2 py-1.5 text-right">{curado.contrato.postos}</td><td className="px-2 py-1.5 text-right" colSpan={3}>{fmtBRL(curado.contrato.mensal)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">Deslocamento das nutricionistas: <b>{fmtBRL(curado.contrato.deslocamento)}/mês</b>. Fonte: Planilha de Custos {curado.contrato.licitacao}.</p>
          </Card>
        </div>
      )}

      {/* ---------------- CAMADAS ---------------- */}
      {sec === "camadas" && curado?.camadas && curado.transacao && (
        <div className="space-y-4">
          <Card>
            <H2>As três camadas de custo</H2>
            <div className="grid gap-3 md:grid-cols-3">
              {curado.camadas.map((c) => {
                const cor = c.cor === "teal" ? "border-t-teal-600" : c.cor === "blue" ? "border-t-blue-600" : "border-t-amber-500";
                return (
                  <div key={c.titulo} className={`rounded-xl border border-t-4 border-slate-200 p-4 ${cor}`}>
                    <div className="text-sm font-bold text-slate-800">{c.titulo}</div>
                    <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{fmtBRL(c.valor)}<span className="text-xs font-normal text-slate-500">{c.unidade}</span></div>
                    <div className="mt-1 text-xs text-slate-500">{c.desc}</div>
                    <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-teal-700">{c.regra}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3"><Nota>⚖️ A equipe de Licitações roda toda a compra do município. Pelo método Banco Mundial/TCU entra o <b>custo de transação por processo</b> (~{fmtBRL(curado.transacao.custo)}), não o salário cheio.</Nota></div>
          </Card>
          <Card>
            <H2>Custo de transação do processo — método Banco Mundial/TCU</H2>
            <p className="mb-3 text-sm text-slate-600">~<b>{curado.transacao.horas}h</b> de equipe pública. Custo estimado: <b>{fmtBRL(curado.transacao.custo)}</b> (salário + encargos).</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1.5">Servidor</th><th className="px-2 py-1.5">Atividade</th><th className="px-2 py-1.5 text-right">Horas</th><th className="px-2 py-1.5 text-right">R$/h</th><th className="px-2 py-1.5 text-right">Custo</th></tr></thead>
                <tbody className="tabular-nums">
                  {curado.transacao.detalhe.map((h) => (
                    <tr key={h.servidor} className="border-b border-slate-100"><td className="px-2 py-1.5">{h.servidor}</td><td className="px-2 py-1.5 text-slate-500">{h.atividade}</td><td className="px-2 py-1.5 text-right">{fmtNumber(h.horas, 1)}h</td><td className="px-2 py-1.5 text-right">{fmtBRL(h.valorHora)}</td><td className="px-2 py-1.5 text-right font-semibold">{fmtBRL(h.custo)}</td></tr>
                  ))}
                  <tr className="border-t border-slate-200 text-slate-500"><td className="px-2 py-1.5" colSpan={4}>+ Encargos patronais (~40%)</td><td className="px-2 py-1.5 text-right">{fmtBRL(curado.transacao.encargos)}</td></tr>
                  <tr className="border-t-2 border-slate-200 font-bold"><td className="px-2 py-1.5" colSpan={4}>Custo de transação</td><td className="px-2 py-1.5 text-right">{fmtBRL(curado.transacao.custo)}</td></tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------- PORTFÓLIO ---------------- */}
      {sec === "portfolio" && curado?.portfolio && (
        <div className="space-y-4">
          <Card>
            <H2>Portfólio — empenhado por categoria ({curado.janela})</H2>
            {(() => {
              const max = Math.max(...curado.portfolio!.map((p) => p.valor));
              return (
                <div className="space-y-2">
                  {curado.portfolio!.map((p) => (
                    <div key={p.categoria} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-sm">
                      <div className="font-semibold text-slate-700">{p.categoria}<small className="block text-[11px] font-normal text-slate-400">{p.processos} proc</small></div>
                      <div className="h-5 overflow-hidden rounded bg-teal-50"><div className="h-full rounded bg-teal-500" style={{ width: `${(p.valor / max) * 100}%` }} /></div>
                      <div className="text-right font-semibold tabular-nums text-slate-800">{mi(p.valor)}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>
          {curado.generosPorAno && (
            <Card>
              <H2>Gêneros — empenhado por ano (competência)</H2>
              <div className="grid gap-3 md:grid-cols-3">
                {curado.generosPorAno.map((g) => (
                  <div key={g.ano} className="rounded-xl border border-t-4 border-slate-200 border-t-teal-600 p-4">
                    <div className="text-lg font-bold text-slate-900">{g.ano}</div>
                    <div className="mt-1 flex justify-between text-sm tabular-nums"><span className="text-slate-500">Empenhado</span><b>{mi(g.empenhado)}</b></div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ---------------- CONTABILIDADE ---------------- */}
      {sec === "contabilidade" && curado?.cadeia && curado.cadeiaTotal && (
        <Card>
          <H2>Cadeia licitação → contrato → pagamento</H2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1.5">Licitação</th><th className="px-2 py-1.5">Contrato</th><th className="px-2 py-1.5">Fornecedor</th><th className="px-2 py-1.5">Natureza</th><th className="px-2 py-1.5 text-right">Empenhado</th><th className="px-2 py-1.5 text-right">Pago</th></tr></thead>
              <tbody className="tabular-nums">
                {curado.cadeia.map((c, i) => (
                  <tr key={i} className="border-b border-slate-100"><td className="px-2 py-1.5 font-mono text-xs">{c.licitacao}</td><td className="px-2 py-1.5 font-mono text-xs">{c.contrato}</td><td className="px-2 py-1.5">{c.fornecedor}</td><td className="px-2 py-1.5 text-xs text-slate-500">{c.natureza}</td><td className="px-2 py-1.5 text-right">{fmtBRL(c.empenhado)}</td><td className="px-2 py-1.5 text-right">{fmtBRL(c.pago)}</td></tr>
                ))}
                <tr className="border-t-2 border-slate-200 font-bold"><td className="px-2 py-1.5" colSpan={4}>Total ({curado.cadeiaTotal.contratos} contratos)</td><td className="px-2 py-1.5 text-right">{fmtBRL(curado.cadeiaTotal.empenhado)}</td><td className="px-2 py-1.5 text-right">{fmtBRL(curado.cadeiaTotal.pago)}</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ---------------- ESCOLAS & EQUIPE ---------------- */}
      {sec === "escolas" && curado?.escolas && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi v={fmtNumber(curado.escolas.total, 0)} l="escolas municipais" />
            <Kpi v={fmtNumber(curado.escolas.alunos, 0)} l="alunos (Censo INEP)" />
            <Kpi v={`${curado.escolas.comCozinha}/${curado.escolas.total}`} l="com cozinha" />
            {curado.refeicoes && <Kpi v={curado.refeicoes.total.toLocaleString("pt-BR")} l="refeições/dia (≈)" />}
          </div>
          {curado.rotas && (
            <Card>
              <H2>Escolas por rota (nutricionistas)</H2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1.5">Rota</th><th className="px-2 py-1.5 text-right">Escolas</th><th className="px-2 py-1.5 text-right">Cozinheiras</th><th className="px-2 py-1.5 text-right">Alunos</th></tr></thead>
                  <tbody className="tabular-nums">
                    {curado.rotas.map((r) => (
                      <tr key={r.rota} className="border-b border-slate-100"><td className="px-2 py-1.5">{r.rota}</td><td className="px-2 py-1.5 text-right">{r.escolas}</td><td className="px-2 py-1.5 text-right">{r.cozinheiras}</td><td className="px-2 py-1.5 text-right">{fmtNumber(r.alunos, 0)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {curado.depae && (
            <Card>
              <H2>🍎 Gestão (DEPAE) — 100% merenda, entra integral</H2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1.5">Servidor</th><th className="px-2 py-1.5">Papel</th><th className="px-2 py-1.5">Cargo</th><th className="px-2 py-1.5 text-right">Bruto/mês</th></tr></thead>
                  <tbody className="tabular-nums">
                    {curado.depae.servidores.map((s) => (
                      <tr key={s.nome} className="border-b border-slate-100"><td className="px-2 py-1.5 font-semibold">{s.nome}{s.tag && <span className="ml-1 text-[10.5px] font-normal text-teal-600">· {s.tag}</span>}</td><td className="px-2 py-1.5 text-slate-500">{s.papel}</td><td className="px-2 py-1.5 text-slate-500">{s.cargo}</td><td className="px-2 py-1.5 text-right">{fmtBRL(s.bruto)}</td></tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 font-bold"><td className="px-2 py-1.5" colSpan={3}>Total ({curado.depae.servidores.length} servidores)</td><td className="px-2 py-1.5 text-right">{fmtBRL(curado.depae.total)}</td></tr>
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ---------------- LICITAÇÕES & SETOR ---------------- */}
      {sec === "licitacoes" && (
        <div className="space-y-4">
          {curado?.processos && (
            <Card>
              <H2><ShoppingCart className="mr-1 inline h-4 w-4 text-teal-600" />Licitações de merenda (gêneros)</H2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1.5">Ano</th><th className="px-2 py-1.5">Modalidade</th><th className="px-2 py-1.5">Objeto</th><th className="px-2 py-1.5 text-right">Valor</th></tr></thead>
                  <tbody className="tabular-nums">
                    {curado.processos.map((p, i) => (
                      <tr key={i} className="border-b border-slate-100"><td className="px-2 py-1.5 font-semibold">{p.ano}</td><td className="px-2 py-1.5">{p.modalidade}</td><td className="px-2 py-1.5 text-slate-500">{p.objeto}</td><td className="px-2 py-1.5 text-right font-semibold">{fmtBRL(p.valor)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">Só gêneros — não há contrato de mão de obra (cozinheiras são quadro próprio). Forte presença da agricultura familiar (credenciamento/dispensa).</p>
            </Card>
          )}
          {curado?.fornecedores && (
            <Card>
              <H2>Principais fornecedores contratados</H2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1.5">Fornecedor</th><th className="px-2 py-1.5">Tipo</th><th className="px-2 py-1.5 text-right">Contratado</th></tr></thead>
                  <tbody className="tabular-nums">
                    {curado.fornecedores.map((f, i) => (
                      <tr key={i} className="border-b border-slate-100"><td className="px-2 py-1.5">{f.nome}</td><td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${/familiar/i.test(f.tipo) ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-600"}`}>{f.tipo}</span></td><td className="px-2 py-1.5 text-right font-semibold">{fmtBRL(f.valor)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">A agricultura familiar (cooperativas locais) domina — coerente com os 68,8% do PNAE-agri.</p>
            </Card>
          )}
          {curado?.processo && (
            <Card>
              <H2>📄 Setor de Compras, Licitações e Contratos</H2>
              <p className="mb-3 text-sm text-slate-600"><b>{curado.processo.servidores.length}+ servidores</b> (folha total <b>{fmtBRL(curado.processo.total)}/mês</b>) conduzem <b>toda a compra da cidade</b> — não é custo exclusivo da merenda. Entra só a <b>fração-hora</b> dos processos de merenda (custo de transação, método Banco Mundial/TCU).</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b-2 border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1.5">Servidor</th><th className="px-2 py-1.5">Papel</th><th className="px-2 py-1.5">Cargo</th><th className="px-2 py-1.5 text-right">Bruto/mês</th></tr></thead>
                  <tbody className="tabular-nums">
                    {curado.processo.servidores.map((s) => (
                      <tr key={s.nome} className="border-b border-slate-100"><td className="px-2 py-1.5 font-semibold">{s.nome}{s.tag && <span className="ml-1 text-[10.5px] font-normal text-teal-600">· {s.tag}</span>}</td><td className="px-2 py-1.5 text-slate-500">{s.papel}</td><td className="px-2 py-1.5 text-slate-500">{s.cargo}</td><td className="px-2 py-1.5 text-right">{fmtBRL(s.bruto)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        <b className="text-slate-500">Fontes.</b> Núcleo (todo município): Censo INEP, FNDE/SIMAD (PNAE), PNCP, SICONFI. {curado ? `Aprofundamento (${curado.nome}): ${curado.fontes.join("; ")}.` : "Aprofundamento disponível apenas onde há garimpo local."}
      </p>
    </div>
  );
}
