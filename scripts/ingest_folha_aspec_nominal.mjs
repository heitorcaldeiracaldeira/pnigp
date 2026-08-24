// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_aspec_nominal.mjs — folha NOMINAL (nome·órgão·cargo·função·salário) dos municípios ASPEC que
// alimentam o módulo de folha do governotransparente.
//
// ⭐ ONDE A FOLHA ESTAVA ESCONDIDA: a página /transparencia/folha/{acessoinfoId} embute um IFRAME para o subdomínio
// `folha.governotransparente.com.br/{folhaId}/fon`. O levantamento por "link externo" NÃO via isso (procurava href,
// não iframe). O folhaId ≠ acessoinfoId; e em muitos municípios o iframe vem VAZIO (`//fon`) = módulo não alimentado.
//
// CADEIA (tudo GET; UA de navegador + Referer):
//   1) GET /transparencia/folha/{acessoinfoId}  → iframe `folha.governotransparente.com.br/{folhaId}/fon`
//   2) GET /{folhaId}/fon                        → competência vigente (a mais frequente nos links listar-por)
//   3) GET /{folhaId}/fon/listar-por/export-funcionarios-csv?competencia={AAAAMM}  → CSV NOMINAL COMPLETO
// Colunas do CSV: ,Competência,Matrícula,Nome,Órgão,Setor,Cargo,Cargo2,Provento,Desconto,Líquido. Dinheiro "R$ 2.750,68".
//   Órgão = secretaria · Cargo2 = função/2º cargo · Provento = bruto · Líquido = líquido.
//
// Uso: node scripts/ingest_folha_aspec_nominal.mjs            (todos os aspec do radar com acessoinfo_id)
//      SO=Camocim node scripts/ingest_folha_aspec_nominal.mjs (um município)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const G = "https://www.governotransparente.com.br", F = "https://folha.governotransparente.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const H = (ref) => ({ "user-agent": UA, referer: ref || G + "/" });
const SO = process.env.SO || null;
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_aspec (
  cod_ibge text, municipio text, uf text, folha_id text, competencia text,
  matricula text, nome text, orgao text, secretaria text, setor text, cargo text, funcao text,
  provento numeric, desconto numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_faspecnom_mun on folha_servidores_aspec (cod_ibge)`);
// ⭐ 21/ago/2026: PODER=legislativo colhe a CÂMARA no mesmo produto (outro `acessoinfo_id`). A coluna mantém a
//    folha do legislativo fora da conta da prefeitura e dentro de `vw_folha_camara_brasil`.
await q(`alter table folha_servidores_aspec add column if not exists poder text`);
await q(`create table if not exists folha_aspec_nom_coleta (
  cod_ibge text primary key, municipio text, uf text, folha_id text, competencia text,
  servidores int, situacao text, detalhe text, em timestamptz default now()
)`);

async function baixa(url, ref, tent = 3) {
  for (let t = 0; t < tent; t++) {
    try {
      const r = await fetch(url, { headers: H(ref), redirect: "follow", signal: AbortSignal.timeout(120000) });
      if (!r.ok) { if (r.status === 403 || r.status >= 500) { await dorme(1200 * (t + 1)); continue; } return null; }
      return await r.text();
    } catch { await dorme(1200 * (t + 1)); }
  }
  return null;
}
function parseCSV(text) {
  const rows = []; let row = [], field = "", inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inq = false; } else field += c; }
    else { if (c === '"') inq = true; else if (c === ",") { row.push(field); field = ""; } else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else if (c === "\r") {} else field += c; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const money = (s) => { const t = String(s || "").replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."); const n = parseFloat(t); return Number.isFinite(n) ? n : null; };

// descobre folhaId (iframe) e competência vigente (a mais frequente nos links listar-por)
async function descobreFolha(acessoinfoId) {
  const fp = await baixa(`${G}/transparencia/folha/${acessoinfoId}`);
  if (!fp) return { erro: "sem_pagina_folha" };
  const ifr = (fp.match(/folha\.governotransparente\.com\.br\/(\d+)\/fon/i) || [])[1];
  if (!ifr) return { erro: "iframe_vazio" }; // módulo não alimentado (//fon)
  const home = await baixa(`${F}/${ifr}/fon`, `${G}/`);
  if (!home) return { folhaId: ifr, erro: "sem_home_folha" };
  // competência = a mais frequente entre os links listar-por/*/AAAAMM (o menu usa a vigente ~4×; o year-list 1× cada).
  // fallback: se nenhum mês 01-12 (alguns municípios só têm competência consolidada AAAA99), usa a MAIOR competência.
  const all = [...home.matchAll(/listar-por\/\w+\/(\d{6})/g)].map((m) => m[1]);
  if (!all.length) return { folhaId: ifr, erro: "sem_competencia" };
  const freq = new Map();
  for (const c of all) { if (+c.slice(4) >= 1 && +c.slice(4) <= 12) freq.set(c, (freq.get(c) || 0) + 1); }
  const comp = freq.size
    ? [...freq.entries()].sort((a, b) => b[1] - a[1] || (b[0] > a[0] ? 1 : -1))[0][0]
    : [...new Set(all)].sort().pop();
  return { folhaId: ifr, competencia: comp };
}

// alvos: diretório NACIONAL (aspec_diretorio, ~629 cidades das 9 UFs) + os 76 do radar (folha_aspec_coleta).
// Chave = cod_ibge; prioriza o diretório nacional. DIR_ONLY=1 usa só o diretório.
const usaDir = await q(`select count(*) c from aspec_diretorio where acessoinfo_id is not null and cod_ibge is not null`).then((r) => +r.rows[0].c > 0).catch(() => false);
const PODER = (process.env.PODER || "executivo").toLowerCase();
const alvos = usaDir
  ? (await q(`select d.cod_ibge, coalesce(m.nome, d.municipio_gt) municipio, d.uf, d.acessoinfo_id
       from aspec_diretorio d left join municipios_br m on m.cod_ibge=d.cod_ibge
      where d.acessoinfo_id is not null and d.cod_ibge is not null
      ${SO ? "and coalesce(m.nome, d.municipio_gt) ilike '%'||$1||'%'" : ""}
      ${process.env.DIR_ONLY ? "" : `
      union
      select c.cod_ibge, c.municipio, c.uf, c.acessoinfo_id from folha_aspec_coleta c
       where c.acessoinfo_id is not null and c.cod_ibge not in (select cod_ibge from aspec_diretorio where cod_ibge is not null)
       ${SO ? "and c.municipio ilike '%'||$1||'%'" : ""}`}
      order by 3, 2`, SO ? [SO] : [])).rows
  : (await q(`select c.cod_ibge, c.municipio, c.uf, c.acessoinfo_id from folha_aspec_coleta c
      where c.acessoinfo_id is not null ${SO ? "and c.municipio ilike '%'||$1||'%'" : ""} order by c.uf, c.municipio`, SO ? [SO] : [])).rows;
// REFAZ=1 reprocessa quem ja esta ok — sem isso, conserto de campo nao alcanca quem ja foi coletado
await q(`alter table folha_aspec_nom_coleta add column if not exists poder text not null default 'executivo'`);
await q(`do $do$ begin
  if exists (select 1 from pg_constraint where conname = 'folha_aspec_nom_coleta_pkey'
               and (select count(*) from unnest(conkey)) = 1) then
    alter table folha_aspec_nom_coleta drop constraint folha_aspec_nom_coleta_pkey;
    alter table folha_aspec_nom_coleta add primary key (cod_ibge, poder);
  end if;
end $do$`);

// ⭐ PODER=legislativo: o id do ASPEC vem DENTRO da URL do portal da câmara
//    (`portaldoservidor.aspec.com.br/230625602`, `governotransparente.com.br/14029588`) — mesmo produto, outro
//    `acessoinfo_id`. Sem id na URL o alvo NÃO entra: adivinhar id é inventar dado.
if (PODER === "legislativo") {
  alvos.length = 0;
  for (const r of (await q(`select cod_ibge, municipio, uf, coalesce(url_erp_camara, url_camara, url_camara_2) url
      from folha_camara_fila where coalesce(erp_camara,'') = 'aspec'
        ${SO ? "and municipio ilike '%'||$1||'%'" : ""}
      order by rais_legislativo desc nulls last`, SO ? [SO] : [])).rows) {
    const m = String(r.url || "").match(/(?:aspec\.com\.br|governotransparente\.com\.br)\/([0-9]{5,})/);
    if (m) alvos.push({ cod_ibge: r.cod_ibge, municipio: r.municipio, uf: r.uf, acessoinfo_id: m[1] });
  }
  console.log(`[aspec-nominal] PODER=legislativo · ${alvos.length} câmaras com id do ASPEC na URL`);
}

const feitos = process.env.REFAZ === "1" ? new Set() : new Set((await q(`select cod_ibge from folha_aspec_nom_coleta where situacao='ok' and poder=$1`, [PODER])).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[aspec-nominal] ${alvos.length} municípios ASPEC · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_aspec
      (cod_ibge,municipio,uf,folha_id,competencia,matricula,nome,orgao,secretaria,setor,cargo,funcao,provento,desconto,liquido,_hash,poder)
      select *, '${PODER}'::text from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::text[])
      on conflict (_hash) do update set provento=excluded.provento, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("folha_id"), c("competencia"), c("matricula"), c("nome"),
       c("orgao"), c("secretaria"), c("setor"), c("cargo"), c("funcao"), c("provento"), c("desconto"), c("liquido"), c("_hash")]);
  }
}

let okN = 0, semN = 0, falhaN = 0, totServ = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, folhaId = null, comp = null, serv = 0) =>
    q(`insert into folha_aspec_nom_coleta (cod_ibge,municipio,uf,folha_id,competencia,servidores,situacao,detalhe,poder,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge,poder) do update set
       folha_id=excluded.folha_id, competencia=excluded.competencia, servidores=excluded.servidores,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, folhaId, comp, serv, situacao, detalhe, PODER]);
  try {
    const d = await descobreFolha(a.acessoinfo_id);
    if (d.erro && !d.folhaId) { await marca(d.erro === "iframe_vazio" ? "sem_folha_nominal" : "erro", d.erro); semN++; console.log(`  · [${i + 1}/${fila.length}] ${a.uf.slice(0, 8)} ${a.municipio}: ${d.erro}`); continue; }
    if (d.erro) { await marca("erro", d.erro, d.folhaId); falhaN++; console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${d.erro}`); continue; }
    const csv = await baixa(`${F}/${d.folhaId}/fon/listar-por/export-funcionarios-csv?competencia=${d.competencia}`, `${F}/${d.folhaId}/fon`);
    if (!csv) { await marca("erro", "csv_falhou", d.folhaId, d.competencia); falhaN++; continue; }
    const rows = parseCSV(csv);
    if (rows.length < 2) { await marca("vazio", "csv sem linhas", d.folhaId, d.competencia); semN++; continue; }
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const ci = { comp: head.indexOf("competência"), mat: head.indexOf("matrícula"), nome: head.indexOf("nome"),
      org: head.indexOf("órgão"), set: head.indexOf("setor"), carg: head.indexOf("cargo"), carg2: head.indexOf("cargo2"),
      prov: head.indexOf("provento"), desc: head.indexOf("desconto"), liq: head.indexOf("líquido") };
    const regs = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]; if (row.length < 6) continue;
      const nome = (row[ci.nome] || "").trim(); if (!nome || /^total$/i.test(nome)) continue;
      const orgao = (row[ci.org] || "").trim();
      regs.push({
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, folha_id: d.folhaId, competencia: (row[ci.comp] || d.competencia).trim(),
        matricula: (row[ci.mat] || "").trim(), nome, orgao, secretaria: orgao, setor: (row[ci.set] || "").trim(),
        cargo: (row[ci.carg] || "").trim(), funcao: (row[ci.carg2] || "").trim(),
        provento: money(row[ci.prov]), desconto: money(row[ci.desc]), liquido: money(row[ci.liq]),
        _hash: crypto.createHash("md5").update([a.cod_ibge, (row[ci.comp] || d.competencia), row[ci.mat], nome, row[ci.carg]].join("¦")).digest("hex"),
      });
    }
    if (!regs.length) { await marca("vazio", "sem servidores", d.folhaId, d.competencia); semN++; continue; }
    await grava(regs);
    totServ += regs.length; okN++;
    await marca("ok", null, d.folhaId, d.competencia, regs.length);
    console.log(`  ✔ [${i + 1}/${fila.length}] ${a.uf.slice(0, 8)} ${a.municipio}: ${regs.length} servidores (comp ${d.competencia}, id ${d.folhaId})`);
  } catch (e) {
    falhaN++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  }
  await dorme(500);
}
console.log(`\n[aspec-nominal] ${okN} ok · ${semN} sem folha nominal · ${falhaN} falhas · ${totServ.toLocaleString("pt-BR")} servidores`);
console.log("\n═══ Censo: destino da folha dos ASPEC ═══");
console.table((await q(`select situacao, count(*) municipios from folha_aspec_nom_coleta group by 1 order by 2 desc`)).rows);
console.table((await q(`select uf, count(*) filter (where situacao='ok') com_nominal, count(*) total,
  sum(servidores) servidores from folha_aspec_nom_coleta group by uf order by 3 desc`)).rows);
await db.end();
