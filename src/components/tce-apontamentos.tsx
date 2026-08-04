import { ShieldAlert, TrendingDown, TrendingUp, Minus, Info, Scale } from "lucide-react";
import type { TceApontamentos, TceProcessoApontado, TceDivergenciaValor } from "@/lib/queries";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const ORIGEM: Record<string, { rotulo: string; desc: string }> = {
  participante: { rotulo: "No participante da licitação", desc: "checagem do TCE sobre quem disputou" },
  contrato: { rotulo: "No contratado", desc: "checagem do TCE sobre quem assinou o contrato" },
  processo: { rotulo: "Desfecho do processo", desc: "o que aconteceu com a licitação — contexto, não apontamento" },
};

// o TCE grava esta tipologia como identificador cru, sem rótulo legível; as outras 22 vêm em português
const ROTULO_CRU: Record<string, string> = { contratado_divida_fgts: "Contratado com dívida de FGTS" };

export function TceApontamentosCard({ dados, municipio, processos = [], divergencias = [] }: { dados: TceApontamentos; municipio: string; processos?: TceProcessoApontado[]; divergencias?: TceDivergenciaValor[] }) {
  if (!dados) return null;
  const { total, porOrigem, itens, intensidade, tendencia } = dados;
  const risco = itens.filter((i) => i.origem !== "processo");
  const desfecho = itens.filter((i) => i.origem === "processo");
  // processos NOSSOS tocados por cada tipologia — é o que transforma contagem em algo verificável
  const porTipologia = new Map<string, TceProcessoApontado[]>();
  for (const p of processos) {
    const k = `${p.origem}|${p.tipologia}`;
    const l = porTipologia.get(k) || []; l.push(p); porTipologia.set(k, l);
  }
  const ultimo = intensidade.at(-1);

  return (
    <section aria-label="Apontamentos do TCE/SC" className="rounded-xl border border-slate-200 bg-white">
      <header className="rounded-t-xl bg-slate-900 px-5 py-4 text-white">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-300" aria-hidden />
          <h2 className="font-display text-lg font-semibold">O que o TCE/SC analisa nas compras de {municipio}</h2>
        </div>
        <p className="mt-1 text-sm text-slate-300">
          {fmt(total)} registros em {itens.length} tipologias de trilha de auditoria do Tribunal de Contas.
        </p>
      </header>

      {/* ── o aviso vem ANTES do número, não em rodapé ── */}
      <div className="flex gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          Estes são <strong>apontamentos de trilha de auditoria</strong>, não irregularidades comprovadas. Uma
          tipologia marcada significa que o processo entrou num filtro de verificação do TCE/SC — apuração,
          contraditório e decisão são etapas seguintes e <strong>não</strong> estão refletidas aqui.
        </p>
      </div>

      <div className="space-y-6 p-5">
        {/* ── intensidade PRÓPRIA: o município contra ele mesmo ── */}
        {intensidade.length > 1 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold text-slate-800">Intensidade ao longo do tempo</h3>
              {tendencia && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  tendencia === "subindo" ? "bg-amber-100 text-amber-800"
                  : tendencia === "caindo" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                  {tendencia === "subindo" ? <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                    : tendencia === "caindo" ? <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                    : <Minus className="h-3.5 w-3.5" aria-hidden />}
                  {tendencia === "subindo" ? "subindo" : tendencia === "caindo" ? "caindo" : "estável"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Apontamentos por 100 processos — <strong>{municipio} comparado com {municipio}</strong>, ano a ano.
              Normalizado por volume: quem compra mais tem naturalmente mais registros.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-1.5 pr-3 font-medium">Ano</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Processos</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Apontamentos</th>
                    <th className="py-1.5 text-right font-medium">Por 100 processos</th>
                  </tr>
                </thead>
                <tbody>
                  {intensidade.map((r) => (
                    <tr key={r.ano} className="border-b border-slate-200 last:border-0">
                      <td className="py-1.5 pr-3 text-slate-700">{r.ano}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-600">{fmt(r.processos)}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-600">{fmt(r.apontamentos)}</td>
                      <td className="py-1.5 text-right font-semibold text-slate-900">{r.por100.toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ultimo && (
              <p className="mt-2 text-xs text-slate-500">
                Último ano com dado: {ultimo.ano} — {fmt(ultimo.apontamentos)} apontamentos em {fmt(ultimo.processos)} processos.
              </p>
            )}
          </div>
        )}

        {/* ── resumo por origem ── */}
        <div className="grid gap-3 sm:grid-cols-3">
          {porOrigem.map((o) => (
            <div key={o.origem} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{ORIGEM[o.origem]?.rotulo || o.origem}</p>
              <p className="font-display text-2xl font-semibold text-slate-900">{fmt(o.apontamentos)}</p>
              <p className="text-xs text-slate-500">{o.tipologias} tipologias · {ORIGEM[o.origem]?.desc}</p>
            </div>
          ))}
        </div>

        {/* ── o QUADRO: uma linha por tipologia ── */}
        <Quadro titulo="Tipologias de risco marcadas pelo TCE" itens={risco} mostrarValor porTipologia={porTipologia} />
        {desfecho.length > 0 && (
          <Quadro titulo="Desfecho dos processos (contexto)" itens={desfecho} porTipologia={porTipologia} />
        )}

        <FilaDivergencia itens={divergencias} municipio={municipio} />

        {/* ── metodologia visível, não escondida ── */}
        <details className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-800">Ver cálculo e metodologia</summary>
          <div className="mt-3 space-y-2 text-slate-600">
            <p><strong>Fonte:</strong> e-Sfinge, painéis públicos do TCE/SC (`AppLicitacoesExterno`). São três tabelas do
              Tribunal: trilhas sobre o participante da licitação, tipologias sobre o contratado e ocorrências do processo.</p>
            <p><strong>O que o TCE cruza e nós não teríamos como cruzar:</strong> RAIS/CAGED (folha do fornecedor),
              Receita Federal (situação cadastral, data de criação, quadro societário), a folha da própria prefeitura
              (quem é ou foi servidor) e o CEIS. O apontamento é do Tribunal, não uma dedução nossa.</p>
            <p><strong>Intensidade:</strong> apontamentos de risco ÷ processos homologados do município no mesmo ano,
              × 100. O denominador vem do universo do TCE, não do nosso — são bases de tamanhos diferentes.
              A tendência compara a média dos 2 últimos anos com a dos 2 anteriores, com faixa de 15% para “estável”.</p>
            <p><strong>Vínculo indireto:</strong> a trilha do participante é chaveada por identificador de participante
              e chega ao município por uma ponte do modelo do TCE. Onde a ponte não fecha, o apontamento não aparece.</p>
            <p><strong>Cobertura depende da remessa municipal:</strong> município que informa menos ao TCE aparece com
              menos apontamentos. <strong>Menos apontamento não significa melhor gestão.</strong></p>
            <p><strong>O que este quadro não é:</strong> não é ranking entre municípios, não é nota, não é decisão do
              Tribunal e não substitui consulta ao TCE/SC.</p>
          </div>
        </details>
      </div>
    </section>
  );
}

// FILA DE AVERIGUAÇÃO — contratos cujo valor no PNCP e no TCE não fecham. É trabalho para a equipe conferir,
// não acusação: pode ser ata contratada em parte, aditivo, remessa incompleta — ou o erro de origem conhecido
// (o total lançado no campo do preço unitário), que marcamos na própria linha para não mandar ninguém caçar
// aditivo que não existe.
function FilaDivergencia({ itens, municipio }: { itens: TceDivergenciaValor[]; municipio: string }) {
  if (!itens.length) return null;
  // Os dois baldes não se misturam: mostrar a diferença do balde `remessa_a_corrigir` como se fosse do
  // contrato é mentira aritmética — ali o número do TCE é o nosso multiplicado pela quantidade do item.
  const fila = itens.filter((i) => i.situacao === "a_averiguar");
  const multiplicados = itens.filter((i) => i.situacao === "remessa_a_corrigir");
  if (!fila.length && !multiplicados.length) return null;
  const somaDif = fila.reduce((s, i) => s + Math.abs(i.diferenca), 0);
  const daRemessa = fila.filter((i) => i.remessa).length;
  const p1 = fila.filter((i) => i.prioridade === 1).length;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Scale className="h-4 w-4 text-slate-700" aria-hidden />
        <h3 className="font-semibold text-slate-800">Contratos para averiguação da equipe</h3>
      </div>
      <p className="mb-3 text-sm text-slate-600">
        {fmt(fila.length)} contratos de {municipio} em que o valor registrado no PNCP e o registrado no TCE/SC
        <strong> não fecham</strong> — diferença somada de {fmtBRL(somaDif)}.
        {p1 > 0 && <> {fmt(p1)} {p1 === 1 ? "está" : "estão"} acima de R$ 1 milhão de diferença.</>}
      </p>

      {multiplicados.length > 0 && (
        <div className="mb-3 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Outros <strong>{fmt(multiplicados.length)} contratos ficaram fora desta lista</strong> de propósito:
            neles o valor do TCE é exatamente o valor do contrato <strong>multiplicado pela quantidade do
            item</strong> — sinal de que o total foi lançado no campo do preço unitário na remessa ao Tribunal.
            O contrato tende a estar certo; o que precisa de correção é o registro. Contá-los como divergência
            de valor inflaria o total sem nenhum contrato ter mudado.
          </p>
        </div>
      )}

      <div className="mb-3 flex gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          Divergência de valor <strong>não é irregularidade</strong>. As causas comuns são legítimas: ata de
          registro de preço contratada em parte, aditivo registrado em um sistema e não no outro, ou item não
          informado na remessa ao Tribunal.
          {daRemessa > 0 && <> Em <strong>{fmt(daRemessa)}</strong> destes contratos o indício aponta para a
          forma como o valor foi <strong>lançado na remessa ao TCE</strong> (o total no campo do preço
          unitário) — nesses, o contrato tende a estar certo e quem precisa de correção é o registro.</>}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Contrato</th>
              <th className="py-2 pr-3 text-right font-medium">No PNCP</th>
              <th className="py-2 pr-3 text-right font-medium">No TCE</th>
              <th className="py-2 pr-3 text-right font-medium">Diferença</th>
              <th className="py-2 font-medium">O que verificar</th>
            </tr>
          </thead>
          <tbody>
            {fila.slice(0, 50).map((i) => (
              <tr key={`${i.cnpj}-${i.ano}-${i.seq}-${i.ni}-${i.valorPncp}`} className="border-b border-slate-200 align-top last:border-0">
                <td className="py-2 pr-3 text-slate-700">
                  {i.prioridade === 1 && (
                    <span className="mr-1.5 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      ≥ R$ 1 mi
                    </span>
                  )}
                  {i.objeto || "—"}
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {i.fornecedor || "fornecedor não informado"}
                    {i.assinatura && <> · assinado em {i.assinatura.split("-").reverse().join("/")}</>}
                    {" · "}compra {i.seq}/{i.ano}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-800">{fmtBRL(i.valorPncp)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-800">
                  {fmtBRL(i.valorTce)}
                  {i.remessa && (
                    <span className="mt-0.5 block text-[11px] font-normal text-amber-700">
                      valor reconstruído · o TCE registra {fmtBRL(i.valorTceDeclarado)}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-900">
                  {fmtBRL(Math.abs(i.diferenca))}
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{Math.round(i.gap * 100)}%</span>
                </td>
                <td className="py-2 text-xs leading-snug text-slate-600">{i.causa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fila.length > 50 && (
        <p className="pt-2 text-xs text-slate-500">Mostrando 50 de {fmt(fila.length)} contratos, os de maior diferença primeiro.</p>
      )}
      <p className="pt-2 text-xs text-slate-500">
        Só entram contratos cujo vínculo entre os dois sistemas está <strong>confirmado</strong> por assinatura,
        vigência ou valor. O valor do PNCP é o valor global do contrato publicado; o do TCE é a soma dos itens
        contratados no e-Sfinge.
      </p>
    </div>
  );
}

function Quadro({ titulo, itens, mostrarValor, porTipologia }: {
  titulo: string;
  itens: { origem: string; tipologia: string; apontamentos: number; valor: number; ultimo: string | null; observacao: string | null }[];
  mostrarValor?: boolean;
  porTipologia?: Map<string, TceProcessoApontado[]>;
}) {
  if (!itens.length) return null;
  return (
    <div>
      <h3 className="mb-2 font-semibold text-slate-800">{titulo}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Tipologia</th>
              <th className="py-2 pr-3 font-medium">Onde</th>
              <th className="py-2 pr-3 text-right font-medium">Registros</th>
              {mostrarValor && <th className="py-2 pr-3 text-right font-medium">Valor envolvido</th>}
              <th className="py-2 text-right font-medium">Mais recente</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const procs = porTipologia?.get(`${i.origem}|${i.tipologia}`) || [];
              const cols = mostrarValor ? 5 : 4;
              return (
                <tr key={`${i.origem}-${i.tipologia}`} className="border-b border-slate-200 last:border-0 align-top">
                  <td colSpan={cols} className="p-0">
                    {/* <details> nativo: expansível sem virar client component */}
                    <details className="group">
                      <summary className={`grid cursor-pointer list-none items-start gap-3 py-2 hover:bg-slate-50 ${mostrarValor ? "grid-cols-[1fr_9rem_5rem_9rem_6rem]" : "grid-cols-[1fr_9rem_5rem_6rem]"}`}>
                        <span className="text-slate-800">
                          {ROTULO_CRU[i.tipologia] || i.tipologia}
                          {procs.length > 0 && (
                            <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700 group-open:bg-slate-800 group-open:text-white">
                              {procs.length === 1 ? "1 processo" : `${procs.length} processos`}
                            </span>
                          )}
                          {i.observacao && <span className="mt-0.5 block text-xs text-slate-500">{i.observacao}</span>}
                        </span>
                        <span className="text-xs text-slate-500">{ORIGEM[i.origem]?.rotulo || i.origem}</span>
                        <span className="text-right font-semibold tabular-nums text-slate-900">{fmt(i.apontamentos)}</span>
                        {mostrarValor && <span className="text-right tabular-nums text-slate-600">{i.valor > 0 ? fmtBRL(i.valor) : "—"}</span>}
                        <span className="text-right text-xs tabular-nums text-slate-500">{i.ultimo || "—"}</span>
                      </summary>
                      {procs.length > 0 ? (
                        <div className="mb-3 ml-2 border-l-2 border-slate-300 pl-3">
                          <p className="py-2 text-xs text-slate-500">
                            Processos da nossa base do PNCP tocados por esta tipologia. Confira cada um no PNCP e no
                            TCE antes de qualquer conclusão.
                          </p>
                          {procs.some((p) => p.confianca !== "confirmado") && (
                            <p className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                              {fmt(procs.filter((p) => p.confianca !== "confirmado").length)} destes processos estão
                              marcados para verificação: o vínculo entre o registro do TCE e o processo do PNCP se
                              apoia em sinal frágil, ou os valores dos dois sistemas divergem. São os primeiros que
                              vale conferir com a equipe — pode ser recorte diferente de valor, ou o processo do
                              Tribunal ser outro.
                            </p>
                          )}
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-left text-slate-500">
                                <th className="py-1 pr-2 font-medium">Objeto</th>
                                <th className="py-1 pr-2 font-medium">Modalidade</th>
                                <th className="py-1 pr-2 font-medium">Nº / ano</th>
                                <th className="py-1 pr-2 text-right font-medium">Homologado</th>
                                <th className="py-1 text-right font-medium">Publicação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {procs.slice(0, 25).map((p) => (
                                <tr key={`${p.cnpj}-${p.ano}-${p.seq}`} className={`border-b border-slate-100 last:border-0 ${p.confianca !== "confirmado" ? "bg-amber-50/60" : ""}`}>
                                  <td className="py-1 pr-2 text-slate-700">
                                    {p.confianca !== "confirmado" && (
                                      <span className="mr-1.5 inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                                        {p.confianca === "divergente" ? "verificar" : "conferir"}
                                      </span>
                                    )}
                                    {p.objeto || "—"}
                                    {p.entidade && <span className="mt-0.5 block text-slate-500">Fornecedor apontado: {p.entidade}</span>}
                                    {p.notaVerificacao && (
                                      <span className="mt-1 block rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-900">
                                        <strong>Oportunidade de verificação.</strong> {p.notaVerificacao}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1 pr-2 text-slate-500">{p.modalidade}</td>
                                  <td className="py-1 pr-2 tabular-nums text-slate-500">{p.numeroCompra}/{p.ano}</td>
                                  <td className="py-1 pr-2 text-right tabular-nums text-slate-700">{p.valorHomologado > 0 ? fmtBRL(p.valorHomologado) : "—"}</td>
                                  <td className="py-1 text-right tabular-nums text-slate-500">{p.dataPublicacao || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {procs.length > 25 && <p className="pt-2 text-xs text-slate-500">Mostrando 25 de {fmt(procs.length)} processos.</p>}
                        </div>
                      ) : (
                        <p className="mb-3 ml-2 border-l-2 border-slate-200 py-2 pl-3 text-xs text-slate-500">
                          Nenhum destes apontamentos pôde ser ligado a um processo da nossa base — o casamento entre a
                          numeração do TCE e a do PNCP cobre 73% dos processos homologados.
                        </p>
                      )}
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
