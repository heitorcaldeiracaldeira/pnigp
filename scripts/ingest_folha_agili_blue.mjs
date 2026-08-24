// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_agili_blue.mjs — folha NOMINAL dos municípios ÁGILI **BLUE** (transparencia.agili{uf}.com.br).
//
// ⭐ Variante DIFERENTE do Ágili de MS (`ingest_folha_agili.mjs`, que usa `portaltransparencia{slug}.ddns.com.br`
//    + DevExpress). Aqui o portal é uma SPA com API JSON:
//      POST /api/gestaopessoas/funcionarios/servidores/obterdadosservidores/
//           ?model=Agili.Blue.Portal.Shared.GestaoPessoas.Dto.Servidores.ServidoresGridDto&page=N&size=N&withCount=true
//    Resposta: {data:[…], totalResult, totalPages, sizePerPage, currentPage}
//    Campos: unidadeGestora · matricula · cpfFormatado · nomeRazaoSocial · salarioBase · salarioBruto ·
//            descontos · salarioLiquido · tipoSituacaoVincTrab · **estrutAdministrativa (a SECRETARIA)** ·
//            mesPagamento · dataAdmissao · cargo — os cinco campos de uma vez.
//
// 🚨 DUAS ARMADILHAS
// 1. `agilicloud.agilirn.com.br/portal/{slug}` é o **Portal do Cidadão** (IPTU, NFS-e, débitos) — NÃO tem folha.
//    A transparência mora em **`transparencia.agilirn.com.br/{slug}/pessoal/servidores`**, outro host. Foi o que
//    fez a varredura marcar 16 municípios do RN como "agili" apontando para o lugar errado
//    ([[pnigp-rotulo-erp-nao-e-o-portal-da-folha]], [[pnigp-modulo-vs-host-fornecedor]]).
// 2. O POST **exige o array de filtros completo** que o app monta; com `[]` o backend responde **500**.
//    Por isso o coletor abre a página uma vez, CAPTURA o payload real e o reusa paginando.
//
// Uso: UF=RN node scripts/ingest_folha_agili_blue.mjs   ·   SO=Afonso   ·   REFAZ=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RN";
const SO = process.env.SO || null;
const REFAZ = process.env.REFAZ === "1";
const TAM = Number(process.env.TAM || 1000);
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const MODEL = "Agili.Blue.Portal.Shared.GestaoPessoas.Dto.Servidores.ServidoresGridDto";

await q(`create table if not exists folha_servidores_agiliblue (
  cod_ibge text, municipio text, uf text, host text, slug text, competencia text,
  unidade_gestora text, secretaria text, nome text, cpf_masc text, matricula text,
  cargo text, situacao text, forma_ingresso text, tipo_calculo text, data_admissao text,
  salario_base numeric, bruto numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_agiliblue_mun on folha_servidores_agiliblue (cod_ibge, competencia)`);
await q(`create table if not exists folha_agiliblue_coleta (
  cod_ibge text primary key, municipio text, uf text, slug text, linhas int, declarado int,
  situacao text, detalhe text, em timestamptz default now()
)`);

const txt = (s) => { const v = String(s ?? "").trim(); return v && v !== "-" ? v : null; };
const num = (v) => (v == null || v === "" ? null : (Number.isFinite(+v) ? +v : null));

// alvos: os candidatos que a varredura por site marcou como ágili nesta UF
const alvos = (await q(`select cod_ibge, municipio, url from folha_host_candidato
  where uf = $1 and produto = 'agili' ${SO ? "and municipio ilike '%'||$2||'%'" : ""}
  order by municipio`, SO ? [UF, SO] : [UF])).rows;
const feitos = REFAZ ? new Set()
  : new Set((await q(`select cod_ibge from folha_agiliblue_coleta where situacao = 'ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[agili-blue] ${UF}: ${alvos.length} candidatos · ${fila.length} na fila`);

// ⭐ o slug aparece em DOIS formatos e é o mesmo nos dois hosts:
//    portal do cidadão   → agilicloud.agilirn.com.br/portal/{slug}
//    transparência direta → transparencia.agilirn.com.br/{slug}[/pessoal/servidores]
// Ler só o primeiro deixou 3 municípios como "sem_slug" quando a URL já era a boa.
const slugDe = (url) => {
  const u = String(url || "");
  return (u.match(/\/portal\/([a-z0-9\-]+)/i) || [])[1]
      || (u.match(/transparencia\.agili[a-z]{2}\.com\.br\/([a-z0-9\-]+)/i) || [])[1]
      || null;
};
// ⭐ O host varia: alguns estados têm o seu (`transparencia.agilirn.com.br`), mas existe o GENÉRICO
//    `transparencia.agilicloud.com.br`, que serve os slugs de qualquer UF (provado com prefjaparatinga-al).
//    Tentar o específico e cair no genérico — sem isso, AL não coletava por host inexistente.
const HOSTS = [`https://transparencia.agili${UF.toLowerCase()}.com.br`, "https://transparencia.agilicloud.com.br"];
async function achaHost(page, slug) {
  for (const h of HOSTS) {
    // 🚨 O goto FALHA mesmo quando a página carrega: a SPA dispara um redirecionamento interno e o Playwright
    //    reporta "Navigation to X interrupted by another navigation" — inclusive com `commit`. Não dá para
    //    confiar no retorno do goto; a prova é o ESTADO da página depois ([[pnigp-spa-nao-e-obstaculo-e-nao-publicacao]]).
    await page.goto(`${h}/${slug}/pessoal/servidores`, { waitUntil: "commit", timeout: 45000 }).catch(() => {});
    await dorme(2500);
    const vivo = await page.evaluate(() => ({
      url: location.href,
      corpo: (document.body?.innerText || "").length,
    })).catch(() => null);
    if (process.env.DEBUG) console.log(`      ${h} → ${vivo ? `${vivo.corpo}b em ${vivo.url.slice(0, 60)}` : "morto"}`);
    if (vivo && vivo.corpo > 300 && vivo.url.includes(new URL(h).host)) return h;
  }
  return null;
}


const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_agiliblue
      (cod_ibge,municipio,uf,host,slug,competencia,unidade_gestora,secretaria,nome,cpf_masc,matricula,cargo,
       situacao,forma_ingresso,tipo_calculo,data_admissao,salario_base,bruto,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::text[],
        $17::numeric[],$18::numeric[],$19::numeric[],$20::numeric[],$21::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("slug"), c("competencia"), c("unidade_gestora"),
       c("secretaria"), c("nome"), c("cpf_masc"), c("matricula"), c("cargo"), c("situacao"), c("forma_ingresso"),
       c("tipo_calculo"), c("data_admissao"), c("salario_base"), c("bruto"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const slug = slugDe(a.url);
  const marca = (situacao, detalhe, linhas = 0, declarado = 0) =>
    q(`insert into folha_agiliblue_coleta (cod_ibge,municipio,uf,slug,linhas,declarado,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
       slug=excluded.slug, linhas=excluded.linhas, declarado=excluded.declarado,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, UF, slug, linhas, declarado, situacao, detalhe]);
  if (!slug) { await marca("sem_slug", `URL sem /portal/{slug}: ${String(a.url).slice(0, 80)}`); falhas++; continue; }

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  try {
    let payload = null;
    page.on("request", (r) => { if (/obterdadosservidores/i.test(r.url()) && r.postData()) payload = r.postData(); });
    const HOST = await achaHost(page, slug);
    if (!HOST) { await marca("host_nao_responde", `nenhum host Ágili respondeu para o slug ${slug}`); vazios++; continue; }
    const alvo = `${HOST}/${slug}/pessoal/servidores`;
    const resp = await page.goto(alvo, { waitUntil: "domcontentloaded", timeout: 70000 }).catch(() => null);
    // ⚠️ esperar um relógio fixo perdia o payload em portais lentos: esperar o EVENTO (até 40s)
    for (let w = 0; w < 80 && !payload; w++) await dorme(500);
    if (!payload) {
      await marca("sem_payload", `HTTP ${resp?.status() ?? "?"} · a página não chamou obterdadosservidores`);
      vazios++;
      console.log(`  · ${a.municipio}: sem payload (HTTP ${resp?.status() ?? "?"})`);
      continue;
    }

    // com o payload real em mãos, pagina de dentro da página (referer e sessão legítimos)
    const colhido = await page.evaluate(async ({ MODEL, body, TAM, slug }) => {
      const url = (pg, size) => `/api/gestaopessoas/funcionarios/servidores/obterdadosservidores/?model=${MODEL}&page=${pg}&size=${size}&withCount=true`;
      // 🚨 `uc` é o identificador do município e `authorization: Bearer null` é literal — sem os dois o
      //    backend responde 500 mesmo com o payload correto e size=10.
      const H = { "content-type": "application/json", accept: "application/json, text/plain, */*",
        authorization: "Bearer null", uc: slug };
      const filtros = JSON.parse(body);
      const põe = (campo, valor) => {
        const f = filtros.find((x) => x.field === campo);
        if (f) { f.value = String(valor); f.valueDefault = String(valor); }
      };
      // sonda barata: só o totalResult, para saber QUAIS meses têm dado
      const sonda = async (ano, mes) => {
        põe("Ano", ano); põe("Mes", mes);
        const r = await fetch(url(0, 1), { method: "POST", body: JSON.stringify(filtros), headers: H });
        if (!r.ok) return -1;
        return (await r.json()).totalResult ?? 0;
      };
      // 🚨 A régua NÃO é o total: `tipoCalculo` traz 13º Salário, Férias, Licença prêmio, Rescisão e
      //    Complementar além de Mensal. Escolher o mês com mais LINHAS pega dezembro (13º) e infla —
      //    Ipanguaçu deu 1.603 linhas para 1.146 nomes. A régua é o nº de linhas de folha MENSAL.
      //    Mesmo defeito da coluna "Referência" do SCPI e do 13º em [[pnigp-tcmba-folha-417-crack]].
      const pesaMensal = async (ano, mes) => {
        põe("Ano", ano); põe("Mes", mes);
        const r = await fetch(url(0, 3000), { method: "POST", body: JSON.stringify(filtros), headers: H });
        if (!r.ok) return 0;
        const j = await r.json();
        return (j.data || []).filter((x) => /mensal/i.test(String(x.tipoCalculo || ""))).length;
      };
      // ⭐ COMPETÊNCIA MAIS CHEIA, não a mais recente: o mês default do portal costuma vir vazio
      //    (Florânia devolvia 0 em julho e a própria tela dizia "nenhum registro para o filtro selecionado").
      const anoAtual = new Date().getFullYear();
      const comDado = []; const diag = [];
      for (const ano of [anoAtual, anoAtual - 1]) {
        for (let mes = 12; mes >= 1; mes--) {
          const n = await sonda(ano, mes);
          if (n > 0) comDado.push({ ano, mes, total: n });
        }
        if (comDado.length) break;               // achou o ano que publica; não precisa do anterior
      }
      if (!comDado.length) return { linhas: [], total: 0, diag: "nenhuma competência com dado em 24 meses" };
      // pesa por FOLHA MENSAL só os 4 meses mais cheios — evita baixar 24 vezes
      comDado.sort((a, b) => b.total - a.total);
      let melhor = null;
      for (const c of comDado.slice(0, 4)) {
        const m = await pesaMensal(c.ano, c.mes);
        diag.push(`${c.ano}/${c.mes}:${m}mensal/${c.total}`);
        if (!melhor || m > melhor.n) melhor = { ano: c.ano, mes: c.mes, n: m };
      }
      if (!melhor || !melhor.n) melhor = { ano: comDado[0].ano, mes: comDado[0].mes, n: comDado[0].total };

      põe("Ano", melhor.ano); põe("Mes", melhor.mes);
      const corpo = JSON.stringify(filtros);
      const out = []; let total = 0, paginas = 1;
      for (let pg = 0; pg < paginas && pg < 200; pg++) {
        const r = await fetch(url(pg, TAM), { method: "POST", body: corpo, headers: H });
        if (!r.ok) { diag.push(`pg${pg}:HTTP${r.status}`); break; }
        const j = await r.json();
        total = j.totalResult ?? total;
        paginas = j.totalPages ?? 1;
        out.push(...(j.data || []));
        if (!j.data?.length) break;
      }
      return { linhas: out, total, ano: melhor.ano, mes: melhor.mes, diag: `escolhida ${melhor.ano}/${melhor.mes} · ${diag.slice(0, 6).join(" ")}` };
    }, { MODEL, body: payload, TAM, slug });

    const rows = colhido.linhas || [];
    if (!rows.length) {
      await marca("vazio", `API sem registros · ${colhido.diag || "(sem diagnóstico)"}`);
      vazios++;
      console.log(`  · ${a.municipio}: vazio — ${colhido.diag || "?"}`);
      continue;
    }

    const regs = rows.map((s) => {
      // ⚠️ `mesPagamento` é só o mês. O ANO vem da competência que a varredura escolheu — usar o ano do
      //    relógio carimbaria 2026 numa folha de 2025 ([[pnigp-competencia-mais-cheia-nao-a-recente]]).
      const mes = String(s.mesPagamento ?? colhido.mes ?? "").padStart(2, "0");
      const comp = /^\d{2}$/.test(mes) ? `${colhido.ano ?? new Date().getFullYear()}${mes}` : null;
      return {
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: UF, host: HOST.replace("https://", ""), slug,
        competencia: comp, unidade_gestora: txt(s.unidadeGestora), secretaria: txt(s.estrutAdministrativa),
        nome: txt(s.nomeRazaoSocial), cpf_masc: txt(s.cpfFormatado), matricula: txt(s.matricula),
        cargo: txt(s.cargo ?? s.descricaoCargo ?? s.funcao), situacao: txt(s.tipoSituacaoVincTrab),
        forma_ingresso: txt(s.formaIngressoFunc), tipo_calculo: txt(s.tipoCalculo),
        data_admissao: txt(s.dataAdmissao), salario_base: num(s.salarioBase), bruto: num(s.salarioBruto),
        descontos: num(s.descontos), liquido: num(s.salarioLiquido),
        _hash: crypto.createHash("md5")
          .update([a.cod_ibge, comp, s.matricula, s.nomeRazaoSocial, s.unidadeGestora, s.tipoCalculo].join("¦")).digest("hex"),
      };
    });
    await grava(regs);
    totalGeral += regs.length; ok++;
    // 🚨 régua contra subcoleta silenciosa: comparar com o total que a própria API declara
    const faltou = colhido.total && regs.length < colhido.total * 0.95;
    await marca(faltou ? "subcoletado" : "ok",
      faltou ? `API declara ${colhido.total}, colhi ${regs.length}` : null, regs.length, colhido.total || 0);
    console.log(`  [${i + 1}/${fila.length}] ${a.municipio}: ${regs.length} servidores` +
      (faltou ? `  ⚠️ SUBCOLETADO — API declara ${colhido.total}` : ` de ${colhido.total}`));
  } catch (e) {
    await marca("falha", String(e.message).slice(0, 160)); falhas++;
    console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close().catch(() => {}); }
}
await browser.close();
console.log(`\n[agili-blue] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
