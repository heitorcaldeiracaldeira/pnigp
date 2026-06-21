# PNIGP — Dossiê Estratégico (análise autônoma, jun/2026)

> Análise produzida em modo autônomo. Objetivo: melhorias da plataforma, mapa de produtos (B2G + B2B),
> dados futuros e a tese pública→privada. Sem interferir na coleta.

## 0. A tese central
O ativo do PNIGP **não é a tela** — é a **base integrada e cruzada** (finanças + compras + saúde + educação +
controle externo) **+ o motor analítico** (cadeia de valor 💰→🏭→❤️, accountability, eficiência por porte).
O **mesmo dado** serve dois mercados: **governo** (para gerir) e **privado** (para vender ao governo, investir,
emprestar). O B2B tende a ser a maior receita (milhares de empresas pagantes vs. nº limitado de governos).

---

## 1. Melhorias da plataforma (curto prazo, alta alavancagem)
1. **Surfacar o que já está pronto**: a query `getEficienciaSC` (eficiência por porte) e os Alertas ainda não
   têm tela — são ganho rápido e é o moat analítico (gasto×resultado entre pares).
2. **Performance**: a página `/real/[codigo]` faz ~20 queries em `Promise.all` com `force-dynamic`.
   Avaliar cache (ISR/revalidate por ente) e índices — hoje cada acesso recomputa tudo.
3. **Comparador entre municípios** (lado a lado) e **busca/seleção** rápida.
4. **Exportação executiva** (PDF de 1 página do Placar + por área) — já há print; formalizar.
5. **Mobile**: revisar as tabelas densas (compras/itens) no celular.
6. **Confiabilidade do dado (infra)**: Neon free satura no harvest pesado → plano pago ou réplica de leitura
   p/ coletas grandes (o gargalo recorrente das compras).
7. **Onboarding/pedagogia**: tour guiado "o que é cada nível", glossário sempre acessível.
8. **Completar cadeias**: IDEB/matrículas (educação), SNIS (saneamento), produção de saúde — fecham 💰→🏭→❤️.

---

## 2. Produtos B2G (governo) — receita por assinatura de ente
1. **Painel do Gestor** (core, existe) — prefeitura/estado assina.
2. **Radar de Conformidade & Alertas** — avisa ANTES de descumprir mínimo (saúde/educação), estourar pessoal
   (LRF), perder prazo de prestação, ou repasse cair. *Evitar rejeição de contas vale muito a um prefeito.*
3. **Benchmarking de Eficiência** — "quem entrega mais saúde/educação por R$ entre pares" (o moat).
4. **Diagnóstico de Transição/100 dias** — relatório de entrada para gestão nova (e p/ campanha).
5. **Inteligência de Compras do próprio ente** — preço de referência por item (CATMAT/descrição), sobrepreço,
   planejamento (PCA), comportamento (fracasso/deserção).
6. **Prestação de contas facilitada** — relatórios automáticos p/ Câmara, Conselhos e TCE.
7. **Painel da Câmara/Vereadores** e **Painel para o TCE** (priorização de fiscalização por risco) — outros
   compradores públicos além do Executivo.

---

## 3. Produtos B2B (setor privado) — a monetização do moat
Mercado existente (Effecti, RadarLicita, BLL, Lance Fácil) foca em **achar edital e dar lance**. Nosso
diferencial: **inteligência analítica profunda** sobre o comprador e o mercado.
1. **Inteligência de Mercado para Fornecedores** ⭐ — quem compra o quê, quando, **a que preço** (histórico
   homologado por item/região), market share por CATMAT, sazonalidade, concorrentes. SaaS recorrente.
2. **Radar de Oportunidades com preço de referência** — alerta de editais por segmento/região **já com o preço
   histórico** → a empresa decide onde concorrer e a que preço (os concorrentes só listam o edital).
3. **Análise de Concorrentes** — quem ganha, preços praticados, concentração, vínculos.
4. **Due diligence / risco de fornecedor e de comprador** — situação cadastral, histórico, sanções (CEIS/CNEP);
   e **saúde fiscal do município** (paga em dia? capacidade?) — quem vende a prazo ao governo precisa disso.
5. **Precificação** — base de preços homologados p/ empresas montarem propostas competitivas.
6. **Crédito & risco (bancos/fintechs/FIDC)** — saúde fiscal e capacidade de pagamento dos entes → antecipação
   de recebíveis de fornecedores do governo, crédito a municípios, risco de precatórios.
7. **Construção/infraestrutura** — investimento público planejado por região (PCA, obras) → onde virão obras.
8. **Mídia/jornalismo de dados, consultorias, academia** — assinatura de dados/insights.

---

## 4. Dados que podemos ter (prioridade municipal já em roadmap + novos)
- **Educação**: IDEB, matrículas, creche (INEP/Censo). **Saneamento**: SNIS. **Assistência**: CadÚnico/CRAS.
- **Saúde**: cobertura vacinal (PNI), leitos (CNES), mortalidade (SIM/SINASC).
- **Pessoal**: folha por cargo/vínculo (portais de transparência).
- **Controle**: sanções CEIS/CNEP, CADIN; convênios/emendas (Transferegov).
- **Mercado**: CNAE/porte dos fornecedores, RAIS/CAGED (emprego), preços (já em coleta via itens).
- **Política**: prefeitos × município × ano (TSE) — desbloqueia cruzar gestor↔resultado↔pareceres.
- **Geo**: camadas territoriais p/ mapas e análise regional.

---

## 5. Recomendações priorizadas (o que fazer quando as compras fecharem)
1. **Sobrepreço por descrição + comportamento de compras** (já planejado) — vira o produto B2G E a base do B2B.
2. **Surfacar Eficiência + Alertas** (rápido, moat).
3. **IDEB/SNIS** (fechar cadeias municipais).
4. **Protótipo B2B**: "Inteligência de Mercado de Compras" — provar a tese pública→privada com os itens já coletados.

---

## 6. Deep-dive: "Inteligência de Mercado de Compras Públicas" (produto-âncora B2B)
**Tamanho do mercado (fontes públicas 2025):** compras públicas movimentam **~R$ 1 trilhão/ano** (12-16% do
PIB), com **1 milhão+ de processos/ano** e **481 mil compras com ME/EPP (R$ 272,6 bi)**. É um mercado enorme
com **centenas de milhares de fornecedores PME** que precisam de inteligência — e pagam por ela.

**Concorrentes (Effecti, RadarLicita, BLL, Lance Fácil):** focam em *achar edital* e *gerir o lance*.
**Nosso diferencial (moat):** a base **integrada** já traz o que eles não têm:
- **Preço de referência histórico por item** (homologado, por região/porte) → a empresa sabe a que preço ganhar.
- **Saúde fiscal do comprador** (o município paga em dia? tem capacidade? CAUC?) → risco de receber.
- **Comportamento de compras** (fracasso/deserção/dispensa) → onde há oportunidade real.
- **Quem ganha o quê** (concorrentes, market share por CATMAT/descrição, concentração).

**Quem paga:** fornecedores PME do governo (assinatura SaaS), distribuidores, indústrias, bancos/fintechs
(risco de crédito do ente), construtoras (PCA/obras), consultorias.

**Por que vencemos:** os concorrentes vendem "lista de editais"; nós vendemos **decisão** ("concorra NESTE,
a ESTE preço, porque o comprador paga e o histórico do item é X"). É o mesmo motor do B2G, monetizado 2x.

**Caminho:** quando os itens fecharem (≈agora, 88%), construir o **detector de sobrepreço por descrição** (B2G)
e, com a mesma base, um **protótipo de "preço de referência por item + comprador"** (B2B) — prova da tese
pública→privada com dado real de SC. Depois escala nacional (PNCP é nacional).

---
*Atualizado em modo autônomo; refino a cada ciclo. Coleta de compras em 88% — sobrepreço/comportamento ficam para montar com o usuário (conforme combinado).*
