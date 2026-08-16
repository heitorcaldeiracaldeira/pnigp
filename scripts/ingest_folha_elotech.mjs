// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_elotech.mjs — folha dos municípios do ERP Elotech (portal "eloweb.net"), forte no Paraná (42 mun).
//
// REST limpo em `{slug}.eloweb.net/portaltransparencia-api/api/servidores`.
// ⭐ O SEGREDO: o parâmetro `entidade` vai no HEADER HTTP, não só na query string — sem o header, HTTP 500
// "Required request header 'entidade' not present". O front manda como header; replicar isso.
//
// Entrega: nome · matricula · descricaoCargo · descricaoLotacao (secretaria) · descricaoNatureza (vínculo) ·
// situacao · dataAdmissao · remuneracao. Os 3 campos do pedido + salário, por exercício.
//
// A URL de cada município sai do Radar (`url_erp` = {slug}.eloweb.net) ou da home institucional (link do portal).
//
// 🚨 DEFEITO CORRIGIDO EM 14/ago: a resposta é um envelope Spring Data e SEM `size` vem a primeira página de 20.
// A versão anterior gravava só essa página — 117 das 189 coletas 'ok' fecharam com exatamente 20 linhas, quando
// Ministro Andreazza (RO) tem `totalElements` = 508. Perda de ~96%. Agora: size=1000 + varredura de `totalPages`,
// e recuo de exercício (2026→2025→2024) antes de declarar 'vazio'. Reprocessar com REFAZ=1.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { UFS } from "./_uf.mjs";

const db = pool();
const q = withRetry(db);
const EXERCICIO = process.env.EXERCICIO || String(new Date().getFullYear());
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1"; // reprocessa até o que já está 'ok' (necessário depois do fix de paginação)
// recuo de exercício: portal que ainda não abriu o ano corrente responde vazio — cair para o ano anterior antes de desistir
const EXERCICIOS = [EXERCICIO, String(+EXERCICIO - 1), String(+EXERCICIO - 2)];
const PAGINA = 1000;
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)", accept: "application/json" };

await q(`create table if not exists folha_servidores_elotech (
  cod_ibge text, municipio text, uf text, slug text, entidade_id text, entidade text, exercicio text,
  matricula text, nome text, cargo text, lotacao text, classe text, vinculo text,
  situacao text, data_admissao text, horas_semanais text, local_trabalho text,
  remuneracao numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_elo_mun on folha_servidores_elotech (cod_ibge, exercicio)`);
await q(`create table if not exists folha_elotech_coleta (
  slug text, entidade_id text, cod_ibge text, municipio text, uf text, exercicio text,
  linhas int, situacao text, detalhe text, em timestamptz default now(),
  primary key (slug, entidade_id)
)`);

// ⭐ O host tem DUAS gerações e a API é a MESMA: o clássico `{slug}.eloweb.net` e o novo `{slug}.oxy.elotech.com.br`
// (achado em Bento Gonçalves/RS). Mesmo caminho, mesmo header `entidade`, mesmo envelope Spring Data — só muda o
// domínio. Por isso o alvo carrega `host` e o slug vira só o rótulo.
const hostDe = (a) => (typeof a === "string" ? `${a}.eloweb.net` : (a.host || `${a.slug}.eloweb.net`));
async function api(alvo, caminho, entidade) {
  const url = `https://${hostDe(alvo)}/portaltransparencia-api/api${caminho}`;
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { headers: { ...UA, entidade: String(entidade), exercicio: EXERCICIO }, signal: AbortSignal.timeout(120000) });
      if (r.ok) return await r.json();
      if (r.status >= 500 && t < 2) { await new Promise((s) => setTimeout(s, 3000 * (t + 1))); continue; }
      return null;
    } catch { await new Promise((s) => setTimeout(s, 3000 * (t + 1))); }
  }
  return null;
}
const num = (v) => (v == null ? null : (Number.isFinite(+v) ? +v : null));

// ⚠️ A API é Spring Data paginada: SEM `size` ela devolve a PRIMEIRA PÁGINA DE 20 e o coletor antigo gravava só isso
// (117 execuções fecharam com exatamente 20 linhas; Ministro Andreazza tem totalElements=508). Pedimos size=1000 e,
// se ainda assim vier mais de uma página (portal que limita o size), varremos página a página até `last`.
async function servidores(alvo, entId, ex) {
  const url = (p) => `/servidores?entidade=${entId}&exercicio=${ex}&admissaoExcepcional=false&size=${PAGINA}&page=${p}`;
  const j0 = await api(alvo, url(0), entId);
  if (!j0) return null;
  if (Array.isArray(j0)) return j0; // portal antigo, sem envelope de página
  const out = [...(j0.content || [])];
  const paginas = j0.totalPages ?? 1;
  for (let p = 1; p < paginas; p++) {
    const j = await api(alvo, url(p), entId);
    const c = Array.isArray(j) ? j : (j?.content || []);
    if (!c.length) break;
    out.push(...c);
  }
  return out;
}

// alvos: municípios Elotech mapeados pelo Radar. o slug sai do url_erp (eloweb.net) ou do url_portal.
await q(`create table if not exists elotech_portal (
  cod_ibge text primary key, municipio text, uf text, slug text, host text, entidades int,
  achado_em timestamptz default now()
)`);
const UF = process.env.UF || null; // fechar um estado por vez sem varrer o país inteiro
const cond = [], par = [];
if (SO) { par.push(SO); cond.push(`and municipio ilike '%'||$${par.length}||'%'`); }
// 🚨 `radar_portal.uf` guarda o NOME POR EXTENSO ("Paraná"), enquanto `elotech_portal.uf` guarda a SIGLA.
// Comparar só com a sigla zera a lista do Radar em silêncio.
if (UF) { par.push(UF); par.push(UFS[UF]?.nome || UF); cond.push(`and (uf = $${par.length - 1} or uf = $${par.length})`); }
const doRadar = (await q(`select cod_ibge, municipio, uf, url_erp, url_portal from radar_portal
  where erp='elotech' and unidade_gestora ilike 'Prefeitura%' ${cond.join(" ")}`, par)).rows
  .map((a) => {
    const src = a.url_erp || a.url_portal || "";
    const m = src.match(/([a-z0-9-]+)\.eloweb\.net/i) || (a.url_portal || "").match(/https?:\/\/(?:www\.)?([a-z0-9-]+)\./i);
    return { ...a, slug: m ? m[1] : null };
  }).filter((a) => a.slug);
// … mais os portais achados pela varredura de host (geração Oxy), que o Radar não conhece
const doScan = (await q(`select cod_ibge, municipio, uf, slug, host from elotech_portal
  where true ${cond.join(" ")}`, par)).rows;
// 🚨 A varredura vem PRIMEIRO: o host dela foi PROVADO (`/entidades` respondeu). O do Radar é derivado — quando o
// município é da geração Oxy, o slug tirado do url_portal aponta para um `{slug}.eloweb.net` que não existe e a
// coleta volta 'vazio'. Deduplicar por cod_ibge (e por slug) mantendo o alvo provado.
const porSlug = new Map(), porMunicipio = new Set();
for (const a of [...doScan, ...doRadar]) {
  if (porSlug.has(a.slug) || (a.cod_ibge && porMunicipio.has(a.cod_ibge))) continue;
  porSlug.set(a.slug, a); if (a.cod_ibge) porMunicipio.add(a.cod_ibge);
}
const alvos = [...porSlug.values()];

const feitos = REFAZ ? new Set()
  : new Set((await q(`select slug||'|'||entidade_id k from folha_elotech_coleta where situacao='ok'`)).rows.map((r) => r.k));
console.log(`[elotech] ${alvos.length} municípios com slug`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map();
  for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE);
    const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_elotech
      (cod_ibge,municipio,uf,slug,entidade_id,entidade,exercicio,matricula,nome,cargo,lotacao,classe,vinculo,
       situacao,data_admissao,horas_semanais,local_trabalho,remuneracao,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::text[],$17::text[],
        $18::numeric[],$19::text[])
      on conflict (_hash) do update set remuneracao=excluded.remuneracao, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("slug"), c("entidade_id"), c("entidade"), c("exercicio"),
       c("matricula"), c("nome"), c("cargo"), c("lotacao"), c("classe"), c("vinculo"), c("situacao"),
       c("data_admissao"), c("horas_semanais"), c("local_trabalho"), c("remuneracao"), c("_hash")]);
  }
}

let total = 0, ok = 0, falhas = 0, espelhos = 0;
for (let i = 0; i < alvos.length; i++) {
  const a = alvos[i];
  // as entidades do portal (prefeitura, câmara, fundos) saem de /entidades/lista
  const ents = await api(a, "/entidades/lista?fields=id,nome,tipo", 1);
  const lista = Array.isArray(ents) ? ents : (ents?.content || [{ id: 1, nome: a.municipio }]);
  // 🚨 ENTIDADE QUE ESPELHA A PREFEITURA: em Alta Floresta D'Oeste (RO) a entidade 2 (Fundo Municipal de Saúde)
  // devolve EXATAMENTE os mesmos 1.683 servidores da entidade 1 (interseção 1683/1683), enquanto Câmara e SAAE são
  // conjuntos disjuntos. O fundo não tem folha própria — o portal repete a da prefeitura. Sem tratar isso, cada
  // servidor entraria DUAS vezes e a folha do município sairia inflada. Dedup por conteúdo dentro do slug.
  const vistosNoSlug = new Set();
  for (const ent of lista) {
    const chave = `${a.slug}|${ent.id}`;
    if (feitos.has(chave)) continue;
    const marca = (situacao, detalhe, linhas = 0, ex = EXERCICIO) =>
      q(`insert into folha_elotech_coleta (slug,entidade_id,cod_ibge,municipio,uf,exercicio,linhas,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (slug,entidade_id) do update set
         exercicio=excluded.exercicio, linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
        [a.slug, String(ent.id), a.cod_ibge, a.municipio, a.uf, ex, linhas, situacao, detalhe]);
    try {
      let arr = null, exUsado = null;
      for (const ex of EXERCICIOS) { // recuo: o ano corrente pode ainda não ter folha publicada
        const r = await servidores(a, ent.id, ex);
        if (r && r.length) { arr = r; exUsado = ex; break; }
      }
      if (!arr) { await marca("vazio", `sem servidores em ${EXERCICIOS.join("/")}`); continue; }
      const regs = arr.map((s) => ({
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, slug: a.slug, entidade_id: String(ent.id),
        entidade: ent.nome, exercicio: exUsado, matricula: String(s.matricula ?? ""), nome: s.nome,
        cargo: s.descricaoCargo, lotacao: s.descricaoLotacao, classe: s.descricaoClasse, vinculo: s.descricaoNatureza,
        situacao: s.situacao, data_admissao: s.dataAdmissao, horas_semanais: String(s.horasSemanais ?? ""),
        local_trabalho: s.localTrabalho, remuneracao: num(s.remuneracao),
        // o hash NÃO leva a entidade: o mesmo servidor devolvido por prefeitura e por fundo é UMA pessoa só
        _hash: crypto.createHash("md5").update([a.slug, exUsado, s.matricula, s.nome, s.descricaoCargo].join("¦")).digest("hex"),
      }));
      const ineditos = regs.filter((r) => !vistosNoSlug.has(r._hash));
      if (!ineditos.length) { // entidade que apenas espelha outra já coletada neste município
        espelhos++;
        await marca("espelho", `${regs.length} servidores idênticos a outra entidade do portal`, 0, exUsado);
        console.log(`  ${a.uf} ${a.municipio} / ${ent.nome?.slice(0, 30)}: espelho (${regs.length})`);
        continue;
      }
      for (const r of ineditos) vistosNoSlug.add(r._hash);
      await grava(ineditos);
      total += ineditos.length; ok++;
      await marca("ok", null, ineditos.length, exUsado);
      console.log(`  ${a.uf} ${a.municipio} / ${ent.nome?.slice(0, 30)}: ${ineditos.length}${ineditos.length !== regs.length ? ` (de ${regs.length}, resto espelhado)` : ""}${exUsado !== EXERCICIO ? ` [${exUsado}]` : ""}`);
    } catch (e) { falhas++; await marca("erro", String(e.message).slice(0, 150)); }
  }
}
console.log(`\n[elotech] ${total.toLocaleString("pt-BR")} servidores · ${ok} entidades ok · ${espelhos} espelhos · ${falhas} falhas`);
await db.end();
