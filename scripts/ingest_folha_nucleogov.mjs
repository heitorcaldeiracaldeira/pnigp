// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_nucleogov.mjs — folha nominal dos municípios do ERP NucleoGov (~105, forte em GO/TO).
//
// ⭐ NucleoGov É MEGASOFT por baixo: o portal `acessoainformacao.{dominio}/cidadao/transparencia/mgservidores`
// chama POST `/api` com `acao:"megasoft/servidores"` e devolve JSON IDÊNTICO ao MegaSoft (nome, cargo, departamento
// =secretaria, proventos, descontos, totalLiquido, tipoDeVinculo, matricula, cpf, dataAdmissao). Ver [[pnigp-megasoft-folha]].
//
// 🚨 O WAF bloqueia HTTP não-navegador (curl→403). Molde GovBR: **Playwright passa o WAF**, e a API JSON roda por
// fetch INTERNO (mesma origem). Dado público, sem login, sem captcha — navegador real é acesso normal.
//
// Host: `acessoainformacao.` + domínio do site oficial (radar_portal.url_portal). Órgãos: acao "megasoft/orgaos".
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_nucleogov (
  cod_ibge text, municipio text, uf text, host text, competencia text,
  matricula text, nome text, cpf_masc text, cargo text, departamento text, vinculo text,
  situacao text, situacao_pagamento text, carga_horaria text, data_admissao text,
  proventos numeric, descontos numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_ng_mun on folha_servidores_nucleogov (cod_ibge, competencia)`);
await q(`create table if not exists folha_nucleogov_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, linhas int, situacao text, detalhe text, em timestamptz default now()
)`);

const num = (v) => (v == null ? null : (Number.isFinite(+v) ? +v : null));
// o dialeto servidores_cnt devolve dinheiro já formatado em pt-BR ("2.550,09") — ponto é MILHAR, vírgula é decimal
const moedaBR = (v) => {
  if (v == null) return null;
  const n = +String(v).replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", ".");
  return Number.isFinite(n) ? n : null;
};

// deriva o host do portal: acessoainformacao.{dominio limpo}
function hostDe(urlPortal) {
  let d = (urlPortal || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
  return d ? `acessoainformacao.${d}` : null;
}

// alvos: municípios NucleoGov do Radar
// alvos: (1) os do Radar, cujo host segue a convenção `acessoainformacao.{domínio}`; (2) os que a assinatura da
// página revelou serem NucleoGov mesmo rodando em DOMÍNIO PRÓPRIO do município (35 deles) — aí o host é o da
// própria URL, não a convenção. Ver identifica_produto_portal.mjs.
const alvos = [
  ...(await q(`select cod_ibge, municipio, uf, url_portal from radar_portal
    where erp='nucleogov' and unidade_gestora ilike 'Prefeitura%' and url_portal is not null and url_portal <> '-'
    ${SO ? "and municipio ilike '%'||$1||'%'" : ""} order by uf, municipio`, SO ? [SO] : [])).rows
    .map((a) => ({ ...a, host: hostDe(a.url_portal) })),
  ...(await q(`select cod_ibge, municipio, uf, url from portal_produto
    where produto='nucleogov' ${SO ? "and municipio ilike '%'||$1||'%'" : ""}`, SO ? [SO] : [])).rows
    .map((a) => { try { return { ...a, host: new URL(a.url).host }; } catch { return { ...a, host: null }; } }),
].filter((a) => a.host)
  .filter((a, i, arr) => arr.findIndex((x) => x.cod_ibge === a.cod_ibge) === i);

const feitos = new Set((await q(`select cod_ibge from folha_nucleogov_coleta where situacao='ok'`)).rows.map((r) => r.cod_ibge));
const fila = alvos.filter((a) => !feitos.has(a.cod_ibge));
console.log(`[nucleogov] ${alvos.length} municípios · ${fila.length} na fila`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_nucleogov
      (cod_ibge,municipio,uf,host,competencia,matricula,nome,cpf_masc,cargo,departamento,vinculo,situacao,
       situacao_pagamento,carga_horaria,data_admissao,proventos,descontos,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[],$16::numeric[],$17::numeric[],
        $18::numeric[],$19::text[])
      on conflict (_hash) do update set proventos=excluded.proventos, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("host"), c("competencia"), c("matricula"), c("nome"), c("cpf_masc"),
       c("cargo"), c("departamento"), c("vinculo"), c("situacao"), c("situacao_pagamento"), c("carga_horaria"),
       c("data_admissao"), c("proventos"), c("descontos"), c("liquido"), c("_hash")]);
  }
}

// 🚨 O QUE PARECIA WAF ERAM TRÊS COISAS (14/ago): dos 112 municípios marcados "WAF bloqueou o /api", a sonda em 5
// deles mostrou que o /api responde 200 JSON normalmente. O que mudou foi o PRODUTO:
//   1. a tela migrou de `/cidadao/transparencia/mgservidores` para `/transparencia/servidores_cnt`;
//   2. as ações mudaram de `megasoft/orgaos|servidores` para `servidores_cnt/listarOrgaos|listar`, e ação
//      desconhecida devolve HTML — que o código lia como challenge de WAF;
//   3. alguns portais trocaram de fornecedor (Jaú do TO virou SPA em jau.7focus.inf.br) e nem são mais NucleoGov.
// O dialeto novo entrega MAIS campos que o antigo: traz `lotacao` (secretaria) e `salario_base`.
const ROTAS = ["/transparencia/servidores_cnt", "/cidadao/transparencia/mgservidores"];

// dentro do navegador: pega órgãos + pagina todos os servidores da competência mais recente
async function coleta(page, host) {
  let ultimo = null;
  for (const rota of ROTAS) {
    await page.goto(`https://${host}${rota}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dorme(4000);
    const destino = new URL(page.url()).host;
    if (destino !== host) return { _migrou: page.url() }; // portal trocou de produto/fornecedor
    const r = await page.evaluate(async () => {
      const H = location.origin;
      // call com RETRY: se a resposta não for JSON (WAF challenge → HTML), tenta de novo com espera
      const call = async (params) => {
        const body = "multi_request=true&params=" + encodeURIComponent(JSON.stringify({ "0-x": params }));
        for (let t = 0; t < 4; t++) {
          try {
            const resp = await fetch(H + "/api", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" }, body });
            const txt = await resp.text();
            if (/^\s*</.test(txt)) { await new Promise((f) => setTimeout(f, 2500 * (t + 1))); continue; } // HTML do WAF → retry
            const j = JSON.parse(txt);
            return j[Object.keys(j)[0]];
          } catch { await new Promise((f) => setTimeout(f, 2500 * (t + 1))); }
        }
        return { _waf: true };
      };

      // ── dialeto NOVO (servidores_cnt): { dados[], total, ultimoMes }, paginado por limit "offset, n"
      const orgNovo = await call({ acao: "servidores_cnt/listarOrgaos" });
      if (Array.isArray(orgNovo)) {
        const dados = []; let off = 0, tot = null;
        while (true) {
          const j = await call({ ano: null, mes: null, limit: `${off}, 500`, acao: "servidores_cnt/listar" });
          if (!j || j._waf || !Array.isArray(j.dados)) break;
          if (tot == null) tot = j.total;
          dados.push(...j.dados);
          off += j.dados.length;
          if (!j.dados.length || (tot != null && dados.length >= tot) || off > 200000) break;
        }
        if (dados.length) return { dialeto: "servidores_cnt", registros: dados, total: tot };
      }

      // ── dialeto ANTIGO (megasoft/*)
      const orgaos = await call({ acao: "megasoft/orgaos" });
      if (orgaos && orgaos._waf) return { _waf: true };
      const codigos = (Array.isArray(orgaos) ? orgaos.map((o) => o.id) : []).join(",");
      const out = []; let pagina = 1, total = null, ano = null, mes = null;
      // fetchPagina: tenta COM os códigos de órgão; se vier vazio na 1ª, refaz SEM filtro (alguns portais não filtram)
      const puxa = async (cods) => {
        const arr = []; let pg = 1, tot = null, an = null, me = null, ok = true;
        while (true) {
          const params = { pagina: pg, tamanhoDaPagina: 500, acao: "megasoft/servidores" };
          if (cods) params.codigosDoOrgao = cods;
          const o = await call(params);
          if (!o || o._waf) { ok = false; break; }
          if (!Array.isArray(o.registros)) break;
          if (tot == null) { tot = o.total; an = o.ano; me = o.mes; }
          arr.push(...o.registros);
          if (arr.length >= (o.total || 0) || o.registros.length === 0) break;
          pg++; if (pg > 300) break;
        }
        return { arr, tot, an, me, ok };
      };
      let res = await puxa(codigos || null);
      if (res.ok && res.arr.length === 0 && codigos) res = await puxa(null); // fallback sem filtro
      if (!res.ok) return { _waf: true };
      return { dialeto: "megasoft", total: res.tot, ano: res.an, mes: res.me, registros: res.arr };
    });
    if (r && !r._waf && r.registros?.length) return r;
    ultimo = r;
  }
  if (ultimo && ultimo._waf) throw new Error("as duas rotas responderam HTML no /api (WAF ou ação desconhecida)");
  return ultimo || { registros: [] };
}

const UA_REAL = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const HEADLESS = process.env.HEADFUL ? false : true;
const browser = await chromium.launch({ headless: HEADLESS, args: ["--disable-blink-features=AutomationControlled"] });
let totalGeral = 0, ok = 0, vazios = 0, falhas = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const marca = (situacao, detalhe, linhas = 0) =>
    q(`insert into folha_nucleogov_coleta (cod_ibge,municipio,uf,host,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set
       linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [a.cod_ibge, a.municipio, a.uf, a.host, linhas, situacao, detalhe]);
  const ctx = await browser.newContext({ userAgent: UA_REAL });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });
  const page = await ctx.newPage();
  try {
    const d = await coleta(page, a.host);
    if (d._migrou) { await marca("migrou_produto", `portal agora responde em ${d._migrou.slice(0, 110)}`); falhas++; continue; }
    if (!d.registros?.length) { await marca("vazio", "sem servidores"); vazios++; continue; }
    const novo = d.dialeto === "servidores_cnt";
    const competencia = novo
      ? `${d.registros[0].ano}${String(d.registros[0].mes).padStart(2, "0")}`
      : `${d.ano}${String(d.mes).padStart(2, "0")}`;
    const regs = d.registros.map((s) => {
      const comp = novo && s.ano ? `${s.ano}${String(s.mes).padStart(2, "0")}` : competencia;
      const cargo = (s.cargo || "").trim();
      return novo ? {
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, host: a.host, competencia: comp,
        matricula: String(s.matricula ?? ""), nome: s.nome, cpf_masc: s.cpf, cargo,
        departamento: s.lotacao, vinculo: s.tipo_admissao, situacao: s.situacao, situacao_pagamento: s.tipo_movimentacao,
        carga_horaria: String(s.carga_horaria ?? ""), data_admissao: s.data_admissao,
        proventos: moedaBR(s.total_proventos), descontos: moedaBR(s.total_descontos), liquido: moedaBR(s.total_liquido),
        _hash: crypto.createHash("md5").update([a.cod_ibge, comp, s.matricula, s.nome, cargo].join("¦")).digest("hex"),
      } : {
        cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, host: a.host, competencia: comp,
        matricula: String(s.matricula ?? ""), nome: s.nome, cpf_masc: s.cpf, cargo,
        departamento: s.departamento, vinculo: s.tipoDeVinculo, situacao: s.situacao, situacao_pagamento: s.situacaoPagamento,
        carga_horaria: String(s.cargaHoraria ?? ""), data_admissao: s.dataAdmissao,
        proventos: num(s.proventos), descontos: num(s.descontos), liquido: num(s.totalLiquido),
        _hash: crypto.createHash("md5").update([a.cod_ibge, comp, s.matricula, s.nome, cargo].join("¦")).digest("hex"),
      };
    });
    await grava(regs);
    totalGeral += regs.length; ok++;
    await marca("ok", d.dialeto, regs.length);
    console.log(`  [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${regs.length} servidores (${competencia}, ${d.dialeto})`);
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close(); }
  await dorme(600);
}
await browser.close();
console.log(`\n[nucleogov] ${totalGeral.toLocaleString("pt-BR")} servidores · ${ok} ok · ${vazios} vazios · ${falhas} falhas`);
await db.end();
