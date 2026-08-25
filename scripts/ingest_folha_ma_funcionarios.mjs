// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_ma_funcionarios.mjs — bloco `/funcionarios` do Maranhão (prefeituras E câmaras).
//
// O PRODUTO: portal próprio que serve a folha em HTML puro, paginada, com cabeçalho fixo
//   NOME | CARGO | LOTAÇÃO | ADMISSÃO | EXONERAÇÃO | QTD HORAS | VINCULO | BRUTO | DESCONTO | LIQUIDO
// Confirmado idêntico em Cajari (câmara, 2 páginas) e Presidente Sarney (prefeitura, 65 páginas ≈ 1.600
// servidores). Serve os DOIS PODERES, que é o caso que o Heitor pediu para não perder
// ([[pnigp-camara-vem-de-graca-quem-percorre-entidades]]).
//
// ⭐ SEM API, SEM JS: o dado está no HTML servido. Depois de uma noite de portais que só respondem por rota
//    escondida, este é o caso simples — e vale registrar que existe, para não presumir SPA em todo lugar.
//
// ⭐ A COMPETÊNCIA está na rota de exportação da própria página (`/funcionario-exportar-folha/06-2026/pdf`),
//    então não se adivinha: lê-se. Formato MM-AAAA.
//
// 🚨 O VÍNCULO separa VEREADOR de servidor. Em Cajari, "DONN KENNEDY … | VEREADOR | ELETIVOS | 6.500,00" é
//    agente político, não servidor concursado — fica gravado com o vínculo à vista para quem consome decidir
//    ([[feedback-trazer-todo-campo-que-a-fonte-publica]]).
// 🚨 pt-BR: "1.621,00". Decidir pelo VALOR, nunca pela origem ([[pnigp-tcepta-maranhao]]).
//
// Uso: node scripts/ingest_folha_ma_funcionarios.mjs      · SO=Cajari · REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { guardaCamara } from "./_folha_guarda_camara.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" };

await q(`create table if not exists folha_servidores_ma_func (
  cod_ibge text, municipio text, uf text, poder text, competencia text,
  nome text, cargo text, lotacao text, vinculo text, carga_horaria text,
  data_admissao text, data_exoneracao text,
  bruto numeric, desconto numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_ma_func_mun on folha_servidores_ma_func (cod_ibge, competencia)`);
await q(`create table if not exists folha_ma_func_coleta (
  cod_ibge text, poder text, municipio text, uf text, competencia text,
  linhas int, pessoas int, situacao text, detalhe text, em timestamptz default now(),
  primary key (cod_ibge, poder)
)`);

// 🚨 pt-BR — "1.621,00"
const num = (v) => {
  const s = String(v ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const limpa = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function pega(url) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(45000) });
      if (r.ok) return await r.text();
    } catch { /* retry */ }
    await new Promise((s) => setTimeout(s, 2500 * (t + 1)));
  }
  return null;
}

function linhasDa(html) {
  const out = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]{0,1500}?)<\/tr>/gi)) {
    const cels = [...m[1].matchAll(/<td[^>]*>([\s\S]{0,300}?)<\/td>/gi)].map((c) => limpa(c[1]));
    if (cels.length >= 10 && cels[0]) out.push(cels);
  }
  return out;
}

const alvos = (await q(`
   select cod_ibge, municipio, uf, coalesce(url_pessoal, url_visitada) url, 'legislativo' poder
     from folha_diagnostico_camara where coalesce(url_pessoal, url_visitada) ~* '/funcionarios'
   union all
   select cod_ibge, municipio, uf, coalesce(url_pessoal, url_visitada) url, 'executivo' poder
     from folha_diagnostico_faltante where coalesce(url_pessoal, url_visitada) ~* '/funcionarios'`)).rows
  .map((a) => { let o = null; try { o = new URL(a.url).origin; } catch { /* url inválida */ } return { ...a, base: o }; })
  .filter((a) => a.base && (!SO || new RegExp(SO, "i").test(a.municipio)));

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge || '|' || poder k from folha_ma_func_coleta where situacao like 'ok%'`)).rows.map((r) => r.k));
const fila = alvos.filter((a) => !feitos.has(`${a.cod_ibge}|${a.poder}`));
console.log(`[ma-func] ${alvos.length} portais no bloco · ${fila.length} na fila`);

const marca = (a, situacao, detalhe, linhas = 0, pessoas = 0, comp = null) =>
  q(`insert into folha_ma_func_coleta (cod_ibge,poder,municipio,uf,competencia,linhas,pessoas,situacao,detalhe,em)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge,poder) do update set
       competencia=excluded.competencia, linhas=excluded.linhas, pessoas=excluded.pessoas,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [a.cod_ibge, a.poder, a.municipio, a.uf, comp, linhas, pessoas, situacao, String(detalhe || "").slice(0, 200)]);

let ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  try {
    const p1 = await pega(`${a.base}/funcionarios`);
    if (!p1) { await marca(a, "erro", "portal não respondeu"); falhas++; console.log(`  ✖ ${a.municipio}: sem resposta`); continue; }

    // ⭐ competência lida na rota de exportação da própria página — MM-AAAA → AAAAMM
    const mc = p1.match(/exportar-folha\/(\d{2})-(\d{4})/);
    const comp = mc ? `${mc[2]}${mc[1]}` : null;
    // última página declarada na paginação
    const ultima = Math.max(1, ...[...p1.matchAll(/[?&]page=(\d+)/g)].map((m) => +m[1]));

    const todas = [...linhasDa(p1)];
    for (let pg = 2; pg <= ultima; pg++) {
      const h = await pega(`${a.base}/funcionarios?page=${pg}`);
      if (!h) break;
      const l = linhasDa(h);
      if (!l.length) break;
      todas.push(...l);
    }
    if (!todas.length) { await marca(a, "vazio", "tabela sem linhas"); vazios++; console.log(`  · ${a.municipio}: vazio`); continue; }

    const pessoas = new Set(todas.map((c) => c[0])).size;
    if (a.poder === "legislativo") {
      const g = await guardaCamara(q, a.cod_ibge, pessoas);
      if (!g.ok) { await marca(a, "recusado_volume", g.motivo, 0, pessoas); falhas++;
                   console.log(`  ⛔ ${a.municipio}: ${g.motivo}`); continue; }
    }

    const regs = todas.map((c) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, poder: a.poder, competencia: comp,
      nome: c[0] || null, cargo: c[1] || null, lotacao: c[2] || null,
      data_admissao: c[3] || null, data_exoneracao: c[4] || null, carga_horaria: c[5] || null,
      vinculo: c[6] || null, bruto: num(c[7]), desconto: num(c[8]), liquido: num(c[9]),
      _hash: crypto.createHash("md5").update([a.cod_ibge, a.poder, comp, c[0], c[1], c[7]].join("¦")).digest("hex"),
    }));
    // 🚨 DEDUPE ANTES DO INSERT: duas linhas do mesmo lote podem gerar o MESMO `_hash` (a mesma pessoa
    //    repetida entre páginas, ou dois registros idênticos em nome+cargo+valor). O Postgres recusa o lote
    //    inteiro com "ON CONFLICT DO UPDATE cannot affect row a second time" — e o município inteiro se perde
    //    por causa de uma duplicata. Presidente Sarney (65 páginas) caiu exatamente assim.
    const vistos = new Set();
    const unicos = regs.filter((r) => !vistos.has(r._hash) && vistos.add(r._hash));
    const C = (k) => unicos.map((r) => r[k]);
    await q(`insert into folha_servidores_ma_func
      (cod_ibge,municipio,uf,poder,competencia,nome,cargo,lotacao,vinculo,carga_horaria,
       data_admissao,data_exoneracao,bruto,desconto,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::text[],$9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],
        $15::numeric[],$16::text[])
      on conflict (_hash) do update set cargo=excluded.cargo, lotacao=excluded.lotacao,
        vinculo=excluded.vinculo, bruto=excluded.bruto, desconto=excluded.desconto, liquido=excluded.liquido`,
      [C("cod_ibge"), C("municipio"), C("uf"), C("poder"), C("competencia"), C("nome"), C("cargo"),
       C("lotacao"), C("vinculo"), C("carga_horaria"), C("data_admissao"), C("data_exoneracao"),
       C("bruto"), C("desconto"), C("liquido"), C("_hash")]);
    await marca(a, "ok", `${ultima} páginas${unicos.length < regs.length ? ` · ${regs.length - unicos.length} duplicatas` : ""}`, unicos.length, pessoas, comp);
    ok++;
    console.log(`  ✔ [${i + 1}/${fila.length}] ${a.municipio.padEnd(22)} ${a.poder.padEnd(12)} ${String(pessoas).padStart(5)} pessoas · ${comp} · ${ultima} pág`);
  } catch (e) {
    await marca(a, "erro", e.message); falhas++;
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  }
}
const t = (await q(`select count(*)::int linhas, count(distinct cod_ibge)::int munis,
   count(distinct nome)::int pessoas from folha_servidores_ma_func`)).rows[0];
console.log(`\n[ma-func] ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
console.log(`[ma-func] tabela: ${t.munis} municípios · ${t.linhas} linhas · ${t.pessoas} pessoas`);
await db.end();
