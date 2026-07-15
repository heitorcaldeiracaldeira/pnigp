# Arquitetura PNCP → Plataforma — a referência única

> **Por que este documento existe.** Nós voltamos ao ponto inicial toda vez porque cada rodada inventava uma
> arquitetura nova. Isto encerra o ciclo. **Três leis, não sugestões:**
> 1. **Espelhar o PNCP** — nenhuma tabela que não seja (a) uma entidade do PNCP ou (b) uma derivação analítica
>    explicitamente marcada por cima do espelho. Nunca inventar um modelo próprio.
> 2. **Dados confiáveis** — sempre a fonte estruturada do PNCP; PDF só para o que o PNCP comprovadamente NÃO tem.
> 3. **Do PNCP para a plataforma** — o modelo nasce da estrutura do PNCP; a plataforma consome, não redesenha.

---

## 1. O modelo do PNCP (a fonte da verdade — verificado na API, jul/2026)

O PNCP organiza tudo em torno da **Contratação** (o processo licitatório). Hierarquia real:

```
Órgão/Entidade  (cnpj)
  └─ CONTRATAÇÃO  (a compra/processo)         chave: numeroControlePNCP = {cnpj}-{seqÓrgão}-{seqCompra:6}/{ano}
       ├─ ITEM da contratação                 chave: + numeroItem
       │     └─ RESULTADO do item             (fornecedor + valor homologado)   chave: + sequencialResultado
       │           ⚠️ é LISTA, não "só o vencedor" — ver §2.1
       ├─ ARQUIVO  (edital, TR, ata-doc, termo de homologação…)
       ├─ ATA DE REGISTRO DE PREÇO (ARP)      (quando SRP)
       └─ CONTRATO                             (execução; + termos/aditivos)
  └─ PCA  (Plano de Contratações Anual)
```

**Endpoints (os dois que importam):**

| Uso | Endpoint | Retorna |
|---|---|---|
| **Lista em lote** (por data+UF+modalidade) | `/api/consulta/v1/contratacoes/publicacao` | metadata da CONTRATAÇÃO (modalidade, plataforma, SRP, estimado×homologado, datas). `tamanhoPagina` máx = **50**. |
| **Detalhe** (por chave) | `/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/...` | `/itens`, `/itens/{n}/resultados`, `/arquivos` |

**A chave que amarra tudo é o `numeroControlePNCP`** (`{cnpj}-1-{seq:6}/{ano}`). Todo espelho e toda ligação usam ela.

---

## 2. O que o PNCP TEM estruturado × o que NÃO tem

| Dado | Onde no PNCP | Confiável? |
|---|---|---|
| Contratação (modalidade, SRP, valores, plataforma) | `/contratacoes/publicacao` | ✅ estruturado |
| Itens (descrição, qtd, estimado, situação) | `/itens` | ✅ estruturado |
| Resultado (fornecedor, preço homologado) | `/itens/{n}/resultados` | ✅ estruturado — **LISTA** (ver §2.1) |
| Documentos (PDF) | `/arquivos` | ✅ lista estruturada; conteúdo é PDF |
| **Marca / modelo** | **não existe no estruturado** → só no PDF da ATA | ⚠️ derivado de documento |
| **Lances (histórico da disputa)** | **não existe no estruturado** → só no PDF da ATA | ⚠️ derivado de documento |
| **Participantes (todos os licitantes)** | **não existe** (o /resultados só dá o vencedor) → PDF da ATA | ⚠️ derivado de documento |

### 2.1 — CORREÇÕES DE 2026-07-15 (este doc estava errado; a fonte é a ESPECIFICAÇÃO, não a nossa leitura)

> **A LEI VALE PARA ESTE DOC TAMBÉM.** Ele existe para impedir invenção de arquitetura — e continha duas invenções,
> escritas por engenharia reversa em vez de leitura do spec. O que decide é o **OpenAPI oficial**:
> `https://pncp.gov.br/api/pncp/v3/api-docs` (135 schemas) e `https://pncp.gov.br/api/consulta/v3/api-docs` (23).
> **Ler o spec ANTES de escrever aqui.** Verificado: `curl` nos 2 → JSON com `components.schemas`.

**(a) `/itens/{n}/resultados` NÃO é "só o vencedor" — é uma LISTA.**
O spec tem o endpoint `/itens/{numeroItem}/resultados/{sequencialResultado}` — o `sequencialResultado` prova que um
item tem **N resultados**. Medido na API: 68 de 70 itens têm 1 resultado, mas há itens com 3, 5 e até **67**
(credenciamento). O `ingest_itens_sc.mjs` fazia `r[0]` **por causa desta frase errada** e descartava ~8% dos
resultados. Um item pode ter vários fornecedores homologados (credenciamento, cotações múltiplas de dispensa, SRP).

**(b) MARCA não existe em NENHUM schema — confirmado na fonte, não por amostragem.**
Varredura dos **158 schemas** dos 2 specs: **0** têm campo `marca`/`modelo`/`fabricante`. Inclusive o
`IncluirCompraItemResultadoDTO` — o DTO que as PLATAFORMAS usam para PUBLICAR o resultado. Ou seja: Betha/AZ/
ECustomize **não têm onde enviar marca**, mesmo que quisessem. Por isso ela só existe no PDF que cada uma gera.
Isto CONFIRMA a lei do usuário ("marca está na ata, não em API") pela fonte oficial.

**(c) O município vem do PNCP: `unidadeOrgao.codigoIbge`.** O ingest DESCARTAVA `unidadeOrgao` e DEDUZIA o cod_ibge
de um mapa cnpj→ibge montado de `itens_sc`. Medido: **4,2% dos processos ficaram com município ERRADO** (todos de
unidades do ESTADO, cujo CNPJ único serve municípios diferentes) + 3.724 sem município + só 289 dos 295 municípios
presentes. Inventar dedução sobre um campo que a API entrega em 50/50 registros é exatamente o que este doc proíbe.

**Regra de confiabilidade:** marca/lances/participantes só vêm do PDF **porque o PNCP não os tem** — e ficam sempre
marcados como *derivados de documento*, **nunca substituindo** um dado que o PNCP oferece estruturado (ex.: o preço
homologado vem sempre do `/resultados`, jamais do PDF).

---

## 3. Espelhamento PNCP → nossas tabelas (o estado real)

| Entidade PNCP | Nossa tabela | Chave | Estado |
|---|---|---|---|
| **Contratação** | `contratacoes_sc` | `numero_controle` | ✅ **completo** — 241.302 processos SC 2021-26 |
| **Item + Resultado** | `itens_sc` | `numero_controle` + `numero` | 🔄 em ingestão (~79k de 241k processos) |
| **ARP** | `atas_sc` | `numero_controle` | ✅ ingerido |
| **Contrato** | `contratos_sc` | `numero_controle` | ✅ ingerido |
| **Arquivo** | `arquivos_sc` *(a criar)* | `numero_controle` + seq | ⬜ pendente |
| — camada analítica (derivada) — | | | |
| CATMAT (agrupamento) | `item_catmat_map` | descrição→PDM | derivação sobre `itens_sc` |
| Preço por unidade básica | `precos_referencia_basica_sc` | CATMAT+base+forma | derivação |
| Marca/lances/participantes | *(a criar)* — extraído de `arquivos_sc` (ata) | `numero_controle`+item | derivação de documento |

`processos_sc` virou **VIEW** sobre `contratacoes_sc` (absorvida). `compras_sc` é cache agregado por município (derivação, não entidade).

---

## 4. Onde inventamos arquitetura (e a correção definitiva)

| Invenção | Problema | Correção |
|---|---|---|
| `compra_raiox_sc` (silo "raio-x") | nome próprio, não-PNCP | ✅ renomeado `contratacoes_sc` (entidade PNCP) |
| tabelas de análise misturadas com o espelho | confunde espelho com derivação | separar: **espelho** = entidade PNCP; **derivação** = marcada como camada analítica |

**Lei daqui pra frente:** antes de criar QUALQUER tabela, responder — *"isto é uma entidade do PNCP (espelho) ou uma
derivação sobre o espelho?"* Se não é nenhuma das duas, **não se cria.**

---

## 5. Ordem de construção — do PNCP para a plataforma

```
1. CONTRATAÇÃO   ✅ contratacoes_sc (completo)
2. ITENS+RESULTADO 🔄 itens_sc (em ingestão, ~2-3 dias — teto do rate-limit do PNCP)
3. ARQUIVOS      ⬜ arquivos_sc (lista dos PDFs por contratação)
4. RECONCILIAÇÃO ⬜ contratação ↔ ata(ARP) ↔ contrato (dissonância, respeitando SRP)
   ── a partir daqui, CAMADA ANALÍTICA (derivações sobre o espelho) ──
5. CATMAT (agrupamento) → PREÇO por unidade básica → MARCA/LANCES (da ata, via arquivos_sc)
6. PRODUTOS: banco de sucesso / copiloto de compra / lente de auditor
```

Cada passo só começa quando o anterior está confiável. Nada de pular etapa nem inventar atalho.

---

**Fonte:** verificado empiricamente nos endpoints do PNCP em jul/2026. Este documento é a referência única —
qualquer mudança de arquitetura passa por atualizar aqui primeiro.
