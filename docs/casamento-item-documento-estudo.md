# Casamento item ↔ documento — estudo empírico e o casador

**Objetivo:** ligar cada item da API do PNCP à sua especificação no(s) documento(s) do processo, para enriquecer a classificação CATMAT/CATSER. O campo `descricaoItem` tem teto de 2.048 caracteres (média real 148) — é rótulo; a spec completa vive nos documentos da construção (DFD→ETP→TR→Edital). Ver `docs/mapa-documento-item-enriquecimento.md`.

Scripts: `scripts/analise_casamento_tr.mjs` (estudo), `scripts/padroes_casamento_tr.mjs` (padrões), `scripts/remede_edital.mjs` (TR vs Edital), `scripts/analise_item_documentos.mjs` (evidência por item), `scripts/casa_itens.mjs` (casador 1 doc), `scripts/casa_conjunto.mjs` (casador do conjunto).

---

## 1. O estudo — 200 pregões variados (2024–2025)

- **TR com texto: 198/200** (só 2 escaneados/vazios — TR é quase sempre extraível).
- **Código de catálogo no ITEM da API: 0/200.** O `catalogoCodigoItem` NUNCA vem preenchido. O código só existe **no texto do documento** (o NUC/CATMAT que o comprador escreve no TR/Edital). O "Caminho A" (pegar o código da API) está morto; o código vem do documento.
- **Posição API×TR nem sempre casa:** mensurável em 166/198 → segura 79, boa 18, **quebra 69 (~42%)**. Não dá para casar pelo número.
- **Ambiguidade de conteúdo** (descrições repetidas): 52/200. E ela **é a inimiga da posição**: quebra 79% com ambiguidade vs 37% sem.

## 2. Não existe um documento certo — existe o UNION (por plataforma)

Re-medindo os MESMOS 200 pelo Edital (pareado):

| Plataforma | n | TR | Edital | **UNION (max)** | fonte certa |
|---|--:|--:|--:|--:|---|
| IPM Sistemas | 41 | 0,94 | 0,83 | **0,98** | TR |
| AZ Informatica | 36 | 0,93 | 0,98 | **0,98** | Edital |
| Betha | 58 | 0,86 | 0,83 | **0,93** | TR |
| ECustomize | 7 | 0,81 | 0,75 | **0,88** | TR |
| Pública | 17 | 0,84 | 0,45 | **0,85** | TR |
| **Estado de SC** | 39 | 0,40 | 0,78 | **0,82** | Edital |
| **GERAL** | 200 | **0,80** | 0,81 | **0,92** | — |

Quem ganha: TR 33 · Edital 42 · **empate 125**. **Nenhum documento sozinho basta.** O Estado de SC é o caso didático: o TR é uma **casca** que diz *"Especificações — conforme Anexo I"*, e o Anexo I mora **dentro do Edital** (art. 25 §3: o edital divulga TR/anexos). Ler só o TR dava 0,40; o Edital dá 0,78. Por isso **coletar TODOS os documentos** (regra 2) é o que permite ler a fonte certa de cada plataforma.

## 3. O casador endurecido (`casa_itens.mjs`) — 3 eixos, nesta ordem

1. **Conteúdo pesado por IDF sobre o conjunto de itens do processo** — o token que DIFERENCIA (rejuvenecimento, "4 polos") pesa; o que REPETE (motor, polos) não. Separa itens quase iguais.
2. **Posição como DESEMPATE, não regra** — conteúdo claro manda (permite reordenação: o "suporte" no item 3 da API = pos 6 do TR casou por conteúdo); conteúdo ambíguo (item igual no lote 1 e no lote 2) → a sequência decide.
3. **Confiança + unicidade** — margem best×2º dá o grau (alta/média/baixa); dois itens não caem na mesma linha; baixa/conflito vai à **revisão**, nunca chuta.

Validação: **material** (Videira) 13 alta/1 média/0 baixa · **reorder** (Embalagens) 7/1/0, suporte certo · **serviço/lote** (Motores) 3 alta/192 média/4 baixa — o bug "rejuvenecimento caiu na linha de rebobinagem" **consertado**. A confiança é um sinal honesto: material→alta (spec única), serviço→média (ambíguo, posição resolve), baixa→revisão.

## 4. O casador do conjunto (`casa_conjunto.mjs`) — a evidência da construção inteira

Roda o casador contra CADA documento e consolida por item: melhor acerto (o union) + **convergência eleva a confiança** (≥2 docs concordam → alta) + **código de catálogo** pescado da janela do acerto.

| | Material (Videira) | Serviço (Motores) |
|---|---|---|
| Confiança | 14/14 **alta** | 60/60 **alta** (por convergência) |
| Docs/item | 5,1 | 3,0 |
| **Código de catálogo** | **14/14** (127811, 127929…) | 0/60 |

A convergência **resolve o serviço**: cada item era "média" isolado, mas DFD/ETP/TR/Edital concordam → alta. E o **código de catálogo (CATMAT) é recuperado de 100% dos itens de material** direto do texto — o que a API nunca deu.

## 5. Ressalvas honestas (dívida do próximo passe)

- **Convergência ≠ independência.** O Edital **embute** o TR (art. 25 §3) — "TR + Edital concordam" é corroboração mais fraca que "DFD + TR + pesquisa-de-preços concordam" (autores/etapas diferentes). O próximo passe deve **pesar a corroboração pela independência do autor** (DFD e pesquisa de preços > Edital, que copia o TR).
- **Cobertura 0,92 é PISO** — vem de um localizador heurístico (janela de tokens IDF). Erra pra menos, nunca infla. Um casador melhor sobe isso.
- **Estado de SC fica em 0,82** mesmo no union — parte é lixo de encoding na descrição da API, parte é limite do localizador.
- O casador hoje lê os documentos da **contratação**. Ata/contrato (marca entregue, resultado) ainda não coletados — quando forem, a evidência fecha do "pedido" ao "entregue".

## 6. Por que isso importa (a costura)

Cada documento é feito por um **departamento diferente** (requisitante→DFD, compras→ETP/TR, jurídico→Edital, pregoeiro→Ata, gestor→Contrato); o campo do PNCP é preenchido por mais uma mão. **As divergências entre documentos não são ruído — são as COSTURAS**, e a costura é onde mora o risco (direcionamento, item no lote errado, spec que muda do TR para o edital). O casador de conjunto, ao cruzar as testemunhas, **enriquece a classificação E audita as costuras de graça**.
