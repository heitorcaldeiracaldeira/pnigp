// VERSÃO DO INGEST DA API — o estado de "já busquei" vive em itens_proc_feitos.versao.
//
// COMO USAR: mudou O QUE se extrai da API (campo novo, entidade nova, correção de mapeamento), SOBE o número.
// Todo processo vira pendente sozinho no próximo ciclo. Sem limpar marcador na mão, sem lembrar de nada.
//
// 🔴 POR QUE EXISTE (2026-07-15, a armadilha que me pegou TRÊS vezes no mesmo dia):
//   1. atas: `marca_ata_feitas` por processo, compartilhado → reclassificar layout não reprocessava
//      (315 atas "feitas", 1 item extraído);
//   2. atas: melhorar um parser não reprocessava nada — só valia p/ documento novo;
//   3. **itens**: corrigi o `r[0]` (só o 1º resultado do item entrava; ~8% descartados), escrevi o INSERT em
//      `item_resultado_sc`… e a tabela ficou com **ZERO linhas**. Os 241.302 processos já estavam marcados feitos
//      e o ingest pulou todos. Código certo, dado velho — e eu relatando "corrigido".
//
// A lição: marcador booleano de "feito" registra que EU RODEI, não que o dado está CERTO. Versão registra
// COM QUAL CÓDIGO — e é a diferença entre um conserto que acontece e um que só existe no commit.
//
// HISTÓRICO:
//   1 = original (só o 1º resultado do item; 8 campos do item)
//   2 = TODOS os resultados por item (item_resultado_sc populada) — o conserto do `r[0]` finalmente valendo no dado
//   3 = OS 36 CAMPOS do item (antes 8): tipo_beneficio_id (EXCLUSIVO ME/EPP x UNIVERSAL — antes indistinguíveis),
//       criterio_julgamento_id, orcamento_sigiloso, informacao_complementar + 24. Ver campos_item_pncp.mjs.
export const INGEST_VERSAO = 3;
