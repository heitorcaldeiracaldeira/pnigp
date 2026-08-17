// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_transparenciafacil.mjs — folha dos municípios em Transparência Fácil / Portal Fácil (mesma empresa).
//
// 🚨 EU TINHA DADO ESTE BLOCO COMO BECO: a home `/{codigo}` devolve 404 e o link que o próprio portal publica
// para o município também. A rota que funciona é outra — `/servidores-por-nomes/{databaseId}` — e só apareceu
// quando o verificador passou a testar TODAS as rotas do menu em vez da primeira ([[pnigp-mg-mapa-folha-853]]).
//
// ⭐ O databaseId é o código do TCE-MG: **5 dígitos do município + sufixo de ENTIDADE**, e o sufixo é o que
// separa quem é quem — `01` = CÂMARA, `02` = PREFEITURA. Simonésia: 0213201 é a Câmara (11 vereadores),
// **0213202 é a Prefeitura (1.060 servidores)**. Coletar o `01` por engano é o erro de
// [[pnigp-entidade-espelho-infla-folha]] servido de bandeja.
//
// A porta (JSON DataTables, sem navegador):
//   POST /api/servidor/ServidorGetCompetencia?databaseId=XXXXXXX      → [{id:"10/2025"},…]
//   POST /api/servidor/ServidorGetNomeGrid?databaseId=XXXXXXX         → {recordsFiltered, data:[…]}
//        body {parameters:{draw,columns,order,start,length,search}, competencia:"MM/AAAA"}
// 🚨 A resposta vem como STRING JSON escapada — precisa de DOIS parses.
//
// Uso: node scripts/ingest_folha_transparenciafacil.mjs [UF=MG] [SO=Simonésia] [REFAZ=1]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const BASE = "http://www.transparenciafacil.com.br/api/servidor/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_transpfacil (
  cod_ibge text, municipio text, uf text, database_id text, competencia text,
  matricula text, nome text, secretaria text, cargo text, vinculo text, tipo text,
  liquido numeric, _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_tpf_mun on folha_servidores_transpfacil (cod_ibge, competencia)`);
await q(`create table if not exists folha_transpfacil_coleta (
  cod_ibge text primary key, municipio text, uf text, database_id text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

const H = (id) => ({ "user-agent": UA, "content-type": "application/json", accept: "application/json",
  referer: `http://www.transparenciafacil.com.br/servidores-por-nomes/${id}` });

// 🚨 dois parses: o serviço devolve uma STRING contendo o JSON
async function post(rota, id, body) {
  const r = await fetch(`${BASE}${rota}?databaseId=${id}`, { method: "POST", headers: H(id),
    body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  let t = await r.text();
  let j = JSON.parse(t);
  if (typeof j === "string") j = JSON.parse(j);
  return j;
}
const num = (s) => { if (s == null) return null; const t = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."); const v = parseFloat(t); return Number.isFinite(v) ? v : null; };

const LOTE = 500;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const f = arr.slice(i, i + LOTE); const c = (k) => f.map((r) => r[k]);
    await q(`insert into folha_servidores_transpfacil
      (cod_ibge,municipio,uf,database_id,competencia,matricula,nome,secretaria,cargo,vinculo,tipo,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::numeric[],$13::text[])
      on conflict (_hash) do nothing`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("database_id"), c("competencia"), c("matricula"), c("nome"),
       c("secretaria"), c("cargo"), c("vinculo"), c("tipo"), c("liquido"), c("_hash")]);
  }
}

// alvos: todo município cuja URL conhecida cita transparenciafacil/portalfacil — o databaseId sai da própria URL
const alvos = (await q(`select distinct on (m.cod_ibge) m.cod_ibge, m.nome municipio, m.uf,
    (regexp_match(u.url, '(\\d{7})'))[1] database_id
  from municipios_br m
  join lateral (
    select url from (
      select p.url_portal_real url, p.em from portal_real_descoberto p where p.cod_ibge = m.cod_ibge
      union all
      select coalesce(d.url_pessoal, d.url_visitada), d.em from folha_diagnostico_faltante d where d.cod_ibge = m.cod_ibge
      union all
      select v.rota_com_dados, v.em from folha_verificacao_municipal v where v.cod_ibge = m.cod_ibge
    ) t where url ilike '%transparenciafacil%' or url ilike '%portalfacil%' order by em desc limit 1) u on true
 where u.url ~ '\\d{7}' ${UF ? "and m.uf = $1" : ""} ${SO ? `and m.nome ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
 order by m.cod_ibge`, [UF, SO].filter(Boolean))).rows;

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_transpfacil_coleta where situacao like 'ok%'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[transpfacil] ${alvos.length} municípios com databaseId · ${fila.length} na fila`);

let total = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  // ⭐ força o sufixo 02 (PREFEITURA); o 01 é a câmara
  const id = a.database_id.slice(0, 5) + "02";
  const marca = (situacao, detalhe = null, comp = null, linhas = 0) =>
    q(`insert into folha_transpfacil_coleta (cod_ibge,municipio,uf,database_id,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (cod_ibge) do update set database_id=excluded.database_id, competencia=excluded.competencia,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, id, comp, linhas, situacao, detalhe]);
  try {
    const comps = await post("ServidorGetCompetencia", id);
    const lista = Array.isArray(comps) ? comps : [];
    if (!lista.length) { await marca("vazio", "sem competência publicada"); vazios++; continue; }
    const comp = lista[0].id || lista[0].nome;

    const corpo = (start) => ({
      parameters: { draw: 1, start, length: 500,
        columns: [{ data: "matricula", name: "", searchable: true, orderable: true, search: { value: "", regex: false } }],
        order: [{ column: 0, dir: "asc" }], search: { value: "", regex: false } },
      competencia: comp });

    const linhas = [];
    for (let start = 0; start < 40000; start += 500) {
      const j = await post("ServidorGetNomeGrid", id, corpo(start));
      const d = j.data || j.Data || [];
      linhas.push(...d);
      const tot = Number(j.recordsFiltered ?? j.RecordsFiltered ?? 0);
      if (d.length < 500 || linhas.length >= tot) break;
      await dorme(300);
    }
    if (!linhas.length) { await marca("vazio", "grid sem linhas"); vazios++; continue; }

    const regs = linhas.map((r) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, database_id: id,
      competencia: (comp || "").replace("/", "").replace(/^(\d{2})(\d{4})$/, "$2$1"),
      matricula: r.matricula != null ? String(r.matricula) : null,
      nome: (r.nmServidor || "").trim() || null, secretaria: (r.nmUnidade || "").trim() || null,
      cargo: (r.nmCargo || "").trim() || null, vinculo: (r.nmVinculo || r.nmTipoVinculo || "").trim() || null,
      tipo: (r.nmTipo || r.nmTipoFolha || "").trim() || null,
      liquido: num(r.vlLiquido ?? r.vlrLiquido ?? r.valorLiquido),
      _hash: crypto.createHash("md5").update([a.cod_ibge, comp, r.cdContraCheque, r.matricula, r.nmServidor].join("¦")).digest("hex"),
    }));
    await grava(regs);
    total += regs.length; ok++;
    const comVal = regs.filter((r) => r.liquido > 0).length;
    await marca("ok", `${comVal} com valor`, comp, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${regs.length} servidores (${comp}, ${comVal} com valor)`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 180));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  }
  await dorme(400);
}
console.log(`\n[transpfacil] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
