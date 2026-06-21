// Catálogo EXAUSTIVO de dados municipais que a plataforma pode ter. Discreta (fora do menu, noindex).
export const metadata = { title: "PNIGP — Dados Municipais (catálogo completo)", robots: { index: false, follow: false } };
export const dynamic = "force-static";

type L = { d: string; f: string; s: "tem" | "facil" | "medio" | "dificil"; u: string };
const SEC: { a: string; i: L[] }[] = [
  { a: "👥 Identidade & demografia", i: [
    { d: "Municípios, UF, região, população, domicílios", f: "IBGE (Censo 2022, malhas)", s: "tem", u: "base de tudo, comparação por porte" },
    { d: "População por idade/sexo, projeções", f: "IBGE", s: "facil", u: "demanda por serviço (creche, idoso)" },
    { d: "IDHM (renda, educação, longevidade)", f: "Atlas Brasil / PNUD", s: "facil", u: "índice de desenvolvimento humano" },
    { d: "IFDM (emprego, saúde, educação)", f: "Firjan (anual desde 2008)", s: "facil", u: "desenvolvimento socioeconômico, série" },
  ]},
  { a: "💰 Finanças municipais", i: [
    { d: "Receita/despesa, MDE, ASPS, RCL, dívida, função/subfunção", f: "SICONFI/Tesouro (RREO/RGF/DCA)", s: "tem", u: "painel fiscal + drill" },
    { d: "Receitas nominais (IPTU, ISS, FPM, ICMS, IPVA, FUNDEB)", f: "SICONFI An.3", s: "tem", u: "de onde vem o dinheiro" },
    { d: "Cota do FPM (mensal)", f: "Tesouro / FNP", s: "facil", u: "fluxo de caixa, dependência" },
    { d: "Royalties de petróleo / CFEM (mineração)", f: "ANP / ANM", s: "medio", u: "receita extraordinária por região" },
    { d: "Emendas parlamentares e convênios", f: "Transferegov / Portal Transparência", s: "facil", u: "recurso federal + execução" },
  ]},
  { a: "🛒 Compras & fornecedores", i: [
    { d: "Processos, contratos, itens, atas (preço unitário)", f: "PNCP", s: "tem", u: "sobrepreço, comportamento, B2B" },
    { d: "Empresas ativas, CNAE, porte, situação", f: "Receita Federal (CNPJ) / Mapa de Empresas", s: "facil", u: "inteligência de mercado, due diligence" },
    { d: "Sanções a empresas (CEIS, CNEP, CEPIM)", f: "Portal da Transparência", s: "facil", u: "risco de fornecedor (B2B)" },
  ]},
  { a: "🏥 Saúde", i: [
    { d: "Repasses FNS, Previne (APS), SIH/SIA, CNES, RPPS atuarial", f: "Min. Saúde / DATASUS / CADPREV", s: "tem", u: "cadeia 💰→🏭→❤️, previdência" },
    { d: "Óbitos (SIM) e nascimentos (SINASC)", f: "DATASUS", s: "medio", u: "mortalidade infantil/materna (benefício final)" },
    { d: "Notificações de agravos (SINAN)", f: "DATASUS", s: "medio", u: "vigilância (dengue, etc.)" },
    { d: "Cobertura vacinal (PNI)", f: "DATASUS", s: "medio", u: "imunização (efeito rebanho)" },
    { d: "Nutrição (SISVAN), pré-natal (SISPRENATAL)", f: "DATASUS", s: "medio", u: "indicadores APS adicionais" },
  ]},
  { a: "🎓 Educação", i: [
    { d: "MDE/FUNDEB, alfabetização", f: "SICONFI / IBGE", s: "tem", u: "molde 4 visões" },
    { d: "IDEB, SAEB, matrículas, infra, docentes", f: "INEP / Censo Escolar", s: "medio", u: "fecha cadeia (produção→aprendizado)" },
    { d: "Merenda (PNAE), transporte (PNATE), PDDE", f: "FNDE", s: "facil", u: "repasses diretos à escola" },
  ]},
  { a: "🤝 Assistência & cidadania", i: [
    { d: "Bolsa Família, BPC, CadÚnico (cobertura)", f: "MDS / Portal Transparência", s: "facil", u: "proteção social, vulnerabilidade" },
    { d: "CRAS/CREAS (Censo SUAS), repasses FNAS", f: "MDS", s: "medio", u: "equipamentos × famílias" },
  ]},
  { a: "👷 Trabalho & economia", i: [
    { d: "Emprego formal e salário (RAIS, Novo CAGED)", f: "Min. Trabalho", s: "medio", u: "mercado de trabalho local" },
    { d: "PIB municipal e composição setorial", f: "IBGE", s: "tem", u: "tamanho/perfil da economia" },
    { d: "Exportações por município (Comex)", f: "MDIC (Comex Stat)", s: "facil", u: "vocação econômica, balança" },
    { d: "Agropecuária (PAM/PPM, Censo Agro)", f: "IBGE", s: "medio", u: "produção rural" },
  ]},
  { a: "🚰 Infraestrutura & meio ambiente", i: [
    { d: "Água, esgoto, resíduos (cobertura)", f: "SNIS / SINIR", s: "medio", u: "saneamento (impacto na saúde)" },
    { d: "Uso do solo e desmatamento", f: "MapBiomas / INPE", s: "facil", u: "ambiental, ESG" },
    { d: "Frota de veículos", f: "SENATRAN (via IBGE)", s: "facil", u: "mobilidade, frota per capita" },
    { d: "Consumo de energia / acessos banda larga", f: "ANEEL/EPE / Anatel", s: "facil", u: "infraestrutura, conectividade" },
  ]},
  { a: "🛡️ Segurança", i: [
    { d: "Homicídios e mortes violentas", f: "Atlas da Violência (IPEA)", s: "facil", u: "segurança pública (benefício)" },
    { d: "Ocorrências criminais detalhadas", f: "SINESP", s: "dificil", u: "restrito/agregado" },
  ]},
  { a: "⚖️ Controle, transparência & política", i: [
    { d: "Qualidade da gestão (IEGM)", f: "TCE/IRB", s: "tem", u: "avaliação do controle externo" },
    { d: "Regularidade fiscal (CAUC/CADIN)", f: "Tesouro", s: "tem", u: "apto a receber, accountability" },
    { d: "Escala Brasil Transparente (transparência ativa)", f: "CGU", s: "medio", u: "cumprimento da LAI" },
    { d: "Eleitos, eleitorado, contas de campanha", f: "TSE", s: "facil", u: "gestor×ano (cruza com resultado)" },
  ]},
  { a: "🏠 Habitação, cultura & turismo", i: [
    { d: "Déficit habitacional", f: "Fundação João Pinheiro", s: "medio", u: "demanda por moradia" },
    { d: "Cultura (Lei Aldir Blanc/Paulo Gustavo), SNIIC", f: "MinC", s: "medio", u: "repasses culturais" },
  ]},
];
const B: Record<L["s"], { t: string; c: string }> = {
  tem: { t: "✅ já temos", c: "bg-emerald-100 text-emerald-700" },
  facil: { t: "🟢 fácil", c: "bg-sky-100 text-sky-700" },
  medio: { t: "🟡 médio", c: "bg-amber-100 text-amber-700" },
  dificil: { t: "🔴 difícil", c: "bg-rose-100 text-rose-700" },
};

export default function DadosMunicipais() {
  const itens = SEC.flatMap((s) => s.i);
  const cont = { tem: itens.filter((i) => i.s === "tem").length, facil: itens.filter((i) => i.s === "facil").length, medio: itens.filter((i) => i.s === "medio").length, dificil: itens.filter((i) => i.s === "dificil").length };
  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto max-w-4xl px-5">
        <header className="border-b-[3px] border-teal-600 pb-4">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Dados Municipais — catálogo completo</h1>
          <p className="mt-1 text-sm text-slate-500">Tudo que a plataforma pode ter sobre municípios, de fontes públicas · jun/2026 · <span className="rounded-full bg-teal-600 px-2.5 py-0.5 text-xs font-semibold text-white">Instituto I10</span></p>
          <p className="mt-3 text-[15px] text-slate-700"><b>{itens.length} fontes municipais</b> mapeadas · <b className="text-emerald-700">{cont.tem} já integradas</b> · {cont.facil} fáceis · {cont.medio} médias · {cont.dificil} difíceis. Tudo dado aberto oficial.</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">{Object.values(B).map((b) => <span key={b.t} className={`rounded-full px-2.5 py-0.5 font-medium ${b.c}`}>{b.t}</span>)}</div>
        </header>

        {SEC.map((s) => (
          <section key={s.a} className="mt-7">
            <h2 className="font-display text-lg font-bold text-slate-900">{s.a}</h2>
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium"><th>Dado</th><th>Fonte</th><th>Status</th><th>O que destrava</th></tr></thead>
                <tbody>
                  {s.i.map((i) => (
                    <tr key={i.d} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 font-medium text-slate-800">{i.d}</td>
                      <td className="px-3 py-2 text-slate-600">{i.f}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${B[i.s].c}`}>{B[i.s].t}</span></td>
                      <td className="px-3 py-2 text-slate-600">{i.u}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <div className="mt-8 rounded-2xl border border-teal-200 bg-teal-50/50 p-5 text-[15px] text-slate-700">
          <b>Conclusão:</b> praticamente toda a vida de um município está em dado aberto — finanças, compras, saúde, educação, social, economia, infraestrutura, segurança, controle e política. O diferencial do PNIGP é <b>integrar e cruzar</b> tudo isso num só motor (já feito para ~1/3; o resto é fácil/médio). Ver <a href="/estrategia" className="font-medium text-teal-700 underline">Dossiê Estratégico</a> e <a href="/catalogo-dados" className="font-medium text-teal-700 underline">Catálogo geral</a>.
        </div>
        <p className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-400">PNIGP · Instituto I10 · catálogo vivo. Fontes: IBGE, SICONFI/Tesouro, PNCP, DATASUS, INEP, FNDE, MDS, Min. Trabalho, MDIC, SNIS, ANP/ANM, SENATRAN, Anatel, IPEA, CGU, TSE, Firjan, PNUD.</p>
      </div>
    </div>
  );
}
