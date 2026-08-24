// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_abo_mg.mjs — portal ABO-MG (ASP.NET MVC), `transparencia.{município}.mg.gov.br/FolhaPagamento`.
//
// ⭐ Achado em 18/ago/2026 em Cristais/MG, indo um clique adiante num município marcado `tela_sem_linhas`
// ([[pnigp-tela-certa-nao-e-so-ter-tabela]]). O rodapé diz "Desenvolvido por ABO-MG".
//
// O contrato — POST que devolve HTML PARCIAL, com o tamanho de página na mão:
//   POST /FolhaPagamento/IndexLista
//   PAGINA_ATUAL=1 · MES_REFERENCIA=05 · NUM_EXERCICIO=2026 · RESULTADO_PAGINA=2000
//   (PALAVRA_CHAVE, DSC_CARGO, IND_CESSAO, IND_TIPO_PAGAMENTO, COD_IND_SGL_CARGO, IND_SITUACAO_SERVIDOR vazios)
//   → <tr> com Favorecido · Matrícula · Mês/Ano · Tipo do Pagamento · Tipo de Cargo · Cargo · Situação · Cedido ·
//     Valor Líquido
// `RESULTADO_PAGINA` aceita até 2000 na própria tela — o município inteiro cabe numa requisição.
//
// 🚨 A tela só existe para o mês FECHADO: 06 e 07/2026 devolvem ZERO linhas, 05/2026 devolve 548. Perguntar o mês
// corrente e concluir "não publica" seria o erro de sempre ([[pnigp-coletor-ok-sem-dado-sete-causas]]) — por isso
// o coletor RECUA mês a mês até achar a competência mais cheia ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
//
// 🚨 Dezembro traz `Tipo do Pagamento` = "13º (Décimo Terceiro)" junto com "Mensal": 1.234 linhas contra 548 dos
// meses normais. Sem separar por tipo, o município dobra de tamanho ([[pnigp-entidade-espelho-infla-folha]]).
//
// ⚠️ Uma dúzia de linhas vem SEM nome (demitidos e estagiários que o portal anonimiza) — ficam gravadas com
// `nome` nulo, porque anonimização do portal não é defeito da coleta ([[pnigp-scpi-sgpcloud-publica-sem-nome]]).
//
// Uso: node scripts/ingest_folha_abo_mg.mjs      · SO=<município> · MESES=8 (quantos meses recuar)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import "./_rede.mjs";
import crypto from "node:crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const MESES = Number(process.env.MESES || 8);
const UA = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  "x-requested-with": "XMLHttpRequest",
};

await q(`create table if not exists folha_servidores_abo_mg (
  cod_ibge text, municipio text, uf text, competencia text, matricula text, nome text,
  cargo text, tipo_cargo text, situacao text, cedido text, tipo_pagamento text, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create table if not exists folha_abo_mg_coleta (
  cod_ibge text primary key, municipio text, uf text, url text, situacao text, detalhe text,
  linhas int, competencia text, em timestamptz default now()
)`);

const ENT = { "&aacute;": "á", "&eacute;": "é", "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú", "&atilde;": "ã",
  "&otilde;": "õ", "&acirc;": "â", "&ecirc;": "ê", "&ocirc;": "ô", "&ccedil;": "ç", "&agrave;": "à", "&ordm;": "º",
  "&ordf;": "ª", "&nbsp;": " ", "&amp;": "&", "&quot;": '"' };
const limpa = (s) => String(s ?? "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&[a-z]+;/gi, (m) => ENT[m.toLowerCase()] ?? m)
  .replace(/\s+/g, " ").trim();
const num = (s) => { const n = Number(String(s ?? "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

function linhas(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => limpa(x[1].replace(/<[^>]+>/g, " "))))
    .filter((c) => c.length >= 8);
}

async function consulta(base, mes, ano) {
  const body = new URLSearchParams({ PAGINA_ATUAL: "1", PALAVRA_CHAVE: "", DSC_CARGO: "",
    MES_REFERENCIA: mes, NUM_EXERCICIO: ano, IND_CESSAO: "", IND_TIPO_PAGAMENTO: "",
    COD_IND_SGL_CARGO: "", IND_SITUACAO_SERVIDOR: "", RESULTADO_PAGINA: "2000" });
  const r = await fetch(`${base}/FolhaPagamento/IndexLista`, { method: "POST", headers: UA, body, signal: AbortSignal.timeout(240000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return linhas(await r.text());
}

const fila = (await q(`select distinct on (cod_ibge) cod_ibge, municipio, uf, url from folha_portal_candidato
  where produto = 'abo_mg' ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by cod_ibge, achado_em desc`,
  [SO].filter(Boolean))).rows;
console.log(`[abo-mg] ${fila.length} municípios na fila\n`);

let colhidos = 0;
for (const m of fila) {
  const base = String(m.url).replace(/\/FolhaPagamento.*$/i, "").replace(/\/+$/, "");
  const marca = (situacao, detalhe, n = 0, comp = null) =>
    q(`insert into folha_abo_mg_coleta (cod_ibge,municipio,uf,url,situacao,detalhe,linhas,competencia,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set situacao=excluded.situacao,
       detalhe=excluded.detalhe, linhas=excluded.linhas, competencia=excluded.competencia, em=now()`,
      [m.cod_ibge, m.municipio, m.uf, base, situacao, detalhe, n, comp]);

  // ⭐ recua mês a mês: o portal só tem o mês FECHADO, e o mais cheio pode não ser o mais recente
  const hoje = new Date();
  const tentativas = [];
  for (let k = 0; k < MESES; k++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1);
    tentativas.push([String(d.getMonth() + 1).padStart(2, "0"), String(d.getFullYear())]);
  }

  let melhor = null, erro = null;
  for (const [mes, ano] of tentativas) {
    let regs;
    try { regs = await consulta(base, mes, ano); } catch (e) { erro = e.message; continue; }
    // só a folha MENSAL: em dezembro o 13º vem junto e dobraria o município
    const mensais = regs.filter((c) => /mensal/i.test(c[3] || ""));
    if (!mensais.length) continue;
    if (!melhor || mensais.length > melhor.regs.length) melhor = { comp: `${ano}${mes}`, regs: mensais, todas: regs.length };
    if (melhor && melhor.regs.length >= mensais.length && melhor.comp !== `${ano}${mes}`) break; // já passou do pico
  }

  if (!melhor) {
    await marca(erro ? "erro" : "sem_dado", erro ?? `${MESES} meses consultados, nenhum com linha mensal`);
    console.log(`   ${erro ? "✖" : "·"} ${m.municipio}: ${erro ?? "nenhuma competência com dado"}`);
    continue;
  }

  const lote = melhor.regs.map((c) => {
    const nome = c[0] || null;
    const _hash = crypto.createHash("sha1").update([m.cod_ibge, melhor.comp, c[1] || "", nome || "", c[8]].join("|")).digest("hex");
    return [m.cod_ibge, m.municipio, m.uf, melhor.comp, c[1] || null, nome, c[5] || null, c[4] || null,
      c[6] || null, c[7] || null, c[3] || null, num(c[8]), _hash];
  });
  for (let i = 0; i < lote.length; i += 500) {
    const p = lote.slice(i, i + 500);
    const vals = p.map((_, k) => `(${Array.from({ length: 13 }, (_, j) => `$${k * 13 + j + 1}`).join(",")})`).join(",");
    await q(`insert into folha_servidores_abo_mg (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,
      tipo_cargo,situacao,cedido,tipo_pagamento,liquido,_hash) values ${vals} on conflict (_hash) do nothing`, p.flat());
  }
  const comNome = lote.filter((x) => x[5]).length;
  colhidos++;
  await marca("ok", `${comNome} com nome de ${lote.length} linhas mensais (${melhor.todas} no total da competência)`,
    lote.length, melhor.comp);
  console.log(`  ⭐ ${m.municipio.padEnd(26)} ${String(lote.length).padStart(5)} linhas · ${comNome} com nome · comp ${melhor.comp}`);
}

console.log(`\n[abo-mg] ${colhidos} municípios colhidos`);
await db.end();
