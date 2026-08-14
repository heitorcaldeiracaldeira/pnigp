// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_epublica.mjs — folha dos municípios que usam o e-Pública (Pública Tecnologia).
//
// ⭐ É a fonte mais rica das quatro de ERP: além de cargo e salário, tem um campo **`secretaria` PRÓPRIO** —
// nenhuma outra traz isso explícito (na Betha vem `orgao`, no IPM `cncdescricao`, no Farol precisa ser derivado).
// Traz ainda unidade gestora, vínculo, situação, carga horária, classe/nível e os eventos da folha.
//
// A API é REST limpa: POST /epublica-portal/rest/{slug}/gestaoDePessoal/servidores/listAll?exercicio=N
//
// 🚨 DUAS ARMADILHAS:
//   1. SOFT-404 — município inexistente responde 200 com o MESMO corpo. Só `rows` não-vazio prova que o portal
//      existe ([[pnigp-sonda-soft404-falso-positivo]]).
//   2. PAGINAÇÃO 1-BASED no request: {"pagination":{"page":1,"count":300}} é a PRIMEIRA página; `page:0` devolve
//      `rows: null`. E o parâmetro do tamanho é `count` — `size` é o TOTAL de registros, não o da página.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const BASE = "https://transparencia.e-publica.net/epublica-portal/rest";
const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const PAGINA = 300;

await q(`create table if not exists folha_servidores_epublica (
  cod_ibge text, municipio text, uf text, unidade_gestora text, competencia text,
  nome text, cpf_masc text, matricula text, cargo text, secretaria text, local text,
  vinculo text, situacao text, tipo_contratacao text, carga_horaria text, classe text, nivel text, funcao text,
  data_admissao text, vantagens numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_ep_mun on folha_servidores_epublica (cod_ibge, competencia)`);
await q(`create table if not exists folha_epublica_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

async function pagina(slug, p) {
  const url = `${BASE}/${slug}/gestaoDePessoal/servidores/listAll`;
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0)" },
        body: JSON.stringify({ pagination: { page: p, count: PAGINA } }),
        signal: AbortSignal.timeout(180000),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { if (t === 3) throw e; await new Promise((s) => setTimeout(s, 3000 * (t + 1))); }
  }
}

const alvos = (await q(`select p.cod_ibge, p.slug, m.nome municipio, m.uf
  from erp_portal_municipal p join municipios_br m on m.cod_ibge = p.cod_ibge
 where p.erp='epublica' ${UF ? "and m.uf = $1" : ""} ${SO ? `and m.nome ilike '%' || $${UF ? 2 : 1} || '%'` : ""}
 order by m.uf, m.nome`, [UF, SO].filter(Boolean))).rows;
const feitos = new Set((await q(`select cod_ibge from folha_epublica_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[e-publica] ${alvos.length} portais · ${feitos.size} feitos · ${fila.length} na fila`);

const num = (v) => (v == null || v === "" ? null : Number(v));
const LOTE = 1000;
async function grava(todos) {
  const m = new Map();
  for (const r of todos) m.set(r._hash, r);
  const regs = [...m.values()];
  for (let i = 0; i < regs.length; i += LOTE) {
    const p = regs.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_epublica
      (cod_ibge,municipio,uf,unidade_gestora,competencia,nome,cpf_masc,matricula,cargo,secretaria,local,
       vinculo,situacao,tipo_contratacao,carga_horaria,classe,nivel,funcao,data_admissao,
       vantagens,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::text[],$17::text[],
        $18::text[],$19::text[],$20::numeric[],$21::numeric[],$22::numeric[],$23::text[])
      on conflict (_hash) do update set vantagens=excluded.vantagens, descontos=excluded.descontos,
        liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("unidade_gestora"), c("competencia"), c("nome"), c("cpf_masc"),
       c("matricula"), c("cargo"), c("secretaria"), c("local"), c("vinculo"), c("situacao"), c("tipo_contratacao"),
       c("carga_horaria"), c("classe"), c("nivel"), c("funcao"), c("data_admissao"),
       c("vantagens"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

let total = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, competencia = null, linhas = 0) =>
    q(`insert into folha_epublica_coleta (cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now())
       on conflict (cod_ibge) do update set competencia=excluded.competencia, linhas=excluded.linhas,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, competencia, linhas, situacao, detalhe]);
  try {
    const regs = [];
    let p = 1, totalReg = null;
    do {
      const j = await pagina(a.slug, p);
      totalReg = j.pagination?.size ?? 0;
      const linhas = j.rows || [];
      if (!linhas.length) break;
      for (const s of linhas) {
        const comp = s.anoReferencia && s.mesReferencia
          ? `${s.anoReferencia}${String(s.mesReferencia).padStart(2, "0")}` : null;
        regs.push({
          cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf,
          unidade_gestora: s.unidadeGestora?.denominacao ?? null, competencia: comp,
          nome: s.nome, cpf_masc: s.cpf, matricula: s.matricula, cargo: s.cargo,
          secretaria: s.secretaria || null, local: s.local || null, vinculo: s.vinculo,
          situacao: s.situacao, tipo_contratacao: s.tipoContratacao, carga_horaria: s.cargaHoraria,
          classe: s.classe, nivel: s.nivel, funcao: s.funcao, data_admissao: s.dataAdmissao_fmt || s.dataAdmissao,
          vantagens: num(s.valorVantagens), descontos: num(s.valorDescontos), liquido: num(s.valorSalarioLiquido),
          _hash: crypto.createHash("md5").update(String(s.id ?? [a.cod_ibge, comp, s.matricula, s.nome, s.cargo].join("¦"))).digest("hex"),
        });
      }
      p++;
    } while (regs.length < totalReg && p <= 400);

    if (!regs.length) { await marca("vazio", "listAll sem linhas"); falhas++; continue; }
    await grava(regs);
    total += regs.length; ok++;
    await marca("ok", null, regs[0]?.competencia || null, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${regs.length} servidores`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 200));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 80)}`);
  }
}
console.log(`\n[e-publica] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${falhas} falhas`);
await db.end();
