// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_aspec_empenho.mjs — folha de pessoal AGREGADA POR SECRETARIA dos municípios ASPEC (governotransparente).
//
// ⭐ POR QUE empenho e não folha nominal: o portal ASPEC (governotransparente.com.br) NÃO publica folha nominal — o
// card "FOLHA DE PAGAMENTO" é link EXTERNO para a página própria de cada prefeitura. O que o portal entrega é o
// EMPENHO, e nele a despesa de PESSOAL (natureza 3.1.x — pessoal e encargos sociais) vem quebrada por UNIDADE
// GESTORA (= secretaria/órgão). Então dá para reconstruir a folha no nível AGREGADO por secretaria, como no RS
// ([[pnigp-tc-recebe-folha-e-nao-publica]] rota do empenho).
//
// CADEIA DE DESCOBERTA (tudo GET público; só exige UA de navegador + Referer — nginx bloqueia off-site com 403):
//   1) cidades:   GET /transparencia/estado/cidades/{estId}            → [{id,nome}]  (estId por UF, mapa abaixo)
//   2) entidades: GET /transparencia/estado/cidade/entidades/{cidId}   → [{id,nome}]  nome traz o intervalo de datas
//   3) selecionar:GET /selecionarentidade?ent={entId}  (redirect:manual)→ Location "/{acessoinfoId}"
//   4) export:    GET /acessoinfo/{acessoinfoId}/empenhoportipo/exportar?formato=CSV&inicio=DD/MM/AAAA&fim=DD/MM/AAAA
// Colunas do CSV: Data,Empenho,Unidade gestora,CPF/CNPJ,Credor,Natureza da despesa,Modalidade,Nº licitação,
//   Base legal,Histórico,Registro,Valor (R$),Liquidado (R$),Pago (R$),A pagar (R$). Dinheiro com PONTO decimal.
//
// Agrega natureza '3.1.%' (pessoal e encargos) por (unidade gestora × natureza × exercício): empenhado/liquidado/pago.
// Uso: node scripts/ingest_folha_aspec_empenho.mjs            (todos os 76 aspec do radar)
//      SO=Marabá node scripts/ingest_folha_aspec_empenho.mjs  (um município)  ·  ANOS=2025,2026 (default)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const BASE = "https://www.governotransparente.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const H = { "user-agent": UA, referer: BASE + "/" };
const ANOS = (process.env.ANOS || "2025,2026").split(",").map((s) => s.trim());
const SO = process.env.SO || null;
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

// UF (nome do radar) → estId do governotransparente
const EST = {
  "Ceará": "150", "Maranhão": "190", "Pará": "250", "Paraíba": "240", "Rio Grande do Norte": "280",
  "Amapá": "120", "Pernambuco": "260", "Piauí": "270", "Roraima": "320",
};
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

await q(`create table if not exists folha_aspec_secretaria (
  cod_ibge text, municipio text, uf text, acessoinfo_id text,
  exercicio text, unidade_gestora text, natureza_codigo text, natureza_desc text,
  empenhado numeric, liquidado numeric, pago numeric, n_empenhos int,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_faspec_mun on folha_aspec_secretaria (cod_ibge)`);
await q(`create table if not exists folha_aspec_coleta (
  cod_ibge text primary key, municipio text, uf text, acessoinfo_id text,
  linhas int, secretarias int, situacao text, detalhe text, em timestamptz default now()
)`);

async function baixa(url, tipo = "json", tent = 3) {
  for (let t = 0; t < tent; t++) {
    try {
      const r = await fetch(url, { headers: H, redirect: tipo === "loc" ? "manual" : "follow", signal: AbortSignal.timeout(120000) });
      if (tipo === "loc") return r.headers.get("location");
      if (!r.ok) { if (r.status === 403 || r.status >= 500) { await dorme(1500 * (t + 1)); continue; } return null; }
      return tipo === "json" ? await r.json() : await r.text();
    } catch { await dorme(1500 * (t + 1)); }
  }
  return null;
}

// parser CSV state-machine (campos entre aspas com vírgula/quebra embutidas)
function parseCSV(text) {
  const rows = []; let row = [], field = "", inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inq = false; }
      else field += c;
    } else {
      if (c === '"') inq = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const money = (s) => { const n = parseFloat(String(s || "").trim()); return Number.isFinite(n) ? n : 0; };

// descobre o acessoinfoId da PREFEITURA (mandato atual) de um município
async function descobreId(municipio, uf) {
  const estId = EST[uf]; if (!estId) return { erro: "uf_sem_estid" };
  const cidades = await baixa(`${BASE}/transparencia/estado/cidades/${estId}`);
  if (!Array.isArray(cidades)) return { erro: "sem_cidades" };
  const alvo = norm(municipio);
  let cid = cidades.find((c) => norm(c.nome) === alvo)
    || cidades.find((c) => norm(c.nome).replace(/[^A-Z ]/g, "") === alvo.replace(/[^A-Z ]/g, ""))
    || cidades.find((c) => norm(c.nome).startsWith(alvo) || alvo.startsWith(norm(c.nome)));
  if (!cid) return { erro: "cidade_nao_encontrada" };
  const ents = await baixa(`${BASE}/transparencia/estado/cidade/entidades/${cid.id}`);
  if (!Array.isArray(ents)) return { erro: "sem_entidades" };
  // pega PREFEITURA com data-fim mais recente (mandato vigente)
  const prefs = ents.filter((e) => /PREFEITURA/i.test(e.nome)).map((e) => {
    const m = e.nome.match(/a\s*(\d{2})\/(\d{2})\/(\d{4})\s*\)/); // "... a dd/mm/yyyy )"
    const fim = m ? +`${m[3]}${m[2]}${m[1]}` : 0;
    return { ...e, fim };
  }).sort((a, b) => b.fim - a.fim);
  if (!prefs.length) return { erro: "sem_prefeitura" };
  const ent = prefs[0];
  const loc = await baixa(`${BASE}/selecionarentidade?est=${estId}&cid=${cid.id}&ent=${ent.id}`, "loc");
  const idm = (loc || "").match(/\/(\d{5,})/);
  if (!idm) return { erro: "sem_id_acessoinfo" };
  return { acessoinfoId: idm[1], entNome: ent.nome };
}

const alvos = (await q(`select cod_ibge, municipio, uf from radar_portal
  where erp='aspec' and unidade_gestora ilike 'Prefeitura%'
  ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by uf, municipio`, SO ? [SO] : [])).rows;
// REFAZ=1 reprocessa quem ja esta ok — sem isso, conserto de campo nao alcanca quem ja foi coletado
const feitos = process.env.REFAZ === "1" ? new Set() : new Set((await q(`select cod_ibge from folha_aspec_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[aspec] ${alvos.length} municípios ASPEC · ${fila.length} na fila · exercícios ${ANOS.join(",")}`);

const hoje = new Date();
const fimHoje = `${String(hoje.getUTCDate()).padStart(2, "0")}/${String(hoje.getUTCMonth() + 1).padStart(2, "0")}/${hoje.getUTCFullYear()}`;

const LOTE = 500;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_aspec_secretaria
      (cod_ibge,municipio,uf,acessoinfo_id,exercicio,unidade_gestora,natureza_codigo,natureza_desc,empenhado,liquidado,pago,n_empenhos,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::numeric[],$10::numeric[],$11::numeric[],$12::int[],$13::text[])
      on conflict (_hash) do update set empenhado=excluded.empenhado, liquidado=excluded.liquidado,
        pago=excluded.pago, n_empenhos=excluded.n_empenhos, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("acessoinfo_id"), c("exercicio"), c("unidade_gestora"),
       c("natureza_codigo"), c("natureza_desc"), c("empenhado"), c("liquidado"), c("pago"), c("n_empenhos"), c("_hash")]);
  }
}

import crypto from "crypto";
let okN = 0, vazN = 0, falhaN = 0, totLinhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, id = null, linhas = 0, secs = 0) =>
    q(`insert into folha_aspec_coleta (cod_ibge,municipio,uf,acessoinfo_id,linhas,secretarias,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
       acessoinfo_id=excluded.acessoinfo_id, linhas=excluded.linhas, secretarias=excluded.secretarias,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, id, linhas, secs, situacao, detalhe]);
  try {
    const d = await descobreId(a.municipio, a.uf);
    if (d.erro) { await marca("erro_descoberta", d.erro); falhaN++; console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${d.erro}`); continue; }
    // agrega por (exercicio, UG, natureza)
    const agg = new Map(); // key -> {ug,natcod,natdesc,exerc,emp,liq,pag,n}
    let linhasPessoal = 0;
    for (const ano of ANOS) {
      const url = `${BASE}/acessoinfo/${d.acessoinfoId}/empenhoportipo/exportar?formato=CSV&inicio=01/01/${ano}&fim=${ano == hoje.getUTCFullYear() ? fimHoje : "31/12/" + ano}`;
      const csv = await baixa(url, "text");
      if (!csv) continue;
      const rows = parseCSV(csv);
      if (rows.length < 2) continue;
      // localiza colunas pelo cabeçalho
      const head = rows[0].map((h) => h.trim().toLowerCase());
      const ci = {
        ug: head.findIndex((h) => /unidade gestora/.test(h)),
        nat: head.findIndex((h) => /natureza/.test(h)),
        val: head.findIndex((h) => /valor/.test(h)),
        liq: head.findIndex((h) => /liquidado/.test(h)),
        pag: head.findIndex((h) => /^pago|pago \(/.test(h)),
      };
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r]; if (row.length < 6) continue;
        const nat = (row[ci.nat] || "").trim();
        if (!/^3\.1\./.test(nat)) continue; // só pessoal e encargos sociais
        linhasPessoal++;
        const ug = (row[ci.ug] || "(sem unidade)").trim();
        const natcod = (nat.split(" - ")[0] || "").trim();
        const natdesc = (nat.split(" - ").slice(1).join(" - ") || "").trim();
        const key = `${ano}¦${ug}¦${natcod}`;
        let o = agg.get(key);
        if (!o) { o = { ug, natcod, natdesc, exerc: ano, emp: 0, liq: 0, pag: 0, n: 0 }; agg.set(key, o); }
        o.emp += money(row[ci.val]); o.liq += money(row[ci.liq]); o.pag += money(row[ci.pag]); o.n++;
      }
      await dorme(400);
    }
    if (!agg.size) { await marca("vazio", "sem empenho de pessoal", d.acessoinfoId); vazN++; console.log(`  · [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: vazio (id ${d.acessoinfoId})`); continue; }
    const regs = [...agg.values()].map((o) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, acessoinfo_id: d.acessoinfoId,
      exercicio: o.exerc, unidade_gestora: o.ug, natureza_codigo: o.natcod, natureza_desc: o.natdesc,
      empenhado: +o.emp.toFixed(2), liquidado: +o.liq.toFixed(2), pago: +o.pag.toFixed(2), n_empenhos: o.n,
      _hash: crypto.createHash("md5").update([a.cod_ibge, o.exerc, o.ug, o.natcod].join("¦")).digest("hex"),
    }));
    await grava(regs);
    const secs = new Set(regs.map((r) => r.unidade_gestora)).size;
    totLinhas += linhasPessoal; okN++;
    await marca("ok", null, d.acessoinfoId, linhasPessoal, secs);
    console.log(`  ✔ [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${secs} secretarias · ${regs.length} linhas-agg · ${linhasPessoal} empenhos pessoal (id ${d.acessoinfoId})`);
  } catch (e) {
    falhaN++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 80)}`);
  }
  await dorme(600);
}
console.log(`\n[aspec] ${okN} ok · ${vazN} vazios · ${falhaN} falhas · ${totLinhas.toLocaleString("pt-BR")} empenhos de pessoal agregados`);
console.log("\n═══ Resumo por UF ═══");
console.table((await q(`select uf, count(distinct cod_ibge) municipios, count(distinct unidade_gestora) secretarias,
  round(sum(empenhado)/1e6,1) "empenhado_R$mi"
  from folha_aspec_secretaria group by uf order by municipios desc`)).rows);
await db.end();
