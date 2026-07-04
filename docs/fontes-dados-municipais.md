# Mapa de fontes de dados municipais — roadmap de ingestão (SC, 295 municípios)

> Levantamento 2026-07-03 (busca por instituição: ministérios · agências reguladoras · bancos/BCB · estatais · institutos).
> Objetivo: expandir a base integrada (o moat). Todas as fontes são **state-agnostic** (filtram UF=42 SC; escalam para outras UFs).
>
> **Legenda** — Status: `NOVO` (ingerir) · `TEMOS` (já na base). Acesso: `API` · `CSV/FTP` · `WAF` (baixar manual/Playwright) · `login`. Granularidade: município (M) / escola-estabelecimento (E) / ponto-geo (G).

---

## 1. Prioridade de ingestão

**1ª onda — API limpa + alto valor + inédito** (eixos novos no moat):
`ESTBAN` (crédito bancário/muni) · `BNDES Desembolsos` · `BCB Pix` · `ANM CFEM` · `ANS beneficiários` · `RAIS/CAGED` · `RFB CNPJ + Arrecadação` · `INPE queimadas/desmatamento` · `SINISA` (sucessor do SNIS) · `TSE eleitoral`.

**2ª onda — alto valor, acesso médio:** `ANP combustíveis` · `ANEEL GD` · `ANATEL acessos` · `DATASUS SIM/SINASC/SINAN` · `IBAMA autos` · `PGFN dívida ativa` · `ANVISA SNGPC` · `ANA Atlas Águas` · índices `FIRJAN IFDM/IFGF` · `IPEA IVS/Atlas Violência` · `Atlas Brasil IDHM`.

**3ª onda — download/scraping/nicho:** `INEP microdados` · `CECAD/VIS DATA` · `PCDaS` · `MTur categorização` · `MinC SNIIC` · `IBGE MUNIC Esporte` · `SISCOR/MDCR` · `CAF 3.0`.

**Fora por diretriz:** `SINESP` (criminalidade) e `SISDEPEN` (prisional) — sensível (diretriz "cuidar de dados de polícia/prisional"); aguardar decisão.

---

## 2. Eixo FINANCEIRO / ECONÔMICO (100% inédito na base)

| Status | Fonte | Órgão | O que traz | Gran | Acesso | Atualiz. | Link |
|---|---|---|---|---|---|---|---|
| NOVO ⭐ | **ESTBAN** | BCB | balancete bancário por município: depósitos à vista/poupança/prazo, crédito, financ. rural/imob. | M | CSV+painel | mensal | bcb.gov.br/estatisticas/estatisticabancariamunicipios |
| NOVO ⭐ | **BNDES Desembolsos** | BNDES | desembolsos por porte/CNAE/UF/município (desde 1995) | M | CSV/CKAN | mensal | dadosabertos.bndes.gov.br/dataset/desembolsos-mensais |
| NOVO ⭐ | **Pix** | BCB | qtde e volume de transações por município PF/PJ | M | API OData | mensal/tri | dadosabertos.bcb.gov.br/dataset/pix |
| NOVO ⭐ | **RAIS** | MTE/PDET | vínculos formais: remuneração, CBO, CNAE, escolaridade | E→M | FTP/BigQuery | anual | ftp.mtps.gov.br/pdet/microdados |
| NOVO ⭐ | **Novo CAGED** | MTE/PDET | admissões/desligamentos/saldo mensal, salário, CNAE | E→M | FTP/BigQuery | mensal | gov.br/trabalho-e-emprego (microdados) |
| NOVO ⭐ | **RFB CNPJ** | Receita Federal | empresas/estabelecimentos (CNAE/situação/abertura), sócios, Simples/MEI (~20GB) | E→M | CSV mensal | mensal | arquivos.receitafederal.gov.br/cnpj |
| NOVO ⭐ | **RFB Arrecadação** | Receita Federal | IRPJ/IRPF/IPI/PIS-COFINS/ITR/MEI por município | M | XLSX (sem API) | anual | gov.br/receitafederal (receitadata) |
| NOVO | **PGFN Dívida Ativa** | PGFN | devedores inscritos, valor, situação — casa com fornecedores | UF→ | CSV/ZIP | trimestral | gov.br/pgfn (dados abertos) |
| NOVO | **MDCR/SICOR** | BCB | crédito rural (custeio/invest/comerc) por município/produto (PRONAF) | M | API OData+CSV | mensal | dadosabertos.bcb.gov.br/dataset/matrizdadoscreditorural |

---

## 3. Eixo RECEITA PRÓPRIA / REGULATÓRIO (padrão ASPX-por-UF, já dominado)

| Status | Fonte | Órgão | O que traz | Gran | Acesso | Atualiz. | Link |
|---|---|---|---|---|---|---|---|
| NOVO ⭐ | **CFEM** | ANM | royalty de mineração distribuído por município beneficiado (desde 2008) | M | CSV/CKAN + ASPX/UF | recorrente | dados.gov.br/conjuntos-dados/sistema-arrecadacao |
| NOVO | **Produção mineral** | ANM | produção por município × substância (base 2022) | M | XLS | anual | gov.br/anm (produção por município) |
| NOVO ⭐ | **Preços combustíveis (SLP)** | ANP | preço médio por município **e por posto/CNPJ** (gasolina/etanol/diesel/GNV/GLP) | M+E | CSV/ZIP | **semanal** | gov.br/anp (série histórica preços) |
| NOVO | **Vendas combustíveis** | ANP | volume vendido por município por produto (1990–2024) | M | CSV | anual | gov.br/anp (vendas derivados) |
| NOVO | **Geração Distribuída** | ANEEL | empreendimentos GD solar: UCs, potência, fonte por município | M | CSV/CKAN | ~diário | dadosabertos.aneel.gov.br (GD) |
| NOVO | **DEC/FEC** | ANEEL | interrupções por conjunto elétrico (→município via de-para) | conj→M | CSV | mensal | dadosabertos.aneel.gov.br (continuidade) |
| — | *Consumo/tarifa ANEEL* | ANEEL | por **distribuidora** (Celesc/RGE), não município | dist | CSV | — | (mapear muni→distribuidora) |

---

## 4. Eixo SAÚDE (amplia o que já temos: SIOPS/CNES/SIH/SIA/Previne)

| Status | Fonte | Órgão | O que traz | Gran | Acesso | Atualiz. | Link |
|---|---|---|---|---|---|---|---|
| NOVO | **SIM** | DATASUS | óbitos por causa CID-10, mort. infantil/materna | M | TABNET+DBC | anual | tabnet.datasus (sim) |
| NOVO | **SINASC** | DATASUS | nascidos vivos: peso/Apgar/pré-natal/parto | M | TABNET+DBC | anual | tabnet.datasus (sinasc) |
| NOVO | **SINAN** | DATASUS | agravos: dengue, tuberculose, sífilis, violências | M | TABNET+DBC | semanal | portalsinan.saude.gov.br |
| NOVO | **SI-PNI** | MS/RNDS | doses aplicadas/cobertura vacinal | M+E | CKAN CSV/API | semanal | opendatasus.saude.gov.br (PNI) |
| NOVO ⭐ | **ANS beneficiários (SIB)** | ANS | planos de saúde por município de residência (sexo/faixa) | M | TabNet→CSV/FTP | mensal | dadosabertos.ans.gov.br/FTP/PDA |
| NOVO | **SNGPC** | ANVISA | venda medicamentos controlados/antimicrobianos por município | M | CSV | mensal | dados.gov.br (SNGPC industrializados) |
| NOVO | **PCDaS Pólis** | Fiocruz | SIM/SINASC/SIH/CNES harmonizados + indicadores muni | M | API/R/Python (login) | varia | pcdas.icict.fiocruz.br |
| NOVO | **API DEMAS** | MS | CNES/IBGE em REST JSON (Swagger) | E/M | API REST | varia | apidadosabertos.saude.gov.br |
| NOVO | **SISVAN** | MS/SAPS | estado nutricional (antropometria + consumo) | M | Web+CSV | contínua | opendatasus (sisvan) |

---

## 5. Eixo TERRITORIAL / AMBIENTAL

| Status | Fonte | Órgão | O que traz | Gran | Acesso | Atualiz. | Link |
|---|---|---|---|---|---|---|---|
| NOVO ⭐ | **BDQueimadas** | INPE | focos de calor por satélite + área queimada | G→M | API REST+CSV | ~10min/diário | terrabrasilis.dpi.inpe.br/queimadas |
| NOVO | **PRODES/DETER** | INPE | desmatamento anual + alertas quase-diários | G→M | WFS/WMS+SHP | anual/diário | terrabrasilis.dpi.inpe.br |
| NOVO ⭐ | **IBAMA autos** | IBAMA | multas ambientais + embargos (casa com red flags/sanções) | M+G | CSV/API WKT | diária | dadosabertos.ibama.gov.br |
| NOVO | **Atlas Águas** | ANA | índice de segurança hídrica urbana (5.570 munis) | M | GeoJSON/CSV+painel | ~2024 | atlas.ana.gov.br |
| NOVO | **Outorgas** | ANA | direito de uso de recursos hídricos (geo→muni) | G→M | CSV/GeoJSON | contínua | dados.ana.gov.br |

---

## 6. Eixo INFRAESTRUTURA / SANEAMENTO (resolve o gap do SNIS)

| Status | Fonte | Órgão | O que traz | Gran | Acesso | Atualiz. | Nota |
|---|---|---|---|---|---|---|---|
| NOVO ⭐ | **SINISA** | Min. Cidades | **sucessor do SNIS (2023+):** água/esgoto/resíduos/pluviais/gestão | M | dashboard SPA / BigODados | anual | **o SNIS que o cron falha é DESCONTINUADO — mirar SINISA** |
| TEMOS/parcial | *SNIS série histórica* | Min. Cidades | água/esgoto (até 2022); resíduos bloqueado (getGridConfig 500) | M | app4.cidades + CKAN | — | ver [[pnigp-infraestrutura-saneamento]] |
| NOVO | **FJP Déficit Habitacional** | FJP+Cidades | déficit (precária/coabitação/ônus) + inadequação | M | XLSX/DSpace API | anual | TLS incompleto → Playwright |

---

## 7. ÍNDICES prontos por município

| Status | Fonte | Traz | Acesso |
|---|---|---|---|
| NOVO | **FIRJAN IFDM** | desenvolvimento municipal (emprego/educação/saúde) | painel+planilha (cadastro?) |
| NOVO | **FIRJAN IFGF** | gestão fiscal (autonomia/pessoal/investimento/liquidez) | Observatório+download |
| NOVO | **IPEA IVS** | vulnerabilidade social (16 indicadores) | painel+download |
| NOVO | **IPEA/FBSP Atlas Violência** | homicídios/taxas por município | painel+CSV |
| NOVO | **Atlas Brasil (PNUD)** | IDHM + 330 indicadores (UDH intramuni) | painel+download |
| NOVO | **IPEADATA** | séries regionais (PIB/pop/IDH/sociais) | API OData v4 |

---

## 8. Eixo POLÍTICO / SETORIAL

| Status | Fonte | Órgão | Traz | Acesso |
|---|---|---|---|---|
| NOVO ⭐ | **TSE** | TSE | eleitorado, candidatos, resultados, prestação de contas | CKAN API+CSV |
| NOVO | **MTur Categorização** | MTur | categoria A–E dos municípios turísticos (elegibilidade) | CKAN CSV |
| NOVO | **MinC SNIIC/Mapa Cultura** | MinC | espaços/equipamentos/agentes culturais geo | API REST (user-agent) |
| NOVO | **MUNIC Esporte** | IBGE | gestão/instalações esportivas municipais | FTP XLS |

---

## 9. IBGE / SIDRA (base-mãe — parte já usada)

`API v3 Agregados` (N6=município) cobre: **PIB municipal** (tab 6784), **estimativas pop** (6579), **Censo 2022** (9514), **PAM** (1612), **PPM** (3939), **CEMPRE** (empresas), **Censo Agro 2017**. + API Localidades (`/estados/42/municipios`) e Malhas (GeoJSON). Endpoint: `apisidra.ibge.gov.br/values/t/{tab}/n6/all/v/all/p/all`.
> **TEMOS:** Censo Agro, saneamento Censo, MUNIC, matrícula. **NOVO a puxar:** PIB municipal, PAM/PPM (agropecuária ampliada), CEMPRE (base econômica), estimativas pop atualizadas.

---

## 10. Armadilhas confirmadas
- **SNIS resíduos** morto (getGridConfig 500) → usar **SINISA**.
- **WAF/manual:** ANTAQ, ANVISA (fetch 403), FJP (TLS incompleto → Playwright).
- **Sem API (download/FTP/scraping):** INEP microdados, RAIS/CAGED (FTP), CECAD (login gov.br), SISAB (JSF scraping), RFB arrecadação (XLSX).
- **Não municipal (só UF/distribuidora):** BCB SGS/SCR, ANEEL consumo/tarifa, AMB regular ANM, série mensal vendas ANP.
- `api.dadosabertosinep.org` **não é oficial** (comunidade).
- **Base dos Dados** (BigQuery) é a via-API prática para RAIS/CAGED e SNIS espelhados.

---

## Onde cada eixo casa com features existentes
- **Financeiro (ESTBAN/BNDES/Pix/RAIS/CNPJ)** → índice de capacidade estatal + base econômica do município (eixo inédito).
- **CFEM/royalties/combustíveis** → receita própria (aba Acompanhamento/Captação).
- **SIM/SINASC/SINAN/ANS** → aba Saúde (amplia SIOPS/CNES).
- **IBAMA/PGFN** → red flags de fornecedores (aba Compras).
- **INPE/Atlas Águas/SINISA** → aba Infraestrutura/Território.
- **FIRJAN/IPEA/IDHM** → contexto socioeconômico + credibilidade do índice.
- **TSE** → contexto (sem abrir disputa; condição própria).
