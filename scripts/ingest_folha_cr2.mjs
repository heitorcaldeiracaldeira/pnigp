// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_cr2.mjs — folha dos municípios do ERP CR2 (Grupo CR2), forte no PARÁ (94 dos 144 municípios).
//
// ⭐ Resolve quase o Pará inteiro — o estado que o TCM-PA trancava atrás de captcha. E SEM captcha.
//
// A CADEIA (descoberta pelo Radar → identificador → API do CR2):
//   1. O site institucional (`{municipio}.pa.gov.br`, WordPress) tem `linkRNR` apontando pro portal de folha.
//   2. A folha vive em `folha.governotransparente.com.br/{foff_id}/foff/listar-por/funcionariosresumo/{AAAAMM}`
//      — o foff_id de cada entidade sai da API Bubble do CR2: `portalcr2.com.br/api/1.1/obj/relacao_nominal_remuneracao`.
//   3. A página de listagem é RENDERIZADA NO HTML (não SPA): cada servidor é um <tr> e o salário está numa
//      `div.hide` dentro da 1ª célula — Total Proventos / Total Descontos / Líquido, além de cargo e órgão.
//
// ⚠️ NÃO confundir com o ASPEC (governotransparente.com.br SEM o subdomínio `folha.`): aquele é o portal de
// despesa/empenho e NÃO tem folha nominal. O `folha.` é outro produto (CR2), com a folha por servidor.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const COMPETENCIA = process.env.COMPETENCIA || null; // AAAAMM; vazio = mais recente disponível
const SO = process.env.SO || null;
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

await q(`create table if not exists folha_servidores_cr2 (
  foff_id text, entidade text, cod_ibge text, municipio text, uf text, competencia text,
  matricula text, cpf_masc text, nome text, vinculo text, cargo text,
  orgao text, setor text, situacao text, carga_horaria text, data_admissao text,
  proventos numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_cr2_ent on folha_servidores_cr2 (foff_id, competencia)`);
await q(`create table if not exists folha_cr2_coleta (
  foff_id text primary key, entidade text, competencia text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const dec = (s) => String(s || "").replace(/&iacute;/g, "í").replace(/&aacute;/g, "á").replace(/&eacute;/g, "é")
  .replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ccedil;/g, "ç").replace(/&atilde;/g, "ã")
  .replace(/&otilde;/g, "õ").replace(/&acirc;/g, "â").replace(/&ecirc;/g, "ê").replace(/&ocirc;/g, "ô")
  .replace(/&agrave;/g, "à").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ").trim();
const num = (s) => { const m = String(s || "").match(/([\d.]+),(\d{2})/); if (!m) return null;
  const n = parseFloat(m[1].replace(/\./g, "") + "." + m[2]); return Number.isFinite(n) ? n : null; };
const campo = (bloco, rot) => { const m = bloco.match(new RegExp(rot + "\\s*:?\\s*([^:]*?)(?=[A-ZÀ-Ú][a-zà-ú]+\\s*:|Total|Líqui|$)", "i")); return m ? dec(m[1]) : null; };

// 1) o catálogo de entidades CR2 (foff_id) sai da API Bubble, paginada
async function entidades() {
  const B = "https://www.portalcr2.com.br/api/1.1/obj/relacao_nominal_remuneracao";
  const vistos = new Map();
  let cursor = 0;
  for (let p = 0; p < 30; p++) {
    const r = await fetch(`${B}?limit=100&cursor=${cursor}`, { headers: { ...UA, accept: "application/json" }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) break;
    const j = await r.json();
    const arr = j.response?.results || [];
    for (const x of arr) {
      const m = String(x.linkRNR || "").match(/folha\.governotransparente\.com\.br\/(\d+)/);
      if (m && !vistos.has(m[1])) vistos.set(m[1], { foff: m[1] });
    }
    cursor += arr.length;
    if (!arr.length || (j.response?.remaining ?? 0) <= 0) break;
  }
  return [...vistos.values()];
}

async function baixa(url) {
  for (let t = 0; t < 3; t++) {
    try { const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120000), headers: UA });
      if (r.ok) return await r.text(); } catch { /* retry */ }
    await new Promise((s) => setTimeout(s, 3000 * (t + 1)));
  }
  return null;
}

// competências disponíveis: os links da página trazem AAAAMM. ⚠️ FILTRAR mês 01-12 — o portal tem uma opção
// "202699" (ano/todos) que não é competência real e viraria lixo se coletada como mês 99.
function competenciasDe(html) {
  return [...new Set([...html.matchAll(/funcionariosresumo\/(\d{6})/g)].map((m) => m[1]))]
    .filter((c) => { const mes = +c.slice(4); return mes >= 1 && mes <= 12; })
    .sort().reverse();
}

// extrai os servidores da página (cada <tr> com uma div.hide contendo os valores)
function extrai(html, foff) {
  const nomeEntidade = dec((html.match(/<title>([^<]+)<\/title>/i) || [])[1] || "");
  const linhas = [];
  const trs = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trs) {
    if (!/class="hide"/i.test(tr) || !/Matr[íi]cula/i.test(tr)) continue;
    // o NOME está na 2ª/3ª célula visível do <tr>, não na div.hide — pega as células diretas
    const cels = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => dec(m[1].replace(/<div class="hide"[\s\S]*/i, "")));
    const nome = cels.find((c) => /^[A-ZÀ-Ú][A-ZÀ-Ú .'-]{5,}$/.test(c)) || cels[2] || null;
    const b = dec((tr.match(/<div class="hide"[\s\S]*?<\/tr>/i) || [tr])[0]);
    const proventos = num((b.match(/Total Proventos[^R]*R?\$?\s*([\d.,]+)/i) || [])[1]);
    const descontos = num((b.match(/Total Descontos[^R]*R?\$?\s*([\d.,]+)/i) || [])[1]);
    const liquido = num((b.match(/L[íi]qui[^R]*R?\$?\s*([\d.,]+)/i) || [])[1]);
    linhas.push({
      entidade: nomeEntidade, nome,
      matricula: campo(b, "Matr[íi]cula"), cpf_masc: campo(b, "CPF"),
      vinculo: campo(b, "V[íi]nculo"), cargo: campo(b, "Cargo"),
      orgao: (campo(b, "[ÓO]rg[ãa]o") || "").replace(/\s*Setor\/?.*$/i, "").trim() || null,
      setor: campo(b, "Setor/Departamento"),
      situacao: campo(b, "Situa[çc][ãa]o Funcional"), carga_horaria: campo(b, "Carga hor[áa]ria semanal"),
      data_admissao: campo(b, "Data de admiss[ãa]o"),
      proventos, descontos, liquido,
    });
  }
  return { nomeEntidade, linhas };
}

const cat = await entidades();
const fila = SO ? cat.filter((e) => e.foff === SO) : cat;
console.log(`[cr2] ${cat.length} entidades no catálogo · ${fila.length} na fila`);
const feitos = new Set((await q(`select foff_id from folha_cr2_coleta where situacao='ok'`)).rows.map((r) => r.foff_id));

const LOTE = 1000;
async function grava(regs) {
  const m = new Map();
  for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_cr2
      (foff_id,entidade,cod_ibge,municipio,uf,competencia,matricula,cpf_masc,nome,vinculo,cargo,orgao,setor,
       situacao,carga_horaria,data_admissao,proventos,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::text[],
        $17::numeric[],$18::numeric[],$19::numeric[],$20::text[])
      on conflict (_hash) do update set proventos=excluded.proventos, descontos=excluded.descontos,
        liquido=excluded.liquido, _coletado_em=now()`,
      [c("foff_id"), c("entidade"), c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("matricula"),
       c("cpf_masc"), c("nome"), c("vinculo"), c("cargo"), c("orgao"), c("setor"), c("situacao"),
       c("carga_horaria"), c("data_admissao"), c("proventos"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

let total = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const e = fila[i];
  if (feitos.has(e.foff)) continue;
  const marca = (situacao, detalhe, comp = null, linhas = 0) =>
    q(`insert into folha_cr2_coleta (foff_id,entidade,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,now()) on conflict (foff_id) do update set
       competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [e.foff, null, comp, linhas, situacao, detalhe]);
  try {
    const raiz = `https://folha.governotransparente.com.br/${e.foff}/foff/listar-por/funcionariosresumo`;
    let comp = COMPETENCIA;
    if (!comp) {
      const idx = await baixa(raiz);
      const comps = idx ? competenciasDe(idx) : [];
      comp = comps[0] || null;
    }
    if (!comp) { await marca("sem_competencia", "sem competência disponível"); falhas++; continue; }

    const html = await baixa(`${raiz}/${comp}`);
    if (!html) { await marca("sem_resposta", "página não respondeu", comp); falhas++; continue; }
    const { nomeEntidade, linhas } = extrai(html, e.foff);
    if (!linhas.length) { await marca("vazio", "sem servidores na página", comp); falhas++; continue; }

    // ⭐ o foff_id decodifica o município: os 6 primeiros dígitos são o IBGE6 (sufixo 01/02 = prefeitura/câmara).
    const ibge6 = e.foff.slice(0, 6);
    const mun = (await q(`select nome, uf, cod_ibge from municipios_br where cod_ibge6=$1`, [ibge6])).rows[0];
    const regs = linhas.map((l) => ({
      foff_id: e.foff, entidade: nomeEntidade || mun?.nome, cod_ibge: mun?.cod_ibge ?? ibge6,
      municipio: mun?.nome, uf: mun?.uf, competencia: comp,
      ...l,
      _hash: crypto.createHash("md5").update([e.foff, comp, l.matricula, l.nome, l.cargo].join("¦")).digest("hex"),
    }));
    await grava(regs);
    total += regs.length; ok++;
    await marca("ok", null, comp, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${nomeEntidade.slice(0, 45)}: ${regs.length} servidores (${comp})`);
  } catch (err) {
    falhas++;
    await marca("erro", String(err.message).slice(0, 200));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${e.foff}: ${String(err.message).slice(0, 80)}`);
  }
}
console.log(`\n[cr2] ${total.toLocaleString("pt-BR")} servidores · ${ok} entidades ok · ${falhas} falhas`);
await db.end();
