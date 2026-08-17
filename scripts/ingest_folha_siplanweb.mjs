// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_siplanweb.mjs — folha dos municípios em Siplan (`{pm-slug}.publicacao.siplanweb.com.br`).
//
// Bloco descoberto em 16/ago/2026 pela varredura de portal real de MG: 81 portais, o MAIOR bloco do estado sem
// coletor. Entrega os três campos do Bento e ainda o LOCAL de trabalho:
//   nom_pes · nom_ccusto (centro de custo = secretaria) · nom_funcao (cargo) · tot_venc (bruto) ·
//   tot_desc · val_a_receber (líquido) · tipo_vinculo · data_admis_contr · desc_local (escola/unidade)
//
// A porta é o DataTable: POST `/pessoal/grid-pessoal` (Laravel), payload DataTables + ano/mes/tipoCalc.
// 🚨 `columns[]` é OBRIGATÓRIO — sem ele o Laravel estoura 500 ("foreach() argument must be of type array").
// 🚨 O portal RECUSA navegador headless com "Acesso Negado": exige user-agent de navegador real.
// 🚨 `cm-*` é CÂMARA — coletar de lá dá dezenas de pessoas onde há milhares ([[pnigp-entidade-espelho-infla-folha]]).
//
// Uso: node scripts/ingest_folha_siplanweb.mjs [UF=MG] [SO=Aracitaba] [ANO=2026] [REFAZ=1]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;
const SO = process.env.SO || null;
const ANO = process.env.ANO ? Number(process.env.ANO) : null;
const JANELA = Number(process.env.JANELA || 15);   // competências para trás, atravessando a virada do ano
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_siplanweb (
  cod_ibge text, municipio text, uf text, host text, competencia text,
  matricula text, nome text, secretaria text, cargo text, cargo_comissao text,
  vinculo text, tipo_calc text, local_trabalho text, data_admissao text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_siplan_mun on folha_servidores_siplanweb (cod_ibge, competencia)`);
await q(`create table if not exists folha_siplanweb_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

// ── payload DataTables: o servidor só precisa do array de colunas; o resto são os filtros da tela ─────────────
const COLUNAS = ["codi_contr_sequ", "codi_contr", "mes", "nom_pes", "mes_extenso", "nom_ccusto", "nom_funcao",
  "cargo_efetivo_comiss", "tipo_vinculo", "tipo_calc", "tot_venc", "tot_desc", "val_a_receber"];
function corpo({ ano, mes, start, length }) {
  const p = new URLSearchParams();
  COLUNAS.forEach((c, i) => {
    p.append(`columns[${i}][data]`, c);
    p.append(`columns[${i}][name]`, "");
    p.append(`columns[${i}][searchable]`, "true");
    p.append(`columns[${i}][orderable]`, "true");
    p.append(`columns[${i}][search][value]`, "");
    p.append(`columns[${i}][search][regex]`, "false");
  });
  p.append("draw", "1");
  p.append("start", String(start));
  p.append("length", String(length));
  p.append("search[value]", "");
  p.append("search[regex]", "false");
  // 🚨 `order[]` é tão obrigatório quanto `columns[]`: sem ele o mesmo foreach estoura 500. Foi o que separou
  // o 500 do 200 — e com a grid respondendo, Aracitaba passou de "200 registros" (a tela abre filtrada) para 1.462.
  p.append("order[0][column]", "1");
  p.append("order[0][dir]", "asc");
  p.append("ano", String(ano));
  p.append("mes", String(mes));
  p.append("tipoCalc", "2");        // 2 = Folha de Pagamento (8 = Rescisão)
  return p.toString();
}

async function grid(host, ano, mes, start, length) {
  const r = await fetch(`https://${host}/pessoal/grid-pessoal`, {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest", accept: "application/json, text/javascript, */*; q=0.01",
      referer: `https://${host}/pessoal/gestao-pessoal` },
    body: corpo({ ano, mes, start, length }),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j.success === false) throw new Error(String(j.message || "erro na grid").slice(0, 80));
  return j;
}

const num = (s) => { const v = parseFloat(String(s ?? "").replace(",", ".")); return Number.isFinite(v) ? v : null; };

const LOTE = 500;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const f = arr.slice(i, i + LOTE); const c = (k) => f.map((r) => r[k]);
    await q(`insert into folha_servidores_siplanweb
      (cod_ibge,municipio,uf,host,competencia,matricula,nome,secretaria,cargo,cargo_comissao,vinculo,tipo_calc,
       local_trabalho,data_admissao,bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],
        $17::numeric[],$18::text[])
      on conflict (_hash) do nothing`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("matricula"), c("nome"),
       c("secretaria"), c("cargo"), c("cargo_comissao"), c("vinculo"), c("tipo_calc"), c("local_trabalho"),
       c("data_admissao"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

// ── alvos: portais siplanweb da PREFEITURA (pm-), fora os de contracheque (área logada do servidor) ───────────
const alvos = (await q(`select distinct on (p.cod_ibge) p.cod_ibge, m.nome municipio, m.uf,
    regexp_replace(regexp_replace(p.url_portal_real,'^https?://',''),'/.*$','') host
  from portal_real_descoberto p
  join municipios_br m on m.cod_ibge = p.cod_ibge
 where p.url_portal_real ilike '%publicacao.siplanweb.com.br%'
   and p.url_portal_real !~* '//cm-'
   ${UF ? "and m.uf = $1" : ""} ${SO ? `and m.nome ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
 order by p.cod_ibge, p.em desc`, [UF, SO].filter(Boolean))).rows;

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_siplanweb_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[siplanweb] ${alvos.length} portais · ${fila.length} na fila`);

// competências do mês corrente para trás, atravessando a virada do ano
const hoje = new Date(Date.UTC(2026, 7, 16));
const COMPS = [];
for (let k = 0; k < JANELA; k++) {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 1));
  COMPS.push([ANO || d.getUTCFullYear(), d.getUTCMonth() + 1]);
}

let total = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe = null, comp = null, linhas = 0) =>
    q(`insert into folha_siplanweb_coleta (cod_ibge,municipio,uf,host,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (cod_ibge) do update set host=excluded.host, competencia=excluded.competencia,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.host, comp, linhas, situacao, detalhe]);
  try {
    // 🚨 competência: a folha do mês pode não ter fechado e o portal pode ter parado meses atrás — recuar até achar
    let ano = null, mes = null, primeira = null;
    for (const [an, me] of COMPS) {
      const j = await grid(a.host, an, me, 0, 10);
      if (Number(j.recordsTotal) > 0) { ano = an; mes = me; primeira = j; break; }
      await dorme(250);
    }
    if (!primeira) { await marca("vazio", `sem dado em ${COMPS.length} competências`); vazios++; continue; }

    const totalReg = Number(primeira.recordsTotal);
    const linhas = [];
    for (let start = 0; start < totalReg; start += 1000) {
      const j = await grid(a.host, ano, mes, start, 1000);
      linhas.push(...(j.rows || []));
      if (!j.rows || !j.rows.length) break;
      await dorme(300);
    }
    const comp = `${ano}${String(mes).padStart(2, "0")}`;
    const regs = linhas.map((r) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, host: a.host, competencia: comp,
      matricula: r.codi_contr != null ? String(r.codi_contr) : null,
      nome: r.nom_pes || null, secretaria: r.nom_ccusto || null, cargo: r.nom_funcao || null,
      cargo_comissao: r.cargo_efetivo_comiss || null, vinculo: r.tipo_vinculo || null,
      tipo_calc: r.tipo_calc || null, local_trabalho: r.desc_local || null,
      data_admissao: r.data_admis_contr || null,
      bruto: num(r.tot_venc), descontos: num(r.tot_desc), liquido: num(r.val_a_receber),
      _hash: crypto.createHash("md5").update([a.cod_ibge, comp, r.codi_contr_sequ, r.nom_pes, r.nom_funcao].join("¦")).digest("hex"),
    }));
    await grava(regs);
    total += regs.length; ok++;
    const comSal = regs.filter((r) => r.bruto > 0).length;
    await marca("ok", `${comSal} com valor`, comp, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${regs.length} servidores (${comp}, ${comSal} com valor)`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 180));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  }
  await dorme(600);
}
console.log(`\n[siplanweb] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
