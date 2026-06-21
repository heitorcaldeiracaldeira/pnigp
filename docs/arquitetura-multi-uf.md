# Arquitetura Multi-UF do PNIGP — um motor, configurado por estado

## Decisão (jun/2026)
**NÃO** construímos um motor por estado. Construímos **um único motor**, **parametrizado por UF**.
Motivo: 90% das fontes e regras são **nacionais** (idênticas em todo o país); só o **controle externo**
(TCE/TCM e suas interpretações) varia por estado. Duplicar o motor 27 vezes tornaria manutenção,
correção de bugs e evolução inviáveis.

## O que é NACIONAL (compartilhado — vale para qualquer UF)
Estas fontes e regras NÃO mudam de estado para estado:
- **Finanças**: SICONFI (RREO/RGF) — receita, despesa, MDE, ASPS, RCL, dívida, subfunção.
- **Compras**: PNCP (processos, contratos, itens, atas).
- **Saúde**: FNS (repasses), SIH/SIA, CNES, SISAB/Previne, CADPREV (atuarial).
- **Educação**: INEP/Censo Escolar, IDEB.
- **Saneamento**: SNIS. **Assistência**: MDS/CadÚnico.
- **Âncoras legais constitucionais/federais** (`ANCORAS_FEDERAIS` em `uf-config.ts`):
  saúde 15% (LC 141), educação 25% (CF 212), FUNDEB 70% (Lei 14.113), pessoal LRF
  (alerta 48,6% / prudencial 51,3% / limite 54%), DCL 120%.
- **Calendário de prestação de contas**: LRF (RREO/RGF, audiências quadrimestrais) e LC 141 — federais.

## O que VARIA por estado (camada de configuração — `src/lib/uf-config.ts`)
- **Tribunal de Contas estadual (TCE)** — identidade e portal.
- **Onde as contas MUNICIPAIS são julgadas**: na maioria é o próprio TCE; mas há exceções:
  - **TCM estadual separado**: Bahia (TCM-BA) julga os municípios — não o TCE-BA.
  - **TCM da capital**: São Paulo e Rio de Janeiro têm TCM só para a capital.
- **IEGM** — Índice de Efetividade da Gestão Municipal: programa nacional (IRB), mas cada TCE adere
  e publica de forma própria.
- **Normas e interpretações estaduais** específicas (prazos, instruções normativas do TCE/TCM).

### Estados com TCE **e** TCM (coexistência)
Haverá estados onde os dois tribunais coexistem — e o motor já trata:
- **TCM estadual** (ex.: Bahia): `TCE-BA` julga o estado, `TCM-BA` julga **todos os municípios**.
- **TCM da capital** (ex.: SP, RJ): `TCE` julga os municípios em geral, mas a **capital** tem `TCM` próprio.
- O resolvedor `tribunalDoEnte(uf, tipo, codIbge)` devolve, para cada ente, **qual tribunal responde** —
  Estado→TCE; município→TCM ou TCE conforme a UF (e trata a capital separadamente). Assim a aba de
  Accountability cita o tribunal CORRETO de cada ente automaticamente.

## Como habilitar um novo estado (receita pronta)
O motor já está **parametrizado por UF** via env `UF` (`scripts/_uf.mjs` → sigla, cód. estadual, nome).
Modelo: **uma base por estado** (deploy por cliente-estado) — assim as comparações por pares ficam
naturalmente dentro da UF, sem refatorar queries. Passos:

1. **Config**: adicionar a UF em `UF_CONFIG` (`src/lib/uf-config.ts`) — TCE/TCM e onde julga municípios.
2. **Entes**: `UF=PR node scripts/ingest_entes_uf.mjs` — carrega municípios + governo estadual do IBGE.
3. **Coletar**: rodar os ETLs com a UF — `UF=PR node scripts/ingest_sc.mjs`, `ingest_fns_sc.mjs`,
   `ingest_compras_sc.mjs`, `ingest_processos_sc.mjs`, `ingest_rpps_atuarial_sc.mjs`, `ingest_cauc_sc.mjs`,
   e os SICONFI (rgf/rreo_const/rpps/receitas_detalhe/subfuncao/siops — já genéricos, iteram `entes_sc`).
4. **Pronto**: os componentes/molde (4 visões, cadeia de valor, accountability) **não mudam** —
   leem `uf-config` + os dados. O nome das tabelas segue `*_sc` (histórico), mas o conteúdo é da UF da base.

> Coletores já parametrizados (sem "SC" cravado): FNS, Compras, Processos, RPPS atuarial, Finanças (DCA),
> CAUC. SICONFI por `id_ente`/esfera já era genérico. `cod_ibge` (7 díg) carrega a UF nos 2 primeiros dígitos.

## Estratégia (recomendada)
Provar o modelo 100% em **SC** (estado de referência), e depois **"ligar" estado a estado sob demanda**
(cada cliente-estado), reaproveitando o mesmo motor + a config da UF. Nunca construir os 27 de uma vez.

> Estado de implementação: **SC completo**. `BA` e `SP` já estão no `UF_CONFIG` como modelos de
> referência da variação (TCM), prontos para receber coleta quando houver demanda.
