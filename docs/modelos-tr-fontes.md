# Modelos e fundamentação do Termo de Referência — fontes para o Construtor de TR

**Base de pesquisa (verificada) para ancorar `src/lib/tr-modelo.ts`.** Lei 14.133/2021. Jul/2026.
Texto legal = verbatim do Planalto; texto de modelo = verbatim do .docx oficial da AGU.

## 1. AGU / CNMLC — modelo oficial (fonte principal)

Índice L14.133: https://www.gov.br/agu/pt-br/composicao/cgu/cgu/modelos/licitacoesecontratos/14133
TR de Compras (dez/2025, .docx): `.../pregao-e-concorrencia/modelo-de-termo-de-referencia-compras-lei-no-14-133-dez-25.docx`
TR de serviços/obras (mai/2026): `.../modelo-de-termo-de-referencia-servicos-e-obras-lei-no-14-133-mai-26.docx` (URL confirmada; conteúdo não aberto)

**Estrutura oficial de 12 seções (TR de Compras) — títulos verbatim:**
1. Condições gerais da contratação *(objeto + tabela de itens: ITEM | ESPECIFICAÇÃO | CATMAT | UNIDADE | QUANTIDADE)*
2. Fundamentação e descrição da necessidade da contratação *(art. 6º XXIII "b"; remete ao ETP)*
3. Descrição da solução como um todo, considerado o ciclo de vida do objeto, e especificação do produto *(art. 6º XXIII "c" + art. 40 §1º I)*
4. Requisitos da contratação *(art. 6º XXIII "d"; marca, padronização, sustentabilidade)*
5. Modelo de execução do objeto *(art. 6º XXIII "e")*
6. Modelo de gestão do contrato *(art. 6º XXIII "f")*
7. Infrações e sanções administrativas
8. Critérios de medição e de pagamento *(art. 6º XXIII "g")*
9. Forma e critérios de seleção do fornecedor e forma de fornecimento *(art. 6º XXIII "h")*
10. Estimativas do valor da contratação *(art. 6º XXIII "i")*
11. Adequação orçamentária
12. Disposições finais

Convenção de automação da AGU (mapear no template engine): **texto fixo = literal (mudança exige justificativa nos autos); [colchetes]/itálico = campo a preencher (merge field).**
ETP = **apêndice** do TR (art. 18 §1º; IN SEGES/ME 58/2022); natureza do TR = art. 3º I da IN 81/2022; adoção por qualquer ente = art. 19, IV. Não há modelo de ETP autônomo da AGU.

**Boilerplate verbatim úteis:**
- Abertura: *"Aquisição de [OBJETO], [incluindo instalação, montagem], nos termos da tabela abaixo, conforme condições e exigências estabelecidas neste instrumento."*
- Marca (art. 41, I, "a"–"d"): *"Na presente contratação será admitida a indicação da(s) seguinte(s) marca(s), característica(s) ou modelo(s), de acordo com as justificativas contidas nos Estudos Técnicos Preliminares: (...)"* — seguir de *"ou equivalente / ou similar / ou de melhor qualidade"*.
- Vedação de marca (art. 41, III): *"...a Administração não aceitará o fornecimento dos seguintes produtos/marcas: [...]"*
- Competição: *"As exigências habilitatórias não podem ultrapassar os limites da razoabilidade... Devem restringir-se apenas ao necessário para o cumprimento do objeto licitado."*

## 2. TCU

Guia "Licitações e Contratos: Orientações e Jurisprudência do TCU" (5ª ed., 29/08/2024): https://licitacoesecontratos.tcu.gov.br/
- **Súmula 270**: *"Em licitações referentes a compras, inclusive de softwares, é possível a indicação de marca, desde que seja estritamente necessária para atender exigências de padronização e que haja prévia justificação."*
- Marca **imposta** (Súmula 270, exceção) × marca de **referência** (meramente descritiva → obriga aceitar similar; "ou equivalente"). Súmula 177 (definição precisa/suficiente do objeto), Acórdão 113/2016-P, Acórdão 1973/2020 — **números a reconferir na fonte oficial** (em verificação por agente dedicado).
- Backbone anti-restrição: **art. 9º I "a" + art. 25 §2º/§3º + art. 41**.

## 3. TCE-SC

Não possui cartilha/checklist próprio de TR — adota o art. 6º XXIII da Lei. Relevantes:
- **Resolução TC-237/2023** (ETP/TR/pesquisa de preços — contratações do próprio Tribunal): https://www.tcesc.tc.br/tcesc-normatiza-pontos-da-nova-lei-de-licitacoes-para-suas-contratacoes
- **Nota Técnica TC-4/2023** (padronização de objeto na fase preparatória): https://www.tcesc.tc.br/tcesc-diz-que-procedimento-de-padronizacao-de-objeto-em-licitacoes-e-uma-decisao-da-autoridade
- Frase-modelo (secundária, PDFs atrás de Cloudflare): *"A padronização não deve servir para legitimar a violação aos princípios da igualdade e da competitividade."*

## 4. Doutrina

- **Marçal Justen Filho** (Comentários à Lei de Licitações, RT): *"É necessário que o edital descreva o objeto... para permitir a exata dimensão da disputa."* / *"Não será válida a exigência consagrada no edital que não esteja respaldada por motivação e justificativa apropriadas nos documentos prévios à licitação."*
- **Jacoby Fernandes** (Sistema de Registro de Preços e Pregão, Fórum): definição/vantagens do SRP. Encaixe SRP↔TR (quantitativo máximo estimado sem obrigação de compra; julgamento por preço unitário; carona) = inferência doutrinária, sem citação literal sobre estrutura do TR.

## Anexo legal (Planalto — L14.133)
- **Art. 6º XXIII (a–i)** — esqueleto do TR; termina na alínea "i" (não há "j").
- **Art. 41 (I–IV)** — marca é excepcional; 4 incisos.
- **Art. 40 §1º** — TR contém os elementos do art. 6º XXIII + especificação (preferencialmente por catálogo eletrônico).
- **Art. 18** — fase preparatória + ETP (§2º: mínimo obrigatório incisos I, IV, VI, VIII, XIII).
- **Art. 9º I "a"** — vedado tolerar situações que restrinjam o caráter competitivo.

## Divergências registradas
1. "Similar ou de melhor qualidade" é da Lei 8.666/93 (art. 7º §5º), não da 14.133 — mas a AGU recomenda como redação. Usar como frase-modelo, não como base legal.
2. A ordem de seções da AGU ≠ ordem literal das alíneas do art. 6º XXIII (AGU reagrupa). Seguir a ordem da AGU (defensável/auditável), mapeando cada seção à alínea para rastreabilidade.

## Lacunas honestas
TR de serviços/obras da AGU (conteúdo não aberto); teor ipsis litteris da Res. TC-237/2023 e NT TC-4/2023 (Cloudflare); Jacoby sem literal sobre estrutura do TR; números TCU (Súmula 177; Acórdãos 113/2016, 1973/2020) em reconferência.
