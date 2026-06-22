// Apresentação executiva — "As melhores soluções do PNIGP". Para apresentação interna (discreta, noindex).
export const metadata = { title: "PNIGP — Soluções", robots: { index: false, follow: false } };
export const dynamic = "force-static";

function Sec({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-slate-200 pt-6">
      <div className="flex items-baseline gap-3"><span className="font-display text-2xl font-bold text-teal-600">{n}</span><h2 className="font-display text-xl font-bold text-slate-900">{titulo}</h2></div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
function Card({ icon, t, d, m }: { icon: string; t: string; d: string; m: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-800">{icon} {t}</div>
      <p className="mt-1 text-[13px] text-slate-600">{d}</p>
      <p className="mt-2 text-[11px] font-medium text-teal-700">⚙ {m}</p>
    </div>
  );
}

export default function SolucoesPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto max-w-4xl px-5">
        <header className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 p-7 text-white">
          <div className="text-xs font-semibold uppercase tracking-wider text-teal-200">Instituto I10 · Plataforma PNIGP</div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">As melhores soluções em inteligência de gestão pública</h1>
          <p className="mt-2 text-sm text-teal-50">Uma plataforma que transforma o dado público disperso em <b>decisão de gestão</b> — integrada, pedagógica, metodologicamente rigorosa e neutra. Santa Catarina (295 municípios + Estado), pronta para escalar a qualquer UF.</p>
        </header>

        <Sec n="01" titulo="O problema que resolvemos">
          <p className="text-[15px] text-slate-700">O gestor público tem dados espalhados em dezenas de sistemas (SICONFI, PNCP, INEP, FNS, TCE…), em linguagem técnica, sem conexão entre si. Resultado: decide no escuro, descumpre limites sem perceber e deixa recursos na mesa. <b>O PNIGP reúne, cruza e explica</b> — do estratégico ao operacional.</p>
        </Sec>

        <Sec n="02" titulo="As soluções — e o que as torna as melhores">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card icon="🎓" t="Painel pedagógico em 4 visões" d="Estratégico → Tático → Operacional → Técnico. Ensina o gestor leigo a fazer gestão, com 'como melhorar' aberto." m="Mesmo molde em saúde, educação, finanças e compras" />
            <Card icon="💰→🏭→❤️" t="Cadeia de valor" d="Liga o dinheiro (financiamento) à produção (matrículas, atendimentos) e ao benefício (IDEB, saúde)." m="Censo+IDEB (educação), FNS+SIH/SIA (saúde)" />
            <Card icon="⏳" t="Gestão proativa de contratos e atas" d="Índice de criticidade por prazo + valor: avisa o que vence antes que vire problema." m="Fórmula: 100×(0,7·prazo + 0,3·valor); níveis Crítico→Baixo" />
            <Card icon="💸" t="Economicidade com método honesto" d="Quanto a disputa economizou, por mediana e por modalidade — competição × contratação direta." m="Robusta a erros e a atas; sem inflar com quantidades-teto" />
            <Card icon="🧩" t="Base integrada + um motor multi-UF" d="Finanças, compras, saúde, educação, previdência e controle no mesmo lugar — um engine, não 27." m="Coletores idempotentes parametrizados por UF" />
            <Card icon="⚖️" t="Credibilidade: doutrina + controle" d="Cada área ancorada em marcos legais, doutrina (Justen, Jacoby, Niebuhr…) e órgãos (TCU, MP, TCE/SC)." m="Exibição neutra, metodologia sempre explícita" />
          </div>
        </Sec>

        <Sec n="03" titulo="O diferencial (o nosso moat)">
          <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-5 text-[15px] text-slate-700">
            Concorrentes mostram <i>um dado</i>. Nós entregamos <b>decisão</b>: o número + a série explicada + o que a lei exige + o que fazer + a prova. O ativo não é a tela — é a <b>base integrada e cruzada + o motor analítico</b>. O mesmo dado serve o <b>governo</b> (gerir) e o <b>setor privado</b> (vender ao governo, investir, emprestar).
          </div>
        </Sec>

        <Sec n="04" titulo="Onde já estamos (entregue e no ar)">
          <div className="flex flex-wrap gap-2 text-[13px]">
            {["Painel do gestor (295 municípios + Estado)", "Finanças: receitas nominais + despesa por função/subfunção", "Compras: planejamento + economicidade + atas", "Contratos: vigências + criticidade", "Saúde: APS/Previne + MAC + repasses", "Educação: IDEB + matrículas (cadeia completa)", "Previdência (RPPS atuarial)", "Qualidade da gestão (IEGM)", "Controle de atualização (/etl)"].map((x) => (
              <span key={x} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-700">✓ {x}</span>
            ))}
          </div>
        </Sec>

        <Sec n="05" titulo="Para onde vamos (produtos)">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card icon="🎯" t="Radar de Captação (B2G)" d="Sugere convênios/programas abertos (União + Estado) casados com os gargalos do município — e gera o projeto." m="Transferegov + dados.sc.gov.br" />
            <Card icon="📈" t="Inteligência de Mercado (B2B)" d="Para fornecedores: quem compra o quê, a que preço, market share, saúde fiscal do comprador." m="Mercado de ~R$1 tri/ano em compras públicas" />
            <Card icon="🛡️" t="Radar de Conformidade & Alertas" d="Avisa antes de descumprir mínimos (saúde/educação), estourar pessoal (LRF) ou perder prazo." m="Evita rejeição de contas" />
          </div>
        </Sec>

        <Sec n="06" titulo="Vanguarda — o que nos coloca à frente">
          <p className="mb-3 text-[15px] text-slate-700">A maioria das soluções de govtech é <i>dashboard</i>. Nossa fronteira de inovação é transformar a base integrada em <b>inteligência ativa</b>:</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card icon="🤖" t="Copiloto de gestão (IA)" d="Pergunte em linguagem natural ('gasto de saúde vs pares?') e receba a resposta com a fonte e o contexto." m="IA sobre a base integrada — vanguarda no setor" />
            <Card icon="📝" t="Diagnóstico automático" d="A IA lê os dados do ente e escreve situação → causa → ação. O gestor só confere e decide." m="O 'diário de gestão' pré-montado" />
            <Card icon="🚨" t="Detecção de anomalias" d="Sobrepreço, fracionamento e padrões de risco sinalizados automaticamente — não dependem de busca manual." m="Sobre 1,2 mi de itens já coletados" />
            <Card icon="🔮" t="Alerta antecipado (preditivo)" d="Projeta se o ente vai descumprir mínimo de saúde/educação ou estourar pessoal — antes de acontecer." m="Da série histórica + tendência" />
            <Card icon="🧬" t="Cruzamentos inéditos" d="Gestor × resultado × parecer (TSE + IEGM + contas); planejado × contratado × executado." m="Só possível com a base integrada" />
            <Card icon="🇧🇷" t="Comparabilidade nacional" d="Um motor multi-UF permite ranquear e aprender entre milhares de municípios — não só os 295 de SC." m="Escala que define padrão de mercado" />
          </div>
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[13px] text-slate-700"><b>Honestidade:</b> hoje somos vanguarda em <b>integração + método + pedagogia</b>. O próximo salto de inovação (que poucos têm) é a <b>camada de IA</b> — copiloto + diagnóstico automático — usando os modelos mais recentes. É o que nos torna referência, não seguidores.</p>
        </Sec>

        <Sec n="07" titulo="O que ninguém enxerga — e o cliente precisa">
          <p className="mb-3 text-[15px] text-slate-700">Há necessidades reais que o mercado não atende porque <b>exigem cruzar dados que ninguém junta</b>. É aí que ganhamos:</p>
          <div className="space-y-2">
            {[
              ["Ninguém diz o que FAZER", "Todos mostram o dado; ninguém conecta variação → causa → ação. Nós pré-montamos a recomendação — o gestor só confere.", "leigo decide com segurança"],
              ["Alerta ANTES do problema", "Avisar o prefeito que vai furar o mínimo de saúde/educação ou a LRF enquanto ainda dá para corrigir — não no fechamento das contas.", "evita rejeição de contas"],
              ["Dinheiro virou resultado?", "Eficiência alocativa: gastou mais em educação e o IDEB subiu? Quase ninguém liga gasto → produção → benefício por município.", "cadeia 💰→🏭→❤️"],
              ["Captação casada com o gargalo", "Os concorrentes listam editais. Nós dizemos: 'seu gargalo é X, há o convênio Y aberto até DD/MM — pleiteie' e geramos o projeto.", "Radar de Captação"],
              ["Sobrepreço por descrição (não por marca)", "Marca não existe no PNCP. Comparar o MESMO item entre municípios revela o preço fora da curva — ninguém faz item a item.", "1,2 mi de itens"],
              ["Para o fornecedor: o comprador paga?", "Quem vende ao governo não sabe a saúde fiscal de quem compra. Juntamos preço de referência + risco do comprador — inédito.", "produto B2B"],
            ].map(([t, d, m]) => (
              <div key={t} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm font-semibold text-slate-800">🔎 {t}</span><span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">{m}</span></div>
                <p className="mt-1 text-[13px] text-slate-600">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3 text-[13px] text-slate-700"><b>A tese:</b> nosso diferencial não é ter o dado — é <b>enxergar a conexão que o dado integrado permite</b> e entregar a <b>decisão</b> que ninguém mais entrega. Inovar = atender o que o cliente precisa e hoje não tem.</p>
        </Sec>

        <p className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">PNIGP · Instituto I10 · documento de apresentação. Fontes oficiais e dados abertos. Exibição neutra, sem viés político-partidário.</p>
      </div>
    </div>
  );
}
