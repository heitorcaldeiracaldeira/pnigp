// Aba Sistema Financeiro — infraestrutura de acesso (agências/cooperativas/correspondentes) + movimento (Pix).
// Diferencial: SC é cooperativista; a cooperativa é o "banco" do interior. Fonte: BCB (API Olinda). Server component.
import type { AcessoFinanceiroSC } from "@/lib/queries";
import { Landmark, Users, Store, ArrowLeftRight, Info, Coins, Wheat, Home, PiggyBank } from "lucide-react";
import { BaixarCsv } from "@/components/baixar-csv";
import { fmtDataInstante } from "@/lib/ui";

const n0 = (v: number) => Math.round(v).toLocaleString("pt-BR");
const brlMi = (v: number) => (v >= 1e9 ? `R$ ${(v / 1e9).toFixed(1)} bi` : v >= 1e6 ? `R$ ${(v / 1e6).toFixed(0)} mi` : `R$ ${(v / 1e3).toFixed(0)} mil`);
const MES_ABBR = ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesLabel = (am: number) => { const s = String(am); return `${MES_ABBR[Number(s.slice(4, 6))] || s.slice(4, 6)}/${s.slice(0, 4)}`; };
const dataBR = (ts: string) => fmtDataInstante(ts); // no fuso de Brasília: renderizado no servidor, que roda em UTC
const competLabel = (c: string) => { const m = c.match(/(\d{4})-(\d{2})/); return m ? `${MES_ABBR[Number(m[2])] || m[2]}/${m[1]}` : c; }; // 2026-07 → jul/2026

function Comparativo({ v, med, menorMelhor = false }: { v: number; med: number; menorMelhor?: boolean }) {
  if (!med) return null;
  const acima = v >= med; const bom = menorMelhor ? !acima : acima;
  return <span className={`text-[10px] ${bom ? "text-emerald-600" : "text-amber-600"}`}>mediana do porte: {n0(med)} · {acima ? "acima" : "abaixo"}</span>;
}

function Sparkline({ serie }: { serie: { mes: number; vl: number }[] }) {
  // remove o último mês se for parcial (vl << penúltimo)
  const s = serie.length > 2 && serie[serie.length - 1].vl < serie[serie.length - 2].vl * 0.5 ? serie.slice(0, -1) : serie;
  if (s.length < 2) return null;
  const vals = s.map((x) => x.vl); const max = Math.max(...vals), min = Math.min(...vals);
  const W = 240, Hh = 40; const pts = s.map((x, i) => `${(i / (s.length - 1)) * W},${Hh - ((x.vl - min) / (max - min || 1)) * Hh}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="h-10 w-full" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke="#0d9488" strokeWidth="1.5" /></svg>
  );
}

export function AcessoFinanceiro({ data, nome }: { data: NonNullable<AcessoFinanceiroSC>; nome: string }) {
  const d = data;
  const perfilTxt = d.perfil === "agencia" ? "Tem agência bancária própria" : d.perfil === "cooperativa" ? "Atendido por cooperativa de crédito" : "Atendido por correspondente";
  const perfilCor = d.perfil === "agencia" ? "bg-teal-100 text-teal-700" : d.perfil === "cooperativa" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700";

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 font-semibold text-slate-800"><Landmark className="h-4 w-4 text-teal-600" /> Sistema financeiro de {nome}</h3>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${perfilCor}`}>{perfilTxt}</span>
            <BaixarCsv nome={`acesso-financeiro-${nome}`} label="CSV" colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} linhas={[{ indicador: "Agências", valor: d.agencias }, { indicador: "Bancos distintos", valor: d.bancos }, { indicador: "Postos de banco", valor: d.postosBanco }, { indicador: "Postos de cooperativa", valor: d.postosCoop }, { indicador: "Cooperativas", valor: d.cooperativas }, { indicador: "Correspondentes", valor: d.correspondentes }, { indicador: "Competência", valor: competLabel(d.competencia) }]} />
          </div>
        </div>
        <p className="mt-1 text-[12px] text-slate-500">Infraestrutura de acesso e movimento financeiro por município — posição <b>{competLabel(d.competencia)}</b>. Santa Catarina é <b>cooperativista</b>: no interior, a cooperativa de crédito é o banco.</p>

        {/* Bloco 1 — acesso, DIVIDIDO por natureza jurídica (bancos × cooperativas têm legislação distinta) */}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {/* Rede bancária */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-slate-700"><Landmark className="h-3.5 w-3.5 text-teal-600" /> Rede bancária <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-normal text-slate-500">Lei 4.595/1964</span></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[11px] text-slate-500">Agências</div>
                <div className="font-display text-2xl font-bold tabular-nums text-slate-800">{n0(d.agencias)}</div>
                <div className="text-[10px] text-slate-400">{d.bancos} banco(s) distinto(s)</div>
                <Comparativo v={d.agencias} med={d.medAgencias} />
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Postos de banco</div>
                <div className="font-display text-2xl font-bold tabular-nums text-slate-800">{n0(d.postosBanco)}</div>
                <div className="text-[10px] text-slate-400">atendimento bancário (PA)</div>
              </div>
            </div>
          </div>
          {/* Cooperativas de crédito */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-indigo-700"><Users className="h-3.5 w-3.5" /> Cooperativas de crédito <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-normal text-indigo-500">LC 130/2009 · Lei 5.764/1971</span></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[11px] text-slate-500">Postos de cooperativa</div>
                <div className="font-display text-2xl font-bold tabular-nums text-indigo-700">{n0(d.postosCoop)}</div>
                <Comparativo v={d.postosCoop} med={d.medPostosCoop} />
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Cooperativas</div>
                <div className="font-display text-2xl font-bold tabular-nums text-indigo-700">{n0(d.cooperativas)}</div>
                <div className="text-[10px] text-slate-400">singulares distintas</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center gap-1.5 text-[12px] text-slate-600"><Store className="h-3.5 w-3.5 text-slate-400" /> <b className="text-slate-700">Correspondentes</b> — lotéricas/mercados com serviço bancário (Res. CMN 4.935/2021)</div>
          <div className="text-right"><span className="font-display text-xl font-bold tabular-nums text-slate-800">{n0(d.correspondentes)}</span> <Comparativo v={d.correspondentes} med={d.medCorresp} /></div>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">A separação segue a <b>natureza jurídica</b>: instituições bancárias (Lei 4.595/1964) e cooperativas de crédito (LC 130/2009 + Lei 5.764/1971) são reguladas por marcos distintos — a cooperativa é sociedade de pessoas, sem fins lucrativos, de propriedade dos associados.</p>

        {/* diferencial cooperativista */}
        {d.soCooperativa && (
          <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 text-[12px] text-slate-700">
            <b className="text-indigo-700">A cooperativa de crédito é o banco de {nome}.</b> O município não tem agência bancária tradicional — o acesso a crédito e serviços financeiros vem das <b>{d.cooperativas} cooperativa(s)</b> ({d.postosCoop} posto(s)) e dos correspondentes. É a realidade de boa parte do interior de SC.
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">Em SC: <b>{d.scMunisComAgencia}</b> municípios têm agência bancária; <b>{d.scMunisSoCoop}</b> não têm agência mas são atendidos por cooperativa. Total de {n0(d.scAgencias)} agências, {n0(d.scPostosCoop)} postos de cooperativa e {n0(d.scCorresp)} correspondentes no estado.</p>
      </div>

      {/* Bloco 2 — movimento Pix */}
      {d.pix && d.pix.vlRecebido > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><ArrowLeftRight className="h-4 w-4 text-teal-600" /> Movimento Pix — a economia que circula</div>
            <span className="rounded-full bg-teal-600 px-2.5 py-1 text-[12px] font-bold tabular-nums text-white shadow-sm">📅 mês de referência {mesLabel(d.pix.mes)}</span>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-[11px] text-slate-500">Recebido no mês ({mesLabel(d.pix.mes)})</div>
              <div className="font-display text-xl font-bold tabular-nums text-teal-700">{brlMi(d.pix.vlRecebido)}</div>
              <Comparativo v={d.pix.vlRecebido} med={d.pix.medVlRecebido} />
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Empresas (PJ) recebendo</div>
              <div className="font-display text-xl font-bold tabular-nums text-slate-800">{n0(d.pix.nPesPj)}</div>
              <div className="text-[10px] text-slate-400">proxy de atividade econômica tributável (ISS)</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Série mensal (valor recebido)</div>
              <Sparkline serie={d.pix.serie} />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <BaixarCsv nome={`pix-serie-${nome}`} label="Baixar série Pix (CSV)" colunas={[{ chave: "mes", rotulo: "Mês" }, { chave: "recebido", rotulo: "Valor recebido (R$)" }, { chave: "recebido_pj", rotulo: "Recebido de PJ (R$)" }]} linhas={d.pix.serie.map((r) => ({ mes: mesLabel(r.mes), recebido: r.vl, recebido_pj: r.vlPj }))} />
          </div>
        </div>
      )}

      {/* Bloco 3 — Volume bancário (ESTBAN) */}
      {d.estban && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Coins className="h-4 w-4 text-teal-600" /> Volume bancário — crédito e poupança no município</div>
            <span className="rounded-full bg-teal-600 px-2.5 py-1 text-[12px] font-bold tabular-nums text-white shadow-sm">📅 data-base {mesLabel(d.estban.mes)}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">Saldos do balancete bancário (ESTBAN) referentes a <b className="text-slate-700">{mesLabel(d.estban.mes)}</b> — quanto de crédito circula e quanto está poupado. Proxy da base econômica local.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div className="flex items-center gap-1 text-[11px] text-slate-500"><Coins className="h-3.5 w-3.5" /> Crédito total</div>
              <div className="font-display text-lg font-bold tabular-nums text-slate-800">{brlMi(d.estban.credito)}</div>
              <Comparativo v={d.estban.credito} med={d.estban.medCredito} />
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
              <div className="flex items-center gap-1 text-[11px] text-slate-500"><PiggyBank className="h-3.5 w-3.5 text-emerald-600" /> Poupança</div>
              <div className="font-display text-lg font-bold tabular-nums text-emerald-700">{brlMi(d.estban.poupanca)}</div>
              <Comparativo v={d.estban.poupanca} med={d.estban.medPoupanca} />
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
              <div className="flex items-center gap-1 text-[11px] text-slate-500"><Wheat className="h-3.5 w-3.5 text-amber-600" /> Crédito rural + agro</div>
              <div className="font-display text-lg font-bold tabular-nums text-amber-700">{brlMi(d.estban.rural + d.estban.agroind)}</div>
              <div className="text-[10px] text-slate-400">rural {brlMi(d.estban.rural)} · agroind. {brlMi(d.estban.agroind)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div className="flex items-center gap-1 text-[11px] text-slate-500"><Home className="h-3.5 w-3.5" /> Crédito imobiliário</div>
              <div className="font-display text-lg font-bold tabular-nums text-slate-800">{brlMi(d.estban.imob)}</div>
              <div className="text-[10px] text-slate-400">habitação/construção</div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-500">
            <span>Depósito a prazo: <b className="text-slate-700">{brlMi(d.estban.prazo)}</b></span>
            <span>À vista: <b className="text-slate-700">{brlMi(d.estban.vista)}</b></span>
            <span>Ativo total (peso bancário): <b className="text-slate-700">{brlMi(d.estban.ativo)}</b></span>
            {d.estban.serie.length > 1 && <span className="ml-auto flex items-center gap-1">série crédito <span className="inline-block w-32"><Sparkline serie={d.estban.serie.map((r) => ({ mes: r.mes, vl: r.credito }))} /></span></span>}
          </div>
          <div className="mt-2 flex justify-end">
            <BaixarCsv nome={`estban-serie-${nome}`} label="Baixar série ESTBAN (CSV)" colunas={[{ chave: "mes", rotulo: "Mês" }, { chave: "credito", rotulo: "Crédito (R$)" }, { chave: "poupanca", rotulo: "Poupança (R$)" }]} linhas={d.estban.serie.map((r) => ({ mes: mesLabel(r.mes), credito: r.credito, poupanca: r.poupanca }))} />
          </div>
          <p className="mt-2 text-[10px] text-slate-400">Fonte: <b>BCB — ESTBAN</b> (Estatística Bancária Mensal por município) · data-base <b>{mesLabel(d.estban.mes)}</b> · coletado em <b>{dataBR(d.estban.coletado)}</b>. Cobre municípios com instituição bancária reportante ({d.temAgencia ? "este tem agência" : "cobertura parcial"}).</p>
        </div>
      )}

      {/* listas */}
      {(d.bancosLista.length > 0 || d.cooperativasLista.length > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {d.bancosLista.length > 0 && (
            <details className="rounded-lg border border-slate-200 bg-slate-50/40"><summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-slate-700">Bancos com agência ({d.bancosLista.length})</summary><div className="space-y-0.5 px-3 pb-2 text-[11px] text-slate-600">{d.bancosLista.map((b, i) => <div key={i} className="truncate border-t border-slate-100 pt-0.5">{b}</div>)}</div></details>
          )}
          {d.cooperativasLista.length > 0 && (
            <details className="rounded-lg border border-indigo-200 bg-indigo-50/30"><summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-indigo-700">Cooperativas de crédito ({d.cooperativasLista.length})</summary><div className="space-y-0.5 px-3 pb-2 text-[11px] text-slate-600">{d.cooperativasLista.map((c, i) => <div key={i} className="truncate border-t border-indigo-100 pt-0.5">{c}</div>)}</div></details>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[11px] text-slate-600">
        <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-700"><span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-teal-700"><Info aria-hidden className="h-3 w-3" /> Dado oficial</span> Origem dos dados e data da coleta</div>
        <ul className="space-y-1">
          <li><b>Acesso</b> (agências · cooperativas · correspondentes): <b>Banco Central do Brasil — API Olinda</b> (Informes de Agências, Postos de Atendimento e Correspondentes) · posição <b>{competLabel(d.competencia)}</b> (gerado em {d.posicao}) · <b>coletado em {dataBR(d.coletado)}</b></li>
          {d.pix && <li><b>Movimento Pix</b>: <b>Banco Central do Brasil — API Olinda</b> (Estatísticas do Pix por município) · mês de referência <b>{mesLabel(d.pix.mes)}</b> · <b>coletado em {dataBR(d.pix.coletado)}</b></li>}
          {d.estban && <li><b>Volume</b> (crédito · poupança): <b>Banco Central do Brasil — ESTBAN</b> (Estatística Bancária Mensal por município) · data-base <b>{mesLabel(d.estban.mes)}</b> · <b>coletado em {dataBR(d.estban.coletado)}</b></li>}
        </ul>
        <p className="mt-1.5 text-[10px] text-slate-400">Todas as camadas com série histórica. Exibição neutra e didática — sem juízo de gestão.</p>
      </div>
    </section>
  );
}
