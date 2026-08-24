// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_sigafi.mjs — SIGAFI (`{slug}.sigafi.com.br`), portal de transparência com JSON aberto.
//
// ⭐ Achado em 18/ago/2026 nos municípios que o diagnóstico marcou `tem_dados` e ninguém tinha coletado — a URL
// registrada já trazia `?json=true` no próprio link do menu. Molde varrido no país: **3 municípios, todos em MG**
// (Joaíma 1.201, Palmópolis 493, Rio do Prado 295), os três com 100% de valor.
//
// O contrato — um GET e pronto:
//   GET /portal/main/Folha/ajaxFolha/?json=true&tipo=todos&mes=MM&ano=AAAA
//   → [{id, codigo, nome, cargo, matricula, lotacao, carga_horaria, data_admissao, regime, classe_pensao,
//       valor_bruto, valor_liquido, desconto, data_exoneracao, tipo_desligamento}]
//
// 🚨 `codigo` PARECE competência e NÃO É. Vem como "1 / 2026", "179 / 2026", "313 / 2026" — é um sequencial do
// servidor no exercício, não mês/ano. Ler `codigo` como competência produziria 295 competências distintas num
// município de 295 pessoas ([[pnigp-competencia-invariante-verificador]] pegaria depois, mas o dado já estaria
// carimbado errado). A competência só existe nos parâmetros `mes`/`ano` da consulta.
//
// 🚨 SEM `mes`/`ano` a API responde 295 registros de um exercício qualquer — não do mês corrente. E jul/2026
// devolve ZERO enquanto jul/2025 devolve 355: o portal está com o ano corrente vazio. Perguntar só o mês de hoje
// e concluir "não publica" seria o erro de sempre ([[pnigp-coletor-ok-sem-dado-sete-causas]]), por isso o coletor
// RECUA mês a mês e fica com a competência mais cheia ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
//
// Uso: node scripts/ingest_folha_sigafi.mjs      · SO=<município> · MESES=30
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import crypto from "node:crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const MESES = Number(process.env.MESES || 30);
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36", "x-requested-with": "XMLHttpRequest" };

await q(`create table if not exists folha_servidores_sigafi (
  cod_ibge text, municipio text, uf text, competencia text, matricula text, nome text, cargo text,
  lotacao text, regime text, carga_horaria text, admissao text, exoneracao text, tipo_desligamento text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create table if not exists folha_sigafi_coleta (
  cod_ibge text primary key, municipio text, uf text, url text, situacao text, detalhe text,
  linhas int, competencia text, em timestamptz default now()
)`);

const num = (s) => { const n = Number(String(s ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const lim = (s) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t || null; };

async function consulta(base, mes, ano) {
  const u = `${base}/portal/main/Folha/ajaxFolha/?json=true&tipo=todos&mes=${mes}&ano=${ano}`;
  const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error("resposta não-JSON"); }
  return Array.isArray(j) ? j : [];
}

const fila = (await q(`select distinct on (cod_ibge) cod_ibge, municipio, uf, url from folha_portal_candidato
  where produto = 'sigafi' ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by cod_ibge, achado_em desc`,
  [SO].filter(Boolean))).rows;
console.log(`[sigafi] ${fila.length} municípios na fila\n`);

let colhidos = 0;
for (const m of fila) {
  const base = String(m.url).replace(/\/+$/, "");
  const marca = (situacao, detalhe, n = 0, comp = null) =>
    q(`insert into folha_sigafi_coleta (cod_ibge,municipio,uf,url,situacao,detalhe,linhas,competencia,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set situacao=excluded.situacao,
       detalhe=excluded.detalhe, linhas=excluded.linhas, competencia=excluded.competencia, em=now()`,
      [m.cod_ibge, m.municipio, m.uf, base, situacao, detalhe, n, comp]);

  const hoje = new Date();
  let melhor = null, erro = null, vistos = 0;
  for (let k = 0; k < MESES; k++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1);
    const mes = String(d.getMonth() + 1).padStart(2, "0"), ano = String(d.getFullYear());
    let regs;
    try { regs = await consulta(base, mes, ano); } catch (e) { erro = e.message; continue; }
    if (!regs.length) continue;
    vistos++;
    // 🚨 "mais cheia" conta PESSOAS DISTINTAS, não linhas. Joaíma tinha 1.914 linhas em dez/2025 contra 494 de
    // maio — mas são 892 pessoas, porque dezembro traz o 13º na mesma consulta. Escolhendo por linhas, o mês do
    // 13º vence sempre e o município fica 48% inflado ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
    const pessoas = new Set(regs.map((x) => `${x.matricula ?? ""}|${x.nome ?? ""}`)).size;
    if (!melhor || pessoas > melhor.pessoas) melhor = { comp: `${ano}${mes}`, regs, pessoas };
    // já achou o pico: três competências com dado bastam para saber qual é a mais cheia
    if (vistos >= 3) break;
  }

  if (!melhor) {
    await marca(erro ? "erro" : "sem_dado", erro ?? `${MESES} competências consultadas, todas vazias`);
    console.log(`   ${erro ? "✖" : "·"} ${m.municipio}: ${erro ?? "nenhuma competência com dado"}`);
    continue;
  }

  const lote = melhor.regs.map((x) => [m.cod_ibge, m.municipio, m.uf, melhor.comp, lim(x.matricula), lim(x.nome),
    lim(x.cargo), lim(x.lotacao), lim(x.regime), lim(x.carga_horaria), lim(x.data_admissao),
    lim(x.data_exoneracao), lim(x.tipo_desligamento), num(x.valor_bruto), num(x.desconto), num(x.valor_liquido),
    crypto.createHash("sha1").update([m.cod_ibge, melhor.comp, x.matricula ?? "", x.nome ?? "", x.valor_bruto ?? ""].join("|")).digest("hex")]);
  for (let i = 0; i < lote.length; i += 500) {
    const p = lote.slice(i, i + 500);
    const vals = p.map((_, k) => `(${Array.from({ length: 17 }, (_, j) => `$${k * 17 + j + 1}`).join(",")})`).join(",");
    await q(`insert into folha_servidores_sigafi (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,lotacao,
      regime,carga_horaria,admissao,exoneracao,tipo_desligamento,bruto,descontos,liquido,_hash)
      values ${vals} on conflict (_hash) do nothing`, p.flat());
  }
  const comValor = lote.filter((x) => x[13] > 0).length;
  colhidos++;
  await marca("ok", `${melhor.pessoas} pessoas, ${comValor} linhas com bruto de ${lote.length}`, melhor.pessoas, melhor.comp);
  console.log(`  ⭐ ${m.municipio.padEnd(26)} ${String(melhor.pessoas).padStart(5)} pessoas · ${lote.length} linhas · ${comValor} com bruto · comp ${melhor.comp}`);
}

console.log(`\n[sigafi] ${colhidos} municípios colhidos`);
await db.end();
