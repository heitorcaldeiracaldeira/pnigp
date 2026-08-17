// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_dbseller.mjs — folha nominal dos municípios com portal DBSeller (SPA Angular + API PHP).
// Achado em Sapiranga/RS pelo rodapé ("dbseller.com.br" nos termos de uso); a varredura `varre_dbseller.mjs`
// mapeia quem mais tem.
//
// ⭐ O CONTRATO (garimpado no bundle `main-es2015`, não na tela — os filtros não são <select> nativos):
//   GET  /api/folha_pagamentos/getUltimaAtualizacao          → {"data_atualizacao":"2026-08-15"}  (prova de vida)
//   GET  /api/folha_pagamentos/getAnos/{instituicao}         → {"2015":"2015", … ,"2026":"2026"}
//   GET  /api/folha_pagamentos/getMeses/{ano}/{instituicao}  → {"1":"Janeiro", … }
//   POST /api/folha_pagamentos/pesquisar   (form-urlencoded, header X-Requested-With: XMLHttpRequest)
//        instituicao·ano·mes·demitidos·cargo·lotacao·vinculo·matricula·nome·sidx·sord·page·rows
//        → {page,total,records,rows:[{matricula,nome,cargo,lotacao,carga_horaria,cpf,admissao,rescisao,
//                                     salario_base,vinculo,total_bruto}]}
// ⭐ `rows=99999` traz o município inteiro numa requisição — é o que o próprio front manda.
//
// 🚨 ENCODING MISTO: o mesmo JSON traz "ESTATUTÁRIO" certo e "MarÃ§o" quebrado (UTF-8 servido como latin-1). O
// front tem uma função só para isso; aqui `arruma()` repete a regra — só mexe quando encontra Ã/Â, senão
// estragaria o texto que já está certo ([[pnigp-encoding-ferramenta-de-escrita]]).
//
// 🚨 COMPETÊNCIA MAIS CHEIA, não a mais recente: o mês corrente vem parcial
// ([[pnigp-competencia-mais-cheia-nao-a-recente]]). Testamos os últimos MESES_TESTE meses e ficamos com o maior.
//
// Uso: node scripts/ingest_folha_dbseller.mjs        (SO=<município> para um só · REFAZ=1 para reprocessar)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const MAX_INST = Number(process.env.MAX_INST || 8);      // instituições testadas por município (1..N)
const MESES_TESTE = Number(process.env.MESES_TESTE || 3); // quantos meses recentes comparar
const H = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)",
            "X-Requested-With": "XMLHttpRequest", accept: "application/json" };

await q(`create table if not exists folha_servidores_dbseller (
  cod_ibge text, municipio text, uf text, instituicao text, competencia text,
  matricula text, nome text, cargo text, lotacao text, vinculo text,
  carga_horaria text, cpf text, admissao text, rescisao text,
  salario_base numeric, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
for (const c of ["descontos numeric", "liquido numeric"]) {
  await q(`alter table folha_servidores_dbseller add column if not exists ${c}`);
}
await q(`create index if not exists ix_folha_dbseller_mun on folha_servidores_dbseller (cod_ibge, competencia)`);
await q(`create table if not exists folha_dbseller_coleta (
  cod_ibge text, instituicao text, municipio text, uf text, competencia text,
  servidores int, com_valor int, situacao text, detalhe text, em timestamptz default now(),
  primary key (cod_ibge, instituicao)
)`);

// só mexe no texto quando há sinal de mojibake — o mesmo teste que o front do portal faz
const arruma = (s) => {
  const v = String(s ?? "");
  if (!/[ÃÂ]/.test(v)) return v;
  try { return Buffer.from(v, "latin1").toString("utf8"); } catch { return v; }
};
const money = (s) => {
  // 🚨 número JÁ convertido (o caminho da ficha) não pode passar pela regra brasileira: 1789.04 viraria 178904.
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = String(s ?? "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};

async function getJson(base, caminho) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`${base}/api/folha_pagamentos${caminho}`, { headers: H, signal: AbortSignal.timeout(60000) });
      if (!r.ok) return null;
      const txt = await r.text();
      if (!/^\s*[[{]/.test(txt)) return null;   // o framework devolve HTML quando a rota não casa
      return JSON.parse(txt);
    } catch { await new Promise((s) => setTimeout(s, 2000 * (t + 1))); }
  }
  return null;
}
async function pesquisa(base, inst, ano, mes) {
  const body = new URLSearchParams({ instituicao: String(inst), ano: String(ano), mes: String(mes),
    demitidos: "0", cargo: "", lotacao: "", vinculo: "", matricula: "", nome: "",
    sidx: "Servidor.nome", sord: "asc", page: "1", rows: "99999" });
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`${base}/api/folha_pagamentos/pesquisar`, { method: "POST", body,
        headers: { ...H, "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(300000) });
      if (!r.ok) { await new Promise((s) => setTimeout(s, 3000 * (t + 1))); continue; }
      const txt = await r.text();
      if (!/^\s*\{/.test(txt)) return null;
      const j = JSON.parse(txt);
      return Array.isArray(j.rows) ? j.rows : [];
    } catch { await new Promise((s) => setTimeout(s, 3000 * (t + 1))); }
  }
  return null;
}

// ⭐ DUAS GERAÇÕES DE GRADE. A nova devolve o registro com campos nomeados (nome, cargo, salario_base, total_bruto).
// A ANTIGA (Bagé, Charqueadas, Tramandaí…) devolve só `{id, cell:[matricula, nome, cargo, lotacao]}` — QUATRO
// colunas, SEM valor nenhum. Marcar isso como "coletado" seria repetir o erro de gravar nome sem salário: o valor
// existe, mas na FICHA do servidor, em `/api/folha_pagamentos/view/{id}` (HTML), uma requisição por pessoa.
const desHtml = (s) => String(s ?? "")
  .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó")
  .replace(/&uacute;/g, "ú").replace(/&atilde;/g, "ã").replace(/&otilde;/g, "õ").replace(/&ccedil;/g, "ç")
  .replace(/&ecirc;/g, "ê").replace(/&acirc;/g, "â").replace(/&ocirc;/g, "ô").replace(/&nbsp;/g, " ")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// pega o valor que vem DEPOIS de um rótulo na ficha (a ficha é tabela: <td>rótulo</td><th>valor</th>)
function daFicha(html, rotulo) {
  const txt = desHtml(html);
  const re = new RegExp(rotulo + "\\s*:?\\s*([\\d.]+,\\d{2})", "i");
  const m = txt.match(re);
  return m ? money(m[1]) : null;
}
async function ficha(base, id) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`${base}/api/folha_pagamentos/view/${id}`, { headers: H, signal: AbortSignal.timeout(60000) });
      if (!r.ok) { await new Promise((s) => setTimeout(s, 1500 * (t + 1))); continue; }
      const html = await r.text();
      return {
        salario_base: daFicha(html, "Sal[aá]rio Base"),
        bruto: daFicha(html, "Total Bruto"),
        descontos: daFicha(html, "Total Descontos"),
        admissao: (desHtml(html).match(/Admiss[ãa]o:?\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || "",
        cpf: (desHtml(html).match(/CPF:?\s*([\d*.\-]+)/i) || [])[1] || "",
      };
    } catch { await new Promise((s) => setTimeout(s, 1500 * (t + 1))); }
  }
  return null;
}
async function comFichas(base, linhas) {
  const CONC_FICHA = Number(process.env.CONC_FICHA || 8);
  const out = [];
  for (let i = 0; i < linhas.length; i += CONC_FICHA) {
    const bloco = linhas.slice(i, i + CONC_FICHA);
    const res = await Promise.all(bloco.map((l) => ficha(base, l.id)));
    bloco.forEach((l, k) => out.push({ ...l, ...(res[k] || {}) }));
    if (i % 400 < CONC_FICHA) process.stdout.write(`      fichas ${i + bloco.length}/${linhas.length}\r`);
  }
  return out;
}

// semeia com os candidatos achados lendo o site oficial (descobre_portal_pelo_site.mjs)
await q(`insert into dbseller_portal (cod_ibge, municipio, uf, base)
  select c.cod_ibge, c.municipio, c.uf,
         (regexp_match(c.url, '^(https?://[^/]+)'))[1]
    from folha_portal_candidato c where c.produto = 'dbseller'
  on conflict (cod_ibge) do nothing`).catch(() => {});

const alvos = (await q(`select cod_ibge, municipio, uf, base from dbseller_portal
  ${SO ? "where municipio ilike '%'||$1||'%'" : ""} order by municipio`, SO ? [SO] : [])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge||'|'||instituicao k from folha_dbseller_coleta where situacao='ok'`)).rows.map((r) => r.k));
console.log(`[dbseller] ${alvos.length} municípios`);

const LOTE = 1000;
let totalGeral = 0;
for (const a of alvos) {
  let doMunicipio = 0;
  for (let inst = 1; inst <= MAX_INST; inst++) {
    if (feitos.has(`${a.cod_ibge}|${inst}`)) continue;
    const anos = await getJson(a.base, `/getAnos/${inst}`);
    const listaAnos = anos ? Object.values(anos).map(String).sort().reverse() : [];
    if (!listaAnos.length) continue;                    // instituição inexistente nesse portal
    const ano = listaAnos[0];
    const meses = await getJson(a.base, `/getMeses/${ano}/${inst}`);
    const listaMeses = meses ? Object.keys(meses).map(Number).sort((x, y) => y - x).slice(0, MESES_TESTE) : [];
    if (!listaMeses.length) continue;

    // ⭐ escolhe a competência MAIS CHEIA entre as últimas
    let melhor = null;
    for (const mes of listaMeses) {
      const rows = await pesquisa(a.base, inst, ano, mes);
      if (!rows) continue;
      if (!melhor || rows.length > melhor.rows.length) melhor = { ano, mes, rows };
      if (melhor.rows.length && rows.length < melhor.rows.length * 0.5) break; // já caiu muito: os anteriores não voltam
    }
    const marca = (situacao, detalhe, n = 0, cv = 0, comp = "") =>
      q(`insert into folha_dbseller_coleta (cod_ibge,instituicao,municipio,uf,competencia,servidores,com_valor,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge,instituicao) do update set
         competencia=excluded.competencia, servidores=excluded.servidores, com_valor=excluded.com_valor,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
        [a.cod_ibge, String(inst), a.municipio, a.uf, comp, n, cv, situacao, detalhe]);

    if (!melhor || !melhor.rows.length) { await marca("vazio", `instituição ${inst} sem linhas em ${ano}`); continue; }
    const comp = `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`;
    // grade da geração ANTIGA: sem campos nomeados. Reconstrói pelo `cell` e busca o valor ficha a ficha.
    const antiga = !melhor.rows[0]?.nome && Array.isArray(melhor.rows[0]?.cell);
    if (antiga) {
      const base0 = melhor.rows.map((s) => ({
        id: s.id, matricula: String(s.cell[0] ?? "").trim(), nome: arruma(String(s.cell[1] ?? "").trim()),
        cargo: arruma(String(s.cell[2] ?? "").trim()), lotacao: arruma(String(s.cell[3] ?? "").trim()),
      })).filter((x) => x.nome);
      console.log(`  ${a.municipio} / instituição ${inst}: ${base0.length} servidores na grade antiga — buscando fichas`);
      melhor.rows = (await comFichas(a.base, base0)).map((x) => ({
        matricula: x.matricula, nome: x.nome, cargo: x.cargo, lotacao: x.lotacao, vinculo: "",
        carga_horaria: "", cpf: x.cpf, admissao: x.admissao, rescisao: "",
        salario_base: x.salario_base, total_bruto: x.bruto, _descontos: x.descontos,
      }));
    }
    const regs = melhor.rows.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, instituicao: String(inst), competencia: comp,
      matricula: String(s.matricula ?? ""), nome: arruma(s.nome), cargo: arruma(s.cargo), lotacao: arruma(s.lotacao),
      vinculo: arruma(s.vinculo), carga_horaria: String(s.carga_horaria ?? s.cargaHoraria ?? ""),
      cpf: String(s.cpf ?? ""), admissao: String(s.admissao ?? ""), rescisao: String(s.rescisao ?? ""),
      salario_base: money(s.salario_base ?? s.salarioBase), bruto: money(s.total_bruto ?? s.totalBruto),
      descontos: money(s._descontos ?? null),
      liquido: (() => { const b = money(s.total_bruto ?? s.totalBruto), d = money(s._descontos ?? null);
                        return b != null && d != null ? +(b - d).toFixed(2) : null; })(),
      _hash: crypto.createHash("md5").update([a.cod_ibge, comp, inst, s.matricula, s.nome, s.cargo].join("¦")).digest("hex"),
    })).filter((r) => r.nome);
    const mapa = new Map(regs.map((r) => [r._hash, r]));
    const arr = [...mapa.values()];
    for (let i = 0; i < arr.length; i += LOTE) {
      const p = arr.slice(i, i + LOTE);
      const c = (f) => p.map((x) => x[f]);
      await q(`insert into folha_servidores_dbseller
        (cod_ibge,municipio,uf,instituicao,competencia,matricula,nome,cargo,lotacao,vinculo,carga_horaria,cpf,
         admissao,rescisao,salario_base,bruto,descontos,liquido,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],
          $17::numeric[],$18::numeric[],$19::text[])
        on conflict (_hash) do update set bruto=excluded.bruto, salario_base=excluded.salario_base,
          descontos=excluded.descontos, liquido=excluded.liquido, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("instituicao"), c("competencia"), c("matricula"), c("nome"),
         c("cargo"), c("lotacao"), c("vinculo"), c("carga_horaria"), c("cpf"), c("admissao"), c("rescisao"),
         c("salario_base"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
    }
    const comValor = arr.filter((r) => r.bruto > 0).length;
    // 🚨 zero linha NÃO é 'ok': marcado como ok, o `feitos` pula o município para sempre e o defeito vira silêncio
    if (!arr.length) { await marca("vazio", `grade respondeu mas nenhuma linha aproveitável em ${comp}`, 0, 0, comp); continue; }
    await marca("ok", `competência ${comp} escolhida entre ${listaMeses.join("/")}`, arr.length, comValor, comp);
    console.log(`  ${a.municipio} / instituição ${inst}: ${arr.length} servidores (${comValor} com valor) · ${comp}`);
    doMunicipio += arr.length;
  }
  totalGeral += doMunicipio;
  if (!doMunicipio) console.log(`  ✖ ${a.municipio}: nada coletado`);
}
console.log(`[dbseller] ${totalGeral.toLocaleString("pt-BR")} servidores`);
await db.end();
