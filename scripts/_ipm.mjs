// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _ipm.mjs — acesso ao portal da transparência do ERP IPM (Atende.net), o segundo maior em municípios.
//
// A CADEIA (descoberta na tela, capturando a rede — mesmo método da Betha):
//   1. GET  {slug}.atende.net/transparencia/item/relacao-funcionario-x-salario
//        → o conteúdo real vive num IFRAME cujo src carrega um base64 com {codigo,tipo,grupo}
//   2. POST {embed}/item/atende.php?rot=${embed.rot || 3344}&aca=${embed.aca || 101}&processo=montaTela
//        → devolve o JS da tela, de onde saem os valores CIFRADOS dos filtros (a entidade e a competência
//          não viajam em claro: "+v8B1of97cQ=" é o clicodigo, "vJFDbYLDec8=" é o mês/ano)
//   3. POST {embed}/item/atende.php?...&processo=processaDados&registros=N&pagina=P
//        → os servidores: uninomerazao (nome), cardescricao (CARGO), cncdescricao (LOTAÇÃO),
//          provento / desconto / liquido, odomesano (competência)
//
// Diferença para a Betha: não há diretório nacional de portais — a lista de municípios é montada testando o
// subdomínio. E a série histórica é MUITO maior (vai até 2013, contra só a competência corrente da Betha).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

export const ITEM_FOLHA = "relacao-funcionario-x-salario";

// 🚨 O NOME DO ITEM VARIA POR MUNICÍPIO. Cachoeirinha não tem `relacao-funcionario-x-salario` — tem
// `relacao-matricula-x-cargo-x-salario` e `relacao-funcionario-x-pagamentos`. Procurar um nome só devolvia
// `sem_item`, indistinguível de "o município não publica" ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
// Ordem = da consulta mais completa para a mais estreita.
export const ITENS_FOLHA = [
  "relacao-funcionario-x-salario",
  "relacao-matricula-x-cargo-x-salario",
  "relacao-funcionario-x-pagamentos",
  "funcionario-x-centro-de-custos",
  "funcionario-efetivo",
];

// slug do subdomínio: sem acento, sem espaço, minúsculo ("Balneário Camboriú" → "balneariocamboriu")
export function slugDe(nome) {
  return String(nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/['´`]/g, "").replace(/[^a-z0-9]/g, "");
}

async function tenta(url, opcoes, tentativas = 3) {
  let ultimo;
  for (let t = 0; t < tentativas; t++) {
    try {
      const r = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(90000) });
      if (r.status >= 500) throw new Error("HTTP " + r.status);
      return r;
    } catch (e) { ultimo = e; await new Promise((s) => setTimeout(s, 1500 * (t + 1))); }
  }
  throw ultimo;
}

// Existe portal Atende.net nesse slug? A varredura é de 5.570 municípios, e a home tem ~200 KB — baixar tudo
// seria 1,1 GB à toa. HEAD resolve: o que decide é o DNS existir e o /transparencia responder 200.
export async function achaPortal(slug) {
  try {
    const r = await fetch(`https://${slug}.atende.net/transparencia`, {
      method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    return { slug, titulo: null };
  } catch { return null; }
}

// ⭐ O endereço da consulta é CONSTANTE no produto: o base64 de {codigo:9, tipo:1, grupo:4} vale em qualquer
// município IPM (conferido em Agrolândia e Apiúna). Isso dispensa navegar a SPA — o HTML da página do item não
// serve para nada: é montado 100% por JS e não contém sequer o nome do item.
//
// 🚨 …MAS NÃO VALE EM TODOS. Em Osório o item de folha é **código 27 com `rot=3525`**; o 9 existe, responde e
// devolve ZERO período — indistinguível de "o município não publica" ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
// Por isso `rot`/`aca` viraram campos do embed (default 3344/101) e há um descobridor com navegador que os
// captura por município: `descobre_ipm_rotina.mjs` → tabela `ipm_item_rotina`.
export const CFG_FOLHA = { codigo: "9", tipo: "1", grupo: "4" };

export async function achaEmbed(slug, cfg = CFG_FOLHA, item = null, rot = null, aca = null) {
  const b64 = Buffer.from(JSON.stringify(cfg)).toString("base64");
  const base = `https://${slug}.atende.net/transparencia/item/embed/data/${b64}/item`;
  // tenta cada nome de item conhecido — o primeiro que responder com cara de folha vale
  for (const nome of (item ? [item] : ITENS_FOLHA)) {
    try {
      const r = await tenta(`${base}/${nome}`, { redirect: "follow" }, 2);
      if (!r.ok) continue;
      const html = await r.text();
      if (!/Funcion|Sal[áa]rio|Servidor/i.test(html)) continue;
      return { b64, item: cfg.codigo, grupo: cfg.grupo, tipo: cfg.tipo, base, nomeItem: nome, rot, aca };
    } catch { /* próximo nome */ }
  }
  return null;
}

// monta a tela e extrai os valores cifrados dos filtros (entidade e competência)
export async function filtrosDaTela(embed) {
  const url = `${embed.base}/atende.php?rot=${embed.rot || 3344}&aca=${embed.aca || 101}&ajax=t&processo=montaTela`;
  const corpo = new URLSearchParams({
    chave: JSON.stringify({ item: embed.item, grupo: embed.grupo, tipo: embed.tipo, janelaAutoId: "1" }),
    parametro: JSON.stringify({ item: embed.item, grupo: embed.grupo, tipo: embed.tipo, janelaAutoId: "1" }),
    autoId: "1", portalTransparencia: "true", versaoSistema: "v2",
  });
  const r = await tenta(url, { method: "POST", body: corpo,
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" } });
  const js = await r.text();
  // 🚨 O valor cifrado é base64 e o JS ESCAPA a barra: `"b\/e2\/Fam+J4="`. Um charset `[A-Za-z0-9+/=]` não casa
  // com a contrabarra e devolvia null — e como só falha quando o base64 SORTEIA um `/`, o defeito atingia uns
  // municípios e outros não (12 no RS, todos marcados `sem_filtro`, indistinguíveis de "portal sem a tela").
  // Aqui o valor é o último argumento string do construtor; desescapar `\/` depois de capturar.
  const pega = (campo) => {
    const re = new RegExp(`new CampoForm\\("lista","${campo.replace(/\./g, "\\.")}"[^)]*?"([^"]{6,})"\\)`);
    const v = (js.match(re) || [])[1];
    return v ? v.replace(/\\\//g, "/") : null;
  };
  // o próprio pega() escapa o ponto — passar "PeriodoFolha\\.odoMesAno" aqui gerava escape DUPLO e devolvia null,
  // e sem competência o POST de dados responde HTTP 500 (o filtro é obrigatório, como na Betha)
  // ⭐ Os FILTROS e as COLUNAS mudam de item para item: o item 9 pede `filtroIgnoraPrevidencia/filtroExibe13/
  // somarFeriasBruto/afastamento/uninomerazao`; o 27 pede `filtroVerbasIgnoradas/filtroFolhas` e entrega
  // `brutomensal/brutoferias/brutorescisao/brutodecimo/brutototal/liquidototal`. Mandar a lista do 9 num portal
  // do 27 devolve **HTTP 500 de corpo vazio** — o mesmo sintoma que eu vinha lendo como "defeito do portal".
  // Extrair da própria tela, na ordem em que ela declara.
  const campos = [...new Map([...js.matchAll(/new CampoForm\("([a-z_]+)","([^"]+)"/g)]
    .map((m) => [m[2], { nome: m[2], tipo: m[1] }])).values()];
  const colunas = [...new Set([...js.matchAll(/new CampoConsulta\("([^"]+)"/g)].map((m) => m[1]))];
  return { entidade: pega("clicodigo"), competencia: pega("PeriodoFolha.odoMesAno"), bruto: js, campos, colunas };
}

// ⭐⭐ A TELA TRAZ TODAS AS ENTIDADES, não só a primeira. Logo depois do `new CampoForm("lista","clicodigo",…)` vem
// `…["clicodigo"].oCampo.setLista([{codigo,descricao},…])` com Município + autarquias + fundos + câmara.
// 🚨 Usar só o valor pré-selecionado (o que o coletor fazia até 15/ago/2026) coleta SÓ a prefeitura: Apucarana
// devolvia 1.662 servidores contra 5.122 da RAIS, porque Educação e Saúde são autarquias separadas lá. O sintoma
// era "município subcoletado" e a causa era filtro — ver [[pnigp-conferidor-rais-denominador-folha]].
export function entidadesDaTela(js) {
  if (!js) return [];
  const i = js.indexOf(`["clicodigo"].oCampo.setLista(`);
  if (i < 0) return [];
  const ini = js.indexOf("[", i + 20);
  const fim = js.indexOf("]);", ini);
  if (ini < 0 || fim < 0) return [];
  try {
    const arr = JSON.parse(js.slice(ini, fim + 1).replace(/\\\//g, "/"));
    return arr.filter((x) => x?.codigo).map((x) => ({ codigo: x.codigo, descricao: String(x.descricao || "").trim() }));
  } catch { return []; }
}

// ⭐⭐ OS PERÍODOS PODEM VIR NA PRÓPRIA TELA. Em Osório o `<select PeriodoFolha.odoMesAno>` já chega com **127
// opções** (07/2026 … 2015), enquanto o AJAX `buscaPeriodosDisponiveisEntidade` devolve `[]` — e o coletor
// concluía "o município não publica período nenhum". Era o inverso: publica 127.
// A ordem certa é ler a TELA primeiro e só chamar o AJAX se ela vier vazia
// ([[pnigp-coletor-ok-sem-dado-sete-causas]]: o mesmo dado tem mais de um caminho, e o silêncio de um não prova
// a ausência do outro).
export function periodosDaTela(js) {
  if (!js) return [];
  const i = js.indexOf(`["PeriodoFolha.odoMesAno"].oCampo.setLista(`);
  if (i < 0) return [];
  const ini = js.indexOf("[", i + 30);
  const fim = js.indexOf("]);", ini);
  if (ini < 0 || fim < 0) return [];
  try {
    const arr = JSON.parse(js.slice(ini, fim + 1).replace(/\\\//g, "/"));
    const chave = (d) => { const m = /(\d{2})\/(\d{4})/.exec(d?.descricao || ""); return m ? +(m[2] + m[1]) : 0; };
    return arr.filter((x) => x?.codigo).sort((a, b) => chave(b) - chave(a));
  } catch { return []; }
}

// ⭐ Em parte dos municípios a tela NÃO traz competência pré-selecionada (`"valor":null`): a lista de períodos é
// carregada por AJAX depois de escolher a entidade (`onChangeEntidadePortalTransparencia` →
// `buscaPeriodosDisponiveisEntidade`). Sem isto o coletor marcava `sem_filtro` e o município parecia não publicar.
// Devolve [{codigo (valor cifrado), descricao ("07/2026")}], do mais recente para o mais antigo.
export async function periodosDaEntidade(embed, entidade) {
  const url = `${embed.base}/atende.php?rot=${embed.rot || 3344}&aca=${embed.aca || 101}&ajax=t&processo=buscaPeriodosDisponiveisEntidade`;
  const corpo = new URLSearchParams({
    chave: JSON.stringify({ item: embed.item, grupo: embed.grupo, tipo: embed.tipo, janelaAutoId: "1" }),
    parametro: JSON.stringify({ entidade, grupo: embed.grupo, item: embed.item, tipo: embed.tipo, chaveInt: false }),
    autoId: "1", portalTransparencia: "true", versaoSistema: "v2",
  });
  const r = await tenta(url, { method: "POST", body: corpo,
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" } });
  const txt = await r.text();
  let j;
  try { j = JSON.parse(txt); } catch { return []; }
  const lista = Array.isArray(j) ? j : (j?.dados || j?.retorno || []);
  // ordena por MM/AAAA — não confiar na ordem devolvida
  const chave = (d) => { const m = /(\d{2})\/(\d{4})/.exec(d?.descricao || ""); return m ? +(m[2] + m[1]) : 0; };
  return lista.filter((x) => x?.codigo).sort((a, b) => chave(b) - chave(a));
}

// uma página de servidores. `tela` (o retorno de filtrosDaTela) é opcional: quando vem, os filtros e as colunas
// saem DELA — é o que faz o coletor funcionar em itens fora do molde 9/3344.
export async function paginaServidores(embed, filtros, pagina, registros = 500, tela = null) {
  // ⚠️ O backend espera a LISTA INTEIRA de filtros da consulta, na ordem do formulário — mandar só os três que
  // importam devolve HTTP 500. É o mesmo tipo de armadilha do `sortBy=null` da Betha: copiar a requisição do app
  // inteira e só então simplificar, um item por vez.
  const daTela = tela?.campos?.length ? tela.campos.map((c) => {
    const base = { filtroCampo: c.nome, filtroTipo: c.tipo === "texto" ? "C" : (c.tipo === "lista_multipla" ? "IN" : "="),
      filtroValor: "", filtroValor02: "", filtroTipoCampo: c.tipo, filtroPodeSalvar: "true",
      filtroEncoded: c.tipo === "lista" };
    if (c.nome === "clicodigo") return { ...base, filtroValor: filtros.entidade, filtroPodeSalvar: "false" };
    if (c.nome === "PeriodoFolha.odoMesAno") return { ...base, filtroValor: filtros.competencia, filtroPodeSalvar: "false" };
    if (c.nome === "somarFeriasBruto") return { ...base, filtroValor: "on" };
    return base;
  }) : null;
  const filtrosConsulta = daTela || [
    { filtroCampo: "clicodigo", filtroTipo: "=", filtroValor: filtros.entidade, filtroValor02: "",
      filtroTipoCampo: "lista", filtroPodeSalvar: "false", filtroEncoded: true },
    { filtroCampo: "PeriodoFolha.odoMesAno", filtroTipo: "=", filtroValor: filtros.competencia, filtroValor02: "",
      filtroTipoCampo: "lista", filtroPodeSalvar: "false", filtroEncoded: true },
    { filtroCampo: "filtroIgnoraPrevidencia", filtroTipo: "=", filtroValor: "", filtroValor02: "",
      filtroTipoCampo: "booleano", filtroPodeSalvar: "true", filtroEncoded: false },
    { filtroCampo: "filtroExibe13", filtroTipo: "=", filtroValor: "", filtroValor02: "",
      filtroTipoCampo: "booleano", filtroPodeSalvar: "true", filtroEncoded: false },
    { filtroCampo: "somarFeriasBruto", filtroTipo: "=", filtroValor: "on", filtroValor02: "",
      filtroTipoCampo: "booleano", filtroPodeSalvar: "true", filtroEncoded: false },
    { filtroCampo: "afastamento", filtroTipo: "IN", filtroValor: "", filtroValor02: "",
      filtroTipoCampo: "lista_multipla", filtroPodeSalvar: "true", filtroEncoded: false },
    { filtroCampo: "uninomerazao", filtroTipo: "C", filtroValor: "", filtroValor02: "", filtroTipoCampo: "texto" },
  ];
  const parametro = {
    item: embed.item, grupo: embed.grupo, tipo: embed.tipo, janelaAutoId: "1",
    selecionar: false, selecionar_multipla: false, permiteAcaoSelecionar: false,
    __identificadores: [], __filtros_consulta_padrao: filtrosConsulta,
    __order_consulta_padrao: [{ order: "fcncodigo", orderT: "asc", tipo: 1 }],
    nome_consulta: "consulta_padrao",
    campos_consulta: (tela?.colunas?.length ? tela.colunas
      : ["clicodigo", "odomesano", "fcncodigo", "funcontrato", "uninomerazao", "cardescricao",
         "cncdescricao", "afastamento", "rescisao", "ferias", "decimo", "provento", "desconto", "liquido",
         "desctetoconstitucional", "PeriodoFolha.odoMesAno", "PeriodoFolha.odoSituacao"]),
    dados_agrupador: [],
  };
  const url = `${embed.base}/atende.php?rot=${embed.rot || 3344}&aca=${embed.aca || 101}&ajax=t&processo=processaDados` +
    `&registros=${registros}&pagina=${pagina}&selecionar=false&contaRegistros=true&totalizaRegistros=false&nivelArvore=null`;
  const corpo = new URLSearchParams({
    chave: JSON.stringify({ item: embed.item, grupo: embed.grupo, tipo: embed.tipo, janelaAutoId: "1",
      selecionar: false, selecionar_multipla: false, permiteAcaoSelecionar: false }),
    caller: "null", parametro: JSON.stringify(parametro), autoId: "1", monitor: "0", flush: "0",
    versaoSistema: "v2", portalTransparencia: "true",
  });
  const r = await tenta(url, { method: "POST", body: corpo,
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" } });
  const txt = await r.text();
  let j;
  try { j = JSON.parse(txt); } catch { return { linhas: [], total: 0, erro: txt.slice(0, 120) }; }
  // 🚨 `dados` NEM SEMPRE É ARRAY: em telas que não são a folha (ex.: `plano-de-cargos-e-salarios`, código 2 /
  // rot 3200) ele vem como OBJETO e o `.map` estourava com "is not a function" — o município fechava `erro`,
  // que parece portal fora do ar e é payload de outro formato (16/ago/2026, reprocessamento do RS).
  const cru = Array.isArray(j.dados) ? j.dados
    : (Array.isArray(j.dados?.linhas) ? j.dados.linhas : (Array.isArray(j.registros) ? j.registros : []));
  const linhas = cru.map((d) => d?.valor ?? d).filter(Boolean);
  return { linhas, total: j.totalRegistros ?? j.total ?? linhas.length, cru: j };
}
