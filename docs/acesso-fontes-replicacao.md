# Catálogo de acesso das fontes — replicação por UF (state-agnostic)

Objetivo: para cada fonte, registrar COMO acessar o dado municipal e COMO trocar a UF, de forma que a
replicação para outros estados (próximo: **SP**, cód UF **35**, sigla **SP**, 645 municípios) seja mecânica.
Regra transversal: `cod_ibge` é nacional e único (SC=42…, SP=35…), então **uma tabela por fonte com todos os
UFs** funciona (queries e painéis já filtram por `cod_ibge`). ⚠️ Trocar `TRUNCATE` por `DELETE WHERE cod_ibge`
da UF, senão rodar SP apaga SC. Ver [[pnigp-replicacao-uf-sp]].

Códigos por UF: SC = `42` / `SC` · **SP = `35` / `SP`** · (IBGE 2 díg inicial = UF).

## ✅ Suíte APS (feita para SC — replicável trocando a UF)
| Fonte | Script | Como trocar UF |
|---|---|---|
| Produção APS (SISAB, série mensal) | `scrape_sisab_serie.mjs UF compIni` | passar `SP` (usa sigla no POST full, modo Estado) |
| Indicadores Previne + ISF (SISAB indicadorPainel) | `scrape_sisab_indicadores_todos.mjs UF quad` | **add `SP:"35"` ao map `{SC:"42"}`** (estadoMunicipio); municípios de `entes_<uf>` |
| Qualidade 15 + Vínculo/CVAT (SIAPS) | `scrape_siaps_qualidade.mjs UF quads` | body `{uf:["SP"],…}`; `/uf/SP/municipios` já funciona |
| Cobertura/Financiamento APS (e-Gestor REST) | (browser hoje) → API `relatorioaps-prd.saude.gov.br` | `coUf=35` na querystring — scriptável em Node |
| Farmácia Popular (Qlik LocalizaSUS) | (browser) | selecionar UF=SP no painel Qlik |

Acesso detalhado de cada rota em [[pnigp-localizasus-qlik]].

## ✅ Já ingeridas (fontes nacionais/state-agnostic — trocar filtro de UF)
- **SICONFI** (finanças/RREO/RGF/RPPS), **PNCP** (compras/itens/contratos), **DATASUS** (SIM/SINASC/SIH/SIA/CNES/SINAN via `_blast_dbc.mjs`), **STN transferências**, **CAPAG**, **RFB arrecadação**, **BNDES**, **ESTBAN/Pix (BCB)**, **CFEM (ANM)**, **ANP combustíveis**, **IBGE SIDRA (PAM/PPM/CEMPRE)**, **InfoDengue (dengue/zika/chik)**, **MI Social MDS Solr (IGD-M/BPC/PBF)**, **SI-PNI vacina (Qlik)** — todas parametrizadas por UF/IBGE; pipeline nacional.

## Tier 1 + Tier 2 — catálogo de acesso (mapeado + testado 2026-07)
| Fonte | URL exata | método | município | trocar UF | Node? | período | status |
|---|---|---|---|---|---|---|---|
| **✅ MDS SUAS saldo** (recurso na mesa) | `aplicacoes.mds.gov.br/sagi/servicos/misocial?q=*:*&fq=sigla_uf:SC&fq=anomes:{comp}&fl=codigo_ibge,suas_repasse_mun_vl_total_fundo_f,suas_saldo_cc_mun_vl_total_geral_f` | GET Solr | IBGE 6díg | `fq=sigla_uf:SP` | ✅ Node | mensal | **INGERIDO** `suas_saldo_sc` (SC R$113mi na mesa) |
| **✅ FNDE PDDE saldo** (verba escolar parada) | `fnde.gov.br/plataforma-antonieta-de-barros-api/products/data-products/70/artifact` | GET → gz→CSV`;` | IBGE 7díg (col `codigo_municipio`) | arquivo nacional, filtrar col `uf` | ✅ Node | mensal | **INGERIDO** `pdde_saldo_sc` (SC R$65,5mi) |
| ⏳ FNDE PNAE repasses | `.../data-products/82/artifact` | GET → gz→CSV | Nome+UF (agregar) | filtrar col `UF` | ✅ Node | anual | a fazer |
| **✅ FNDE PNAE %agri familiar** | `gov.br/fnde/.../Planilha{ANO}_04_3_24.xlsx` | GET XLSX | IBGE 7díg (col `IBGE`) | filtrar `UF`+`ESFERA=MUNICIPAL` | ✅ Node | anual (≤2022) | **INGERIDO** `pnae_agri_sc` (SC 73% méd, 16 <30%) |
| ⏳ INEP taxas rendimento | `download.inep.gov.br/informacoes_estatisticas/indicadores_educacionais/{ANO}/tx_rend_municipios_{ANO}.zip` | GET → ZIP→XLSX | IBGE 7díg | nacional, filtrar UF | ✅ Node | anual | **checar se já temos** (indicadores_inep_sc) |
| ⏳ PGFN devedores | `dadosabertos.pgfn.gov.br/{ANO}_trimestre_{NN}/Dados_abertos_*.zip` | GET → ZIP→CSV | ❌ só via CNPJ→geocodificação (UF do arquivo = unidade PGFN) | nacional | ✅ Node | trimestral | difícil (precisa RFB CNPJ) |
| ⚠️ ANS ICB beneficiários | `dadosabertos.ans.gov.br/FTP/PDA/informacoes_consolidadas_de_beneficiarios/` `ic_benef_{AAAAMM}.zip` | GET → ZIP→CSV | IBGE 6díg (`CD_MUNICIPIO`) | nacional, filtrar `SG_UF` | ✅ Node | mensal | validar nome exato do arquivo |
| ⚠️ FNDE Salário-Educação | SIGEF servlet `fnde.gov.br/sigefweb/.../programa/51/...` | GET HTML | CNPJ (município texto) | path UF | ✅ Node | mensal | validar parse prog-51 |
| ❌ BCB SCR | `olinda.bcb.gov.br/.../scr_sub_regiao(DataBase={AAAAMM})` | GET OData | **só sub-região** (não município) | `$filter=ESTADO eq 'SP'` | ✅ Node | mensal | SEM granularidade municipal |
| ❌ Mapa de Empresas/REDESIM | `estatistica.redesim.gov.br/situacao-cadastral/api/...` | GET | **só UF** (município inexistente na API) | `?ano=&mes=` | ✅ Node/nav | mensal | município só via RFB CNPJ dump |

**Regra de-para IBGE:** MDS/ANS = 6 díg · PDDE/INEP/PNAE-AF = 7 díg (manter map 6↔7 via entes).
⚠️ Ingests já usam **DELETE-por-UF** (não TRUNCATE) — seguro p/ multi-UF.

## 2ª onda + Tier 2/3 — catálogo de acesso (mapeado + testado 2026-07)
| Fonte | URL exata | método | município | trocar UF | Node? | status |
|---|---|---|---|---|---|---|
| **✅ ANA SNISB barragens** | `portal1.snirh.gov.br/server/rest/services/SRE/Barragens_SNISB/MapServer/0/query?where=ING_SG_UFMUNICIPIO='SC'&outFields=*&f=json` | GET ArcGIS | nome (`ING_NM_MUNICIPIO`), sem IBGE — casar por nome+UF | `where=...'SP'` | ✅ Node | **INGERIDO** `barragens_sc` (SC 406, 100 dano alto) |
| **✅ Conab PAA propostas** | `portaldeinformacoes.conab.gov.br/downloads/arquivos/PAA_PropostaFormalizadasExecutada.txt` | GET | IBGE 7díg (`cod_ibge`) | col `uf` | ✅ Node (latin1, decimal vírgula) | **INGERIDO** `paa_sc` (executado; ⚠️ `valor_devolvido` ambíguo/omitido) |
| ⏳ ANP royalties/mun | `gov.br/anp/.../royalties-municipios/royalties-municipio-{ANO}.csv` | GET | slug `nome-uf`, sem IBGE | filtrar `estado` (sigla) | ✅ Node + headers browser | a fazer (SC pouco petróleo) |
| ⏳ ANP postos | `gov.br/anp/.../dados-cadastrais-revendedores-varejistas-combustiveis-automoveis.csv` | GET | `MUNICIPIO`+`UF`+CNPJ | filtrar `UF` | ✅ Node + headers | a fazer |
| ⏳ INMET estações | `apitempo.inmet.gov.br/estacoes/T` (dados: `/estacao/{ini}/{fim}/{cod}`) | GET JSON | lat/long+nome, sem IBGE | filtrar `SG_ESTADO` | ✅ Node | a fazer |
| ⏳ MDS Censo SUAS | `aplicacoes.mds.gov.br/sagi/dicivip_datain/ckfinder/userfiles/files/{modulo}_{ano}.zip` | GET ZIP | IBGE 7díg | nacional | ✅ Node (links via Playwright) | temos equipamentos_suas (CadSUAS); avaliar |
| ⏳ ANVISA AFE | `dados.anvisa.gov.br/.../TA_CONSULTA_FUNCIONAMENTO_EMPRESA_NACIONAL.CSV` | GET | IBGE 6díg (`CO_MUNICIPIO_IBGE`) | filtrar UF | ✅ Node (`NODE_TLS_REJECT_UNAUTHORIZED=0`; **310MB stream**) | pesado, ROI baixo |
| ⏳ MDS SUAS por bloco | Solr `misocial` `fl=suas_repasse_mun_vl_psb_f,_pse_f,_gestao_suas_f,valor_repassado_igd_suas` | GET Solr | IBGE 6díg | `q=uf:SP` | ✅ Node | enriquecimento do suas_saldo |
| ❌ ANTAQ portos | `estatistica.antaq.gov.br/ea/txt/{ANO}Atracacao.zip` | GET ZIP | porto→município | — | ❌ Cloudflare + **manutenção até 10/07/2026** | voltar após 10/07 (fallback: basedosdados) |
| ❌ ANS ressarcimento SUS | `dadosabertos.ans.gov.br/FTP/PDA/.../ressarc_SUS_operadora_plano.zip` | GET ZIP 397MB | só via `CD_CNES`→join CNES | — | ✅ Node (streamar) | só por CNES; adiado |

## ⏳ 3ª–5ª onda — a preencher (recurso na mesa: Aldir Blanc/Paulo Gustavo, LIE, Novo PAC, CEMADEN, S2ID prejuízos; IPEA/IDHM; IBGE Censo 2022)
