# Lei 1 da arquitetura — Espelho do PNCP vs. Derivadas

> **Tudo que vem do PNCP é o chão do trabalho. A fidelidade do chão não se negocia. A velocidade se compra em cima, com tabelas que se refazem sozinhas do chão.**

Registrada em 2026-07-17, com o usuário, pensando juntos. É a **primeira lei**: as demais decisões de dado se subordinam a ela.

---

## Dois andares, uma regra cada

### Andar 1 — o ESPELHO do PNCP (a fonte). Otimizado para VERDADE.
- **Idêntico**: nome da entidade do PNCP, campo por campo, com `raw jsonb` — o que a API mandou, íntegro.
- **Confiável**: completo (sem filtro de entrada), sincronizado com o log (Inclusão/Retificação/**Exclusão**), nada inventado.
- **Sagrado e imutável por conveniência**: nunca se denormaliza, nunca se descarta, nunca ganha coluna derivada. Pode e deve ter **índices** (não mudam o dado) — para proveniência e para o build das derivadas.
- É o **cofre**. Tabelas: `contratacao/item/resultado/arquivo/ata/contrato/instrumento_cobranca` — o nome é o do PNCP.

### Andar 2 — as DERIVADAS (o serviço). Otimizado para VOAR.
- Construídas **a partir** do espelho, por **script commitado e re-rodável**.
- Livres para denormalizar, materializar, pré-agregar, e ter índices moldados às **telas reais** do produto.
- **Descartáveis e reconstruíveis**: se sumirem, o espelho as reergue. É a **vitrine**.

## A fronteira é sagrada — e ESTRUTURAL, não só mental
- **Derivação NUNCA escreve de volta no espelho.** (Foi por isso que a coluna `entidade` saiu da `arquivos_sc`.)
- Disciplina cede sob prazo. A blindagem é o **lugar** impedir o erro: **schema separado** — `pncp.*` (espelho) vs `app.*`/`d_*` (derivado). O que é lei por design não depende de alguém lembrar.
- Propagação num sentido só: **PNCP → espelho → derivadas.** Nunca ao contrário.

## Por que é a arquitetura certa PARA DADO PÚBLICO
- O PNCP é **registro legal**: fidelidade é **prova**. Todo número mostrado a gestor/auditor tem que rastrear até a fonte exata — o andar 1 torna a **proveniência demonstrável** (diferencial que nenhum concorrente tem).
- O PNCP é um **log** (muda): espelho fiel que absorve o log + derivadas reconstruíveis é o único jeito de continuar certo com o tempo.
- **`raw` é o que faz o andar 2 ser à prova de futuro**: derivada nova que precise de um campo não tipado o acha no `raw`, sem re-baixar. Fidelidade e velocidade se reforçam.

## Invalidação pelo log (mantém a vitrine fresca sem rebuild total)
Quando um evento retifica/exclui algo no espelho, a fatia derivada correspondente é refeita. É o mesmo **evento → flag → preenche a fatia → notifica**: o log não só alimenta o cofre, ele diz **qual pedaço da vitrine refazer**.

## Os dois testes que provam que a lei está sendo cumprida
1. **Consigo dropar TODAS as derivadas e reergue-las só do espelho?** Se não, já vazou (há verdade que só existe na vitrine).
2. **Toda tabela derivada é um script commitado e re-rodável?** Tabela feita à mão que ninguém sabe refazer é passivo, não ativo.

## O risco a vigiar: DRIFT
O perigo não é o princípio — é a erosão. Daqui a meses, sob prazo, volta a tentação de "guardar esse valor calculado no espelho, só desta vez". Contra isso: **estrutura (schema separado) + o teste do dropo-e-reconstruo**, rodado periodicamente.
