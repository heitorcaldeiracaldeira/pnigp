// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_equiplano.mjs — folha nominal COM SALÁRIO E LOTAÇÃO dos municípios EQUIPLANO (71 mapeados, PR).
//
// ⭐ TUDO POR HTTP PURO (sem navegador). A cadeia:
//   1. POST {base}/srhRelacaoDeServidoresSalariosDetalhado/listEntidades  body: formulario.codEntidade=<ent>
//   2. GET  .../listMes?formulario.codEntidade=<ent>&formulario.exercicio=<ano>      → meses com folha
//   3. GET  .../listServidores?...&formulario.mes=JUNHO                              → HTML: cabeçalho + total
//   4. POST .../srhRelacaoDeServidoresSalariosDetalhadoAjax  (DataTables: draw/start/length)  → JSON paginado
//
// 🚨 QUATRO ARMADILHAS:
//   1. `url_erp` do Radar ("cafelandiapr.equiplano") é IDENTIFICADOR, não host: `.equiplano.com.br` não resolve.
//      O portal real é {slug}.equiplano.com.br:PORTA/transparencia e a PORTA MUDA por município (7057, 7129,
//      7029, 7350…) — descoberta pelo site institucional.
//   2. Certificado inválido nessas portas altas: o Node responde `fetch failed` genérico, que parece host morto.
//      É preciso um agente que aceite o certificado.
//   3. A URL do Ajax é RELATIVA à página: resolve para /{controller}/{controller}Ajax — pedir /{controller}Ajax dá 404.
//   4. As COLUNAS MUDAM por município (cada um tem seus descontos: ASMUCA, SISMUCAF…). O mapeamento sai do
//      cabeçalho do HTML, nunca de posição fixa. No HTML a lotação vem TRUNCADA ("FUNDO MUNICIPAL DE DESENV...");
//      no JSON vem inteira — mais um motivo para ler o JSON.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import https from "https";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";

// 🚨 CORRIGIDO 15/ago: `agent: new https.Agent({rejectUnauthorized:false})` NÃO tem efeito no fetch global do Node —
// quem manda é o undici, que ignora `agent` e só entende `dispatcher`. Por isso portais em porta alta com
// certificado que não bate com o host voltavam `fetch failed` (Santo Inácio) e pareciam host morto.
setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false }, connectTimeout: 30000 }));

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const DESCOBRIR = process.env.DESCOBRIR === "1";
// 🚨 CORRIGIDO 15/ago/2026: NÃO existe UM controlador de folha no Equiplano. O `…SalariosDetalhado` é o mais rico,
// mas em parte das instalações ele está VAZIO (combo de entidades responde, `listEntidades` volta sem exercício) e
// quem tem os dados é o `…Salarios` simples — Candói, Imbituva, Verê, Porto Barreiro e mais 8 do PR fechavam
// 'vazio' por isso, com cara de "município não publica". Tentar em ordem, do mais rico para o mais simples.
const CONTROLADORES = (process.env.CONTROLADOR ? [process.env.CONTROLADOR] : [
  "srhRelacaoDeServidoresSalariosDetalhado",
  "srhRelacaoDeServidoresSalarios",
  "srhRelacaoDeSalarios",
]);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
// portais em porta alta usam certificado que não bate com o host — sem isso o fetch morre com erro genérico
const agente = new https.Agent({ rejectUnauthorized: false });

await q(`create table if not exists equiplano_portal (
  cod_ibge text primary key, municipio text, uf text, base_url text, detalhe text, em timestamptz default now()
)`);
await q(`create table if not exists folha_servidores_equiplano (
  cod_ibge text, municipio text, uf text, base_url text, entidade text, entidade_nome text, competencia text,
  matricula text, nome text, cargo text, funcao_confianca text, lotacao text, secretaria text, situacao text,
  vantagens numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_equi_mun on folha_servidores_equiplano (cod_ibge, competencia)`);
await q(`create table if not exists folha_equiplano_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text, linhas int, situacao text, detalhe text,
  em timestamptz default now()
)`);

const money = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = +t; return Number.isFinite(n) ? n : null;
};
const pega = async (url, opts = {}) => {
  const r = await fetch(url, { headers: { ...UA, ...(opts.headers || {}) }, dispatcher: undefined, agent: agente, ...opts, signal: AbortSignal.timeout(opts.timeout || 120000) });
  return { st: r.status, txt: new TextDecoder("utf-8").decode(await r.arrayBuffer()) };
};

// ── FASE 1: descobrir base_url (host:porta) pelo site institucional ─────────────────────────────────────────────
if (DESCOBRIR) {
  const alvos = (await q(`select distinct on (cod_ibge) cod_ibge, municipio, uf, url_portal from radar_portal
    where erp='equiplano' and url_portal is not null ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by cod_ibge`,
    SO ? [SO] : [])).rows;
  console.log(`[equiplano/descoberta] ${alvos.length} municípios`);
  let achou = 0;
  for (const a of alvos) {
    let base = null;
    try {
      const { txt } = await pega(a.url_portal, { timeout: 45000 });
      const m = txt.match(/https?:\/\/[a-z0-9.-]*equiplano\.com\.br:\d+\/transparencia/i)
        || txt.match(/https?:\/\/[a-z0-9.-]*equiplano\.cloud[^"'<>\s]*/i);
      base = m ? m[0].replace(/\/+$/, "") : null;
    } catch { /* site fora */ }
    await q(`insert into equiplano_portal (cod_ibge,municipio,uf,base_url,detalhe,em) values ($1,$2,$3,$4,$5,now())
      on conflict (cod_ibge) do update set base_url=coalesce(excluded.base_url, equiplano_portal.base_url),
      detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, base, base ? null : "portal equiplano não citado no site institucional"]);
    if (base) achou++;
    console.log(`  ${a.uf} ${String(a.municipio).padEnd(26)} ${base || "?"}`);
  }
  console.log(`[equiplano/descoberta] ${achou}/${alvos.length} com portal`);
  await db.end(); process.exit(0);
}

// ── FASE 2: coleta ──────────────────────────────────────────────────────────────────────────────────────────────
// 🚨 CORRIGIDO 15/ago: o filtro `base_url like '%transparencia%'` DESCARTAVA EM SILÊNCIO 20 municípios do PR cujo
// site institucional citava outro módulo do mesmo servidor (`/contribuinte`, `/esportal`, `/faq`). O portal da
// transparência mora na MESMA origem — provado em 8 municípios: trocar o caminho por `/transparencia` devolve o
// combo de entidades. Então normalizamos a origem em vez de exigir a palavra na URL.
const soTransparencia = (u) => {
  if (!u) return null;
  const s = String(u).trim();
  if (!/^https?:\/\//i.test(s)) return null;      // "imbituvapr.equiplano" é IDENTIFICADOR do Radar, não host
  try { const x = new URL(s); return `${x.protocol}//${x.host}/transparencia`; } catch { return null; }
};
const brutos = (await q(`select cod_ibge, municipio, uf, base_url from equiplano_portal
  where base_url is not null
  ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by uf, municipio`, SO ? [SO] : [])).rows;
const alvos = [], semHost = [], spa = [];
for (const a of brutos) {
  const b = soTransparencia(a.base_url);
  if (!b) { semHost.push(a); continue; }
  if (/equiplano\.cloud/i.test(b)) { spa.push(a); continue; } // geração nova é SPA Angular — outra engenharia
  alvos.push({ ...a, base_url: b });
}
if (semHost.length) console.log(`[equiplano] ⚠️ ${semHost.length} sem host resolvível (identificador do Radar, falta descobrir a porta): ${semHost.slice(0, 8).map((x) => x.municipio).join(", ")}${semHost.length > 8 ? "…" : ""}`);
if (spa.length) console.log(`[equiplano] ⚠️ ${spa.length} na geração equiplano.cloud (SPA Angular, API a mapear): ${spa.map((x) => x.municipio).join(", ")}`);
const feitos = process.env.REFAZ === "1" ? new Set()
  : new Set((await q(`select cod_ibge from folha_equiplano_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[equiplano] ${alvos.length} portais · ${fila.length} na fila`);

const MESES = { JANEIRO: "01", "FEVEREIRO": "02", "MARÇO": "03", MARCO: "03", ABRIL: "04", MAIO: "05", JUNHO: "06",
  JULHO: "07", AGOSTO: "08", SETEMBRO: "09", OUTUBRO: "10", NOVEMBRO: "11", DEZEMBRO: "12" };

let totalGeral = 0, ok = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const B = a.base_url.replace(/\/+$/, "");
  const marca = (situacao, detalhe, competencia = null, linhas = 0) =>
    q(`insert into folha_equiplano_coleta (cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set competencia=excluded.competencia,
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, competencia, linhas, situacao, detalhe]);
  try {
    const regs = [];
    let compUsada = null, usado = null, ents = [];
    for (const R of CONTROLADORES) {
    if (regs.length) break;
    usado = R;
    // entidades do combo (Município, Câmara, Fundos…)
    const { txt: home } = await pega(`${B}/${R}`);
    ents = [...home.matchAll(/<option[^>]*value=["']?(\d+)["']?[^>]*>([^<]{2,60})/gi)]
      .map((m) => ({ cod: m[1], nome: m[2].trim() }));
    if (!ents.length) continue;

    for (const ent of ents) {
      // exercícios disponíveis
      const { txt: tEnt } = await pega(`${B}/${R}/listEntidades`, {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `formulario.codEntidade=${ent.cod}&formulario.nomeServidor=`,
      });
      const exercicios = [...new Set([...tEnt.matchAll(/formulario\.exercicio=(\d{4})/g)].map((m) => m[1]))]
        .sort((x, y) => y - x).slice(0, 2);
      for (const ex of exercicios) {
        const { txt: tMes } = await pega(`${B}/${R}/listMes?formulario.codEntidade=${ent.cod}&formulario.exercicio=${ex}`);
        const meses = [...new Set([...tMes.matchAll(/formulario\.mes=([A-ZÇÃa-zçã]+)/g)].map((m) => m[1].toUpperCase()))];
        if (!meses.length) continue;
        // mês mais recente com folha: a lista vem em ordem do calendário, o último é o mais novo
        const mes = meses[meses.length - 1];
        const qs = `formulario.codEntidade=${ent.cod}&formulario.exercicio=${ex}&formulario.mes=${encodeURIComponent(mes)}`;
        // o HTML dá o CABEÇALHO — as colunas mudam de município para município
        const { txt: tLista } = await pega(`${B}/${R}/listServidores?${qs}`);
        // 🚨 O CABEÇALHO DO HTML TEM UMA COLUNA A MAIS que o array do JSON: a primeira <th> é vazia (a coluna de
        // ação "Abrir"), e o JSON começa direto na matrícula. Indexar pelo cabeçalho cru desloca TUDO em 1 — a
        // primeira gravação saiu com o cargo no campo "nome" e um valor em reais dentro de "lotacao".
        // O alinhamento é medido comparando o tamanho do cabeçalho com o tamanho da linha do JSON.
        const cabCru = [...tLista.matchAll(/<th[^>]*>\s*([^<]{0,40})/gi)].map((m) => m[1].trim());
        const cab = cabCru[0] === "" ? cabCru.slice(1) : cabCru;
        const ix = (re) => cab.findIndex((c) => re.test(c));
        const col = { matricula: ix(/matr[íi]cula/i), nome: ix(/^nome/i), cargo: ix(/^cargo/i),
          funcao: ix(/fun[çc][ãa]o/i), lotacao: ix(/lota[çc]/i), situacao: ix(/situa[çc]/i),
          vantagens: ix(/total\s*vantagens/i), liquido: ix(/l[íi]quido/i) };
        // ⭐ Nos controladores sem `listServidores` (o `…Salarios` simples) NÃO existe cabeçalho para indexar —
        // e não precisa: o mesmo Ajax devolve `paginacao.registros` com os campos NOMEADOS (`nmServidor`,
        // `nmCargoServidor`, `nmLotacaoServidor`, `vlSalarioBruto`…). Quando o cabeçalho falta, usa-se o nomeado,
        // que é mais seguro que qualquer posição. Antes disso o coletor simplesmente pulava (`continue`) e o
        // município fechava 'vazio'.
        const porNome = col.nome < 0;

        // paginação DataTables via JSON (a lotação só vem inteira aqui; no HTML sai truncada)
        for (let start = 0; start < 100000; start += 200) {
          const { txt } = await pega(`${B}/${R}/${R}Ajax`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" },
            body: `draw=1&start=${start}&length=200&order%5B0%5D%5Bcolumn%5D=1&order%5B0%5D%5Bdir%5D=asc&${qs}`,
            timeout: 180000,
          });
          let j = null; try { j = JSON.parse(txt); } catch {}
          if (porNome) {
            const nomeados = j?.paginacao?.registros || [];
            if (!nomeados.length) break;
            const antesPagina = regs.length;
            const comp = `${ex}${MESES[mes] || "00"}`;
            if (!compUsada) compUsada = comp;
            for (const s of nomeados) {
              const nome = String(s.nmServidor ?? s.nomeServidor ?? "").trim();
              if (!nome) continue;
              const mat = String(s.matriculaServidor ?? s.matricula ?? "");
              const cargo = String(s.nmCargoServidor ?? s.cargo ?? "").trim();
              regs.push({
                cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, base_url: B,
                entidade: ent.cod, entidade_nome: ent.nome, competencia: comp,
                matricula: mat, nome, cargo, funcao_confianca: String(s.funcaoConfianca ?? "").trim(),
                lotacao: String(s.nmLotacaoServidor ?? "").trim(), secretaria: String(s.nmLotacaoServidor ?? "").trim(),
                situacao: s.isServidorLicenciado === "1" ? "licenciado" : null,
                vantagens: Number.isFinite(+s.vlSalarioBruto) ? +s.vlSalarioBruto : null,
                descontos: Number.isFinite(+s.vlDescontos) ? +s.vlDescontos : null,
                liquido: Number.isFinite(+s.vlLiquido) ? +s.vlLiquido : null,
                _hash: crypto.createHash("md5").update([a.cod_ibge, comp, ent.cod, mat, nome, cargo].join("¦")).digest("hex"),
              });
            }
            // guarda de laço: se a página não trouxe NENHUM registro inédito, o servidor está ignorando o `start`
            // (visto em portais lentos) — parar em vez de rodar 500 páginas iguais
            if (regs.length === antesPagina) break;
            if (nomeados.length < 200) break;
            continue;
          }
          const arr = j?.paginacao?.registrosAsJSONArray || j?.data || [];
          if (!arr.length) break;
          const comp = `${ex}${MESES[mes] || "00"}`;
          if (!compUsada) compUsada = comp;
          // guarda final: se ainda houver diferença de tamanho, desloca os índices para casar com o JSON
          const desloc = arr[0] && cab.length > arr[0].length ? cab.length - arr[0].length : 0;
          for (const linha of arr) {
            const v = (i2) => { const k = i2 - desloc; return (k >= 0 && k < linha.length ? String(linha[k] ?? "").trim() : null); };
            const nome = v(col.nome);
            if (!nome) continue;
            regs.push({
              cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, base_url: B,
              entidade: ent.cod, entidade_nome: ent.nome, competencia: comp,
              matricula: v(col.matricula), nome, cargo: v(col.cargo), funcao_confianca: v(col.funcao),
              lotacao: v(col.lotacao), secretaria: v(col.lotacao), situacao: v(col.situacao),
              vantagens: money(v(col.vantagens)), descontos: null, liquido: money(v(col.liquido)),
              _hash: crypto.createHash("md5").update([a.cod_ibge, comp, ent.cod, v(col.matricula), nome, v(col.cargo)].join("¦")).digest("hex"),
            });
          }
          if (arr.length < 200) break;
        }
      }
    }
    }   // ← fim do laço de CONTROLADORES
    if (!regs.length) { await marca("vazio", `nenhum dos ${CONTROLADORES.length} controladores devolveu servidores`); falhas++; continue; }
    const m = new Map(); for (const r of regs) m.set(r._hash, r);
    const arr = [...m.values()];
    for (let k = 0; k < arr.length; k += 1000) {
      const p = arr.slice(k, k + 1000); const c = (f) => p.map((x) => x[f]);
      await q(`insert into folha_servidores_equiplano
        (cod_ibge,municipio,uf,base_url,entidade,entidade_nome,competencia,matricula,nome,cargo,funcao_confianca,
         lotacao,secretaria,situacao,vantagens,descontos,liquido,_hash)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
          $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],
          $17::numeric[],$18::text[])
        on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
        [c("cod_ibge"), c("municipio"), c("uf"), c("base_url"), c("entidade"), c("entidade_nome"), c("competencia"),
         c("matricula"), c("nome"), c("cargo"), c("funcao_confianca"), c("lotacao"), c("secretaria"), c("situacao"),
         c("vantagens"), c("descontos"), c("liquido"), c("_hash")]);
    }
    totalGeral += arr.length; ok++;
    await marca("ok", `${ents.length} entidades · ${usado}`, compUsada, arr.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${arr.length} servidores (${compUsada}${usado !== CONTROLADORES[0] ? " · " + usado : ""})`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  }
  await dorme(500);
}
console.log(`\n[equiplano] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${falhas} falhas`);
await db.end();
