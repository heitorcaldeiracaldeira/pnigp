// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_spapublico.mjs — folha do portal SPA cuja API pública vive em `/publico/...`.
//
// O fornecedor NÃO se identifica (sem rodapé, sem marca, `title` genérico "Portal da Transparência"); a
// assinatura é a ROTA: SPA com `#/servidores` + `#/cargos` e REST em `/publico/servidor`, `/publico/buscarCliente`,
// `/publico/versao`. Aparece em domínio próprio (`transparencia.{mun}.mg.gov.br`) e em IP com porta 8444.
//
// ⭐ É das fontes mais completas que achamos: nomServidor · numMatricula · mesReferencia · **nomCargo** ·
// nomFuncaoExercida · **nomLotacao** (secretaria) · **nomLocalTrabalho** · indSituacao · **vlrSalarioBase** ·
// **vlrSalarioBruto** · vlrDesconto · **vlrSalarioLiquido** · datAdmissao · desCargaHoraria · verbas.
//
// 🚨 COMO O DIAGNÓSTICO ERRA AQUI: o menu tem "Cargos e Salários" (`#/cargos`) ANTES de "Pessoal"
// (`#/servidores`), e `diagnostica_faltantes` seguiu o primeiro — a tela de cargos é o padrão remuneratório e
// vem sem linhas, então 9 municípios foram marcados `tela_sem_linhas` tendo a folha completa ao lado.
//
// A lista sai por CLASSIFICAÇÃO (o total de cada uma vem em `buscarPorIndTipoClassificacao`):
//   EFE efetivo · COM comissionado · CON contratado · AGE agente político · APO aposentado · PEN pensionista ·
//   ETG estagiário · COC · OUT
//   GET /publico/servidor?elementosPorPagina=100&pagina=N&indTipoClassificacao=EFE&codCargo=0&indSituacao=null
//       &datAberturaInicio=AAAA-MM-DD&datAberturaFim=AAAA-MM-DD&codAdministracao=1&termoBase64=
//
// Uso: node scripts/ingest_folha_spapublico.mjs [UF=MG] [SO=Araporã] [REFAZ=1]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const CLASSES = ["EFE", "COM", "CON", "AGE", "APO", "PEN", "ETG", "COC", "OUT"];

await q(`create table if not exists folha_servidores_spapublico (
  cod_ibge text, municipio text, uf text, host text, competencia text,
  matricula text, nome text, cargo text, funcao text, secretaria text, local_trabalho text,
  vinculo text, situacao text, carga_horaria text, data_admissao text,
  salario_base numeric, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_spapub_mun on folha_servidores_spapublico (cod_ibge, competencia)`);
await q(`create table if not exists folha_spapublico_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

async function json(url) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.json();
}
const num = (v) => (v == null || v === "" ? null : (Number.isFinite(+v) ? +v : null));

const LOTE = 500;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const f = arr.slice(i, i + LOTE); const c = (k) => f.map((r) => r[k]);
    await q(`insert into folha_servidores_spapublico
      (cod_ibge,municipio,uf,host,competencia,matricula,nome,cargo,funcao,secretaria,local_trabalho,vinculo,
       situacao,carga_horaria,data_admissao,salario_base,bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],
        $16::numeric[],$17::numeric[],$18::numeric[],$19::numeric[],$20::text[])
      on conflict (_hash) do nothing`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("matricula"), c("nome"), c("cargo"),
       c("funcao"), c("secretaria"), c("local_trabalho"), c("vinculo"), c("situacao"), c("carga_horaria"),
       c("data_admissao"), c("salario_base"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

// alvos: o que o diagnóstico visitou e tem a assinatura da rota (#/cargos, #/servidores ou a porta 8444)
const alvos = (await q(`select distinct on (d.cod_ibge) d.cod_ibge, d.municipio, d.uf,
    split_part(regexp_replace(coalesce(d.url_pessoal, d.url_visitada),'^https?://',''),'/',1) host,
    coalesce(d.url_pessoal, d.url_visitada) url
  from folha_diagnostico_faltante d
 where (coalesce(d.url_pessoal,d.url_visitada) ilike '%#/cargos%'
        or coalesce(d.url_pessoal,d.url_visitada) ilike '%#/servidores%'
        or coalesce(d.url_pessoal,d.url_visitada) ilike '%:8444%')
   ${UF ? "and d.uf = $1" : ""} ${SO ? `and d.municipio ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
 order by d.cod_ibge, d.em desc`, [UF, SO].filter(Boolean))).rows;

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_spapublico_coleta where situacao like 'ok%'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[spapublico] ${alvos.length} portais · ${fila.length} na fila`);

// janela de 3 meses para trás, como a própria tela usa
const hoje = new Date(Date.UTC(2026, 7, 16));
const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 2, 1));
const fmt = (d) => d.toISOString().slice(0, 10);

let total = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const proto = /^http:/.test(a.url) ? "http" : "https";
  const marca = (situacao, detalhe = null, comp = null, linhas = 0) =>
    q(`insert into folha_spapublico_coleta (cod_ibge,municipio,uf,host,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (cod_ibge) do update set host=excluded.host, competencia=excluded.competencia,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.host, comp, linhas, situacao, detalhe]);
  try {
    const base = `${proto}://${a.host}/publico/servidor`;
    const par = `codCargo=0&indSituacao=null&datAberturaInicio=${fmt(ini)}&datAberturaFim=${fmt(hoje)}&codAdministracao=1&termoBase64=`;
    const linhas = [];
    for (const cls of CLASSES) {
      const n = await json(`${base}/buscarPorIndTipoClassificacao?indTipoClassificacao=${cls}&${par}`).catch(() => 0);
      if (!Number(n)) continue;
      for (let pag = 1; pag <= 200; pag++) {
        const j = await json(`${base}?elementosPorPagina=100&pagina=${pag}&${par}&indTipoClassificacao=${cls}`);
        const rows = j?.content || [];
        linhas.push(...rows);
        if (rows.length < 100) break;
        await dorme(200);
      }
      await dorme(250);
    }
    if (!linhas.length) { await marca("vazio", "todas as classificações vazias"); vazios++; continue; }

    const comp = String(linhas.find((r) => r.mesReferencia)?.mesReferencia ?? "");
    const regs = linhas.map((r) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, host: a.host,
      competencia: String(r.mesReferencia ?? comp),
      matricula: r.numMatricula != null ? String(r.numMatricula) : null,
      nome: r.nomServidor || null, cargo: r.nomCargo || null, funcao: r.nomFuncaoExercida || null,
      secretaria: r.nomLotacao || null, local_trabalho: r.nomLocalTrabalho || null,
      vinculo: r.desTipoClassificacao || r.indTipoClassificacao || null,
      situacao: r.desSituacao || r.indSituacao || null,
      carga_horaria: r.desCargaHoraria != null ? String(r.desCargaHoraria) : null,
      data_admissao: r.datAdmissao || null,
      salario_base: num(r.vlrSalarioBase), bruto: num(r.vlrSalarioBruto),
      descontos: num(r.vlrDesconto), liquido: num(r.vlrSalarioLiquido),
      _hash: crypto.createHash("md5").update([a.cod_ibge, r.mesReferencia, r.codServidorRemuneracao, r.numMatricula, r.nomServidor].join("¦")).digest("hex"),
    }));
    await grava(regs);
    total += regs.length; ok++;
    const comSal = regs.filter((r) => r.bruto > 0).length;
    await marca("ok", `${comSal} com valor`, comp, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${regs.length} servidores (${comp}, ${comSal} com valor)`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 180));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  }
  await dorme(500);
}
console.log(`\n[spapublico] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
