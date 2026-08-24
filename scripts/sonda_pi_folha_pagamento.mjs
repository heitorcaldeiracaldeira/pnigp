// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// sonda_pi_folha_pagamento.mjs — procura a tela `/transparencia/folha-pagamento` em TODO host do Piauí.
//
// ⭐ POR QUE ESTA TELA É A BOA: é a única do estado que entrega os CINCO campos de uma vez —
//    Servidor · Cargo · **Lotação** · **Remuneração** · R. Líquida (+ patronal, INSS). GET puro, filtro `?mes=&ano=`.
//    As outras três telas do PI dão pedaços: o `/{slug}/servidores/` tem lotação sem valor, o `/v2` tem valor
//    sem lotação, e o `/transparencia/servidores` é cadastro (PIS, filiação) sem cargo nem valor.
//
// 🚨 COMO ELA APARECEU — a lição: eu tinha marcado 7 municípios como "vazio" porque a tela `/servidores` deles
//    não batia com o parser. Em vez de consertar o parser, fui ao **menu** `/transparencia` e li os links.
//    O menu dizia "Relação Nominal de Remuneração → /transparencia/folha-pagamento". A tela certa estava a um
//    clique, e eu estava insistindo na errada. ⚠️ Quando uma tela decepciona, LER O MENU do portal antes de
//    culpar o parser ([[pnigp-varredura-colher-tudo-nao-o-primeiro]] é o mesmo hábito noutro contexto).
//
// Uso: node scripts/sonda_pi_folha_pagamento.mjs   ·   CONC=14   ·   UFA=PI
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";

setGlobalDispatcher(new Agent({ connect: { timeout: 30000, rejectUnauthorized: false, family: 4 },
  headersTimeout: 60000, bodyTimeout: 120000 }));

const db = pool(); const q = withRetry(db);
const CONC = Number(process.env.CONC || 14);
const UFA = process.env.UFA || "PI";
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml" };

await q(`create table if not exists pi_folha_pag_sonda (
  cod_ibge text primary key, municipio text, url text, linhas int, cabecalho text,
  tem_valor boolean, tem_lotacao boolean, situacao text, detalhe text, em timestamptz default now())`);

const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/ pi$/, "").replace(/ do piaui$/, "").replace(/[^a-z0-9]/g, "");

const alvos = (await q(`select m.cod_ibge, m.nome municipio,
    (select array_agg(distinct h.host) from pi_host_censo h
      where h.cod_ibge=m.cod_ibge and h.host like '%.gov.br') hosts,
    (select v.url from pi_servidores_visita v where v.cod_ibge=m.cod_ibge and v.url is not null) url_visita
  from municipios_br m where m.uf=$1 order by m.nome`, [UFA])).rows;
console.log(`[folha-pag] ${alvos.length} municípios`);

function candidatos(a) {
  const s = slug(a.municipio);
  const hs = new Set([...(a.hosts || []), `${s}.pi.gov.br`, `transparencia.${s}.pi.gov.br`, `www.${s}.pi.gov.br`]);
  if (a.url_visita) { try { hs.add(new URL(a.url_visita).hostname); } catch {} }
  const out = [];
  for (const h of hs) out.push(`https://${h}/transparencia/folha-pagamento`, `https://${h}/${s}/folha-pagamento`);
  return [...new Set(out)];
}

const semTags = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function sonda(a) {
  let ultimo = "sem host";
  for (const u of candidatos(a)) {
    try {
      const r = await fetch(u, { headers: H, redirect: "follow", signal: AbortSignal.timeout(45000) });
      if (r.status >= 400) { ultimo = `HTTP ${r.status}`; continue; }
      const t = await r.text();
      const ths = [...t.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => semTags(m[1])).filter(Boolean);
      const trs = ((t.split(/<tbody/i)[1] || "").match(/<tr/gi) || []).length;
      // ⚠️ a prova é a LINHA, não o 200: exijo linhas E dinheiro no corpo
      if (!trs || !/R?\$?\s?[\d.]+,\d{2}/.test(t)) { ultimo = trs ? "sem valor" : "sem linhas"; continue; }
      return { url: u, linhas: trs, cab: ths.slice(0, 12).join(" | "),
        valor: ths.some((x) => /remuner|l[íi]quid|bruto|sal[áa]rio|vencim/i.test(x)),
        lotacao: ths.some((x) => /lota[çc]|secretaria|setor|[óo]rg[ãa]o/i.test(x)), situacao: "achou" };
    } catch (e) { ultimo = (e.cause?.code || e.name || e.message).toString().slice(0, 26); }
  }
  return { url: null, linhas: 0, cab: null, valor: false, lotacao: false, situacao: "nao_achou", detalhe: ultimo };
}

let i = 0, achados = 0;
async function trab() {
  while (i < alvos.length) {
    const a = alvos[i++];
    const r = await sonda(a);
    if (r.situacao === "achou") { achados++; console.log(`  ✔ ${a.municipio}: ${r.linhas} linhas · ${r.cab.slice(0, 70)}`); }
    await q(`insert into pi_folha_pag_sonda (cod_ibge,municipio,url,linhas,cabecalho,tem_valor,tem_lotacao,situacao,detalhe,em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set url=excluded.url,
      linhas=excluded.linhas, cabecalho=excluded.cabecalho, tem_valor=excluded.tem_valor,
      tem_lotacao=excluded.tem_lotacao, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, r.url, r.linhas, r.cab, r.valor, r.lotacao, r.situacao, r.detalhe || null]);
    if (i % 25 === 0) console.log(`   ${i}/${alvos.length} · ${achados} com folha-pagamento`);
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.table((await q(`select situacao, count(*) n, count(*) filter (where tem_valor) com_valor,
  count(*) filter (where tem_lotacao) com_lotacao, sum(linhas) linhas from pi_folha_pag_sonda group by 1 order by 2 desc`)).rows);
console.table((await q(`select detalhe, count(*) n from pi_folha_pag_sonda where situacao='nao_achou' group by 1 order by 2 desc limit 8`)).rows);
await db.end();
