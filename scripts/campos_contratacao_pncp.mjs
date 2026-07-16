// MAPA DECLARATIVO DOS 45 CAMPOS DA CONTRATAÇÃO — origem = destino. TODOS. Nenhum descartado.
//
// POR QUE ASSIM: catar campo a campo às 4h da manhã é como eu erro. Um INSERT com 45 parâmetros posicionais é
// pior: trocar dois de posição não dá erro de sintaxe, dá dado errado e SILENCIOSO. Aqui coluna e campo da API
// ficam colados e o SQL é gerado. Campo novo = 1 linha. Mesmo padrão de campos_item_pncp.mjs.
//
// MEDIDO 2026-07-16: a API entrega **45 campos achatados**; guardávamos ~2/3. Entre os descartados estava o
// `linkSistemaOrigem` — o campo que diz ONDE O PROCESSO REALMENTE MORA:
//   https://portaldecompraspublicas.com.br/processos/SC/Prefeitura-Municipal-de-Entre-Rios-1489/PE-26-2024-2024-327854
// Caso Entre Rios 2024/34: o município publicou UM arquivo no PNCP (o DFD, classificado como "Edital"); o TR e o
// edital de verdade nunca foram publicados (o /historico prova: 2 eventos, nenhuma exclusão). Mas o link estava lá.
// Responde a pergunta do usuário ("por que eu acho sozinho nos portais?"): o PNCP DÁ o endereço; nós não líamos.
//
// ⚠️ ARMADILHAS MEDIDAS (nenhuma está no manual):
//   · `tamanhoPagina` tem MÍNIMO 10 — pedir 1 devolve HTTP 400 "must be greater than or equal to 10"
//   · janela de data larga em /publicacao devolve 400
//   · `/v1/orgaos/{cnpj}/compras/{ano}/{seq}` MUDOU: agora é /api/consulta, não /api/pncp (301 com a URL nova)
//   · `esferaId` vem 'F' p/ ente FEDERAL dentro do filtro uf=SC (ex.: UFFS/Chapecó). Ver [[feedback-estado-municipio-separados]]

const n = (x) => (x == null || x === "" ? null : (Number(x) || 0));
const b = (x) => (x == null ? null : x === true);
const s = (x, max) => { const v = String(x ?? "").trim(); return v ? v.slice(0, max) : null; };
const dt = (x) => (x ? String(x).slice(0, 19) : null);

/** [coluna no Postgres, tipo SQL, (contratação da API) => valor] */
export const CAMPOS_CONTRATACAO = [
  // ── identidade
  ["numero_controle_pncp",   "text",        (o) => s(o.numeroControlePNCP, 60)],
  ["cnpj",                   "text",        (o) => s(o.orgaoEntidade?.cnpj, 14)],
  ["ano",                    "int",         (o) => n(o.anoCompra)],
  ["seq",                    "int",         (o) => n(o.sequencialCompra)],
  ["numero_compra",          "text",        (o) => s(o.numeroCompra, 50)],   // nº na PREFEITURA (≠ do seq do PNCP)
  ["processo",               "text",        (o) => s(o.processo, 50)],
  // ── objeto
  ["objeto",                 "text",        (o) => s(o.objetoCompra, 5120)],
  ["informacao_complementar","text",        (o) => s(o.informacaoComplementar, 5120)],
  // ── enquadramento (§5.1 a §5.5)
  ["modalidade_id",          "int",         (o) => n(o.modalidadeId)],
  ["modalidade",             "text",        (o) => s(o.modalidadeNome, 60)],
  ["modo_disputa_id",        "int",         (o) => n(o.modoDisputaId)],
  ["modo_disputa",           "text",        (o) => s(o.modoDisputaNome, 40)],
  ["instrumento_id",         "int",         (o) => n(o.tipoInstrumentoConvocatorioId)],   // 3 = não existe edital
  ["instrumento",            "text",        (o) => s(o.tipoInstrumentoConvocatorioNome, 60)],
  ["situacao_id",            "int",         (o) => n(o.situacaoCompraId)],
  ["situacao",               "text",        (o) => s(o.situacaoCompraNome, 40)],
  ["srp",                    "bool",        (o) => b(o.srp)],
  ["amparo_legal_codigo",    "int",         (o) => n(o.amparoLegal?.codigo)],
  ["amparo_legal",           "text",        (o) => s(o.amparoLegal?.nome, 160)],
  ["amparo_legal_descricao", "text",        (o) => s(o.amparoLegal?.descricao, 500)],
  // ── valores
  ["valor_estimado",         "numeric",     (o) => n(o.valorTotalEstimado)],   // 0 se orçamento sigiloso s/ resultado
  ["valor_homologado",       "numeric",     (o) => n(o.valorTotalHomologado)],
  // ── 🔑 ONDE O PROCESSO MORA
  ["link_sistema_origem",    "text",        (o) => s(o.linkSistemaOrigem, 500)],
  ["justificativa_presencial","text",       (o) => s(o.justificativaPresencial, 1000)],   // art. 17 §2º: presencial exige motivo
  // ── datas
  ["data_publicacao",        "timestamptz", (o) => dt(o.dataPublicacaoPncp)],
  ["data_inclusao",          "timestamptz", (o) => dt(o.dataInclusao)],
  ["data_atualizacao",       "timestamptz", (o) => dt(o.dataAtualizacao)],     // a chave da coleta incremental
  ["data_abertura",          "timestamptz", (o) => dt(o.dataAberturaProposta)],
  ["data_encerramento",      "timestamptz", (o) => dt(o.dataEncerramentoProposta)],
  // ── órgão (quem compra)
  ["orgao_razao_social",     "text",        (o) => s(o.orgaoEntidade?.razaoSocial, 160)],
  ["poder_id",               "text",        (o) => s(o.orgaoEntidade?.poderId, 1)],       // E/L/J
  ["esfera",                 "text",        (o) => s(o.orgaoEntidade?.esferaId, 1)],      // F/E/M/D — 'F' vaza no filtro uf=SC
  // ── unidade (ONDE é o município — a API DÁ; deduzir por CNPJ errava 4,2%)
  ["cod_ibge",               "text",        (o) => s(o.unidadeOrgao?.codigoIbge, 7)],
  ["municipio_nome",         "text",        (o) => s(o.unidadeOrgao?.municipioNome, 80)],
  ["unidade_codigo",         "text",        (o) => s(o.unidadeOrgao?.codigoUnidade, 20)],
  ["unidade_nome",           "text",        (o) => s(o.unidadeOrgao?.nomeUnidade, 160)],
  ["uf",                     "text",        (o) => s(o.unidadeOrgao?.ufSigla, 2)],
  ["uf_nome",                "text",        (o) => s(o.unidadeOrgao?.ufNome, 40)],
  // ── órgão sub-rogado (quando outro órgão assume o processo — era 100% descartado)
  ["subrogado_cnpj",         "text",        (o) => s(o.orgaoSubRogado?.cnpj, 14)],
  ["subrogado_razao_social", "text",        (o) => s(o.orgaoSubRogado?.razaoSocial, 160)],
  ["subrogado_poder_id",     "text",        (o) => s(o.orgaoSubRogado?.poderId, 1)],
  ["subrogado_esfera",       "text",        (o) => s(o.orgaoSubRogado?.esferaId, 1)],
  ["subrogada_cod_ibge",     "text",        (o) => s(o.unidadeSubRogada?.codigoIbge, 7)],
  ["subrogada_municipio",    "text",        (o) => s(o.unidadeSubRogada?.municipioNome, 80)],
  ["subrogada_unidade_codigo","text",       (o) => s(o.unidadeSubRogada?.codigoUnidade, 20)],
  ["subrogada_unidade_nome", "text",        (o) => s(o.unidadeSubRogada?.nomeUnidade, 160)],
  ["subrogada_uf",           "text",        (o) => s(o.unidadeSubRogada?.ufSigla, 2)],
  // ── quem publicou (o ERP do município — NÃO é quem rodou a sessão)
  ["plataforma",             "text",        (o) => s(o.usuarioNome, 120)],
  ["emenda_parlamentar",     "bool",        (o) => b(o.emendaParlamentar)],
];

export const DDL_CONTRATACAO = CAMPOS_CONTRATACAO.map(([c, t]) => `ADD COLUMN IF NOT EXISTS ${c} ${t}`).join(", ");

// ─── TESTE ────────────────────────────────────────────────────────────────────────────────────────────────────
// Chama a API DE VERDADE e conta o que ainda escapa. Sem gabarito inventado por mim.
if (process.argv[1] && process.argv[1].endsWith("campos_contratacao_pncp.mjs")) {
  const u = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=20260713&dataFinal=20260714&codigoModalidadeContratacao=6&uf=SC&pagina=1&tamanhoPagina=10";
  const r = await fetch(u, { headers: { accept: "*/*" } });
  if (r.status !== 200) { console.log(`HTTP ${r.status} — não deu p/ testar`); process.exit(1); }
  const o = (await r.json())?.data?.[0];
  if (!o) { console.log("0 registros na janela"); process.exit(1); }
  const flat = (x, p = "") => Object.entries(x).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? flat(v, `${p}${k}.`) : [[p + k, v]]);
  const daApi = flat(o).map(([k]) => k);
  // o que o mapa LÊ (extrai o caminho de dentro de cada função)
  const lidos = new Set();
  for (const [, , fn] of CAMPOS_CONTRATACAO)
    for (const m of String(fn).matchAll(/o\.(\w+)(?:\?\.(\w+))?/g)) lidos.add(m[2] ? `${m[1]}.${m[2]}` : m[1]);
  const escapa = daApi.filter((k) => !lidos.has(k));
  console.log(`API entrega:      ${daApi.length} campos`);
  console.log(`o mapa lê:        ${lidos.size}`);
  console.log(`colunas geradas:  ${CAMPOS_CONTRATACAO.length}`);
  console.log(escapa.length ? `\n❌ AINDA ESCAPA (${escapa.length}):\n   ${escapa.join("\n   ")}` : `\n✅ NENHUM campo escapa`);
  if (escapa.length) process.exit(1);
}
