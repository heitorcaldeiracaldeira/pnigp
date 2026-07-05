# Levantamento de fontes NOVAS por município (2026-07-04)

Varredura por 5+ agentes (ministérios, agências, bancos/autarquias, institutos, dados.gov.br + SC).
Só fontes com recorte **por município**, acessíveis como **dado** (não PDF), e que **ainda não temos**.

## 🥇 TIER 1 — Alta prioridade, alto valor, CSV/XLSX de download direto

| # | Órgão | Base | O que traz por município | Acesso |
|---|---|---|---|---|
| 1 | **INSS/MPS** | **EMPS — Estatísticas Municipais de Previdência** | benefícios emitidos + valor pago (aposentadorias, pensões, auxílios, **BPC/LOAS**) + arrecadação previdenciária | XLSX anual · dadosabertos.inss.gov.br |
| 2 | **RFB** | **Arrecadação por Município** | arrecadação federal desdobrada: IR, IPI, prev., MEI, ITR (série 2005-2025) | XLSX anual · gov.br/receitafederal |
| 3 | **MDIC/SECEX** | **COMEX Stat MUN** (exp/imp por município) | valor FOB US$ + KG por SH4 + país (quem exporta/importa o quê) | CSV `;` direto · balanca.economia.gov.br |
| 4 | **STN** | **CAPAG — Capacidade de Pagamento** | nota de crédito A/B/C/D + 3 indicadores (endividamento/poupança/liquidez) | CSV · tesourotransparente ckan |
| 5 | **PGFN** | **Devedores da União e FGTS** | passivo tributário por CNPJ/município (previdenciário/FGTS) | CSV ZIP por UF · trimestral |
| 6 | **ANS** | **ICB — Info Consolidadas de Beneficiários** | beneficiários por município detalhado (operadora/modalidade/faixa etária/ativos-cancelados) — vai além da cobertura que temos | ZIP→CSV por UF (tem SC) |
| 7 | **BNDES** | **Operações de Financiamento** | operação a operação por município (inclui Cartão BNDES/Finame) desde 2002 | CSV CKAN · dadosabertos.bndes |
| 8 | **BCB** | **SCR.data por sub-região** | carteira de crédito + inadimplência por região/município | API Olinda + CSV |
| 9 | **Min. Empreendedorismo** | **Mapa de Empresas** | empresas ativas, aberturas/fechamentos, MEIs por município (mensal) — proxy do CNPJ parqueado | painel + base |

## 🥈 TIER 2 — Educação/Assistência (dinheiro na mesa + risco) — CSV/CKAN

| Órgão | Base | O que revela |
|---|---|---|
| **FNDE** | PDDE Saldos das UEx | verba escolar **parada** (não executada) por município |
| **FNDE** | PNAE repasses + % agricultura familiar | alimentação escolar + mínimo legal 30% (casa com agro) |
| **FNDE** | Salário-Educação quota municipal | repasse mensal vinculado à educação (série 2004+) |
| **FNDE** | SIGPC contas online | risco de inadimplência/bloqueio de repasse |
| **MDS** | SUASWEB Parcelas Pagas / Saldos | cofinanciamento SUAS **na mesa** (saldo não usado) |
| **MDS** | IGD-M | qualidade da gestão PBF/CadÚnico (risco de perder repasse) |
| **MDS** | CECAD 2.0 tabulador | perfil de necessidade das famílias (além da contagem) |
| **MDS** | Censo SUAS microdados | estrutura/RH de CRAS/CREAS por município |
| **Conab/MDS** | PAA entregas | compras da agricultura familiar por município |
| **INEP** | Indicadores educacionais (TDI/rendimento) | abandono/reprovação/distorção idade-série |

## 🥉 TIER 3 — Setoriais complementares

| Órgão | Base | Eixo |
|---|---|---|
| **ANVISA** | AFE (farmácias/drogarias) + SNGPC (venda de medicamentos) | Saúde — acesso a medicamento |
| **ANS** | Ressarcimento ao SUS por operadora | Saúde — pressão SUS (casa com nossa tese) |
| **SUSEP** | AUTOSEG (seguro auto por município) + seguro rural | Econômico — proxy renda/frota/agro |
| **IBGE** | PAM/PPM/PEVS (produção agrícola/pecuária/extrativismo) | Agro — série longa por município |
| **IBGE** | CEMPRE (empresas/pessoal ocupado) | Econômico — complementa RAIS |
| **MDIC** | Cadastur (prestadores turísticos) | Turismo — eixo inédito |
| **SINIR/MMA** | Resíduos sólidos (coleta seletiva/reciclagem) | Ambiental — complementa SINISA |
| **MME** | Luz para Todos | Energia (rural, baixo p/ SC) |
| **Cultura** | Pontos de Cultura (Cultura Viva) | Cultura — inédito |

## 🟢 ESPECÍFICO SANTA CATARINA — dados.sc.gov.br (CKAN funcional)

| Órgão | Base | Valor |
|---|---|---|
| **SEF-SC** | **TEV — Transferências Especiais Voluntárias** | "emenda estadual" na mesa por município (captação) |
| **SDE-SC** | **Plano 1000** | convênios Estado↔município (oportunidade) |
| **SEA-SC** | Obras no Mapa (SICOP) | investimento estadual georreferenciado |
| **SES-SC** | Lista de espera no SUS | saúde (portal, exige scraping) |

## ❌ Descartadas (sem dado municipal aberto / já temos)
- RENAEST acidentes: existe (dados.transportes.gov.br) mas ZIP **417MB/mês × 53 meses** — muito pesado; avaliar versão agregada.
- DIRPF Grandes Números, PREVIC, CVM: nacional/UF, sem município.
- Tarifa social ANEEL, SAMU nacional, SEMOB mobilidade: sem base municipal aberta.
- PMVG/CMED: preço-teto nacional (não municipal) — fonte futura de preço legal.

## 🌊 2ª ONDA — Agências reguladoras detalhadas + ambiental/clima

**Econômico por município (CSV direto, alto valor):**
| Órgão | Base | O que traz |
|---|---|---|
| **ANP** | Vendas de combustíveis por município | diesel/gasolina/etanol/GLP em litros, **série 1990-2024** — proxy de consumo/economia |
| **ANP** | Royalties + Participação Especial por município | receita de petróleo recebida (R$), 2009+ |
| **ANP** | Postos revendedores | cada posto por município (CNPJ/bandeira/lat-long) |
| **ANM** | CFEM Arrecadação DETALHADA | por substância × empresa × município (além do total que temos) |
| **ANM** | CFEM Distribuição + SIGMINE + Barragens | repasse por município + polígonos de processos minerários + barragens de rejeito |
| **ANTAQ** | Estatístico Aquaviário (carga/atracação) | carga portuária por porto/município — **relevante p/ SC (Itajaí, São Francisco, Imbituba)** |
| **ANAC** | Movimentação aeroportuária + tarifas | passageiros/carga por aeroporto(=município) |
| **ANTT** | RNTRC + Monitriip + pedágio | transportadores, ônibus interestadual, volume de tráfego por praça |

**Serviço ao cidadão / infraestrutura:**
| Órgão | Base | O que traz |
|---|---|---|
| **ANEEL** | DEC/FEC (continuidade) + INDGER + Ouvidoria | qualidade da energia (duração/frequência de interrupção) + reclamações por município |
| **ANATEL** | Acessos móvel + fixo + TV paga + reclamações + **Meu Município** (consolidado) | conectividade completa por município |
| **ANS** | ICB beneficiários + rede hospitalar credenciada + ressarcimento SUS | saúde suplementar detalhada |
| **ANVISA** | AFE (farmácias) + VigiMed (farmacovigilância) | acesso a medicamento + eventos adversos |
| **ANCINE** | Salas de cinema + público/renda | cultura/lazer por município |

**Ambiental / clima / territorial (CSV/SHP/WFS aberto):**
| Órgão | Base | O que traz |
|---|---|---|
| **INMET** | BDMEP clima + API Tempo | chuva/temp/umidade/vento por estação→município (série 1961+) |
| **INPE** | DETER + TerraClass + WFS | desmatamento recente + uso/cobertura da terra por município |
| **ANA** | **SNISB barragens** (dam safety) | barragens por município: dano potencial + categoria de risco → **casa com Defesa Civil** |
| **IBAMA** | **Áreas Embargadas** (CSV direto!) | embargos ambientais por município (complementa os autos que já temos) |
| **FUNAI** | Terras Indígenas (WFS) | limites/situação de TIs por município |
| **Palmares** | Comunidades Quilombolas certificadas | por município (código IBGE) |
| **FUNASA** | Obras de saneamento rural | convênios/obras por município |

**Padrões de acesso por agência:** ANEEL/ANTT = CKAN próprio · ANATEL/ANM/ANCINE = dados.gov.br + file server · ANP = file server gov.br · ANAC/ANTAQ = file server próprio · ANS = FTP PDA · ANA = ArcGIS Hub (data.json) · INMET = BDMEP (cadastro grátis) + API JSON · INPE/FUNAI = GeoServer WFS.

## 📚 3ª ONDA — INEP / IPEA (educação, desenvolvimento, violência)
| Órgão | Base | O que traz | Prioridade |
|---|---|---|---|
| **IPEA** | **IpeaData API OData4** | séries socioeconômicas municipais (PIB, renda, saúde, população) por TERCODIGO=IBGE, JSON | alta |
| **IPEA/FBSP** | **Atlas da Violência** | homicídios + taxas por município (sexo/raça/idade) — **complementa o SINESP na aba Segurança** | alta |
| **IPEA/PNUD** | Atlas IDHM | IDHM + 200 indicadores por município (anos-censo) | média |
| **INEP** | Indicadores Educacionais (ATU/TDI/AFD/ICG/HAD) | aluno-turma, distorção idade-série, formação docente por município/escola | alta |
| **INEP** | Taxas de Rendimento (aprovação/reprovação/abandono) | fluxo escolar por município | alta |
| **INEP** | Microdados SAEB | proficiência PT/MAT por escola/município (bianual) | alta |
| **INEP** | Censo Educação Superior + ENADE | matrículas/IES/desempenho por município da IES | média |

## 🏛️ 4ª ONDA — IBGE (SIDRA, IDs de tabela confirmados) + Cultura + institutos
Endpoint SIDRA: `https://apisidra.ibge.gov.br/values/t/{tabela}/n6/all/p/all/v/all` (n6=município).

| Órgão | Base | Tabela SIDRA | O que traz | Prior. |
|---|---|---|---|---|
| **IBGE** | **PAM** produção agrícola municipal | **5457** (1612/1613) | área/quantidade/valor por lavoura, **1974-2024** | alta |
| **IBGE** | **PPM** pecuária (rebanhos) | **3939** | efetivo bovino/suíno/aves/etc., 1974-2024 | alta |
| **IBGE** | **PPM** produção animal (leite/ovos/mel) | **74**, 94 | quantidade+valor, 1974-2024 | alta |
| **IBGE** | **PPM** aquicultura | **3940** | peixes/camarão/moluscos, 2013-2024 | alta |
| **IBGE** | **PEVS** extração vegetal + silvicultura | **289**, 291, 5930 | madeira/erva-mate/carvão/eucalipto, 1986-2024 | alta |
| **IBGE** | **CEMPRE** empresas/pessoal ocupado | **9509**, 9418 | unidades, pessoal, salários por CNAE, 2006-2024 (complementa RAIS) | alta |
| **IBGE** | Estimativas de população | **6579** | pop. residente anual 2001-2025 (já usamos p/ ANS) | — |
| **IBGE** | Censo 2022 (cor/raça, indígenas, quilombolas, domicílios) | 9605/9606+acervo | demografia detalhada 2022 | alta |
| **Fiocruz** | **InfoDengue ZIKA + CHIKUNGUNYA** | — | mesma API do dengue (`disease=zika\|chikungunya`) — **trivial de adicionar ao coletor que já temos** | alta |
| **IBRAM** | MuseusBr | — | museus por município (API Tainacan + geo) | média |
| **IPHAN** | SICG bens tombados | — | patrimônio por município (export + SHP) | média |
| **MinC** | Mapas Culturais (SNIIC) | — | equipamentos/bibliotecas culturais geolocalizados (API JSON) | média |
| **INPI** | BADEPI patentes/marcas | — | PI por cidade do depositante | média |
| **EMBRAPA** | GeoInfo (uso do solo/aptidão) | — | WFS recortável por município | média |
| **DNIT** | VGEO rede rodoviária federal | — | trechos BR/pavimento/obras (geo linear) | média |
| **CONAB** | Custos de produção | — | custo agrícola por município | média |

**Ganhos IMEDIATOS que essa onda revelou:** (1) IBGE PAM/PPM/PEVS/CEMPRE = SIDRA JSON com IDs prontos (pipeline igual ao saneamento/vitais que já temos); (2) **zika/chikungunya = 1 linha no coletor de dengue existente** (mesma API InfoDengue).

## 🏥🚦 5ª ONDA — ministérios (bloco completo, muitas com endpoint exato)

**Saúde (DATASUS) — grande volume novo:**
- **SIM** (óbitos por município/causa CID-10, mortalidade infantil/materna, 1979+) · **SINASC** (nascidos vivos: pré-natal/peso/prematuridade) · **SIH-SUS** (internações/procedimentos/valor pago) · **SIA-SUS** (ambulatorial) — TabNet + microdados FTP DBC.
- **PNI/SI-PNI** — cobertura vacinal por município (déficit = risco) · **SISVAN** — nutrição infantil (desnutrição/obesidade) · **SISAB/e-SUS APS** (produção APS, distinto do Previne).

**Segurança/trânsito — mais leve que RENAEST:**
- **PRF DATATRAN** ⭐ — acidentes em rodovias federais: município + km + lat/long + causa + mortos/feridos (black spots), CSV por ano, série 2007+. Bem mais leve que a RENAEST (417MB/mês).
- **SENASP SINESP ocorrências** (homicídio/roubo/feminicídio por município/mês — além das vítimas que temos) · **FNSP** repasses · **SENACON Consumidor.gov** · **MDH Disque 100/Ligue 180**.

**Defesa Civil (casa com desastres):**
- **CEMADEN** ⭐ — municípios monitorados + áreas de risco + alertas hidrológicos/geológicos + chuva por pluviômetro.
- **S2ID FIDE** — danos humanos/materiais + **prejuízos em R$** por evento (sub-base do S2ID que ainda não temos — só temos contagens).
- **MDR CPDC** — Cartão de Pagamento da Defesa Civil (gastos emergenciais) · **GPIPA** carro-pipa · **MDR TCI** carteira de investimentos obra-a-obra.

**💰 "Recurso na mesa" (incentivo/repasse não sacado — alta alavancagem):**
- **Cultura:** Lei Paulo Gustavo + Aldir Blanc (saldo parado/risco de devolução) · **Rouanet-SALIC** (incentivo fiscal não captado, API) · **SNC** adesão/instrumentos.
- **Esporte:** **LIE — Lei de Incentivo ao Esporte** (projetos aptos + valor a captar).
- **Fundos constitucionais:** **FNE** (BNB) + **FCO** (BB) — crédito contratado por município.
- **PAC:** **Novo PAC empreendimentos** (obra-a-obra por município, situação).
- **C&T:** **CNPq** bolsas/fomento + **Finep** projetos (fomento não captado vs vizinhos).
- **CGU Portal Transparência** — recursos transferidos consolidados + gastos por favorecido.

**Econômico/mineração/energia:**
- **RFB Simples/MEI por município** (mais leve que a base CNPJ completa 85GB) · **PGFN dívida ativa**.
- **ANM SIGMINE** (processos minerários SC.zip) + **produção mineral** (Anuário) + **CFEM distribuição** (repasse ao ente).
- **ANEEL DEC/FEC** + **Tarifa Social CDE** (benefício por família) + **SIGA** geração.
- **GESAC/Wi-Fi Brasil** — pontos de internet (escola/UBS) por município · **Luz para Todos**.

**Agro:** **MAPA ZARC** (risco climático de plantio por cultura/município, API) · SIPEAGRO estabelecimentos · CONAB custos/armazéns.
**Cidades:** SNIS série histórica (temos SINISA; SNIS dá série 1995+) · **MCMV/FAR** empreendimentos.
**Trabalho:** Seguro-Desemprego + Abono PIS por município · "Lista Suja" trabalho escravo.
**Turismo:** Cadastur + Categorização dos Municípios Turísticos.

**Notas de ingestão (ministérios):** `dadosabertos.mdr.gov.br` = CKAN com geoblock/WAF (egress BR ou Playwright) · fontes por trecho/coordenada (SIGMINE/SNV/DATATRAN/RENAEST) exigem ponto-em-polígono p/ atribuir município · Base CNPJ ~85GB = pipeline em lote (parqueado, BigQuery).

## Notas de acesso
- ANVISA `dados.anvisa.gov.br` = diretório HTTP (h5ai), download por URL direta.
- ANS `dadosabertos.ans.gov.br` = índice FTP/HTTP por UF.
- INSS/RFB/COMEX = XLSX/CSV direto (state-agnostic, compatível com pipeline nacional).
- Caixa PDA = SharePoint com redirects (exige Playwright).
- FNDE/MDS VIS DATA 3 = payload codificado `v.php?q[]=` (automatizar por códigos INxxx).

---
## STATUS DE INGESTÃO (atualizado 2026-07-05)

### ✅ INGERIDAS (no ar)
Cluster econômico-fiscal: **ANP combustíveis, CAPAG, RFB Arrecadação**.
Saúde (via descompressor DBC próprio): **SIM (óbitos), SINASC (nascimentos), SIH (internações)**.
Assistência: **IGD-M** (gestão PBF/CadÚnico).
Ganhos rápidos anteriores: IBGE PAM/PPM/CEMPRE, arboviroses (zika/chik), PRF DATATRAN.
Recuperadas: PRONAF, INCRA, ICMBio, ANA outorgas. Base econ/ambiental (rodadas anteriores): ANEEL GD, ANATEL banda larga, SENATRAN frota, IBAMA autos, SINESP, BNDES, ESTBAN, Pix, CFEM, etc.

### ❌ NÃO INGERIDAS (com o motivo real)
**Bloqueio de link/origem:**
- INSS EMPS (benefícios/aposentadorias por município): links recentes quebrados no gov.br (soft-404) + WAF bloqueia curl. Só 2010-2016 acessível.
- COMEX (exp/imp por município): URL `balanca.economia.gov.br/.../mun/` retornou PHP (endpoint mudou) — precisa achar o arquivo certo.
- Atlas da Violência (IPEA): API `/atlasviolencia/api/v1/` dá 404 — estrutura da API mudou.
- ANM CFEM detalhada + SIGMINE: URLs `app.anm.gov.br/dadosabertos/` dão 404 — path mudou.

**Pesado (adiado, mas rota conhecida):**
- ANATEL telefonia móvel + fixa + TV: ZIP ~1GB cada (como banda larga). Coletor pronto (padrão banda larga), só rodar.

**Precisa de join/estrutura extra:**
- ANEEL DEC/FEC: precisa join da ponte conjunto→município (`indqual-municipio`) com a tabela de DEC/FEC.

**dados.gov.br 401 no Node (resolvível via navegador, URLs já mapeadas p/ ANATEL):**
- FNDE PDDE/PNAE/salário-educação; MDS SUASWEB parcelas pagas (JSF), CECAD (tabulador), Censo SUAS; Cadastur; ANTAQ portos; ANAC; ANTT; INMET; INPE DETER; FUNAI TIs; IBAMA embargos; Fundação Palmares; culturas (Lei Paulo Gustavo/Rouanet/LIE); CNPq/Finep; GESAC; Novo PAC; CGU transferências; PGFN devedores; BCB SCR; SUSEP; IBGE Censo 2022 recortes.

### Padrões que funcionaram (p/ retomar rápido)
- Descompressor DBC próprio (`_blast_dbc.mjs`) → todo o DATASUS.
- MI Social Solr (`aplicacoes.mds.gov.br/sagi/servicos/misocial/?...&wt=csv`) → IGD-M, BPC, PBF (sem auth, IBGE 6 díg).
- ANATEL = ZIP direto; CKAN ANEEL/ANTT direto; dados.gov.br publico API só no navegador.
