// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_contass.mjs — cadastro NOMINAL dos municípios em Contass (`transparencia.{slug}.contassconsultoria.com.br`).
//
// ⚠️ ENTREGA PARCIAL, e isso é da FONTE, não do coletor: o portal publica nome, cargo, lotação, carga horária e
// admissão — e NÃO publica o valor. O menu inteiro tem só `folhadepagamentos` e `portaldoservidor` (este com
// login), então não há outra tela com remuneração. Mesmo perfil do digifred no RS ([[pnigp-rs-mapa-folha-497]]).
//
// API REST limpa, sem paginação — devolve a folha inteira do mês num GET:
//   GET /folhadepagamentos/getcompetenciaatual              → {"ano":2026,"mes":8}
//   GET /folhadepagamentos/getsearchfolhadepagamentos?ano=&mes=  → [{id_coluna,ano,mes,matricula,nome,cargo,
//                                                                   lotacao,recisao,cargahoraria,datarecisao,admissao}]
// 🚨 A competência que o `getcompetenciaatual` devolve costuma vir VAZIA (o mês ainda não fechou): recuar.
//
// Uso: node scripts/ingest_folha_contass.mjs [UF=MG] [SO=Urucuia] [REFAZ=1]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const JANELA = Number(process.env.JANELA || 15);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_contass (
  cod_ibge text, municipio text, uf text, host text, competencia text,
  matricula text, nome text, cargo text, secretaria text, situacao text,
  carga_horaria text, data_admissao text,
  _hash text primary key, _coletado_em timestamptz default now())`);
// 🚨 EU CONCLUÍ ERRADO QUE "O CONTASS NÃO PUBLICA VALOR" (16/ago) — olhei o menu, vi só `folhadepagamentos` e
// `portaldoservidor`, e NÃO segui a coluna **"Detalhes"** da própria tabela. Ela leva a
// `/folhadepagamentos/moredetails/{id_coluna}`, cuja página traz um JSON Inertia (`data-page`) com
// **salariobase, vinculo, localtrabalho, cpf mascarado**, a folha RUBRICA A RUBRICA (`detalhes`) e os
// **totalizadores prontos** (`totalProventos`, `totalDesconto`, `totalLiquido`).
// ⭐ Usar os totalizadores DECLARADOS e nunca somar as rubricas ([[pnigp-portaltp-epublica-folha]]).
await q(`alter table folha_servidores_contass add column if not exists vinculo text`);
await q(`alter table folha_servidores_contass add column if not exists local_trabalho text`);
await q(`alter table folha_servidores_contass add column if not exists cpf_masc text`);
await q(`alter table folha_servidores_contass add column if not exists salario_base numeric`);
await q(`alter table folha_servidores_contass add column if not exists bruto numeric`);
await q(`alter table folha_servidores_contass add column if not exists descontos numeric`);
await q(`alter table folha_servidores_contass add column if not exists liquido numeric`);
await q(`alter table folha_servidores_contass add column if not exists rubricas jsonb`);
await q(`create index if not exists ix_folha_contass_mun on folha_servidores_contass (cod_ibge, competencia)`);
await q(`create table if not exists folha_contass_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

async function json(url) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.json();
}
const money = (s) => { if (s == null) return null; const t = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."); const v = parseFloat(t); return Number.isFinite(v) ? v : null; };

// o detalhe é uma página Inertia: o dado vem no atributo `data-page`, sem precisar de navegador
async function detalhe(host, idColuna) {
  const r = await fetch(`https://${host}/folhadepagamentos/moredetails/${idColuna}`,
    { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const t = await r.text();
  const m = t.match(/data-page="([^"]+)"/);
  if (!m) return null;
  const j = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'"));
  return j.props || null;
}

const LOTE = 500;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const f = arr.slice(i, i + LOTE); const c = (k) => f.map((r) => r[k]);
    // 🚨 o `_hash` não inclui os valores: sem estes `coalesce` no conflito, o detalhe seria buscado e NÃO
    // chegaria ao banco (mesma armadilha do de-para de lotação do Memory).
    await q(`insert into folha_servidores_contass
      (cod_ibge,municipio,uf,host,competencia,matricula,nome,cargo,secretaria,situacao,carga_horaria,data_admissao,
       vinculo,local_trabalho,cpf_masc,salario_base,bruto,descontos,liquido,rubricas,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],
        $16::numeric[],$17::numeric[],$18::numeric[],$19::numeric[],$20::jsonb[],$21::text[])
      on conflict (_hash) do update set
        vinculo = coalesce(excluded.vinculo, folha_servidores_contass.vinculo),
        local_trabalho = coalesce(excluded.local_trabalho, folha_servidores_contass.local_trabalho),
        cpf_masc = coalesce(excluded.cpf_masc, folha_servidores_contass.cpf_masc),
        salario_base = coalesce(excluded.salario_base, folha_servidores_contass.salario_base),
        bruto = coalesce(excluded.bruto, folha_servidores_contass.bruto),
        descontos = coalesce(excluded.descontos, folha_servidores_contass.descontos),
        liquido = coalesce(excluded.liquido, folha_servidores_contass.liquido),
        rubricas = coalesce(excluded.rubricas, folha_servidores_contass.rubricas)`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("matricula"), c("nome"),
       c("cargo"), c("secretaria"), c("situacao"), c("carga_horaria"), c("data_admissao"),
       c("vinculo"), c("local_trabalho"), c("cpf_masc"), c("salario_base"), c("bruto"), c("descontos"),
       c("liquido"), c("rubricas"), c("_hash")]);
  }
}

const alvos = (await q(`select distinct on (p.cod_ibge) p.cod_ibge, m.nome municipio, m.uf,
    split_part(regexp_replace(p.url_portal_real,'^https?://',''),'/',1) host
  from portal_real_descoberto p
  join municipios_br m on m.cod_ibge = p.cod_ibge
 where p.url_portal_real ilike '%contassconsultoria.com.br%'
   and p.url_portal_real ilike '%transparencia.%'
   ${UF ? "and m.uf = $1" : ""} ${SO ? `and m.nome ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
 order by p.cod_ibge, p.em desc`, [UF, SO].filter(Boolean))).rows;

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_contass_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[contass] ${alvos.length} portais · ${fila.length} na fila`);

let total = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe = null, comp = null, linhas = 0) =>
    q(`insert into folha_contass_coleta (cod_ibge,municipio,uf,host,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (cod_ibge) do update set host=excluded.host, competencia=excluded.competencia,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.host, comp, linhas, situacao, detalhe]);
  try {
    const base = `https://${a.host}/folhadepagamentos/`;
    let ano = 2026, mes = 8;
    try { const c = await json(base + "getcompetenciaatual"); if (c?.ano) { ano = c.ano; mes = c.mes; } } catch {}

    let linhas = null, comp = null;
    for (let k = 0; k < JANELA; k++) {
      const d = new Date(Date.UTC(ano, mes - 1 - k, 1));
      const an = d.getUTCFullYear(), me = d.getUTCMonth() + 1;
      const j = await json(`${base}getsearchfolhadepagamentos?ano=${an}&mes=${me}`);
      if (Array.isArray(j) && j.length) { linhas = j; comp = `${an}${String(me).padStart(2, "0")}`; break; }
      await dorme(250);
    }
    if (!linhas) { await marca("vazio", `sem dado em ${JANELA} competências`); vazios++; continue; }

    // ⭐ o VALOR está no detalhe, um por servidor — buscado em paralelo moderado (o host é do fornecedor)
    const CONC = 6;
    const det = {};
    for (let k = 0; k < linhas.length; k += CONC) {
      await Promise.all(linhas.slice(k, k + CONC).map(async (r) => {
        try { const p = await detalhe(a.host, r.id_coluna); if (p) det[r.id_coluna] = p; } catch { /* segue */ }
      }));
      if (k && k % 300 === 0) console.log(`     detalhe ${k}/${linhas.length}`);
    }

    const regs = linhas.map((r) => {
      const p = det[r.id_coluna] || {};
      const s = p.servidor || {}, tot = p.totalizadores || {};
      return {
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, host: a.host, competencia: comp,
        matricula: r.matricula != null ? String(r.matricula) : null,
        nome: r.nome || null, cargo: r.cargo || null, secretaria: r.lotacao || null,
        situacao: r.recisao || null, carga_horaria: r.cargahoraria != null ? String(r.cargahoraria) : null,
        data_admissao: r.admissao || null,
        vinculo: s.vinculo || null, local_trabalho: s.localtrabalho || null, cpf_masc: (s.cpf || "").trim() || null,
        salario_base: money(s.salariobase),
        bruto: tot.totalProventos ?? null, descontos: tot.totalDesconto ?? null, liquido: tot.totalLiquido ?? null,
        rubricas: p.detalhes ? JSON.stringify(p.detalhes) : null,
        _hash: crypto.createHash("md5").update([a.cod_ibge, comp, r.id_coluna, r.matricula, r.nome].join("¦")).digest("hex"),
      };
    });
    await grava(regs);
    total += regs.length; ok++;
    const comVal = regs.filter((x) => x.bruto > 0).length;
    await marca("ok", `${comVal} com valor (detalhe/moredetails)`, comp, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${regs.length} servidores (${comp}, ${comVal} com valor)`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 180));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  }
  await dorme(500);
}
console.log(`\n[contass] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
