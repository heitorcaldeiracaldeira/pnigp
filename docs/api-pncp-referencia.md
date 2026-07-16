# API do PNCP — referência

**Tudo que foi MEDIDO em 2026-07-15, num lugar só.** Cada afirmação diz como foi apurada.
Marcado **`[NÃO TESTADO]`** o que eu não chamei — não inventar comportamento.

**Leis:** espelhar o PNCP (nome de tabela = nome do PNCP); **schema mente, só o JSON cru prova**; medir, nunca afirmar;
não dizer "não existe" sem ter chamado.

---

## 1. As duas APIs

| | base | endpoints | serve para |
|---|---|---|---|
| **Consulta** | `https://pncp.gov.br/api/consulta` | 12 | varredura por data — é por onde se COLETA |
| **Integração** | `https://pncp.gov.br/api/pncp` | 109 | detalhe por chave — é por onde se APROFUNDA |

Specs: `/api/consulta/v3/api-docs` e `/api/pncp/v3/api-docs`.
Manual (41p, lido inteiro): `C:\Users\PC\OneDrive\Área de Trabalho\API publica comprasnet.pdf`.

### A CHAVE que liga tudo
`numeroControlePNCP` = `83102335000148-1-000057/2025` → decompõe em **`cnpj`, `ano`, `seq`**, e essas três abrem
todos os endpoints da entidade. **O dígito do meio é MARCADOR DE ENTIDADE** (§4.1): `0`=PCA, `1`=contratação,
`2`=contrato. Por isso **o contrato NÃO casa pelo mesmo sequencial** — a ponte é
`/v1/orgaos/{cnpj}/contratos/contratacao/{ano}/{seq}`. A **ata** = numeroControle da contratação + sequencial da ata.

---

## 2. Endpoints

### Consulta (12) — todos GET
| endpoint | obrigatórios | nota |
|---|---|---|
| `/v1/contratacoes/publicacao` | `dataInicial`, `dataFinal`, **`codigoModalidadeContratacao`**, `pagina` | modalidade obrigatória → varrer as **13**. `tamanhoPagina` máx **50** (medido) |
| `/v1/contratacoes/atualizacao` | idem | **`[NÃO TESTADO]`** — é a coleta INCREMENTAL diária |
| `/v1/contratacoes/proposta` | `dataFinal`, `codigoModalidadeContratacao`, `pagina` | **recebendo proposta AGORA**. Traz `linkSistemaOrigem` + `dataEncerramentoProposta` |
| `/v1/atas` | período de vigência | |
| `/v1/atas/atualizacao` | | **`[NÃO TESTADO]`** |
| `/v1/contratos` | data de publicação | |
| `/v1/contratos/atualizacao` | | **`[NÃO TESTADO]`** — contratos **e empenhos** |
| `/v1/instrumentoscobranca/inclusao` | data de inclusão | **`[NÃO TESTADO]`** — NF/pagamento |
| `/v1/orgaos/{cnpj}/compras/{ano}/{seq}` | | uma contratação |
| `/v1/pca/`, `/v1/pca/usuario`, `/v1/pca/atualizacao` | `anoPca` + classificação | plano anual |

Retorno padronizado (§4.2): `data[]`, `totalRegistros`, `totalPaginas`, `numeroPagina`, `paginasRestantes`, `empty`.

### Integração (109) — a cadeia
```
/v1/orgaos/{cnpj}/compras/{ano}/{seq}
    /itens · /itens/quantidade · /itens/{n} · /itens/{n}/resultados · /itens/{n}/resultados/{sr}
    /itens/{n}/imagem            → 404 "Nenhuma imagem encontrada" (medido)
    /arquivos · /arquivos/{sd} · /arquivos/quantidade · /arquivos/excluidos/{sd}
    /atas · /atas/{sa} · /atas/{sa}/arquivos · /atas/{sa}/contratos · /atas/{sa}/partesenvolvidas
    /atas/{sa}/historico
    /historico · /historico/quantidade
    /fonte-orcamentaria          → devolveu [] (medido)
/v1/orgaos/{cnpj}/contratos/contratacao/{ano}/{seq}     ← A PONTE processo→contrato
/v1/orgaos/{cnpj}/contratos/{ano}/{seq}
    /empenhos · /empenhos/{se}          [NÃO TESTADO]
    /instrumentocobranca · /{sic}       [NÃO TESTADO] — NF/pagamento
    /termos · /termos/{st}/arquivos · /historico
/v1/orgaos/ · /v1/orgaos/{cnpj} · /v1/orgaos/id/{orgaoId}
```
Domínio: `/v1/modalidades`, `/modos-disputas`, `/criterios-julgamentos`, `/amparos-legais`, `/catalogos`,
`/categoriaItemPcas`, `/fontes-orcamentarias` + cruzamentos (`/modalidade-criterio-julgamento`,
`/modalidade-fonte-orcamentaria`, `/instrumento-convocatorio-modalidade-amparo-legal`). **`[NÃO TESTADOS]`** — os
valores abaixo vieram do manual.

---

## 3. Flags e tabelas de domínio

### Situação do ITEM (§5.6) — **é o "status" que existe**
`1` Em Andamento · **`2` Homologado (tem resultado, fornecedor informado)** · `3` Anulado/Revogado/Cancelado ·
`4` **Deserto** (ninguém apareceu) · `5` **Fracassado** (todos desclassificados/inabilitados)
> **NÃO existe "adjudicado" nem "em fase de lances".** Verificado no `/historico`.

### Situação da CONTRATAÇÃO (§5.5)
`1` Divulgada no PNCP · `2` Revogada · `3` Anulada · `4` Suspensa

### Situação do RESULTADO do item (§5.8)
`1` **Informado**: *"possui valor e fornecedor **e marca**"* · `2` Cancelado
> ⛔ **O manual PROMETE marca e a API NÃO TEM.** Chamei `/resultados` e olhei o JSON cru: **37 campos, nenhum é
> marca**. O PNCP descumpre a própria especificação. **Material de advocacy.**

### Tipo de BENEFÍCIO (§5.7) — a LC 123/2006
`1` Exclusiva ME/EPP · `2` Subcontratação ME/EPP · `3` Cota reservada ME/EPP · **`4` Sem benefício (= UNIVERSAL)** ·
`5` Não se aplica
> É sobre **quem pode disputar**, não é status. `beneficio_lc` (legado) grava só o NOME e joga fora o que não é
> benefício → `4` e `5` viram os dois NULL, **indistinguíveis**. Usar **`tipo_beneficio_id`**.

### Critério de JULGAMENTO (§5.4)
`1` Menor preço · `2` Maior desconto · `4` Técnica e preço · `5` Maior lance · `6` Maior retorno econômico ·
`7` Não se aplica · `8` Melhor técnica · `9` Conteúdo artístico
> **Muda o significado do preço**: em *maior desconto*, comparar unitário contra estimado não quer dizer o mesmo.

### Modalidade (§5.2) — **obrigatória na coleta**
`1` Leilão-Eletrônico · `2` Diálogo Competitivo · `3` Concurso · `4` Concorrência-Eletrônica ·
`5` Concorrência-Presencial · `6` Pregão-Eletrônico · `7` Pregão-Presencial · `8` **Dispensa** · `9` Inexigibilidade ·
`10` Manifestação de Interesse · `11` Pré-qualificação · `12` Credenciamento · `13` Leilão-Presencial

**Medido em SC (241.302 processos, 4 anos) — todas as 13 existem:**
Dispensa 117.935 · Pregão-E 63.756 · Inexigibilidade 37.394 · Concorrência-E 13.298 · Credenciamento 5.166 ·
Pregão-P 2.273 · Concorrência-P 801 · Leilão-E 437 · Leilão-P 141 · Concurso 56 · Pré-qualificação 41 ·
Manifestação 3 · **Diálogo Competitivo 1**.
> **Dispensa é quase metade.** Recortar "só licitação" perde o maior pedaço. Lei do usuário: *"processos é qualquer
> forma de compra"*. **241.298 de 241.302 têm itens (100,0%).**

### Modo de disputa (§5.3)
`1` Aberto · `2` Fechado · `3` Aberto-Fechado · `4` Dispensa Com Disputa · `5` Não se aplica · `6` Fechado-Aberto

### Instrumento convocatório (§5.1)
`1` Edital (pregão/concorrência/concurso/diálogo/credenciamento) · `2` Aviso de Contratação Direta (dispensa COM
disputa) · `3` Ato que autoriza a Contratação Direta (dispensa SEM disputa / inexigibilidade)

### **TIPO DE DOCUMENTO (§5.12) — o campo que eu ignorei o dia todo**
`1` Aviso de Contratação Direta · `2` Edital · `3` Minuta do Contrato · `4` Termo de Referência · `5` Anteprojeto ·
`6` Projeto Básico · `7` Estudo Técnico Preliminar · `8` Projeto Executivo · `9` Mapa de Riscos · `10` DFD ·
`11` Ata de Registro de Preço · `12` Contrato · `13` Termo de Rescisão · `14` Termo Aditivo · `15` Apostilamento ·
**`16` Outros Documentos** · `17` Nota de Empenho · `18` Relatório Final de Contrato
> O manual diz: *"Para outros documentos do processo usar o código **16**"*. **A taxonomia NÃO tem "resultado"/"ata
> de sessão"/"homologação"** → a ata cai no 16. **Medido em SC: 197.462 docs / 270 municípios no tipo 16** — o maior
> balde, e onde a marca mora. **O tipo é o UNIVERSO do download; o título é PRIORIDADE, nunca portão** (usar título
> como filtro fechava 76% do catálogo de 627.344 docs).

### Porte (§5.14) `1` ME · `2` EPP · `3` Demais · `4` Não se aplica (PF) · `5` Não informado
### Categoria do processo (§5.11) `1` Cessão · `2` Compras · `3` TIC · `4` Internacional · `5` Locação Imóveis · `6` Mão de Obra · `7` Obras · `8` Serviços · `9` Serv. Engenharia · `10` Serv. Saúde · `11` Alienação
### Amparo legal (§5.15) 80 códigos · Natureza jurídica (§5.13) ~90 · Categoria item PCA (§5.16) 8

### `/historico` — decifrado (medido em 221 eventos, 9 processos)
| `categoriaLogManutencao` | | `tipoLogManutencao` | |
|---|---|---|---|
| `1` | Contratação | `0` | Inclusão |
| `4` | Item de Contratação | `1` | Retificação |
| `5` | Resultado de Item de Contratação | | |
| `6` | Documento de Contratação | | |
> **4 entidades × 2 ações. É log de PUBLICAÇÃO, não do pregão.** Não há evento de adjudicação, lance ou sessão.
> Campos: `logManutencaoDataInclusao`, `usuarioNome`, `itemNumero`, `itemResultadoSequencial`, `documentoTitulo`,
> `justificativa`.

---

## 4. Entidades — campos reais (JSON cru)

### ITEM — **36 campos** (guardávamos 8). Mapa: `scripts/campos_item_pncp.mjs`
`numeroItem, descricao, informacaoComplementar, unidadeMedida, quantidade, valorUnitarioEstimado, valorTotal,
orcamentoSigiloso, situacaoCompraItem(+Nome), temResultado, tipoBeneficio(+Nome), criterioJulgamentoId(+Nome),
materialOuServico(+Nome), itemCategoriaId(+Nome), catalogo{id,nome}, catalogoCodigoItem, categoriaItemCatalogo{},
ncmNbsCodigo(+Descricao), aplicabilidadeMargemPreferenciaNormal/Adicional,
percentualMargemPreferenciaNormal/Adicional, tipoMargemPreferencia, exigenciaConteudoNacional,
incentivoProdutivoBasico, patrimonio, codigoRegistroImobiliario, imagem, dataInclusao, dataAtualizacao`
- **Paginação: o default é 10!** Usar `?pagina=N&tamanhoPagina=500`.
- **`numeroItem` NÃO é 1..N**: Betha/IPM/ECustomize cumprem; **AZ/Licitanet/Licitações-e publicam o ID interno**
  (ex.: 1.591.461). Dado de PDF casa por **descrição**, não por número.
- `catalogoCodigoItem` (o CATMAT) **vem vazio**: medido **1 em 16**. O eixo real é `item_catmat_map.codigo_pdm`.

### RESULTADO — **37 campos**, `/itens/{n}/resultados` é **LISTA**
`sequencialResultado, niFornecedor, nomeRazaoSocialFornecedor, tipoPessoa, quantidadeHomologada,
valorUnitarioHomologado, valorTotalHomologado, percentualDesconto, porteFornecedorId(+Nome), naturezaJuridicaId(+Nome),
ordemClassificacaoSrp, situacaoCompraItemResultadoId(+Nome), dataResultado, dataInclusao, dataAtualizacao,
dataCancelamento, motivoCancelamento, indicadorSubcontratacao, aplicacaoMargemPreferencia, aplicacaoBeneficioMeEpp,
aplicacaoCriterioDesempate, amparoLegalMargemPreferencia, amparoLegalCriterioDesempate, paisOrigemProdutoServico,
codigoPais, localidadeFornecedor, localidadeExterior, moedaEstrangeira, valorNominalMoedaEstrangeira,
dataCotacaoMoedaEstrangeira, timezoneCotacaoMoedaEstrangeira, reservaRemanescente{}, numeroControlePNCPCompra`
- **Guardar `r[0]` descarta o resto.** Medido: **938.333 resultados em 590.470 itens = 1,6 por item.**
- **NENHUM campo de marca/modelo/fabricante.**

### CONTRATAÇÃO — 32 campos (`/contratacoes/publicacao`)
`numeroControlePNCP, numeroCompra, anoCompra, processo, tipoInstrumentoConvocatorioId(+Nome), modalidadeId(+Nome),
modoDisputaId(+Nome), situacaoCompraId(+Nome), objetoCompra, informacaoComplementar, srp, amparoLegal{},
valorTotalEstimado, valorTotalHomologado, dataAberturaProposta, dataEncerramentoProposta, dataPublicacaoPncp,
dataInclusao, dataAtualizacao, sequencialCompra, orgaoEntidade{cnpj,razaosocial,poderId,esferaId},
unidadeOrgao{codigoUnidade,nomeUnidade,codigoIbge,municipioNome,ufSigla,ufNome}, orgaoSubRogado{},
unidadeSubRogada{}, usuarioNome, linkSistemaOrigem, justificativaPresencial`
- **`unidadeOrgao.codigoIbge` é o município — a API DÁ.** Deduzir por CNPJ errava **4,2%** (unidades do Estado).
- `valorTotalEstimado` = **0** se `orcamentoSigiloso` e o item não tem resultado (§6.3 campo 17).
- **`usuarioNome` é quem PUBLICOU (o ERP), não quem rodou a sessão.**

### CONTRATO — `contratos_sc` já tem 1.815.968 linhas / 238 munis
Colunas atuais: `numero_controle_compra, cnpj_compra, ano_compra, seq_compra, fornecedor, ni_fornecedor,
valor_global, vig_inicio, vig_fim, assinatura, objeto, orgao`. **A ponte processo→contrato JÁ EXISTE.**
**`[NÃO CONFERIDO]`** quantos campos a API traz além destes — provável que estejamos jogando fora, como no item.

### ATA, EMPENHO, NOTA FISCAL, PCA, PARTES ENVOLVIDAS — **`[NÃO TESTADOS]`**

---

## 5. Comportamento (medido)

- **429** é agressivo → backoff longo (até ~32s, 8 tentativas). `CONC=8` processos × `CONC_RES=12` GETs ≈ 96 em voo
  aguentou. Se barrar em massa, **baixar `CONC`**, não `CONC_RES`.
- **204** = sem conteúdo (`/atas` de processo sem ata devolveu 204, 0 bytes).
- **404** com corpo JSON (`{timestamp,status,error,message,path}`) — ex.: `/imagem`.
- **Gargalo é HTTP, não o Neon**: Neon com 3 conexões de 901, 0 query ativa, 0 lock; `SELECT 1` = 170ms (latência de
  rede); count em 2,2M linhas = 1,4s. **~250 processos/min → ~16h para os 241.302** (custo: ~1,1 milhão de GETs em
  `/resultados`, um por item premiado).
- **PDF traz byte NUL** → o Postgres RECUSA em TEXT. Limpar ` ` + lone surrogates.

---

## 6. Ciclo de vida / fases

O ciclo notificável é **mais grosso que o pregão real**. É o que existe:

| fase | como se apura |
|---|---|
| **Recebendo proposta** | contratação: `now()` entre `dataAberturaProposta` e `dataEncerramentoProposta`. Ou `/contratacoes/proposta` |
| **Em disputa/julgamento** | passou o encerramento e o item segue `situacaoCompraItem=1` — **inferência**, não campo |
| **Homologado** | `situacaoCompraItem=2` + `dataResultado` (carimbo item a item, com hora) |
| **Deserto / Fracassado** | `situacaoCompraItem` 4 / 5 |
| **Anulado/Revogado/Suspenso** | item `=3`; processo `situacaoCompraId` 2/3/4 |
| **Retificado / documento novo** | `/historico`: `tipoLogManutencao=1`; categoria 6 + `documentoTitulo` |
| **Virou contrato** | `/contratos/contratacao/{ano}/{seq}` devolve |
| **Empenhado / pago** | `/contratos/{ano}/{seq}/empenhos` e `/instrumentocobranca` **`[NÃO TESTADOS]`** |

**Exemplo real — Balneário Piçarras 2025/57** (`/historico`, 22 eventos):
```
20/03 12:12  Contratação incluída          20/03 12:12  TR rep. ass..pdf
10/06 10:00  recurso recebido email.pdf    12/06 15:41  DECISAO DE RECURSO Intempestivo
13/06 08:51  Item 1 retificado → Resultado do item 1 incluído   (idem itens 2..5)
```
O ciclo é rastreável **item a item, com hora** — e mostra o recurso e sua decisão.

---

## 7. Coleta incremental diária — **`[NÃO TESTADO]`, e é a peça que falta**

Existem **4 endpoints `/atualizacao`**: contratações, atas, contratos(+empenhos), PCA. Se devolvem o que mudou por
janela de data, a coleta deixa de ser 241 mil processos e vira **centenas por dia** — que é o modo normal; varredura
completa só para backfill.
> A memória do projeto registra uma coleta diária **desativada** porque virou refresh completo de ~12h e morria no
> limite de 3h. **Estes endpoints são o conserto.** Testar: parâmetros, janela aceita, e quantos registros num dia
> típico de SC.

---

## 8. O que a API **NÃO** tem (testado, não suposto)

| | evidência |
|---|---|
| **MARCA / modelo / fabricante** | JSON cru de `/resultados`: 37 campos, nenhum. **O manual §5.8 promete.** Só existe no **PDF da ata** |
| **Lance a lance** | nenhum endpoint nos dois specs. Fica na ata ou no portal da plataforma → **fonte separada** |
| **"Adjudicado" / "em fase de lances"** | `situacaoCompraItem` tem 5 valores e nenhum é esses; `/historico` só tem Inclusão/Retificação de 4 entidades |
| **CATMAT preenchido** | o campo `catalogoCodigoItem` **existe** e vem **vazio**: 1 em 16 (todas as plataformas) |
| **Nº de licitantes por item** | não há campo. Só contando as propostas do PDF da ata |

---

## 9. Consequências para o produto

- **1.125.941 itens homologados em SC** (284 munis): **98,8% com fornecedor e preço, da API, sem PDF.**
  **Marca: 0,7%** — só do PDF. **O banco de compras já existe; a marca é o furo.**
- **Os DOIS preços** (`valorUnitarioEstimado` × `valorUnitarioHomologado`) cobrem **98,6%** e são o **sinal de
  disputa sem PDF**. **408.717 itens (36,8%) arremataram no estimado ou acima** = ninguém puxou o preço.
- **Documento de resultado**: só **51.686 de 240.331 processos (21,5%)** têm algum. A marca para TODOS os itens
  **não existe** — 78% dos processos não publicam o documento onde ela mora.
- Gatilhos de notificação: `docs/notificacoes-pncp.md` (20, os dois públicos).
