// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_apitransp.mjs — portal próprio com API REST em `api.transparencia.{slug}.{uf}.gov.br`.
// Achado em 17/ago/2026 visitando um a um os faltantes de GO ([[pnigp-go-to-mapa-folha]]).
//
// ⭐ Os CINCO campos e mais: matricula · nome · cpf (JÁ mascarado na origem) · cargo · **departamento
// (=secretaria)** · orgao · tipo_vinculo · situacao · carga_horaria · nivel · **proventos** · descontos ·
// total_liquido · data_admissao · categoria_esocial. Sem login, sem captcha, sem navegador.
//
// API: `GET /api/dados/rh/folha_de_pagamento?ano=&pagina=&limit=&apenasPagina=1`
//      → { totalExibicao, totalPaginas, PagamentosPaginados: { data: [...] } }
//
// ⚠️ Alcance MEDIDO: sondados os 73 municípios de GO/TO sem folha, só **2** respondem (Acreúna 4.743 e
// Simolândia 3.269 registros). Bloco pequeno, mas a API é trivial e são 8 mil registros completos.
// 🚨 Usar `proventos` (BRUTO), nunca `total_liquido`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const LIMIT = Number(process.env.LIMIT || 500);
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" };
const slugDe = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const UFN = { "17": "to", "52": "go" };

await q(`create table if not exists folha_servidores_apitransp (
  cod_ibge text, municipio text, uf text, host text, orgao text, competencia text,
  matricula text, nome text, cpf_masc text, cargo text, secretaria text, vinculo text, situacao text,
  carga_horaria text, nivel text, proventos numeric, descontos numeric, liquido numeric, data_admissao text,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_at_mun on folha_servidores_apitransp (cod_ibge, competencia)`);
await q(`create table if not exists folha_apitransp_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

const alvos = (await q(`select m.cod_ibge, m.nome municipio, left(m.cod_ibge,2) uf from municipios_br m
  where left(m.cod_ibge,2) in ('17','52')
    and not exists (select 1 from vw_folha_municipal_brasil v where v.cod_ibge=m.cod_ibge and v.fonte<>'rais')
    and not exists (select 1 from folha_apitransp_coleta c where c.cod_ibge=m.cod_ibge and c.situacao in ('ok','ok_parcial','sem_host'))
  order by 3,2`)).rows.filter((a) => !SO || new RegExp(SO, "i").test(a.municipio));
console.log(`[apitransp] ${alvos.length} municípios na fila`);

const jget = async (u) => {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(90000) });
      if (!r.ok) { if (r.status >= 500) { await dorme(1500 * (t + 1)); continue; } return null; }
      try { return JSON.parse(await r.text()); } catch { return null; }
    } catch { await dorme(1500 * (t + 1)); }
  }
  return null;
};
const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

async function grava(p, regs) {
  const LOTE = 800;
  for (let i = 0; i < regs.length; i += LOTE) {
    const parte = regs.slice(i, i + LOTE); const c = (f) => parte.map((x) => x[f]);
    await q(`insert into folha_servidores_apitransp
      (cod_ibge,municipio,uf,host,orgao,competencia,matricula,nome,cpf_masc,cargo,secretaria,vinculo,situacao,
       carga_horaria,nivel,proventos,descontos,liquido,data_admissao,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::numeric[],
        $17::numeric[],$18::numeric[],$19::text[],$20::text[])
      on conflict (_hash) do nothing`,
      [parte.map(() => p.cod_ibge), parte.map(() => p.municipio), parte.map(() => p.ufSigla), parte.map(() => p.host),
       c("orgao"), c("competencia"), c("matricula"), c("nome"), c("cpf_masc"), c("cargo"), c("secretaria"),
       c("vinculo"), c("situacao"), c("carga_horaria"), c("nivel"), c("proventos"), c("descontos"), c("liquido"),
       c("data_admissao"),
       parte.map((r) => crypto.createHash("md5")
         .update([p.cod_ibge, r.competencia, r.orgao, r.matricula, r.nome, r.cargo, r.proventos].join("¦")).digest("hex"))]);
  }
}

let ok = 0, parc = 0, falhas = 0, total = 0;
for (let i = 0; i < alvos.length; i++) {
  const a = { ...alvos[i], ufSigla: UFN[alvos[i].uf].toUpperCase() };
  const marca = (situacao, detalhe, host = null, comp = null, linhas = 0) =>
    q(`insert into folha_apitransp_coleta (cod_ibge,municipio,uf,host,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set host=excluded.host,
       competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao,
       detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.ufSigla, host, comp, linhas, situacao, detalhe]);
  try {
    const host = `api.transparencia.${slugDe(a.municipio)}.${UFN[a.uf]}.gov.br`;
    const ano = new Date().getFullYear();
    const cab = await jget(`https://${host}/api/dados/rh/folha_de_pagamento?ano=${ano}&pagina=1&limit=1&apenasPagina=1`);
    if (!cab || !(cab.totalExibicao > 0)) { await marca("sem_host", "API não respondeu ou veio vazia", host); falhas++; continue; }

    const paginas = Math.ceil(cab.totalExibicao / LIMIT);
    const regs = [];
    for (let pg = 1; pg <= paginas && pg <= 400; pg++) {
      const j = await jget(`https://${host}/api/dados/rh/folha_de_pagamento?ano=${ano}&pagina=${pg}&limit=${LIMIT}&apenasPagina=1`);
      const arr = j?.PagamentosPaginados?.data || j?.PagamentosPaginados || [];
      if (!Array.isArray(arr) || !arr.length) break;
      for (const s of arr) regs.push({
        orgao: s.orgao, competencia: s.ano && s.mes ? `${s.ano}${String(s.mes).padStart(2, "0")}` : null,
        matricula: String(s.matricula ?? ""), nome: s.nome, cpf_masc: s.cpf, cargo: s.cargo,
        secretaria: s.departamento, vinculo: s.tipo_vinculo, situacao: s.situacao,
        carga_horaria: s.carga_horaria != null ? String(s.carga_horaria) : null,
        nivel: s.nivel != null ? String(s.nivel) : null,
        proventos: num(s.proventos), descontos: num(s.descontos), liquido: num(s.total_liquido),
        data_admissao: s.data_admissao,
      });
      await dorme(200);
    }
    if (!regs.length) { await marca("sem_publicacao", "sem linhas", host); falhas++; continue; }

    // ⭐ COMPETÊNCIA MAIS CHEIA: a API devolve o ANO inteiro; ficar com o mês de maior quadro, não somar tudo,
    // senão o município aparece com 12× o número de servidores ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
    const porComp = {};
    for (const r of regs) if (r.competencia) porComp[r.competencia] = (porComp[r.competencia] || 0) + 1;
    const melhor = Object.entries(porComp).sort((x, y) => y[1] - x[1])[0]?.[0];
    const doMes = regs.filter((r) => r.competencia === melhor);
    await grava({ ...a, host }, doMes);

    const rais = (await q(`select count(*)::int v from folha_rais_municipal where left(cod_ibge6::text,6)=left($1,6)`, [a.cod_ibge])).rows[0]?.v || 0;
    const pct = rais ? Math.round(1000 * doMes.length / rais) / 10 : null;
    const parcial = rais > 100 && doMes.length < rais * 0.35;
    await marca(parcial ? "ok_parcial" : "ok", `${Object.keys(porComp).length} competências no ano${pct != null ? ` · ${pct}% da RAIS` : ""}`, host, melhor, doMes.length);
    if (parcial) parc++; else ok++;
    total += doMes.length;
    console.log(`  ${parcial ? "⚠" : " "} [${i + 1}/${alvos.length}] ${a.municipio}: ${doMes.length} servidores (${melhor})${pct != null ? ` · ${pct}% da RAIS` : ""}`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${alvos.length}] ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  }
  await dorme(300);
}
console.log(`\n[apitransp] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${parc} parciais · ${falhas} falhas`);
console.table((await q(`select count(distinct cod_ibge)::int municipios, count(*)::int linhas,
  count(*) filter (where secretaria is not null and secretaria<>'')::int com_secretaria,
  count(*) filter (where proventos>0)::int com_salario from folha_servidores_apitransp`)).rows);
await db.end();
