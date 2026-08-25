// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_ma_camara.mjs — folha das CÂMARAS do Maranhão no bloco `/folhapagamento/getFolhas`.
//
// POR QUÊ O MARANHÃO: é o maior buraco de folha do país e o TCE não resolve
// ([[pnigp-maranhao-e-o-maior-buraco-e-o-tce-nao-resolve]]). A camada de câmara do MA vem hoje do `tcema`, que
// publica valor e NÃO publica nome ([[pnigp-lista-sem-valor-nao-e-folha]] pelo lado do nome).
//
// ⭐ A ROTA: a página `/transparencia/folhapagamento` é casca — 39 KB, um <tr>, nenhum valor. O dado vem de
//    um GET em `{base}/folhapagamento/getFolhas`, citado no JS da própria página. Sem parâmetro nenhum ele
//    devolve o histórico inteiro: Monção 450 registros (127 KB), Timbiras 427 KB.
//    É o mesmo método que crackeou o bloco de PE ([[pnigp-pe-leg-whitelabel-folhaclass]]): ler a rota que a
//    página CITA em vez de acreditar na tabela renderizada.
//
// ENTREGA por servidor: competencia · tipo_folha · matricula · nome · cpf (JÁ MASCARADO na fonte) ·
//    data_admissao · data_exclusao · cargo · valor_bruto · valor_liquido · unidade.
//
// 🚨 O 13º VEM JUNTO. `tipo_folha` distingue "Folha Normal" de "13º Salário", e somar os dois infla o
//    município ([[pnigp-competencia-mais-cheia-nao-a-recente]] e a régua do Ágili Blue). Só a mensal entra.
// 🚨 VALOR EM pt-BR: "3.036,00" — decidir o formato pelo VALOR, nunca pela origem, é a armadilha que já mordeu
//    o TcePta e o SMARAPD ([[pnigp-tcepta-maranhao]]).
//
// Uso: node scripts/ingest_folha_ma_camara.mjs        · SO=Monção · REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { guardaCamara } from "./_folha_guarda_camara.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UA = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  "x-requested-with": "XMLHttpRequest",
  accept: "application/json, text/javascript, */*; q=0.01",
};

await q(`create table if not exists folha_servidores_ma_camara (
  cod_ibge text, municipio text, uf text, entidade text, competencia text, tipo_folha text,
  matricula text, cpf_masc text, nome text, cargo text, unidade text,
  data_admissao text, data_exclusao text, valor_bruto numeric, valor_liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_ma_cam_mun on folha_servidores_ma_camara (cod_ibge, competencia)`);
await q(`create table if not exists folha_ma_camara_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text,
  linhas int, pessoas int, situacao text, detalhe text, em timestamptz default now()
)`);

const MES = { janeiro: "01", fevereiro: "02", "março": "03", marco: "03", abril: "04", maio: "05", junho: "06",
              julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12" };
// "Dezembro / 2025" → "202512"
const comp = (s) => {
  const m = String(s || "").toLowerCase().match(/([a-zçã]+)\s*\/\s*(\d{4})/);
  return m && MES[m[1]] ? `${m[2]}${MES[m[1]]}` : null;
};
// 🚨 pt-BR: "3.036,00". Decidir pelo VALOR, não pela origem.
const num = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const alvos = (await q(`select cod_ibge, municipio, uf, coalesce(url_pessoal, url_visitada) url
   from folha_diagnostico_camara
  where uf = 'MA' and coalesce(url_pessoal, url_visitada) ~* 'folhapagamento|folha-de-pagamento'
    ${SO ? "and municipio ilike '%' || $1 || '%'" : ""}
  order by municipio`, SO ? [SO] : [])).rows
  .map((a) => { let o = null; try { o = new URL(a.url).origin; } catch { /* url inválida */ } return { ...a, base: o }; })
  .filter((a) => a.base);

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_ma_camara_coleta where situacao like 'ok%'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[ma-camara] ${alvos.length} câmaras no bloco · ${fila.length} na fila`);

const marca = (a, situacao, detalhe, linhas = 0, pessoas = 0, c = null) =>
  q(`insert into folha_ma_camara_coleta (cod_ibge,municipio,uf,competencia,linhas,pessoas,situacao,detalhe,em)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
       competencia=excluded.competencia, linhas=excluded.linhas, pessoas=excluded.pessoas,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [a.cod_ibge, a.municipio, a.uf, c, linhas, pessoas, situacao, String(detalhe || "").slice(0, 200)]);

let ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  try {
    let j = null;
    for (let t = 0; t < 3 && !j; t++) {
      try {
        const r = await fetch(`${a.base}/folhapagamento/getFolhas`, { headers: UA, redirect: "follow",
          signal: AbortSignal.timeout(90000) });
        if (r.ok) { const txt = await r.text(); if (txt.trim().startsWith("{")) j = JSON.parse(txt); }
      } catch { /* retry */ }
      if (!j && t < 2) await new Promise((s) => setTimeout(s, 3000 * (t + 1)));
    }
    const linhas = j && Array.isArray(j.data) ? j.data : [];
    if (!linhas.length) { await marca(a, "vazio", "getFolhas sem dado ou rota ausente"); vazios++;
                          console.log(`  · ${a.municipio}: vazio`); continue; }

    // 🚨 só a MENSAL: o 13º vem na mesma lista e somar os dois infla o município
    const mensais = linhas.filter((x) => !/13.{0,3}sal|d[ée]cimo.{0,3}terceiro/i.test(String(x.tipo_folha || "")));
    // ⭐ competência MAIS CHEIA, não a mais recente
    const porComp = new Map();
    for (const x of mensais) {
      const c = comp(x.competencia); if (!c) continue;
      if (!porComp.has(c)) porComp.set(c, []);
      porComp.get(c).push(x);
    }
    let melhor = null;
    for (const [c, arr] of porComp) {
      const p = new Set(arr.map((x) => x.matricula || x.nome)).size;
      if (!melhor || p > melhor.pessoas) melhor = { c, arr, pessoas: p };
    }
    if (!melhor) { await marca(a, "vazio", "nenhuma competência mensal legível"); vazios++;
                   console.log(`  · ${a.municipio}: sem competência mensal`); continue; }

    const g = await guardaCamara(q, a.cod_ibge, melhor.pessoas);
    if (!g.ok) { await marca(a, "recusado_volume", g.motivo, 0, melhor.pessoas); falhas++;
                 console.log(`  ⛔ ${a.municipio}: ${g.motivo}`); continue; }

    const regs = melhor.arr.map((x) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: "MA", entidade: x.unidade || "Câmara Municipal",
      competencia: melhor.c, tipo_folha: x.tipo_folha ?? null, matricula: x.matricula ?? null,
      cpf_masc: x.cpf ?? null, nome: (x.nome || "").trim() || null, cargo: (x.cargo || "").trim() || null,
      unidade: x.unidade ?? null, data_admissao: x.data_admissao ?? null, data_exclusao: x.data_exclusao ?? null,
      valor_bruto: num(x.valor_bruto), valor_liquido: num(x.valor_liquido),
      _hash: crypto.createHash("md5")
        .update([a.cod_ibge, melhor.c, x.matricula, x.nome, x.tipo_folha, x.valor_bruto].join("¦")).digest("hex"),
    }));
    const C = (k) => regs.map((r) => r[k]);
    await q(`insert into folha_servidores_ma_camara
      (cod_ibge,municipio,uf,entidade,competencia,tipo_folha,matricula,cpf_masc,nome,cargo,unidade,
       data_admissao,data_exclusao,valor_bruto,valor_liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::text[],$9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::numeric[],$16::text[])
      on conflict (_hash) do update set nome=excluded.nome, cargo=excluded.cargo, unidade=excluded.unidade,
        valor_bruto=excluded.valor_bruto, valor_liquido=excluded.valor_liquido, cpf_masc=excluded.cpf_masc`,
      [C("cod_ibge"), C("municipio"), C("uf"), C("entidade"), C("competencia"), C("tipo_folha"), C("matricula"),
       C("cpf_masc"), C("nome"), C("cargo"), C("unidade"), C("data_admissao"), C("data_exclusao"),
       C("valor_bruto"), C("valor_liquido"), C("_hash")]);
    await marca(a, "ok", `${melhor.pessoas} pessoas · ${porComp.size} competências disponíveis`,
                regs.length, melhor.pessoas, melhor.c);
    ok++;
    console.log(`  ✔ [${i + 1}/${fila.length}] ${a.municipio.padEnd(24)} ${String(melhor.pessoas).padStart(4)} pessoas · ${melhor.c}`);
  } catch (e) {
    await marca(a, "erro", e.message); falhas++;
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  }
}
const t = (await q(`select count(*)::int linhas, count(distinct cod_ibge)::int munis,
   count(distinct nome)::int pessoas from folha_servidores_ma_camara`)).rows[0];
console.log(`\n[ma-camara] ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
console.log(`[ma-camara] tabela: ${t.munis} câmaras · ${t.linhas} linhas · ${t.pessoas} pessoas`);
await db.end();
