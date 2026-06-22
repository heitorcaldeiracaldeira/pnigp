# Coleta — FNDE / SIMAD (liberações por município) · educação

> Observação registrada para atualização do sistema e automação. Fonte do **dinheiro que o FNDE efetivamente liberou** por município (PNAE, PDDE, PNATE, FUNDEB, PNLD, PROINFÂNCIA, salário-educação etc.). Alimenta o **Radar de Captação — Educação** e a análise gargalo↔recurso (tarefa #80).

## ⚠️ Caveat de automação (importante)
- **Acessível SOMENTE via navegador (Playwright).** O endpoint é Oracle PL/SQL com sessão/anti-bot: **`curl` retorna vazio mesmo com cookie**. Não roda em cron simples — precisa de browser headless.
- Implicação: coleta **periódica via Playwright** (one-time bulk + refresh ocasional), não cron diário leve. Mesma classe do SIMEC/PAR (browser-only).

## Fluxo que FUNCIONA
1. GET `https://www.fnde.gov.br/pls/simad/internet_fnde.LIBERACOES_01_PC?p_uf=SC&p_municipio=<IBGE6>` (estabelece a sessão + carrega os selects).
2. Preencher no DOM: `p_ano`, `p_municipio` (**código IBGE de 6 dígitos!**), `p_tp_entidade`, `p_programa` (vazio = todos).
3. Chamar `submete()` → POST para `internet_fnde.liberacoes_result_pc`.
4. Parsear a tabela do resultado: **Data Pgto · OB · Valor · Parcela · Programa · Banco · Agência · C/C** + cabeçalho "Entidade..: <CNPJ> - <nome>".

## Códigos e parâmetros
- **`p_municipio` = IBGE de 6 dígitos** (IBGE-7 sem o dígito verificador). Ex.: Florianópolis IBGE-7 `4205407` → SIMAD `420540`. Blumenau `420240`, Joinville `420910`.
- **`p_uf` = "SC"**. **`p_verifica` = "sigef"**.
- **`p_tp_entidade`** (tipo de recebedor):
  `02` PREFEITURA · `03` ÓRGÃO ESTADUAL · `04` ESCOLA PÚBLICA · `05` ONG · `06` ESCOLA PARTICULAR · `07` EMPRESA · `10` SECRETARIA ESTADUAL DE EDUCAÇÃO.
  **ATENÇÃO (regra de fidelidade):** o dinheiro pode ir ao **Fundo Municipal de Educação** ou **Fundo Estadual de Educação** (CNPJ próprio, não a prefeitura). **Não filtrar só por `02`** — capturar **todos os tipos** e guardar o CNPJ/tipo do recebedor, para não perder repasse.
- **Anos disponíveis: 2000 a 2026** (27 anos no seletor; cobertura real por município a confirmar na coleta).
- **Programas (25)**: `C7` PNAE/Alimentação Escolar · `02` PDDE · `D8` PNATE (transporte) · `86` FUNDEB · `01` PNLD · `BW` PROINFÂNCIA-creches · `51` QUOTA (salário-educação) · `CM` PAR-TD · `03` PTA · `0B`/`0A` PDDE Qualidade/Equidade · `32` PBA · etc.

## Esquema sugerido (Neon)
`fnde_liberacoes_sc(cod_ibge, ano, data_pgto DATE, ob, valor NUMERIC, parcela, programa, cnpj_recebedor, nome_recebedor, tp_entidade, banco, agencia, conta)` — PK (cod_ibge, ano, ob, programa, parcela). Idempotente (UPSERT).

## Estado
- ✅ Fluxo decifrado e validado: **Florianópolis 2024 = 83 liberações** (PNAE por etapa: Creche R$265 mil, Fundamental R$282 mil, Pré-escola R$171 mil…).
- ⏳ Falta: coletor Playwright iterando 295 municípios × anos × tipos. (Relacionado: tarefas #80 e #81.)

## Outras fontes browser-only (mesma classe)
- **SIMEC / Novo PAR**: Cloudflare + login gov.br. Painel público consultável via Playwright (CTE relatoriopublico lista 296 municípios de SC), sem API. Não cron-friendly.
