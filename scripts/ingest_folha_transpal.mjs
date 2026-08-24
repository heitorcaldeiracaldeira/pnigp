// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_transpal.mjs — folha NOMINAL do portal próprio `transparencia.{mun}.al.gov.br/servidores/`
// (AL: Belém, Estrela de Alagoas). PHP + DataTables com EXPORT CSV direto.
//
// ⭐ O atalho: `…/servidores/servidorescsv.php?ano=AAAA&mes=M` devolve o CSV inteiro por GET simples,
//    sem sessão e sem paginar. O link está na própria página, no botão de exportação.
//
// 🚨 O CSV **NÃO TEM CABEÇALHO** — a primeira linha já é dado. Ordem fixa, separador `;`:
//    ORGAO ; MATRICULA ; NOME ; CARGO ; BRUTO ; DESCONTOS ; LIQUIDO ; MES ; ANO
//    Ler por posição, nunca por nome de coluna ([[pnigp-rotulo-de-coluna-varia-lei]] vale ao contrário aqui).
// ⚠️ CPF não vem no CSV (só na tela, mascarado) — a folha entra sem CPF, e isso não a invalida.
//
// Uso: UF=AL node scripts/ingest_folha_transpal.mjs   ·   SO=Belém   ·   REFAZ=1   ·   RECUO=8
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "AL";
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const RECUO = Number(process.env.RECUO || 8);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };

await q(`create table if not exists folha_servidores_transpal (
  cod_ibge text, municipio text, uf text, base text, competencia text,
  orgao text, matricula text, nome text, cargo text,
  bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_transpal_mun on folha_servidores_transpal (cod_ibge, competencia)`);
await q(`create table if not exists folha_transpal_coleta (
  cod_ibge text primary key, municipio text, uf text, base text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  const t = String(s ?? "").replace(/R\$|\s|"/g, "").replace(/\./g, "").replace(",", ".");
  const n = +t; return Number.isFinite(n) && t !== "" ? n : null;
};
const txt = (s) => { const v = String(s ?? "").replace(/^"|"$/g, "").replace(/\s+/g, " ").trim(); return v || null; };

const alvos = (await q(`select cod_ibge, municipio, url from folha_host_candidato
  where uf = $1 and produto = 'folha_encontrada' and url ~* 'transparencia\\.[a-z]+\\.[a-z]{2}\\.gov\\.br/servidores'
  ${SO ? "and municipio ilike '%'||$2||'%'" : ""} order by municipio`, SO ? [UF, SO] : [UF])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_transpal_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[transpal] ${UF}: ${alvos.length} candidatos · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_transpal
      (cod_ibge,municipio,uf,base,competencia,orgao,matricula,nome,cargo,bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::numeric[],$11::numeric[],$12::numeric[],$13::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("base"), c("competencia"), c("orgao"), c("matricula"),
       c("nome"), c("cargo"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (const a of fila) {
  // base = .../servidores/  (o CSV vive dentro dela)
  const base = String(a.url).replace(/\/*$/, "").replace(/\/servidores.*$/i, "/servidores");
  const marca = (situacao, detalhe, linhas = 0, comp = null) =>
    q(`insert into folha_transpal_coleta (cod_ibge,municipio,uf,base,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
       base=excluded.base, competencia=excluded.competencia, linhas=excluded.linhas,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, UF, base, comp, linhas, situacao, detalhe]);
  try {
    // ⭐ do mês corrente para trás: para no primeiro com dado (município que parou de publicar não some —
    //    [[pnigp-recuo-curto-perde-quem-parou]])
    let regs = null, comp = null;
    const hoje = new Date();
    for (let k = 0; k < RECUO && !regs; k++) {
      const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
      const ano = d.getFullYear(), mes = d.getMonth() + 1;
      const url = `${base}/servidorescsv.php?ano=${ano}&mes=${mes}`;
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) }).catch(() => null);
      if (!r || !r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      let texto = buf.toString("utf8");
      if (/�/.test(texto)) texto = buf.toString("latin1");
      const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.includes(";"));
      if (linhas.length < 3) continue;
      const saida = [];
      for (const l of linhas) {
        const c = l.split(";");
        // 🚨 sem cabeçalho: posição fixa ORGAO;MATRICULA;NOME;CARGO;BRUTO;DESCONTOS;LIQUIDO;MES;ANO
        if (c.length < 7) continue;
        const nome = txt(c[2]); if (!nome) continue;
        const bruto = money(c[4]); if (bruto == null) continue;
        const cmp = `${txt(c[8]) || ano}${String(txt(c[7]) || mes).padStart(2, "0")}`;
        saida.push({ cod_ibge: a.cod_ibge, municipio: a.municipio, uf: UF, base, competencia: cmp,
          orgao: txt(c[0]), matricula: txt(c[1]), nome, cargo: txt(c[3]),
          bruto, descontos: money(c[5]), liquido: money(c[6]),
          _hash: crypto.createHash("md5").update([a.cod_ibge, cmp, c[1], nome, c[3]].join("¦")).digest("hex") });
      }
      if (saida.length) { regs = saida; comp = saida[0].competencia; }
    }
    if (!regs) { await marca("vazio", `sem CSV nas últimas ${RECUO} competências`); vazios++;
      console.log(`  · ${a.municipio}: vazio`); continue; }
    await grava(regs);
    totalGeral += regs.length; ok++;
    await marca("ok", null, regs.length, comp);
    console.log(`  ${a.municipio.padEnd(24)} ${String(regs.length).padStart(5)} servidores · ${comp}`);
  } catch (e) {
    await marca("falha", String(e.message).slice(0, 160)); falhas++;
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  }
}
console.log(`\n[transpal] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
