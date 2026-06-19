# Automação de Coleta — Arquitetura (Decisão)

**Problema:** hoje cada base (PNCP, SICONFI, SIOPS, CNES, IBGE, CGU…) é coletada manualmente. As fontes publicam **novas competências** periodicamente (bimestre, quadrimestre, ano, mês). Precisamos buscar **só o que é novo** e inserir no Neon **sem duplicar**, de forma **automática, observável e auto-recuperável**.

---

## 1. Princípio: orquestrador único + catálogo de fontes

Um **orquestrador** lê um **catálogo** de fontes (cada uma com sua cadência e seu detector de novidade), descobre o que mudou, roda **só os ETLs devidos**, grava estado e dispara a validação. Reusa tudo que já temos: ETLs **idempotentes** (UPSERT) e **resumíveis** (tabelas `*_feitos`), supervisor **auto-recuperável** e validação contínua.

```
┌───────────────────────── ORQUESTRADOR (diário) ─────────────────────────┐
│ 1. lê catálogo  → 2. detecta novidade (probe barato)  → 3. roda devidos  │
│    (etl_catalogo)      por fonte (competência nova?)       serial p/ API  │
│                                                       → 4. grava status   │
│                                                       → 5. valida (QA)    │
└──────────────────────────────────────────────────────────────────────────┘
            cada fonte = { id, script, cadência, detector, esfera-API }
```

---

## 2. Detecção de novidade (a inteligência — só busca o que falta)

| Fonte | Cadência real | "Novo" quando… | Detector barato |
|---|---|---|---|
| **SICONFI** finanças/metas/RREO-const/RGF | anual (fecha ~mar do ano seguinte) | `max(ano) no banco < último ano fechado` | comparação no Neon |
| **SIOPS** saúde | bimestral/anual | `max(ano) < último disponível` | `GET /v1/ente/anos` |
| **PNCP** compras/contratos | contínuo (diário) | sempre refresca o **ano corrente** (append) | dias desde última execução ≥ 25 |
| **PNCP** PCA | anual | novo ano de plano | `max(ano)` no banco |
| **CNES** rede | mensal (competência) | competência nova | campo `data_atualizacao` |
| **IBGE / CGU** | anual/mensal | nova referência | `max(ano)` no banco |

Resultado: numa rodada típica, **nada roda** (tudo atualizado) ou **só a fonte que publicou** — sem reprocessar a base inteira.

---

## 3. Serialização por API (lição já aprendida)

ETLs do **mesmo provedor** rodam **em série** (evita rate-limit, como já fizemos no PNCP). Provedores diferentes (PNCP × SICONFI × SIOPS × IBGE) podem ir em paralelo. O orquestrador agrupa por `esfera-API`.

---

## 4. Observabilidade e auto-recuperação (reuso)

- **`etl_catalogo`** (Neon): por fonte → última competência disponível, última no banco, última execução, status, msg. Vira a tela de operação.
- **Heartbeat + watchdog**: mesma lógica do supervisor (mata e religa etapa estagnada).
- **Validação contínua**: roda ao fim de cada ciclo; flag de suspeitos já existente.

---

## 5. Agendamento (onde roda)

- **ETLs pesados (PNCP)** não cabem em função serverless (timeout). Rodam **localmente/num servidor** via **Agendador de Tarefas do Windows** (ou cron de uma VPS) chamando o orquestrador **1×/dia**.
- **Vercel Cron** serve para o **leve**: bater o detector de novidade e acender um alerta na tela quando há competência nova a coletar (sem rodar o ETL pesado lá).

---

## 6. Opções de decisão

- **A — Status quo (manual).** ❌ não escala; esquece competências.
- **B — Orquestrador + Agendador local (recomendado).** ✅ automático, incremental, observável, reusa tudo. Roda onde já temos o ambiente.
- **C — Tudo serverless.** ❌ inviável p/ PNCP (timeouts/volume).

**Recomendação: B.** Construir `etl_catalogo` + `etl_orquestrador.mjs` (detector + execução serial por API + status) e agendar diariamente. Vercel Cron só para o sinal de novidade na tela.

---

## 7. Entregáveis
1. Tabela `etl_catalogo` (estado por fonte). ✅
2. `scripts/etl_orquestrador.mjs` — modos `plan` (só detecta/reporta) e `run` (detecta + roda devidos). ✅
3. Comando de agendamento (Task Scheduler, 1×/dia).
4. (Próximo) cartão "Atualização das bases" na tela `/coleta`, lendo `etl_catalogo`.
