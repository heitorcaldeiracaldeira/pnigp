"use client";

// "Evoluir a gestão com o Instituto i10" — a plataforma IDENTIFICA a necessidade (diagnóstico data-driven) e o
// Instituto i10 EXECUTA (catálogo de PRODUTOS i10). Princípio do usuário: "se eu gero a demanda, eu quero atender".
// Camadas: (1) Pontos de atenção detectados; (2) Recomendados para o município (frentes data-driven, page.tsx);
// (3) Catálogo completo de soluções i10; (4) Estudo de compras públicas (produto i10). SEM parceiros nomeados.
import { Sparkles, ArrowRight, Mail, TrendingUp, LayoutGrid, Scale, ShieldCheck, TriangleAlert, ClipboardList } from "lucide-react";
import type { AusenciaMunic } from "@/lib/planos-ausentes";

export type PontoAtencao = { severidade: string; area: string; titulo: string; detalhe: string };

export type FrenteI10 = {
  area: string;            // rótulo curto (chip)
  cor: string;             // classe de cor do chip
  titulo: string;          // o que dá para melhorar
  diagnostico: string;     // a situação atual (dado real)
  ganho?: string;          // o potencial estimado (número), quando houver
  acao: string;            // o que fazer
  servico: string;         // o produto i10 que apoia
};

const CONTATO = "contato@i10.org.br";

// Catálogo completo de PRODUTOS i10 — organizado por eixo. Estático: é o menu de tudo que o i10 entrega.
const CATALOGO: { grupo: string; cor: string; itens: string[] }[] = [
  { grupo: "Receita & Finanças", cor: "bg-teal-100 text-teal-700", itens: [
    "Recuperação de receita própria (IPTU/ISS/ITBI e dívida ativa)",
    "Atualização da planta genérica de valores (PGV) e recadastramento imobiliário",
    "Gestão fiscal e adequação à LRF",
    "Renegociação e gestão da dívida pública",
    "Previdência própria (RPPS): avaliação atuarial, equacionamento e CRP",
  ] },
  { grupo: "Captação de recursos", cor: "bg-amber-100 text-amber-700", itens: [
    "Montagem do caderno de emendas (federais e estaduais) — do diagnóstico ao ofício ao parlamentar",
    "Emendas parlamentares (federal e estadual): articulação e acompanhamento",
    "Convênios e Transferegov",
    "Elaboração, recuperação e reuso de projetos",
    "Prospecção de editais e programas (federais, estaduais e internacionais)",
  ] },
  { grupo: "Áreas sociais", cor: "bg-rose-100 text-rose-700", itens: [
    "Educação: tempo integral, FUNDEB, BNCC e PAR/FNDE",
    "Saúde: Atenção Primária, Previne e financiamento do SUS",
    "Assistência social: SUAS, cofinanciamento e CadÚnico",
  ] },
  { grupo: "Infraestrutura & Cidade", cor: "bg-sky-100 text-sky-700", itens: [
    "Saneamento: estudos de concessão e PPP",
    "Habitação de interesse social: projetos e captação (SNHIS/FGTS)",
    "Resíduos sólidos: planos, consórcios e concessão",
    "Iluminação pública: PPP e eficiência energética",
    "Mobilidade, pavimentação e obras",
    "Desenvolvimento rural: extensão, PRONAF, CAF e CAR",
  ] },
  { grupo: "Gestão & Modernização", cor: "bg-indigo-100 text-indigo-700", itens: [
    "Governança e planejamento (PPA/LDO/LOA)",
    "Modernização legislativa: Código Tributário, Plano Diretor, Lei Orgânica, códigos de obras e posturas",
    "Controle interno, compliance e transparência (LGPD)",
    "Compras públicas (Lei 14.133): planejamento, preço de referência e capacitação",
    "Sistemas de informação e transformação digital",
    "Gestão de pessoas, concursos e capacitação de servidores",
  ] },
  { grupo: "Desenvolvimento & Território", cor: "bg-lime-100 text-lime-700", itens: [
    "Desenvolvimento econômico e atração de investimentos",
    "Defesa civil e gestão de riscos",
    "Meio ambiente e licenciamento",
    "Turismo e cultura",
  ] },
];

// Estudo de compras públicas — produto i10 (Lei 14.133). Exibido na aba Soluções i10.
export const COMPRAS_I10: { titulo: string; desc: string }[] = [
  { titulo: "Adequação à Lei 14.133/2021", desc: "Regulamentos, fluxos e minutas-padrão; migração definitiva da 8.666 para o novo regime." },
  { titulo: "Planejamento das contratações (PCA)", desc: "Plano de Contratações Anual, estudo técnico preliminar (ETP) e gestão de riscos." },
  { titulo: "Preço de referência e pesquisa de mercado", desc: "Metodologia de preço item-a-item que sustenta o valor estimado e combate o sobrepreço." },
  { titulo: "Capacitação de pregoeiros e comissões", desc: "Formação continuada da equipe de licitação e dos fiscais de contrato." },
  { titulo: "Assessoria técnica e defesa em TCE/TCU", desc: "Pareceres, respostas a apontamentos e sustentação técnica dos processos." },
  { titulo: "Gestão e fiscalização de contratos", desc: "Rotinas de acompanhamento, reequilíbrio e aplicação de penalidades conforme a nova lei." },
];

// Estudo de compras públicas — produto i10, renderizado na aba Soluções i10.
export function EstudoComprasI10({ nome }: { nome: string }) {
  const mailto = `mailto:${CONTATO}?subject=${encodeURIComponent(`Compras públicas — ${nome}`)}&body=${encodeURIComponent(`Olá, Instituto i10.\n\nSou gestor(a) de ${nome} e gostaria de conversar sobre a estruturação das compras públicas (Lei 14.133).\n\nAtenciosamente,`)}`;
  return (
    <section className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-5">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Scale aria-hidden className="h-4 w-4 text-orange-600" /> Estruturar as compras públicas — solução i10</div>
      <p className="mt-1 text-[12px] text-slate-600">O Instituto i10 apoia {nome} a transformar o diagnóstico de compras desta plataforma em conformidade, economia e segurança jurídica sob a Lei 14.133/2021.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COMPRAS_I10.map((c) => (
          <div key={c.titulo} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-1.5 text-[13px] font-semibold text-slate-800"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" /> {c.titulo}</div>
            <p className="mt-1 text-[11px] text-slate-500">{c.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col items-start gap-2 rounded-xl border border-orange-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[12px] text-slate-700"><b>Da análise à contratação segura.</b> Estruture o setor de licitações de {nome} sob a nova lei.</div>
        <a href={mailto} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-orange-700">
          <Mail className="h-4 w-4" /> Falar sobre compras
        </a>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Solução i10 de compras públicas. Contato: {CONTATO}. A decisão de contratar é discricionária do órgão.</p>
    </section>
  );
}

const brlMi = (v: number) => v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)} mi` : v >= 1e3 ? `R$ ${(v / 1e3).toFixed(0)} mil` : `R$ ${v.toFixed(0)}`;

export function PlanoEvolucaoI10({ nome, frentes, pontos = [], ausencias = [], resumo }: { nome: string; frentes: FrenteI10[]; pontos?: PontoAtencao[]; ausencias?: AusenciaMunic[]; resumo?: { oportunidade: number; nRiscos: number; nProjetos: number } }) {
  const assunto = encodeURIComponent(`Apoio à gestão — ${nome}`);
  const corpo = encodeURIComponent(
    `Olá, Instituto i10.\n\nSou gestor(a) de ${nome} e gostaria de conversar sobre apoio nas seguintes frentes:\n\n` +
    (frentes.length ? frentes.map((f, i) => `${i + 1}. ${f.titulo} (${f.servico})`).join("\n") : "(descrever a necessidade)") +
    `\n\nPodemos agendar uma conversa?\n\nAtenciosamente,`
  );
  const mailto = `mailto:${CONTATO}?subject=${assunto}&body=${corpo}`;

  return (
    <section className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Sparkles aria-hidden className="h-4 w-4 text-indigo-600" /> Evoluir a gestão de {nome} — soluções do Instituto i10</div>
      <p className="mt-1 text-[12px] text-slate-600">A plataforma <b>identifica a necessidade</b> a partir do dado oficial; o <b>Instituto i10 executa</b>. Abaixo, o que tem maior alavancagem para {nome} agora — e o catálogo completo de soluções. Estimativas orientativas; a priorização é do gestor.</p>

      {resumo && (resumo.oportunidade > 0 || resumo.nRiscos > 0 || resumo.nProjetos > 0) && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-center">
            <div className="font-display text-lg font-bold tabular-nums text-emerald-700">{resumo.oportunidade > 0 ? `até ${brlMi(resumo.oportunidade)}` : "—"}</div>
            <div className="text-[10px] font-medium text-slate-500">oportunidade mapeada na mesa</div>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-center">
            <div className="font-display text-lg font-bold tabular-nums text-sky-700">{resumo.nProjetos}</div>
            <div className="text-[10px] font-medium text-slate-500">projetos federais captáveis</div>
          </div>
          <div className={`rounded-xl border p-3 text-center ${resumo.nRiscos > 0 ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-slate-50"}`}>
            <div className={`font-display text-lg font-bold tabular-nums ${resumo.nRiscos > 0 ? "text-rose-700" : "text-slate-400"}`}>{resumo.nRiscos}</div>
            <div className="text-[10px] font-medium text-slate-500">pontos de atenção a regularizar</div>
          </div>
        </div>
      )}

      {pontos.length > 0 && (
        <>
          <div className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-rose-700"><TriangleAlert className="h-3.5 w-3.5" /> Pontos de atenção em {nome} — o que a plataforma detectou</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {pontos.map((p, i) => {
              const crit = p.severidade === "critico";
              return (
                <div key={i} className={`rounded-xl border p-3 ${crit ? "border-rose-200 bg-rose-50/60" : "border-amber-200 bg-amber-50/50"}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${crit ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{crit ? "Crítico" : "Atenção"}</span>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{p.area}</span>
                  </div>
                  <div className="mt-1 text-[12px] font-semibold text-slate-800">{p.titulo}</div>
                  <p className="mt-0.5 text-[11px] text-slate-500">{p.detalhe}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">Cada ponto acima é uma demanda que o Instituto i10 pode atender — veja as frentes recomendadas e o catálogo abaixo.</p>
        </>
      )}

      {ausencias.length > 0 && (
        <>
          <div className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-violet-700"><ClipboardList className="h-3.5 w-3.5" /> Planos e instrumentos ausentes — portas de recurso fechadas</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ausencias.map((a, i) => (
              <div key={i} className={`rounded-xl border p-3 ${a.prioridade === "alta" ? "border-violet-300 bg-violet-50/60" : "border-slate-200 bg-slate-50/50"}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.prioridade === "alta" ? "bg-violet-100 text-violet-700" : "bg-slate-200 text-slate-600"}`}>{a.prioridade === "alta" ? "Prioritário" : "Recomendado"}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{a.area}</span>
                </div>
                <div className="mt-1 text-[12px] font-semibold text-slate-800">Falta: {a.item}</div>
                <p className="mt-0.5 text-[11px] text-slate-500">{a.consequencia}</p>
                <p className="mt-1 text-[10px] text-slate-400">{a.base}</p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">Fonte: IBGE MUNIC. Cada ausência é uma porta de recurso fechada — o Instituto i10 elabora o plano/instrumento e a lei correspondente para destravá-la.</p>
        </>
      )}

      {frentes.length > 0 && (
        <>
          <div className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-indigo-700"><TrendingUp className="h-3.5 w-3.5" /> Recomendado para {nome}</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {frentes.map((f, i) => (
              <div key={i} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${f.cor}`}>{f.area}</span>
                  {f.ganho && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><TrendingUp className="h-3 w-3" /> {f.ganho}</span>}
                </div>
                <div className="mt-1.5 text-[13px] font-semibold text-slate-800">{f.titulo}</div>
                <p className="mt-0.5 text-[11px] text-slate-500">{f.diagnostico}</p>
                <div className="mt-2 flex items-start gap-1 text-[11px] text-slate-600"><ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-indigo-500" /> <span><b>O que fazer:</b> {f.acao}</span></div>
                <div className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] text-indigo-700"><b>Solução i10:</b> {f.servico}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-slate-700"><LayoutGrid className="h-3.5 w-3.5" /> Catálogo completo de soluções i10</div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CATALOGO.map((g) => (
          <div key={g.grupo} className="rounded-xl border border-slate-200 bg-white p-4">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.cor}`}>{g.grupo}</span>
            <ul className="mt-2 space-y-1">
              {g.itens.map((it) => (
                <li key={it} className="flex items-start gap-1.5 text-[11px] text-slate-600"><span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-400" /> {it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col items-start gap-2 rounded-xl border border-indigo-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[12px] text-slate-700"><b>A demanda que a plataforma revela, o Instituto i10 atende.</b> Recuperação de receita, captação, concessões, habitação, modernização e mais — do diagnóstico à execução.</div>
        <a href={mailto} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700">
          <Mail className="h-4 w-4" /> Falar com o Instituto i10
        </a>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Contato: {CONTATO}. Análises com base em dados públicos oficiais; estimativas orientativas, não constituem garantia de resultado.</p>
    </section>
  );
}
