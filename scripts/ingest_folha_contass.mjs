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
await q(`create index if not exists ix_folha_contass_mun on folha_servidores_contass (cod_ibge, competencia)`);
await q(`create table if not exists folha_contass_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

async function json(url) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.json();
}

const LOTE = 500;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const f = arr.slice(i, i + LOTE); const c = (k) => f.map((r) => r[k]);
    await q(`insert into folha_servidores_contass
      (cod_ibge,municipio,uf,host,competencia,matricula,nome,cargo,secretaria,situacao,carga_horaria,data_admissao,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[])
      on conflict (_hash) do nothing`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("matricula"), c("nome"),
       c("cargo"), c("secretaria"), c("situacao"), c("carga_horaria"), c("data_admissao"), c("_hash")]);
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

    const regs = linhas.map((r) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, host: a.host, competencia: comp,
      matricula: r.matricula != null ? String(r.matricula) : null,
      nome: r.nome || null, cargo: r.cargo || null, secretaria: r.lotacao || null,
      situacao: r.recisao || null, carga_horaria: r.cargahoraria != null ? String(r.cargahoraria) : null,
      data_admissao: r.admissao || null,
      _hash: crypto.createHash("md5").update([a.cod_ibge, comp, r.id_coluna, r.matricula, r.nome].join("¦")).digest("hex"),
    }));
    await grava(regs);
    total += regs.length; ok++;
    await marca("ok", "SEM VALOR: a fonte nao publica remuneracao", comp, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${regs.length} servidores (${comp}, sem valor)`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 180));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  }
  await dorme(500);
}
console.log(`\n[contass] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
