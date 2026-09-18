// COLETOR e-lic (Estado de SC) — a DISPUTA INTEIRA pela API JSON do portal, sem PDF, sem login, sem captcha.
//
//   node scripts/auditoria/coletor_elic_disputa_api.mjs                # 150 processos, GRAVA
//   DRY=1 LIMIT=20 node scripts/auditoria/coletor_elic_disputa_api.mjs # mede sem gravar
//   LIMIT=0 ANO_MIN=2022 node …                                        # tudo o que estiver pendente
//
// ═══ POR QUE EXISTE (18/set/2026) ═══
// O coletor por PDF (coletor_estado_de_santa_catarina_e_lic.mjs) rodou 2×/dia por seis semanas e rendeu ZERO ata:
// o portal novo do Estado (compras.sc.gov.br) só anexa "Ata de Sessão de Pregão" nos processos de origem LIC
// (≤2024); desde 2025 tudo é WEBLIC e a ata simplesmente não vai para /arquivos. Medido em 18/set: 0 de 31 pregões
// homologados de 2025-26 com ata. E o coletor ainda repetia sempre os mesmos 400 processos (ordem fixa + sem_ata
// não aposentava). Detalhe em pnigp-elic-api-json-disputa-inteira.
//
// O que existe no lugar: e-lic.sc.gov.br é Paradigma/WBC e expõe o mural público por web service ASMX:
//   POST https://e-lic.sc.gov.br/Portal/WebService/Servicos.asmx/<Metodo>   corpo {"dtoProcesso":{…}} → {"d":…}
//   PesquisarProcessos (encerrados, por faixa de linhas) → PesquisarProcessoDetalhes → itens (ou lotes → itens)
//   → PesquisarProcessoDetalheItemProdutoLance / PesquisarProcessoDetalheItemLoteLance: TODO lance, com data-hora,
//   valor, razão social + CNPJ, ranking, vencedor, situação e a MARCA/MODELO ofertados naquele lance.
// GET no .asmx redireciona para erro — só POST. Não é contorno de nada: é a rota que a própria página pública usa.
//
// ═══ O DESENHO ═══
// · Universo = processos ENCERRADOS do portal (Homologado/Fracassado) com ano ≥ ANO_MIN. A PONTE com o PNCP é
//   local (sem chamada ao portal): "PE-0688/2024" → contratacoes_sc esfera='E', ano=2024, numero_compra=688,
//   modalidade 6 (PE) ou 4 (CE) — o número colide entre órgãos (SES, SEA, PM… numeram cada um o seu), então quem
//   decide é o OBJETO (similaridade) com reforço do órgão. Sem ponte não há chave (cnpj,ano,seq): o processo fica
//   no livro-razão como 'sem_ponte' e volta toda rodada, de graça, até o PNCP publicá-lo.
// · Só depois da ponte é que se fala com o portal: 1 chamada por item (ou por lote + por item do lote). PAUSA entre
//   chamadas e CONC=1 — portal de Estado, um servidor só (pnigp-intraweb-sessao-derruba-servidor).
// · Grava nas MESMAS tabelas da fila da disputa (app.disputa_proposta_sc / disputa_lance_sc / disputa_processo_sc),
//   gerador 'elic_api', em LOTE por fatia (feedback-banco-e-o-gargalo). A fila NÃO apaga o que este coletor grava
//   (ela filtra gerador <> 'elic_api' no DELETE) — os dois convivem no mesmo processo.
// · Casamento com o item do PNCP igual ao da fila: pela DESCRIÇÃO (casaItens), fallback pelo número sequencial.
// · Livro-razão app.elic_api_feitas_sc por nCdProcesso do portal, com VERSAO: subir ELIC_API_VERSAO relê tudo.
import { abrePool, consulta } from "../db.mjs";
import { casaItens } from "../parser_az.mjs";
import { carimboBR } from "../hora_br.mjs";

export const ELIC_API_VERSAO = 1;
const GERADOR = "elic_api";
const TITULO = "Mural público e-lic (API)";

const db = abrePool({ max: 3 });
const q = (sql, params) => consulta(db, sql, params);
const UF = (process.env.UF || "sc").toLowerCase();
const DRY = process.env.DRY === "1";
const LIM = process.env.LIMIT != null ? Number(process.env.LIMIT) : 150;
const ANO_MIN = Number(process.env.ANO_MIN || 2022);
const PAUSA = Number(process.env.PAUSA || 250);            // ms entre chamadas ao portal
const FATIA = Number(process.env.FATIA || 10);             // processos por escrita em lote
const LOTE_ITENS = process.env.LOTE_ITENS !== "0";         // em processo por LOTE, buscar também o lance do vencedor por ITEM (traz marca e unitário)
const T_PROP = `app.disputa_proposta_${UF}`, T_LANCE = `app.disputa_lance_${UF}`, T_PROC = `app.disputa_processo_${UF}`;
const FEITAS = `app.elic_api_feitas_${UF}`;

// ═══ PORTAL ═══
const HOST = process.env.ELIC_HOST || "e-lic.sc.gov.br";
const BASE = `https://${HOST}/Portal/WebService/Servicos.asmx/`;
const HDR = { "user-agent": "Mozilla/5.0", "content-type": "application/json; charset=utf-8", accept: "application/json" };
const IDIOMA = { nCdIdioma: 1 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let chamadas = 0;
async function chama(metodo, dto) {
  for (let t = 0; t < 5; t++) {
    try {
      chamadas++;
      const r = await fetch(BASE + metodo, { method: "POST", headers: HDR, body: JSON.stringify({ dtoProcesso: dto }), signal: AbortSignal.timeout(60000) });
      if (r.status === 429 || r.status >= 500) { await sleep(5000 * (t + 1)); continue; }
      const txt = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status} ${metodo}: ${txt.slice(0, 120)}`);
      const j = JSON.parse(txt);
      await sleep(PAUSA);
      return j.d;
    } catch (e) {
      if (t === 4) throw e;
      await sleep(3000 * (t + 1));
    }
  }
}
// "/Date(1724354669740)/" → ISO em Brasília (é instante, converte — hora_br). Data inválida do .NET (ano 1) → null.
const dataNet = (s) => { const m = String(s || "").match(/-?\d+/); if (!m) return null; const ms = Number(m[0]); if (ms < 0) return null; return new Date(ms).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }); };
const anoDe = (p) => { const m = String(p.sNrProcessoDisplay || "").match(/\/(\d{4})\s*$/); if (m) return Number(m[1]); const d = dataNet(p.tDtFinal); return d ? Number(d.slice(0, 4)) : null; };
const numDe = (p) => { const m = String(p.sNrProcessoDisplay || "").match(/-\s*0*(\d+)\s*\//); return m ? Number(m[1]) : null; };
const modDe = (p) => (/^CE/i.test(p.sNrProcessoDisplay || "") ? 4 : 6);   // PE → pregão (6); CE → concorrência (4)
// O grid do kendo devolve `{items:[…]}` ou o array direto — e REPETE linhas (o mesmo nCdItem 2–3× com formas
// diferentes). Fica a primeira de cada chave.
const linhas = (r, chave) => { const a = Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : []; const v = new Set(); return a.filter((x) => { const k = x[chave]; if (v.has(k)) return false; v.add(k); return true; }); };
// int "nulo" do .NET
const nz = (v) => (v == null || v === -2147483648 ? null : v);

async function listaEncerrados() {
  const out = [];
  for (let de = 1; ; de += 1000) {
    const l = await chama("PesquisarProcessos", { tmpTipoMuralProcesso: 0, tmpTipoMuralVisao: 997, nCdModulo: 0, nCdTipoProcesso: 0, dtoPaginacao: { nPaginaDe: de, nPaginaAte: de + 999 }, dtoIdioma: IDIOMA });
    if (!Array.isArray(l) || !l.length) break;
    out.push(...l);
    if (l.length < 1000) break;
  }
  return out;
}

// ═══ PONTE portal → PNCP ═══
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s) => new Set(norm(s).split(" ").filter((w) => w.length >= 4));
function simObjeto(a, b) {
  const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  const jac = inter / (A.size + B.size - inter);
  const na = norm(a), nb = norm(b); let i = 0; const m = Math.min(na.length, nb.length); while (i < m && na[i] === nb[i]) i++;
  return Math.max(jac, i >= 40 ? 0.9 : i >= 20 ? 0.6 : 0);
}
const simOrgao = (a, b) => { const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size); };
async function carregaPncp() {
  const { rows } = await q(`
    select cnpj, ano, seq, numero_compra, objeto, orgao_razao_social, unidade_nome, modalidade_id
      from contratacoes_${UF}
     where esfera = 'E' and modalidade_id in (4, 6) and ano >= $1`, [ANO_MIN - 1]);
  const idx = new Map();
  for (const r of rows) {
    const n = parseInt(String(r.numero_compra || "").replace(/\D/g, ""), 10);
    if (!Number.isFinite(n)) continue;
    const k = `${r.ano}|${n}`;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(r);
  }
  return { idx, n: rows.length };
}
// devolve {cnpj,ano,seq,sim} ou null. Objeto decide (≥0,45); órgão só desempata e reforça.
function ponte(p, idx) {
  const ano = anoDe(p), num = numDe(p); if (!ano || !num) return null;
  const cands = idx.get(`${ano}|${num}`) || [];
  if (!cands.length) return null;
  const mod = modDe(p);
  let best = null, bs = 0, second = 0;
  for (const c of cands) {
    let s = simObjeto(p.sDsObjeto, c.objeto);
    s += 0.15 * simOrgao(p.sNmEmpresa, `${c.orgao_razao_social || ""} ${c.unidade_nome || ""}`);
    if (Number(c.modalidade_id) === mod) s += 0.05;
    if (s > bs) { second = bs; bs = s; best = c; } else if (s > second) second = s;
  }
  if (!best || bs < 0.45) return null;
  if (cands.length > 1 && bs - second < 0.1) return null;     // empate: não afirma
  return { cnpj: best.cnpj, ano: best.ano, seq: best.seq, sim: Number(bs.toFixed(3)) };
}

// ═══ FORNECEDOR: "RAZÃO SOCIAL  - 09.263.905/0001-29" → {fornecedor, ni} ═══
function fornecedorDe(l) {
  const s = String(l.sNmEmpresa || "").trim();
  const m = s.match(/^(.*?)\s*-\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})\s*$/);
  if (m) return { fornecedor: m[1].replace(/\s+/g, " ").trim() || null, ni: m[2].replace(/\D/g, ""), alias: null };
  return { fornecedor: s.replace(/\s+/g, " ") || null, ni: null, alias: l.sNmApelido ? String(l.sNmApelido).trim() : null };
}
const keyDe = (f) => f.ni || (f.alias ? `alias:${f.alias}` : `nome:${String(f.fornecedor || "").toLowerCase()}`);
const sitLance = (l) => (l.bFlVencedor === 1 || l.bFlVencedor === "1") ? "vencedor" : (Number(l.nStLance ?? l.nStLoteLance) === 0 ? "invalido" : Number(l.nStLance ?? l.nStLoteLance) === 2 ? "renegociado" : "valido");

// ═══ MONTAGEM: lista de lances de um bloco (item ou lote) → propostas (1 por fornecedor) + lances ordenados ═══
function montaBloco({ ref, nivel, descricao, quantidade, base }, lancesBrutos, campos) {
  const L = lancesBrutos
    .map((l) => ({ l, f: fornecedorDe(l), dh: dataNet(l[campos.data]), valor: Number(l[campos.valor]), sit: sitLance(l), rank: nz(l.nNrRanking) }))
    .filter((x) => Number.isFinite(x.valor))
    .sort((a, b) => (a.dh || "").localeCompare(b.dh || "") || a.valor - b.valor);
  const porForn = new Map();
  const lances = [];
  L.forEach((x, i) => {
    const k = keyDe(x.f);
    const ant = porForn.get(k);
    const marca = String(x.l.sDsMarca || "").trim() || null, modelo = String(x.l.sDsModelo || "").trim() || null;
    if (!ant) porForn.set(k, { ...x.f, valor_inicial: x.valor, valor_final: x.valor, sit: x.sit, rank: x.rank, marca, modelo, n: 1, dh: x.dh, ordem: null });
    else {
      ant.n++;
      // valor final = último lance VÁLIDO cronologicamente (a renegociação vem por último e conta)
      if (x.sit !== "invalido") { ant.valor_final = x.valor; ant.dh = x.dh; }
      if (x.sit === "vencedor") ant.sit = "vencedor"; else if (ant.sit !== "vencedor" && x.sit !== "invalido") ant.sit = x.sit;
      if (x.rank != null) ant.rank = x.rank;
      if (marca) ant.marca = marca; if (modelo) ant.modelo = modelo;
    }
    lances.push({ ref, nivel, ordem: i + 1, ni: x.f.ni, alias: x.f.alias, fornecedor: x.f.fornecedor, valor: x.valor, data_hora: x.dh,
      tipo: x.sit === "renegociado" ? "negociado" : (ant ? "lance" : "proposta"), situacao: x.sit });
  });
  const propostas = [...porForn.values()].map((f) => ({
    ref, nivel, descricao, quantidade, base_valor: base, ni: f.ni, alias: f.alias, fornecedor: f.fornecedor, marca: f.marca, modelo: f.modelo,
    marca_declarada: !!f.marca, valor_inicial: f.valor_inicial, valor_final: f.valor_final,
    valor_total: base === "total" ? f.valor_final : (quantidade != null && Number.isFinite(f.valor_final) ? Number((f.valor_final * quantidade).toFixed(2)) : null),
    situacao: f.sit === "vencedor" ? "vencedor" : f.sit === "invalido" ? "invalido" : "classificado", ordem: f.rank, data_hora: f.dh,
  }));
  return { propostas, lances };
}

// ═══ LÊ UM PROCESSO NO PORTAL → blocos + propostas + lances ═══
async function leProcesso(p) {
  const base = { nCdProcesso: p.nCdProcesso, nCdModulo: p.nCdModulo, nCdSituacao: p.nCdSituacao, sNrProcesso: p.sNrProcessoDisplay, tmpTipoMuralProcesso: 0, dtoIdioma: IDIOMA };
  const det = await chama("PesquisarProcessoDetalhes", { ...base, nCdEdital: p.nCdEdital });
  const porItem = Number(det?.nIdTipoApuracao ?? p.nIdTipoApuracao) === 1;
  const blocos = [], propostas = [], lances = [];
  const LAN_ITEM = { data: "tDtLance", valor: "dVlLanceMoeda" }, LAN_LOTE = { data: "tDtLoteLance", valor: "dVlLoteLanceMoeda" };
  const lanceItem = (it, nCdLote) => chama("PesquisarProcessoDetalheItemProdutoLance", { ...base, nCdItem: it.nCdItem, nCdTipoModalidade: nz(det?.nCdTipoModalidade) ?? 0, nCdLote });
  // ref única no processo: em processo por LOTE o sequencial do item recomeça em cada lote, então a ref leva o lote
  // junto e o fallback pelo NÚMERO fica só para processo por item (o número do PNCP é global, o do lote não).
  const itemDe = (it, i, pref = "") => ({ ref: `${pref}item:${nz(it.nCdItemSequencial) ?? i + 1}`, nivel: "item", item: pref ? null : (nz(it.nCdItemSequencial) ?? i + 1), descricao: String(it.sDsItem || "").replace(/\s+/g, " ").trim(),
    quantidade: nz(it.dQtItem), unidade: it.sDsUnidadeMedida, referencia: nz(it.dVlReferencia), melhor: nz(it.dVlMelhorLanceMoedaVencedor), situacao_item: it.sStItem, nCdItem: it.nCdItem, nCdLote: nz(it.nCdLote) });
  let nItens = 0;
  if (porItem) {
    const itens = linhas(await chama("PesquisarProcessoDetalheItemProduto", { ...base, nCdLote: 0 }), "nCdItem");
    nItens = itens.length;
    for (const [i, it] of itens.entries()) {
      const b = itemDe(it, i); blocos.push(b);
      const r = montaBloco({ ref: b.ref, nivel: "item", descricao: b.descricao, quantidade: b.quantidade, base: "unitario" }, linhas(await lanceItem(it, 0), "nCdLance"), LAN_ITEM);
      propostas.push(...r.propostas); lances.push(...r.lances);
    }
  } else {
    const lotes = linhas(await chama("PesquisarProcessoDetalheItemLote", base), "nCdLote");
    for (const [j, lo] of lotes.entries()) {
      const seqLote = nz(lo.nCdLoteSequencial) ?? j + 1;
      const itens = linhas(await chama("PesquisarProcessoDetalheItemProduto", { ...base, nCdLote: lo.nCdLote }), "nCdItem");
      nItens += itens.length;
      const itensDoc = itens.map((it, i) => itemDe(it, i, `lote:${seqLote}/`));
      const bl = { ref: `lote:${seqLote}`, nivel: "lote", lote: seqLote, descricao: String(lo.sDsLote || "").replace(/\s+/g, " ").trim(), itens_doc: itensDoc, referencia: nz(lo.dVlReferencia), melhor: nz(lo.dVlMelhorLanceMoedaVencedor), situacao_item: lo.sStLote };
      blocos.push(bl);
      const ll = linhas(await chama("PesquisarProcessoDetalheItemLoteLance", { ...base, nCdLote: lo.nCdLote, nIdEstilo: nz(det?.nIdEstilo) ?? 0, nCdTipoModalidade: nz(det?.nCdTipoModalidade) ?? 0 }), "nCdLoteLance");
      const r = montaBloco({ ref: bl.ref, nivel: "lote", descricao: bl.descricao, quantidade: null, base: "total" }, ll, LAN_LOTE);
      propostas.push(...r.propostas); lances.push(...r.lances);
      // por item do lote: o portal só mostra o lance do VENCEDOR (unitário + marca) — vale a chamada
      if (LOTE_ITENS) for (const b of itensDoc) {
        blocos.push({ ...b, lote: seqLote });
        const ri = montaBloco({ ref: b.ref, nivel: "item", descricao: b.descricao, quantidade: b.quantidade, base: "unitario" }, linhas(await lanceItem(b, lo.nCdLote), "nCdLance"), LAN_ITEM);
        propostas.push(...ri.propostas.map((x) => ({ ...x, situacao: x.situacao === "vencedor" ? "vencedor" : "vencedor_lote" })));
        lances.push(...ri.lances.map((x) => ({ ...x, tipo: "ultimo_lance" })));
      }
    }
  }
  return { det, porItem, nItens, blocos, propostas, lances };
}

// ═══ CASAMENTO com o item do PNCP (a mesma regra da fila) ═══
async function itensPncp(cnpj, ano, seq) {
  const { rows } = await q(`select numero, descricao from itens_${UF} where cnpj=$1 and ano=$2 and seq=$3`, [cnpj, ano, seq]);
  return rows.map((r) => ({ numero: Number(r.numero), descricao: r.descricao }));
}
function casaBlocos(blocos, itens) {
  const seqOk = itens.length > 0 && Math.max(...itens.map((i) => i.numero)) <= 5000;
  const nums = new Set(itens.map((i) => i.numero));
  const soItens = blocos.filter((b) => b.nivel === "item");
  const porDesc = casaItens(soItens.map((b) => ({ item: b.ref, descricao: b.descricao || "" })), itens);
  const out = new Map();
  soItens.forEach((b, i) => {
    let numero = null, casamento = "nenhum"; const sim = porDesc[i]?.simItem ?? 0;
    if (porDesc[i]?.numero != null) { numero = porDesc[i].numero; casamento = "descricao"; }
    else if (seqOk && b.item != null && nums.has(Number(b.item))) { numero = Number(b.item); casamento = "numero"; }
    out.set(b.ref, { numero, casamento, sim: Number(sim.toFixed(3)), itens_lote: null });
  });
  for (const b of blocos.filter((x) => x.nivel === "lote")) {
    const il = [...new Set((b.itens_doc || []).map((x) => out.get(x.ref)?.numero).filter((n) => n != null))];
    out.set(b.ref, il.length === 1 ? { numero: il[0], casamento: "lote_1_item", sim: 1, itens_lote: il } : { numero: null, casamento: il.length ? "lote" : "nenhum", sim: il.length ? 1 : 0, itens_lote: il.length ? il : null });
  }
  return out;
}

// ═══ ESCRITA EM LOTE — as mesmas colunas da fila (extrai_disputa_fila.mjs) ═══
const arrTxt = (a) => (a && a.length ? "{" + a.join(",") + "}" : null);
async function garanteTabelas() {
  await q(`create table if not exists ${FEITAS}(
    n_cd_processo int primary key, numero text, ano int, orgao text, cnpj text, seq int, status text, sim numeric,
    n_itens int, n_propostas int, n_lances int, obs text, versao int, atualizado timestamptz default now())`);
  await q(`create index if not exists elic_api_feitas_${UF}_proc on ${FEITAS}(cnpj,ano,seq)`);
}
async function gravaFatia(W) {
  if (!DRY && W.apaga.length) {
    const keys = W.apaga.map((_, j) => `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`).join(",");
    const params = W.apaga.flatMap((p) => [p.cnpj, p.ano, p.seq]);
    await q(`delete from ${T_PROP} where gerador='${GERADOR}' and (cnpj,ano,seq) in (${keys})`, params);
    await q(`delete from ${T_LANCE} where gerador='${GERADOR}' and (cnpj,ano,seq) in (${keys})`, params);
  }
  const P = W.prop;
  if (!DRY && P.length) await q(`
    insert into ${T_PROP}(cnpj,ano,seq,gerador,ref,nivel,numero,itens_lote,casamento,sim,fornecedor_ni,fornecedor_alias,fornecedor,
      me_epp,uf,marca,modelo,fabricante,marca_declarada,quantidade,valor_inicial,valor_final,valor_total,base_valor,situacao,ordem,data_hora,descricao_doc,fonte_titulo,versao)
    select x.cnpj,x.ano,x.seq,'${GERADOR}',x.ref,x.nivel,x.numero,x.il::int[],x.casamento,x.sim,x.ni,x.alias,x.forn,
      null,null,x.marca,x.modelo,null,x.md,x.qtd,x.vi,x.vf,x.vt,x.base,x.sit,x.ordem,x.dh,x.desc_doc,'${TITULO}', ${ELIC_API_VERSAO}
      from unnest($1::text[],$2::int[],$3::int[],$4::text[],$5::text[],$6::int[],$7::text[],$8::text[],$9::numeric[],$10::text[],$11::text[],$12::text[],
                  $13::text[],$14::text[],$15::bool[],$16::numeric[],$17::numeric[],$18::numeric[],$19::numeric[],$20::text[],$21::text[],$22::int[],$23::text[],$24::text[])
           as x(cnpj,ano,seq,ref,nivel,numero,il,casamento,sim,ni,alias,forn,marca,modelo,md,qtd,vi,vf,vt,base,sit,ordem,dh,desc_doc)
    on conflict (cnpj,ano,seq,gerador,ref,fornecedor_key) do update set
      numero=excluded.numero, itens_lote=excluded.itens_lote, casamento=excluded.casamento, sim=excluded.sim, fornecedor=excluded.fornecedor,
      marca=excluded.marca, modelo=excluded.modelo, marca_declarada=excluded.marca_declarada, quantidade=excluded.quantidade,
      valor_inicial=excluded.valor_inicial, valor_final=excluded.valor_final, valor_total=excluded.valor_total, base_valor=excluded.base_valor,
      situacao=excluded.situacao, ordem=excluded.ordem, data_hora=excluded.data_hora, descricao_doc=excluded.descricao_doc, versao=excluded.versao, atualizado=now()`,
    [P.map((r) => r.p.cnpj), P.map((r) => r.p.ano), P.map((r) => r.p.seq), P.map((r) => String(r.x.ref).slice(0, 80)), P.map((r) => r.x.nivel),
      P.map((r) => r.m.numero), P.map((r) => arrTxt(r.m.itens_lote)), P.map((r) => r.m.casamento), P.map((r) => r.m.sim),
      P.map((r) => r.x.ni), P.map((r) => r.x.alias), P.map((r) => r.x.fornecedor), P.map((r) => r.x.marca ? String(r.x.marca).slice(0, 200) : null), P.map((r) => r.x.modelo ? String(r.x.modelo).slice(0, 200) : null),
      P.map((r) => !!r.x.marca_declarada), P.map((r) => r.x.quantidade), P.map((r) => r.x.valor_inicial), P.map((r) => r.x.valor_final), P.map((r) => r.x.valor_total),
      P.map((r) => r.x.base_valor), P.map((r) => r.x.situacao), P.map((r) => r.x.ordem), P.map((r) => r.x.data_hora), P.map((r) => r.x.descricao ? String(r.x.descricao).slice(0, 600) : null)]);
  const Lc = W.lance;
  if (!DRY && Lc.length) await q(`
    insert into ${T_LANCE}(cnpj,ano,seq,gerador,ref,nivel,numero,itens_lote,casamento,ordem,fornecedor_ni,fornecedor_alias,fornecedor,valor,data_hora,tipo,situacao,fonte_titulo,versao)
    select x.cnpj,x.ano,x.seq,'${GERADOR}',x.ref,x.nivel,x.numero,x.il::int[],x.casamento,x.ordem,x.ni,x.alias,x.forn,x.valor,x.dh,x.tipo,x.sit,'${TITULO}', ${ELIC_API_VERSAO}
      from unnest($1::text[],$2::int[],$3::int[],$4::text[],$5::text[],$6::int[],$7::text[],$8::text[],$9::int[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::text[],$15::text[],$16::text[])
           as x(cnpj,ano,seq,ref,nivel,numero,il,casamento,ordem,ni,alias,forn,valor,dh,tipo,sit)
    on conflict (cnpj,ano,seq,gerador,ref,ordem) do update set numero=excluded.numero, itens_lote=excluded.itens_lote, casamento=excluded.casamento, fornecedor_ni=excluded.fornecedor_ni,
      fornecedor_alias=excluded.fornecedor_alias, fornecedor=excluded.fornecedor, valor=excluded.valor, data_hora=excluded.data_hora, tipo=excluded.tipo, situacao=excluded.situacao, versao=excluded.versao, atualizado=now()`,
    [Lc.map((r) => r.p.cnpj), Lc.map((r) => r.p.ano), Lc.map((r) => r.p.seq), Lc.map((r) => String(r.x.ref).slice(0, 80)), Lc.map((r) => r.x.nivel),
      Lc.map((r) => r.m.numero), Lc.map((r) => arrTxt(r.m.itens_lote)), Lc.map((r) => r.m.casamento), Lc.map((r) => r.x.ordem),
      Lc.map((r) => r.x.ni), Lc.map((r) => r.x.alias), Lc.map((r) => r.x.fornecedor), Lc.map((r) => r.x.valor), Lc.map((r) => r.x.data_hora), Lc.map((r) => r.x.tipo), Lc.map((r) => r.x.situacao)]);
  const Pr = W.proc;
  if (!DRY && Pr.length) await q(`
    insert into ${T_PROC}(cnpj,ano,seq,n_participantes,n_participantes_ni,n_propostas,n_lances,n_blocos,n_blocos_casados,geradores,versao)
    select x.*, ${ELIC_API_VERSAO} from unnest($1::text[],$2::int[],$3::int[],$4::int[],$5::int[],$6::int[],$7::int[],$8::int[],$9::int[],$10::text[]) as x(cnpj,ano,seq,a,b,c,d,e,f,g)
    on conflict (cnpj,ano,seq) do update set n_participantes=excluded.n_participantes, n_participantes_ni=excluded.n_participantes_ni, n_propostas=excluded.n_propostas,
      n_lances=excluded.n_lances, n_blocos=excluded.n_blocos, n_blocos_casados=excluded.n_blocos_casados, geradores=excluded.geradores, versao=excluded.versao, atualizado=now()`,
    [Pr.map((r) => r.p.cnpj), Pr.map((r) => r.p.ano), Pr.map((r) => r.p.seq), Pr.map((r) => r.nPart), Pr.map((r) => r.nPartNi), Pr.map((r) => r.nP), Pr.map((r) => r.nL), Pr.map((r) => r.nBlocos), Pr.map((r) => r.nCasados), Pr.map(() => GERADOR)]);
  const F = W.feitas;
  if (!DRY && F.length) await q(`
    insert into ${FEITAS}(n_cd_processo,numero,ano,orgao,cnpj,seq,status,sim,n_itens,n_propostas,n_lances,obs,versao)
    select x.*, ${ELIC_API_VERSAO} from unnest($1::int[],$2::text[],$3::int[],$4::text[],$5::text[],$6::int[],$7::text[],$8::numeric[],$9::int[],$10::int[],$11::int[],$12::text[])
      as x(n_cd_processo,numero,ano,orgao,cnpj,seq,status,sim,n_itens,n_propostas,n_lances,obs)
    on conflict (n_cd_processo) do update set numero=excluded.numero, ano=excluded.ano, orgao=excluded.orgao, cnpj=excluded.cnpj, seq=excluded.seq, status=excluded.status, sim=excluded.sim,
      n_itens=excluded.n_itens, n_propostas=excluded.n_propostas, n_lances=excluded.n_lances, obs=excluded.obs, versao=excluded.versao, atualizado=now()`,
    [F.map((r) => r.id), F.map((r) => r.numero), F.map((r) => r.ano), F.map((r) => r.orgao), F.map((r) => r.cnpj), F.map((r) => r.seq), F.map((r) => r.status), F.map((r) => r.sim),
      F.map((r) => r.nItens), F.map((r) => r.nP), F.map((r) => r.nL), F.map((r) => r.obs)]);
}

async function main() {
  const t0 = Date.now();
  await garanteTabelas();
  const feitas = new Map((await q(`select n_cd_processo, status, versao from ${FEITAS}`)).rows.map((r) => [Number(r.n_cd_processo), r]));
  const pncp = await carregaPncp();
  const todos = await listaEncerrados();
  const univ = todos.filter((p) => /homolog|fracass/i.test(p.sDsSituacao || "") && (anoDe(p) || 0) >= ANO_MIN);
  // pendente = nunca visto nesta versão com um status DEFINITIVO ('ok' e 'sem_lances' são fatos sobre o processo)
  const pend = univ.filter((p) => { const f = feitas.get(Number(p.nCdProcesso)); return !(f && Number(f.versao) === ELIC_API_VERSAO && ["ok", "sem_lances"].includes(f.status)); });
  // ponte primeiro (local, de graça); só o que tem ponte vai ao portal
  const W0 = { feitas: [], apaga: [], prop: [], lance: [], proc: [] };
  const comPonte = [];
  for (const p of pend) {
    const b = ponte(p, pncp.idx);
    if (b) comPonte.push({ p, b });
    else W0.feitas.push({ id: p.nCdProcesso, numero: p.sNrProcessoDisplay, ano: anoDe(p), orgao: p.sNmEmpresa, cnpj: null, seq: null, status: "sem_ponte", sim: null, nItens: null, nP: null, nL: null, obs: null });
  }
  await gravaFatia(W0);
  const fila = LIM > 0 ? comPonte.slice(0, LIM) : comPonte;
  console.log(`${carimboBR()} e-lic API · encerrados ${todos.length} · universo (≥${ANO_MIN}, homologado/fracassado) ${univ.length} · pendentes ${pend.length} · com ponte ${comPonte.length} (${(100 * comPonte.length / Math.max(1, pend.length)).toFixed(1)}%) · sem ponte ${W0.feitas.length} · PNCP candidatos ${pncp.n} · nesta rodada ${fila.length} · DRY=${DRY ? 1 : 0}`);
  if (!fila.length) { console.log(`${carimboBR()} e-lic API: nada a coletar`); await db.end(); return; }

  const tot = { ok: 0, sem_lances: 0, erro: 0, itens: 0, propostas: 0, lances: 0, blocos: 0, casados: 0, ni: new Set() };
  let feitos = 0;
  for (let i = 0; i < fila.length; i += FATIA) {
    const W = { feitas: [], apaga: [], prop: [], lance: [], proc: [] };
    for (const { p, b } of fila.slice(i, i + FATIA)) {
      feitos++;
      const reg = { id: p.nCdProcesso, numero: p.sNrProcessoDisplay, ano: anoDe(p), orgao: p.sNmEmpresa, cnpj: b.cnpj, seq: b.seq, sim: b.sim, nItens: null, nP: 0, nL: 0, obs: null };
      try {
        const r = await leProcesso(p);
        reg.nItens = r.nItens;
        if (!r.lances.length) { reg.status = "sem_lances"; tot.sem_lances++; W.feitas.push(reg); continue; }
        const itens = await itensPncp(b.cnpj, b.ano, b.seq);
        const mapa = casaBlocos(r.blocos, itens);
        const pk = { cnpj: b.cnpj, ano: b.ano, seq: b.seq };
        // dedup (ref, fornecedor_key) — a mesma chave da PK
        const vistos = new Set();
        const P = r.propostas.filter((x) => { const k = `${x.ref}|${keyDe(x)}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
        for (const x of P) W.prop.push({ p: pk, x, m: mapa.get(x.ref) || { numero: null, casamento: "nenhum", sim: 0, itens_lote: null } });
        for (const x of r.lances) W.lance.push({ p: pk, x, m: mapa.get(x.ref) || { numero: null, casamento: "nenhum", sim: 0, itens_lote: null } });
        const ids = new Set(P.map(keyDe)), idsNi = new Set(P.filter((x) => x.ni).map((x) => x.ni));
        for (const n of idsNi) tot.ni.add(n);
        const nCas = [...mapa.values()].filter((m) => m.numero != null || m.itens_lote).length;
        W.proc.push({ p: pk, nPart: ids.size, nPartNi: idsNi.size, nP: P.length, nL: r.lances.length, nBlocos: r.blocos.length, nCasados: nCas });
        W.apaga.push(pk);
        Object.assign(reg, { status: "ok", nP: P.length, nL: r.lances.length, obs: r.porItem ? "por_item" : "por_lote" });
        tot.ok++; tot.itens += r.nItens; tot.propostas += P.length; tot.lances += r.lances.length; tot.blocos += r.blocos.length; tot.casados += nCas;
        if (tot.ok <= 3 || DRY) console.log(`  ✔ ${p.sNrProcessoDisplay} → ${b.cnpj}/${b.ano}/${b.seq} (sim ${b.sim}) · ${r.porItem ? "item" : "lote"} · ${r.nItens} itens · ${P.length} propostas · ${r.lances.length} lances · ${idsNi.size} CNPJs · casados ${nCas}/${r.blocos.length}`);
      } catch (e) {
        reg.status = "erro"; reg.obs = String(e.message || e).slice(0, 200); tot.erro++;
        console.log(`  ✘ ${p.sNrProcessoDisplay}: ${reg.obs}`);
      }
      W.feitas.push(reg);
      process.stdout.write(`  ${feitos}/${fila.length} · ok ${tot.ok} · sem lances ${tot.sem_lances} · erro ${tot.erro} · propostas ${tot.propostas} · lances ${tot.lances} · chamadas ${chamadas}\r`);
    }
    await gravaFatia(W);
  }
  console.log(`\n${carimboBR()} fim · ${feitos} processos em ${((Date.now() - t0) / 60000).toFixed(1)} min · ok ${tot.ok} · sem lances ${tot.sem_lances} · erro ${tot.erro}`);
  console.log(`   itens ${tot.itens} · propostas ${tot.propostas} · lances ${tot.lances} · CNPJs ${tot.ni.size} · blocos ${tot.blocos} (casados com item do PNCP: ${tot.casados}) · ${chamadas} chamadas ao portal`);
  if (!DRY) {
    const { rows } = await q(`select status, count(*)::int n, coalesce(sum(n_propostas),0)::int propostas, coalesce(sum(n_lances),0)::int lances from ${FEITAS} group by 1 order by 2 desc`);
    console.table(rows);
  }
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
