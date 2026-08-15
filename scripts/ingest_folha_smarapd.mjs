// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_smarapd.mjs — folha NOMINAL COM SALÁRIO dos municípios SMARAPD (PAI, forte em SP).
//
// Portal "PAI - Portal de Acesso à Informação", host `transparencia-{slug}.smarapd.com.br` (SONDÁVEL).
// Backend REST `/paiportalserver/`. HTTP DIRETO funciona (sem navegador) desde que se envie `origin`+`referer`
// (senão 400 "Não foi possível obter a origem da requisição").
//
// ⭐ Dados: POST `/paiportalserver/modulovisao/filter` com
//   {ChaveModulo:"cargos_e_salarios", NomeVisao:"pagamentoservidores", Filtros:[], Periodicidade:"MENSAL",
//    Periodo:"<MES>", Exercicio:<ano>, Pagina:N, QuantidadeRegistros:M, Ordenacao:[...]}
//   → {QuantidadePaginas, QuantidadeRegistros, Valores:[{Exercicio,Mes,Nome,Matricula,Cargo,TipoFolha,
//      SalarioBase,TotalVencimentos,SalarioLiquido}]}. Salário em "1.774,19" (vírgula decimal).
// (secretaria não vem nesta view; está na view "listaservidores" (UnidadeOrcamentaria) — casar por matrícula depois.)
//
// Descoberta: sonda `transparencia-{slug}.smarapd.com.br` para todos os municípios (ou usa radar_portal erp='smarapd').
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const EXERCICIO = Number(process.env.EXERCICIO || new Date().getFullYear());
const RECUO = Number(process.env.RECUO || 15); // meses a recuar, cruzando a virada de ano
const MESES_PT = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists folha_servidores_smarapd (
  cod_ibge text, municipio text, uf text, host text, competencia text,
  matricula text, nome text, cargo text, tipo_folha text,
  salario_base numeric, total_vencimentos numeric, salario_liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_smar_mun on folha_servidores_smarapd (cod_ibge, competencia)`);
await q(`create table if not exists folha_smarapd_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);
await q(`create table if not exists smarapd_probe (
  cod_ibge text primary key, municipio text, uf text, host text, achou boolean, em timestamptz default now()
)`);

const money = (s) => { if (s == null) return null; const t = String(s).replace(/\s/g, "").replace(/\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };

async function filtro(host, nomeVisao, chaveModulo, periodo, pagina, qtd, exercicio = EXERCICIO) {
  const body = JSON.stringify({ ChaveModulo: chaveModulo, NomeVisao: nomeVisao, Filtros: [], Periodicidade: "MENSAL", Periodo: periodo, Exercicio: exercicio, Pagina: pagina, QuantidadeRegistros: qtd, Ordenacao: [{ ColunaOrdem: "NomeServidor", TipoOrdem: "ascend", Ordem: 1 }], FiltroRedirecionaVisao: { Campo: null, Valor: null, TipoValor: null } });
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://${host}/paiportalserver/modulovisao/filter`, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: `https://${host}`, referer: `https://${host}/` },
        body, signal: AbortSignal.timeout(60000),
      });
      if (r.ok) return await r.json();
      if (r.status >= 500 && t < 2) { await dorme(2000 * (t + 1)); continue; }
      return null;
    } catch { await dorme(2000 * (t + 1)); }
  }
  return null;
}

// alvos: radar erp='smarapd' + sonda por slug (host previsível)
let alvos;
if (process.env.HOST) {
  const mun = (await q(`select cod_ibge, nome, uf from municipios_br where lower(nome)=lower($1) ${process.env.UF ? "and uf=$2" : ""} limit 1`, process.env.UF ? [process.env.MUN, process.env.UF] : [process.env.MUN])).rows[0];
  alvos = [{ ...mun, host: process.env.HOST }];
} else {
  // dos já sondados/achados + os do radar
  const r = (await q(`select cod_ibge, municipio nome, uf, host from smarapd_probe where achou
    ${SO ? "and municipio ilike '%'||$1||'%'" : ""}`, SO ? [SO] : [])).rows;
  alvos = r;
}
const feitos = new Set((await q(`select cod_ibge from folha_smarapd_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => a.cod_ibge && !feitos.has(a.cod_ibge));
console.log(`[smarapd] ${alvos.length} municípios · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_smarapd
      (cod_ibge,municipio,uf,host,competencia,matricula,nome,cargo,tipo_folha,salario_base,total_vencimentos,salario_liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::numeric[],$11::numeric[],$12::numeric[],$13::text[])
      on conflict (_hash) do update set salario_liquido=excluded.salario_liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("matricula"), c("nome"), c("cargo"),
       c("tipo_folha"), c("salario_base"), c("total_vencimentos"), c("salario_liquido"), c("_hash")]);
  }
}

let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, linhas = 0) =>
    q(`insert into folha_smarapd_coleta (cod_ibge,municipio,uf,host,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.nome, a.uf, a.host, linhas, situacao, detalhe]);
  try {
    // 🚨 ChaveModulo/NomeVisao da folha VARIAM por município — ler do MenuPortal (Bertioga=cargos_e_salarios/
    // pagamentoservidores; Alumínio=servidor/PagamentoServidores). Acha o item "Pagamento a Servidores".
    let chaveModulo = "cargos_e_salarios", nomeVisao = "pagamentoservidores";
    try {
      const mr = await fetch(`https://${a.host}/paiportalserver/MenuPortal`, { headers: { accept: "application/json", origin: `https://${a.host}`, referer: `https://${a.host}/` }, signal: AbortSignal.timeout(30000) });
      if (mr.ok) {
        const menu = await mr.json();
        (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") { if (/pagamento.*servidor/i.test(o.Titulo || "") && o.URI) { const m = String(o.URI).match(/dinamico\/([^/]+)\/([^/?]+)/); if (m) { chaveModulo = m[1]; nomeVisao = m[2]; } } for (const v of Object.values(o)) walk(v); } })(menu);
      }
    } catch {}
    // acha a competência mais recente COM dado (recua do mês fechado)
    // 🚨 o recuo precisa levar o EXERCÍCIO junto: o mês voltava de janeiro para dezembro mas o body continuava
    // pedindo o exercício corrente — combinação que não existe. Município que publica com atraso caía em
    // "sem competencia com dado". Agora cada tentativa é um par (exercício, mês), atravessando a virada de ano.
    let comp = null, primeira = null, melhor = null, melhorN = 0;
    const d0 = new Date(); d0.setDate(1); d0.setMonth(d0.getMonth() - 1); // 🚨 começa no mês FECHADO (o corrente é parcial)
    for (let k = 0; k < RECUO; k++) {
      const d = new Date(d0); d.setMonth(d0.getMonth() - k);
      const mi = d.getMonth(), ex = d.getFullYear();
      const periodo = MESES_PT[mi];
      const j = await filtro(a.host, nomeVisao, chaveModulo, periodo, 1, 500, ex);
      const n = (j && Array.isArray(j.Valores)) ? (j.QuantidadeRegistros || j.Valores.length) : 0;
      if (n > melhorN) { melhorN = n; melhor = { periodo, mes: mi + 1, exercicio: ex, j }; }
      if (n >= 50) { comp = { periodo, mes: mi + 1, exercicio: ex }; primeira = j; break; } // competência "cheia"
    }
    if (!comp && melhor) { comp = { periodo: melhor.periodo, mes: melhor.mes, exercicio: melhor.exercicio }; primeira = melhor.j; } // senão a mais cheia
    if (!comp) { await marca("vazio", `sem competencia com dado em ${RECUO} meses`); vazios++; continue; }

    const totalReg = primeira.QuantidadeRegistros || primeira.Valores.length;
    const paginas = primeira.QuantidadePaginas || Math.ceil(totalReg / 500);
    const competencia = `${comp.exercicio}${String(comp.mes).padStart(2, "0")}`;
    const mapReg = (s) => ({
      cod_ibge: a.cod_ibge, municipio: a.nome, uf: a.uf, host: a.host, competencia,
      matricula: String(s.Matricula ?? ""), nome: s.Nome, cargo: s.Cargo, tipo_folha: s.TipoFolha,
      salario_base: money(s.SalarioBase), total_vencimentos: money(s.TotalVencimentos), salario_liquido: money(s.SalarioLiquido),
      _hash: crypto.createHash("md5").update([a.cod_ibge, competencia, s.Matricula, s.Nome, s.Cargo, s.TipoFolha].join("¦")).digest("hex"),
    });
    await grava(primeira.Valores.map(mapReg));
    let colhidas = primeira.Valores.length;
    for (let p = 2; p <= paginas; p++) {
      const j = await filtro(a.host, nomeVisao, chaveModulo, comp.periodo, p, 500, comp.exercicio);
      if (!j || !Array.isArray(j.Valores) || !j.Valores.length) break;
      await grava(j.Valores.map(mapReg));
      colhidas += j.Valores.length;
    }
    totalGeral += colhidas; ok++;
    await marca("ok", null, colhidas);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${colhidas} servidores (${competencia})`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.nome}: ${String(e.message).slice(0, 70)}`);
  }
  await dorme(400);
}
console.log(`\n[smarapd] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
