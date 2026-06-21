// Catálogo de dados abertos federais — o que já temos + o que podemos ter. Discreta (fora do menu, noindex).
export const metadata = { title: "PNIGP — Catálogo de Dados", robots: { index: false, follow: false } };
export const dynamic = "force-static";

type Linha = { dado: string; fonte: string; acesso: string; status: "tem" | "facil" | "medio" | "dificil"; destrava: string };
const SEC: { area: string; itens: Linha[] }[] = [
  { area: "💰 Finanças públicas", itens: [
    { dado: "Receita/Despesa, MDE, ASPS, RCL, dívida, subfunção", fonte: "SICONFI (Tesouro) — RREO/RGF", acesso: "API", status: "tem", destrava: "Painel fiscal, conformidade legal, drill por função" },
    { dado: "Receitas nominais (IPTU, ISS, FPM, ICMS, IPVA, FUNDEB)", fonte: "SICONFI RREO An.3", acesso: "API", status: "tem", destrava: "De onde vem o dinheiro (nominal)" },
    { dado: "Despesas federais, emendas parlamentares, convênios", fonte: "Portal da Transparência", acesso: "API", status: "facil", destrava: "Emendas/convênios por município, execução" },
    { dado: "Custos do governo, dívida pública", fonte: "Tesouro Transparente (CKAN)", acesso: "API/CSV", status: "facil", destrava: "Contexto macro-fiscal" },
  ]},
  { area: "🛒 Compras & contratos", itens: [
    { dado: "Processos, contratos, itens, atas (preço unitário)", fonte: "PNCP", acesso: "API", status: "tem", destrava: "Sobrepreço, comportamento de compras, B2B" },
    { dado: "Licitações e contratos federais", fonte: "Portal da Transparência", acesso: "API", status: "facil", destrava: "Cobertura federal, cruzamento fornecedor" },
    { dado: "Localidade/situação dos fornecedores (CNPJ)", fonte: "minhareceita / BrasilAPI", acesso: "API", status: "tem", destrava: "UF/cidade vencedora, situação cadastral" },
  ]},
  { area: "🏥 Saúde", itens: [
    { dado: "Repasses federais por bloco (FNS)", fonte: "Fundo Nacional de Saúde", acesso: "API", status: "tem", destrava: "Programas e repasses (como melhorar)" },
    { dado: "Atenção Primária — Previne (7 indicadores)", fonte: "SISAB / Min. Saúde", acesso: "CSV", status: "tem", destrava: "Ficha do indicador + cadeia de valor" },
    { dado: "Produção MAC (internações/ambulatorial)", fonte: "SIH/SIA-SUS (DATASUS)", acesso: "TabNet", status: "tem", destrava: "Cadeia 💰→🏭→❤️ da MAC" },
    { dado: "Déficit atuarial RPPS", fonte: "CADPREV/SPREV", acesso: "API", status: "tem", destrava: "Previdência (longo prazo)" },
    { dado: "Cobertura vacinal (PNI), leitos (CNES), mortalidade (SIM/SINASC)", fonte: "DATASUS", acesso: "TabNet/CSV", status: "medio", destrava: "Benefício final (vigilância, acesso)" },
  ]},
  { area: "🎓 Educação", itens: [
    { dado: "MDE/FUNDEB, alfabetização", fonte: "SICONFI / IBGE", acesso: "API", status: "tem", destrava: "Educação no molde 4 visões" },
    { dado: "IDEB, matrículas, creche, abandono", fonte: "INEP / Censo Escolar", acesso: "CSV", status: "medio", destrava: "Fecha a cadeia educação (produção→resultado)" },
  ]},
  { area: "🤝 Assistência social", itens: [
    { dado: "Bolsa Família, BPC, CadÚnico (cobertura)", fonte: "Portal da Transparência / MDS", acesso: "API/CSV", status: "facil", destrava: "Nova área finalística (proteção social)" },
    { dado: "CRAS/CREAS (Censo SUAS), repasses FNAS", fonte: "MDS", acesso: "CSV", status: "medio", destrava: "Equipamentos × famílias atendidas" },
  ]},
  { area: "⚖️ Controle, integridade & risco", itens: [
    { dado: "Qualidade da gestão (IEGM)", fonte: "TCE-SC / IRB", acesso: "CSV", status: "tem", destrava: "Avaliação do controle externo (7 dims)" },
    { dado: "Regularidade fiscal (CAUC/CADIN)", fonte: "Tesouro Transparente", acesso: "CSV", status: "tem", destrava: "Apto a receber? Accountability" },
    { dado: "Sanções a empresas (CEIS, CNEP, CEPIM)", fonte: "Portal da Transparência", acesso: "API", status: "facil", destrava: "Due diligence de fornecedor (B2B)" },
    { dado: "Pareceres/contas julgadas", fonte: "TCE (e-Sfinge)", acesso: "PDF/consulta", status: "dificil", destrava: "Histórico de aprovação (não estruturado)" },
  ]},
  { area: "🚰 Saneamento & infraestrutura", itens: [
    { dado: "Água, esgoto, resíduos (cobertura)", fonte: "SNIS", acesso: "CSV", status: "medio", destrava: "Nova área (impacto direto na saúde)" },
  ]},
  { area: "👷 Trabalho, economia & mercado", itens: [
    { dado: "Emprego formal (RAIS/CAGED)", fonte: "Min. Trabalho", acesso: "CSV", status: "medio", destrava: "Contexto socioeconômico, ESG" },
    { dado: "PIB, Censo 2022, indicadores", fonte: "IBGE", acesso: "API", status: "tem", destrava: "Comparação por porte, per capita" },
    { dado: "CNAE/porte dos fornecedores", fonte: "Receita Federal (CNPJ)", acesso: "API/CSV", status: "facil", destrava: "Inteligência de mercado (B2B)" },
    { dado: "Indicadores econômicos (juros, câmbio)", fonte: "Banco Central (SGS)", acesso: "API", status: "facil", destrava: "Contexto macro" },
  ]},
  { area: "🗳️ Política & território", itens: [
    { dado: "Prefeitos/eleitos × município × ano, contas de campanha", fonte: "TSE", acesso: "CSV/API", status: "facil", destrava: "Cruzar gestor ↔ resultado ↔ pareceres" },
    { dado: "Transferências federais (convênios/emendas)", fonte: "Transferegov (+Brasil)", acesso: "API/CSV", status: "facil", destrava: "Recurso federal por município + execução" },
    { dado: "Camadas geográficas (malhas)", fonte: "IBGE", acesso: "API", status: "facil", destrava: "Mapas e análise regional" },
  ]},
];
const BADGE: Record<Linha["status"], { t: string; c: string }> = {
  tem: { t: "✅ já temos", c: "bg-emerald-100 text-emerald-700" },
  facil: { t: "🟢 fácil", c: "bg-sky-100 text-sky-700" },
  medio: { t: "🟡 médio", c: "bg-amber-100 text-amber-700" },
  dificil: { t: "🔴 difícil", c: "bg-rose-100 text-rose-700" },
};

export default function CatalogoDados() {
  const tem = SEC.flatMap((s) => s.itens).filter((i) => i.status === "tem").length;
  const tot = SEC.flatMap((s) => s.itens).length;
  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto max-w-4xl px-5">
        <header className="border-b-[3px] border-teal-600 pb-4">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Catálogo de Dados Abertos</h1>
          <p className="mt-1 text-sm text-slate-500">O que a plataforma pode ter — dados públicos federais por domínio · jun/2026 · <span className="rounded-full bg-teal-600 px-2.5 py-0.5 text-xs font-semibold text-white">Instituto I10</span></p>
          <p className="mt-3 text-[15px] text-slate-700"><b>{tem} de {tot}</b> fontes já integradas. As demais são dados abertos oficiais (API/CSV) — esforço marcado por cor. Tudo de fonte pública, sem invasão.</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {Object.values(BADGE).map((b) => <span key={b.t} className={`rounded-full px-2.5 py-0.5 font-medium ${b.c}`}>{b.t}</span>)}
          </div>
        </header>

        {SEC.map((s) => (
          <section key={s.area} className="mt-7">
            <h2 className="font-display text-lg font-bold text-slate-900">{s.area}</h2>
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium"><th>Dado</th><th>Fonte</th><th>Acesso</th><th>Status</th><th>O que destrava</th></tr></thead>
                <tbody>
                  {s.itens.map((i) => (
                    <tr key={i.dado} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 font-medium text-slate-800">{i.dado}</td>
                      <td className="px-3 py-2 text-slate-600">{i.fonte}</td>
                      <td className="px-3 py-2 text-slate-500">{i.acesso}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[i.status].c}`}>{BADGE[i.status].t}</span></td>
                      <td className="px-3 py-2 text-slate-600">{i.destrava}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <div className="mt-8 rounded-2xl border border-teal-200 bg-teal-50/50 p-5 text-[15px] text-slate-700">
          <b>Leitura estratégica:</b> a maioria do que falta é <b>fácil/médio</b> e de fonte aberta — o gargalo nunca é o dado, é a engenharia de integração (que já temos: 1 motor, ETLs idempotentes, multi-UF). Cada nova base reforça o moat e abre produto (ex.: sanções → due diligence B2B; TSE → cruzar gestor×resultado; SNIS → nova área).
          <div className="mt-3 text-xs text-slate-500">Fontes: dados.gov.br, Portal da Transparência, SICONFI/Tesouro, DATASUS, INEP, IBGE, TSE, Transferegov, SNIS, IRB/TCE. Ver também o <a href="/estrategia" className="font-medium text-teal-700 underline">Dossiê Estratégico</a>.</div>
        </div>
        <p className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-400">PNIGP · Instituto I10 · catálogo vivo de dados abertos.</p>
      </div>
    </div>
  );
}
