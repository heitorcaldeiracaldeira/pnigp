// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_govbr_dadosabertos.mjs — a folha do PRONIM/Cidade360 (Governança Brasil) por API ABERTA.
//
// ⭐⭐ ACHADO EM 22/ago/2026 — E MUDA O COLETOR DO GOVBR DE FIGURA. Até hoje a folha do GovBR só entrava por XML
// que o Heitor baixava À MÃO, porque o botão "Exportar XML" tem reCAPTCHA ([[pnigp-govbr-pronim-transparencia]]).
// O portal tem, ao lado, um módulo de DADOS ABERTOS com **API REST documentada em Swagger** — sem captcha, sem
// login, sem token:
//     GET {host}/dadosabertos/swagger/v1/swagger.json                          → o contrato
//     GET {host}/dadosabertos/dbdestino/buscarEntidadesAreaGestaoPessoas/{ano} → ["CAMARA MUNICIPAL DE …"]
//     GET {host}/dadosabertos/folhapagamento/baixarFolhaPagamento/{ano}/{ENTIDADE}
//
// O JSON traz por servidor: Matricula · **CPF mascarado** · Competencia · NomeServidor · Cargo · **Lotacao** ·
// SalarioBase · Proventos · Vantagens · VencimentosTotais · Descontos · Liquido — mês a mês do exercício inteiro.
//
// ⚠️ O caminho do menu (`index.asp?acao=10&item=8`) NÃO serve: a SPA monta a grade em memória e o export é que
//    tem captcha. Foi preciso ler `st_menus` no navegador para achar as rotas e, delas, o iframe de dados
//    abertos. A porta certa estava ao lado da porta trancada ([[pnigp-captcha-rota-alternativa-tc]]).
//
// ⭐ O PODER sai do NOME DA ENTIDADE ("CAMARA MUNICIPAL DE X" → legislativo), que a própria API declara — nada de
//    inferir pelo host ([[pnigp-guarda-poder-volume-rais]] cuida do resto).
//
// Uso: node scripts/ingest_folha_govbr_dadosabertos.mjs        · ANO=2026 · SO=Montes · PODER=legislativo
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";
import { guardaCamara } from "./_folha_guarda_camara.mjs";

const db = pool();
const q = withRetry(db);
const ANO = process.env.ANO || "2026";
const SO = process.env.SO || null;
const PODER = (process.env.PODER || "").toLowerCase();     // vazio = colhe os dois poderes
const CONC = Number(process.env.CONC || 3);
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
             accept: "application/json", "content-type": "application/json" };

await q(`create table if not exists folha_servidores_govbrda (
  cod_ibge text, municipio text, uf text, poder text, entidade text, competencia text,
  matricula text, cpf_masc text, nome text, cargo text, lotacao text,
  salario_base numeric, proventos numeric, vantagens numeric, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_govbrda_mun on folha_servidores_govbrda (cod_ibge, competencia)`);
await q(`create table if not exists folha_govbrda_coleta (
  cod_ibge text, poder text, municipio text, uf text, host text, entidade text, exercicio text, linhas int,
  situacao text, detalhe text, em timestamptz default now(), primary key (cod_ibge, poder))`);

const num = (v) => (v == null || v === "" ? null : (Number.isFinite(+v) ? +v : null));
// a competência vem "01/2026" → AAAAMM
const comp = (s) => { const m = String(s || "").match(/^(\d{2})\/(\d{4})$/); return m ? `${m[2]}${m[1]}` : null; };

async function pega(url, tentativas = 3) {
  for (let t = 0; t < tentativas; t++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(180000) });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await new Promise((s) => setTimeout(s, 2500 * (t + 1)));
  }
  return null;
}

// ── alvos: todo portal GovBR conhecido (câmara pela fila, prefeitura pelo radar) ────────────────────────────────
const alvos = [];
for (const r of (await q(`select cod_ibge, municipio, uf, coalesce(url_erp_camara, url_camara) url, 'legislativo' poder
    from folha_camara_fila where coalesce(erp_camara,'') = 'govbr' and coalesce(url_erp_camara, url_camara) is not null
   union all
   select cod_ibge, municipio, uf, coalesce(url_erp, url_portal) url, 'executivo' poder
     from radar_portal where erp = 'govbr' and unidade_gestora ilike 'Prefeitura%'
       and coalesce(url_erp, url_portal) is not null
   union all
   -- ⭐⭐ 23/ago/2026, a pedido do Heitor (*"muitas estão vindo juntas e não vamos perder o trabalho"*):
   --    a CAMARA mora no MESMO host da prefeitura. A rota buscarEntidadesAreaGestaoPessoas devolve todas as
   --    entidades do host, a câmara entre elas — pedir só quando ela tem portal PRÓPRIO deixava 167 municípios
   --    (4.167 vínculos da RAIS do legislativo) do lado de fora, com o dado a um GET de distância.
   --    É [[pnigp-catalogo-ja-tinha-a-camara]] no host em vez de no catálogo.
   select cod_ibge, municipio, uf, coalesce(url_erp, url_portal) url, 'legislativo' poder
     from radar_portal where erp = 'govbr' and unidade_gestora ilike 'Prefeitura%'
       and coalesce(url_erp, url_portal) is not null`)).rows) {
  if (PODER && r.poder !== PODER) continue;
  if (SO && !new RegExp(SO, "i").test(r.municipio || "")) continue;
  let host = null; try { host = new URL(r.url.startsWith("http") ? r.url : "https://" + r.url).origin; } catch { /* url inválida */ }
  if (host) alvos.push({ ...r, host });
}
// 🚨 o mesmo município pode entrar duas vezes como legislativo (portal próprio + host da prefeitura).
//    Fica UM alvo por município×poder, preferindo o portal próprio da câmara, que é o mais específico.
const unico = new Map();
for (const a of alvos) { const k = `${a.cod_ibge}|${a.poder}`; if (!unico.has(k)) unico.set(k, a); }
alvos.length = 0; alvos.push(...unico.values());

const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge || '|' || poder k from folha_govbrda_coleta where situacao='ok'`)).rows.map((r) => r.k));
const fila = alvos.filter((a) => !feitos.has(`${a.cod_ibge}|${a.poder}`));
console.log(`[govbr-da] ${alvos.length} portais GovBR · ${fila.length} na fila · exercício ${ANO}`);

let total = 0, ok = 0, semApi = 0, vazio = 0;
for (let i = 0; i < fila.length; i += CONC) {
  await Promise.all(fila.slice(i, i + CONC).map(async (a) => {
    const marca = (situacao, detalhe, entidade = null, linhas = 0) =>
      q(`insert into folha_govbrda_coleta (cod_ibge,poder,municipio,uf,host,entidade,exercicio,linhas,situacao,detalhe,em)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         on conflict (cod_ibge,poder) do update set host=excluded.host, entidade=excluded.entidade,
           exercicio=excluded.exercicio, linhas=excluded.linhas, situacao=excluded.situacao,
           detalhe=excluded.detalhe, em=now()`,
        [a.cod_ibge, a.poder, a.municipio, a.uf, a.host, entidade, ANO, linhas, situacao, detalhe]);

    // 🚨 O HOST DA FILA COSTUMA SER O SITE, NÃO O PORTAL. Montes Claros está em `www.montesclaros.mg.leg.br` e o
    //    PRONIM mora em `transparenciacm.montesclaros.mg.gov.br/pronimtb/` — pedir a API no host errado devolve
    //    "sem dados abertos" num município que publica tudo. O salto é o mesmo que o navegador faz: ler a página
    //    e seguir o link do pronimtb ([[pnigp-iframe-casca-embute-o-erp]]).
    let base = a.host;
    let ents = await pega(`${base}/dadosabertos/dbdestino/buscarEntidadesAreaGestaoPessoas/${ANO}`);
    if (!Array.isArray(ents) || !ents.length) {
      try {
        const r = await fetch(a.url.startsWith("http") ? a.url : "https://" + a.url,
          { headers: { ...UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(60000) });
        const html = r.ok ? await r.text() : "";
        // 🚨 PEGAR O PRIMEIRO LINK QUE CASA É ERRADO: a página cita vários hosts do fornecedor e o primeiro
        //    costuma ser institucional (`mariopolis.govbr.cloud`), enquanto o portal está em
        //    `webapp1-mariopolis.cidade360.cloud/pronimtb_cm/`. Coleta-se TODOS os candidatos, com o que tem
        //    `pronimtb` na frente, e testa-se um a um até a API responder — 131 câmaras foram dadas como "sem
        //    dados abertos" por causa dessa escolha apressada.
        const cands = [...new Set([...html.matchAll(/https?:\/\/[^"'\s]*(?:pronimtb|cidade360|govbr\.cloud|dadosabertos)[^"'\s]*/gi)]
          .map((m) => { try { return new URL(m[0]).origin; } catch { return null; } }).filter(Boolean))]
          .sort((x, y) => (/pronim|cidade360/i.test(y) ? 1 : 0) - (/pronim|cidade360/i.test(x) ? 1 : 0));
        for (const cand of cands.slice(0, 4)) {
          const tent = await pega(`${cand}/dadosabertos/dbdestino/buscarEntidadesAreaGestaoPessoas/${ANO}`, 2);
          if (Array.isArray(tent) && tent.length) { base = cand; ents = tent; break; }
        }
      } catch { /* segue com o veredito abaixo */ }
    }
    if (!Array.isArray(ents) || !ents.length) { await marca("sem_api", `sem módulo de dados abertos em ${base}`); semApi++; return; }
    a.host = base;
    // ⭐ o poder sai do NOME que a própria API declara
    const querCamara = a.poder === "legislativo";
    const alvoEnt = ents.find((e) => querCamara === /c[âa]mara|legislativ/i.test(String(e))) || (querCamara ? null : ents[0]);
    if (!alvoEnt) { await marca("sem_entidade", `nenhuma entidade ${a.poder} em ${ents.length}: ${ents.join(" | ").slice(0, 80)}`); vazio++; return; }

    const dados = await pega(`${a.host}/dadosabertos/folhapagamento/baixarFolhaPagamento/${ANO}/${encodeURIComponent(alvoEnt)}`);
    if (!Array.isArray(dados) || !dados.length) { await marca("vazio", `API respondeu sem linhas para ${alvoEnt}`, alvoEnt); vazio++; return; }

    const regs = dados.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, poder: a.poder, entidade: String(alvoEnt),
      competencia: comp(s.Competencia), matricula: s.Matricula ?? null, cpf_masc: s.CPF ?? null,
      nome: (s.NomeServidor || "").trim() || null, cargo: (s.Cargo || "").trim() || null,
      lotacao: (s.Lotacao || "").trim() || null,
      salario_base: num(s.SalarioBase), proventos: num(s.Proventos), vantagens: num(s.Vantagens),
      bruto: num(s.VencimentosTotais), descontos: num(s.Descontos), liquido: num(s.Liquido),
      _hash: crypto.createHash("md5").update([a.cod_ibge, a.poder, comp(s.Competencia), s.Matricula, s.NomeServidor].join("¦")).digest("hex"),
    })).filter((r) => r.nome && r.competencia);
    if (!regs.length) { await marca("vazio", "linhas sem nome ou sem competência", alvoEnt); vazio++; return; }

    if (a.poder === "legislativo") {
      const pessoas = new Set(regs.map((r) => r.nome)).size;
      const g = await guardaCamara(q, a.cod_ibge, pessoas);
      if (!g.ok) { await marca("recusado_volume", g.motivo, alvoEnt); console.log(`  ⛔ ${a.municipio}: ${g.motivo}`); return; }
    }

    const dedup = [...new Map(regs.map((r) => [r._hash, r])).values()];
    for (let k = 0; k < dedup.length; k += 1000) {
      const p2 = dedup.slice(k, k + 1000); const c = (f) => p2.map((x) => x[f]);
      await q(`insert into folha_servidores_govbrda
        (cod_ibge,municipio,uf,poder,entidade,competencia,matricula,cpf_masc,nome,cargo,lotacao,
         salario_base,proventos,vantagens,bruto,descontos,liquido,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::text[],$12::numeric[],$13::numeric[],$14::numeric[],$15::numeric[],
          $16::numeric[],$17::numeric[],$18::text[])
        on conflict (_hash) do update set bruto=coalesce(excluded.bruto, folha_servidores_govbrda.bruto),
          liquido=coalesce(excluded.liquido, folha_servidores_govbrda.liquido),
          lotacao=coalesce(excluded.lotacao, folha_servidores_govbrda.lotacao), _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("poder"), c("entidade"), c("competencia"), c("matricula"),
         c("cpf_masc"), c("nome"), c("cargo"), c("lotacao"), c("salario_base"), c("proventos"), c("vantagens"),
         c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
    }
    await marca("ok", `${new Set(dedup.map((r) => r.competencia)).size} competências`, String(alvoEnt), dedup.length);
    total += dedup.length; ok++;
    console.log(`  ✔ ${a.uf} ${a.municipio} (${a.poder}): ${dedup.length} linhas · ${new Set(dedup.map((r) => r.nome)).size} pessoas`);
  }));
}
console.log(`\n[govbr-da] ${total.toLocaleString("pt-BR")} linhas · ${ok} entidades ok · ${semApi} sem API de dados abertos · ${vazio} vazias`);
await db.end();
