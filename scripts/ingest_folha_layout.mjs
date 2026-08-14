// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_layout.mjs — folha NOMINAL COM SALÁRIO + SECRETARIA dos municípios Layout Sistemas (~324 entidades, PA-heavy).
//
// ⭐ API REST DRF LIMPA (HTTP direto, sem WAF): `apitransparencia.layoutsistemas.com.br/api/`
//   - entidades/?page_size=9999           → DIRETÓRIO de TODAS as entidades {id, codigo, cnpj, descricao, uf}
//   - transparencias/?entidade=ID&exercicio=AAAA → publicações {id, competencia_display, tipo(1=Normal), sequencial}
//   - resumoservidores/?entidade=ID&transparencia=TID&page=N&page_size=N
//       → {count, next, results:[{nome,cpf,vinculo,cargo,departamento(=secretaria),carga_horaria,data_admissao,
//          situacao_funcional,total_proventos,salario,total_descontos,liquido,unidade_trabalho}]}
//
// Descoberta ZERO — o próprio diretório /entidades/ lista tudo. Map município via descricao ("PREFEITURA MUNICIPAL
// DE X") + uf. Números "2.744,38" (vírgula decimal). Ver [[pnigp-cr2-catalogo-diretorio-para]].
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const EXERCICIO = Number(process.env.EXERCICIO || 2026);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", accept: "application/json" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists folha_servidores_layout (
  cod_ibge text, municipio text, uf text, entidade_id text, codigo text, competencia text,
  matricula text, nome text, cpf_masc text, cargo text, vinculo text, departamento text, secretaria text,
  situacao text, data_admissao text, carga_horaria text,
  total_proventos numeric, salario numeric, total_descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_lay_mun on folha_servidores_layout (cod_ibge, competencia)`);
await q(`create table if not exists folha_layout_coleta (
  entidade_id text primary key, codigo text, cod_ibge text, municipio text, uf text, competencia text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const num = (s) => { if (s == null) return null; const t = String(s).replace(/\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };
const B = "https://apitransparencia.layoutsistemas.com.br/api";
async function api(caminho) {
  for (let t = 0; t < 3; t++) {
    try { const r = await fetch(`${B}${caminho}`, { headers: UA, signal: AbortSignal.timeout(60000) }); if (r.ok) return await r.json(); if (r.status >= 500 && t < 2) { await dorme(2500 * (t + 1)); continue; } return null; }
    catch { await dorme(2500 * (t + 1)); }
  }
  return null;
}
try { await q(`create extension if not exists unaccent`); } catch {}

async function resolveMun(ent) {
  const md = String(ent.descricao || "").match(/(?:PREFEITURA|MUNICIPIO|CAMARA)[^A-Za-zÀ-ú]*(?:MUNICIPAL\s+)?(?:DE\s+|DO\s+|DA\s+)?(.+)$/i);
  const cidade = md ? md[1].trim() : ent.descricao;
  const uf = (ent.uf || "").toUpperCase();
  if (!cidade) return null;
  const r = (await q(`select cod_ibge, nome, uf from municipios_br where regexp_replace(lower(unaccent(nome)),'[^a-z0-9]','','g')=$1 ${uf ? "and uf=$2" : ""} limit 1`, uf ? [norm(cidade), uf] : [norm(cidade)])).rows[0];
  return r || null;
}

// diretório de entidades
const dir = await api(`/entidades/?page_size=9999`);
let entidades = (dir?.results || []).filter((e) => /PREFEITURA/i.test(e.descricao || ""));
if (SO) entidades = entidades.filter((e) => new RegExp(SO, "i").test(e.descricao || ""));
const feitos = new Set((await q(`select entidade_id from folha_layout_coleta where situacao='ok'`)).rows.map((r) => r.entidade_id));
const fila = entidades.filter((e) => !feitos.has(String(e.id)));
console.log(`[layout] ${entidades.length} prefeituras no diretório · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_layout
      (cod_ibge,municipio,uf,entidade_id,codigo,competencia,matricula,nome,cpf_masc,cargo,vinculo,departamento,secretaria,
       situacao,data_admissao,carga_horaria,total_proventos,salario,total_descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],$9::text[],
        $10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::text[],$17::numeric[],$18::numeric[],$19::numeric[],$20::numeric[],$21::text[])
      on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade_id"), c("codigo"), c("competencia"), c("matricula"), c("nome"),
       c("cpf_masc"), c("cargo"), c("vinculo"), c("departamento"), c("secretaria"), c("situacao"), c("data_admissao"),
       c("carga_horaria"), c("total_proventos"), c("salario"), c("total_descontos"), c("liquido"), c("_hash")]);
  }
}

let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const e = fila[i];
  const marca = (situacao, mun, comp, detalhe, linhas = 0) =>
    q(`insert into folha_layout_coleta (entidade_id,codigo,cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (entidade_id) do update set
       cod_ibge=excluded.cod_ibge, municipio=excluded.municipio, uf=excluded.uf, competencia=excluded.competencia,
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [String(e.id), e.codigo, mun?.cod_ibge, mun?.nome, mun?.uf, comp, linhas, situacao, detalhe]);
  try {
    const mun = await resolveMun(e);
    // transparência mais recente — prefere tipo=1 (Normal), mas aceita QUALQUER tipo se não houver Normal
    const pega = (res) => { const arr = res?.results || []; return arr.filter((t) => t.tipo === 1)[0] || arr[0] || null; };
    let pub = pega(await api(`/transparencias/?entidade=${e.id}&exercicio=${EXERCICIO}`));
    if (!pub) pub = pega(await api(`/transparencias/?entidade=${e.id}&exercicio=${EXERCICIO - 1}`));
    if (!pub) pub = pega(await api(`/transparencias/?entidade=${e.id}`)); // sem filtro de exercício
    if (!pub) { await marca("sem_competencia", mun, null, "sem publicação"); vazios++; continue; }
    const comp = String(pub.competencia_display || "").replace(/\s/g, ""); // "Julho/2026"
    // pagina servidores
    const regs = []; let page = 1, count = null;
    while (true) {
      const j = await api(`/resumoservidores/?entidade=${e.id}&transparencia=${pub.id}&page=${page}&page_size=500`);
      const arr = j?.results || [];
      if (count == null) count = j?.count || 0;
      for (const s of arr) regs.push({
        cod_ibge: mun?.cod_ibge, municipio: mun?.nome, uf: mun?.uf, entidade_id: String(e.id), codigo: e.codigo, competencia: comp,
        matricula: String(s.matricula ?? s.id ?? ""), nome: s.nome, cpf_masc: s.cpf, cargo: s.cargo, vinculo: s.vinculo,
        departamento: s.departamento, secretaria: s.departamento || s.unidade_trabalho, situacao: s.situacao_funcional,
        data_admissao: s.data_admissao, carga_horaria: String(s.carga_horaria ?? ""),
        total_proventos: num(s.total_proventos), salario: num(s.salario), total_descontos: num(s.total_descontos), liquido: num(s.liquido),
        _hash: crypto.createHash("md5").update([e.id, comp, s.id ?? s.matricula, s.nome, s.cargo].join("¦")).digest("hex"),
      });
      if (!j?.next || !arr.length) break;
      page++;
      if (page > 500) break;
    }
    if (!regs.length) { await marca("vazio", mun, comp, "sem servidores"); vazios++; continue; }
    await grava(regs);
    totalGeral += regs.length; ok++;
    await marca("ok", mun, comp, null, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${mun?.uf || e.uf} ${mun?.nome || e.descricao?.slice(0, 30)}: ${regs.length} (${comp})`);
  } catch (err) {
    falhas++; await marca("erro", null, null, String(err.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${e.descricao?.slice(0, 30)}: ${String(err.message).slice(0, 60)}`);
  }
  await dorme(300);
}
console.log(`\n[layout] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
