# A forma de ter todos os dados do PNCP

**Escrito em 2026-07-16, depois de um dia inteiro errando.** Cada regra abaixo custou horas e está no commit que a
originou. Não é opinião — é o que sobrou quando as minhas ideias caíram.

---

## As quatro regras

### 1. Não descarte nada — `raw jsonb` em toda entidade
Mapear campo a campo é uma corrida que se perde. Escrevi um mapa de 49 campos para a contratação e **seis
escaparam** (`linkProcessoEletronico`, `dataAtualizacaoGlobal`, `fontesOrcamentarias`,
`tipoInstrumentoConvocatorioCodigo`). Amanhã o PNCP acrescenta um e escapa de novo.
> As colunas tipadas ficam (as telas dependem, índice em coluna é mais rápido). O `raw` é a **garantia**: o que a
> API mandou está lá, íntegro, e nada precisa ser recoletado quando descobrirmos que um campo importa.
> Custo: ~2 KB por registro. Contra 16 h de recoleta.

### 2. Nenhum filtro na entrada
**Filtro que decide o que se olha não é otimização — é ponto cego com nome de eficiência, e o custo é invisível por
construção.** Três vezes no mesmo dia:

| filtro | o que decidia | o que custou |
|---|---|---|
| regex de título | qual documento baixar | fechou **76%** do catálogo (149.508 docs) |
| `r[0]` | qual resultado guardar | descartava o resto — a média é **1,6 resultado/item** |
| flag `temResultado` | qual item consultar | **nula em 90%** dos itens |

As três deram bases limpas, coerentes e **erradas**.

### 3. Falha nunca vira zero — `scripts/pncp_http.mjs`
**Falha vira zero. Zero vira conclusão. Conclusão vira decisão.** Quatro vezes em 15–16/jul:
`byte NUL → retry cego 25× em silêncio` · `.catch(() => ({rows:[]})) → "0 pendentes" e exit 0` ·
`!r.ok → [] → bloqueio virou "não tem"` · `filter(flag) → 90% invisível`.
> O único "não tem" legítimo é o que a API **AFIRMA**: HTTP 204, ou 404 em recurso opcional.
> Todo o resto grita. **`getTodas` confere o que veio contra o `totalRegistros` declarado** — parcial é pior que
> nada, porque vira um número plausível.

### 4. Consumir o LOG, não varrer o estado
**O PNCP é um log de publicação** (`/historico` só tem Inclusão, Retificação e Exclusão), não um banco de estado.
Perguntar "qual o estado do processo X?" custa 1,1 milhão de GETs para descobrir que quase nada mudou.
> `/contratacoes/atualizacao` diz **quem** mudou · `/historico` diz **o que** mudou, em 1 GET por processo.
> **Validado: 114 GETs contra 1.206.510 = 99,99% de economia.** E o mesmo evento que preenche o dado **notifica**.

---

## As entidades — o que existe e o que falta

| entidade | campos | como | estado |
|---|---|---|---|
| **contratação** | 45 | `/contratacoes/publicacao` + `/atualizacao` | ✅ `raw` · 241.302 |
| **item** | 36 | `/compras/{ano}/{seq}/itens` | ✅ `raw` · guardava **8 de 36** |
| **resultado** | 37 | `/itens/{n}/resultados` (é **LISTA**) | ✅ `raw` · o `r[0]` descartava o resto |
| **arquivo da contratação** | 9 | `/compras/{ano}/{seq}/arquivos` | ⚠️ 627.344 catalogados · falta `raw` |
| **ata** | — | `atas_sc` | ✅ 64.184 |
| **🔴 arquivo da ATA** | 9 | `/compras/{ano}/{seq}/atas/{sa}/arquivos` | ❌ **NUNCA COLETADO** — e **é onde a marca vive** |
| **contrato** | 56 | `/contratos/atualizacao` · `/contratos/contratacao/{ano}/{seq}` | ⚠️ 1.856.508 · guarda 12 de 56 · falta `raw` |
| **🔴 arquivo do CONTRATO** | 9 | `/contratos/{ano}/{seq}/arquivos` | ❌ **NUNCA COLETADO** — é o contrato assinado |
| **empenho** | — | `/contratos/{ano}/{seq}/empenhos` | ⛔ **não existe**: 404 "Nenhum empenho" (confirmado) |
| **nota fiscal** | 71 | `/instrumentoscobranca/inclusao` | ⚠️ existe, mas ver abaixo |

**Todas as entidades têm `/arquivos`. Coletamos uma de quatro.**

---

## O que a API NÃO resolve (testado, não suposto)

- **Marca**: nenhum campo, em nenhuma entidade. O manual §5.8 **promete** ("possui valor e fornecedor **e marca**")
  e o JSON cru tem 37 campos e nenhum. Só existe no **PDF da ata** — e os arquivos das atas nunca foram coletados.
- **Especificação do item**: `descricaoItem` é **Texto(2048)** e diz *"conforme catálogo utilizado"*. Não cabe, e
  não é para caber: o TR e o edital têm espaço ilimitado, e é lá que a lei manda a especificação estar (art. 40 §1º).
  Caso: Florianópolis publicou **"veiculo"** (7 letras) num carro de R$ 108.230; o TR diz 100CV, bicombustível, ar
  condicionado, airbag, ABS, garantia 12 meses.
- **Lote**: não existe entidade nem campo. O manual diz "cada item **OU** lote" — é a **mesma coisa** para o PNCP.
  O município escreve o lote na descrição (93.772 itens). **Mesmo padrão: o que não cabe na estrutura vaza para o texto.**
- **Fases**: a lei tem **sete** (art. 17); o PNCP publica **duas** (Em Andamento / Homologado). "Adjudicado" e "em
  fase de lances" não existem porque **não são publicados** — acontecem na plataforma.
- **Lance a lance**: nenhum endpoint. Está no portal de origem.
- **NF com itens/NCM**: existe e é o eixo ideal (`descricaoProdutoServico`, `codigoNcmSh`, quantidade, valor
  unitário) — **mas só em ente federal.** Municipal: **4 prefeituras no Brasil inteiro** (Caxias do Sul, Paracambi,
  Xangri-lá, Passo Fundo), **zero em SC**, e **nenhuma com os itens preenchidos**.
- **Cancelamento**: 98,6% dos processos são "Divulgada no PNCP"; 37.140 de 2024 ou antes nunca homologaram nada.
  O município cancela **no portal** e não avisa o PNCP. Caso Entre Rios: cancelado em 27/08/2024 com motivo escrito
  ("o certame está divergente da forma de lançamento entre plataforma e edital") — o PNCP não sabe.

## 🔑 E o que a API DÁ e nós jogávamos fora
**`linkSistemaOrigem`** — o endereço exato do processo no portal onde ele rodou:
`portaldecompraspublicas.com.br/processos/SC/...Entre-Rios-1489/PE-26-2024-2024-327854`
Lá está o edital, o lance a lance, a marca de cada licitante, o status real, o pregoeiro, o modo de disputa do lote.
**Responde "por que eu acho sozinho nos portais?": o PNCP dá o endereço; nós não líamos o campo.**
Não é scraping às cegas — é seguir o endereço que a fonte publica.

---

## Armadilhas medidas (nenhuma está no manual)

- `codigoModalidadeContratacao` é **obrigatório** → varrer as 13. Não existe "todas".
- `pagina` é **obrigatório** em `/contratos/contratacao` (400 sem ele).
- `tamanhoPagina`: **mínimo 10** (400: *"must be greater than or equal to 10"*), máximo 500. **Default 10** em `/itens`.
- `/pca/atualizacao` usa **`dataInicio`**, não `dataInicial`.
- Janela de data larga em `/publicacao` → 400.
- `/v1/orgaos/{cnpj}/compras/{ano}/{seq}` **mudou** para `/api/consulta` (301 com a URL nova no corpo).
- **`uf=SC` no `/instrumentoscobranca` NÃO filtra o município** — vieram RJ, DF, RS, SP. Filtrar por `cod_ibge` depois.
- `esferaId='F'` vaza no filtro `uf=SC` (UFSC, IFSC, MPU sediados em SC) — e existe `esfera='N'`, que **não está na
  tabela de domínio §5.13**.
- **WAF**: `curl -A "Mozilla/5.0"` leva 429 com HTML; node sem User-Agent passa. O bloqueio que eu diagnostiquei
  como "excesso de requisições" era o **user-agent de navegador**.
- **PDF sem texto**: existe (Entre Rios: 2.231 chars). Não medi quanto.
- `tipo_documento_id` é preenchido pelo município e **mente**: Entre Rios publicou o **DFD** classificado como Edital.

---

## A ordem

1. **Ler antes de construir.** `docs/lei-14133-integral.md` (193 artigos) · `licitacoesecontratos.tcu.gov.br` ·
   `docs/api-pncp-referencia.md`. **Dado responde; ele não pergunta.** A pergunta vem da lei.
2. `ls scripts/` **antes de escrever qualquer coisa** — dupliquei `ingest_contratos_sc` e `ingest_empenhos_sc` sem olhar.
3. Backfill **uma vez**, sem filtro, com `raw`.
4. Depois, **só o log**: `/atualizacao` → `/historico` → preenche a fatia. Nunca mais varrer.
5. **Rotear por modalidade** (`scripts/rota_por_modalidade.mjs`): cada uma tem uma pergunta própria. Somar
   "sem disputa" de inexigibilidade (99,1% **por lei**) com pregão é contar quantos solteiros são casados —
   o número real é **13,7% no pregão eletrônico**, não os 36,8% que eu anunciei.
