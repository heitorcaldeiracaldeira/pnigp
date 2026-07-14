# Relato de experiência — Claude Code (para a Anthropic)

**Produto:** Claude Code (modelo Claude Opus)
**Período:** aproximadamente 30 dias
**Contexto:** desenvolvimento de uma plataforma de inteligência de compras públicas, integrando a API do PNCP
(Portal Nacional de Contratações Públicas) do governo brasileiro.
**Natureza do relato:** pedido de **ajuda para corrigir falhas recorrentes de método** do assistente, que geraram
retrabalho e consumo elevado de créditos. Objetivo: fazer o projeto andar de forma confiável — não apenas reclamar.

---

## Resumo

Ao longo de ~30 dias, o assistente repetiu, em sessões diferentes, os mesmos erros de método, o que gerou retrabalho
extenso, alto consumo de créditos e atraso de entrega. Os problemas não foram de falta de informação da minha parte —
forneci a direção técnica, o conhecimento de domínio e as correções; o assistente não os reteve nem os aplicou de
forma consistente.

## Problemas recorrentes observados

1. **Conclusões precipitadas de "o dado/endpoint não existe".** Diversas vezes o assistente afirmou que uma API ou
   um dado não existia; ao investigar (muitas vezes por minha insistência), o dado existia. Isso se repetiu ao longo
   do projeto e me obrigou a "caçar" as fontes que ele deveria ter encontrado.

2. **Não retenção de aprendizado entre sessões.** Regras e decisões de arquitetura que já haviam sido definidas eram
   reabertas do zero em sessões seguintes, me forçando a re-ensinar repetidamente os mesmos princípios (por exemplo:
   espelhar a estrutura do PNCP; a marca/modelo está nos documentos/atas, não em campo de API).

3. **Reinvenção de arquitetura.** A cada rodada surgia uma estrutura de dados nova, em vez de manter e evoluir a que
   já havia sido acordada — o que fazia o projeto "voltar ao ponto inicial".

4. **Excesso de churn operacional.** Processos em segundo plano foram parados e reiniciados repetidamente para testes
   e mudanças de abordagem, consumindo tempo e créditos sem avanço proporcional.

5. **Padrões de implementação ineficientes que eu precisei diagnosticar.** Exemplo concreto: gravação no banco de
   dados com uma requisição por item (em vez de em lote), sobrecarregando o banco (Neon) e derrubando conexões — a
   causa e a correção partiram de mim, não do assistente.

## Impacto

- Retrabalho recorrente sobre os mesmos pontos por semanas.
- Consumo elevado de créditos (pago em dólar) desproporcional ao avanço.
- Atraso de entrega a prazos internos (diretoria).
- Desgaste — sensação de "loop", com direção correta sendo redescoberta a cada sessão.

## O que solicito

1. **Revisão do consumo de créditos** do período, considerando a parcela atribuível a retrabalho evitável.
2. **Encaminhamento como feedback de produto**, especialmente sobre: (a) retenção/consistência de contexto e decisões
   entre sessões; (b) tendência a concluir "não existe" sem investigação adequada; (c) estabilidade de tarefas longas
   em segundo plano.

## Observação de justiça

Parte do trabalho entregue é sólido (mapeamento completo dos processos, arquitetura espelhando o PNCP, base de preços).
O relato não nega o resultado — aponta que o **custo e o tempo para chegar a ele foram muito maiores do que deveriam**,
por falhas de método do assistente.

---

*Sugestão de envio: comando `/bug` dentro do Claude Code (anexa o contexto da sessão) e/ou support.anthropic.com para a
questão de créditos/billing.*
