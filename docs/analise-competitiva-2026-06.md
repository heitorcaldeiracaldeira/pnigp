# PNIGP — Análise Competitiva de Mercado

**Plataforma Nacional de Inteligência de Gestão Pública**
Documento interno · Instituto I10 · Junho/2026
Base: pesquisa de mercado em 3 frentes (captação, benchmarking municipal, ERPs/GovTech) com verificação cruzada de fontes.

---

## 1. Sumário executivo

O mercado de dados e inteligência para gestão pública municipal está dividido em **cinco camadas** que **não conversam entre si**: ferramentas de captação de recursos, painéis de benchmarking, ERPs transacionais, GovTechs de IA/atendimento e inteligência de mercado B2B.

**Nenhum concorrente reúne, sobre dados abertos e de forma comparável entre municípios, a combinação que define o PNIGP:** compras **item a item** (preço unitário real), **captação de recursos** federais, saúde e educação **unidade a unidade** com geolocalização e série histórica, e a venda de **estudos para a iniciativa privada (B2B)**.

Cada eixo isolado já tem algum ocupante; **a combinação integrada permanece vazia** — e contorna os ERPs por não depender deles (usa dado público).

**Três conclusões para a estratégia:**
1. A camada de **"captação operacional + comparação entre municípios"** está sendo disputada (QIATech/+Convénios é o nome a vigiar) — precisamos chegar primeiro com a integração ao resto da gestão.
2. Existe um **piso gratuito** robusto (Portal da Transparência 2026 + CNM Êxitos). Todo valor pago precisa ficar **acima** dele: consolidação, alertas, matching e compliance.
3. Os dois eixos **mais vazios e mais defensáveis** são **preço unitário comparável entre municípios** e **estudos B2B sobre gasto público**.

---

## 2. Mapa do mercado

| Camada | O que fazem | Players principais |
|---|---|---|
| **A. Captação / emendas** | Encontrar e operar recursos federais | QIATech/+Convénios, Gestor de Convénios, CNM Êxitos (grátis), Portal da Transparência (grátis), consultorias (Squadra, Orzil) |
| **B. Benchmarking municipal** | Comparar indicadores entre municípios | Meu Município, Cidade Única (FIESC), Datapedia, FGV Municípios, inteli.gente (MCTI), CLP Ranking, ICE (ENAP) |
| **C. ERPs de gestão pública** | Operar a prefeitura (contábil, folha, tributos, compras) | IPM, GOVBR, Betha, Fiorilli, Elotech |
| **D. GovTech de IA / gabinete** | Atendimento ao cidadão, CRM de mandato | GovTools, Conecta Gabinete |
| **E. B2B sobre dado público** | Estudos/inteligência de mercado | 4MTI; (geomarketing: Cortex, Geofusion, Neoway — usam consumo, não gasto público) |

---

## 3. Avaliação de ameaças (ranqueada)

### 🔴 1. QIATech / +Convénios — a mais perigosa
IA que mapeia oportunidades, **gera propostas**, calcula potencial não captado e oferece **"Ranking de Eficiência: compare o desempenho de captação do seu município com as cidades da região"**. Integra TransfereGov, SIMEC, FNS, Sismob, Sigcon.
É o player que mais se aproxima da nossa tese (captação **com comparação inter-municipal**).
*Porte, preço e cobertura não divulgados — validar.*

### 🟠 2. Gestor de Convénios — concorrente direto, porém frágil
Cobre a jornada de captação: emenda por **CNPJ**, panorama **TransfereGov**, **CAUC**, gerador de **Plano de Trabalho** (PDF), alertas e radar de +200 programas.
**Vulnerabilidades:** empresa opaca e provavelmente minúscula (Tocantins), **sem preço público**, sem profundidade fiscal (não ingere empenhado/liquidado/pago do município), moat de dados raso (puxa as mesmas bases abertas).

### 🟠 3. Gove (gove.digital) — o mais próximo no eixo indicadores
≈50 indicadores comparáveis + Ranking de Competitividade (com o CLP). Porém **atrelado ao ERP financeiro** (não é 100% dado aberto), foco em finanças, **sem item a item, sem B2B**.

### 🟡 4. O "piso gratuito" — ameaça estrutural (não comercial)
- **Portal da Transparência 2026**: emendas RP6–RP9 por autor/UF/município/CNPJ, **empenho × liquidação × pagamento com evolução diária**, detalhamento da emenda Pix (>R$30 bi desde 2020).
- **CNM Plataforma Êxitos**: radar de editais/oportunidades grátis para municípios filiados.
Qualquer produto pago precisa entregar **acima** desse piso.

### ⚪ Não são ameaça real
Central das Emendas (transparência cívica/acadêmica), Conjunta (educação para OSCs), Squadra e Orzil (consultoria e treinamento — não escalam, sem produto de descoberta contínua), GovTools e Conecta Gabinete (atendimento/CRM, não inteligência de dados).

---

## 4. Matriz de capacidades

| Capacidade | Benchmarkers (Meu Município, Cidade Única, CLP, ICE…) | Captação (QIATech, Gestor) | ERPs (IPM, GOVBR, Betha…) | **PNIGP** |
|---|:--:|:--:|:--:|:--:|
| Compras **item a item** (preço unitário, PNCP/NCM-CATMAT) | ❌ | ❌ | parcial (só do próprio ente) | ✅ |
| **Escola/estabelecimento a estabelecimento** + geo | ❌ | ❌ | parcial (intra-município) | ✅ |
| **Captação** de recursos federais | ❌ | ✅ | ❌ | ✅ |
| **Matching** captação ↔ gargalo por área | ❌ | ❌ | ❌ | ✅ |
| **Série histórica** granular | parcial/agregada | ❌ | ❌ | ✅ |
| Comparação **entre** municípios | ✅ | parcial (QIATech) | ❌ (silos) | ✅ |
| **Estudos B2B** de gasto público | ❌ | ❌ | ❌ | ✅ (tese) |
| Natureza do dado | secundário, agregado, anual | aberto, nível convênio | bruto, mas em silo por cliente | **aberto, granular, atual** |

---

## 5. Inteligência de preços (o que é público)

| Produto | Preço observado |
|---|---|
| Datapedia | Municipal **R$ 1.200/ano** · Estadual R$ 3.000 · Gabinete R$ 50.000/ano |
| Legislapp (monitoramento legislativo) | **R$ 49,90/mês** individual; grátis p/ ONGs |
| Gestor de Convénios, QIATech, Gove, Meu Município (Otimiza) | **Sob demonstração** (não divulgam) |
| Portal da Transparência, CNM Êxitos, inteli.gente, ICE, CLP | **Gratuitos** |

A opacidade de preço dos concorrentes diretos é uma **oportunidade de confiança**: transparência comercial é um diferencial onde o concorrente mais próximo (Gestor de Convénios) é frágil.

---

## 6. O espaço em aberto (nosso moat)

> Nenhum player único reúne, **100% sobre dados abertos** e **comparável entre municípios**: preço unitário item a item + radar de captação + saúde/educação granular + geo + série + monetização B2B.

Os **dois eixos mais vazios e mais defensáveis**:
1. **Preço unitário comparável entre municípios** — as ferramentas atuais servem ao comprador (instruir licitação) ou ao fornecedor, nunca à **comparação neutra** que revela sobrepreço/economia.
2. **Estudos B2B sobre gasto público municipal** — o geomarketing (Cortex/Geofusion/Neoway) usa dados de **consumo**, não de **gasto público**. Ninguém vende inteligência de mercado a partir da granularidade da gestão pública.

Por que os ERPs (que têm o dado bruto) não ocupam esse espaço:
- Arquitetura **single-tenant** (uma instância por prefeitura) exigiria reengenharia;
- O dado é **contratualmente do ente**, sob LGPD/sigilo;
- **Conflito de incentivo** — clientes vizinhos competem por recursos e imagem; expor um ao outro é antiproduto.

---

## 7. Recomendações estratégicas

1. **Chegar primeiro na integração.** QIATech está construindo "captação + comparação". Nosso troco é **integrar captação ao resto da gestão** (compras, saúde, educação, gargalos) — eles fazem só captação.
2. **Entregar acima do piso gratuito.** Foco em: consolidação cross-fonte, **alertas de prazo**, **matching gargalo→programa→emenda**, e **gestão de compliance da Resolução 370/2025** (municípios podem ficar sem receber emendas em 2026 se não adequarem a transparência — dor aguda que ninguém resolve).
3. **Cravar os dois eixos vazios**: preço unitário comparável + estudos B2B.
4. **Posicionar a transparência comercial** como diferencial (vs. concorrentes sem preço público).
5. **Não temer os ERPs** no curto prazo, mas projetar a base sempre sobre **dado aberto** para não depender deles.

---

## 8. Incertezas a validar

- Porte, preço e cobertura reais de **QIATech/+Convénios** e **Gestor de Convénios**.
- Cadência real de atualização das bases dos concorrentes.
- Status do **Painel de Preços** federal (indício de descontinuação em jul/2025 — confirmar).
- Publicação do **ICE 2024** (contratado, ainda não publicado).
- Long-tail de govtechs regionais (recomenda-se rodada dirigida aos TCEs).

---

## 9. Fontes (principais)

Captação: gestordeconvenios.com.br · qiatech.com.br · centraldasemendas.info · conjunta.org · consultoriasquadra.com.br · orzil.org · portaldatransparencia.gov.br/emendas · plataformaexitos.com.br (CNM)
Benchmarking: meumunicipio.org.br · cidadeunica.com.br · datapedia.info · municipios.fgv.br · inteligente.mcti.gov.br · rankingdecompetitividade.org.br · ice.enap.gov.br
ERPs/GovTech: ipm.com.br · governancabrasil.com.br · betha.com.br · fiorilli.com.br · elotech.com.br · gove.digital · startgov.com.br · 4mti.com.br · conectagabinete.com.br

---

*Metodologia: pesquisa web com navegação ao vivo nos sites e verificação cruzada, jun/2026. Itens não confirmados estão marcados como incertezas (seção 8). Documento vivo — atualizar conforme o monitoramento (tarefa interna #88).*
