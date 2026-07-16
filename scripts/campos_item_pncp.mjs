// MAPA DECLARATIVO DOS 36 CAMPOS DO ITEM DO PNCP — origem = destino (a lei do projeto: espelhar, não inventar).
//
// POR QUE ASSIM: um INSERT com 40 parâmetros posicionais é onde eu erraria — trocar dois `unnest` de posição não dá
// erro de sintaxe, dá dado errado e silencioso. Aqui o par (coluna, campo da API) fica lado a lado e o SQL é gerado.
// Adicionar campo = 1 linha aqui. Ver [[docs/arquitetura-pncp.md]] e o Manual das APIs de Consultas.
//
// MEDIDO 2026-07-15 (amostra real de 8 plataformas): a API entrega 36 campos por item e o ingest guardava 8.
// Os 28 descartados incluíam os que MUDAM A LEITURA do dado:
//   · tipoBeneficio        — item EXCLUSIVO p/ ME/EPP (1) × UNIVERSAL (4). O código antigo gravava só o NOME e
//                            jogava fora o que não era benefício → "Sem benefício"(4) e "Não se aplica"(5) viravam
//                            os dois NULL, indistinguíveis. É justo a distinção que o produto precisa fazer.
//   · criterioJulgamento   — "Menor preço" × "Maior desconto" × "Técnica e preço". Num pregão de MAIOR DESCONTO,
//                            comparar valor unitário contra o estimado NÃO significa a mesma coisa.
//   · orcamentoSigiloso    — manual §6.3 campo 17: estimado vem ZERO se sigiloso e sem resultado. Sem esta trava,
//                            o cálculo de disputa (estimado × arrematado) mente.
//   · informacaoComplementar — texto descritivo extra; munição p/ o casamento CATMAT (gargalo em 14,9%).
// catalogoCodigoItem vem VAZIO em ~todas as plataformas (medido: 1 de 16) — guardar mesmo assim; é do PNCP.

const n = (x) => (x == null || x === "" ? null : (Number(x) || 0));
const b = (x) => (x == null ? null : x === true);
const s = (x, max) => { const v = String(x ?? "").trim(); return v ? v.slice(0, max) : null; };
const dt = (x) => (x ? String(x).slice(0, 19) : null);

/** [coluna no Postgres, tipo SQL, (item da API) => valor] */
export const CAMPOS_ITEM = [
  // ── identidade e descrição
  ["numero",                    "int",         (it, i) => Number(it.numeroItem) || i + 1],
  ["descricao",                 "text",        (it) => s(it.descricao, 2048)],
  ["informacao_complementar",   "text",        (it) => s(it.informacaoComplementar, 2048)],
  ["unidade",                   "text",        (it) => s(it.unidadeMedida, 60)],
  ["quantidade",                "numeric",     (it) => n(it.quantidade)],
  // ── preços (os DOIS: estimado = o que orçou; homologado vem de /resultados, preenchido fora daqui)
  ["unit_estimado",             "numeric",     (it) => n(it.valorUnitarioEstimado)],
  ["valor_total",               "numeric",     (it) => n(it.valorTotal)],
  ["orcamento_sigiloso",        "bool",        (it) => b(it.orcamentoSigiloso)],
  // ── situação (§5.6: 2=Homologado=tem resultado; 4=Deserto; 5=Fracassado — estes NUNCA terão marca)
  ["situacao",                  "text",        (it) => s(it.situacaoCompraItemNome, 60)],
  ["situacao_id",               "int",         (it) => n(it.situacaoCompraItem)],
  ["tem_resultado",             "bool",        (it) => b(it.temResultado)],
  // ── BENEFÍCIO: exclusivo ME/EPP × universal (§5.7). GUARDAR O ID — o nome sozinho perde a distinção.
  ["tipo_beneficio_id",         "int",         (it) => n(it.tipoBeneficio)],
  ["tipo_beneficio_nome",       "text",        (it) => s(it.tipoBeneficioNome, 80)],
  // ── CRITÉRIO DE JULGAMENTO (§5.4): muda o significado do preço
  ["criterio_julgamento_id",    "int",         (it) => n(it.criterioJulgamentoId)],
  ["criterio_julgamento_nome",  "text",        (it) => s(it.criterioJulgamentoNome, 80)],
  // ── classificação / catálogo
  ["tipo",                      "text",        (it) => s(it.materialOuServicoNome, 20)],
  ["material_ou_servico",       "text",        (it) => s(it.materialOuServico, 2)],
  ["item_categoria_id",         "int",         (it) => n(it.itemCategoriaId)],
  ["item_categoria_nome",       "text",        (it) => s(it.itemCategoriaNome, 80)],
  ["catalogo_id",               "int",         (it) => n(it.catalogo?.id)],
  ["catalogo_nome",             "text",        (it) => s(it.catalogo?.nome, 80)],
  ["catmat",                    "text",        (it) => s(it.catalogoCodigoItem, 40)],   // vazio em ~todas (medido 1/16)
  ["categoria_catalogo_id",     "int",         (it) => n(it.categoriaItemCatalogo?.id)],
  ["categoria_catalogo_nome",   "text",        (it) => s(it.categoriaItemCatalogo?.nome, 80)],
  ["ncm",                       "text",        (it) => s(it.ncmNbsCodigo, 20)],
  ["ncm_descricao",             "text",        (it) => s(it.ncmNbsDescricao, 240)],
  // ── margem de preferência / conteúdo nacional
  ["margem_pref_normal",        "bool",        (it) => b(it.aplicabilidadeMargemPreferenciaNormal)],
  ["margem_pref_adicional",     "bool",        (it) => b(it.aplicabilidadeMargemPreferenciaAdicional)],
  ["margem_pref_normal_pct",    "numeric",     (it) => n(it.percentualMargemPreferenciaNormal)],
  ["margem_pref_adicional_pct", "numeric",     (it) => n(it.percentualMargemPreferenciaAdicional)],
  ["tipo_margem_preferencia",   "text",        (it) => s(it.tipoMargemPreferencia, 80)],
  ["exigencia_conteudo_nacional", "bool",      (it) => b(it.exigenciaConteudoNacional)],
  ["incentivo_produtivo_basico",  "bool",      (it) => b(it.incentivoProdutivoBasico)],
  // ── outros
  ["patrimonio",                "text",        (it) => s(it.patrimonio, 80)],
  ["registro_imobiliario",      "text",        (it) => s(it.codigoRegistroImobiliario, 80)],
  ["imagem",                    "int",         (it) => n(it.imagem)],
  ["data_inclusao",             "timestamptz", (it) => dt(it.dataInclusao)],
  ["data_atualizacao",          "timestamptz", (it) => dt(it.dataAtualizacao)],
];

/** DDL das colunas (ADD COLUMN IF NOT EXISTS — não destrói nada) */
export const DDL_ITEM = CAMPOS_ITEM.map(([c, t]) => `ADD COLUMN IF NOT EXISTS ${c} ${t}`).join(", ");
