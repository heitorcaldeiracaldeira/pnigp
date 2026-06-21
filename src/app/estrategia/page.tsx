// Dossiê estratégico — página discreta para compartilhar com a equipe (fora do menu, sem indexação).
export const metadata = {
  title: "PNIGP — Dossiê Estratégico",
  robots: { index: false, follow: false },
};
export const dynamic = "force-static";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-9 border-t border-slate-200 pt-5 font-display text-xl font-bold text-slate-900">{children}</h2>;
}

// --- Catálogo de dados municipais (consolidado nesta base de conhecimento) ---
type L = { d: string; f: string; s: "tem" | "facil" | "medio" | "dificil"; u: string };
const CAT: { a: string; i: L[] }[] = [
  { a: "👥 Identidade & demografia", i: [
    { d: "Municípios, população, domicílios", f: "IBGE (Censo 2022, malhas)", s: "tem", u: "base de tudo, comparação por porte" },
    { d: "População por idade/sexo, projeções", f: "IBGE", s: "facil", u: "demanda por serviço (creche, idoso)" },
    { d: "IDHM (renda, educação, longevidade)", f: "Atlas Brasil / PNUD", s: "facil", u: "desenvolvimento humano" },
    { d: "IFDM (emprego, saúde, educação)", f: "Firjan (anual)", s: "facil", u: "socioeconômico, série" },
  ]},
  { a: "💰 Finanças", i: [
    { d: "Receita/despesa, MDE, ASPS, RCL, dívida, função/subfunção", f: "SICONFI (RREO/RGF/DCA)", s: "tem", u: "painel fiscal + drill" },
    { d: "Receitas nominais (IPTU, ISS, FPM, ICMS, IPVA, FUNDEB)", f: "SICONFI An.3", s: "tem", u: "de onde vem o dinheiro" },
    { d: "Cota do FPM (mensal)", f: "Tesouro/FNP", s: "facil", u: "fluxo de caixa, dependência" },
    { d: "Royalties petróleo / CFEM mineração", f: "ANP / ANM", s: "medio", u: "receita extraordinária" },
    { d: "Emendas e convênios", f: "Transferegov / Portal Transparência", s: "facil", u: "recurso federal + execução" },
  ]},
  { a: "🛒 Compras & fornecedores", i: [
    { d: "Processos, contratos, itens, atas (preço unitário)", f: "PNCP", s: "tem", u: "sobrepreço, comportamento, B2B" },
    { d: "Empresas, CNAE, porte, situação", f: "Receita (CNPJ)/Mapa de Empresas", s: "facil", u: "inteligência de mercado, due diligence" },
    { d: "Sanções (CEIS, CNEP, CEPIM)", f: "Portal da Transparência", s: "facil", u: "risco de fornecedor (B2B)" },
  ]},
  { a: "🏥 Saúde", i: [
    { d: "Repasses FNS, Previne, SIH/SIA, CNES, RPPS atuarial", f: "Min. Saúde/DATASUS/CADPREV", s: "tem", u: "cadeia 💰→🏭→❤️, previdência" },
    { d: "Óbitos (SIM), nascimentos (SINASC)", f: "DATASUS", s: "medio", u: "mortalidade (benefício final)" },
    { d: "Agravos (SINAN), vacina (PNI), nutrição (SISVAN)", f: "DATASUS", s: "medio", u: "vigilância, imunização" },
  ]},
  { a: "🎓 Educação", i: [
    { d: "MDE/FUNDEB, alfabetização", f: "SICONFI / IBGE", s: "tem", u: "molde 4 visões" },
    { d: "IDEB, SAEB, matrículas, infra, docentes", f: "INEP / Censo Escolar", s: "medio", u: "fecha cadeia (aprendizado)" },
    { d: "Merenda (PNAE), transporte, PDDE", f: "FNDE", s: "facil", u: "repasses à escola" },
  ]},
  { a: "🤝 Assistência social", i: [
    { d: "Bolsa Família, BPC, CadÚnico", f: "MDS / Portal Transparência", s: "facil", u: "proteção social, vulnerabilidade" },
    { d: "CRAS/CREAS (Censo SUAS), FNAS", f: "MDS", s: "medio", u: "equipamentos × famílias" },
  ]},
  { a: "👷 Trabalho & economia", i: [
    { d: "Emprego e salário (RAIS, Novo CAGED)", f: "Min. Trabalho", s: "medio", u: "mercado de trabalho" },
    { d: "PIB municipal e setores", f: "IBGE", s: "tem", u: "perfil econômico" },
    { d: "Exportações (Comex), agropecuária", f: "MDIC / IBGE", s: "facil", u: "vocação econômica" },
  ]},
  { a: "🚰 Infra & meio ambiente", i: [
    { d: "Água, esgoto, resíduos", f: "SNIS / SINIR", s: "medio", u: "saneamento (impacto na saúde)" },
    { d: "Uso do solo/desmatamento", f: "MapBiomas / INPE", s: "facil", u: "ambiental, ESG" },
    { d: "Frota, energia, banda larga", f: "SENATRAN / ANEEL / Anatel", s: "facil", u: "mobilidade, conectividade" },
  ]},
  { a: "🛡️ Segurança", i: [
    { d: "Homicídios e mortes violentas", f: "Atlas da Violência (IPEA)", s: "facil", u: "segurança (benefício)" },
  ]},
  { a: "⚖️ Controle & política", i: [
    { d: "Qualidade da gestão (IEGM)", f: "TCE/IRB", s: "tem", u: "avaliação do controle externo" },
    { d: "Regularidade (CAUC/CADIN)", f: "Tesouro", s: "tem", u: "apto a receber, accountability" },
    { d: "Transparência ativa (Escala Brasil Transparente)", f: "CGU", s: "medio", u: "cumprimento da LAI" },
    { d: "Eleitos, eleitorado, contas de campanha", f: "TSE", s: "facil", u: "gestor×ano (cruza com resultado)" },
  ]},
  { a: "🏠 Habitação & cultura", i: [
    { d: "Déficit habitacional", f: "Fundação João Pinheiro", s: "medio", u: "demanda por moradia" },
    { d: "Cultura (Aldir Blanc/Paulo Gustavo)", f: "MinC", s: "medio", u: "repasses culturais" },
  ]},
];
const BADGE: Record<L["s"], { t: string; c: string }> = {
  tem: { t: "✅ temos", c: "bg-emerald-100 text-emerald-700" },
  facil: { t: "🟢 fácil", c: "bg-sky-100 text-sky-700" },
  medio: { t: "🟡 médio", c: "bg-amber-100 text-amber-700" },
  dificil: { t: "🔴 difícil", c: "bg-rose-100 text-rose-700" },
};
// --- Mapa "siga o dinheiro": todo recurso financeiro que entra no município ---
const REC: { g: string; i: L[] }[] = [
  { g: "Receita própria (arrecada sozinho)", i: [
    { d: "IPTU, ISS, ITBI, IRRF, Taxas, COSIP, Receita patrimonial", f: "SICONFI An.1/An.3", s: "tem", u: "autonomia tributária" },
  ]},
  { g: "Transferências constitucionais/legais (federais)", i: [
    { d: "FPM, Cota-parte ICMS, IPVA, ITR, IPI-Exportação, FUNDEB", f: "SICONFI An.3", s: "tem", u: "o grosso da receita municipal" },
    { d: "FPM mensal + constitucionais detalhadas", f: "Tesouro (Transf. Constitucionais)", s: "facil", u: "fluxo de caixa mensal" },
    { d: "Lei Kandir (LC 87), CIDE-combustíveis, salário-educação", f: "Tesouro / FNDE", s: "medio", u: "compensações e vinculadas" },
  ]},
  { g: "Fundo-a-fundo (federais)", i: [
    { d: "Saúde (SUS/FNS) por bloco", f: "Fundo Nacional de Saúde", s: "tem", u: "custeio/investimento da saúde" },
    { d: "Educação (PNAE merenda, PNATE transporte, PDDE)", f: "FNDE", s: "facil", u: "recurso direto à escola" },
    { d: "Assistência (FNAS) fundo-a-fundo", f: "MDS", s: "facil", u: "custeio do SUAS" },
  ]},
  { g: "Royalties e participações", i: [
    { d: "Royalties de petróleo/gás", f: "ANP", s: "medio", u: "receita extraordinária (municípios produtores)" },
    { d: "CFEM (compensação mineral)", f: "ANM", s: "medio", u: "receita de mineração" },
  ]},
  { g: "Transferências voluntárias — UNIÃO", i: [
    { d: "Convênios, termos, programas com proposta aberta", f: "Transferegov/SICONV", s: "facil", u: "captação federal (Radar)" },
    { d: "Emendas parlamentares (incl. Pix/individuais)", f: "Portal da Transparência", s: "facil", u: "recurso por emenda + execução" },
  ]},
  { g: "Transferências voluntárias — ESTADO de SC", i: [
    { d: "Transferências voluntárias a municípios, Plano 1000", f: "dados.sc.gov.br (SIGEF)", s: "facil", u: "captação estadual (Radar)" },
    { d: "Cota-parte estadual repassada (ICMS/IPVA)", f: "SEF-SC / dados.sc.gov.br", s: "facil", u: "repasse estadual detalhado" },
  ]},
  { g: "Crédito e outras entradas", i: [
    { d: "Operações de crédito (financiamentos)", f: "SICONFI (receita de capital)", s: "tem", u: "investimento financiado" },
    { d: "Precatórios/depósitos, alienação de bens", f: "SICONFI / Tesouro", s: "medio", u: "entradas pontuais" },
  ]},
];
function Recursos() {
  return (
    <div className="mt-2">
      <p className="text-[15px] text-slate-700">Todo R$ que entra no caixa do município — por origem. É a base do "de onde vem o dinheiro" e do Radar de Captação.</p>
      {REC.map((s) => (
        <div key={s.g} className="mt-4">
          <h3 className="font-semibold text-slate-800">{s.g}</h3>
          <div className="mt-1 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-[13px]">
              <tbody>
                {s.i.map((i) => (
                  <tr key={i.d} className="border-t border-slate-100 align-top first:border-t-0">
                    <td className="px-2.5 py-1.5 font-medium text-slate-800">{i.d}</td>
                    <td className="px-2.5 py-1.5 text-slate-600">{i.f}</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE[i.s].c}`}>{BADGE[i.s].t}</span></td>
                    <td className="px-2.5 py-1.5 text-slate-600">{i.u}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
function Catalogo() {
  const itens = CAT.flatMap((s) => s.i);
  const tem = itens.filter((i) => i.s === "tem").length;
  return (
    <div className="mt-2">
      <p className="text-[15px] text-slate-700"><b>{itens.length} fontes municipais</b> mapeadas (<b className="text-emerald-700">{tem} já integradas</b>) — tudo dado aberto oficial. Legenda: {Object.values(BADGE).map((b) => <span key={b.t} className={`mx-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${b.c}`}>{b.t}</span>)}</p>
      {CAT.map((s) => (
        <div key={s.a} className="mt-4">
          <h3 className="font-semibold text-slate-800">{s.a}</h3>
          <div className="mt-1 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-left text-[11px] text-slate-500"><tr className="[&>th]:px-2.5 [&>th]:py-1.5 [&>th]:font-medium"><th>Dado</th><th>Fonte</th><th>Status</th><th>Destrava</th></tr></thead>
              <tbody>
                {s.i.map((i) => (
                  <tr key={i.d} className="border-t border-slate-100 align-top">
                    <td className="px-2.5 py-1.5 font-medium text-slate-800">{i.d}</td>
                    <td className="px-2.5 py-1.5 text-slate-600">{i.f}</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE[i.s].c}`}>{BADGE[i.s].t}</span></td>
                    <td className="px-2.5 py-1.5 text-slate-600">{i.u}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function EstrategiaPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto max-w-4xl px-5">
        <header className="border-b-[3px] border-teal-600 pb-4">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">PNIGP — Dossiê Estratégico</h1>
          <p className="mt-1 text-sm text-slate-500">Análise de produto, dados e mercado · jun/2026 · <span className="rounded-full bg-teal-600 px-2.5 py-0.5 text-xs font-semibold text-white">Confidencial — Instituto I10</span></p>
        </header>

        <div className="mt-4 rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-5">
          <h3 className="font-semibold text-teal-800">0. A tese central</h3>
          <p className="mt-1 text-[15px] text-slate-700">O ativo do PNIGP <b>não é a tela</b> — é a <b>base integrada e cruzada</b> (finanças + compras + saúde + educação + controle externo) <b>+ o motor analítico</b> (cadeia de valor 💰→🏭→❤️, accountability, eficiência por porte). O <b>mesmo dado</b> serve dois mercados: <b>governo</b> (gerir) e <b>privado</b> (vender ao governo, investir, emprestar). O <b>B2B tende a ser a maior receita</b> — milhares de empresas pagantes vs. nº limitado de governos.</p>
        </div>

        <H2>1. Melhorias da plataforma (curto prazo)</H2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] text-slate-700 marker:text-slate-400">
          <li><b>Surfacar o que já existe</b>: eficiência por porte + alertas ainda sem tela — ganho rápido, é o moat.</li>
          <li><b>Performance</b>: ~20 queries por acesso (force-dynamic) — avaliar cache/ISR + índices.</li>
          <li><b>Comparador entre municípios</b> + busca rápida.</li>
          <li><b>Exportação executiva</b> (PDF de 1 página).</li>
          <li><b>Mobile</b> nas tabelas densas.</li>
          <li><b>Infra</b>: Neon free satura no harvest → plano pago / réplica de leitura.</li>
          <li><b>Onboarding/pedagogia</b> (tour dos níveis, glossário).</li>
          <li><b>Completar cadeias</b>: IDEB, SNIS, produção de saúde.</li>
        </ol>

        <H2>2. Produtos B2G (governo)</H2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] text-slate-700 marker:text-slate-400">
          <li><b>Painel do Gestor</b> (core, existe).</li>
          <li><b>Radar de Conformidade & Alertas</b> — avisa antes de descumprir mínimo, estourar pessoal (LRF), perder prazo. <i>Evitar rejeição de contas vale muito a um prefeito.</i></li>
          <li><b>Benchmarking de Eficiência</b> — quem entrega mais por R$ entre pares.</li>
          <li><b>Diagnóstico de transição / 100 dias</b> (e campanha).</li>
          <li><b>Inteligência de compras do ente</b> — preço de referência, sobrepreço, PCA, comportamento.</li>
          <li><b>Prestação de contas facilitada</b> (Câmara, Conselhos, TCE).</li>
          <li><b>Painéis para Câmara e TCE</b> — fiscalização por risco.</li>
          <li>⭐ <b>Captação de Recursos (Convênios e Programas — União + Estado)</b> — sugere os programas com proposta ABERTA casados com os gargalos do município (IDEB→FNDE, saúde→MS, saneamento→FUNASA), mostra convênios ativos e quanto o ente deixa na mesa vs pares. Fontes: <b>Transferegov/SICONV (União)</b> + <b>dados.sc.gov.br (Estado de SC → municípios)</b> — ambos dados abertos.</li>
        </ol>

        <H2>3. Produtos B2B (setor privado) — monetização do moat</H2>
        <p className="mt-1 text-[15px] text-slate-700">Concorrentes (Effecti, RadarLicita, BLL, Lance Fácil) focam em <b>achar edital e dar lance</b>. Nós vendemos <b>decisão</b>.</p>
        <ol className="mt-2 list-decimal space-y-1.5 rounded-2xl border border-amber-200 bg-amber-50/50 p-5 pl-9 text-[15px] text-slate-700 marker:text-slate-400">
          <li>⭐ <b>Inteligência de Mercado para Fornecedores</b> — quem compra o quê, quando, <b>a que preço</b> (histórico homologado por item/região), market share, concorrentes. SaaS recorrente.</li>
          <li><b>Radar de Oportunidades com preço de referência</b> — edital + preço histórico → onde concorrer e a que preço.</li>
          <li><b>Análise de concorrentes</b> — quem ganha, preços, concentração.</li>
          <li><b>Due diligence</b> — risco do fornecedor (sanções CEIS/CNEP) e <b>saúde fiscal do comprador</b> (paga em dia?).</li>
          <li><b>Precificação</b> — base de preços homologados.</li>
          <li><b>Crédito & risco</b> (bancos/fintechs/FIDC) — capacidade de pagamento dos entes, antecipação de recebíveis, precatórios.</li>
          <li><b>Construção/infraestrutura</b> — investimento planejado por região (PCA, obras).</li>
          <li><b>Mídia, consultoria, academia</b> — assinatura de dados/insights.</li>
        </ol>

        <H2>4. Mapa de Recursos Financeiros do Município (todo R$ que entra)</H2>
        <Recursos />

        <H2>5. Catálogo de Dados Municipais (o que temos + o que podemos ter)</H2>
        <Catalogo />

        <H2>6. Prioridades (quando as compras fecharem)</H2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] text-slate-700 marker:text-slate-400">
          <li><b>Sobrepreço por descrição + comportamento de compras</b> — B2G e base do B2B.</li>
          <li><b>Surfacar Eficiência + Alertas</b> (rápido, moat).</li>
          <li><b>IDEB / SNIS</b> (fechar cadeias municipais).</li>
          <li><b>Protótipo B2B</b>: "Inteligência de Mercado de Compras".</li>
        </ol>

        <H2>7. Deep-dive: o produto-âncora B2B</H2>
        <div className="mt-2 rounded-2xl border border-teal-200 bg-teal-50/50 p-5">
          <p className="text-[15px] text-slate-700">Mercado (fontes públicas 2025):</p>
          <p className="mt-1 text-2xl font-bold text-teal-700">~R$ 1 trilhão/ano <span className="text-base font-normal text-slate-600">em compras públicas (12–16% do PIB)</span></p>
          <p className="text-sm text-slate-600">1 milhão+ de processos/ano · 481 mil compras com ME/EPP (R$ 272,6 bi).</p>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead><tr className="bg-slate-100 text-left text-slate-600 [&>th]:border [&>th]:border-slate-200 [&>th]:px-3 [&>th]:py-2"><th>Camada de inteligência</th><th>O que entrega</th></tr></thead>
            <tbody className="[&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2 text-slate-700">
              <tr><td>Preço de referência histórico por item</td><td>a que preço ganhar (por região/porte)</td></tr>
              <tr><td>Saúde fiscal do comprador</td><td>risco de receber (paga em dia? CAUC?)</td></tr>
              <tr><td>Comportamento de compras</td><td>onde há oportunidade real (fracasso/deserção)</td></tr>
              <tr><td>Quem ganha o quê</td><td>concorrentes, market share, concentração</td></tr>
            </tbody>
          </table>
          <p className="mt-3 text-[15px] text-slate-700"><b>Por que vencemos:</b> os concorrentes vendem "lista de editais"; nós vendemos <b>decisão</b> — "concorra NESTE, a ESTE preço, porque o comprador paga e o histórico do item é X". <b>É o mesmo motor do B2G, monetizado 2×</b>, e escala nacional (o PNCP é nacional).</p>
        </div>

        <p className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">PNIGP · Instituto I10 · documento vivo · dados de mercado de fontes públicas 2025 (PNCP, Min. da Gestão, IPEA).</p>
      </div>
    </div>
  );
}
