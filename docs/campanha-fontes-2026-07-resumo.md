# Campanha "Fontes Novas" — Resumo (jul/2026)

Maratona de ampliação da base de dados municipal (Santa Catarina, 295 municípios) + entrega da **profundidade intraurbana** (mapa por setor censitário). Tudo com **data de extração + CSV + fonte carimbada + orquestrador ETL + DELETE-por-UF** (multi-estado seguro). Acesso state-agnostic detalhado em [`acesso-fontes-replicacao.md`](./acesso-fontes-replicacao.md).

## 1. 17 fontes novas ingeridas

| # | Tabela | Fonte | Ângulo | Destaque SC |
|---|--------|-------|--------|-------------|
| 1 | `suas_saldo_sc` | MDS (Solr MI Social) | saldo SUAS não usado | R$ 113 mi parados |
| 2 | `pdde_saldo_sc` | FNDE | verba escolar parada (**só rede municipal**) | R$ 27 mi (após tirar escola estadual) |
| 3 | `pnae_agri_sc` | FNDE | % agricultura familiar vs mínimo 30% | 16 munis abaixo |
| 4 | `barragens_sc` | ANA/SNISB | barragens + dano potencial | 406, 100 dano alto |
| 5 | `paa_sc` | Conab | compras agricultura familiar | R$ 28 mi executado |
| 6 | `lpg_sc` | MinC | Lei Paulo Gustavo — saldo/risco devolução | 92% utilizado |
| 7 | `salic_sc` | MinC (SALIC) | Rouanet — gap aprovado−captado | R$ 1,6 bi na mesa |
| 8 | `novopac_sc` | ObrasGov/Casa Civil | obras do município (**executor municipal**) | R$ 4,9 bi previstos |
| 9 | `censo_corraca_sc` | IBGE Censo 2022 (t.9605) | cor/raça | SC 23,3% negra |
| 10 | `populacao_faixa_sc` | IBGE Censo 2022 (t.9514) | pirâmide + idosos/dependência | SC 15,6% idosos |
| 11 | `pib_municipal_sc` | IBGE (t.5938 var 37, **nominal**) | PIB + per capita | SC R$ 513 bi (2023) |
| 12 | `idhm_sc` | Atlas Brasil (PNUD) | IDHM + subíndices (Censo 2010) | médio 0,732 |
| 13 | `cemaden_sc` | CEMADEN | monitoramento de chuva/risco | 121 munis **sem** estação (ponto cego) |
| 14 | `domicilios_sc` | IBGE Censo 2022 (t.4712) | domicílios + densidade | 2,8 mi domic., 2,74/domic. |
| 15 | `alfabetizacao_sc` | IBGE Censo 2022 (t.9543) | alfabetização 15+ | SC 95,57% |
| 16 | `museus_sc` | IBRAM (MuseusBr) | museus/equipamentos culturais | 110 munis, 250 museus |
| 17 | `setores_censitarios_sc` | IBGE Agregados por Setores | **profundidade intraurbana** (ver §2) | 16.736 setores, 7,61 mi hab |

## 2. Feature: mapa de calor INTRAURBANO (setor censitário)

A menor unidade do Censo — revela a desigualdade **dentro** do município.

- **Dados** (`setores_censitarios_sc`): pop, domicílios, densidade, bairro por setor (CSV `basico_BR`, latin1, filtro `startsWith "42"`).
- **Malha** (`setores_geo_sc`): polígonos extraídos do **GPKG 121 MB** via `sql.js` (SQLite puro JS) + `wkx` (parse WKB) → GeoJSON simplificado por município (~174 KB/muni, 53 MB total). A API v3/malhas do IBGE **não** desce a setor.
- **Mapa** (`mapa-setores.tsx`, react-map-gl/maplibre): choropleth com **seletor de 3 variáveis** — Densidade (hab/km²), % Idosos (60+, saúde geriátrica), % Crianças (0-14, escolas). **Lazy-load** via `/api/setores-geo/[codigo]` + IntersectionObserver (fora do payload da página).
- **Exemplo** (Floripa): Centro 48% idosos × 8,6% crianças (área envelhecida) vs periferia familiar → orienta onde vai escola × onde vai geriatria.

## 3. Decisões de fidedignidade (o que foi RECUSADO — e por quê)

- **PIB via IpeaData** → era preços CONSTANTES (deu metade); troquei para IBGE SIDRA 5938 nominal (calibrado contra Joinville ~R$50bi).
- **PDDE** → contaminação: incluía escolas **estaduais/federais** (R$ 38,5 mi, 59%); filtrado para rede municipal.
- **Gini / rendimento Censo** → só existe por UF (sem nível município). Não subido.
- **Domicílios t.10053/3379** → amostra/2010 (moradores não batiam com a população). Usei a t.4712 (universo, validada).
- **Aldir Blanc** → parse zerado + redundante com LPG. Dropado.
- **PAA valor devolvido** → ambíguo (> executado). Omitido.
- **Alfabetização/cor-raça por setor** → basico não tem alfabetização; cor/raça só vem como cross-tab do responsável×tipo de moradia (métrica fraca). Não forçado.

## 4. Bloqueadas / sem acesso limpo

CGU `/transferencias` (403 restrito; `recursos-recebidos` não filtra município utilmente) · Atlas da Violência (API 500) · Mapas Culturais (Cloudflare) · IPHAN (portal em migração) · S2ID prejuízos (WAF F5) · SAEB (microdados 403 + redundante com IDEB) · INMET (só 24 estações, esparso).

## 5. Replicação para SP (e outras UFs)

Todos os scripts são **state-agnostic** (`UF` env → código IBGE: SC=42, SP=35). O casamento usa código IBGE nacional; tabelas usam **DELETE-por-UF** (nunca TRUNCATE) para não apagar outras UFs. Para o intraurbano, trocar `SC`/`42` nas URLs do FTP (a árvore `gpkg/UF/<SIGLA>/` existe para todas). Ver [`acesso-fontes-replicacao.md`](./acesso-fontes-replicacao.md) e a memória `pnigp-replicacao-uf-sp`.
