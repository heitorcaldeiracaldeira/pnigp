// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_rpm.mjs — folha NOMINAL COM SALÁRIO + SECRETARIA dos municípios RPM Soluções (~88, PARÁ).
//
// ⭐ API REST LIMPA (HTTP direto, sem WAF/sessão): `folha.rpmsolucoes.com.br/api/transparencia/`
//   - instituicao?cnpj=N        → {cnpj, descricao, endereco("CIDADE/UF")}  (mapeia o município)
//   - competencias?cnpj=N       → lista de "MM/AAAA" (mais recente 1º)
//   - servidores?cnpj=N&competencia=MM/AAAA&page=0&size=100&tipoFolha=Folha normal
//       → {content:[{matricula,nome,cpfMascarado,cargo,funcao,vinculo,lotacao,unidadeOrcamentaria(=secretaria),
//          admissao,horaSemanal,totalVantagens,totalDescontos,valorLiquido}], totalElements, totalPages}
//
// Os CNPJs saem do CATÁLOGO Bubble do CR2 (`rpm_catalogo`, harvestado de portalcr2.../relacao_nominal_remuneracao —
// ver [[pnigp-cr2-catalogo-diretorio-para]]). Números já numéricos no JSON. tipoFolha "Folha normal" (a mensal).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const TENTATIVAS = Number(process.env.TENTATIVAS || 6); // competências a descer antes de declarar vazio
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", accept: "application/json" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists folha_servidores_rpm (
  cod_ibge text, municipio text, uf text, cnpj text, competencia text,
  matricula text, nome text, cpf_masc text, cargo text, funcao text, vinculo text, lotacao text, secretaria text,
  admissao text, hora_semanal text, vantagens numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_rpm_mun on folha_servidores_rpm (cod_ibge, competencia)`);
await q(`create table if not exists folha_rpm_coleta (
  cnpj text primary key, cod_ibge text, municipio text, uf text, competencia text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);
await q(`create table if not exists rpm_catalogo (cnpj text primary key, nome_bubble text, em timestamptz default now())`);

const num = (v) => (v == null ? null : (Number.isFinite(+v) ? +v : null));
const B = "https://folha.rpmsolucoes.com.br/api/transparencia";
async function api(caminho) {
  for (let t = 0; t < 3; t++) {
    try { const r = await fetch(`${B}${caminho}`, { headers: UA, signal: AbortSignal.timeout(60000) }); if (r.ok) return await r.json(); if (r.status >= 500 && t < 2) { await dorme(2500 * (t + 1)); continue; } return null; }
    catch { await dorme(2500 * (t + 1)); }
  }
  return null;
}

// mapeia CNPJ → município via a descricao/endereco da instituicao
async function resolveMun(inst) {
  if (!inst) return null;
  // endereco "AV ... - CIDADE/PARA"; ou descricao "PREFEITURA MUNICIPAL DE X"
  let cidade = null, uf = null;
  const me = String(inst.endereco || "").match(/([A-Za-zÀ-ú' ]+)\/([A-Za-zÀ-ú ]+)\s*$/);
  if (me) { cidade = me[1].trim(); uf = me[2].trim(); }
  if (!cidade) { const md = String(inst.descricao || "").match(/(?:PREFEITURA|MUNICIPIO|CAMARA)[^A-Za-zÀ-ú]*(?:MUNICIPAL\s+)?(?:DE\s+|DO\s+|DA\s+)?(.+)$/i); if (md) cidade = md[1].trim(); }
  if (!cidade) return null;
  const ufSig = { "para": "PA", "pará": "PA", "amazonas": "AM", "maranhao": "MA", "maranhão": "MA", "piaui": "PI", "piauí": "PI", "bahia": "BA", "amapa": "AP", "amapá": "AP", "tocantins": "TO" };
  const ufN = ufSig[norm(uf)] || (uf && uf.length === 2 ? uf.toUpperCase() : null);
  const r = (await q(`select cod_ibge, nome, uf from municipios_br where regexp_replace(lower(unaccent(nome)),'[^a-z0-9]','','g')=$1 ${ufN ? "and uf=$2" : ""} limit 1`, ufN ? [norm(cidade), ufN] : [norm(cidade)])).rows[0];
  return r || null;
}

let alvos = (await q(`select cnpj, nome_bubble from rpm_catalogo ${SO ? "where nome_bubble ilike '%'||$1||'%'" : ""}`, SO ? [SO] : [])).rows;
const feitos = new Set((await q(`select cnpj from folha_rpm_coleta where situacao='ok'`)).rows.map((r) => r.cnpj));
const fila = alvos.filter((a) => !feitos.has(a.cnpj));
console.log(`[rpm] ${alvos.length} CNPJs · ${fila.length} na fila`);

try { await q(`create extension if not exists unaccent`); } catch {}
const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_rpm
      (cod_ibge,municipio,uf,cnpj,competencia,matricula,nome,cpf_masc,cargo,funcao,vinculo,lotacao,secretaria,admissao,hora_semanal,vantagens,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::numeric[],$17::numeric[],$18::numeric[],$19::text[])
      on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("cnpj"), c("competencia"), c("matricula"), c("nome"), c("cpf_masc"),
       c("cargo"), c("funcao"), c("vinculo"), c("lotacao"), c("secretaria"), c("admissao"), c("hora_semanal"),
       c("vantagens"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, mun, comp, detalhe, linhas = 0) =>
    q(`insert into folha_rpm_coleta (cnpj,cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cnpj) do update set
       cod_ibge=excluded.cod_ibge, municipio=excluded.municipio, uf=excluded.uf, competencia=excluded.competencia,
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cnpj, mun?.cod_ibge, mun?.nome, mun?.uf, comp, linhas, situacao, detalhe]);
  try {
    const inst = await api(`/instituicao?cnpj=${a.cnpj}`);
    const mun = await resolveMun(inst);
    const comps = await api(`/competencias?cnpj=${a.cnpj}`);
    const lista = Array.isArray(comps) ? comps : (comps?.content || comps?.competencias || []);
    const candidatas = lista.map((x) => x?.competencia || x).filter(Boolean);
    if (!candidatas.length) { await marca("sem_competencia", mun, null, "sem competência"); vazios++; continue; }

    // colhe uma competência inteira (a API pagina de 200 em 200)
    const colhe = async (comp) => {
      const out = []; let page = 0, totalPag = 1;
      while (page < totalPag) {
        const j = await api(`/servidores?cnpj=${a.cnpj}&competencia=${encodeURIComponent(comp)}&page=${page}&size=200&tipoFolha=${encodeURIComponent("Folha normal")}`);
        const arr = j?.content || [];
        if (page === 0) totalPag = j?.totalPages || 1;
        for (const s of arr) out.push({
          cod_ibge: mun?.cod_ibge, municipio: mun?.nome, uf: mun?.uf, cnpj: a.cnpj, competencia: String(comp).replace("/", "").replace(/(\d{2})(\d{4})/, "$2$1"),
          matricula: String(s.matricula ?? ""), nome: s.nome, cpf_masc: s.cpfMascarado, cargo: s.cargo, funcao: s.funcao,
          vinculo: s.vinculo, lotacao: s.lotacao, secretaria: s.unidadeOrcamentaria, admissao: s.admissao, hora_semanal: String(s.horaSemanal ?? ""),
          vantagens: num(s.totalVantagens), descontos: num(s.totalDescontos), liquido: num(s.valorLiquido),
          _hash: crypto.createHash("md5").update([a.cnpj, comp, s.matricula, s.nome, s.cargo].join("¦")).digest("hex"),
        });
        page++;
        if (!arr.length) break;
      }
      return out;
    };

    // 🚨 antes só a competência lista[0] era tentada: se a folha mais recente ainda estava vazia, o município caía
    // em "sem servidores" e era perdido. Agora desce a lista até achar competência com gente.
    let regs = [], comp = null;
    for (const cand of candidatas.slice(0, TENTATIVAS)) {
      regs = await colhe(cand);
      if (regs.length) { comp = cand; break; }
    }
    if (!regs.length) { await marca("vazio", mun, candidatas[0], `sem servidores em ${Math.min(TENTATIVAS, candidatas.length)} competências`); vazios++; continue; }
    await grava(regs);
    totalGeral += regs.length; ok++;
    await marca("ok", mun, comp, null, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${mun?.uf || "?"} ${mun?.nome || inst?.descricao?.slice(0, 30)}: ${regs.length} (${comp})`);
  } catch (e) {
    falhas++; await marca("erro", null, null, String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.cnpj}: ${String(e.message).slice(0, 70)}`);
  }
  await dorme(400);
}
console.log(`\n[rpm] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
