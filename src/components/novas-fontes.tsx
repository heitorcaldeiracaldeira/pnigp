// Painéis das novas fontes (eixos econômico/ambiental/social/saúde). Server components, compactos.
// Padrão: dado + série + carimbo de origem COM data de extração + CSV. (atende à diretriz de proveniência + exportação.)
import type { getBndesSC, getCfemSC, getAnpSC, getQueimadasSC, getBolsaAtletaSC, getVitaisSC, getAnsCoberturaSC, getEquipamentosEsporteSC, getCagedSC } from "@/lib/queries";
import { BaixarCsv } from "./baixar-csv";
import { Landmark, Mountain, Fuel, Flame, Medal, HeartPulse, ShieldPlus, MapPin, Briefcase, Database } from "lucide-react";

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
