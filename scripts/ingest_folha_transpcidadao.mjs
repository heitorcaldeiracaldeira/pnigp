// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_transpcidadao.mjs — folha nominal do "Transparência Cidadão" (transparenciacidadao.com.br),
// portal JSF/PrimeFaces do consórcio dos MUNICÍPIOS DA MÉDIA SOROCABANA (SP).
//
// ⭐ POR QUE VALE: era o MAIOR bolo acionável de São Paulo — 14 municípios "com dados" e sem produto
// identificado ([[pnigp-cruzar-tabelas-de-descoberta]]). A enumeração achou 22 PREFEITURAS, não 14.
// Entrega os CINCO campos de [[pnigp-folha-municipal-cinco-campos]], mas repartidos em DOIS lugares:
//   • a LINHA da tabela → matrícula · nome · admissão · tipo de contrato · vínculo · FUNÇÃO
//   • o diálogo "Detalhes" → SEÇÃO (=secretaria) · salário base · proventos · líquido
// Um host só serve todos, separados por `?idCidade=N`. Sem login e sem captcha.
//
// 🚨🚨 A ARMADILHA CENTRAL — o "Detalhes" só responde por linha RENDERIZADA NA PÁGINA ATUAL.
// O id do botão carrega o índice GLOBAL (`tblColaboradores:440:j_idt139`), o que convida a pedir qualquer
// índice direto. Testado: pedindo o índice 5 e o 300 fora da página corrente, o servidor devolve HTTP 200 com
// o conteúdo do ÚLTIMO servidor consultado — mesma seção, mesmo salário, para todo mundo. Não é erro, é 200.
// Quem confiar grava a folha inteira com um único salário. É a família de [[pnigp-coletor-ok-sem-dado-sete-causas]].
// Por isso a coleta é ESTRITAMENTE sequencial: pagina 20 → pede os 20 detalhes daquela página → próxima.
//
// 🚨 `_rows` diferente de 20 devolve `IllegalArgumentException` (a datatable não tem rowsPerPageTemplate).
// Não há como pedir a folha inteira de uma vez; 20 por página é teto do servidor, não escolha minha.
//
// 🚨 O `idCidade` do diagnóstico pode apontar para a CÂMARA. `folha_diagnostico_faltante` guardava
// idCidade=37 para "Campos Novos Paulista" — 37 é a Câmara; a Prefeitura é a 64. Coletar pela URL do
// diagnóstico atribuiria a folha do legislativo ao executivo ([[pnigp-entidade-espelho-infla-folha]]).
// Por isso este coletor ENUMERA os idCidade e lê o cabeçalho da página para decidir prefeitura × câmara,
// em vez de confiar na URL herdada.
//
// Uso: node scripts/ingest_folha_transpcidadao.mjs   ·  SO=Arandu um município  ·  ENUM=1 só re-enumera
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const SO_ENUM = process.env.ENUM === "1";
const BASE = "https://transparenciacidadao.com.br/faces/paginas";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const ID_TABELA = "formRh:tabViewEmpenhos:tblColaboradores";
const POR_PAGINA = 20;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

await q(`create table if not exists folha_servidores_transpcidadao (
  cod_ibge text, municipio text, uf text, id_cidade int, entidade text, competencia text,
  matricula text, nome text, cargo text, secretaria text, vinculo text, tipo_contrato text,
  tipo_folha text, salario_base numeric, salario numeric, liquido numeric,
  carga_horaria text, referencia text, data_admissao text, data_demissao text,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_tcid_mun on folha_servidores_transpcidadao (cod_ibge, competencia)`);
await q(`create table if not exists folha_transpcidadao_coleta (
  cod_ibge text primary key, municipio text, uf text, id_cidade int, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);
await q(`create table if not exists transpcidadao_portal (
  id_cidade int primary key, rotulo text, tipo text, municipio text, cod_ibge text, uf text,
  em timestamptz default now())`);

// ── utilidades ────────────────────────────────────────────────────────────────────────────────────────────────
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const slugDe = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const desHtml = (s) => String(s ?? "")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
// "R$ 3.242,00" → 3242.00 · vazio → null (NUNCA 0: Number("") = 0 já apagou salário em outro coletor)
const dinheiro = (v) => {
  const s = String(v ?? "").replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!s || !/\d/.test(s)) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// ── sessão HTTP com cookie (o JSF guarda o estado da consulta na jsessionid) ───────────────────────────────────
function novaSessao() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const guarda = (r) => {
    for (const c of (r.headers.getSetCookie?.() || [])) {
      const [par] = c.split(";");
      const i = par.indexOf("=");
      if (i > 0) jar.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
  };
  return {
    async get(url) {
      const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie() },
        redirect: "follow", signal: AbortSignal.timeout(60000) });
      guarda(r);
      return { status: r.status, texto: await r.text(), url: r.url };
    },
    async post(url, params) {
      const r = await fetch(url, { method: "POST", body: params, redirect: "manual",
        headers: { "User-Agent": UA, Cookie: cookie(), "Faces-Request": "partial/ajax",
          "X-Requested-With": "XMLHttpRequest", Accept: "application/xml, text/xml, */*; q=0.01",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        signal: AbortSignal.timeout(60000) });
      guarda(r);
      return { status: r.status, texto: await r.text() };
    },
  };
}

// ── serialização do formulário: equivale ao `new FormData(document.forms.formRh)` do navegador ─────────────────
function campos(html) {
  const p = new URLSearchParams();
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    if (/type\s*=\s*"(button|submit|image|reset)"/i.test(tag)) continue;
    if (/type\s*=\s*"(checkbox|radio)"/i.test(tag) && !/\bchecked\b/i.test(tag)) continue;
    const nome = (tag.match(/name="([^"]+)"/) || [])[1];
    if (!nome) continue;
    p.set(nome, desHtml((tag.match(/value="([^"]*)"/) || [])[1] || ""));
  }
  for (const m of html.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const sel = (m[2].match(/<option[^>]*\bselected\b[^>]*value="([^"]*)"/i)
      || m[2].match(/<option[^>]*value="([^"]*)"[^>]*\bselected\b/i)
      || m[2].match(/<option[^>]*value="([^"]*)"/i) || [])[1] || "";
    p.set(m[1], desHtml(sel));
  }
  return p;
}

// Descobre, pelo CONTEÚDO das opções, qual select é tipo de folha, ano e mês — os ids `j_idtNNN` são gerados
// pelo JSF e não são contrato estável entre versões.
function filtros(html) {
  const f = { tipo: null, ano: null, mes: null, anos: [], meses: [] };
  for (const m of html.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const nome = m[1];
    const ops = [...m[2].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)</g)]
      .map((o) => ({ v: desHtml(o[1]), t: desHtml(o[2]) }));
    if (!ops.length) continue;
    if (!f.tipo && ops.some((o) => /^Folha Mensal$/i.test(o.t))) f.tipo = nome;
    else if (!f.ano && ops.every((o) => /^\d{4}$/.test(o.v))) { f.ano = nome; f.anos = ops.map((o) => o.v); }
    else if (!f.mes && ops.some((o) => /^Janeiro$/i.test(o.t))) { f.mes = nome; f.meses = ops.map((o) => o.v); }
  }
  return f;
}

// ⚠️ No XML de resposta o id vem PREFIXADO pela view (`j_id1:javax.faces.ViewState:0`) — regex ancorada
// no início nunca casa e o coletor segue com um ViewState velho até o JSF recusar a requisição.
const viewState = (t) => desHtml(
  (t.match(/<update id="[^"]*javax\.faces\.ViewState[^"]*"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/)
    || t.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]*)"/) || [])[1] || "");

// nome do select → nome do evento de comportamento declarado no seu próprio onchange
function eventos(html) {
  const m = {};
  for (const s of html.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*onchange="([^"]*)"/gi)) {
    const ev = (desHtml(s[2]).match(/\be\s*:\s*"([^"]+)"/) || [])[1];
    if (ev) m[s[1]] = ev;
  }
  // o onchange pode vir ANTES do name na tag; segunda passada cobre a outra ordem
  for (const s of html.matchAll(/<select\b[^>]*onchange="([^"]*)"[^>]*name="([^"]+)"/gi)) {
    const ev = (desHtml(s[1]).match(/\be\s*:\s*"([^"]+)"/) || [])[1];
    if (ev && !m[s[2]]) m[s[2]] = ev;
  }
  return m;
}

// ── leitura de uma página de 20 linhas ────────────────────────────────────────────────────────────────────────
function linhasDaPagina(xml) {
  const out = [];
  for (const m of xml.matchAll(/<tr\b[^>]*data-ri="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = [...m[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)]
      .map((x) => desHtml(x[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")));
    if (c.length < 8) continue;
    out.push({ ri: Number(m[1]), tipo_folha: c[0], matricula: c[1], nome: c[2],
      data_admissao: c[3], data_demissao: c[4], tipo_contrato: c[5], vinculo: c[6], cargo: c[7] });
  }
  return out;
}

// ── o diálogo de detalhe: rótulo → valor, para não depender da ORDEM das células ───────────────────────────────
function detalhe(xml) {
  const cel = [...xml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)]
    .map((x) => desHtml(x[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")))
    .filter((x) => x !== "");
  const d = {};
  for (let i = 0; i < cel.length - 1; i++) {
    const r = semAcento(cel[i]).toLowerCase();
    const v = cel[i + 1];
    if (/^se[cç][aã]o$/.test(r)) d.secretaria = v;
    else if (/^tipo folha$/.test(r)) d.tipo_folha = v;
    else if (/^hora m[eê]s$/.test(r)) d.carga_horaria = v;
    else if (/^sal[aá]rio base$/.test(r)) d.salario_base = v;
    else if (/^refer[eê]ncia$/.test(r)) d.referencia = v;
    else if (/^proventos$/.test(r)) d.salario = v;
    else if (/^l[ií]quido$/.test(r)) d.liquido = v;
  }
  // Fallback: o diálogo vem sem rótulos em <td> (layout antigo) — cai na ordem conhecida.
  if (!d.secretaria && cel.length >= 9) {
    d.secretaria = cel[0]; d.tipo_folha = cel[1]; d.carga_horaria = cel[2];
    d.salario_base = cel[3]; d.referencia = cel[5]; d.salario = cel[6]; d.liquido = cel[8];
  }
  return d;
}



// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ETAPA 1 — enumerar os idCidade e classificar prefeitura × câmara pelo CABEÇALHO da página
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 🚨 UMA SESSÃO POR idCidade — não uma para a varredura inteira. O JSF prende a cidade à jsessionid: com
// o cookie compartilhado entre requisições concorrentes, o servidor devolve 200 com o cabeçalho de OUTRO
// município. Medido: numa passada o id 19 saiu "Câmara de Piraju" e na seguinte "Prefeitura de Óleo", e
// três ids diferentes viraram Iaras. Mesma raiz da armadilha do "Detalhes": estado guardado na sessão.
async function enumera(ate = 120) {
  const um = async (id) => {
    const s = novaSessao();
    for (const pag of ["rh_novo", "rh"]) {
      try {
        const r = await s.get(`${BASE}/${pag}.xhtml?idCidade=${id}`);
        if (r.status !== 200) continue;
        const m = r.texto.match(/(Prefeitura|C[âa]mara|Munic[íi]pios?)[^<]{3,70}/i);
        if (!m) continue;
        const rotulo = desHtml(m[0]).replace(/\s+/g, " ").trim();
        const tipo = /c[âa]mara/i.test(rotulo) ? "camara"
          : /prefeitura/i.test(rotulo) ? "prefeitura" : "outro";
        return { id_cidade: id, rotulo, tipo, tem_rh: /tblColaboradores/.test(r.texto), pag };
      } catch { /* host instável: outro id continua */ }
    }
    return null;
  };
  const achados = [];
  for (let base = 1; base <= ate; base += 10) {
    const lote = await Promise.all(Array.from({ length: 10 }, (_, k) => um(base + k)).filter(Boolean));
    for (const x of lote) if (x) achados.push(x);
  }
  // nome do município = rótulo sem o prefixo institucional e sem o sufixo de UF
  for (const a of achados) {
    // O cabeçalho vem em três formatos: "Prefeitura Municipal de X - SP", "Prefeitura da Estância
    // Turística de X - SP" e — em Bom Sucesso de Itararé — com o ENDEREÇO colado depois do travessão.
    // Cortar até o primeiro " de " resolve os três, inclusive nomes que têm "de" no meio
    // ("Bom Sucesso de Itararé"), porque o corte é NÃO-GULOSO.
    a.municipio = a.rotulo
      .replace(/^(Prefeitura|C[âa]mara)\b[\s\S]*?\sde\s+/i, "")
      .replace(/\s*[-–]\s*SP\s*$/i, "")
      .split(/\s+[-–]\s+/)[0]
      .trim();
  }
  // ⚠️ Resolver o cod_ibge SÓ dentro de SP: nomes como "Riversul" e "Ubirajara" existem em mais de uma UF
  // ([[pnigp-fila-erp-homonimo-contamina-uf]]). O consórcio é da Média Sorocabana — tudo SP.
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br where uf = 'SP'`)).rows;
  const porSlug = new Map(mun.map((m) => [slugDe(m.nome), m]));
  for (const a of achados) {
    const m = porSlug.get(slugDe(a.municipio));
    a.cod_ibge = m ? m.cod_ibge : null;
    a.uf = m ? "SP" : null;
    await q(`insert into transpcidadao_portal (id_cidade, rotulo, tipo, municipio, cod_ibge, uf, em)
             values ($1,$2,$3,$4,$5,$6, now())
             on conflict (id_cidade) do update set rotulo = excluded.rotulo, tipo = excluded.tipo,
               municipio = excluded.municipio, cod_ibge = excluded.cod_ibge, uf = excluded.uf, em = now()`,
      [a.id_cidade, a.rotulo, a.tipo, a.municipio, a.cod_ibge, a.uf]);
  }
  const pref = achados.filter((a) => a.tipo === "prefeitura");
  console.log(`  enumerados ${achados.length} portais · ${pref.length} prefeituras · ` +
    `${pref.filter((p) => !p.cod_ibge).length} sem cod_ibge`);
  for (const p of pref.filter((x) => !x.cod_ibge)) console.log(`    ⚠️ sem IBGE: ${p.rotulo}`);
  return achados;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ETAPA 2 — coleta de um município
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function abre(s, idCidade) {
  const r = await s.get(`${BASE}/rh_novo.xhtml?idCidade=${idCidade}`);
  if (r.status !== 200) return null;
  if (!/tblColaboradores/.test(r.texto)) return null;
  return { html: r.texto, url: r.url.split("#")[0], vs: viewState(r.texto),
    base: campos(r.texto), f: filtros(r.texto), eventos: eventos(r.texto) };
}

// 🚨 SEM `javax.faces.behavior.event` o servidor responde HTTP 200 com "Não existe folha no período".
// É um FALSO VAZIO, não um erro: o JSF decodifica o valor mas nunca dispara o listener que recarrega a
// lista. Medido lado a lado — sem o parâmetro: 0 linhas / 9.402 b; com `valueChange`: 20 linhas / 36.758 b.
// Mais um caso de [[pnigp-coletor-ok-sem-dado-sete-causas]]: o portal publica, o coletor é que não pergunta.
// ⚠️ E o NOME do evento muda por select: o de tipo e o de ano usam `change`, o de MÊS usa `valueChange`
// (está no `PrimeFaces.ab({e:"..."})` de cada onchange). Por isso o evento é lido do HTML, não fixado.
async function selecionaCompetencia(s, ctx, ano, mesIdx) {
  const { f } = ctx;
  ctx.base.set(f.tipo, "1");                      // 1 = Folha Mensal (evita somar 13º e complementares)
  ctx.base.set(f.ano, String(ano));
  ctx.base.set(f.mes, String(mesIdx));
  // Um disparo por filtro, na ordem: o bean acumula o que já foi aplicado, e cada requisição só
  // "executa" o seu próprio componente.
  let r = null;
  for (const nome of [f.tipo, f.ano, f.mes]) {
    const fonte = nome.replace(/_input$/, "");
    r = await s.post(ctx.url, pedido(ctx.base, {
      "javax.faces.partial.ajax": "true",
      "javax.faces.source": fonte,
      "javax.faces.partial.execute": fonte,
      "javax.faces.partial.render": ID_TABELA,
      "javax.faces.behavior.event": ctx.eventos[nome] || "valueChange",
    }, ctx.vs));
    const novo = viewState(r.texto);
    if (novo) ctx.vs = novo;
  }
  return r;
}

function pedido(base, extra, vs) {
  const p = new URLSearchParams(base);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  if (vs) p.set("javax.faces.ViewState", vs);
  return p;
}

async function pagina(s, ctx, primeiro) {
  const r = await s.post(ctx.url, pedido(ctx.base, {
    "javax.faces.partial.ajax": "true",
    "javax.faces.source": ID_TABELA,
    "javax.faces.partial.execute": ID_TABELA,
    "javax.faces.partial.render": ID_TABELA,
    [ID_TABELA]: ID_TABELA,
    [`${ID_TABELA}_pagination`]: "true",
    [`${ID_TABELA}_first`]: String(primeiro),
    [`${ID_TABELA}_rows`]: String(POR_PAGINA),   // 🚨 outro valor = IllegalArgumentException
    [`${ID_TABELA}_skipChildren`]: "true",
    [`${ID_TABELA}_encodeFeature`]: "true",
  }, ctx.vs));
  const novo = viewState(r.texto);
  if (novo) ctx.vs = novo;
  return linhasDaPagina(r.texto);
}

// Total sem paginar tudo: busca exponencial até a primeira página vazia, depois bissecção.
// (o servidor não devolve rowCount no modo skipChildren)
async function total(s, ctx) {
  const n = (await pagina(s, ctx, 0)).length;
  if (n === 0) return 0;
  if (n < POR_PAGINA) return n;
  let cheio = 0, vazio = null;
  for (let p = POR_PAGINA; p <= 200000; p *= 2) {
    const k = (await pagina(s, ctx, p)).length;
    if (k === 0) { vazio = p; break; }
    cheio = p;
    if (k < POR_PAGINA) return p + k;
  }
  if (vazio === null) return cheio + POR_PAGINA;
  while (vazio - cheio > POR_PAGINA) {
    const meio = Math.floor((cheio + vazio) / 2 / POR_PAGINA) * POR_PAGINA;
    const k = (await pagina(s, ctx, meio)).length;
    if (k === 0) vazio = meio;
    else if (k < POR_PAGINA) return meio + k;
    else cheio = meio;
  }
  return cheio + POR_PAGINA;
}

async function pedeDetalhe(s, ctx, ri) {
  const alvo = `${ID_TABELA}:${ri}:j_idt139`;
  const r = await s.post(ctx.url, pedido(ctx.base, {
    "javax.faces.partial.ajax": "true",
    "javax.faces.source": alvo,
    "javax.faces.partial.execute": alvo,
    "javax.faces.partial.render": "frmdlgDetalhePagamento",
    [alvo]: alvo,
  }, ctx.vs));
  const novo = viewState(r.texto);
  if (novo) ctx.vs = novo;
  return detalhe(r.texto);
}

async function coleta(p) {
  const s = novaSessao();
  const ctx = await abre(s, p.id_cidade);
  if (!ctx) return { situacao: "sem_tela", detalhe: "rh_novo nao respondeu com tblColaboradores", linhas: 0 };
  const f = ctx.f;
  if (!f.tipo || !f.ano || !f.mes) return { situacao: "sem_filtros", detalhe: JSON.stringify(f), linhas: 0 };

  // ── competência MAIS CHEIA, não a mais recente ([[pnigp-competencia-mais-cheia-nao-a-recente]]) ─────────────
  const anos = f.anos.map(Number).sort((a, b) => b - a);
  const mesesIdx = f.meses.map(Number).sort((a, b) => b - a);
  const candidatas = [];
  for (const mi of mesesIdx.slice(0, 4)) candidatas.push({ ano: anos[0], mesIdx: mi });
  if (anos[1]) candidatas.push({ ano: anos[1], mesIdx: 11 });

  let melhor = null;
  for (const c of candidatas) {
    await selecionaCompetencia(s, ctx, c.ano, c.mesIdx);
    const n = await total(s, ctx);
    if (!melhor || n > melhor.n) melhor = { ...c, n };
    if (melhor.n > 0 && n > 0 && n < melhor.n * 0.6) break;   // já passou do pico: parar de gastar
  }
  if (!melhor || melhor.n === 0) return { situacao: "vazio", detalhe: "nenhuma competencia com linhas", linhas: 0 };

  const competencia = `${melhor.ano}-${String(melhor.mesIdx + 1).padStart(2, "0")}`;
  await selecionaCompetencia(s, ctx, melhor.ano, melhor.mesIdx);

  // 🚨 `linhas` conta o que a FONTE devolveu, não o que o insert gravou. Numa re-passada o `on conflict do
  // nothing` devolve 0 e o livro-razão passaria a dizer "0 servidores" para um município já coletado —
  // é [[pnigp-resumo-conta-tabela-nao-execucao]] aplicado ao ledger. `novas` fica só no detalhe.
  let lidas = 0, novas = 0, semDetalhe = 0;
  for (let primeiro = 0; primeiro < melhor.n; primeiro += POR_PAGINA) {
    const linhas = await pagina(s, ctx, primeiro);
    if (!linhas.length) break;
    const lote = [];
    // 🚨 SEQUENCIAL e só para os `ri` desta página — ver a armadilha no cabeçalho do arquivo.
    for (const l of linhas) {
      const d = await pedeDetalhe(s, ctx, l.ri);
      if (!d.secretaria && d.salario === undefined) semDetalhe++;
      lote.push({ ...l, ...d });
    }
    lidas += lote.length;
    novas += await grava(p, competencia, lote);
    await dorme(120);
  }
  return { situacao: semDetalhe > lidas * 0.5 ? "ok_sem_detalhe" : "ok",
    detalhe: [semDetalhe ? `${semDetalhe} sem detalhe` : null,
      novas !== lidas ? `${novas} novas` : null].filter(Boolean).join(" · ") || null,
    linhas: lidas, competencia };
}

async function grava(p, competencia, lote) {
  if (!lote.length) return 0;
  const vals = [];
  const params = [];
  let i = 1;
  for (const l of lote) {
    const h = crypto.createHash("md5").update([
      p.cod_ibge, competencia, l.matricula || "", l.nome || "", l.cargo || "",
      l.secretaria || "", l.salario || "", l.liquido || "", l.tipo_folha || "",
    ].join("|")).digest("hex");
    vals.push(`($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},` +
      `$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`);
    params.push(p.cod_ibge, p.municipio, "SP", p.id_cidade, p.rotulo, competencia,
      l.matricula || null, l.nome || null, l.cargo || null, l.secretaria || null, l.vinculo || null,
      l.tipo_contrato || null, l.tipo_folha || null, dinheiro(l.salario_base), dinheiro(l.salario),
      dinheiro(l.liquido), l.carga_horaria || null, l.referencia || null,
      l.data_admissao || null, l.data_demissao || null, h);
  }
  const r = await q(`insert into folha_servidores_transpcidadao
    (cod_ibge, municipio, uf, id_cidade, entidade, competencia, matricula, nome, cargo, secretaria, vinculo,
     tipo_contrato, tipo_folha, salario_base, salario, liquido, carga_horaria, referencia,
     data_admissao, data_demissao, _hash)
    values ${vals.join(",")} on conflict (_hash) do nothing`, params);
  return r.rowCount;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// principal
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("── Transparência Cidadão (Média Sorocabana/SP) ─────────────────────────────────");
if (SO_ENUM || !(await q(`select count(*)::int n from transpcidadao_portal`)).rows[0].n) {
  console.log("  enumerando idCidade…");
  await enumera();
  if (SO_ENUM) { await db.end(); process.exit(0); }
}

// ⭐ 22/ago/2026 — PODER=legislativo: o catálogo `transpcidadao_portal` SEMPRE teve as 23 câmaras (`tipo='camara'`),
//    e o coletor só sabia pedir `prefeitura`. É o mesmo caso do TCM-BA, que tinha as 417 câmaras no catálogo e
//    nunca foi buscá-las ([[indice-camara-municipal]]). Uma linha de filtro separa os dois poderes.
const PODER = (process.env.PODER || "executivo").toLowerCase();
const TIPO_ALVO = PODER === "legislativo" ? "camara" : "prefeitura";
const alvos = (await q(`select id_cidade, rotulo, municipio, cod_ibge from transpcidadao_portal
  where tipo = $1 and cod_ibge is not null order by municipio`, [TIPO_ALVO])).rows
  .filter((a) => !SO || new RegExp(SO, "i").test(semAcento(a.municipio)));

console.log(`  ${alvos.length} prefeituras na fila\n`);
let ok = 0, servidores = 0;
for (const p of alvos) {
  process.stdout.write(`  ${p.municipio.padEnd(28)} `);
  let r;
  try {
    r = await coleta(p);
  } catch (e) {
    r = { situacao: "erro", detalhe: String(e.message || e).slice(0, 180), linhas: 0 };
  }
  await q(`insert into folha_transpcidadao_coleta
    (cod_ibge, municipio, uf, id_cidade, competencia, linhas, situacao, detalhe, em)
    values ($1,$2,'SP',$3,$4,$5,$6,$7, now())
    on conflict (cod_ibge) do update set competencia = excluded.competencia, linhas = excluded.linhas,
      situacao = excluded.situacao, detalhe = excluded.detalhe, id_cidade = excluded.id_cidade, em = now()`,
    [p.cod_ibge, p.municipio, p.id_cidade, r.competencia || null, r.linhas, r.situacao, r.detalhe || null]);
  if (/^ok/.test(r.situacao)) { ok++; servidores += r.linhas; }
  console.log(`${r.situacao.padEnd(15)} ${String(r.linhas).padStart(6)} ${r.competencia || ""} ${r.detalhe || ""}`);
}
console.log(`\n  ✔ ${ok}/${alvos.length} municípios · ${servidores.toLocaleString("pt-BR")} servidores`);
await db.end();
