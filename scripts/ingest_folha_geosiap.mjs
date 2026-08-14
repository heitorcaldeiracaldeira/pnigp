// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_geosiap.mjs — folha dos municípios que usam o GeoSIAP (Grupo Embras).
//
// Entrega os três campos do pedido + a hierarquia: NOME · CARGO · FUNÇÃO · SECRETARIA · LOTAÇÃO · referência ·
// nível · SALÁRIO · jornada. E a série é longa: o seletor de competência traz ~88 meses (mais de 7 anos).
//
// A CADEIA (a mais simples de todos os ERPs — sem token, sem viewstate, sem sessão):
//   1. GET  {slug}.geosiap.net.br/{slug}/websis/portal_transparencia/financeiro/contas_publicas/index.php
//           ?consulta=../lei_acesso/lai_remuneracoes      → a página traz os selects de entidade e competência
//   2. POST .../financeiro/lei_acesso/lai_remuneracoes_ajax_grid.php
//           cp_ano, cp_mes, ds_schema (entidade), numero_conta, tabela_organograma, flags
//        → JSON DataTables: {recordsTotal, data:[[cpf, chapa, nome, cargo, funcao, secretaria, lotacao,
//                                                  referencia, nivel, salario, jornada, botão...]]}
//
// ⚠️ A LISTA DA TELA ENGANA: ela mostra só nome, valor e jornada. Cargo, secretaria e lotação existem no JSON —
// quem olha só a tela conclui que o GeoSIAP não tem lotação, e tem.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const COMPETENCIAS = Number(process.env.COMPETENCIAS || 1);

await q(`create table if not exists folha_servidores_geosiap (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  cpf_masc text, chapa text, nome text, cargo text, funcao text,
  secretaria text, lotacao text, referencia text, nivel text, jornada text,
  salario numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_gs_mun on folha_servidores_geosiap (cod_ibge, competencia)`);
await q(`create table if not exists folha_geosiap_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

// 🚨 USAR O HOST DA URL QUE A VARREDURA PROVOU, não remontar a partir do slug. A receita do GeoSIAP testa dois
// candidatos ({slug} e pm{slug}) e grava em `url` o que respondeu — mas o slug fica sem o prefixo. Remontar
// `https://{slug}.geosiap.net.br` gera host inexistente para todo município cujo portal é `pm{slug}`, e o
// coletor conclui "sem página" num portal que existe.
function caminhos(slug, url) {
  const host = (() => { try { return new URL(url).host; } catch { return `${slug}.geosiap.net.br`; } })();
  const pasta = host.split(".")[0];                      // a pasta costuma repetir o subdomínio
  const bases = [pasta, slug, pasta.replace(/^pm/, ""), "pm" + slug];
  return [...new Set(bases)].map((p) => `https://${host}/${p}/websis/portal_transparencia/financeiro`);
}

async function pagina(base) {
  const url = `${base}/contas_publicas/index.php?consulta=../lei_acesso/lai_remuneracoes`;
  const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.text();
}

// ⚠️ Os <option> deste portal vêm SEM ASPAS no value (`value=1|entidade001 data-id-entidade='2'`) — exigir
// aspas na regex devolve lista vazia e o coletor conclui "sem entidade/competência" num portal que tem as duas.
// O `data-id-entidade` é o parâmetro do AJAX que carrega as competências daquela entidade.
function entidades(html) {
  const bloco = html.match(/<select[^>]*ds_schema[\s\S]*?<\/select>/i);
  if (!bloco) return [];
  return [...bloco[0].matchAll(/<option\s+value=["']?([^"'\s>]+)["']?[^>]*?data-id-entidade=['"]?(\d+)['"]?[^>]*>([^<]*)/gi)]
    .map((m) => ({ valor: m[1], idEntidade: m[2], texto: m[3].trim() }))
    .filter((o) => o.valor && o.valor.includes("|"));
}

// as competências NÃO estão no HTML: vêm por AJAX, por entidade
async function competencias(base, idEntidade) {
  const r = await fetch(`${base}/lei_acesso/lai_remuneracoes_ajax_combo_competencia.php?entidade_id=${idEntidade}`,
    { headers: UA, signal: AbortSignal.timeout(90000) });
  if (!r.ok) return [];
  const html = await r.text();
  return [...html.matchAll(/<option\s+value=["']?([^"'\s>]+)["']?[^>]*>([^<]*)/gi)]
    .map((m) => ({ valor: m[1], texto: m[2].trim() })).filter((o) => /^\d{2}\/\d{4}$/.test(o.valor));
}

async function grid(base, entidade, ano, mes) {
  const corpo = new URLSearchParams({
    exibeSalarioZerado: " inner ", cp_ano: ano, cp_mes: mes, agrupa_cargo: "0",
    detalhes_holerith: "1", numero_conta: "11860", exibe_chapa: "1",
    tabela_organograma: "GRH_Organograma", ds_schema: entidade, exibeSalarioBase: "1",
  });
  const r = await fetch(`${base}/lei_acesso/lai_remuneracoes_ajax_grid.php`, {
    method: "POST", headers: { ...UA, "content-type": "application/x-www-form-urlencoded" },
    body: corpo, signal: AbortSignal.timeout(300000),
  });
  if (!r.ok) throw new Error("grid HTTP " + r.status);
  const j = JSON.parse(await r.text());
  return j.data || [];
}

const alvos = (await q(`select p.cod_ibge, p.slug, p.url, m.nome municipio, m.uf
  from erp_portal_municipal p join municipios_br m on m.cod_ibge = p.cod_ibge
 where p.erp='geosiap' ${UF ? "and m.uf = $1" : ""} ${SO ? `and m.nome ilike '%' || $${UF ? 2 : 1} || '%'` : ""}
 order by m.uf, m.nome`, [UF, SO].filter(Boolean))).rows;
const feitos = new Set((await q(`select cod_ibge from folha_geosiap_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[geosiap] ${alvos.length} portais · ${feitos.size} feitos · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(todos) {
  const m = new Map();
  for (const r of todos) m.set(r._hash, r);
  const regs = [...m.values()];
  for (let i = 0; i < regs.length; i += LOTE) {
    const p = regs.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_geosiap
      (cod_ibge,municipio,uf,entidade,competencia,cpf_masc,chapa,nome,cargo,funcao,secretaria,lotacao,
       referencia,nivel,jornada,salario,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::numeric[],$17::text[])
      on conflict (_hash) do update set salario=excluded.salario, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("cpf_masc"), c("chapa"),
       c("nome"), c("cargo"), c("funcao"), c("secretaria"), c("lotacao"), c("referencia"), c("nivel"),
       c("jornada"), c("salario"), c("_hash")]);
  }
}

let total = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, competencia = null, linhas = 0) =>
    q(`insert into folha_geosiap_coleta (cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now())
       on conflict (cod_ibge) do update set competencia=excluded.competencia, linhas=excluded.linhas,
         situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, competencia, linhas, situacao, detalhe]);
  try {
    let base = null, html = null;
    for (const cand of caminhos(a.slug, a.url)) {
      try { html = await pagina(cand); if (/lai_remuneracoes|ds_schema/i.test(html)) { base = cand; break; } } catch { /* próximo */ }
    }
    if (!base) { await marca("sem_pagina", "lai_remuneracoes não encontrada"); falhas++; continue; }

    const ents = entidades(html);
    if (!ents.length) { await marca("sem_filtro", "sem entidade no ds_schema"); falhas++; continue; }

    const regs = [];
    for (const ent of ents) {
      const comps = (await competencias(base, ent.idEntidade)).slice(0, COMPETENCIAS);
      for (const comp of comps) {
        const [mes, ano] = comp.valor.split("/");
        if (!ano || !mes) continue;
        let linhas = [];
        try { linhas = await grid(base, ent.valor, ano, mes); } catch { continue; }
        for (const l of linhas) {
          const salario = Number(l[9]);
          regs.push({
            cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, entidade: ent.texto,
            competencia: `${ano}${mes}`, cpf_masc: l[0], chapa: l[1], nome: l[2], cargo: l[3], funcao: l[4],
            secretaria: l[5], lotacao: l[6], referencia: l[7], nivel: l[8],
            jornada: l[10], salario: Number.isFinite(salario) ? salario : null,
            _hash: crypto.createHash("md5").update([a.cod_ibge, ano, mes, ent.valor, l[1], l[2], l[3]].join("¦")).digest("hex"),
          });
        }
      }
    }
    if (!regs.length) { await marca("vazio", "grid sem linhas"); falhas++; continue; }
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
console.log(`\n[geosiap] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${falhas} falhas`);
await db.end();
