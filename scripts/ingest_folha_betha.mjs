// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_betha.mjs — folha nominal dos municípios que usam o portal Betha (490 municípios, 15 UFs).
//
// ⭐ POR QUE ESTA FONTE É A MELHOR das que achei: entrega os três campos que o Heitor priorizou JUNTOS e com a
// SECRETARIA DECLARADA pela própria fonte — `orgao` ("Secretaria Municipal de Educação - SEMED") e `organograma`
// ("Gerência de Ensino Fundamental") — enquanto no Farol do TCE-SC a secretaria precisa ser derivada por
// dicionário. E a competência é a do mês corrente, não uma remessa de meses atrás.
//
// A CADEIA (três chamadas, todas com token anônimo — ver _betha.mjs):
//   1. /auth/portais            → os 1.271 portais com `hash`  (já em betha_portal)
//   2. /api/menu                → as consultas DAQUELE portal; o id da consulta MUDA de município para município,
//                                 então nunca fixar 8768 (que é o de Jaraguá) — achar pelo nome
//   3. POST /api/busca-textual/{id}?offset=&limit=  body {competencia:[...]} → os servidores
// O portal é escolhido pelo header `app-context` = base64 de {"portal":"<hash>"} — é isso que troca de município.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { API, pegaToken } from "./_betha.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || null;          // limita a uma UF
const SO = process.env.SO || null;          // limita a um município
// SC já vem do Farol do TCE-SC com série mensal — aqui o ganho são as outras UFs. Excluída por padrão.
const EXCLUI_UF = (process.env.EXCLUI_UF ?? "SC").split(",").map((s) => s.trim()).filter(Boolean);
const COMPETENCIAS = Number(process.env.COMPETENCIAS || 1); // quantas competências recentes trazer
const LIMITE = 500;                          // linhas por página na busca

await q(`create table if not exists folha_servidores_betha (
  cod_ibge      text,
  municipio     text,
  uf            text,
  entidade      text,          -- prefeitura, fundo, autarquia, câmara
  competencia   text,
  nome          text,
  cargo         text,
  classificacao_cargo text,
  nivel_salarial text,
  vinculo       text,          -- efetivo, comissionado, temporário… (a "função")
  secretaria    text,          -- campo "orgao" da fonte, já declarado (não derivado)
  organograma   text,          -- o nível abaixo: gerência/diretoria/unidade
  matricula     text,
  efetivo_em_comissao text,
  bruto         numeric,
  liquido       numeric,
  _hash         text primary key,
  _coletado_em  timestamptz default now()
)`);
await q(`create index if not exists ix_betha_folha_mun on folha_servidores_betha (cod_ibge, competencia)`);
await q(`create index if not exists ix_betha_folha_sec on folha_servidores_betha (uf, secretaria)`);
await q(`create table if not exists folha_betha_coleta (
  portal_id int primary key, cod_ibge text, municipio text, uf text,
  consulta_id int, competencia text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const ctxDe = (hash) => Buffer.from(JSON.stringify({ portal: hash })).toString("base64");

async function chama(caminho, hash, { metodo = "GET", corpo = null, tentativas = 4 } = {}) {
  let ultimo;
  for (let t = 0; t < tentativas; t++) {
    try {
      const tk = await pegaToken(t > 0);
      const r = await fetch(API + caminho, {
        method: metodo,
        headers: {
          Authorization: "Bearer " + tk, "app-context": ctxDe(hash), accept: "application/json",
          ...(corpo ? { "content-type": "application/json;charset=UTF-8" } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(180000),
      });
      if (r.status === 401 || r.status === 403) { await pegaToken(true); ultimo = "401"; continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { ultimo = e.message; if (t === tentativas - 1) throw new Error(ultimo); await new Promise((s) => setTimeout(s, 2500 * (t + 1))); }
  }
}

// Acha a consulta de folha no menu do portal. O rótulo é padrão do produto, mas o id MUDA por portal.
// ⚠️ O campo do rótulo é `titulo` — não `nome` (esse é o do menu, e vem undefined na consulta). Procurar por
// `nome` devolveu "sem consulta de folha" em 100% dos portais do Acre, o que parecia limite da fonte e era bug meu.
// O título varia no singular/plural entre portais ("Servidores e Remuneração" × "Servidores e Remunerações").
function achaConsulta(menu) {
  const alvo = [];
  const anda = (nos) => {
    for (const n of nos || []) {
      for (const c of n.consultas || []) alvo.push({ ...c, menu: n.nome });
      anda(n.subMenus);
    }
  };
  anda(menu);
  const rotulo = (c) => String(c.titulo || c.nome || "");
  const por = (re) => alvo.find((c) => re.test(rotulo(c)));
  return por(/servidores?\s+e\s+remunera/i) || por(/remunera/i) ||
         por(/servidores?\s+p[úu]blicos?\s+ativos/i) || por(/servidores?\s+p[úu]blicos?/i);
}

const cond = ["cod_ibge is not null"];
const par = [];
if (UF) { par.push(UF); cond.push(`uf = $${par.length}`); }
if (SO) { par.push(SO); cond.push(`municipio ilike '%' || $${par.length} || '%'`); }
if (EXCLUI_UF.length && !UF) { par.push(EXCLUI_UF); cond.push(`uf <> all($${par.length}::text[])`); }
const alvos = (await q(`select id, hash, cod_ibge, municipio, uf from betha_portal
  where ${cond.join(" and ")} order by uf, municipio`, par)).rows;

const feitos = new Set((await q(`select portal_id from folha_betha_coleta where situacao='ok'`)).rows.map((r) => r.portal_id));
const fila = alvos.filter((a) => !feitos.has(a.id));
console.log(`[betha] ${alvos.length} portais alvo · ${feitos.size} já feitos · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(todos) {
  // O mesmo `_hash` pode vir duas vezes na mesma página (o id da fonte repete quando o servidor aparece em mais
  // de uma linha da consulta). Com duplicata no lote, o Postgres recusa: "ON CONFLICT DO UPDATE command cannot
  // affect row a second time". Deduplicar ANTES de mandar, ficando com a última ocorrência.
  const porHash = new Map();
  for (const r of todos) porHash.set(r._hash, r);
  const regs = [...porHash.values()];
  for (let i = 0; i < regs.length; i += LOTE) {
    const p = regs.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_betha
      (cod_ibge,municipio,uf,entidade,competencia,nome,cargo,classificacao_cargo,nivel_salarial,vinculo,
       secretaria,organograma,matricula,efetivo_em_comissao,bruto,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],$17::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("nome"), c("cargo"),
       c("classificacao_cargo"), c("nivel_salarial"), c("vinculo"), c("secretaria"), c("organograma"),
       c("matricula"), c("efetivo_em_comissao"), c("bruto"), c("liquido"), c("_hash")]);
  }
}

let totalGeral = 0, ok = 0, falhas = 0, semConsulta = 0;
for (let i = 0; i < fila.length; i++) {
  const p = fila[i];
  const marca = (situacao, detalhe, consultaId = null, competencia = null, linhas = 0) =>
    q(`insert into folha_betha_coleta (portal_id,cod_ibge,municipio,uf,consulta_id,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       on conflict (portal_id) do update set consulta_id=excluded.consulta_id, competencia=excluded.competencia,
         linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [p.id, p.cod_ibge, p.municipio, p.uf, consultaId, competencia, linhas, situacao, detalhe]);

  try {
    const menu = await chama("/api/menu", p.hash);
    const consulta = achaConsulta(menu);
    if (!consulta) { semConsulta++; await marca("sem_consulta", "menu sem consulta de remuneração"); continue; }

    // Competências disponíveis, da mais recente para trás.
    // ⚠️ O filtro volta como {buckets:[{id:"07/2026"}]} — não é array nem `content`. E a competência é
    // OBRIGATÓRIA: POST com corpo vazio devolve HTTP 500 "Ocorreu um erro interno", que parece indisponibilidade
    // da fonte e é só filtro faltando. Sem competência não se pede nada.
    const f = await chama(`/api/busca-textual/${consulta.id}/filtro/competencia/MAX`, p.hash);
    const comps = (f?.buckets || []).map((b) => b.id || b.description).filter(Boolean)
      .sort((a, b) => {
        const [ma, aa] = String(a).split("/"), [mb, ab] = String(b).split("/");
        return (ab - aa) || (mb - ma);
      }).slice(0, COMPETENCIAS);
    if (!comps.length) { semConsulta++; await marca("sem_competencia", "filtro de competência vazio", consulta.id); continue; }

    const corpo = { competencia: comps };
    let offset = 0, total = null, linhas = 0;
    const regs = [];
    do {
      // ⚠️ `sortBy=null&sortDirection=null` são OBRIGATÓRIOS na query string — literalmente a palavra "null".
      // Sem eles o backend devolve HTTP 500 "Ocorreu um erro interno", que parece portal fora do ar e é só a
      // requisição incompleta. Jaraguá funcionou na primeira tentativa porque copiei a chamada inteira do app;
      // ao "limpar" a query string, 100% dos outros portais passaram a falhar.
      const j = await chama(`/api/busca-textual/${consulta.id}?sortBy=null&sortDirection=null&offset=${offset}&limit=${LIMITE}&hiperlink=false`,
        p.hash, { metodo: "POST", corpo });
      total = j.totalHits ?? 0;
      for (const h of j.hits || []) {
        const s = h.sourceAsMap || {};
        regs.push({
          cod_ibge: p.cod_ibge, municipio: p.municipio, uf: p.uf, entidade: s.nomeEntidade ?? p.nome,
          // ⚠️ O conjunto de campos MUDA de portal para portal: uns devolvem `competencia`, `matriculaServidor`
          // e `nomeEntidade`, outros não. A competência a gente SEMPRE sabe — é a que foi pedida no filtro —
          // então nunca deixar nula por causa do payload (só 7% dos portais devolvem o campo).
          competencia: s.competencia ?? comps[0].split("/").reverse().join("-"),
          nome: s.nomeServidor, cargo: s.cargoAtual,
          classificacao_cargo: s.classificacaoCargoAtual, nivel_salarial: s.nivelSalarialAtual,
          vinculo: s.vinculoEmpregaticio, secretaria: s.orgao, organograma: s.organograma,
          matricula: s.matriculaServidor, efetivo_em_comissao: s.efetivoEmCargoComissionado,
          bruto: s.valorRemuneracaoBruta ?? null, liquido: s.valorRemuneracaoLiquida ?? null,
          _hash: crypto.createHash("md5").update(String(h.id ?? [p.cod_ibge, s.competencia, s.nomeServidor, s.matriculaServidor, s.cargoAtual].join("¦"))).digest("hex"),
        });
      }
      linhas += (j.hits || []).length;
      offset += LIMITE;
      if (!j.hits?.length) break;
    } while (offset < total);

    await grava(regs);
    totalGeral += regs.length; ok++;
    await marca("ok", null, consulta.id, comps[0] || null, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${p.uf} ${p.municipio}: ${regs.length} servidores (${comps[0] || "sem filtro"})`);
  } catch (e) {
    falhas++;
    await marca("erro", String(e.message).slice(0, 200));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${p.uf} ${p.municipio}: ${String(e.message).slice(0, 90)}`);
  }
}

console.log(`\n[betha] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} portais ok · ${semConsulta} sem consulta de folha · ${falhas} com erro`);
await db.end();
