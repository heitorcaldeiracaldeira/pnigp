// Painéis das novas fontes (eixos econômico/ambiental/social/saúde). Server components, compactos.
// Padrão: dado + série + carimbo de origem COM data de extração + CSV. (atende à diretriz de proveniência + exportação.)
import type { getBndesSC, getCfemSC, getAnpSC, getQueimadasSC, getBolsaAtletaSC, getVitaisSC, getAnsCoberturaSC, getEquipamentosEsporteSC, getCagedSC, getRaisSC, getCasamentoEmpregoSC, getProdesSC, getDesastresSC, getSinisaSC, getSinanDengueSC, getAneelGdSC, getAnatelBlSC, getFrotaSC, getIbamaAutosSC, getSinespSC, getIncraAssentamentosSC, getPronafSC, getIcmbioUcSC, getAnaOutorgasSC, getIbgeProducaoSC, getArbovirosesSC, getDatatranSC, getAnpVendasSC, getCapagSC, getRfbArrecadacaoSC, getSimSC, getSinascSC, getSihSC, getIgdmSC, getIbamaEmbargosSC, getQuilombosSC, getSiaProducaoSC, getMedicamentosSC, getSinanAgravosSC, getProfissionaisSaudeSC, getApacSC, getRaasSaudeMentalSC, getCoberturaVacinalSC, getSisaguaSC, getMortalidadeInfantilSC, getFarmaciaPopularSC, getFinanciamentoApsSC, getCoberturaApsSC, getProducaoApsSC, getIndicadoresApsSC, getDinheiroMesaApsSC, getQualidadeIndicadoresApsSC, getVinculoApsSC, getSuasSaldoSC, getPddeSaldoSC, getPnaeAgriSC, getBarragensSC, getPaaSC, getLpgSC, getSalicSC, getNovoPacSC, getCensoCorRacaSC, getPopulacaoFaixaSC, getPibMunicipalSC, getIdhmSC, getCemadenSC, getDomiciliosSC, getAlfabetizacaoSC, getSetoresSC, getMuseusSC } from "@/lib/queries";
import { BaixarCsv } from "./baixar-csv";
import MapaSetoresWrap from "./mapa-setores-wrap";
import { Landmark, Mountain, Fuel, Flame, Medal, HeartPulse, ShieldPlus, MapPin, Briefcase, Users, GitMerge, Trees, AlertTriangle, Droplets, Bug, Sun, Wifi, Car, Gavel, Shield, Sprout, TreePine, Waves, Wheat, Building2, TriangleAlert, Gauge, Activity, Baby, Ban, Home, Pill, ShieldAlert, Stethoscope, Ribbon, Brain, Syringe, GlassWater, HeartCrack, Cross, Coins, Network, ClipboardList, Target, Banknote, Award, Wallet, Clapperboard, Palette, PersonStanding, TrendingUp, Database } from "lucide-react";

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

export function IbamaEmbargosPanel({ d }: { d: Un<ReturnType<typeof getIbamaEmbargosSC>> }) {
  return (
    <Card icon={<Ban className="h-4 w-4" />} titulo="Áreas embargadas (IBAMA)" cor="#b91c1c"
      csv={<BaixarCsv nome="ibama-embargos" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "Embargos" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Áreas embargadas</div><div className="font-display text-2xl font-bold tabular-nums text-red-700">{n0(d.nEmbargos)}</div><div className="text-[10px] text-slate-400">{d.nRecentes} nos últimos 10 anos</div></div>
        <div><div className="text-[11px] text-slate-500">Área embargada</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{n0(d.areaHa)} ha</div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">embargos por ano</div><Spark pts={d.serie.map((s) => s.valor)} cor="#b91c1c" /></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>IBAMA</b> — áreas embargadas por desmatamento/infração ambiental (CSV oficial). Complementa os autos de infração.</Fonte>
    </Card>
  );
}

export function QuilombosPanel({ d }: { d: Un<ReturnType<typeof getQuilombosSC>> }) {
  return (
    <Card icon={<Home className="h-4 w-4" />} titulo="Comunidades quilombolas certificadas (Fundação Palmares)" cor="#92400e">
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Comunidades certificadas</div><div className="font-display text-2xl font-bold tabular-nums text-amber-800">{n0(d.nComunidades)}</div></div>
      </div>
      {d.comunidades.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{d.comunidades.map((c) => <span key={c} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] text-amber-800">{c}</span>)}</div>}
      <Fonte extraido={d.extraido}>Fonte: <b>Fundação Cultural Palmares</b> — comunidades remanescentes de quilombos certificadas por município (dados abertos de cultura).</Fonte>
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

export function VinculoApsPanel({ d }: { d: Un<ReturnType<typeof getVinculoApsSC>> }) {
  const CORF: Record<string, string> = { "Ótimo": "#2563eb", "Bom": "#16a34a", "Suficiente": "#ea580c", "Regular": "#dc2626" };
  const cor = d.pctBomMais >= 50 ? "#16a34a" : d.pctBomMais >= 25 ? "#ea580c" : "#dc2626";
  const maxT = 100;
  return (
    <Card icon={<MapPin className="h-4 w-4" />} titulo="Vínculo e Acompanhamento Territorial (CVAT) — novo modelo (SIAPS)" cor={cor}
      csv={<BaixarCsv nome="vinculo-cvat-siaps" label="CSV" linhas={[...d.distrib.map((f) => ({ faixa: f.faixa, equipes: f.qtd })), { faixa: "% Bom+", equipes: d.pctBomMais }] as unknown as Row[]} colunas={[{ chave: "faixa", rotulo: "Faixa" }, { chave: "equipes", rotulo: "eSF" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">eSF em Bom ou Ótimo no Vínculo</div><div className="font-display text-2xl font-bold tabular-nums" style={{ color: cor }}>{d.pctBomMais}%</div><div className="text-[10px] text-slate-400">{n0(d.esfTotal)} eSF avaliadas · {d.quad}</div></div>
        <div className="ml-auto max-w-xs rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
          <div className="text-[11px] font-semibold text-slate-700">O 2º componente do custeio</div>
          <div className="text-[10px] text-slate-600">Além da Qualidade, o novo cofinanciamento (Port. 3.493/2024) avalia o <b>Vínculo</b> — cadastro da população e acompanhamento do território. É outra parte do repasse por equipe.</div>
        </div>
      </div>
      <div className="mt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Como estão as {n0(d.esfTotal)} eSF no Vínculo</div>
        <div className="mt-1 flex h-6 w-full overflow-hidden rounded">
          {d.distrib.filter((f) => f.qtd > 0).map((f) => (<div key={f.faixa} className="flex items-center justify-center text-[9px] font-semibold text-white" style={{ width: `${(f.qtd / d.esfTotal) * 100}%`, background: CORF[f.faixa] }} title={`${f.faixa}: ${f.qtd}`}>{f.qtd}</div>))}
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-500">{d.distrib.map((f) => (<span key={f.faixa}><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: CORF[f.faixa] }} />{f.faixa}: <b>{f.qtd}</b></span>))}</div>
      </div>
      {d.trajetoria.length > 1 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Trajetória (% Bom+)</div>
          <div className="mt-1 flex items-end gap-2" style={{ height: 38 }}>
            {d.trajetoria.map((t) => (<div key={t.quad} className="flex flex-1 flex-col items-center justify-end gap-0.5"><div className="w-full rounded-t" style={{ height: `${Math.max(2, (t.pctBomMais / maxT) * 28)}px`, background: cor }} title={`${t.quad}: ${t.pctBomMais}%`} /><span className="text-[8px] text-slate-400">{t.quad}</span></div>))}
          </div>
        </div>
      )}
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério da Saúde / SAPS</b> — SIAPS, Avaliação do Quadrimestre, componente Vínculo e Acompanhamento Territorial (Portaria GM/MS 3.493/2024). Classificação das eSF por faixa. Quadrimestre {d.quad}.</Fonte>
    </Card>
  );
}

export function QualidadeIndicadoresApsPanel({ d }: { d: Un<ReturnType<typeof getQualidadeIndicadoresApsSC>> }) {
  const CORES: Record<string, string> = { azul: "#2563eb", verde: "#16a34a", laranja: "#ea580c", vermelho: "#dc2626" };
  const CORF: Record<string, string> = { otimo: "#2563eb", bom: "#16a34a", suficiente: "#ea580c", regular: "#dc2626" };
  const linhasCsv = d.grupos.flatMap((g) => g.indicadores.map((i) => ({ grupo: g.categoria, indicador: i.nome, equipes: i.total, otimo: i.otimo, bom: i.bom, suficiente: i.suficiente, regular: i.regular, pct_bom_mais: i.pctBomMais, media_sc: i.benchmarkSC ?? "", nota_0a10: i.nota })));
  return (
    <Card icon={<Award className="h-4 w-4" />} titulo="Indicadores de Qualidade da APS — novo modelo (SIAPS)" cor="#7c3aed"
      csv={<BaixarCsv nome="indicadores-qualidade-siaps" label="CSV" linhas={linhasCsv as unknown as Row[]} colunas={[{ chave: "grupo", rotulo: "Grupo" }, { chave: "indicador", rotulo: "Indicador" }, { chave: "equipes", rotulo: "Equipes" }, { chave: "otimo", rotulo: "Ótimo" }, { chave: "bom", rotulo: "Bom" }, { chave: "suficiente", rotulo: "Suficiente" }, { chave: "regular", rotulo: "Regular" }, { chave: "pct_bom_mais", rotulo: "% Bom+" }, { chave: "media_sc", rotulo: "Média SC %" }, { chave: "nota_0a10", rotulo: "Nota" }]} />}>
      <p className="mt-1 text-[11px] text-slate-500">Indicadores do Componente de Qualidade (Port. 3.493/2024), por grupo de equipe · {d.quad}. Barra = distribuição das equipes nas faixas; <b>%</b> = equipes em Bom+; <b>SC%</b> = média do estado (verde = acima da média, vermelho = abaixo); <b>▲▼</b> = variação vs quadrimestre anterior.</p>
      {d.grupos.map((g) => (
        <div key={g.categoria} className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-500">{g.categoria}</div>
          <div className="mt-1 space-y-1.5">
            {g.indicadores.map((i) => (
              <div key={i.nome} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-slate-600" title={i.nome}>{i.nome}</span>
                <div className="flex h-3 w-28 shrink-0 overflow-hidden rounded bg-slate-100">
                  {(["otimo", "bom", "suficiente", "regular"] as const).map((f) => { const qtd = i[f]; return qtd > 0 ? <div key={f} style={{ width: `${(qtd / i.total) * 100}%`, background: CORF[f] }} title={`${f}: ${qtd}`} /> : null; })}
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums font-semibold" style={{ color: CORES[i.semaforo] }}>{i.pctBomMais}%</span>
                <span className="w-14 shrink-0 text-right text-[10px] tabular-nums" title="média de SC (% das equipes em Bom+)" style={{ color: i.benchmarkSC == null ? "#cbd5e1" : i.pctBomMais >= i.benchmarkSC ? "#16a34a" : "#dc2626" }}>{i.benchmarkSC == null ? "" : `SC ${i.benchmarkSC}%`}</span>
                <span className="w-7 shrink-0 text-right text-[10px] tabular-nums" style={{ color: i.tendencia == null ? "#cbd5e1" : i.tendencia > 0 ? "#16a34a" : i.tendencia < 0 ? "#dc2626" : "#94a3b8" }} title={i.tendencia == null ? "sem quadrimestre anterior" : `${i.tendencia > 0 ? "+" : ""}${i.tendencia} p.p. vs quadrimestre anterior`}>{i.tendencia == null ? "–" : i.tendencia > 0 ? `▲${i.tendencia}` : i.tendencia < 0 ? `▼${Math.abs(i.tendencia)}` : "="}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: CORF.otimo }} />Ótimo</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: CORF.bom }} />Bom</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: CORF.suficiente }} />Suficiente</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: CORF.regular }} />Regular</span>
      </div>
      <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/50 p-2.5">
        <div className="text-[11px] font-semibold text-violet-800">Onde agir</div>
        <div className="text-[10px] text-slate-600">Os indicadores com % baixo (mais laranja/vermelho) são a maior alavanca de qualidade — e de receita, já que definem a faixa de cada equipe. O <b>Instituto i10</b> prioriza o plano por indicador.</div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério da Saúde / SAPS</b> — SIAPS, Avaliação do Quadrimestre, conceito por indicador de qualidade (Portaria GM/MS 3.493/2024). Distribuição das equipes por faixa em cada indicador. Quadrimestre {d.quad}.</Fonte>
    </Card>
  );
}

export function DinheiroMesaApsPanel({ d }: { d: Un<ReturnType<typeof getDinheiroMesaApsSC>> }) {
  const CORF: Record<string, string> = { "Ótimo": "#2563eb", "Bom": "#16a34a", "Suficiente": "#ea580c", "Regular": "#dc2626" };
  const maxTraj = Math.max(...d.trajetoria.map((t) => t.naMesaAno), 1);
  return (
    <Card icon={<Banknote className="h-4 w-4" />} titulo="Dinheiro na mesa — Componente de Qualidade (classificação oficial SIAPS)" cor="#0d9488"
      csv={<BaixarCsv nome="dinheiro-na-mesa-qualidade" label="CSV" linhas={[...d.distrib.map((f) => ({ item: `eSF ${f.faixa}`, qtd_equipes: f.qtd, valor_mes: f.qtd * f.valor })), { item: "Qualidade eSF hoje (mês)", qtd_equipes: d.esfTotal, valor_mes: d.qualidadeAtualMes }, { item: "Teto se todas Ótimo (mês)", qtd_equipes: d.esfTotal, valor_mes: d.tetoMes }, { item: "Dinheiro na mesa (ano)", qtd_equipes: "", valor_mes: d.naMesaAno }] as unknown as Row[]} colunas={[{ chave: "item", rotulo: "Item" }, { chave: "qtd_equipes", rotulo: "Equipes" }, { chave: "valor_mes", rotulo: "R$" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Dinheiro na mesa por ano (eSF · {d.quad})</div><div className="font-display text-2xl font-bold tabular-nums text-teal-700">{brl(d.naMesaAno)}</div><div className="text-[10px] text-slate-400">se as {n0(d.esfTotal)} eSF subissem todas para Ótimo</div></div>
        <div><div className="text-[11px] text-slate-500">Qualidade eSF hoje</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{brl(d.qualidadeAtualMes)}<span className="text-xs text-slate-400">/mês</span></div><div className="text-[10px] text-slate-400">teto {brl(d.tetoMes)}/mês</div></div>
        <div className="ml-auto max-w-[16rem] rounded-lg border border-teal-200 bg-teal-50/50 p-2.5">
          <div className="text-[11px] font-semibold text-teal-800">💰 Classificação REAL</div>
          <div className="text-[10px] text-slate-600">Cada eSF recebe por faixa: Ótimo {brl(8000)} · Bom {brl(6000)} · Suficiente {brl(4000)} · Regular {brl(2000)}/mês (Port. 3.493/2024). Subir de faixa = custeio recorrente a mais.</div>
        </div>
      </div>
      {/* distribuição de faixas das eSF */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Como estão as {n0(d.esfTotal)} eSF hoje</div>
        <div className="mt-1 flex h-6 w-full overflow-hidden rounded">
          {d.distrib.filter((f) => f.qtd > 0).map((f) => (
            <div key={f.faixa} className="flex items-center justify-center text-[9px] font-semibold text-white" style={{ width: `${(f.qtd / d.esfTotal) * 100}%`, background: CORF[f.faixa] }} title={`${f.faixa}: ${f.qtd} eSF`}>{f.qtd}</div>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-500">{d.distrib.map((f) => (<span key={f.faixa}><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: CORF[f.faixa] }} />{f.faixa}: <b>{f.qtd}</b></span>))}</div>
      </div>
      {/* trajetória do dinheiro na mesa */}
      {d.trajetoria.length > 1 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Dinheiro na mesa por quadrimestre</div>
          <div className="mt-1 flex items-end gap-2" style={{ height: 40 }}>
            {d.trajetoria.map((t) => (
              <div key={t.quad} className="flex flex-1 flex-col items-center justify-end gap-0.5">
                <div className="w-full rounded-t bg-teal-500/70" style={{ height: `${Math.max(2, (t.naMesaAno / maxTraj) * 28)}px` }} title={`${t.quad}: ${brl(t.naMesaAno)}/ano na mesa`} />
                <span className="text-[8px] text-slate-400">{t.quad}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-400">Quanto menor a barra, mais perto do teto (melhor).</div>
        </div>
      )}
      {d.outrasEquipes.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/50 p-2">
          <div className="flex items-center justify-between text-[11px]"><span className="font-semibold text-slate-600">+ Outras equipes (estimativa por subtipo)</span><span className="text-slate-400">na mesa/ano</span></div>
          {d.outrasEquipes.filter((e) => e.total > 0).map((e) => (
            <div key={e.equipe} className="mt-0.5 flex items-center justify-between text-[11px]"><span className="text-slate-600">{e.equipe} <span className="text-slate-400">({e.total})</span></span><span className="tabular-nums text-slate-700">{brl(e.naMesaAno)}</span></div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1 text-xs font-semibold"><span className="text-slate-700">Total (todas as equipes)</span><span className="tabular-nums text-teal-700">{brl(d.totalNaMesaAno)}/ano</span></div>
          <div className="mt-0.5 text-[9px] text-slate-400">eSF é exato (tabela limpa 8/6/4/2 mil); eAP/eSB/eMulti usam o subtipo representativo (eAP 30h, eSB I, eMulti Ampliada) — estimativa.</div>
        </div>
      )}
      <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/50 p-2.5">
        <div className="text-[11px] font-semibold text-sky-800">Plano de evolução</div>
        <div className="text-[10px] text-slate-600">Migrar equipes de Regular/Suficiente para Bom/Ótimo é receita recorrente. O <b>Instituto i10</b> monta o plano por indicador e equipe para capturar esse valor.</div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério da Saúde / SAPS</b> — SIAPS, Avaliação do Quadrimestre, Componente de Qualidade (Portaria GM/MS 3.493/2024). Classificação oficial das equipes por faixa; valores da tabela por equipe. Quadrimestre {d.quad}.</Fonte>
    </Card>
  );
}

export function IndicadoresApsPanel({ d }: { d: Un<ReturnType<typeof getIndicadoresApsSC>> }) {
  const CORES: Record<string, string> = { azul: "#2563eb", verde: "#16a34a", laranja: "#ea580c", vermelho: "#dc2626" };
  const faixa = d.isf >= 8 ? "Ótimo" : d.isf >= 6 ? "Bom" : d.isf >= 4 ? "Suficiente" : "Regular";
  const faixaCor = d.isf >= 8 ? "#2563eb" : d.isf >= 6 ? "#16a34a" : d.isf >= 4 ? "#ea580c" : "#dc2626";
  return (
    <Card icon={<Target className="h-4 w-4" />} titulo="Indicadores de desempenho da APS — Previne Brasil" cor={faixaCor}
      csv={<BaixarCsv nome="indicadores-previne" label="CSV" linhas={[...d.indicadores.map((i) => ({ indicador: i.nome, resultado: i.resultado, meta: i.meta, peso: i.peso, nota: i.nota })), { indicador: "ISF (Indicador Sintético Final)", resultado: d.isf, meta: 10, peso: "", nota: "" }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "resultado", rotulo: "Resultado %" }, { chave: "meta", rotulo: "Meta %" }, { chave: "peso", rotulo: "Peso" }, { chave: "nota", rotulo: "Nota (0-10)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">ISF — Indicador Sintético Final</div><div className="font-display text-2xl font-bold tabular-nums" style={{ color: faixaCor }}>{d.isf.toLocaleString("pt-BR")}<span className="text-sm text-slate-400"> / 10</span></div><div className="text-[10px] font-semibold" style={{ color: faixaCor }}>{faixa} · {d.quadrimestre}</div></div>
        <div className="text-[10px] text-slate-500 max-w-xs">Retrato neutro dos 7 indicadores que definiam o pagamento por desempenho. Cor = alcance da meta: <span style={{ color: CORES.azul }}>●</span> ≥100% · <span style={{ color: CORES.verde }}>●</span> 70-99% · <span style={{ color: CORES.laranja }}>●</span> 40-69% · <span style={{ color: CORES.vermelho }}>●</span> &lt;40%.</div>
      </div>
      {d.isfSerie.length > 1 && (() => { const mx = 10; return (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Trajetória do ISF (quadrimestral)</div>
          <div className="mt-1 flex items-end gap-1" style={{ height: 46 }}>
            {d.isfSerie.map((s) => { const cor = s.isf >= 8 ? "#2563eb" : s.isf >= 6 ? "#16a34a" : s.isf >= 4 ? "#ea580c" : "#dc2626"; return (
              <div key={s.quad} className="flex flex-1 flex-col items-center justify-end gap-0.5">
                <div className="w-full rounded-t" style={{ height: `${Math.max(2, (s.isf / mx) * 34)}px`, background: cor }} title={`${s.quad}: ISF ${s.isf}`} />
                <span className="text-[8px] text-slate-400">{s.quad}</span>
              </div>
            ); })}
          </div>
        </div>
      ); })()}
      <div className="mt-3 space-y-1.5">
        {d.indicadores.map((i) => (
          <div key={i.nome} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CORES[i.semaforo] }} />
            <span className="min-w-0 flex-1 truncate text-slate-600" title={i.nome}>{i.nome}</span>
            <span className="w-14 shrink-0 text-right tabular-nums font-semibold" style={{ color: CORES[i.semaforo] }}>{i.resultado.toLocaleString("pt-BR")}%</span>
            <span className="w-16 shrink-0 text-right text-[10px] text-slate-400">meta {i.meta}%</span>
            <span className="w-10 shrink-0 text-right text-[10px] text-slate-400">×{i.peso}</span>
          </div>
        ))}
      </div>
      <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-slate-600">Como o ISF é calculado (metodologia)</summary>
        <div className="mt-1.5 space-y-1 text-[10px] leading-relaxed text-slate-600">
          <p>Cada indicador recebe uma <b>nota de 0 a 10</b> = (resultado ÷ meta) × 10, com teto em 10. A nota é multiplicada pelo <b>peso</b> (1 ou 2; soma dos pesos = 10). O <b>ISF = soma das notas ponderadas ÷ 10</b> — de 0 a 10.</p>
          <p>No Previne Brasil (Port. GM/MS 3.222/2019, ajustada pela 102/2022) o ISF equivalia ao <b>% do teto do pagamento por desempenho</b> que a equipe recebia. Apuração quadrimestral. <i>Nota: em 2024 o modelo migrou para o novo cofinanciamento (Port. 3.493/2024) com 15 indicadores e faixas Ótimo/Bom/Suficiente/Regular — esta é a base histórica Previne.</i></p>
        </div>
      </details>
      <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/50 p-2.5">
        <div className="text-[11px] font-semibold text-sky-800">Como melhorar</div>
        <div className="text-[10px] text-slate-600">Os indicadores em <span style={{ color: CORES.laranja }}>laranja</span>/<span style={{ color: CORES.vermelho }}>vermelho</span> são a maior alavanca — priorizar busca ativa e registro correto no e-SUS eleva a nota e o repasse. O <b>Instituto i10</b> apoia o plano de ação por indicador.</div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério da Saúde / SAPS</b> — SISAB, Relatório de Indicadores de Desempenho (indicadorPainel), quadrimestre {d.quadrimestre}. ISF calculado pela metodologia oficial (pesos/metas da NT 3/2022-DESF/SAPS/MS).</Fonte>
    </Card>
  );
}

export function ProducaoApsPanel({ d }: { d: Un<ReturnType<typeof getProducaoApsSC>> }) {
  return (
    <Card icon={<ClipboardList className="h-4 w-4" />} titulo="Produção da Atenção Primária (SISAB / e-SUS APS)" cor="#0d9488"
      csv={<BaixarCsv nome="producao-aps-sisab" label="CSV" linhas={[{ indicador: "Fichas de produção aprovadas", valor: d.aprovadas }, { indicador: "Fichas enviadas (total)", valor: d.total }, { indicador: "Equipes de Saúde da Família", valor: d.esf }, { indicador: "Fichas aprovadas por equipe", valor: d.porEquipe ?? "" }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Fichas de produção aprovadas</div><div className="font-display text-2xl font-bold tabular-nums text-teal-700">{n0(d.aprovadas)}</div><div className="text-[10px] text-slate-400">de {n0(d.total)} enviadas · competência {d.competencia}</div></div>
        {d.porEquipe != null && <div><div className="text-[11px] text-slate-500">Por equipe (ESF)</div><div className="font-display text-xl font-bold tabular-nums text-slate-700">{n0(d.porEquipe)}</div><div className="text-[10px] text-slate-400">{n0(d.esf)} equipes</div></div>}
        <div className="ml-auto max-w-xs rounded-lg border border-teal-200 bg-teal-50/50 p-2.5">
          <div className="text-[11px] font-semibold text-teal-800">💡 Produção → verba</div>
          <div className="text-[10px] text-slate-600">São os atendimentos, visitas, procedimentos e cadastros que as equipes registraram e o SISAB validou. Essa produção alimenta os indicadores do <b>Previne</b> (desempenho) e o custeio.</div>
        </div>
      </div>
      {d.serieAnual.length > 1 && (() => { const mx = Math.max(...d.serieAnual.map((s) => s.valor)); return (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Produção aprovada por ano (fichas)</div>
          <div className="mt-1 flex items-end gap-1.5" style={{ height: 56 }}>
            {d.serieAnual.map((s) => (
              <div key={s.ano} className="flex flex-1 flex-col items-center justify-end gap-0.5">
                <div className="w-full rounded-t bg-teal-500/80" style={{ height: `${Math.max(2, (s.valor / mx) * 44)}px` }} title={`${s.ano}: ${n0(s.valor)}`} />
                <span className="text-[9px] text-slate-400">{String(s.ano).slice(2)}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-400">Série mensal 2021–2026 (soma anual). O último ano pode estar parcial.</div>
        </div>
      ); })()}
      <p className="mt-2 text-[11px] text-slate-500">Total de fichas (atendimento individual, odontológico, visita domiciliar, atividade coletiva, procedimentos e cadastros) registradas pelas equipes e aprovadas na validação do SISAB.</p>
      <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-slate-600">Nota metodológica — como ler este número (e seus limites)</summary>
        <div className="mt-1.5 space-y-1 text-[10px] leading-relaxed text-slate-600">
          <p>O número é a <b>produção informatizada e validada</b> no SISAB — não é necessariamente toda a produção assistencial. Base legal: SISAB (Port. GM/MS 1.412/2013), Previne Brasil (Port. 2.979/2019) e a Nota Técnica de Validação do MS. Ele <b>subestima</b> a produção real por:</p>
          <p>• <b>Sistema próprio:</b> municípios que usam prontuário próprio (integração via Thrift) podem subnotificar se o cadastro CNES/INE divergir — produção baixa aqui pode ser problema de integração, não de assistência.</p>
          <p>• <b>Só "Aprovado" conta:</b> fichas Reprovadas (CNES/INE/profissional/CBO inválido), Duplicadas ou fora do prazo de 120 dias saem da base — muitas vezes por erro cadastral, não assistencial.</p>
          <p>• <b>Meses recentes são preliminares e retroativos:</b> uma competência pode receber fichas por até ~4 meses depois; o mês corrente está sempre incompleto.</p>
          <p>• <b>Tipos de ficha misturam</b> atendimento, procedimento, cadastro (capitação) e visita; a vacinação é validada no SIPNI. 1 ficha pode agrupar vários atendimentos.</p>
        </div>
      </details>
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério da Saúde / SAPS</b> — SISAB (Sistema de Informação em Saúde para a Atenção Básica), Relatório de Validação da produção (e-SUS APS), raspado por competência (2021–2026). Fichas aprovadas por município; último mês {d.competencia}.</Fonte>
    </Card>
  );
}

export function CoberturaApsPanel({ d }: { d: Un<ReturnType<typeof getCoberturaApsSC>> }) {
  const gap = d.cobertura < 100;
  const cor = d.cobertura < 70 ? "#dc2626" : gap ? "#ea580c" : "#16a34a";
  return (
    <Card icon={<Network className="h-4 w-4" />} titulo="Cobertura da Atenção Primária (e-Gestor APS)" cor={cor}
      csv={<BaixarCsv nome="cobertura-aps" label="CSV" linhas={[{ indicador: "Cobertura potencial APS (%)", valor: d.cobertura }, { indicador: "População", valor: d.populacao }, { indicador: "Equipes de Saúde da Família", valor: d.esf }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Cobertura potencial da APS</div><div className="font-display text-2xl font-bold tabular-nums" style={{ color: cor }}>{d.cobertura.toLocaleString("pt-BR")}%</div><div className="text-[10px] text-slate-400">{n0(d.esf)} equipes ESF · {n0(d.populacao)} hab · comp. {d.competencia}</div></div>
        {gap && <div className="max-w-xs rounded-lg border border-orange-200 bg-orange-50/60 p-2.5"><div className="text-[11px] font-semibold text-orange-700">⚠️ Abaixo de 100%</div><div className="text-[10px] text-slate-600">A capacidade instalada da APS não cobre toda a população — lacuna de equipes. Ampliar ESF aumenta cobertura E o custeio (Previne).</div></div>}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Estimativa de quantas pessoas as equipes podem atender pela capacidade instalada. Acima de 100% = folga; abaixo = déficit de equipes.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério da Saúde / SAPS</b> — e-Gestor APS, Cobertura Potencial da APS. Por município de residência, competência CNES {d.competencia}.</Fonte>
    </Card>
  );
}

export function FinanciamentoApsPanel({ d }: { d: Un<ReturnType<typeof getFinanciamentoApsSC>> }) {
  return (
    <Card icon={<Coins className="h-4 w-4" />} titulo="Financiamento da Atenção Primária (e-Gestor APS)" cor="#0d9488"
      csv={<BaixarCsv nome="financiamento-aps" label="CSV" linhas={[{ item: "Custeio total/mês", valor: d.custeioMensal }, ...d.componentes.map((c) => ({ item: c.nome, valor: c.valor }))] as unknown as Row[]} colunas={[{ chave: "item", rotulo: "Componente" }, { chave: "valor", rotulo: "Valor (R$)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Custeio APS por mês</div><div className="font-display text-2xl font-bold tabular-nums text-teal-700">{brl(d.custeioMensal)}</div><div className="text-[10px] text-slate-400">≈ {brl(d.custeioAnual)}/ano · competência {d.parcela}</div></div>
        <div className="ml-auto max-w-xs rounded-lg border border-teal-200 bg-teal-50/50 p-2.5">
          <div className="text-[11px] font-semibold text-teal-800">💡 Produção → verba</div>
          <div className="text-[10px] text-slate-600">Cada componente é uma verba que a equipe faz vir produzindo e cadastrando. O <b>desempenho (Previne)</b> paga pelos indicadores atingidos.</div>
        </div>
      </div>
      {d.componentes.length > 0 && (() => { const maxC = Math.max(...d.componentes.map((c) => c.valor)); return (
        <div className="mt-3 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Composição da verba (por componente)</div>
          {d.componentes.map((c) => (
            <div key={c.nome} className="flex items-center gap-2 text-xs">
              <span className="w-56 shrink-0 truncate text-slate-600" title={c.nome}>{c.nome}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-3 rounded bg-teal-500" style={{ width: `${(c.valor / maxC) * 100}%` }} /></div>
              <span className="w-24 shrink-0 text-right tabular-nums text-slate-700">{brl(c.valor)}</span>
            </div>
          ))}
        </div>
      ); })()}
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério da Saúde / SAPS</b> — e-Gestor Atenção Primária à Saúde (Relatório de Pagamento). Custeio efetivamente transferido ao município para a APS.</Fonte>
    </Card>
  );
}

export function IdhmPanel({ d }: { d: Un<ReturnType<typeof getIdhmSC>> }) {
  const cor = d.idhm >= 0.8 ? "#2563eb" : d.idhm >= 0.7 ? "#16a34a" : d.idhm >= 0.6 ? "#ea580c" : "#dc2626";
  const sub = [{ n: "Renda", v: d.renda }, { n: "Longevidade", v: d.long }, { n: "Educação", v: d.educ }];
  return (
    <Card icon={<Medal className="h-4 w-4" />} titulo="IDHM — Índice de Desenvolvimento Humano Municipal" cor={cor}
      csv={<BaixarCsv nome="idhm" label="CSV" linhas={[{ indicador: "IDHM", valor: d.idhm }, { indicador: "IDHM Renda", valor: d.renda }, { indicador: "IDHM Longevidade", valor: d.long }, { indicador: "IDHM Educação", valor: d.educ }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">IDHM ({d.ano})</div><div className="font-display text-2xl font-bold tabular-nums" style={{ color: cor }}>{d.idhm.toLocaleString("pt-BR")}</div><div className="text-[10px] font-semibold" style={{ color: cor }}>{d.faixa}</div></div>
        <div className="flex-1 space-y-1">
          {sub.map((s) => (
            <div key={s.n} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-slate-500">{s.n}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-2.5 rounded" style={{ width: `${s.v * 100}%`, background: cor }} /></div>
              <span className="w-10 shrink-0 text-right tabular-nums text-slate-600">{s.v.toLocaleString("pt-BR")}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-amber-600">⚠️ O IDHM oficial por município é calculado nos censos; <b>{d.ano}</b> é o último disponível (o IDHM do Censo 2022 ainda não foi publicado pelo PNUD).</p>
      <Fonte extraido={d.extraido}>Fonte: <b>Atlas do Desenvolvimento Humano no Brasil</b> (PNUD, IPEA, FJP). IDHM e subíndices renda/longevidade/educação, Censo {d.ano}.</Fonte>
    </Card>
  );
}

export function PibMunicipalPanel({ d }: { d: Un<ReturnType<typeof getPibMunicipalSC>> }) {
  return (
    <Card icon={<TrendingUp className="h-4 w-4" />} titulo="PIB do município (IBGE)" cor="#0d9488"
      csv={<BaixarCsv nome="pib-municipal" label="CSV" linhas={[{ indicador: "PIB (preços correntes)", valor: d.pib }, { indicador: "PIB per capita", valor: d.pibPerCapita ?? "" }, { indicador: "Posição no estado", valor: `${d.posicaoUf}º de ${d.totalMunis}` }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">PIB (preços correntes)</div><div className="font-display text-2xl font-bold tabular-nums text-teal-700">{brl(d.pib)}</div><div className="text-[10px] text-slate-400">{d.posicaoUf}º maior de {d.totalMunis} no estado · {d.ano}</div></div>
        {d.pibPerCapita != null && <div><div className="text-[11px] text-slate-500">PIB per capita</div><div className="font-display text-xl font-bold tabular-nums text-slate-700">{brl(d.pibPerCapita)}</div><div className="text-[10px] text-slate-400">por habitante/ano</div></div>}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Riqueza gerada no município em um ano. Base para dimensionar economia local, arrecadação potencial e comparação regional.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>IBGE</b> — Produto Interno Bruto dos Municípios, preços correntes (tabela SIDRA 5938). PIB per capita = PIB ÷ população do Censo 2022.</Fonte>
    </Card>
  );
}

export function PopulacaoFaixaPanel({ d }: { d: Un<ReturnType<typeof getPopulacaoFaixaSC>> }) {
  const mx = Math.max(...d.bandas.map((b) => b.qtd), 1);
  const CORB: Record<string, string> = { "0-14": "#0ea5e9", "15-29": "#14b8a6", "30-44": "#16a34a", "45-59": "#65a30d", "60-74": "#ea580c", "75+": "#dc2626" };
  return (
    <Card icon={<PersonStanding className="h-4 w-4" />} titulo="Estrutura etária da população (IBGE Censo 2022)" cor="#0d9488"
      csv={<BaixarCsv nome="populacao-faixa-etaria" label="CSV" linhas={[...d.bandas.map((b) => ({ faixa: b.nome, populacao: b.qtd, percentual: b.pct })), { faixa: "% idosos 60+", populacao: d.pop60, percentual: d.pctIdosos }, { faixa: "Razão de dependência", populacao: "", percentual: d.razaoDependencia }, { faixa: "Índice de envelhecimento", populacao: "", percentual: d.indiceEnvelhecimento }] as unknown as Row[]} colunas={[{ chave: "faixa", rotulo: "Faixa" }, { chave: "populacao", rotulo: "População" }, { chave: "percentual", rotulo: "%" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Idosos (60+) <span className="text-slate-400">· saúde/RPPS</span></div><div className="font-display text-xl font-bold tabular-nums text-orange-600">{d.pctIdosos.toLocaleString("pt-BR")}%</div><div className="text-[10px] text-slate-400">{n0(d.pop60)} pessoas · {n0(d.pop80)} com 80+</div></div>
        <div><div className="text-[11px] text-slate-500">Crianças (0-14) <span className="text-slate-400">· educação</span></div><div className="font-display text-xl font-bold tabular-nums text-sky-600">{d.pct014.toLocaleString("pt-BR")}%</div></div>
        <div><div className="text-[11px] text-slate-500">Razão de dependência</div><div className="font-display text-xl font-bold tabular-nums text-slate-700">{d.razaoDependencia.toLocaleString("pt-BR")}</div><div className="text-[10px] text-slate-400">dependentes / 100 ativos</div></div>
        <div><div className="text-[11px] text-slate-500">Índice de envelhecimento</div><div className="font-display text-xl font-bold tabular-nums text-slate-700">{d.indiceEnvelhecimento.toLocaleString("pt-BR")}</div><div className="text-[10px] text-slate-400">idosos / 100 crianças</div></div>
      </div>
      <div className="mt-3 space-y-1">
        {d.bandas.map((b) => (
          <div key={b.nome} className="flex items-center gap-2 text-xs">
            <span className="w-12 shrink-0 text-slate-500">{b.nome}</span>
            <div className="h-3.5 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-3.5 rounded" style={{ width: `${(b.qtd / mx) * 100}%`, background: CORB[b.nome] }} /></div>
            <span className="w-20 shrink-0 text-right tabular-nums text-slate-600">{n0(b.qtd)}</span>
            <span className="w-10 shrink-0 text-right tabular-nums text-slate-400">{b.pct}%</span>
          </div>
        ))}
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>IBGE</b> — Censo Demográfico 2022, população residente por grupos de idade (tabela SIDRA 9514). Base para planejamento de saúde (idosos) e educação (idade escolar).</Fonte>
    </Card>
  );
}

export function CensoCorRacaPanel({ d }: { d: Un<ReturnType<typeof getCensoCorRacaSC>> }) {
  const CORF: Record<string, string> = { Branca: "#94a3b8", Parda: "#d97706", Preta: "#78350f", Amarela: "#eab308", Indígena: "#16a34a" };
  return (
    <Card icon={<Users className="h-4 w-4" />} titulo="População por cor ou raça (IBGE Censo 2022)" cor="#0d9488"
      csv={<BaixarCsv nome="censo-cor-raca" label="CSV" linhas={d.comp.map((c) => ({ cor_raca: c.nome, populacao: c.qtd, percentual: c.pct })) as unknown as Row[]} colunas={[{ chave: "cor_raca", rotulo: "Cor/raça" }, { chave: "populacao", rotulo: "População" }, { chave: "percentual", rotulo: "%" }]} />}>
      <div className="mt-2 text-[11px] text-slate-500">População residente: <b className="text-slate-700">{n0(d.total)}</b> (Censo 2022)</div>
      <div className="mt-2 flex h-6 w-full overflow-hidden rounded">
        {d.comp.map((c) => (<div key={c.nome} className="flex items-center justify-center text-[9px] font-semibold text-white" style={{ width: `${c.pct}%`, background: CORF[c.nome] }} title={`${c.nome}: ${c.pct}%`}>{c.pct >= 8 ? `${c.pct}%` : ""}</div>))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-600">{d.comp.map((c) => (<span key={c.nome}><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: CORF[c.nome] }} />{c.nome}: <b>{c.pct}%</b> ({n0(c.qtd)})</span>))}</div>
      <Fonte extraido={d.extraido}>Fonte: <b>IBGE</b> — Censo Demográfico 2022, população residente por cor ou raça (tabela SIDRA 9605).</Fonte>
    </Card>
  );
}

export function NovoPacPanel({ d }: { d: Un<ReturnType<typeof getNovoPacSC>> }) {
  return (
    <Card icon={<Building2 className="h-4 w-4" />} titulo="Novo PAC — obras do município (ObrasGov)" cor="#0369a1"
      csv={<BaixarCsv nome="novo-pac-obras" label="CSV" linhas={[{ indicador: "Obras/empreendimentos", valor: d.projetos }, { indicador: "Investimento previsto", valor: d.valorPrevisto }, { indicador: "Em andamento/execução", valor: d.emAndamento }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Investimento federal previsto (obras do município)</div><div className="font-display text-2xl font-bold tabular-nums text-sky-800">{brl(d.valorPrevisto)}</div><div className="text-[10px] text-slate-400">{n0(d.projetos)} empreendimentos · {n0(d.emAndamento)} em andamento</div></div>
        <div className="ml-auto max-w-xs rounded-lg border border-sky-200 bg-sky-50/50 p-2.5"><div className="text-[11px] font-semibold text-sky-800">🏗️ Investimento na ponta</div><div className="text-[10px] text-slate-600">Empreendimentos do Novo PAC executados pelo município (obras cadastradas na plataforma ObrasGov). Acompanhar situação e execução evita atraso/perda de recurso.</div></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>Casa Civil / ObrasGov</b> — empreendimentos do Novo PAC com o município como executor. Nº de obras, investimento previsto (todas as fontes) e situação.</Fonte>
    </Card>
  );
}

export function LpgPanel({ d }: { d: Un<ReturnType<typeof getLpgSC>> }) {
  const risco = d.pctUtilizado < 90 && d.saldo > 0;
  const cor = risco ? "#dc2626" : "#7c3aed";
  return (
    <Card icon={<Clapperboard className="h-4 w-4" />} titulo="Lei Paulo Gustavo — execução (cultura)" cor={cor}
      csv={<BaixarCsv nome="lei-paulo-gustavo" label="CSV" linhas={[{ indicador: "Valor transferido", valor: d.transferido }, { indicador: "Saldo em conta (risco devolução)", valor: d.saldo }, { indicador: "% utilizado", valor: d.pctUtilizado }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Transferido (LPG)</div><div className="font-display text-xl font-bold tabular-nums text-violet-700">{brl(d.transferido)}</div></div>
        <div><div className="text-[11px] text-slate-500">Saldo em conta</div><div className="font-display text-xl font-bold tabular-nums" style={{ color: d.saldo > 0 ? "#ea580c" : "#16a34a" }}>{brl(d.saldo)}</div></div>
        <div><div className="text-[11px] text-slate-500">% utilizado</div><div className="font-display text-xl font-bold tabular-nums" style={{ color: cor }}>{d.pctUtilizado.toLocaleString("pt-BR")}%</div></div>
        {risco && <div className="ml-auto max-w-xs rounded-lg border border-red-200 bg-red-50/60 p-2.5"><div className="text-[11px] font-semibold text-red-700">⚠️ Saldo com baixa execução</div><div className="text-[10px] text-slate-600">Recurso da Lei Paulo Gustavo ainda em conta e execução abaixo de 90% — risco de devolução ao FNC.</div></div>}
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério da Cultura</b> — execução financeira da Lei Paulo Gustavo (LC 195/2022) por município (dados.cultura.gov.br). Saldo em conta e % utilizado.</Fonte>
    </Card>
  );
}

export function SalicPanel({ d }: { d: Un<ReturnType<typeof getSalicSC>> }) {
  return (
    <Card icon={<Palette className="h-4 w-4" />} titulo="Lei Rouanet (SALIC) — captação de cultura" cor="#7c3aed"
      csv={<BaixarCsv nome="rouanet-salic" label="CSV" linhas={[{ indicador: "Projetos", valor: d.projetos }, { indicador: "Valor aprovado", valor: d.aprovado }, { indicador: "Valor captado", valor: d.captado }, { indicador: "Gap (aprovado não captado)", valor: d.gap }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Ainda a captar (aprovado − captado)</div><div className="font-display text-2xl font-bold tabular-nums text-violet-700">{brl(d.gap)}</div><div className="text-[10px] text-slate-400">{n0(d.projetos)} projetos · captado {brl(d.captado)} de {brl(d.aprovado)}</div></div>
        <div className="ml-auto max-w-xs rounded-lg border border-violet-200 bg-violet-50/50 p-2.5"><div className="text-[11px] font-semibold text-violet-800">🎭 Incentivo na mesa</div><div className="text-[10px] text-slate-600">Projetos culturais do município já aprovados na Lei Rouanet mas ainda sem patrocínio captado — potencial de recurso via incentivo fiscal a mobilizar.</div></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério da Cultura</b> — API SALIC (Lei Rouanet). Projetos por município: valor aprovado vs captado; gap = incentivo a captar.</Fonte>
    </Card>
  );
}

export function MuseusPanel({ d }: { d: Un<ReturnType<typeof getMuseusSC>> }) {
  return (
    <Card icon={<Landmark className="h-4 w-4" />} titulo="Museus do município (IBRAM / MuseusBr)" cor="#0d9488"
      csv={<BaixarCsv nome="museus" label="CSV" linhas={[{ indicador: "Museus cadastrados", valor: d.museus }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2"><div className="text-[11px] text-slate-500">Museus cadastrados</div><div className="font-display text-2xl font-bold tabular-nums text-teal-700">{n0(d.museus)}</div><div className="text-[10px] text-slate-400">equipamentos culturais — base para captação (LPG, Rouanet, editais de cultura)</div></div>
      <Fonte extraido={d.extraido}>Fonte: <b>IBRAM</b> — Cadastro Nacional de Museus (MuseusBr). Museus cadastrados no município.</Fonte>
    </Card>
  );
}

export function SetoresPanel({ d, codigo }: { d: Un<ReturnType<typeof getSetoresSC>>; codigo: string }) {
  const mxTop = Math.max(...d.topBairros.map((b) => b.pop), 1);
  return (
    <Card icon={<MapPin className="h-4 w-4" />} titulo="Perfil intraurbano — setores censitários (IBGE Censo 2022)" cor="#7c3aed"
      csv={<BaixarCsv nome="setores-intraurbano" label="CSV" linhas={[{ item: "Setores censitários", valor: d.setores }, { item: "Bairros", valor: d.bairros }, { item: "Densidade mediana (hab/km²)", valor: d.densMediana }, { item: "Densidade máxima (hab/km²)", valor: d.densMax }, ...d.topBairros.map((b) => ({ item: `Bairro: ${b.bairro}`, valor: b.pop }))] as unknown as Row[]} colunas={[{ chave: "item", rotulo: "Item" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Setores censitários</div><div className="font-display text-2xl font-bold tabular-nums text-violet-700">{n0(d.setores)}</div><div className="text-[10px] text-slate-400">{n0(d.bairros)} bairros</div></div>
        <div><div className="text-[11px] text-slate-500">Densidade populacional (hab/km²)</div><div className="font-display text-lg font-bold tabular-nums text-slate-700">{n0(d.densMediana)} <span className="text-[11px] font-normal text-slate-400">mediana</span> · {n0(d.densMax)} <span className="text-[11px] font-normal text-slate-400">máx</span></div><div className="text-[10px] text-slate-400">disparidade entre setores do município</div></div>
      </div>
      <div className="mt-3"><div className="mb-1 text-[11px] font-semibold text-slate-600">Mapa de calor — densidade por setor (clique para detalhar)</div><MapaSetoresWrap codigo={codigo} /></div>
      {d.topBairros.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-slate-600">Bairros mais populosos</div>
          <div className="mt-1 space-y-1">
            {d.topBairros.map((b) => (
              <div key={b.bairro} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 truncate text-slate-500">{b.bairro}</span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-3 rounded bg-violet-500" style={{ width: `${(b.pop / mxTop) * 100}%` }} /></div>
                <span className="w-16 shrink-0 text-right tabular-nums text-slate-600">{n0(b.pop)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">A menor unidade do Censo. Revela a desigualdade <b>dentro</b> do município — onde concentrar UBS, escola, saneamento e transporte.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>IBGE</b> — Censo 2022, Agregados por Setores Censitários (16,7 mil setores em SC). Densidade = população ÷ área do setor.</Fonte>
    </Card>
  );
}

export function AlfabetizacaoPanel({ d }: { d: Un<ReturnType<typeof getAlfabetizacaoSC>> }) {
  const acima = d.taxa >= d.mediaSc;
  return (
    <Card icon={<Baby className="h-4 w-4" />} titulo="Taxa de alfabetização — 15 anos ou mais (IBGE Censo 2022)" cor="#0d9488"
      csv={<BaixarCsv nome="alfabetizacao-censo" label="CSV" linhas={[{ indicador: "Taxa de alfabetização (15+)", valor: d.taxa }, { indicador: "Taxa de analfabetismo", valor: d.analfabetos }, { indicador: "Média SC", valor: d.mediaSc }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "%" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Alfabetização (15+)</div><div className="font-display text-2xl font-bold tabular-nums text-teal-700">{d.taxa.toLocaleString("pt-BR")}%</div><div className="text-[10px] text-slate-400">média SC {d.mediaSc.toLocaleString("pt-BR")}% · {acima ? "acima" : "abaixo"} da média</div></div>
        <div><div className="text-[11px] text-slate-500">Analfabetismo (15+)</div><div className="font-display text-xl font-bold tabular-nums text-slate-700">{d.analfabetos.toLocaleString("pt-BR")}%</div><div className="text-[10px] text-slate-400">público de EJA / alfabetização de adultos</div></div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">O percentual de analfabetos dimensiona a demanda por Educação de Jovens e Adultos (EJA) e programas de alfabetização.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>IBGE</b> — Censo Demográfico 2022, taxa de alfabetização das pessoas de 15 anos ou mais (tabela SIDRA 9543).</Fonte>
    </Card>
  );
}

export function DomiciliosPanel({ d }: { d: Un<ReturnType<typeof getDomiciliosSC>> }) {
  return (
    <Card icon={<Home className="h-4 w-4" />} titulo="Domicílios e densidade domiciliar (IBGE Censo 2022)" cor="#0d9488"
      csv={<BaixarCsv nome="domicilios-censo" label="CSV" linhas={[{ indicador: "Domicílios ocupados", valor: d.domicilios }, { indicador: "Moradores", valor: d.moradores }, { indicador: "Média de moradores/domicílio", valor: d.densidade }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Domicílios particulares ocupados</div><div className="font-display text-2xl font-bold tabular-nums text-teal-700">{n0(d.domicilios)}</div><div className="text-[10px] text-slate-400">{n0(d.moradores)} moradores</div></div>
        <div><div className="text-[11px] text-slate-500">Densidade domiciliar</div><div className="font-display text-xl font-bold tabular-nums text-slate-700">{d.densidade.toLocaleString("pt-BR")}</div><div className="text-[10px] text-slate-400">moradores por domicílio {d.densidade >= 3 ? "· acima da média SC (2,74)" : ""}</div></div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Base para dimensionar demanda por moradia, coleta, água e serviços. Densidade alta pode indicar adensamento/déficit habitacional.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>IBGE</b> — Censo Demográfico 2022, domicílios particulares permanentes ocupados e média de moradores (tabela SIDRA 4712, universo).</Fonte>
    </Card>
  );
}

export function CemadenPanel({ d }: { d: Un<ReturnType<typeof getCemadenSC>> }) {
  const semMonitoramento = d.estacoes === 0;
  return (
    <Card icon={<Droplets className="h-4 w-4" />} titulo="Monitoramento de risco de chuva (CEMADEN)" cor={semMonitoramento ? "#dc2626" : "#0d9488"}
      csv={<BaixarCsv nome="cemaden-estacoes" label="CSV" linhas={[{ indicador: "Estações CEMADEN", valor: d.estacoes }, { indicador: "Estações ativas (24h)", valor: d.ativas }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Estações de monitoramento (pluviômetros)</div><div className="font-display text-2xl font-bold tabular-nums" style={{ color: semMonitoramento ? "#dc2626" : "#0d9488" }}>{n0(d.estacoes)}</div><div className="text-[10px] text-slate-400">{n0(d.ativas)} ativas nas últimas 24h</div></div>
        {semMonitoramento
          ? <div className="ml-auto max-w-xs rounded-lg border border-red-200 bg-red-50/60 p-2.5"><div className="text-[11px] font-semibold text-red-700">⚠️ Ponto cego de alerta</div><div className="text-[10px] text-slate-600">O município não tem estação do CEMADEN — sem alerta antecipado de chuva intensa. Vale pleitear a instalação (rede nacional de monitoramento).</div></div>
          : <div className="ml-auto max-w-xs rounded-lg border border-teal-200 bg-teal-50/50 p-2.5"><div className="text-[11px] font-semibold text-teal-800">🌧️ Alerta antecipado</div><div className="text-[10px] text-slate-600">Rede do CEMADEN monitora chuva em tempo real para alerta de desastres. Integra o plano de contingência da Defesa Civil.</div></div>}
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>CEMADEN</b> — Centro Nacional de Monitoramento e Alertas de Desastres Naturais. Estações pluviométricas por município.</Fonte>
    </Card>
  );
}

export function BarragensPanel({ d }: { d: Un<ReturnType<typeof getBarragensSC>> }) {
  const cor = d.danoAlto > 0 ? "#dc2626" : "#0d9488";
  return (
    <Card icon={<Waves className="h-4 w-4" />} titulo="Barragens no município (ANA / SNISB)" cor={cor}
      csv={<BaixarCsv nome="barragens-snisb" label="CSV" linhas={[{ indicador: "Barragens cadastradas", valor: d.total }, { indicador: "Dano potencial ALTO", valor: d.danoAlto }, { indicador: "Categoria de risco ALTA", valor: d.riscoAlto }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Barragens cadastradas</div><div className="font-display text-2xl font-bold tabular-nums text-slate-700">{n0(d.total)}</div></div>
        <div><div className="text-[11px] text-slate-500">Dano potencial alto</div><div className="font-display text-xl font-bold tabular-nums" style={{ color: d.danoAlto > 0 ? "#dc2626" : "#16a34a" }}>{n0(d.danoAlto)}</div></div>
        <div><div className="text-[11px] text-slate-500">Categoria de risco alta</div><div className="font-display text-xl font-bold tabular-nums" style={{ color: d.riscoAlto > 0 ? "#ea580c" : "#16a34a" }}>{n0(d.riscoAlto)}</div></div>
        {d.danoAlto > 0 && <div className="ml-auto max-w-xs rounded-lg border border-red-200 bg-red-50/60 p-2.5"><div className="text-[11px] font-semibold text-red-700">⚠️ Dano potencial alto</div><div className="text-[10px] text-slate-600">Barragens cujo rompimento causaria dano relevante — exigem plano de contingência da Defesa Civil e monitoramento.</div></div>}
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>ANA — Agência Nacional de Águas / SNISB</b> (Sistema Nacional de Informações sobre Segurança de Barragens). Barragens por município com dano potencial e categoria de risco.</Fonte>
    </Card>
  );
}

export function PaaPanel({ d }: { d: Un<ReturnType<typeof getPaaSC>> }) {
  return (
    <Card icon={<Sprout className="h-4 w-4" />} titulo="PAA — compras da agricultura familiar (Conab)" cor="#16a34a"
      csv={<BaixarCsv nome="paa-agricultura-familiar" label="CSV" linhas={[{ indicador: "Valor executado (histórico)", valor: d.executado }, { indicador: "Valor formalizado", valor: d.formalizado }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Comprado da agricultura familiar (PAA, acumulado)</div><div className="font-display text-2xl font-bold tabular-nums text-green-700">{brl(d.executado)}</div><div className="text-[10px] text-slate-400">formalizado {brl(d.formalizado)} · até {d.ultimoAno}</div></div>
        <div className="ml-auto max-w-xs rounded-lg border border-green-200 bg-green-50/50 p-2.5"><div className="text-[11px] font-semibold text-green-800">🌱 Economia local</div><div className="text-[10px] text-slate-600">Programa de Aquisição de Alimentos: compra da agricultura familiar para doação/abastecimento. Fortalece a renda rural e a segurança alimentar do município.</div></div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>Conab</b> — Programa de Aquisição de Alimentos (PAA), valor executado em compras da agricultura familiar por município (acumulado, propostas formalizadas). Até {d.ultimoAno}.</Fonte>
    </Card>
  );
}

export function PnaeAgriPanel({ d }: { d: Un<ReturnType<typeof getPnaeAgriSC>> }) {
  const cor = d.cumpre ? "#16a34a" : "#dc2626";
  return (
    <Card icon={<Wheat className="h-4 w-4" />} titulo="PNAE — compra da agricultura familiar (mínimo legal 30%)" cor={cor}
      csv={<BaixarCsv nome="pnae-agricultura-familiar" label="CSV" linhas={[{ indicador: "% agricultura familiar", valor: d.percentual }, { indicador: "Valor transferido PNAE", valor: d.valorTransferido }, { indicador: "Valor em agricultura familiar", valor: d.valorAgri }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">% da merenda comprada da agricultura familiar</div><div className="font-display text-2xl font-bold tabular-nums" style={{ color: cor }}>{d.percentual.toLocaleString("pt-BR")}%</div><div className="text-[10px] text-slate-400">mínimo legal 30% · exercício {d.ano}</div></div>
        <div className="ml-auto max-w-xs rounded-lg border p-2.5" style={{ borderColor: d.cumpre ? "#bbf7d0" : "#fecaca", background: d.cumpre ? "#f0fdf4" : "#fef2f2" }}>
          <div className="text-[11px] font-semibold" style={{ color: cor }}>{d.cumpre ? "✓ Cumpre a Lei 11.947/2009" : "⚠️ Abaixo do mínimo legal"}</div>
          <div className="text-[10px] text-slate-600">{d.cumpre ? "O município aplica ao menos 30% do PNAE na agricultura familiar — fortalece a economia local e cumpre a lei." : "Menos de 30% do PNAE foi comprado da agricultura familiar — descumprimento da lei, risco de apontamento e economia local subaproveitada."}</div>
        </div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>FNDE</b> — dados da agricultura familiar no PNAE. Percentual do valor transferido aplicado em compras da agricultura familiar (mínimo legal 30%, Lei 11.947/2009). Exercício {d.ano} (preliminar).</Fonte>
    </Card>
  );
}

export function PddeSaldoPanel({ d }: { d: Un<ReturnType<typeof getPddeSaldoSC>> }) {
  return (
    <Card icon={<Wallet className="h-4 w-4" />} titulo="Recurso na mesa — verba escolar parada (PDDE/FNDE)" cor="#ea580c"
      csv={<BaixarCsv nome="pdde-saldo-na-mesa" label="CSV" linhas={[{ indicador: "Saldo PDDE acumulado (não executado)", valor: d.saldo }, { indicador: "Escolas/UEx com saldo", valor: d.escolas }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Saldo do PDDE parado nas escolas</div><div className="font-display text-2xl font-bold tabular-nums text-orange-600">{brl(d.saldo)}</div><div className="text-[10px] text-slate-400">{n0(d.escolas)} escolas/UEx · exercício {d.ano}</div></div>
        <div className="ml-auto max-w-xs rounded-lg border border-orange-200 bg-orange-50/60 p-2.5">
          <div className="text-[11px] font-semibold text-orange-700">💰 Verba na conta da escola</div>
          <div className="text-[10px] text-slate-600">É dinheiro do Programa Dinheiro Direto na Escola já transferido e <b>não gasto</b>. Saldo acumulado alto = subutilização + risco de pendência na prestação de contas.</div>
        </div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>FNDE</b> — Plataforma Antonieta de Barros, saldo acumulado das Unidades Executoras (UEx) do PDDE por escola, agregado por município. Exercício {d.ano}.</Fonte>
    </Card>
  );
}

export function SuasSaldoPanel({ d }: { d: Un<ReturnType<typeof getSuasSaldoSC>> }) {
  const alto = d.mesesParado != null && d.mesesParado >= 3;
  const cor = alto ? "#dc2626" : d.saldo > 0 ? "#ea580c" : "#16a34a";
  return (
    <Card icon={<Wallet className="h-4 w-4" />} titulo="Recurso na mesa — saldo do SUAS (MDS/FNAS)" cor={cor}
      csv={<BaixarCsv nome="suas-saldo-na-mesa" label="CSV" linhas={[{ indicador: "Saldo em conta (não usado)", valor: d.saldo }, { indicador: "Repasse do mês", valor: d.repasseMes }, { indicador: "Meses de repasse parados", valor: d.mesesParado ?? "" }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Saldo do SUAS parado em conta</div><div className="font-display text-2xl font-bold tabular-nums" style={{ color: cor }}>{brl(d.saldo)}</div><div className="text-[10px] text-slate-400">competência {d.competencia} · repasse/mês {brl(d.repasseMes)}</div></div>
        {d.mesesParado != null && <div><div className="text-[11px] text-slate-500">Equivale a</div><div className="font-display text-xl font-bold tabular-nums" style={{ color: cor }}>{d.mesesParado.toLocaleString("pt-BR")} meses</div><div className="text-[10px] text-slate-400">de repasse acumulado</div></div>}
        <div className="ml-auto max-w-xs rounded-lg border p-2.5" style={{ borderColor: alto ? "#fecaca" : "#fed7aa", background: alto ? "#fef2f2" : "#fff7ed" }}>
          <div className="text-[11px] font-semibold" style={{ color: cor }}>{alto ? "⚠️ Saldo alto parado" : "💰 Recurso disponível"}</div>
          <div className="text-[10px] text-slate-600">É cofinanciamento federal do SUAS já transferido e <b>não executado</b>. Saldo alto acumulado sinaliza risco de bloqueio de novas parcelas e subutilização dos serviços socioassistenciais.</div>
        </div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério do Desenvolvimento e Assistência Social (MDS) / SAGI</b> — repasses e saldo do cofinanciamento SUAS por município (base MI Social). Saldo = recurso transferido ainda em conta.</Fonte>
    </Card>
  );
}

export function FarmaciaPopularPanel({ d }: { d: Un<ReturnType<typeof getFarmaciaPopularSC>> }) {
  const semNenhuma = d.nFarmacias === 0;
  return (
    <Card icon={<Cross className="h-4 w-4" />} titulo="Farmácia Popular — cobertura (Min. Saúde/SECTICS)" cor={semNenhuma ? "#dc2626" : "#16a34a"}
      csv={<BaixarCsv nome="farmacia-popular" label="CSV" linhas={[{ indicador: "Farmácias credenciadas", valor: d.nFarmacias }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Farmácias credenciadas no município</div><div className="font-display text-2xl font-bold tabular-nums" style={{ color: semNenhuma ? "#dc2626" : "#16a34a" }}>{n0(d.nFarmacias)}</div></div>
        {semNenhuma && <div className="max-w-xs rounded-lg border border-red-200 bg-red-50/60 p-2.5"><div className="text-[11px] font-semibold text-red-700">⚠️ Nenhuma Farmácia Popular</div><div className="text-[10px] text-slate-600">O município não tem acesso ao "Aqui Tem Farmácia Popular" (medicamento gratuito). Lacuna direta — pauta de credenciamento junto ao Min. Saúde/SECTICS.</div></div>}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Programa federal de acesso a medicamentos essenciais (hipertensão, diabetes, asma etc.) por farmácias privadas credenciadas.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério da Saúde / SECTICS</b> — Programa Farmácia Popular do Brasil (PFPB), via painel oficial (LocalizaSUS). Farmácias credenciadas por município.</Fonte>
    </Card>
  );
}

export function MortalidadeInfantilPanel({ d }: { d: Un<ReturnType<typeof getMortalidadeInfantilSC>> }) {
  const acima = d.tmi != null && d.tmiSC != null && d.tmi > d.tmiSC;
  const cor = d.tmi == null ? "#94a3b8" : d.tmi > 15 ? "#dc2626" : acima ? "#ea580c" : "#16a34a";
  return (
    <Card icon={<HeartCrack className="h-4 w-4" />} titulo="Mortalidade infantil (SIM + SINASC)" cor={cor}
      csv={<BaixarCsv nome="mortalidade-infantil" label="CSV" linhas={d.serie as unknown as Row[]} colunas={[{ chave: "ano", rotulo: "Ano" }, { chave: "valor", rotulo: "TMI (por mil)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Óbitos &lt;1 ano por mil nascidos</div><div className="font-display text-2xl font-bold tabular-nums" style={{ color: cor }}>{d.tmi ?? "—"}</div><div className="text-[10px] text-slate-400">{n0(d.obitos)} óbitos / {n0(d.nascimentos)} nascidos ({d.ano})</div></div>
        <div><div className="text-[11px] text-slate-500">Média de SC</div><div className="font-display text-base font-bold tabular-nums text-slate-600">{d.tmiSC ?? "—"}</div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">TMI por ano</div><Spark pts={d.serie.map((s) => s.valor)} cor={cor} /></div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Indicador-síntese da qualidade da atenção materno-infantil. {acima ? <b className="text-orange-600">Acima da média de SC</b> : "No/abaixo do patamar de SC"}. Referência: Brasil ~13/mil; SC é uma das menores do país.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>DATASUS SIM</b> (óbitos infantis) ÷ <b>SINASC</b> (nascidos vivos), por município de residência. Mesmo cálculo usado pela SVSA/Ministério da Saúde.</Fonte>
    </Card>
  );
}

export function SisaguaPanel({ d }: { d: Un<ReturnType<typeof getSisaguaSC>> }) {
  const cor = d.pctFora >= 20 ? "#dc2626" : d.pctFora >= 5 ? "#ea580c" : "#16a34a";
  return (
    <Card icon={<GlassWater className="h-4 w-4" />} titulo="Qualidade da água potável (Min. Saúde · SISAGUA)" cor={cor}
      csv={<BaixarCsv nome="sisagua-agua" label="CSV" linhas={[{ indicador: "Amostras fora do padrão (%)", valor: d.pctFora }, { indicador: "Amostras fora do padrão (nº)", valor: d.foraPadrao }, { indicador: "Amostras analisadas", valor: d.analisadas }] as unknown as Row[]} colunas={[{ chave: "indicador", rotulo: "Indicador" }, { chave: "valor", rotulo: "Valor" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Amostras fora do padrão de potabilidade</div><div className="font-display text-2xl font-bold tabular-nums" style={{ color: cor }}>{d.pctFora.toLocaleString("pt-BR")}%</div><div className="text-[10px] text-slate-400">{n0(d.foraPadrao)} de {n0(d.analisadas)} análises ({d.ano})</div></div>
        <div className="ml-auto max-w-xs rounded-lg border border-sky-200 bg-sky-50/50 p-2.5">
          <div className="text-[11px] font-semibold text-sky-800">💡 Para captar recurso</div>
          <div className="text-[10px] text-slate-600">Este é o dado que o <b>Ministério da Saúde</b> (VIGIÁGUA) consulta ao liberar recursos de vigilância/tratamento da água. Para <b>infraestrutura</b> de saneamento, o Min. das Cidades usa o <b>SNIS</b> — bases distintas, use cada uma no ministério certo.</div>
        </div>
      </div>
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério da Saúde — SISAGUA</b> (Sistema de Informação de Vigilância da Qualidade da Água para Consumo Humano), via LocalizaSUS. % de amostras em desacordo com o padrão de potabilidade (Portaria GM/MS 888/2021).</Fonte>
    </Card>
  );
}

export function CoberturaVacinalPanel({ d }: { d: Un<ReturnType<typeof getCoberturaVacinalSC>> }) {
  return (
    <Card icon={<Syringe className="h-4 w-4" />} titulo="Cobertura vacinal por vacina (PNI)" cor={d.nAbaixoMeta > 0 ? "#dc2626" : "#16a34a"}
      csv={<BaixarCsv nome="cobertura-vacinal" label="CSV" linhas={d.vacinas.flatMap((v) => v.serie.map((s) => ({ vacina: v.vacina, ano: s.ano, cobertura: s.valor }))) as unknown as Row[]} colunas={[{ chave: "vacina", rotulo: "Vacina" }, { chave: "ano", rotulo: "Ano" }, { chave: "cobertura", rotulo: "Cobertura (%)" }]} />}>
      <div className="mt-1 text-[11px] text-slate-500">Meta do PNI: <b>95%</b> (a maioria das vacinas). Referência {d.ano}.</div>
      <div className="mt-2 space-y-1.5">
        {d.vacinas.map((v) => (
          <div key={v.vacina} className="flex items-center gap-2 text-xs">
            <span className="w-40 shrink-0 truncate text-slate-600" title={v.vacina}>{v.vacina}</span>
            <div className="h-3.5 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-3.5 rounded" style={{ width: `${Math.min(v.cobertura, 100)}%`, backgroundColor: v.abaixoMeta ? "#dc2626" : "#16a34a" }} /></div>
            <span className={`w-14 shrink-0 text-right font-bold tabular-nums ${v.abaixoMeta ? "text-red-600" : "text-emerald-700"}`}>{Math.round(v.cobertura)}%</span>
            <span className="w-24 shrink-0"><Spark pts={v.serie.map((s) => s.valor)} cor={v.abaixoMeta ? "#dc2626" : "#16a34a"} /></span>
          </div>
        ))}
      </div>
      {d.nAbaixoMeta > 0 && <p className="mt-2 text-[11px] font-medium text-red-600">⚠️ {d.nAbaixoMeta} vacina(s) abaixo da meta de 95% — risco de reintrodução de doenças evitáveis.</p>}
      <Fonte extraido={d.extraido}>Fonte: <b>Ministério da Saúde / SI-PNI</b> — Cobertura Vacinal do Calendário Nacional por município de residência (fonte RNDS). Medida oficial de cobertura do painel LocalizaSUS. Série completa <b>2015-2026</b> — o vale de 2020-2021 reflete a queda de cobertura na pandemia.</Fonte>
    </Card>
  );
}

export function RaasSaudeMentalPanel({ d }: { d: Un<ReturnType<typeof getRaasSaudeMentalSC>> }) {
  return (
    <Card icon={<Brain className="h-4 w-4" />} titulo="Saúde mental — rede psicossocial (CAPS / RAAS)" cor="#9333ea">
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Atendimentos psicossociais</div><div className="font-display text-2xl font-bold tabular-nums text-purple-700">{n0(d.atendimentos)}</div><div className="text-[10px] text-slate-400">{n0(d.registros)} registros (RAAS) · {d.periodo}</div></div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Produção da rede de atenção psicossocial (CAPS) para os moradores do município. Municípios sem CAPS não aparecem — sinal de possível vazio assistencial em saúde mental.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>DATASUS / SIA-RAAS</b> (Registro das Ações Ambulatoriais — Psicossocial). Por município de residência. Descompactado do DBC.</Fonte>
    </Card>
  );
}

export function ApacPanel({ d }: { d: Un<ReturnType<typeof getApacSC>> }) {
  return (
    <Card icon={<Ribbon className="h-4 w-4" />} titulo="Alta complexidade — oncologia e diálise (APAC)" cor="#db2777"
      csv={<BaixarCsv nome="apac-alta-complexidade" label="CSV" linhas={[{ tratamento: "Oncologia (quimio+radio)", apac: d.oncoApac, valor: d.oncoValor }, { tratamento: "Diálise (TRS)", apac: d.dialiseApac, valor: d.dialiseValor }] as unknown as Row[]} colunas={[{ chave: "tratamento", rotulo: "Tratamento" }, { chave: "apac", rotulo: "APAC" }, { chave: "valor", rotulo: "Valor (R$)" }]} />}>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-pink-200 bg-pink-50/40 p-2.5"><div className="text-[11px] text-slate-500">Oncologia (quimio + radioterapia)</div><div className="font-display text-xl font-bold tabular-nums text-pink-700">{brl(d.oncoValor)}</div><div className="text-[10px] text-slate-400">{n0(d.oncoApac)} autorizações (APAC) no período</div></div>
        <div className="rounded-lg border border-cyan-200 bg-cyan-50/40 p-2.5"><div className="text-[11px] text-slate-500">Diálise (terapia renal substitutiva)</div><div className="font-display text-xl font-bold tabular-nums text-cyan-700">{brl(d.dialiseValor)}</div><div className="text-[10px] text-slate-400">{n0(d.dialiseApac)} autorizações (APAC) no período</div></div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Cada APAC ≈ um paciente-mês em tratamento continuado. Revela a demanda de alta complexidade dos moradores do município (câncer e doença renal crônica).</p>
      <Fonte extraido={d.extraido}>Fonte: <b>DATASUS / SIA-APAC</b> (Autorização de Procedimentos de Alta Complexidade). Por município de residência, período {d.periodo}. Descompactado do DBC.</Fonte>
    </Card>
  );
}

export function ProfissionaisSaudePanel({ d }: { d: Un<ReturnType<typeof getProfissionaisSaudeSC>> }) {
  const cel = (t: string, v: number, cor: string) => (
    <div className="rounded-lg border p-2.5 text-center" style={{ borderColor: cor + "40", backgroundColor: cor + "0d" }}>
      <div className="font-display text-lg font-bold tabular-nums" style={{ color: cor }}>{n0(v)}</div><div className="text-[10px] text-slate-500">{t}</div>
    </div>
  );
  return (
    <Card icon={<Stethoscope className="h-4 w-4" />} titulo="Força de trabalho em saúde (CNES)" cor="#0d9488"
      csv={<BaixarCsv nome="profissionais-saude" label="CSV" linhas={[{ categoria: "Médicos", n: d.medicos }, { categoria: "Enfermeiros", n: d.enfermeiros }, { categoria: "Dentistas", n: d.dentistas }, { categoria: "Téc. enfermagem", n: d.tecEnf }, { categoria: "Agentes comunitários", n: d.acs }] as unknown as Row[]} colunas={[{ chave: "categoria", rotulo: "Categoria" }, { chave: "n", rotulo: "Profissionais" }]} />}>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {cel("médicos", d.medicos, "#0d9488")}
        {cel("enfermeiros", d.enfermeiros, "#0891b2")}
        {cel("dentistas", d.dentistas, "#7c3aed")}
        {cel("téc. enfermagem", d.tecEnf, "#ca8a04")}
        {cel("ag. comunitários", d.acs, "#16a34a")}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Médicos por mil habitantes</div><div className="font-display text-xl font-bold tabular-nums text-teal-700">{d.medicosPorMil ?? "—"}</div><div className="text-[10px] text-slate-400">referência SUS: ~1,0/mil · ano {d.ano}</div></div>
        <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">médicos por ano</div><Spark pts={d.serieMedicos.map((s) => s.valor)} cor="#0d9488" /></div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Profissionais distintos (por CPF) que atuam no município — inclui rede pública e privada. Um mesmo profissional pode atender em mais de um município.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>DATASUS / CNES</b> — cadastro de profissionais (arquivo PF). Categorias por CBO. Descompactado do DBC.</Fonte>
    </Card>
  );
}

export function SinanAgravosPanel({ d }: { d: Un<ReturnType<typeof getSinanAgravosSC>> }) {
  return (
    <Card icon={<ShieldAlert className="h-4 w-4" />} titulo="Agravos de notificação (SINAN)" cor="#be123c"
      csv={<BaixarCsv nome="sinan-agravos" label="CSV" linhas={d.agravos.flatMap((a) => a.serie.map((s) => ({ agravo: a.nome, ano: s.ano, casos: s.valor }))) as unknown as Row[]} colunas={[{ chave: "agravo", rotulo: "Agravo" }, { chave: "ano", rotulo: "Ano" }, { chave: "casos", rotulo: "Casos" }]} />}>
      <div className="mt-2 space-y-3">
        {d.agravos.map((a) => (
          <div key={a.agravo} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[9rem]"><div className="text-[11px] text-slate-500">{a.nome}</div><div className="font-display text-xl font-bold tabular-nums text-rose-700">{n0(a.ultimo)}</div><div className="text-[10px] text-slate-400">casos notificados ({a.ultimoAno})</div></div>
            <div className="ml-auto w-44"><div className="text-[10px] text-slate-400">casos por ano</div><Spark pts={a.serie.map((s) => s.valor)} cor="#be123c" /></div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Casos por município de residência. Vigilância epidemiológica — subsidia ações de prevenção e proteção.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>DATASUS / SINAN</b> — Sistema de Informação de Agravos de Notificação. Descompactado do DBC.</Fonte>
    </Card>
  );
}

export function MedicamentosPanel({ d }: { d: Un<ReturnType<typeof getMedicamentosSC>> }) {
  return (
    <Card icon={<Pill className="h-4 w-4" />} titulo="Medicamentos de alto custo (SUS — CEAF)" cor="#7c3aed"
      csv={<BaixarCsv nome="medicamentos-alto-custo" label="CSV" linhas={d.topMeds as unknown as Row[]} colunas={[{ chave: "nome", rotulo: "Medicamento" }, { chave: "valor", rotulo: "Valor (R$)" }]} />}>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div><div className="text-[11px] text-slate-500">Dispensado no período</div><div className="font-display text-2xl font-bold tabular-nums text-violet-700">{brl(d.valor)}</div><div className="text-[10px] text-slate-400">{n0(d.quantidade)} unidades ({d.periodo})</div></div>
      </div>
      {d.topMeds.length > 0 && <div className="mt-2"><div className="text-[11px] text-slate-500 mb-1">Principais medicamentos (por valor):</div><div className="flex flex-wrap gap-1.5">{d.topMeds.map((m) => <span key={m.nome} className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] text-violet-700">{m.nome.toLowerCase()}: <b>{brl(m.valor)}</b></span>)}</div></div>}
      <Fonte extraido={d.extraido}>Fonte: <b>DATASUS / SIA-SUS</b> (Componente Especializado da Assistência Farmacêutica — CEAF) + <b>SIGTAP</b>. Medicamentos de alto custo dispensados aos moradores do município. Descompactado do DBC.</Fonte>
    </Card>
  );
}

export function SiaProducaoPanel({ d }: { d: Un<ReturnType<typeof getSiaProducaoSC>> }) {
  const total = d.basicaVal + d.mediaVal + d.altaVal;
  const linha = (t: string, q: number, v: number, cor: string) => (
    <div className="rounded-lg border p-2.5" style={{ borderColor: cor + "40", backgroundColor: cor + "0d" }}>
      <div className="text-[11px] text-slate-500">{t}</div><div className="font-display text-lg font-bold tabular-nums" style={{ color: cor }}>{brl(v)}</div><div className="text-[10px] text-slate-400">{n0(q)} procedimentos</div>
    </div>
  );
  return (
    <Card icon={<Activity className="h-4 w-4" />} titulo="Produção ambulatorial SUS por complexidade (SIA)" cor="#0891b2"
      csv={<BaixarCsv nome="sia-producao" label="CSV" linhas={[{ complexidade: "Atenção básica", quantidade: d.basicaQtd, valor: d.basicaVal }, { complexidade: "Média complexidade", quantidade: d.mediaQtd, valor: d.mediaVal }, { complexidade: "Alta complexidade", quantidade: d.altaQtd, valor: d.altaVal }] as unknown as Row[]} colunas={[{ chave: "complexidade", rotulo: "Complexidade" }, { chave: "quantidade", rotulo: "Procedimentos" }, { chave: "valor", rotulo: "Valor (R$)" }]} />}>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-green-200 bg-green-50/40 p-2.5"><div className="text-[11px] text-slate-500">Atenção básica (equipes municipais)</div><div className="font-display text-lg font-bold tabular-nums text-green-700">{n0(d.basicaQtd)}</div><div className="text-[10px] text-slate-400">procedimentos · valor via capitação (PAB)</div></div>
        {linha("Média complexidade", d.mediaQtd, d.mediaVal, "#ea580c")}
        {linha("Alta complexidade", d.altaQtd, d.altaVal, "#dc2626")}
      </div>
      {d.macGrupos.length > 0 && (() => { const maxG = Math.max(1, ...d.macGrupos.map((g) => g.valor)); return (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">MAC por grupo de procedimento (SIGTAP)</div>
          <div className="space-y-1">
            {d.macGrupos.map((g) => (
              <div key={g.grupo} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 truncate text-slate-600" title={g.grupo}>{g.grupo}</span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-3 rounded bg-cyan-500" style={{ width: `${(g.valor / maxG) * 100}%` }} /></div>
                <span className="w-24 shrink-0 text-right tabular-nums text-slate-700">{brl(g.valor)}</span>
                <span className="w-20 shrink-0 text-right tabular-nums text-slate-400">{n0(g.quantidade)}</span>
              </div>
            ))}
          </div>
        </div>
      ); })()}
      <p className="mt-2 text-[11px] text-slate-500">A <b>atenção básica</b> é a produção das equipes municipais (ESF/APS) — o valor aparece como R$0 porque é financiada por <b>capitação (PAB)</b>, não por procedimento (mensure pela quantidade). <b>Média+alta complexidade (MAC): {brl(total)}</b> no período.</p>
      <Fonte extraido={d.extraido}>Fonte: <b>DATASUS / SIA-SUS</b> (produção ambulatorial) + <b>SIGTAP</b> (complexidade). Por município de residência, período {d.periodo}. Medicamentos (grupo 06, contados por comprimido) excluídos para refletir procedimentos. Descompactado do DBC.</Fonte>
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
