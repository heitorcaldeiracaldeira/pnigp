// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_gwtransparencia.mjs — folha dos portais GW Transparência (`{pm|cm}{slug}.gwtransparencia.com.br`).
//
// 🚨 DUAS COISAS ME FIZERAM DAR ESTE BLOCO COMO PERDIDO ANTES — as duas eram erro meu:
//  1. Testei a rota `/folha-pagamento` (`/api/SicomFolhaPagamento`) e o POST voltava CORPO VAZIO. A rota boa é
//     **`/servidores` → `POST /api/SicomServidor`**, achada quando o verificador passou a testar todas as rotas.
//  2. O payload DataTables não basta: falta **`metodo=CRUD_DT`** e os `filtro[...]` que a página injeta. Sem eles
//     a resposta é `{}` com 200 — o silêncio que parece "não publica" ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
//
// Campos: dscCargo · **dscLotacao** (hierarquia inteira, separada por vírgula) · vlrCargaHorariaSemanal ·
// **vlrRemuneracaoBruta · vlrDescontos · vlrRemuneracaoLiquida** · datEfetExercicio · indSituacaoServidorPensionista ·
// pessoaNome · pessoaDoc. Dinheiro com PONTO decimal.
//
// ⚠️ `cm…` é CÂMARA: dos 7 portais de MG, 6 são de câmara e só Itanhomi é prefeitura.
//
// Uso: node scripts/ingest_folha_gwtransparencia.mjs [UF=MG] [SO=Itanhomi] [REFAZ=1]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_gwtransp (
  cod_ibge text, municipio text, uf text, host text, competencia text,
  matricula text, nome text, documento text, cargo text, secretaria text, lotacao_completa text,
  situacao text, carga_horaria text, data_exercicio text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_gw_mun on folha_servidores_gwtransp (cod_ibge, competencia)`);
await q(`create table if not exists folha_gwtransp_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

const COLS = ["codVinculoPessoa", "dataReferencia", "pessoaNome", "datEfetExercicio", "dscCargo", "dscLotacao",
  "vlrCargaHorariaSemanal", "vlrRemuneracaoBruta", "vlrRemuneracaoLiquida"];
function corpo(start, len) {
  const p = new URLSearchParams();
  COLS.forEach((c, i) => {
    p.append(`columns[${i}][data]`, c); p.append(`columns[${i}][name]`, "");
    p.append(`columns[${i}][searchable]`, "true"); p.append(`columns[${i}][orderable]`, "true");
    p.append(`columns[${i}][search][value]`, ""); p.append(`columns[${i}][search][regex]`, "false");
  });
  p.append("draw", "1"); p.append("start", String(start)); p.append("length", String(len));
  p.append("search[value]", ""); p.append("search[regex]", "false");
  p.append("order[0][column]", "1"); p.append("order[0][dir]", "asc");
  // 🚨 sem estes o serviço devolve {} com HTTP 200
  p.append("metodo", "CRUD_DT");
  for (const f of ["codVinculoPessoa", "situacao", "cargo", "faixaSalarial"]) p.append(`filtro[${f}]`, "");
  p.append("filtro[sglCargoExcluir]", "EST");
  return p.toString();
}
async function grid(host, start, len) {
  const r = await fetch(`https://${host}/api/SicomServidor`, {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest", accept: "application/json", referer: `https://${host}/servidores` },
    body: corpo(start, len), signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const t = await r.text();
  if (!t.startsWith("{")) throw new Error("resposta nao e JSON");
  return JSON.parse(t);
}
const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const comp = (d) => (d ? String(d).slice(0, 7).replace("-", "") : null);

const LOTE = 500;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const f = arr.slice(i, i + LOTE); const c = (k) => f.map((r) => r[k]);
    await q(`insert into folha_servidores_gwtransp
      (cod_ibge,municipio,uf,host,competencia,matricula,nome,documento,cargo,secretaria,lotacao_completa,
       situacao,carga_horaria,data_exercicio,bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],
        $17::numeric[],$18::text[])
      on conflict (_hash) do nothing`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("matricula"), c("nome"),
       c("documento"), c("cargo"), c("secretaria"), c("lotacao_completa"), c("situacao"), c("carga_horaria"),
       c("data_exercicio"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

// alvos: portais gwtransparencia de PREFEITURA (o `cm` é câmara)
const alvos = (await q(`select distinct on (m.cod_ibge) m.cod_ibge, m.nome municipio, m.uf,
    split_part(regexp_replace(u.url,'^https?://',''),'/',1) host
  from municipios_br m
  join lateral (
    select url, em from (
      select p.url_portal_real url, p.em from portal_real_descoberto p where p.cod_ibge = m.cod_ibge
      union all select coalesce(d.url_pessoal,d.url_visitada), d.em from folha_diagnostico_faltante d where d.cod_ibge = m.cod_ibge
      union all select v.rota_com_dados, v.em from folha_verificacao_municipal v where v.cod_ibge = m.cod_ibge
    ) t where url ilike '%gwtransparencia%' and url !~* '//cm' order by em desc limit 1) u on true
  ${UF ? "where m.uf = $1" : ""} ${SO ? `${UF ? "and" : "where"} m.nome ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
  order by m.cod_ibge`, [UF, SO].filter(Boolean))).rows;

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_gwtransp_coleta where situacao like 'ok%'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[gwtransp] ${alvos.length} portais de prefeitura · ${fila.length} na fila`);

let total = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe = null, cp = null, linhas = 0) =>
    q(`insert into folha_gwtransp_coleta (cod_ibge,municipio,uf,host,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (cod_ibge) do update set host=excluded.host, competencia=excluded.competencia,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.host, cp, linhas, situacao, detalhe]);
  try {
    const primeira = await grid(a.host, 0, 100);
    const tot = Number(primeira.recordsTotal || 0);
    if (!tot) { await marca("vazio", "recordsTotal = 0"); vazios++; continue; }
    const linhas = [...(primeira.data || [])];
    for (let start = 100; start < tot; start += 500) {
      const j = await grid(a.host, start, 500);
      linhas.push(...(j.data || []));
      await dorme(250);
    }
    const regs = linhas.map((r) => {
      const lot = (r.dscLotacao || "").split(",").map((s) => s.trim()).filter(Boolean);
      return {
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, host: a.host,
        competencia: comp(r.dataReferencia),
        matricula: r.codVinculoPessoa || null, nome: (r.pessoaNome || "").trim() || null,
        documento: r.pessoaDoc || null, cargo: (r.dscCargo || "").trim() || null,
        // a lotação vem como hierarquia "PREFEITURA, SECRETARIA X, DEPTO Y" — a secretaria é o 2º nível
        secretaria: lot[1] || lot[0] || null, lotacao_completa: r.dscLotacao || null,
        situacao: r.indSituacaoServidorPensionista || null,
        carga_horaria: r.vlrCargaHorariaSemanal != null ? String(r.vlrCargaHorariaSemanal) : null,
        data_exercicio: r.datEfetExercicio || null,
        bruto: num(r.vlrRemuneracaoBruta), descontos: num(r.vlrDescontos), liquido: num(r.vlrRemuneracaoLiquida),
        _hash: crypto.createHash("md5").update([a.cod_ibge, r.dataReferencia, r.codVinculoPessoa, r.dscCargo, r.vlrRemuneracaoBruta].join("¦")).digest("hex"),
      };
    });
    await grava(regs);
    total += regs.length; ok++;
    const comVal = regs.filter((r) => r.bruto > 0).length;
    const cp = regs.find((r) => r.competencia)?.competencia || null;
    await marca("ok", `${comVal} com valor`, cp, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${regs.length} servidores (${cp}, ${comVal} com valor)`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 180));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  }
  await dorme(400);
}
console.log(`\n[gwtransp] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
