// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_pe_leg.mjs — folha das CÂMARAS de Pernambuco no white-label `transparencia.{slug}.pe.leg.br`.
//
// O BLOCO: 16 câmaras de PE no mesmo produto, achadas pelo diagnóstico com navegador e nomeadas
// `pe-leg-whitelabel`. Era o maior bloco COM produto identificado e SEM extrator
// ([[pnigp-diagnostico-nacional-camaras-veredito]]).
//
// ⭐ A ROTA, e como se chega nela: `folha.php` é só a casca — 30 KB, um <tr>, nenhum valor. O dado vem de
//    `folhaClass.php`, que a página cita dentro de um jQuery Bootgrid. A armadilha: o Bootgrid manda POST, e
//    ESTE backend lê $_GET. Sem o parâmetro de página o PHP monta `LIMIT -10, 10` e vaza um
//    mysqli_sql_exception na cara — que é, por acidente, a melhor documentação da API.
//
//    GET folhaClass.php?ano=AAAA&mes=M&orgao=&current=1&rowCount=-1   → JSON {total, rows:[…]}
//    `rowCount=-1` devolve a folha inteira de uma vez ([[pnigp-tcepta-maranhao]] tem o mesmo padrão).
//
// ENTREGA por servidor: matricula · nome · cargo · lotacao · situacao · valor · tipo (1=vantagem, 2=desconto)
//    · descricao_vantagem_desconto · hora (carga horária) · sexo.
//
// 🚨🚨 A FONTE PUBLICA CPF INTEIRO ("cpf":"03055364430"). Guardamos MASCARADO, sempre —
//    ([[pnigp-folha-expoe-cpf-inteiro-e-conta-bancaria]]). O CPF mascarado é a chave de pessoa que o produto
//    usa ([[pnigp-cpf-mascarado-chave-de-pessoa]]); o inteiro é dado pessoal que não temos por que reter.
//
// Uso: node scripts/ingest_folha_pe_leg.mjs        · SO=Toritama · REFAZ=1 · ANO=2026
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { guardaCamara } from "./_folha_guarda_camara.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const ANO = Number(process.env.ANO || new Date().getFullYear());
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0)", "x-requested-with": "XMLHttpRequest" };

await q(`create table if not exists folha_servidores_pe_leg (
  cod_ibge text, municipio text, uf text, entidade text, competencia text,
  matricula text, cpf_masc text, nome text, sexo text, situacao text,
  cargo text, lotacao text, carga_horaria text,
  tipo text, rubrica text, valor numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_pe_leg_mun on folha_servidores_pe_leg (cod_ibge, competencia)`);
await q(`create table if not exists folha_pe_leg_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text,
  linhas int, pessoas int, situacao text, detalhe text, em timestamptz default now()
)`);

// 🚨 mascarar SEMPRE, no padrão que o resto do projeto usa
const mascara = (cpf) => {
  const d = String(cpf || "").replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : null;
};
const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

const alvos = (await q(`select cod_ibge, municipio, uf, coalesce(url_pessoal, url_visitada) url
   from folha_diagnostico_camara where produto ilike 'pe-leg%'
     ${SO ? "and municipio ilike '%' || $1 || '%'" : ""}
   order by municipio`, SO ? [SO] : [])).rows
  .map((a) => { let h = null; try { h = new URL(a.url).origin; } catch { /* url inválida */ } return { ...a, base: h }; })
  .filter((a) => a.base);

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_pe_leg_coleta where situacao like 'ok%'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[pe-leg] ${alvos.length} câmaras no bloco · ${fila.length} na fila · exercício ${ANO}`);

const marca = (a, situacao, detalhe, linhas = 0, pessoas = 0, comp = null) =>
  q(`insert into folha_pe_leg_coleta (cod_ibge,municipio,uf,competencia,linhas,pessoas,situacao,detalhe,em)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
       competencia=excluded.competencia, linhas=excluded.linhas, pessoas=excluded.pessoas,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [a.cod_ibge, a.municipio, a.uf, comp, linhas, pessoas, situacao, String(detalhe || "").slice(0, 200)]);

async function pega(base, ano, mes) {
  const url = `${base}/folhaClass.php?ano=${ano}&mes=${mes}&orgao=&current=1&rowCount=-1`;
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const txt = await r.text();
      if (/Fatal error|mysqli_sql_exception/i.test(txt)) return null;   // mês sem base montada
      return JSON.parse(txt);
    } catch (e) { if (t === 2) return null; await new Promise((s) => setTimeout(s, 2500 * (t + 1))); }
  }
  return null;
}

let ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  try {
    // ⭐ COMPETÊNCIA MAIS CHEIA, não a mais recente: o mês corrente costuma estar pela metade
    //    ([[pnigp-competencia-mais-cheia-nao-a-recente]]). Varre o exercício e escolhe pelo nº de pessoas.
    let melhor = null;
    for (let mes = 12; mes >= 1; mes--) {
      const j = await pega(a.base, ANO, mes);
      const linhas = j && Array.isArray(j.rows) ? j.rows : [];
      if (!linhas.length) continue;
      const pessoas = new Set(linhas.map((x) => x.matricula)).size;
      if (!melhor || pessoas > melhor.pessoas) melhor = { mes, linhas, pessoas };
    }
    if (!melhor) {
      await marca(a, "vazio", `nenhum mês de ${ANO} devolveu linha`); vazios++;
      console.log(`  · ${a.municipio}: vazio`); continue;
    }

    // 🚨 guarda de escala: portal de câmara servindo o município inteiro é o erro que fecha `ok` calado
    const g = await guardaCamara(q, a.cod_ibge, melhor.pessoas);
    if (!g.ok) {
      await marca(a, "recusado_volume", g.motivo, 0, melhor.pessoas); falhas++;
      console.log(`  ⛔ ${a.municipio}: ${g.motivo}`); continue;
    }

    const comp = `${ANO}${String(melhor.mes).padStart(2, "0")}`;
    const regs = melhor.linhas.map((x) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, entidade: "Câmara Municipal", competencia: comp,
      matricula: x.matricula ?? null, cpf_masc: mascara(x.cpf), nome: (x.nome || "").trim() || null,
      sexo: x.sexo ?? null, situacao: x.situacao ?? null, cargo: (x.cargo || "").trim() || null,
      lotacao: (x.lotacao || "").trim() || null, carga_horaria: x.hora ?? null,
      tipo: String(x.tipo ?? ""), rubrica: x.descricao_vantagem_desconto ?? null, valor: num(x.valor),
      _hash: crypto.createHash("md5")
        .update([a.cod_ibge, comp, x.matricula, x.codigo_vantagem_desconto, x.tipo, x.valor].join("¦")).digest("hex"),
    }));
    const C = (k) => regs.map((r) => r[k]);
    await q(`insert into folha_servidores_pe_leg
      (cod_ibge,municipio,uf,entidade,competencia,matricula,cpf_masc,nome,sexo,situacao,cargo,lotacao,
       carga_horaria,tipo,rubrica,valor,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::text[],$9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],
        $16::numeric[],$17::text[])
      on conflict (_hash) do update set nome=excluded.nome, cargo=excluded.cargo, lotacao=excluded.lotacao,
        situacao=excluded.situacao, valor=excluded.valor, cpf_masc=excluded.cpf_masc`,
      [C("cod_ibge"), C("municipio"), C("uf"), C("entidade"), C("competencia"), C("matricula"), C("cpf_masc"),
       C("nome"), C("sexo"), C("situacao"), C("cargo"), C("lotacao"), C("carga_horaria"), C("tipo"),
       C("rubrica"), C("valor"), C("_hash")]);
    await marca(a, "ok", `${melhor.pessoas} pessoas`, regs.length, melhor.pessoas, comp);
    ok++;
    console.log(`  ✔ [${i + 1}/${fila.length}] ${a.municipio.padEnd(24)} ${String(melhor.pessoas).padStart(4)} pessoas · ${comp}`);
  } catch (e) {
    await marca(a, "erro", e.message); falhas++;
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  }
}
const t = (await q(`select count(*)::int linhas, count(distinct cod_ibge)::int munis,
   count(distinct nome)::int pessoas from folha_servidores_pe_leg`)).rows[0];
console.log(`\n[pe-leg] ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
console.log(`[pe-leg] tabela: ${t.munis} câmaras · ${t.linhas} linhas · ${t.pessoas} pessoas`);
await db.end();
