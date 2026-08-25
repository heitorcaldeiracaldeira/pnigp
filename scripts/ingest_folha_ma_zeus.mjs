// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_ma_zeus.mjs — folha das CÂMARAS do MA no CMS "zeus-cam", rota `/tce-ma-api-folha`.
//
// ⭐ COMO A ROTA APARECEU: a página `/transparencia/folha-de-pagamento` é casca (27 KB, um <tr>) e NÃO cita
//    rota nenhuma no HTML — cita a si mesma. A rota mora num JS externo do tema:
//    `themes/zeus-cam/desktop/js/pages_statics_tce-ma-folha.min.js` → `/tce-ma-api-folha`.
//    Ler o BUNDLE quando o HTML não entrega é o mesmo caminho que revelou o menu do GovBR
//    ([[pnigp-govbr-dadosabertos-api]]). Varrida a rota nas 206 câmaras do MA: **9 respondem**.
//
//    GET {base}/tce-ma-api-folha  →  {"data":[{servidorId, exercio, tipoFolhaNome, nome, cargo, cpf,
//        mes, ano, valorBruto, valorLiquido, unidade{}, naturezaCargo{}, matricula, categoriaSituacaoCargo…}]}
//
// 🚨🚨 SEIS DAS NOVE INSTALAÇÕES SERVEM A FOLHA DE OUTRO MUNICÍPIO. Medido em 24/ago/2026:
//        cmpinheiro · cmturiacu · cmbacuri · cmmataroma  →  "CAMARA MUNICIPAL DE PENALVA"
//        cmvargemgrande                                   →  "CAMARA MUNICIPAL DE VIANA"
//        cmpalmeirandia                                   →  "CAMARA MUNICIPAL DE PACO DO LUMIAR"
//    O CMS é o mesmo e a conexão com a base do TCE-MA está apontando para o cliente errado. Coletar pelo HOST
//    gravaria a folha de Penalva em quatro municípios diferentes — 137 pessoas no lugar errado, sem erro nenhum.
//
//    ⭐ POR ISSO A GUARDA É A ENTIDADE, e ela é OBRIGATÓRIA: só grava quando `unidade.nome` casa com o
//    município do alvo. É [[pnigp-varredura-porta-exige-entidade]] e [[pnigp-audita-entidade-declarada]]
//    aplicados ANTES de gravar, em vez de depois.
//
// 🚨 O CPF já vem mascarado pela fonte (`***.973.913-**`) — guardar como veio, nunca desmascarar.
//
// Uso: node scripts/ingest_folha_ma_zeus.mjs        · SO=Penalva · REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { guardaCamara } from "./_folha_guarda_camara.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0)", "x-requested-with": "XMLHttpRequest",
             accept: "application/json, text/javascript, */*; q=0.01" };

await q(`create table if not exists folha_servidores_ma_zeus (
  cod_ibge text, municipio text, uf text, entidade text, competencia text, tipo_folha text,
  matricula text, servidor_id text, cpf_masc text, nome text, cargo text, natureza_cargo text,
  situacao_cargo text, lotacao text, valor_bruto numeric, valor_liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_ma_zeus_mun on folha_servidores_ma_zeus (cod_ibge, competencia)`);
await q(`create table if not exists folha_ma_zeus_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text, entidade_declarada text,
  linhas int, pessoas int, situacao text, detalhe text, em timestamptz default now()
)`);

const chave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\b(camara|municipal|de|do|da|dos|das)\b/g, "").replace(/[^a-z0-9]/g, "");
const MES = { janeiro: "01", fevereiro: "02", "março": "03", marco: "03", abril: "04", maio: "05", junho: "06",
              julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12" };
const compDe = (x) => (x.ano && x.mes) ? `${x.ano}${String(x.mes).padStart(2, "0")}`
  : (() => { const m = String(x.exercio || "").toLowerCase().match(/([a-zçã]+)\s+de\s+(\d{4})/);
             return m && MES[m[1]] ? `${m[2]}${MES[m[1]]}` : null; })();
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

const alvos = (await q(`select cod_ibge, municipio, uf, coalesce(url_erp_camara, url_camara, url_camara_2) url
   from folha_camara_fila where uf = 'MA' and coalesce(url_erp_camara, url_camara, url_camara_2) is not null
     ${SO ? "and municipio ilike '%' || $1 || '%'" : ""}`, SO ? [SO] : [])).rows
  .map((a) => { let o = null; try { o = new URL(a.url.startsWith("http") ? a.url : "https://" + a.url).origin; }
                catch { /* url inválida */ } return { ...a, base: o }; })
  .filter((a) => a.base);

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_ma_zeus_coleta where situacao like 'ok%'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[ma-zeus] ${alvos.length} câmaras do MA a testar · ${fila.length} na fila`);

const marca = (a, situacao, detalhe, linhas = 0, pessoas = 0, comp = null, ent = null) =>
  q(`insert into folha_ma_zeus_coleta (cod_ibge,municipio,uf,competencia,entidade_declarada,linhas,pessoas,situacao,detalhe,em)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set
       competencia=excluded.competencia, entidade_declarada=excluded.entidade_declarada,
       linhas=excluded.linhas, pessoas=excluded.pessoas, situacao=excluded.situacao,
       detalhe=excluded.detalhe, em=now()`,
    [a.cod_ibge, a.municipio, a.uf, comp, ent, linhas, pessoas, situacao, String(detalhe || "").slice(0, 200)]);

let ok = 0, semRota = 0, contaminados = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  try {
    let j = null;
    try {
      const r = await fetch(`${a.base}/tce-ma-api-folha`, { headers: UA, redirect: "follow",
        signal: AbortSignal.timeout(45000) });
      if (r.ok) { const t = await r.text(); if (t.trim().startsWith("{")) j = JSON.parse(t); }
    } catch { /* não é deste bloco */ }
    const linhas = j && Array.isArray(j.data) ? j.data : [];
    if (!linhas.length) { semRota++; continue; }   // silencioso: a maioria do MA não é deste produto

    // 🚨🚨 A GUARDA QUE DEFINE ESTE COLETOR: a entidade declarada tem de ser a do município.
    const declaradas = [...new Set(linhas.map((x) => x.unidade?.nome).filter(Boolean))];
    const bate = declaradas.some((d) => chave(d) === chave(a.municipio));
    if (!bate) {
      await marca(a, "entidade_nao_confere",
        `portal serve "${declaradas.join(", ").slice(0, 90)}"`, 0, 0, null, declaradas.join(", ").slice(0, 120));
      contaminados++;
      console.log(`  ⛔ ${a.municipio.padEnd(22)} serve "${declaradas.join(", ").slice(0, 44)}" — NÃO gravado`);
      continue;
    }
    // fica só o que é do município, mesmo quando o portal mistura
    const meus = linhas.filter((x) => chave(x.unidade?.nome) === chave(a.municipio));
    const mensais = meus.filter((x) => !/13.{0,3}sal|d[ée]cimo.{0,3}terceiro/i.test(String(x.tipoFolhaNome || "")));

    const porComp = new Map();
    for (const x of mensais) { const c = compDe(x); if (!c) continue;
                               if (!porComp.has(c)) porComp.set(c, []); porComp.get(c).push(x); }
    let melhor = null;
    for (const [c, arr] of porComp) {
      const p = new Set(arr.map((x) => x.matricula || x.servidorId || x.nome)).size;
      if (!melhor || p > melhor.pessoas) melhor = { c, arr, pessoas: p };
    }
    if (!melhor) { await marca(a, "vazio", "sem competência mensal legível"); continue; }

    const g = await guardaCamara(q, a.cod_ibge, melhor.pessoas);
    if (!g.ok) { await marca(a, "recusado_volume", g.motivo, 0, melhor.pessoas); falhas++;
                 console.log(`  ⛔ ${a.municipio}: ${g.motivo}`); continue; }

    const regs = melhor.arr.map((x) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: "MA", entidade: x.unidade?.nome || "Câmara Municipal",
      competencia: melhor.c, tipo_folha: x.tipoFolhaNome ?? null,
      matricula: x.matricula != null ? String(x.matricula) : null,
      servidor_id: x.servidorId != null ? String(x.servidorId) : null,
      cpf_masc: x.cpf ?? null, nome: (x.nome || "").trim() || null, cargo: (x.cargo || "").trim() || null,
      natureza_cargo: x.naturezaCargo?.nome ?? null, situacao_cargo: x.categoriaSituacaoCargo?.nome ?? null,
      lotacao: x.nomeUnidadeLotacao ?? null, valor_bruto: num(x.valorBruto), valor_liquido: num(x.valorLiquido),
      _hash: crypto.createHash("md5")
        .update([a.cod_ibge, melhor.c, x.servidorId, x.matricula, x.nome, x.valorBruto].join("¦")).digest("hex"),
    }));
    // 🚨 dedupe antes do insert: duplicata no lote derruba o município inteiro no ON CONFLICT
    const vistos = new Set();
    const unicos = regs.filter((r) => !vistos.has(r._hash) && vistos.add(r._hash));
    const C = (k) => unicos.map((r) => r[k]);
    await q(`insert into folha_servidores_ma_zeus
      (cod_ibge,municipio,uf,entidade,competencia,tipo_folha,matricula,servidor_id,cpf_masc,nome,cargo,
       natureza_cargo,situacao_cargo,lotacao,valor_bruto,valor_liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],
        $8::text[],$9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],
        $15::numeric[],$16::numeric[],$17::text[])
      on conflict (_hash) do update set nome=excluded.nome, cargo=excluded.cargo, lotacao=excluded.lotacao,
        valor_bruto=excluded.valor_bruto, valor_liquido=excluded.valor_liquido`,
      [C("cod_ibge"), C("municipio"), C("uf"), C("entidade"), C("competencia"), C("tipo_folha"), C("matricula"),
       C("servidor_id"), C("cpf_masc"), C("nome"), C("cargo"), C("natureza_cargo"), C("situacao_cargo"),
       C("lotacao"), C("valor_bruto"), C("valor_liquido"), C("_hash")]);
    await marca(a, "ok", `${porComp.size} competências`, unicos.length, melhor.pessoas, melhor.c, declaradas[0]);
    ok++;
    console.log(`  ✔ ${a.municipio.padEnd(22)} ${String(melhor.pessoas).padStart(4)} pessoas · ${melhor.c}`);
  } catch (e) {
    await marca(a, "erro", e.message); falhas++;
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 60)}`);
  }
}
const t = (await q(`select count(*)::int linhas, count(distinct cod_ibge)::int munis,
   count(distinct nome)::int pessoas from folha_servidores_ma_zeus`)).rows[0];
console.log(`\n[ma-zeus] ${ok} ok · ${contaminados} recusados por ENTIDADE · ${falhas} falhas · ${semRota} fora do bloco`);
console.log(`[ma-zeus] tabela: ${t.munis} câmaras · ${t.linhas} linhas · ${t.pessoas} pessoas`);
await db.end();
