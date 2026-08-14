// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_megasoft.mjs — folha nominal dos municípios do ERP MegaSoft ("Portal da Transparência", Angular SPA).
// Forte em Goiás (127 prefeituras identificadas pelo Radar da ATRICON).
//
// A folha vive no host de TRANSPARÊNCIA: `{slug}.megasofttransparencia.com.br` (NÃO no megasoftservicos/arrecadanet,
// que são tributos). A API é REST em `/api`.
//
// ⭐ A LEI de novo — o app manda mais do que a URL mostra:
//   1) GET /api/configuracao/carregamento-inicial  → devolve o campo `tokenPortal` (JWT ANÔNIMO, iss=megasoft
//      sub=api, exp ~24h — mesma categoria do token público da Betha, sem credencial).
//   2) Toda chamada de dados exige DOIS headers: `authorization: Bearer <tokenPortal>` E
//      `cliente-integrado: megasoft-portal-da-transparencia`. Sem eles → HTTP 500 "Obrigatório o uso de token".
//   3) GET /api/orgaos-e-servidores/servidor/data-ultimo-registro → "DD/MM/AAAA" da última competência.
//   4) GET /api/orgaos-e-servidores/servidor/paginado?ano=AAAA&mes=MM&pagina=N&tamanhoDaPagina=500 → {total,registros,paginaAtual}.
//
// Entrega (todos preenchidos): nome · matricula · cpf(masc) · cargo · departamento (=secretaria/lotação) ·
// tipoDeVinculo · situacao · cargaHoraria · dataAdmissao · proventos · descontos · totalLiquido.
// Números já vêm NUMÉRICOS no JSON (sem a armadilha do ponto decimal); ainda assim confere proventos−descontos=liquido.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const MESES_RECUO = Number(process.env.RECUO || 4); // quantos meses recuar se a competência mais recente vier vazia
const UA = "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_megasoft (
  cod_ibge text, municipio text, uf text, slug text, competencia text,
  matricula text, nome text, cpf_masc text, cargo text, departamento text, vinculo text,
  situacao text, situacao_pagamento text, carga_horaria text, data_admissao text,
  proventos numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_mega_mun on folha_servidores_megasoft (cod_ibge, competencia)`);
await q(`create table if not exists folha_megasoft_coleta (
  slug text primary key, cod_ibge text, municipio text, uf text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const num = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  // se vier string em formato brasileiro, o ponto é milhar e a vírgula é decimal
  const n = s.includes(",") ? +s.replace(/\./g, "").replace(",", ".") : +s;
  return Number.isFinite(n) ? n : null;
};

async function api(host, caminho, token) {
  const url = `https://${host}/api${caminho}`;
  const headers = { "user-agent": UA, accept: "application/json, text/plain, */*" };
  if (token) { headers.authorization = `Bearer ${token}`; headers["cliente-integrado"] = "megasoft-portal-da-transparencia"; }
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(90000) });
      if (r.ok) return await r.json();
      if (r.status >= 500 && t < 2) { await dorme(3000 * (t + 1)); continue; }
      return { _erro: `HTTP ${r.status}` };
    } catch (e) { if (t === 2) return { _erro: String(e?.cause?.message || e.message).slice(0, 120) }; await dorme(3000 * (t + 1)); }
  }
  return { _erro: "sem resposta" };
}

// alvos: prefeituras MegaSoft do Radar. Deriva o slug e SEMPRE aponta para o host de transparência.
const alvos = (await q(`select cod_ibge, municipio, uf, url_erp, url_portal from radar_portal
  where erp='megasoft' and unidade_gestora ilike 'Prefeitura%'
  ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by uf, municipio`, SO ? [SO] : [])).rows
  .map((a) => {
    const src = `${a.url_erp || ""} ${a.url_portal || ""}`;
    // slug do host megasoft* (transparencia/servicos/arrecadanet) — o mesmo slug serve o host de transparência
    const m = src.match(/([a-z0-9-]+)\.megasoft[a-z]*\.com\.br/i);
    return { ...a, slug: m ? m[1].toLowerCase() : null };
  }).filter((a) => a.slug);

const feitos = new Set((await q(`select slug from folha_megasoft_coleta where situacao='ok'`)).rows.map((r) => r.slug));
const fila = alvos.filter((a) => !feitos.has(a.slug));
console.log(`[megasoft] ${alvos.length} prefeituras · ${feitos.size} feitas · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map();
  for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_megasoft
      (cod_ibge,municipio,uf,slug,competencia,matricula,nome,cpf_masc,cargo,departamento,vinculo,
       situacao,situacao_pagamento,carga_horaria,data_admissao,proventos,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],
        $16::numeric[],$17::numeric[],$18::numeric[],$19::text[])
      on conflict (_hash) do update set proventos=excluded.proventos, descontos=excluded.descontos,
        liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("slug"), c("competencia"), c("matricula"), c("nome"), c("cpf_masc"),
       c("cargo"), c("departamento"), c("vinculo"), c("situacao"), c("situacao_pagamento"), c("carga_horaria"),
       c("data_admissao"), c("proventos"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

// deriva a lista de competências a tentar (mais recente primeiro), a partir de "DD/MM/AAAA"
function competencias(dataUltima) {
  const m = String(dataUltima || "").match(/(\d{2})\/(\d{4})$/);
  let ano, mes;
  if (m) { mes = +m[1]; ano = +m[2]; } else { const d = new Date(); ano = d.getFullYear(); mes = d.getMonth() + 1; }
  const out = [];
  for (let k = 0; k < MESES_RECUO; k++) {
    let mm = mes - k, aa = ano;
    while (mm <= 0) { mm += 12; aa -= 1; }
    out.push({ ano: aa, mes: String(mm).padStart(2, "0") });
  }
  return out;
}

let total = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const host = `${a.slug}.megasofttransparencia.com.br`;
  const marca = (situacao, detalhe, competencia = null, linhas = 0) =>
    q(`insert into folha_megasoft_coleta (slug,cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (slug) do update set
       competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.slug, a.cod_ibge, a.municipio, a.uf, competencia, linhas, situacao, detalhe]);
  try {
    const cfg = await api(host, "/configuracao/carregamento-inicial", null);
    const token = cfg && cfg.tokenPortal;
    if (!token) { await marca("sem_token", cfg?._erro || "portal sem tokenPortal"); falhas++; continue; }

    const ultima = await api(host, "/orgaos-e-servidores/servidor/data-ultimo-registro", token);
    const dataUltima = typeof ultima === "string" ? ultima : (ultima?.data || ultima?._erro || "");

    // acha a competência mais recente COM SALÁRIO PAGO. 🚨 o mês corrente costuma ter a LISTA de servidores mas
    // salário NULL (folha não fechou); só aceita a competência se pelo menos um registro tem proventos != null.
    let comp = null, primeira = null;
    for (const { ano, mes } of competencias(dataUltima)) {
      const pg = await api(host, `/orgaos-e-servidores/servidor/paginado?ano=${ano}&mes=${mes}&pagina=1&tamanhoDaPagina=500`, token);
      if (pg && Array.isArray(pg.registros) && pg.registros.length && pg.registros.some((r) => r.proventos != null || r.totalLiquido != null)) {
        comp = { ano, mes }; primeira = pg; break;
      }
    }
    if (!comp) { await marca("vazio", "sem competencia com salario pago"); vazios++; continue; }

    const totalReg = primeira.total || primeira.registros.length;
    const paginas = Math.ceil(totalReg / 500);
    const competencia = `${comp.ano}${comp.mes}`;
    const mapReg = (s) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, slug: a.slug, competencia,
      matricula: String(s.matricula ?? ""), nome: s.nome, cpf_masc: s.cpf, cargo: s.cargo,
      departamento: s.departamento, vinculo: s.tipoDeVinculo, situacao: s.situacao,
      situacao_pagamento: s.situacaoPagamento, carga_horaria: String(s.cargaHoraria ?? ""),
      data_admissao: s.dataAdmissao, proventos: num(s.proventos), descontos: num(s.descontos), liquido: num(s.totalLiquido),
      _hash: crypto.createHash("md5").update([a.slug, competencia, s.matricula, s.nome, s.cargo].join("¦")).digest("hex"),
    });

    await grava(primeira.registros.map(mapReg));
    let colhidas = primeira.registros.length;
    for (let p = 2; p <= paginas; p++) {
      const pg = await api(host, `/orgaos-e-servidores/servidor/paginado?ano=${comp.ano}&mes=${comp.mes}&pagina=${p}&tamanhoDaPagina=500`, token);
      if (!pg || !Array.isArray(pg.registros) || !pg.registros.length) break;
      await grava(pg.registros.map(mapReg));
      colhidas += pg.registros.length;
    }
    total += colhidas; ok++;
    await marca("ok", null, competencia, colhidas);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${colhidas} servidores (${competencia})`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 160));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 80)}`);
  }
  await dorme(300); // cortesia entre hosts (aqui cada município é um host próprio, então pode ser curta)
}
console.log(`\n[megasoft] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
