# Plano de Execução — do PNCP ao Banco de Sucesso

> Documento-mestre. Complementa `docs/arquitetura-pncp.md` (o modelo) com o **plano completo de execução**:
> cada busca, sua fonte, sua confiabilidade, seu status e suas dependências — da coleta ao produto final.
> **Três leis (de arquitetura-pncp.md):** espelhar o PNCP · dados confiáveis · construir do PNCP → para a plataforma.

## Objetivo final

Um **Banco de Sucesso** em compras públicas: dado *"quero comprar X da marca Y"*, responder a **melhor descrição** e o
**menor preço** já comprado, com **confiança de disputa** — para o gestor comprar bem e para o controle externo flagrar
o mal comprado. Um motor, dois produtos (B2G + controle). *(ver `pnigp-copiloto-compra`)*

---

## FASE 0 — Espelho do PNCP (as buscas estruturadas)

Cada entidade do PNCP vira uma tabela nossa, ligada pela chave `numero_controle` (`{cnpj}-1-{seq:6}/{ano}`).
Toda busca é **idempotente** (UPSERT), **resumível** (tabela de controle) e **robusta a 429** (backoff + não marca
"feito" em falha de fetch → retenta no re-run; garante confiabilidade sem perda silenciosa).

| # | Entidade PNCP | Endpoint | Tabela | Controle | Status |
|---|---|---|---|---|---|
| 0.1 | **Contratação** | `/consulta/v1/contratacoes/publicacao` (bulk data+UF+modalidade, pág.50) | `contratacoes_sc` | `_raiox_janela` | ✅ **241.302 · 100%** |
| 0.2 | **Item + Resultado** | `/pncp/v1/.../itens` + `/itens/{n}/resultados` | `itens_sc` | `itens_proc_feitos` | 🔄 ~79k/241k (rodando) |
| 0.3 | **Arquivos** (docs/atas) | `/pncp/v1/.../arquivos` | `arquivos_sc` | `arquivos_proc_feitos` | 🟡 **script pronto** (`ingest_arquivos_sc.mjs`), a rodar |
| 0.4 | **ARP** (registro de preço) | `/pncp/v1/.../atas` (Consulta) | `atas_sc` | — | ✅ ingerido |
| 0.5 | **Contrato** | `/pncp/v1/.../contratos` | `contratos_sc` | — | ✅ ingerido |
| 0.6 | **PCA** (plano anual) | `/pncp/v1/.../pca` | `pca_sc` | — | ✅ ingerido |

**Regra de confiabilidade da Fase 0:** todo dado que o PNCP dá **estruturado** vem SEMPRE do campo estruturado —
nunca de PDF. O preço homologado vem do `/resultados`, jamais da ata.

**Nota de ritmo (verificada):** o PNCP limita a **~conc 2** (acima disso, 429 generaliza e a vazão desaba). Itens e
arquivos são 1+ chamada por contratação → **~2-3 dias cada** para as 241k. É o teto da fonte, não do código; a
resiliência (resumível) garante que completa sem perder nada, mesmo com quedas.

---

## FASE 1 — Camada de documentos (o que o PNCP NÃO dá estruturado)

**Marca e modelo existem em TODO processo — em toda modalidade, dispensa inclusive. Só NÃO é por campo de API** (o
estruturado do PNCP não traz; verificado). **Estão na ATA/documento**, que está no PNCP em `arquivos_sc`. A **LLM é o
leitor da ata** — a ferramenta certa, não remendo: extrai o que o campo não traz e **valida contra o estruturado** (o
valor bate com o `/resultados`).

| # | Dado | Fonte | Como | Confiabilidade |
|---|---|---|---|---|
| 1.1 | Ata/documento (localizar+baixar) | `arquivos_sc` — **todas as modalidades** | roteia por **plataforma** (`usuarioNome`) | — |
| 1.2 | **Marca / modelo** por item | documento (PDF) | LLM (Haiku) extrai a tabela de vencedores | casa por **valor** com `itens_sc` (validado) |
| 1.3 | **Lances / participantes** | documento (PDF) | LLM extrai o histórico da disputa | nº licitantes, 1º lance→vencedor |

**Provado nesta sessão:** a Haiku extraiu marca real das atas (TIGRE, PLASTILIT, RENOVA, CHEVROLET, XCMG), casando por
valor. **Cobertura = TODOS os 241k processos** (todo processo tem documento com marca/modelo). Roteamento por
plataforma para o parser certo: top 4 (Betha, IPM, Compras.gov.br, ECustomize) ≈ 77%.

Tabelas (derivação de documento, marcadas como tal): `item_marca_sc`, `compra_disputa_sc`.

---

## FASE 2 — Camada analítica (derivações sobre o espelho)

Derivações **explicitamente marcadas** como camada de análise — nunca confundidas com o espelho do PNCP.

| # | Derivação | Entra de | Tabela | Status |
|---|---|---|---|---|
| 2.1 | **Agrupamento CATMAT** (a chave de casamento) | `itens_sc` (descrição) | `item_catmat_map` | ✅ motor pronto (trigrama+reranker) — re-rodar no conjunto completo |
| 2.2 | **Apresentação** (unidade básica) | itens + CATMAT | `item_apresentacao_sc` etc. | ✅ pronto |
| 2.3 | **Preço por unidade básica** (curado IQR) | 2.1+2.2 | `precos_referencia_basica_sc` | ✅ pronto |
| 2.4 | **Reconciliação** processo↔ARP↔contrato | 0.1/0.4/0.5 | `dissonancia_sc` *(a criar)* | ⬜ (respeita SRP: comprar é opcional) |
| 2.5 | **Red-flags de auditor** | tudo acima | várias | ✅ mislabel pronto; direcionamento/sobrepreço a somar |

**Dependência dura:** 2.1 (CATMAT) só roda com **todos os itens** (Fase 0.2 completa) — senão o que ficar de fora não
casa. É o gargalo que amarra as análises.

---

## FASE 3 — Produtos

| # | Produto | Depende de | Público |
|---|---|---|---|
| 3.1 | **Banco de sucesso / Copiloto de compra** | CATMAT + preço + marca + disputa | Gestor (B2G) |
| 3.2 | **Lente de auditor** (dispensa, direcionamento, sobrepreço, fracionamento) | Fase 0 + 2 | Controle externo |
| 3.3 | **Abas Compras & Contratos** (refazer as análises) | 2.x | Plataforma |
| 3.4 | **Construtor de TR** alimentado (descrição+preço prontos) | 3.1 | Gestor |

---

## Ordem de execução e caminho crítico

```
0.1 Contratação ✅
   └─ 0.2 Itens+Resultado 🔄  ──┐  (caminho crítico: ~2-3 dias, teto do PNCP)
   └─ 0.3 Arquivos 🟡 (paralelo, mesma fonte) ─┐
                                               │
0.2 completo → 2.1 CATMAT → 2.2 Apresentação → 2.3 Preço básico
0.3 completo → 1.x LLM sobre ata → marca/lances/participantes
                                               │
              (2.x + 1.x) → 3.x Produtos (banco de sucesso, auditor, abas, TR)
```

**Paralelizável agora:** 0.2 (itens) e 0.3 (arquivos) usam a mesma fonte (rate-limited) — rodar **em série** para não
competir por 429, ou alternar. **Bloqueado até 0.2:** o CATMAT (2.1) e tudo que depende dele.

## Confiabilidade — garantias transversais

1. **Nada se perde:** toda busca tem tabela de controle (`*_feitos` / `_janela`); parar/cair/relançar continua de onde parou.
2. **Sem falso-completo:** não marca "feito" em falha de fetch; processo com 0 itens fica pendente (todo processo tem ≥1 item).
3. **Estruturado > documento:** PDF só para o que o PNCP não tem em campo (marca/lances), e sempre validado contra o estruturado.
4. **Sem arquitetura nova:** só entidade-espelho do PNCP ou derivação marcada; qualquer mudança atualiza `arquitetura-pncp.md` antes.

---

**Status global (jul/2026):** Fase 0 ~70% (contratação 100%, itens em curso, arquivos a iniciar) · Fase 1 provada, a
industrializar · Fase 2 com motores prontos, aguardando itens completos · Fase 3 desenhada. **Caminho crítico = terminar
os itens (0.2).**
