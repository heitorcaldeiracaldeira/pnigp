// Painéis das novas fontes (eixos econômico/ambiental/social/saúde). Server components, compactos.
// Padrão: dado + série + carimbo de origem COM data de extração + CSV. (atende à diretriz de proveniência + exportação.)
import type { getBndesSC, getCfemSC, getAnpSC, getQueimadasSC, getBolsaAtletaSC, getVitaisSC, getAnsCoberturaSC, getEquipamentosEsporteSC, getCagedSC, getRaisSC, getCasamentoEmpregoSC, getProdesSC, getDesastresSC, getSinisaSC, getSinanDengueSC, getAneelGdSC, getAnatelBlSC, getFrotaSC, getIbamaAutosSC, getSinespSC, getIncraAssentamentosSC, getPronafSC, getIcmbioUcSC, getAnaOutorgasSC, getIbgeProducaoSC, getArbovirosesSC, getDatatranSC, getAnpVendasSC, getCapagSC, getRfbArrecadacaoSC, getSimSC, getSinascSC, getSihSC, getIgdmSC } from "@/lib/queries";
import { BaixarCsv } from "./baixar-csv";
import { Landmark, Mountain, Fuel, Flame, Medal, HeartPulse, ShieldPlus, MapPin, Briefcase, Users, GitMerge, Trees, AlertTriangle, Droplets, Bug, Sun, Wifi, Car, Gavel, Shield, Sprout, TreePine, Waves, Wheat, Building2, TriangleAlert, Gauge, Activity, Baby, Database } from "lucide-react";

type Un<T> = NonNullable<Awaited<T>>;
const brl = (v: number) => (v >= 1e9 ? `R$ ${(v / 1e9).toFixed(2)} bi` : v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)} mi` : v >= 1e3 ? `R$ ${(v / 1e3).toFixed(0)} mil` : `R$ ${v}`);
const n0 = (v: number) => v.toLocaleString("pt-BR");
type Row = Record<string, unknown>;

function Spark({ pts, cor = "#0d9488" }: { pts: number[]; cor?: string }) {
  if (pts.length < 2) return null;
  const mx = Math.max(...pts, 1), mn = Math.min(...pts, 0); const W = 180, H = 30;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - mn) / (mx - mn || 1)) * H}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-full" preserveAspectRatio="none"><polyline points={d} fill="none" stroke={cor} strokeWidth="1.5" /></svg>;
}

function Fonte({ children, extraido }: { children: React.ReactNode; extraido: string | null }) {
  return <p className="mt-2 text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database aria-hidden className="h-3 w-3" /> Dado oficial</span>{children}{extraido && <> · <span className="text-slate-400">extraído em {extraido}</span></>}</p>;
}

const Card = ({ icon, titulo, cor, csv, children }: { icon: React.ReactNode; titulo: string; cor: string; csv?: React.ReactNode; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: cor }}>{icon} {titulo}</h3>
      {csv}
    </div>
    {children}
  </section>
);

export function BndesPanel({ d }: { d: Un<ReturnType<typeof getBndesSC>> }) {
  return (
    <Card icon={<Landmark className="h-4 w-4" />} titulo="BNDES — crédito produtivo desembolsado" cor="#1d4ed8"
      csv={<BaixarCsv nome="bndes-desembolsos" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Desembolso (R$)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Total (2010+)</div><div className="font-display text-2xl font-bold tabular-nums text-blue-700">{brl(d.total)}</div></div>
        <div><div className="text-[11px] text-slate-500">{d.ultimoAno}</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{brl(d.ultimoValor)}</div></div>
        <div className="ml-auto w-44"><Spark pts={d.serie.map((s) => s.valor)} cor="#1d4ed8" /></div>
      </div>
      {d.topSetores.length > 0 && <div className="mt-2 text-[12px] text-slate-600">Setores {d.ultimoAno}: {d.topSetores.map((s) => `${s.setor} (${brl(s.valor)})`).join(" · ")}</div>}
      <Fonte extraido={d.extraido}>Fonte: <b>BNDES</b> — desembolsos por município (dados abertos). Série 2010-{d.ultimoAno}.</Fonte>
    </Card>
  );
}

export function CfemPanel({ d }: { d: Un<ReturnType<typeof getCfemSC>> }) {
  return (
    <Card icon={<Mountain className="h-4 w-4" />} titulo="CFEM — royalties de mineração" cor="#b45309"
      csv={<BaixarCsv nome="cfem-royalties" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Royalty CFEM (R$)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Total recebido</div><div className="font-display text-2xl font-bold tabular-nums text-amber-700">{brl(d.total)}</div></div>
        <div className="ml-auto w-44"><Spark pts={d.serie.map((s) => s.valor)} cor="#b45309" /></div>
      </div>
      {d.topSubstancias.length > 0 && <div className="mt-2 text-[12px] text-slate-600">Substâncias: {d.topSubstancias.map((s) => s.substancia).join(" · ")}</div>}
      <Fonte extraido={d.extraido}>Fonte: <b>ANM</b> — distribuição da CFEM por município. Série até {d.ultimoAno} (distribuição pública encerra em 2020).</Fonte>
    </Card>
  );
}

export function AnpPanel({ d }: { d: Un<ReturnType<typeof getAnpSC>> }) {
  return (
    <Card icon={<Fuel className="h-4 w-4" />} titulo="ANP — preço de combustíveis" cor="#be123c"
      csv={<BaixarCsv nome="anp-precos" label="CSV" linhas={d.precos as unknown as Row[]} colunas={[{ chave: "produto", rotulo: "Produto" }, { chave: "preco", rotulo: "Preço médio (R$)" }]} />}>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {d.precos.map((p) => <div key={p.produto}><span className="text-[11px] text-slate-500">{p.produto}</span><div className="font-display text-base font-bold tabular-nums text-rose-700">R$ {p.preco.toFixed(3)}</div></div>)}
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>ANP</b> — levantamento de preços de revenda. Referência {d.semestre}º sem/{d.ano} (município pesquisado pela ANP).</Fonte>
    </Card>
  );
}

export function QueimadasPanel({ d }: { d: Un<ReturnType<typeof getQueimadasSC>> }) {
  return (
    <Card icon={<Flame className="h-4 w-4" />} titulo="Focos de calor (queimadas)" cor="#c2410c"
      csv={<BaixarCsv nome="inpe-focos" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Focos" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Focos {d.ultimoAno}</div><div className="font-display text-2xl font-bold tabular-nums text-orange-700">{n0(d.ultimoFocos)}</div></div>
        {d.bioma && <div><div className="text-[11px] text-slate-500">Bioma</div><div className="font-display text-base font-bold text-slate-700">{d.bioma}</div></div>}
        <div className="ml-auto w-44"><Spark pts={d.serie.map((s) => s.valor)} cor="#c2410c" /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>INPE</b> — BDQueimadas (focos por satélite). Série mensal agregada por ano.</Fonte>
    </Card>
  );
}

export function IgdmPanel({ d }: { d: Un<ReturnType<typeof getIgdmSC>> }) {
  const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);
  const cor = d.igdm == null ? "#94a3b8" : d.igdm >= 0.55 ? "#16a34a" : d.igdm >= 0.3 ? "#f97316" : "#dc2626";
  return (
    <Card icon={<Gauge className="h-4 w-4" />} titulo="Gestão do Bolsa Família / CadÚnico — IGD-M (MDS)" cor={cor}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Índice IGD-M</div><div className="font-display text-2xl font-bold tabular-nums" style={{ color: cor }}>{d.igdm == null ? "—" : d.igdm.toLocaleString("pt-BR")}</div><div className="text-[10px] text-slate-400">0 a 1 · quanto maior, melhor a gestão</div></div>
        <div><div className="text-[11px] text-slate-500">Freq. escolar</div><div className="font-display text-base font-bold tabular-nums text-slate-700">{pct(d.freqEscolar)}</div></div>
        <div><div className="text-[11px] text-slate-500">Agenda de saúde</div><div className="font-display text-base font-bold tabular-nums text-slate-700">{pct(d.agendaSaude)}</div></div>
        <div><div className="text-[11px] text-slate-500">Atualização cadastral</div><div className="font-display text-base font-bold tabular-nums text-slate-700">{pct(d.atualCadastral)}</div></div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">O IGD-M mede a qualidade da gestão do PBF/CadÚnico (condicionalidades). Índice baixo reduz o repasse federal de apoio à gestão — <b>risco de recurso na mesa</b>.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>MDS</b> — Índice de Gestão Descentralizada Municipal (IGD-M), via Matriz de Informações Sociais (SAGI). Ref. {d.anomes}.</Fonte>
    </Card>
  );
}

export function SihPanel({ d }: { d: Un<ReturnType<typeof getSihSC>> }) {
  return (
    <Card icon={<HeartPulse className="h-4 w-4" />} titulo="Internações hospitalares SUS (DATASUS/SIH)" cor="#0d9488"
      csv={<BaixarCsv nome="sih-internacoes" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Internações" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Internações {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-teal-700">{n0(d.internacoes)}</div></div>
        <div><div className="text-[11px] text-slate-500">Valor pago (SUS)</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{brl(d.valorTotal)}</div></div>
        <div><div className="text-[11px] text-slate-500">Óbitos hospitalares</div><div className="font-display text-base font-bold tabular-nums text-rose-700">{n0(d.obitosHosp)}</div></div>
        {d.serie.length > 1 && <div className="ml-auto w-36"><Spark pts={d.serie.map((s) => s.valor)} cor="#0d9488" /></div>}
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>DATASUS / SIH-SUS</b> (Sistema de Informações Hospitalares) — internações pagas pelo SUS por município de residência. Descompactado do formato DBC oficial.</Fonte>
    </Card>
  );
}

export function SinascPanel({ d }: { d: Un<ReturnType<typeof getSinascSC>> }) {
  const pct = (v: number) => d.nascimentos > 0 ? `${((v / d.nascimentos) * 100).toFixed(1)}%` : "—";
  return (
    <Card icon={<Baby className="h-4 w-4" />} titulo="Nascimentos (DATASUS/SINASC)" cor="#0891b2"
      csv={<BaixarCsv nome="sinasc-nascimentos" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Nascimentos" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Nascimentos {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-cyan-700">{n0(d.nascimentos)}</div></div>
        <div><div className="text-[11px] text-slate-500">Pré-natal 7+ consultas</div><div className="font-display text-base font-bold tabular-nums text-emerald-700">{pct(d.prenatal7)}</div></div>
        <div><div className="text-[11px] text-slate-500">Baixo peso</div><div className="font-display text-base font-bold tabular-nums text-slate-600">{pct(d.baixoPeso)}</div></div>
        <div><div className="text-[11px] text-slate-500">Prematuros</div><div className="font-display text-base font-bold tabular-nums text-slate-600">{pct(d.prematuros)}</div></div>
        <div><div className="text-[11px] text-slate-500">Mães adolescentes</div><div className="font-display text-base font-bold tabular-nums text-amber-700">{pct(d.maeAdolescente)}</div></div>
        <div className="ml-auto w-36"><Spark pts={d.serie.map((s) => s.valor)} cor="#0891b2" /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>DATASUS / SINASC</b> (Sistema de Informações sobre Nascidos Vivos) — nascimentos por município de residência da mãe. Descompactado do formato DBC oficial.</Fonte>
    </Card>
  );
}

export function SimPanel({ d }: { d: Un<ReturnType<typeof getSimSC>> }) {
  const grupos = [{ k: "Ap. circulatório", v: d.circulatorio, c: "#dc2626" }, { k: "Neoplasias", v: d.neoplasias, c: "#9333ea" }, { k: "Causas externas", v: d.causasExternas, c: "#ea580c" }].filter((x) => x.v > 0);
  return (
    <Card icon={<Activity className="h-4 w-4" />} titulo="Mortalidade (DATASUS/SIM)" cor="#334155"
      csv={<BaixarCsv nome="sim-obitos" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Óbitos" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Óbitos {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-slate-700">{n0(d.obitos)}</div></div>
        <div><div className="text-[11px] text-slate-500">Mortalidade infantil</div><div className="font-display text-lg font-bold tabular-nums text-rose-700">{n0(d.infantil)}</div><div className="text-[10px] text-slate-400">óbitos &lt; 1 ano</div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">óbitos por ano (pico=COVID)</div><Spark pts={d.serie.map((s) => s.valor)} cor="#334155" /></div>
      </div>
      {grupos.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{grupos.map((g) => <span key={g.k} className="rounded-full px-2.5 py-0.5 text-[11px] text-white" style={{ backgroundColor: g.c }}>{g.k}: <b>{n0(g.v)}</b></span>)}</div>}
      <Fonte extraido={d.extraido}>Fonte: <b>DATASUS / SIM</b> (Sistema de Informações sobre Mortalidade) — óbitos por município de residência e causa (CID-10). Descompactado do formato DBC oficial.</Fonte>
    </Card>
  );
}

export function RfbArrecadacaoPanel({ d }: { d: Un<ReturnType<typeof getRfbArrecadacaoSC>> }) {
  return (
    <Card icon={<Landmark className="h-4 w-4" />} titulo="Arrecadação federal (Receita Federal)" cor="#1d4ed8"
      csv={<BaixarCsv nome="rfb-arrecadacao" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Arrecadação total (R$)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Arrecadação federal {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-blue-700">{brl(d.total)}</div><div className="text-[10px] text-slate-400">IR, IPI, PIS/COFINS, previdenciária — base tributária do município</div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">arrecadação por ano</div><Spark pts={d.serie.map((s) => s.valor)} cor="#1d4ed8" /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>Receita Federal</b> — arrecadação das receitas administradas pela RFB por município (dados abertos). Reflete a atividade econômica local (empresas domiciliadas).</Fonte>
    </Card>
  );
}

export function AnpVendasPanel({ d }: { d: Un<ReturnType<typeof getAnpVendasSC>> }) {
  const milhoes = (l: number) => `${(l / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi L`;
  return (
    <Card icon={<Fuel className="h-4 w-4" />} titulo="Venda de combustíveis (ANP)" cor="#b45309"
      csv={<BaixarCsv nome="anp-vendas" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Vendas totais (litros)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Combustíveis vendidos {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-amber-700">{milhoes(d.serie[d.serie.length - 1]?.valor || 0)}</div><div className="text-[10px] text-slate-400">consumo local — proxy de economia/frota</div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">total por ano</div><Spark pts={d.serie.map((s) => s.valor)} cor="#b45309" /></div>
      </div>
      {d.produtos.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{d.produtos.map((p) => <span key={p.produto} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] text-amber-800">{p.produto}: <b>{milhoes(p.litros)}</b></span>)}</div>}
      <Fonte extraido={d.extraido}>Fonte: <b>ANP</b> — vendas de derivados de petróleo e etanol por município (dados abertos). Série anual desde 1990.</Fonte>
    </Card>
  );
}

export function CapagPanel({ d }: { d: Un<ReturnType<typeof getCapagSC>> }) {
  const cor: Record<string, string> = { A: "#16a34a", B: "#65a30d", C: "#f97316", D: "#dc2626" };
  const desc: Record<string, string> = { A: "boa — apta a crédito com garantia da União", B: "boa — apta a crédito com garantia da União", C: "restrita — não apta a nova garantia", D: "crítica — não apta a nova garantia" };
  const Ind = ({ t, v, n }: { t: string; v: number | null; n: string }) => <div><div className="text-[11px] text-slate-500">{t}</div><div className="flex items-center gap-1.5"><span className="font-display text-base font-bold tabular-nums text-slate-700">{v == null ? "—" : v.toLocaleString("pt-BR")}</span>{n && <span className="rounded px-1.5 text-[10px] font-bold text-white" style={{ backgroundColor: cor[n] || "#94a3b8" }}>{n}</span>}</div></div>;
  return (
    <Card icon={<Gauge className="h-4 w-4" />} titulo="CAPAG — capacidade de pagamento (Tesouro)" cor={cor[d.nota] || "#334155"}>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2"><span className="flex h-11 w-11 items-center justify-center rounded-xl font-display text-2xl font-bold text-white" style={{ backgroundColor: cor[d.nota] || "#334155" }}>{d.nota}</span><div className="text-[12px] text-slate-600 max-w-[180px]">Nota <b>{d.nota}</b> — {desc[d.nota] || ""}</div></div>
        <div className="ml-auto flex flex-wrap gap-4"><Ind t="Endividamento (DC/RCL)" v={d.endividamento} n={d.endivNota} /><Ind t="Poupança corrente" v={d.poupanca} n={d.poupNota} /><Ind t="Liquidez" v={d.liquidez} n={d.liqNota} /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>STN / Tesouro Nacional</b> — CAPAG (Capacidade de Pagamento). Nota A/B habilita o município a contratar crédito com garantia da União; C/D não. Combina 3 indicadores.</Fonte>
    </Card>
  );
}

export function IbgeProducaoPanel({ d }: { d: Un<ReturnType<typeof getIbgeProducaoSC>> }) {
  const rebanhos = [{ k: "Aves", v: d.aves }, { k: "Suínos", v: d.suino }, { k: "Bovinos", v: d.bovino }].filter((x) => x.v > 0);
  return (
    <Card icon={<Wheat className="h-4 w-4" />} titulo="Produção agropecuária (IBGE PAM/PPM)" cor="#a16207"
      csv={<BaixarCsv nome="ibge-producao" label="CSV" linhas={[{ ind: "VBP agrícola (R$)", valor: d.vbpAgricola }, { ind: "Área colhida (ha)", valor: d.areaColhida }, { ind: "Efetivo aves", valor: d.aves }, { ind: "Efetivo suínos", valor: d.suino }, { ind: "Efetivo bovinos", valor: d.bovino }] as unknown as Row[]} colunas={[{ chave: "ind", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Valor da produção agrícola {d.pamAno}</div><div className="font-display text-2xl font-bold tabular-nums text-yellow-700">{brl(d.vbpAgricola)}</div><div className="text-[10px] text-slate-400">{n0(d.areaColhida)} ha colhidos</div></div>
      </div>
      {rebanhos.length > 0 && <div className="mt-2"><div className="text-[11px] text-slate-500 mb-1">Efetivo dos rebanhos ({d.ppmAno}):</div><div className="flex flex-wrap gap-1.5">{rebanhos.map((r) => <span key={r.k} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] text-amber-800">{r.k}: <b>{n0(r.v)}</b></span>)}</div></div>}
      <Fonte extraido={d.extraido}>Fonte: <b>IBGE</b> — Produção Agrícola Municipal (PAM) e Pecuária Municipal (PPM), via SIDRA. Valor bruto da produção + efetivo de rebanhos.</Fonte>
    </Card>
  );
}

export function IbgeCemprePanel({ d }: { d: Un<ReturnType<typeof getIbgeProducaoSC>> }) {
  return (
    <Card icon={<Building2 className="h-4 w-4" />} titulo="Empresas e emprego (IBGE CEMPRE)" cor="#4338ca">
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Empresas ativas {d.cempreAno}</div><div className="font-display text-2xl font-bold tabular-nums text-indigo-700">{n0(d.nEmpresas)}</div></div>
        <div><div className="text-[11px] text-slate-500">Pessoal ocupado</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{n0(d.pessoalOcupado)}</div></div>
        {d.salarioSm > 0 && <div><div className="text-[11px] text-slate-500">Salário médio</div><div className="font-display text-base font-bold tabular-nums text-slate-600">{d.salarioSm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} SM</div></div>}
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>IBGE</b> — CEMPRE (Cadastro Central de Empresas), via SIDRA. Unidades locais ativas, pessoal ocupado e salário médio (complementa a RAIS com o universo de empresas).</Fonte>
    </Card>
  );
}

export function PronafPanel({ d }: { d: Un<ReturnType<typeof getPronafSC>> }) {
  return (
    <Card icon={<Sprout className="h-4 w-4" />} titulo="PRONAF — crédito da agricultura familiar" cor="#16a34a"
      csv={<BaixarCsv nome="pronaf-credito" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Crédito contratado (R$)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Contratado {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-green-700">{brl(d.total)}</div></div>
        <div><div className="text-[11px] text-slate-500">Custeio</div><div className="font-display text-base font-bold tabular-nums text-slate-600">{brl(d.custeio)}</div></div>
        <div><div className="text-[11px] text-slate-500">Investimento</div><div className="font-display text-base font-bold tabular-nums text-slate-600">{brl(d.investimento)}</div></div>
        <div className="ml-auto w-40"><div className="text-[10px] text-slate-400">crédito por ano</div><Spark pts={d.serie.map((s) => s.valor)} cor="#16a34a" /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>BCB</b> — SICOR (Sistema de Operações do Crédito Rural), programa PRONAF por município. Valor contratado (custeio + investimento).</Fonte>
    </Card>
  );
}

export function IncraAssentamentosPanel({ d }: { d: Un<ReturnType<typeof getIncraAssentamentosSC>> }) {
  return (
    <Card icon={<Sprout className="h-4 w-4" />} titulo="Reforma agrária — assentamentos (INCRA)" cor="#65a30d"
      csv={<BaixarCsv nome="incra-assentamentos" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Assentamentos (acum.)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Assentamentos</div><div className="font-display text-2xl font-bold tabular-nums text-lime-700">{n0(d.nAssentamentos)}</div></div>
        <div><div className="text-[11px] text-slate-500">Famílias assentadas</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{n0(d.familias)}</div></div>
        <div><div className="text-[11px] text-slate-500">Área</div><div className="font-display text-base font-bold tabular-nums text-slate-600">{n0(d.areaHa)} ha</div></div>
        {d.serie.length > 1 && <div className="ml-auto w-40"><Spark pts={d.serie.map((s) => s.valor)} cor="#65a30d" /></div>}
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>INCRA</b> / MDA (SIPRA) — projetos de assentamento da reforma agrária por município. Série pelo ano de criação (acumulada).</Fonte>
    </Card>
  );
}

export function SinespPanel({ d }: { d: Un<ReturnType<typeof getSinespSC>> }) {
  return (
    <Card icon={<Shield className="h-4 w-4" />} titulo="Segurança pública — vítimas de crimes violentos letais (SINESP)" cor="#334155"
      csv={<BaixarCsv nome="sinesp-vitimas" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Vítimas" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Vítimas {d.anoIni}-{d.anoFim}</div><div className="font-display text-2xl font-bold tabular-nums text-slate-700">{n0(d.total)}</div><div className="text-[10px] text-slate-400">homicídio doloso, latrocínio, lesão seguida de morte, feminicídio</div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">vítimas por ano</div><Spark pts={d.serie.map((s) => s.valor)} cor="#334155" /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>SINESP</b> / Ministério da Justiça e Segurança Pública — Dados Nacionais de Segurança Pública (dados abertos, consolidados pelos gestores estaduais). Indicador de letalidade violenta por município.</Fonte>
    </Card>
  );
}

export function AnaOutorgasPanel({ d }: { d: Un<ReturnType<typeof getAnaOutorgasSC>> }) {
  return (
    <Card icon={<Waves className="h-4 w-4" />} titulo="Uso da água — outorgas (ANA)" cor="#0e7490"
      csv={<BaixarCsv nome="ana-outorgas-serie" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Outorgas (acum.)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Outorgas de uso da água</div><div className="font-display text-2xl font-bold tabular-nums text-cyan-700">{n0(d.nOutorgas)}</div><div className="text-[10px] text-slate-400">{n0(d.nSuperficial)} superficiais · {n0(d.nSubterranea)} subterrâneas</div></div>
        {d.serie.length > 1 && <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">outorgas acum. por ano</div><Spark pts={d.serie.map((s) => s.valor)} cor="#0e7490" /></div>}
      </div>
      {d.porFinalidade.length > 0 && <div className="mt-2"><div className="text-[11px] text-slate-500 mb-1">Finalidade predominante:</div><div className="flex flex-wrap gap-1.5">{d.porFinalidade.map((f) => <span key={f.finalidade} className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-[11px] text-cyan-700">{f.finalidade}: <b>{n0(f.n)}</b></span>)}</div></div>}
      <Fonte extraido={d.extraido}>Fonte: <b>ANA</b> — outorgas de direito de uso de recursos hídricos por município (federal + estadual, superficial + subterrânea). Revela a vocação de uso da água (irrigação, criação animal, abastecimento, indústria).</Fonte>
    </Card>
  );
}

export function IcmbioUcPanel({ d }: { d: Un<ReturnType<typeof getIcmbioUcSC>> }) {
  return (
    <Card icon={<TreePine className="h-4 w-4" />} titulo="Áreas protegidas — unidades de conservação (CNUC)" cor="#047857">
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Território protegido</div><div className="font-display text-2xl font-bold tabular-nums text-emerald-700">{d.pctTerritorio.toLocaleString("pt-BR")}%</div><div className="text-[10px] text-slate-400">{n0(d.areaHa)} ha em {d.nUcs} unidade{d.nUcs > 1 ? "s" : ""}</div></div>
        {d.maiorUc && <div className="max-w-[60%]"><div className="text-[11px] text-slate-500">Maior UC</div><div className="text-[13px] font-semibold text-slate-700">{d.maiorUc}</div></div>}
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>MMA / CNUC</b> (Cadastro Nacional de Unidades de Conservação) — área calculada por interseção geoespacial (PostGIS) das UCs com o território municipal. Federal + estadual + municipal.</Fonte>
    </Card>
  );
}

export function IbamaAutosPanel({ d }: { d: Un<ReturnType<typeof getIbamaAutosSC>> }) {
  return (
    <Card icon={<Gavel className="h-4 w-4" />} titulo="Fiscalização ambiental (IBAMA — autos de infração)" cor="#15803d"
      csv={<BaixarCsv nome="ibama-autos" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Autos de infração" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Autos de infração</div><div className="font-display text-2xl font-bold tabular-nums text-green-700">{n0(d.nAutos)}</div><div className="text-[10px] text-slate-400">{d.nRecentes} nos últimos 10 anos</div></div>
        <div><div className="text-[11px] text-slate-500">Multas aplicadas</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{brl(d.valorMi * 1e6)}</div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">autos por ano</div><Spark pts={d.serie.map((s) => s.valor)} cor="#15803d" /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>IBAMA</b> — autos de infração ambiental por município (dados abertos). Valor autuado (não necessariamente arrecadado).</Fonte>
    </Card>
  );
}

export function FrotaPanel({ d }: { d: Un<ReturnType<typeof getFrotaSC>> }) {
  return (
    <Card icon={<Car className="h-4 w-4" />} titulo="Frota de veículos (SENATRAN)" cor="#0f766e"
      csv={<BaixarCsv nome="frota-veiculos" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Frota total" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Frota total {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-teal-700">{n0(d.total)}</div></div>
        <div><div className="text-[11px] text-slate-500">Automóveis</div><div className="font-display text-base font-bold tabular-nums text-slate-600">{n0(d.automovel)}</div></div>
        <div><div className="text-[11px] text-slate-500">Motocicletas</div><div className="font-display text-base font-bold tabular-nums text-slate-600">{n0(d.motocicleta)}</div></div>
        <div><div className="text-[11px] text-slate-500">Outros</div><div className="font-display text-base font-bold tabular-nums text-slate-600">{n0(Math.max(0, d.total - d.automovel - d.motocicleta))}</div></div>
        {d.serie.length > 1 && <div className="ml-auto w-40"><Spark pts={d.serie.map((s) => s.valor)} cor="#0f766e" /></div>}
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>SENATRAN</b> / Ministério dos Transportes — frota por município e tipo (RENAVAM), dez/{d.ano}. <b>Total</b> = todos os tipos; <b>Outros</b> = caminhões, caminhonetes, camionetas, ônibus, tratores, reboques etc.</Fonte>
    </Card>
  );
}

export function AnatelBlPanel({ d }: { d: Un<ReturnType<typeof getAnatelBlSC>> }) {
  return (
    <Card icon={<Wifi className="h-4 w-4" />} titulo="Banda larga fixa (ANATEL)" cor="#7c3aed"
      csv={<BaixarCsv nome="anatel-banda-larga" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Acessos (assinaturas)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Acessos {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-violet-700">{n0(d.acessos)}</div><div className="text-[10px] text-slate-400">assinaturas de banda larga fixa</div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">acessos por ano</div><Spark pts={d.serie.map((s) => s.valor)} cor="#7c3aed" /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>ANATEL</b> — Acessos de Banda Larga Fixa (SCM) por município (dados abertos). Série anual pelo estoque de dezembro.</Fonte>
    </Card>
  );
}

export function AneelGdPanel({ d }: { d: Un<ReturnType<typeof getAneelGdSC>> }) {
  return (
    <Card icon={<Sun className="h-4 w-4" />} titulo="Geração distribuída de energia (ANEEL)" cor="#ca8a04"
      csv={<BaixarCsv nome="aneel-gd" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Potência acum. (MW)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Potência instalada</div><div className="font-display text-2xl font-bold tabular-nums text-yellow-600">{d.potenciaMw.toLocaleString("pt-BR")} MW</div><div className="text-[10px] text-slate-400">{n0(d.nEmpreend)} unidades geradoras</div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">MW acumulado (por ano)</div><Spark pts={d.serie.map((s) => s.valor)} cor="#ca8a04" /></div>
      </div>
      {d.topFontes.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{d.topFontes.map((f) => <span key={f.fonte} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] text-amber-700">{f.fonte}: <b>{n0(f.n)}</b></span>)}</div>}
      <Fonte extraido={d.extraido}>Fonte: <b>ANEEL</b> — Relação de Empreendimentos de Geração Distribuída (dados abertos). Micro/minigeração por município. Série pelo ano de cadastro (proxy de entrada em operação).</Fonte>
    </Card>
  );
}

export function ArbovirosesPanel({ d }: { d: Un<ReturnType<typeof getArbovirosesSC>> }) {
  const NIVEL = ["#cbd5e1", "#16a34a", "#eab308", "#f97316", "#dc2626"]; const NIVEL_TXT = ["—", "baixo", "atenção", "alerta", "epidemia"];
  const nv = Math.min(4, Math.max(0, d.dengueNivel));
  return (
    <Card icon={<Bug className="h-4 w-4" />} titulo="Arboviroses — dengue, zika e chikungunya (SINAN)" cor="#be123c"
      csv={<BaixarCsv nome="dengue-casos" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Casos de dengue" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Dengue {d.dengueAno}</div><div className="font-display text-2xl font-bold tabular-nums text-rose-700">{n0(d.dengueCasos)}</div>{d.dengueIncidencia != null && <div className="text-[10px] text-slate-400">{d.dengueIncidencia.toLocaleString("pt-BR")} / 100 mil hab.</div>}</div>
        <div><div className="text-[11px] text-slate-500">Nível máx.</div><div className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: NIVEL[nv] }} /><span className="font-display text-sm font-bold text-slate-700">{NIVEL_TXT[nv]}</span></div></div>
        <div><div className="text-[11px] text-slate-500">Zika (acum.)</div><div className="font-display text-base font-bold tabular-nums text-slate-600">{n0(d.zika)}</div></div>
        <div><div className="text-[11px] text-slate-500">Chikungunya (acum.)</div><div className="font-display text-base font-bold tabular-nums text-slate-600">{n0(d.chik)}</div></div>
        <div className="ml-auto w-40"><div className="text-[10px] text-slate-400">dengue por ano</div><Spark pts={d.serie.map((s) => s.valor)} cor="#be123c" /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>InfoDengue</b> (Fiocruz/FGV) — casos das 3 arboviroses notificados ao <b>SINAN</b>, por semana epidemiológica, agregados por ano.</Fonte>
    </Card>
  );
}

export function DatatranPanel({ d }: { d: Un<ReturnType<typeof getDatatranSC>> }) {
  return (
    <Card icon={<TriangleAlert className="h-4 w-4" />} titulo="Acidentes em rodovias federais (PRF/DATATRAN)" cor="#c2410c"
      csv={<BaixarCsv nome="datatran-acidentes" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Acidentes" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Acidentes {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-orange-700">{n0(d.nAcidentes)}</div><div className="text-[10px] text-slate-400">{n0(d.mortos)} mortos · {n0(d.feridos)} feridos</div></div>
        <div><div className="text-[11px] text-slate-500">Mortos (2015+)</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{n0(d.totalMortos)}</div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">acidentes por ano</div><Spark pts={d.serie.map((s) => s.valor)} cor="#c2410c" /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>PRF</b> — DATATRAN, acidentes em rodovias federais (BRs) por município. Só trechos federais (não inclui vias estaduais/municipais).</Fonte>
    </Card>
  );
}

export function SinanDenguePanel({ d }: { d: Un<ReturnType<typeof getSinanDengueSC>> }) {
  const NIVEL = ["#cbd5e1", "#16a34a", "#eab308", "#f97316", "#dc2626"]; // 0..4: verde/amarelo/laranja/vermelho
  const NIVEL_TXT = ["—", "baixo", "atenção", "alerta", "epidemia"];
  const nv = Math.min(4, Math.max(0, d.nivelMax));
  return (
    <Card icon={<Bug className="h-4 w-4" />} titulo="Dengue (arboviroses — notificações SINAN)" cor="#be123c"
      csv={<BaixarCsv nome="dengue-casos" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Casos notificados" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Casos {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-rose-700">{n0(d.casos)}</div>{d.incidencia != null && <div className="text-[10px] text-slate-400">{d.incidencia.toLocaleString("pt-BR")} / 100 mil hab.</div>}</div>
        <div><div className="text-[11px] text-slate-500">Nível máximo</div><div className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: NIVEL[nv] }} /><span className="font-display text-base font-bold text-slate-700">{NIVEL_TXT[nv]}</span></div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">casos por ano</div><Spark pts={d.serie.map((s) => s.valor)} cor="#be123c" /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>InfoDengue</b> (Fiocruz/FGV) — casos de dengue notificados ao <b>SINAN</b> por semana epidemiológica, agregados por ano. Nível de alerta (verde→vermelho) do modelo InfoDengue.</Fonte>
    </Card>
  );
}

export function SinisaPanel({ d }: { d: Un<ReturnType<typeof getSinisaSC>> }) {
  const csv = [...d.serieAgua.map((s) => ({ ano: s.ano, indicador: "Água (%)", valor: s.valor })), ...d.serieEsgoto.map((s) => ({ ano: s.ano, indicador: "Esgoto (%)", valor: s.valor }))].sort((a, b) => a.ano - b.ano);
  const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
  return (
    <Card icon={<Droplets className="h-4 w-4" />} titulo="Saneamento — SINISA (sucessor do SNIS)" cor="#0369a1"
      csv={<BaixarCsv nome="sinisa-saneamento" label="CSV" linhas={csv as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Atendimento (%)" }]} />}>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3">
          <div className="text-[11px] text-slate-500">Água (rede)</div><div className="font-display text-2xl font-bold tabular-nums text-sky-700">{pct(d.agua)}</div>
          {d.serieAgua.length > 1 && <div className="mt-1"><Spark pts={d.serieAgua.map((s) => s.valor)} cor="#0284c7" /></div>}
        </div>
        <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3">
          <div className="text-[11px] text-slate-500">Esgoto (coleta)</div><div className="font-display text-2xl font-bold tabular-nums text-teal-700">{pct(d.esgoto)}</div>
          {d.serieEsgoto.length > 1 && <div className="mt-1"><Spark pts={d.serieEsgoto.map((s) => s.valor)} cor="#0d9488" /></div>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="text-[11px] text-slate-500">Coleta de resíduos</div><div className="font-display text-2xl font-bold tabular-nums text-slate-700">{pct(d.residuos)}</div>
          <div className="text-[10px] text-slate-400">só {d.ano} (SNIS-resíduos indisponível)</div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Atendimento da população por rede, ref. <b>{d.ano}</b>. A <b>série</b> (linha em água/esgoto) encadeia o histórico <b>SNIS 2015-2022</b> ao ponto <b>SINISA 2024</b> — o SINISA sucedeu o SNIS.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>SINISA</b> — Sistema Nacional de Informações em Saneamento (Ministério das Cidades), ref. {d.ano}. Série histórica: <b>SNIS</b> 2015-2022 (mesmo órgão).</Fonte>
    </Card>
  );
}

export function DesastresPanel({ d }: { d: Un<ReturnType<typeof getDesastresSC>> }) {
  return (
    <Card icon={<AlertTriangle className="h-4 w-4" />} titulo="Desastres registrados (S2ID)" cor="#b91c1c"
      csv={<BaixarCsv nome="desastres-serie" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Nº de desastres" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Desastres 1991-2025</div><div className="font-display text-2xl font-bold tabular-nums text-red-700">{n0(d.nDesastres)}</div><div className="text-[10px] text-slate-400">{d.nRecentes} nos últimos 10 anos · último em {d.anoUltimo}</div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">série anual (anuário)</div><Spark pts={d.serie.map((s) => s.valor)} cor="#b91c1c" /></div>
      </div>
      {d.topTipos.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{d.topTipos.map((t) => <span key={t.tipo} className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] text-red-700">{t.tipo}: <b>{t.n}</b></span>)}</div>}
      <p className="mt-2 text-[11px] text-slate-500">Mostra <b>o que</b> ameaça o município e <b>com que frequência</b> — o padrão de risco para a Defesa Civil. Danos humanos (mortos/afetados) não são exibidos: no S2ID são <b>autodeclarados pelos municípios, sem auditoria</b>, e apresentam inconsistências — reportá-los sob o nome das instituições-fonte seria impreciso.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>Atlas Digital de Desastres no Brasil</b> — dados oficiais do <b>S2ID / Sedec — Ministério da Integração e do Desenvolvimento Regional</b>, desenvolvido pelo <b>CEPED/UFSC</b> (cooperação com o Banco Mundial). Registros 1991-2025.</Fonte>
    </Card>
  );
}

export function ProdesPanel({ d }: { d: Un<ReturnType<typeof getProdesSC>> }) {
  return (
    <Card icon={<Trees className="h-4 w-4" />} titulo="Desmatamento (PRODES — Mata Atlântica)" cor="#15803d"
      csv={<BaixarCsv nome="prodes-desmatamento" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Área desmatada (km²)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Desmatado {d.ultimoAno}</div><div className="font-display text-2xl font-bold tabular-nums text-green-800">{d.ultimoArea.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km²</div></div>
        <div><div className="text-[11px] text-slate-500">Acumulado na série</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{d.total.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km²</div></div>
        <div className="ml-auto w-44"><Spark pts={d.serie.map((s) => s.valor)} cor="#15803d" /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>INPE — PRODES</b> (desmatamento Mata Atlântica). Área por município via interseção espacial (polígonos INPE × malha IBGE).</Fonte>
    </Card>
  );
}

export function BolsaAtletaPanel({ d }: { d: Un<ReturnType<typeof getBolsaAtletaSC>> }) {
  return (
    <Card icon={<Medal className="h-4 w-4" />} titulo="Bolsa Atleta" cor="#7c3aed"
      csv={<BaixarCsv nome="bolsa-atleta" label="CSV" linhas={[{ ano: d.ano, atletas: d.atletas, valor: d.valor }] as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "atletas", rotulo: "Atletas" }, { chave: "valor", rotulo: "Valor pago (R$)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Atletas {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-violet-700">{n0(d.atletas)}</div></div>
        <div><div className="text-[11px] text-slate-500">Valor pago</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{brl(d.valor)}</div></div>
      </div>
      {d.topModalidades.length > 0 && <div className="mt-2 text-[12px] text-slate-600">Modalidades: {d.topModalidades.map((m) => `${m.modalidade} (${m.n})`).join(" · ")}</div>}
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério do Esporte</b> — folha de pagamento Bolsa Atleta ({d.ano}).</Fonte>
    </Card>
  );
}

export function VitaisPanel({ d }: { d: Un<ReturnType<typeof getVitaisSC>> }) {
  const csvRows = d.serieNasc.map((s, i) => ({ ano: s.ano, nascidos: s.valor, obitos: d.serieObi[i]?.valor ?? "" }));
  return (
    <Card icon={<HeartPulse className="h-4 w-4" />} titulo="Estatísticas vitais — nascidos e óbitos" cor="#0f766e"
      csv={<BaixarCsv nome="estatisticas-vitais" label="CSV" linhas={csvRows as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "nascidos", rotulo: "Nascidos vivos" }, { chave: "obitos", rotulo: "Óbitos" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-5">
        <div><div className="text-[11px] text-slate-500">Nascidos {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-teal-700">{n0(d.nascidos)}</div><div className="w-32"><Spark pts={d.serieNasc.map((s) => s.valor)} cor="#0f766e" /></div></div>
        <div><div className="text-[11px] text-slate-500">Óbitos {d.ano}</div><div className="font-display text-2xl font-bold tabular-nums text-slate-700">{n0(d.obitos)}</div><div className="w-32"><Spark pts={d.serieObi.map((s) => s.valor)} cor="#64748b" /></div></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>IBGE</b> — Estatísticas do Registro Civil. Série 2003-{d.ano}.</Fonte>
    </Card>
  );
}

export function AnsCoberturaPanel({ d }: { d: Un<ReturnType<typeof getAnsCoberturaSC>> }) {
  const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const semPct = d.populacao > 0 ? (d.semPlano / d.populacao) * 100 : 0;
  return (
    <Card icon={<ShieldPlus className="h-4 w-4" />} titulo="ANS — cobertura de planos e pressão sobre o SUS" cor="#0369a1"
      csv={<BaixarCsv nome="ans-cobertura" label="CSV" linhas={[{ ano: d.ano, benef_medica: d.benefMedica, populacao: d.populacao, pop_ano: d.popAno, taxa_cobertura: d.taxa, sem_plano: d.semPlano }] as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano ANS" }, { chave: "benef_medica", rotulo: "Beneficiários (plano médico)" }, { chave: "populacao", rotulo: "População" }, { chave: "pop_ano", rotulo: "Ano população (IBGE)" }, { chave: "taxa_cobertura", rotulo: "Cobertura %" }, { chave: "sem_plano", rotulo: "Sem plano (dependem do SUS)" }]} />}>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3">
          <div className="text-[11px] text-slate-500">Com plano de saúde</div>
          <div className="font-display text-2xl font-bold tabular-nums text-sky-700">{pct(d.taxa)}</div>
          <div className="text-[10px] text-slate-400">{n0(d.benefMedica)} pessoas</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
          <div className="text-[11px] text-slate-500">Dependem 100% do SUS</div>
          <div className="font-display text-2xl font-bold tabular-nums text-rose-700">{pct(semPct)}</div>
          <div className="text-[10px] text-slate-400">{n0(d.semPlano)} pessoas</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="text-[11px] text-slate-500">Pressão latente</div>
          <div className="font-display text-base font-bold text-slate-700">se os {n0(d.benefMedica)} com plano o perderem, migram para o SUS</div>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-slate-600">A taxa de cobertura mede quantos têm plano privado. Quanto <b>menor</b> a cobertura, <b>maior</b> a dependência da rede pública — e quem tem plano é uma pressão latente sobre o SUS caso a economia piore e as pessoas percam a assistência suplementar.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>ANS</b> — beneficiários {d.ano} · população <b>IBGE (estimativa {d.popAno})</b>, casada ao ano da ANS. Cobertura = beneficiários ÷ população.</Fonte>
    </Card>
  );
}

export function CagedPanel({ d }: { d: Un<ReturnType<typeof getCagedSC>> }) {
  const pos = d.saldoAcum >= 0;
  return (
    <Card icon={<Briefcase className="h-4 w-4" />} titulo="CAGED — saldo de empregos formais" cor="#0f766e"
      csv={<BaixarCsv nome="caged-saldo-empregos" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "periodo", rotulo: "Mês" }, { chave: "saldo", rotulo: "Saldo (admissões − desligamentos)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Saldo acumulado</div><div className={`font-display text-2xl font-bold tabular-nums ${pos ? "text-emerald-700" : "text-rose-700"}`}>{pos ? "+" : ""}{n0(d.saldoAcum)}</div><div className="text-[10px] text-slate-400">empregos (até {d.ultimoMes})</div></div>
        <div><div className="text-[11px] text-slate-500">Admissões</div><div className="font-display text-base font-bold tabular-nums text-slate-700">{n0(d.admissoes)}</div></div>
        <div><div className="text-[11px] text-slate-500">Desligamentos</div><div className="font-display text-base font-bold tabular-nums text-slate-500">{n0(d.desligamentos)}</div></div>
        <div className="ml-auto w-44"><Spark pts={d.serie.map((s) => s.saldo)} cor={pos ? "#0f766e" : "#be123c"} /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>Novo CAGED</b> (Ministério do Trabalho e Emprego) — movimentações do emprego formal por município. Série mensal.</Fonte>
    </Card>
  );
}

export function RaisPanel({ d }: { d: Un<ReturnType<typeof getRaisSC>> }) {
  return (
    <Card icon={<Users className="h-4 w-4" />} titulo={`RAIS ${d.ano} — estoque de emprego formal`} cor="#0369a1"
      csv={<BaixarCsv nome="rais-setores" label="CSV" linhas={d.porSetor as unknown as Row[]} colunas={[{ chave: "setor", rotulo: "Setor" }, { chave: "n", rotulo: "Empregos" }]} />}>
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <div><div className="text-[11px] text-slate-500">Empregos formais</div><div className="font-display text-2xl font-bold tabular-nums text-sky-700">{n0(d.estoque)}</div><div className="text-[10px] text-slate-400" title="A RAIS conta vínculos: quem tem 2 empregos formais soma 2. Logo é maior que o nº de pessoas empregadas.">estoque de vínculos ativos em 31/dez — postos de trabalho, não pessoas</div></div>
        <div><div className="text-[11px] text-slate-500">Massa salarial/mês</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{brl(d.massaSalarial)}</div></div>
        <div><div className="text-[11px] text-slate-500">Remuneração média</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{brl(d.remunMedia)}</div></div>
        <div><div className="text-[11px] text-slate-500">Estabelecimentos</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{n0(d.estabelecimentos)}</div></div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {d.porSetor.map((s) => <span key={s.setor} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] text-sky-700">{s.setor}: <b>{n0(s.n)}</b></span>)}
      </div>
      {d.porPorte.length > 0 && <div className="mt-1 text-[12px] text-slate-500">Estabelecimentos por porte: {d.porPorte.map((p) => `${p.porte} (${n0(p.n)})`).join(" · ")}</div>}
      <Fonte extraido={d.extraido}>Fonte: <b>RAIS</b> (Ministério do Trabalho e Emprego) — censo anual do emprego formal, {d.ano}.</Fonte>
    </Card>
  );
}

export function CasamentoEmpregoPanel({ d }: { d: Un<ReturnType<typeof getCasamentoEmpregoSC>> }) {
  const cresceu = d.saldoCaged >= 0;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><GitMerge className="h-4 w-4 text-indigo-600" /> Emprego formal — casamento estoque (RAIS) × fluxo (CAGED)</h3>
        <BaixarCsv nome="casamento-emprego-rais-caged" label="CSV" linhas={[{ estoque_rais: d.estoqueRais, rais_ano: d.raisAno, saldo_caged: d.saldoCaged, caged_ate: d.ateMes, estoque_estimado: d.estoqueEstimado }] as unknown as Row[]} colunas={[{ chave: "estoque_rais", rotulo: "Estoque RAIS (vínculos)" }, { chave: "rais_ano", rotulo: "Ano RAIS" }, { chave: "saldo_caged", rotulo: "Saldo CAGED desde então" }, { chave: "caged_ate", rotulo: "CAGED até" }, { chave: "estoque_estimado", rotulo: "Estoque estimado (aprox.)" }]} />
      </div>
      <p className="mt-1 text-[12px] text-slate-600">A RAIS dá a <b>foto</b> (quantos vínculos formais ativos em 31/dez); o CAGED dá o <b>filme</b> (quanto entrou/saiu desde então). Somando, estima-se o emprego atual. Unidade: <b>vínculos/postos de trabalho</b> (não pessoas) — ambas as fontes usam a mesma, então a soma é coerente.</p>

      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        <div className="flex-1 min-w-[150px] rounded-xl border border-sky-200 bg-sky-50/40 p-3">
          <div className="text-[11px] text-slate-500">Estoque RAIS (dez/{d.raisAno})</div>
          <div className="font-display text-2xl font-bold tabular-nums text-sky-700">{n0(d.estoqueRais)}</div>
          <div className="text-[10px] text-slate-400">dado oficial</div>
        </div>
        <div className="flex items-center text-xl font-bold text-slate-400">+</div>
        <div className="flex-1 min-w-[150px] rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="text-[11px] text-slate-500">Saldo CAGED (até {d.ateMes})</div>
          <div className={`font-display text-2xl font-bold tabular-nums ${cresceu ? "text-emerald-700" : "text-rose-700"}`}>{cresceu ? "+" : ""}{n0(d.saldoCaged)}</div>
          <div className="text-[10px] text-slate-400">dado oficial · {d.meses} meses</div>
        </div>
        <div className="flex items-center text-xl font-bold text-slate-400">=</div>
        <div className="flex-1 min-w-[150px] rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/40 p-3">
          <div className="text-[11px] text-slate-500">Estoque estimado hoje</div>
          <div className="font-display text-2xl font-bold tabular-nums text-indigo-700">≈ {n0(d.estoqueEstimado)}</div>
          <div className="text-[10px] font-semibold text-indigo-500">ESTIMATIVA (não oficial)</div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-[11px] text-slate-600">
        <b className="text-amber-700">⚠ Por que é estimativa, não conciliação exata:</b> RAIS e CAGED medem <b>universos diferentes</b> — a RAIS é a declaração anual de todos os vínculos formais; o CAGED capta movimentações CLT com regras próprias. Não fecham 100% (o MTE reconhece a diferença), e o erro <b>acumula</b> quanto mais longe da foto RAIS. Por isso o "≈" e o rótulo de estimativa. Os dois números-fonte (RAIS e CAGED) são oficiais; só a soma é aproximada.
      </div>
      <p className="mt-2 text-[11px] text-slate-500"><span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700"><Database aria-hidden className="h-3 w-3" /> Dados oficiais</span>Fontes: <b>RAIS</b> (estoque {d.raisAno}) + <b>Novo CAGED</b> (fluxo até {d.ateMes}) — ambos MTE. Soma = estimativa metodológica.{d.extraido && <> · extraído em {d.extraido}</>}</p>
    </section>
  );
}

export function EquipamentosEsportePanel({ d }: { d: Un<ReturnType<typeof getEquipamentosEsporteSC>> }) {
  return (
    <Card icon={<MapPin className="h-4 w-4" />} titulo="Equipamentos esportivos públicos" cor="#9333ea"
      csv={<BaixarCsv nome="equipamentos-esporte" label="CSV" linhas={d.porTipo as unknown as Row[]} colunas={[{ chave: "tipo", rotulo: "Tipo" }, { chave: "n", rotulo: "Quantidade" }]} />}>
      <div className="mt-2 flex items-end gap-3">
        <div><div className="text-[11px] text-slate-500">Total no território</div><div className="font-display text-2xl font-bold tabular-nums text-purple-700">{n0(d.total)}</div></div>
        <div className="text-[12px] text-slate-500">quadras, ginásios, campos, pistas e academias — <b>plotados no mapa</b> (aba Geolocalização, camada Esporte).</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {d.porTipo.map((t) => <span key={t.tipo} className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] text-purple-700">{t.tipo}: <b>{n0(t.n)}</b></span>)}
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>OpenStreetMap</b> — equipamentos esportivos georreferenciados (leisure=pitch/sports_centre/stadium/track/fitness).</Fonte>
    </Card>
  );
}
