// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_topsolutions.mjs — folha NOMINAL dos municípios TOP SOLUTIONS (dominante no RN).
//
// ⭐ API JSON pura, sem navegador, sem sessão, sem paginar:
//    GET https://pm{slug}{uf}.apitransparencia.topsolutionsrn.com.br/Servidor/ServidorPorMesAnoAsync?numMes=MM&numAno=AAAA
//    → [{ nome, cpf, vinculo, cargo, funcao, cargoFuncao, orgao, numMatricula, cargaHoraria,
//         vlrRemuneracaoBruta, vlrDescontosObrigatorios, vlrDescontoOutros, dtMesAno, idTipoFolha,
//         dataExercicio, dataVacancia }]
//    Macau 2.250 · Parnamirim 5.960 numa única chamada.
//
// ⭐ O host é DERIVÁVEL do nome do município — por isso o produto foi enumerável:
//    `descobre_topsolutions.mjs` achou 51 dos 103 municípios do RN sem folha.
// ⚠️ `orgao` é a SECRETARIA. `vlrRemuneracaoBruta` é o bruto (nunca usar `vlrRemuAposDescObrig`, que é líquido).
// ⚠️ `idTipoFolha` separa a folha regular das demais — guardado para a view filtrar se preciso.
//
// Uso: UF=RN node scripts/ingest_folha_topsolutions.mjs   ·   SO=Macau   ·   REFAZ=1   ·   RECUO=6
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RN";
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const RECUO = Number(process.env.RECUO || 6);
const CONC = Number(process.env.CONC || 4);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", accept: "application/json" };

await q(`create table if not exists folha_servidores_topsolutions (
  cod_ibge text, municipio text, uf text, host text, competencia text,
  secretaria text, matricula text, nome text, cpf_masc text, cargo text, funcao text, vinculo text,
  carga_horaria text, tipo_folha text, data_admissao text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_tops_mun on folha_servidores_topsolutions (cod_ibge, competencia)`);
// ⚠️ tabelas já existiam de trabalho anterior: a de coleta NÃO tem `uf`, e a de servidores usa
//    `secretaria` (não `orgao`) e tem `situacao`. Respeitar o esquema existente em vez de recriar.
await q(`create table if not exists folha_topsolutions_coleta (
  cod_ibge text primary key, municipio text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const txt = (s) => { const v = String(s ?? "").replace(/\s+/g, " ").trim(); return v || null; };
const num = (v) => (v == null || v === "" ? null : (Number.isFinite(+v) ? +v : null));

const alvos = (await q(`select cod_ibge, municipio, host from folha_host_candidato
  where uf = $1 and produto = 'topsolutions' ${SO ? "and municipio ilike '%'||$2||'%'" : ""}
  order by municipio`, SO ? [UF, SO] : [UF])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_topsolutions_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[topsolutions] ${UF}: ${alvos.length} candidatos · ${fila.length} na fila`);

const LOTE = 2000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_topsolutions
      (cod_ibge,municipio,uf,host,competencia,secretaria,matricula,nome,cpf_masc,cargo,funcao,vinculo,
       carga_horaria,tipo_folha,data_admissao,bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],
        $16::numeric[],$17::numeric[],$18::numeric[],$19::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("secretaria"), c("matricula"), c("nome"),
       c("cpf_masc"), c("cargo"), c("funcao"), c("vinculo"), c("carga_horaria"), c("tipo_folha"),
       c("data_admissao"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
async function trata(a) {
  const marca = (situacao, detalhe, linhas = 0, comp = null) =>
    q(`insert into folha_topsolutions_coleta (cod_ibge,municipio,host,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set
       host=excluded.host, competencia=excluded.competencia, linhas=excluded.linhas,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.host, comp, linhas, situacao, detalhe]);
  try {
    // ⭐ do mês corrente para trás: para no primeiro com dado
    let regs = null, comp = null;
    const hoje = new Date();
    for (let k = 0; k < RECUO && !regs; k++) {
      const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
      const mes = String(d.getMonth() + 1).padStart(2, "0"), ano = String(d.getFullYear());
      let arr;
      try {
        const r = await fetch(`https://${a.host}/Servidor/ServidorPorMesAnoAsync?numMes=${mes}&numAno=${ano}`,
          { headers: UA, signal: AbortSignal.timeout(90000) });
        if (!r.ok) continue;
        const j = JSON.parse(await r.text());
        arr = Array.isArray(j) ? j : (j?.data || j?.dados || []);
      } catch { continue; }
      if (!Array.isArray(arr) || !arr.length) continue;
      const cmp = `${ano}${mes}`;
      const saida = arr.filter((s) => s?.nome && s?.vlrRemuneracaoBruta != null).map((s) => ({
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: UF, host: a.host, competencia: cmp,
        secretaria: txt(s.orgao), matricula: txt(s.numMatricula), nome: txt(s.nome), cpf_masc: txt(s.cpf),
        cargo: txt(s.cargoFuncao || s.cargo), funcao: txt(s.funcao), vinculo: txt(s.vinculo),
        carga_horaria: txt(s.cargaHoraria), tipo_folha: txt(s.idTipoFolha), data_admissao: txt(s.dataExercicio),
        bruto: num(s.vlrRemuneracaoBruta),
        descontos: (num(s.vlrDescontosObrigatorios) || 0) + (num(s.vlrDescontoOutros) || 0),
        liquido: num(s.vlrRemuAposDescObrig),
        _hash: crypto.createHash("md5").update([a.cod_ibge, cmp, s.numMatricula, s.nome, s.cargoFuncao].join("¦")).digest("hex"),
      }));
      if (saida.length) { regs = saida; comp = cmp; }
    }
    if (!regs) { await marca("vazio", `sem dado nas últimas ${RECUO} competências`); vazios++;
      console.log(`  · ${a.municipio}: vazio`); return; }
    await grava(regs);
    totalGeral += regs.length; ok++;
    await marca("ok", null, regs.length, comp);
    console.log(`  ${a.municipio.padEnd(26)} ${String(regs.length).padStart(5)} servidores · ${comp}`);
  } catch (e) {
    await marca("falha", String(e.message).slice(0, 160)); falhas++;
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  }
}

for (let i = 0; i < fila.length; i += CONC) await Promise.all(fila.slice(i, i + CONC).map(trata));
console.log(`\n[topsolutions] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
