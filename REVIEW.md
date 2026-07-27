# Revisão técnica — i10 Gov 360 (PNIGP)

> Revisão read-only de 2026-07-22. Nenhum arquivo de código foi alterado (só este relatório).
> **Sistema:** plataforma B2G (Instituto I10) que consolida dados oficiais (SICONFI, PNCP, DATASUS, CGU, IBGE) por município de SC em painéis de finanças/compras/saúde/educação + módulos analíticos (marca, sobrepreço, criador de documentos).
> **Stack:** Next.js 16 (App Router) · React 19 · Postgres (Neon, driver `pg`) · Vercel · LLM (@ai-sdk/anthropic, só em scripts) · nodemailer.
> **Ambiente:** produção (pnigp.vercel.app). **Tamanho:** 244 arquivos src / 31k linhas + 551 scripts de ETL.
> **Método:** 5 investigadores read-only leram o código módulo a módulo; `npm run lint`, `npm audit`, `npm outdated` executados de verdade. Onde a intenção não estava clara, marquei **[verificar]**.

---

## Resumo executivo

O sistema **funciona e entrega muito valor** — a camada SQL é sólida (zero injeção real; input sempre parametrizado por `$1`), a espinha de ingestão/enriquecimento é set-based, idempotente e com o melhor tratamento de rate-limit que vi ("falha nunca vira zero"), e há uma base de dados rica e bem modelada. Mas é um sistema em **estado de MVP maduro rodando em produção sem as defesas de produção**: não há autenticação em nenhuma rota, não há testes, o linter acusa 679 erros, e toda a operação de dados depende de tarefas agendadas na máquina pessoal do dono. Os três riscos mais graves:

1. **🔴 Ausência total de autenticação/autorização** — todas as rotas de API são abertas, inclusive as de **escrita**. `notificacao-cadastro` expõe e permite gravar **dados pessoais de servidores** (nome, CPF, e-mail, celular) sem qualquer login — exposição de PII/LGPD e vandalismo de dados.
2. **🔴 Erros engolidos em silêncio** — `.catch(() => [])` aparece **386 vezes** no `queries.ts` e há **zero `console.error` em todo o `src/`**. Qualquer falha de banco vira "dado vazio" exibido como verdade ao gestor. Essa exata classe de bug já zerou KPI aqui antes.
3. **🔴 Fragilidade operacional + performance** — toda a coleta/enriquecimento roda em Windows Task Scheduler na máquina do dono (ponto único de falha); e a página do município dispara ~135 queries em cascata sequencial (6 blocos), causando o cold-start de 22s medido.

Pontos fortes reais existem e estão na seção própria. A prioridade não é reescrever — é **fechar as portas abertas** (auth, erros silenciosos, operação em nuvem) antes de escalar.

---

## CRÍTICO

**`src/app/api/**` (todas as rotas) — sem autenticação/autorização**
Não há `middleware.ts` nem lib de auth. Todas as 22 rotas são públicas, inclusive as que gravam.
*Por que importa:* qualquer pessoa na internet lê, escreve e dispara ações em qualquer município.
*Correção:* middleware de auth (sessão/token) ao menos nas rotas de mutação; segregar leitura pública de escrita.
*Esforço:* alto.

**`src/app/api/notificacao-cadastro/route.ts` — PII de servidores exposta e gravável sem auth (LGPD)**
POST cria/edita/inativa cadastros (nome, CPF, e-mail, celular, matrícula); GET lista esses campos por `?cod=` (só ~295 códigos IBGE, enumeráveis). O gate `consentimento_lgpd` é um boolean no body, burlável.
*Por que importa:* vazamento de dados pessoais e adulteração — exposição direta à LGPD.
*Correção:* exigir auth do gestor do município; nunca retornar PII sem autorização; tratar consentimento no servidor. **[verificar: a exposição por `?cod=` é intencional? Presumo que não.]**
*Esforço:* alto.

**`src/lib/queries.ts` (386 ocorrências de `.catch(() => [])`) — falha vira "dado vazio" silencioso**
386 de 389 catches devolvem `[]`/`0`/`null` sem log. Zero `console.error/warn` em todo o `src/`.
*Por que importa:* uma falha de conexão/SQL/timeout é exibida como "R$ 0", ranking vazio, "sem itens" — indistinguível de "não há dado". Já causou KPI zerado neste projeto; contraria a diretriz "nunca cortar em silêncio".
*Correção:* helper `safeQuery(label)` que **loga** antes do fallback e distingue "sem dado" (null legítimo) de "erro"; propagar erro onde o vazio engana.
*Esforço:* médio (mecânico, via helper).

**`src/lib/queries.ts:1047-1062` `resolverLocalidadesCNPJ` — N+1 com HTTP externo em série**
`for (const c of faltam.slice(0,8)) { await fetchLocalidadeReceita(c); await INSERT }` — até 8 fetches externos (timeout 15s) + 8 inserts, tudo sequencial.
*Por que importa:* até ~120s numa única request serverless — estoura o timeout da função.
*Correção:* `Promise.allSettled` com concorrência limitada; um único `INSERT ... unnest` no fim.
*Esforço:* baixo.

**`src/app/real/[codigo]/page.tsx:135-146` — cascata de ~135 queries = cold-start de 22s**
6 blocos `await Promise.all([...])` sequenciais + 4 awaits soltos; ~135 funções `get*SC` (cada uma 1-8 queries) contra um pool de `max:5`. Muitas re-scaneiam a mesma base (`financas_sc`, `entes_sc`, `indicadores_sc`).
*Por que importa:* é a causa medida do cold-start de 22s; fan-out massivo enfileira no pool e re-lê a mesma tabela N vezes (queima recurso).
*Correção:* fundir num único `Promise.all` (as queries são independentes); melhor: `<Suspense>` por aba para pintar a aba visível antes das outras ~55; data-loader por request para as tabelas-base.
*Esforço:* médio (fusão) / alto (streaming).

---

## ALTO

**`src/app/api/{etl-catalogo,notificacao-acao,serie-anotacao,caderno-emendas}/route.ts` — escrita sem auth nem rate-limit**
`etl-catalogo` dispara jobs de ETL (`solicitado=true`); os outros gravam impacto/ROI, anotações e payload arbitrário em qualquer município.
*Por que importa:* abuso de compute/DoS (etl-catalogo) e adulteração/vandalismo de dados institucionais.
*Correção:* auth por município + rate-limit (Vercel Firewall).
*Esforço:* médio.

**`src/app/real/[codigo]/page.tsx:1108-1126` `GRUPOS` — mapa id→grupo manual, quebrado para +5 abas**
O bug já corrigido (`criador-documentos` fora do mapa) **persiste** para `alertas` (798), `radar-crp` (818), `economia` (996), `populacao` (1002), `cultura` (1010): `grupoDe` retorna `undefined` → `PanelTabs` joga a aba no grupo "Geral" errado, sem erro.
*Por que importa:* falha silenciosa de navegação — abas somem do lugar certo (o sintoma "não abriu").
*Correção:* derivar `grupo` no `push` de cada aba, OU assert de dev que todo id ∈ `ORDEM`. Curto prazo: adicionar os 5 ids.
*Esforço:* baixo (patch) / médio (auto-verificável).

**`package.json` — playwright/xlsx/adm-zip/7zip-min/nodemailer em `dependencies` sem uso no app**
Confirmado: 0 imports em `src/`; só usados em `scripts/`.
*Por que importa:* inflam o `npm install` e o footprint do deploy Vercel com libs que o app servido nunca executa (playwright é pesadíssimo).
*Correção:* mover os 5 para `devDependencies`.
*Esforço:* baixo.

**`scripts/ingest_cadeia_pncp.mjs:147,176,191` — INSERT linha-a-linha na cadeia diária**
1 INSERT por contrato/empenho/NF dentro de loop; é da cadeia diária e escala com o volume do PNCP.
*Por que importa:* viola a lei "banco é o gargalo" no ponto de maior cardinalidade da cadeia ativa.
*Correção:* acumular e `INSERT ... unnest` como o `ingest_itens_sc` (o padrão gold do próprio repo).
*Esforço:* médio.

**Operação em Windows Task Scheduler na máquina do dono — ponto único de falha**
`run_etl.bat`, `validacao_continua.cmd`, `backup_neon.cmd`, `roda_enriquecimento.bat`, `coleta_diaria_pncp.bat` etc. com caminhos absolutos `C:\Users\PC\pnigp` e `InteractiveToken`; 333 scripts leem `.env.local` via `readFileSync`.
*Por que importa:* máquina desligada/offline = nada coleta; sem redundância nem execução em nuvem.
*Correção:* migrar as cadeias críticas para Vercel Cron / GitHub Actions.
*Esforço:* alto.

**Schema não reproduzível — `scripts/schema.sql` (DROP CASCADE) + DDL espalhado em 341 scripts**
`CREATE TABLE IF NOT EXISTS` espalhado, sem ferramenta de migração nem ordenação.
*Por que importa:* recriar o banco num ambiente novo exige rodar ~200 scripts em ordem desconhecida — risco real de DR.
*Correção:* migrations numeradas (o `scripts/db/2026-07-21_perf_dba.sql`, idempotente e versionado, é o modelo a generalizar).
*Esforço:* alto.

**`queries.ts:4561` `getFornecedoresSancionadosSC` — JOIN não-sargável**
`regexp_replace(c.ni_fornecedor,...) = regexp_replace(s.ni,...)` aplica função nos dois lados → seq scan em `contratos_sc`×`sancoes` a cada request.
*Por que importa:* cruza com o gargalo já conhecido de contratos.
*Correção:* coluna gerada `ni_digits` + índice em ambas.
*Esforço:* médio.

**Sem alerta de falha de task** — só a cadeia CRP manda e-mail; uma task que quebra passa despercebida até alguém abrir o `.log`.
*Correção:* heartbeat com alerta (já há `coleta_heartbeat`/`coleta_qa` no banco — estender para e-mail em staleness). *Esforço:* médio.

**Linter: 679 erros / 1038 warnings** (`npm run lint`) — inclui "Cannot create components during render" (múltiplos), "setState síncrono em effect → cascading renders". Nenhum CI bloqueia; 679 erros passam pro build.
*Correção:* corrigir os erros de render (primos do bug de hidratação #418) + CI que barre novos erros. *Esforço:* médio.

**`queries.ts:46` `num()` retorna `NaN` para string não-numérica** → propaga por somas/medianas/percentuais → "NaN%" na UI. *Correção:* `Number.isFinite` guard. *Esforço:* baixo.

---

## MÉDIO

- **`next.config.ts` vazio — sem headers de segurança** (CSP, HSTS, X-Frame-Options, X-Content-Type-Options): clickjacking/sniffing num app B2G público. *Fix:* bloco `headers()`. *Esforço:* baixo.
- **6 rotas devolvem `String(e)` ao cliente** (caderno-emendas, comparar, etl-catalogo, notificacao-acao/cadastro, serie-anotacao) → vazam nomes de tabela/coluna do Postgres. *Fix:* logar server-side, devolver mensagem genérica. *Esforço:* baixo.
- **`src/lib/db.ts:11` + 332 scripts: `ssl: { rejectUnauthorized: false }`** → conexão Neon suscetível a MITM. *Fix:* CA do Neon / `verify-full`. *Esforço:* médio.
- **`db.ts` Pool `max:5` por instância serverless** → em concorrência, `5 × N_instâncias` conexões no Neon. **[verificar]** a `DATABASE_URL` é o endpoint `-pooler` (pgBouncer)? (a que vi na sessão É `-pooler`, então está mitigado — confirmar e reduzir `max` para 1-2). *Esforço:* baixo.
- **Formatação BRL reimplementada em 25 arquivos/46 ocorrências com arredondamento diferente** (ui.ts 0 dec × novas-fontes `.toFixed(1)`) → mesmo valor renderiza diferente em painéis da mesma página. Risco de credibilidade num produto "dados oficiais". *Fix:* consolidar em `@/lib/ui`. *Esforço:* médio.
- **Erro de hidratação #418 recorrente em produção** — NÃO é do `Math.random` (está em handlers). Suspeito real: charts/MapLibre (WebGL, client-only) — não investigado. *Fix:* capturar `componentStack` em prod e tratar. *Esforço:* médio. **[verificar]**
- **`ANO_ATUAL=2024` hardcoded** (`queries.ts:7`) → dado velho silenciosamente na virada do exercício. *Fix:* derivar de `max(ano)` ou env. *Esforço:* baixo.
- **Contradição "state-agnostic"** — a ingestão tem motor por UF (`uf-config.ts`, `UF=env`), mas a camada de dados do app tem **476 refs a tabelas `*_sc` fixas**. Replicar para outra UF exige reescrever `queries.ts`, não só trocar env. *[verificar: multi-UF no front é roadmap ou só ingestão?]* *Esforço:* alto.
- **`TRUNCATE`-global em ingests municipais** (`ingest_capag_sc:35`, `ingest_cmed_pmvg:42`, `cnes_*`) apagam TODAS as UFs — quebrariam o isolamento ao ligar SP. *[verificar antes de multi-UF.]* *Esforço:* médio.
- **`ingest_arquivos_sc.mjs:58`** — 1 INSERT por documento (centenas de milhares somados). *Fix:* batch por processo. *Esforço:* baixo.
- **`ingest_cadeia_pncp` empenhos: CONC=6 com pool `max:3`** → 6 workers disputando 3 conexões, risco de `statement_timeout`. *Fix:* alinhar `max` ao `CONC`. *Esforço:* baixo.
- **`_median` (queries.ts:1070)** pega o elemento superior em vez da média dos dois centrais → mediana enviesada (métrica exibida como metodologia). *Fix:* `percentile_cont(0.5)` no SQL (já usado em outras funções — inconsistência). *Esforço:* baixo.
- **Divisões sem guarda de zero** (~25 `/ num(...)`) → `Infinity`/`NaN`. *Fix:* `den > 0 ? a/den : 0`. *Esforço:* baixo.
- **`npm audit`: 12 vulnerabilidades (7 high, 5 moderate).** `xlsx` (prototype pollution + ReDoS, **sem fix** — avaliar `exceljs`); `adm-zip < 0.6` (DoS por ZIP forjado); `brace-expansion`/`fast-uri`/`js-yaml`/`postcss` (corrigíveis com `npm audit fix`); `hono`/`@hono/node-server` (via shadcn, tooling de dev). *Esforço:* baixo (audit fix) + médio (xlsx).

---

## BAIXO

- **`task_enriquecimento.xml:32` `ExecutionTimeLimit=PT0S`** (sem limite) — instância travada roda p/ sempre (mitigado por IgnoreNew). *Fix:* definir limite.
- **Keys por índice em `.map()`** (page.tsx, 6 sites) → reuso errado de DOM em reordenação/filtro. *Fix:* key por campo estável.
- **`#crp-historico`** — âncora sem tab correspondente (link morto). *[verificar intenção.]*
- **`queries.ts` — 437 `Record<string, unknown>`** = `any` disfarçado; renomear coluna no SQL não gera erro de compilação (é onde nasce o bug de "coluna errada"). *Fix:* tipos por query, incremental. *Esforço:* alto/incremental.
- **README = boilerplate** do create-next-app (mas `docs/` é rica, 35 arquivos). *Fix:* README apontar para `docs/`.
- **`dotenv` em devDependencies mas 0 uso** (scripts leem `.env.local` na mão) — dep morta.
- **~220-250 dos 551 scripts são mortos/experimentais** (`marca_tpl/` ~170, `_diag_*`/`_prova_*`/`_amostra*` ~30). *Fix:* arquivar — **preservando** `_uf.mjs`/`_storage.mjs`/`_precos_norm.mjs` (libs reais com prefixo `_`).
- **`next`/`react`/`pg` a 1 patch do topo** (`npm outdated`) — aplicar (patches de framework costumam trazer correção). Majors (typescript 7, eslint 10, @types/node 26) são dev-only, podem esperar.

---

## Pontos fortes (o que já está bem resolvido)

- **SQL parametrizado, zero injeção real.** Toda interpolação em `queries.ts` é de constante interna; o input do usuário sempre entra por `$1`/`ANY($1)`. Numa base de 4.887 linhas de SQL, isso é disciplina.
- **Segredos limpos.** `.gitignore` cobre `.env*`/`logs/`/`.claude/`; `.env.local` nunca foi versionado; 324 commits sem segredo no histórico; `import "server-only"` no `db.ts`/`queries.ts`; nenhum `NEXT_PUBLIC_*` com segredo. Há hook pre-commit anti-segredo.
- **Espinha de ingestão exemplar.** A cadeia crítica (coleta incremental, itens, arquivos, enriquecimento, marca, consolida) é **set-based** (`unnest`/`INSERT...SELECT`), **idempotente com versão** (`*_feitos.versao`, watermark), e tem o **melhor tratamento de 429/WAF do repo** (`ingest_cadeia_pncp`: "falha nunca vira zero", prova real `out.length === totalRegistros`).
- **Sem vazamento de conexão.** Pool singleton + `pool.query()` sem `connect()` manual — não há client sem `release()`.
- **Concorrência segura** onde há paralelismo: `ON CONFLICT` + shards disjuntos por hash de processo; `enriquece_marca` acumula em memória e grava serial no fim (zero race).
- **Sem XSS.** Nenhum `dangerouslySetInnerHTML`/`innerHTML`/`eval`; React escapa por padrão.
- **DBA já saneado** nesta semana: índices que destravaram o incremental (4 GB → 0,247 ms), `pg_stat_statements` instalado, autovacuum afinado, DDL versionada em `scripts/db/`.
- **`docs/` rica** (35 arquivos, `SISTEMA.md` auto-gerado) — a documentação existe, só não está apontada pelo README.

---

## Plano de ação priorizado (impacto × esforço)

### Fazer já — impacto alto, esforço baixo/médio
1. **Auth nas rotas de mutação** + tirar PII de `notificacao-cadastro` sem auth (CRÍTICO/LGPD). *[o de maior impacto]*
2. **`safeQuery(label)`** que loga antes do fallback (mata os 386 `.catch(()=>[])` silenciosos). Médio, mecânico.
3. **Fundir a cascata de queries** da `page.tsx:135-146` num `Promise.all` (corta o cold-start de 22s). Baixo.
4. **`resolverLocalidadesCNPJ`**: paralelizar + INSERT em lote (evita o timeout de 120s). Baixo.
5. **Mover playwright/xlsx/adm-zip/7zip/nodemailer para `devDependencies`** + `npm audit fix` + patches next/react/pg. Baixo.
6. **Headers de segurança** no `next.config` + parar de devolver `String(e)`. Baixo.
7. **Adicionar os 5 ids órfãos ao `GRUPOS`** + assert de dev. Baixo.
8. **`num()` com `Number.isFinite`** + guardas de divisão por zero. Baixo.

### Próximo — impacto alto, esforço maior
9. **Migrar as cadeias críticas para Vercel Cron / GitHub Actions** (elimina o ponto único de falha da máquina do dono).
10. **`ingest_cadeia_pncp`**: trocar os 3 loops row-by-row por `unnest`.
11. **Rate-limit** (Vercel Firewall) nas rotas de escrita.
12. **Streaming por aba** (`<Suspense>`) na `page.tsx` — corta o over-fetch estruturalmente.
13. **Migrations numeradas** (generalizar o padrão `scripts/db/`) → schema reproduzível.

### Contínuo — dívida técnica
14. Fatiar `queries.ts` (4.887 linhas) e `novas-fontes.tsx` (2.223 linhas) por domínio via barrel `index.ts` (sem quebrar os imports).
15. **Introduzir testes** (hoje: zero) — começar pelos cálculos de `queries.ts` (medianas, %, sobrepreço) e pelas rotas de escrita.
16. Consolidar formatadores BRL em `@/lib/ui`; corrigir os 679 erros de lint com CI que barre novos.
17. Arquivar os ~220 scripts mortos (preservando as libs `_uf`/`_storage`/`_precos_norm`).
18. Resolver a contradição multi-UF **[decisão de produto]**: o front está 100% amarrado a SC.

---

*Itens marcados **[verificar]** dependem da sua intenção — não assumi. Os três CRÍTICOS de auth/erro-silencioso/operação são o que eu fecharia antes de qualquer escala.*
