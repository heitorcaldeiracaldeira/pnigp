# Nota Explicativa — Metodologia do Mapa de Preços de Referência

**Como a PNIGP compõe o valor estimado dos processos licitatórios a partir das compras públicas do PNCP.**
Base legal verificada nas fontes oficiais (jul/2026): Lei nº 14.133/2021, art. 23; IN SEGES/ME nº 65/2021, arts. 5º–6º (vigente). Este documento é a *memória metodológica* que o mapa segue e que é anexada, como memória de cálculo, ao ETP e ao TR.

---

## 1. Finalidade e enquadramento legal

O **mapa de preços** é o conjunto rastreável de compras públicas comparáveis que **fundamenta o valor estimado** da contratação (Lei 14.133/2021, art. 23) e serve de **memória de cálculo da pesquisa de preços** exigida no ETP (art. 18, §1º, VI) e no TR (art. 6º, XXIII, "i"). Não é estimativa nova: é a consolidação disciplinada do que a Administração pública **já pagou** pelo mesmo item.

**Abrangência — qualquer produto OU serviço comparável.** O banco de preços não é de um domínio (não é "de medicamentos"). Ele cobre **qualquer objeto que tenha unidade básica homogênea e pontos suficientes para comparar** — bens (material de expediente, medicamento, pneu, cimento, equipamento) e **serviços com unidade mensurável** (coleta de resíduos por tonelada, refeição/marmita por unidade, hora-máquina, transporte por km). O que decide a entrada no mapa **não é o rótulo "produto × serviço", e sim a COMPARABILIDADE** (§2 e §5): objeto único/sob medida — uma obra específica, uma consultoria — não tem preço comparável e **não entra**, caindo para outro parâmetro do art. 23 (§1º, III/IV). Medicamento é apenas o caso usado para ilustrar o método.

**Hierarquia da fonte.** A base da PNIGP são as compras homologadas no **PNCP** (municípios de SC). Isso a coloca no **parâmetro de maior preferência** da lei:

- **Lei 14.133/2021, art. 23, §1º, I** — *"composição de custos unitários menores ou iguais à mediana do item correspondente no painel para consulta de preços ou no banco de preços em saúde disponíveis no **Portal Nacional de Contratações Públicas (PNCP)**"*.
- **Lei 14.133/2021, art. 23, §1º, II** — *"contratações similares feitas pela Administração Pública, em execução ou concluídas no período de 1 (um) ano anterior..."*.
- **IN SEGES/ME 65/2021, art. 5º** — mesmos parâmetros; prioridade a **preços públicos** (Painel de Preços / banco de preços em saúde).

Ou seja: o mapa **não** depende de cotação com fornecedor (art. 23, §1º, IV — o parâmetro mais frágil). Ele nasce do preço público, que a doutrina e o TCU tratam como o mais robusto.

---

## 2. O método em duas passagens (por que uma só não basta)

O preço unitário só é comparável entre **o mesmo objeto, na mesma unidade**. Uma classificação única (CATMAT) é necessária, mas **insuficiente**: o CATMAT identifica o *princípio/produto*, não a *apresentação*. Ex. real: o PDM "DIPIRONA SÓDICA" junta 500 mg × 1 g × dipirona **associada** a outros fármacos × comprimido × frasco (gotas) × ampola (injetável) — preços de R$ 0,10 a R$ 3,90 que **não são o mesmo item**. Comparar assim viola o pressuposto do art. 23 (mesmo objeto). Por isso o método tem **dois passes**:

### Passe 1 — Classificação (acha o universo)
Cada descrição de compra é classificada no **catálogo oficial (art. 19, II)**: **CATMAT** para bens, **CATSER** para serviços. Retriever trigrama + reranker-LLM com abstenção. Resultado: `item_catmat_map` (descrição → item de catálogo). **Função:** reunir "tudo que é o mesmo objeto", apesar de cada município escrever diferente. A abstenção **não** é "descartar serviço" — é descartar o que é **genérico/sob medida/não comparável**; um serviço com unidade mensurável é classificado no CATSER e segue para o Passe 2 como qualquer bem.

### Passe 2 — Recontagem por unidade básica e apresentação (torna comparável)
Dentro de cada grupo CATMAT, recomputa-se a referência por **chave de comparabilidade**, e não por CATMAT:

> **chave = CATMAT + forma + concentração/dimensão + associação (sim/não) + unidade básica**

O preço de cada compra é reduzido ao **preço por unidade básica** (ver §3). A referência (mediana) é calculada **por chave**, isolando 500 mg de 1 g, comprimido de gotas, dipirona pura de dipirona associada. Para não-medicamento, os atributos são genéricos (capacidade, tamanho, material, tensão…): **apresentação é a camada geral; medicamento é apenas um caso**.

---

## 3. Unidade básica da compra (princípio central)

**Todo preço é normalizado à unidade básica indivisível** — comprimido, mililitro, grama, unidade, metro — *desempacotando* a embalagem e a quantidade embutida:

```
preço_unidade_básica = valor_unitário_homologado / fator_de_desempacotamento
```

Exemplos (bens, serviços e além de medicamento):
- "Caixa com 100 comprimidos" a R$ 10,00 → **R$ 0,10 / comprimido**.
- "Resma 500 folhas A4" a R$ 25,00 → **R$ 0,05 / folha**; "Cimento CP-II saco 50 kg" a R$ 30,00 → **R$ 0,60 / kg**.
- "Pacote 400 g" a R$ 8,00 → **R$ 0,02 / g**; "Frasco 500 ml" a R$ 6,00 → **R$ 0,012 / ml**.
- **Serviços comparáveis:** "Coleta de resíduos — contrato mensal 200 t" → **R$ / tonelada**; "Transporte escolar — R$ 12.000/mês por 800 km/dia" → **R$ / km**; "Fornecimento de refeições — 5.000 marmitas" → **R$ / refeição**.

Só após essa redução os preços entram no mesmo grupo. Isso operacionaliza o art. 23, *caput* ("quantidades a serem contratadas, observada a potencial economia de escala") e evita a comparação "caixa × unidade" que é a fonte nº 1 de falso sobrepreço. A canonização de unidade já existe na base (funde ~4.838 variações de rótulo), preservando a quantidade embutida quando ela define o preço.

---

## 4. Curadoria de outliers (o que a lei manda excluir)

**IN SEGES/ME 65/2021, art. 6º** — o preço estimado é a **média, a mediana ou o menor valor** obtido, *"desde que o cálculo incida sobre um conjunto de três ou mais preços... desconsiderados os valores **inexequíveis, inconsistentes e os excessivamente elevados**"*, e a exclusão deve ter **critério fundamentado descrito no processo**.

Implementação:
- **Inexequível** (muito abaixo — erro de lançamento, "produto inteiro como 1 g"): abaixo do limite inferior estatístico (IQR) **ou** contagem instável (grama/ml em item vendido por unidade).
- **Excessivamente elevado** (muito acima — compra única, apresentação diferente que escapou): acima do limite superior (IQR).
- **Inconsistente**: apresentação não parseável com segurança → **baixa confiança, não força a comparação** (mesma disciplina de abstenção do Passe 1).
- Cada ponto excluído fica **visível com o motivo** (nunca apagado silenciosamente) — é o "critério fundamentado nos autos".

---

## 5. Medida-síntese e suficiência

- **Mediana** como referência (robusta a outliers; é a medida que o próprio art. 23, §1º, I, cita para o Painel de Preços). Exibe-se também a **faixa P25–P75** (dispersão) e o **nº de compras / nº de municípios**.
- **Mínimo de 3 preços válidos** por chave (art. 6º). Abaixo disso, o mapa **sinaliza insuficiência** e recomenda complementar com outro parâmetro (art. 23, §1º, III/IV — mídia, tabela ou cotação com fornecedores).

### 5.1 Forma de aquisição — caixa (escala) × unitária (avulso)

A unidade básica torna os preços **comparáveis**; a forma de aquisição revela **onde está a economia**. Para o mesmo item e a mesma unidade básica, o mapa separa duas formas (mesmo modelo já usado na referência nacional, `precos_nacional_ref.forma`):

- **avulso** — embalagem/lote unitário (fator 1): ex. "comprimido", "unidade".
- **escala** — embalagem com contagem embutida (fator c>1): ex. "caixa com 100", "fardo", "pacote 500" → preço por unidade básica **do pacote**.

O fator de desempacotamento (§3) já entrega o preço/unidade básica de cada forma; basta agrupar por forma e comparar a mediana de cada uma. **Saída de primeira classe:** "comprando em **caixa de 100** sai R$ 0,10/comp.; **avulso** sai R$ 0,18/comp. → **economia de 44%** em escala". Isso alimenta a recomendação do TR ("especifique a aquisição por caixa/lote de N, salvo restrição de validade/armazenagem") e atende o art. 23, *caput* (potencial economia de escala).

Ressalva neutra: escala nem sempre é viável (prazo de validade, capacidade de estoque, fracionamento por unidade de saúde). O mapa **mostra a economia**; a decisão é do gestor.

---

## 6. Rastreabilidade — a memória de cálculo

Cada linha do mapa carrega: **município · data · quantidade · valor bruto · preço/unidade básica · fonte (nº do processo no PNCP) · incluído/excluído + motivo**. Esse conjunto é anexado ao ETP e ao TR como tabela **"Memória de cálculo da pesquisa de preços"**, satisfazendo art. 18, §1º, VI ("memórias de cálculo e os documentos que lhe dão suporte"). Transforma o documento de *"cita a mediana"* em *"prova a mediana"* — blindagem no TCE.

---

## 7. Limitações honestas (declaradas no rodapé do mapa)

1. **Não considera marca/qualidade** — compara função/apresentação, não fabricante.
2. **Apresentação por heurística** — o parse de forma/concentração pode errar; itens de baixa confiança são marcados e não entram no cálculo.
3. **Atualização temporal** — preços antigos exigem índice de atualização (art. 23, §1º, I/II); o mapa exibe a data de cada compra.
4. **Medicamento ganhará camada CMED/Anvisa (PMVG)** — apresentação exata + **preço-teto legal**; o CATMAT acha o grupo, a CMED dá o teto.
5. **Cobertura** — a base é do que já foi comprado em SC; item sem histórico local cai para a referência **nacional** (Painel de Preços) e, em último caso, cotação com fornecedores (art. 23, §1º, IV).

---

## Fontes (verificadas jul/2026)

- Lei nº 14.133/2021, art. 23 e §§ — Planalto.
- IN SEGES/ME nº 65/2021, arts. 5º e 6º — Portal de Compras do Governo Federal (vigente).
- Lei nº 14.133/2021, art. 18, §1º, VI (memória de cálculo no ETP); art. 6º, XXIII, "i" (estimativa no TR); art. 19, II (catálogo).
