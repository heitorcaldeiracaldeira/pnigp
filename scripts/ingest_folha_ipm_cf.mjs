// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_ipm_cf.mjs — coletor IPM para os municípios cujo atende.net está atrás de CLOUDFLARE.
//
// ⭐ POR QUE existe: no coletor HTTP (ingest_folha_ipm.mjs) o `processaDados` desses municípios devolve HTTP 500 —
// NÃO por bug de corpo (é idêntico ao que funciona), e sim porque o atende.net deles tem o desafio JS do Cloudflare
// (`challenges.cloudflare.com`). O node não resolve o desafio → 500. O NAVEGADOR resolve → 200 com o JSON.
// Estratégia: Playwright abre o embed (Cloudflare limpa), e aí os fetches são feitos DENTRO da página (in-page),
// carregando o cf_clearance + PHPSESSID da sessão. Mesma tela/consulta do HTTP, só que atrás do navegador.
//
// Grava em folha_servidores_ipm (mesmo schema/parse do coletor HTTP). Marca folha_ipm_coleta.
// Uso: node scripts/ingest_folha_ipm_cf.mjs   (os que estão 'erro' com HTTP 500)   ·   SO=Bandeira p/ um.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";
import { slugDe } from "./_ipm.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const num = (s) => { if (s == null) return null; const t = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."); const n = parseFloat(t); return Number.isFinite(n) ? n : null; };
const B64 = Buffer.from(JSON.stringify({ codigo: "9", tipo: "1", grupo: "4" })).toString("base64");

// alvos: os que deram HTTP 500 (Cloudflare). slug via erp_portal_municipal (fallback slugDe).
const alvos = (await q(`select c.cod_ibge, c.municipio, c.uf, e.slug from folha_ipm_coleta c
  left join erp_portal_municipal e on e.cod_ibge=c.cod_ibge and e.erp='ipm'
  where c.situacao='erro' and c.detalhe like '%500%' ${SO ? "and c.municipio ilike '%'||$1||'%'" : ""}
  order by c.uf, c.municipio`, SO ? [SO] : [])).rows
  .map((a) => ({ ...a, slug: a.slug || slugDe(a.municipio) }));
console.log(`[ipm-cf] ${alvos.length} municípios (Cloudflare) a coletar via navegador`);

const LOTE = 1000;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const p = arr.slice(i, i + LOTE); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_ipm
      (cod_ibge,municipio,uf,entidade,competencia,nome,cargo,lotacao,matricula,contrato,afastamento,rescisao,ferias,provento,desconto,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::numeric[],$16::numeric[],$17::text[])
      on conflict (_hash) do update set provento=excluded.provento, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("entidade"), c("competencia"), c("nome"), c("cargo"), c("lotacao"),
       c("matricula"), c("contrato"), c("afastamento"), c("rescisao"), c("ferias"), c("provento"), c("desconto"), c("liquido"), c("_hash")]);
  }
}
const marca = (a, situacao, detalhe, comp = null, linhas = 0) =>
  q(`insert into folha_ipm_coleta (cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
     values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (cod_ibge) do update set
     competencia=excluded.competencia, linhas=excluded.linhas, situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [a.cod_ibge, a.municipio, a.uf, comp, linhas, situacao, detalhe]);

// pega TODOS os servidores in-page: buscaPeriodos → escolhe a competência mais recente → pagina processaDados
async function coletaInPage(page, item, grupo, tipo) {
  return await page.evaluate(async ({ item, grupo, tipo }) => {
    const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
    const base = location.href.replace(/\/relacao-funcionario-x-salario.*$/, "");
    const post = async (processo, extraQS, body) => {
      const r = await fetch(`${base}/atende.php?rot=3344&aca=101&ajax=t&processo=${processo}${extraQS || ""}`, {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" }, body });
      return r;
    };
    // entidade: primeira opção real do select clicodigo
    const selEnt = document.querySelector('[name="clicodigo"],#clicodigo');
    if (!selEnt || !selEnt.options.length) return { erro: "sem entidade" };
    const entidade = selEnt.options[0].value;
    // buscaPeriodos
    const bpBody = new URLSearchParams({ chave: "null", caller: "null",
      parametro: JSON.stringify({ entidade, grupo, item, tipo, chaveInt: false }),
      autoId: "1", monitor: "0", flush: "0", versaoSistema: "v2", portalTransparencia: "true" });
    const rbp = await post("buscaPeriodosDisponiveisEntidade", "", bpBody);
    if (!rbp.ok) return { erro: "buscaPeriodos " + rbp.status };
    const periodos = await rbp.json();
    if (!Array.isArray(periodos) || !periodos.length) return { erro: "sem periodos" };
    const comp = (periodos.find((p) => p.ativa) || periodos[0]).codigo;
    // processaDados paginado
    const fc = [
      { filtroCampo: "clicodigo", filtroTipo: "=", filtroValor: entidade, filtroValor02: "", filtroTipoCampo: "lista", filtroPodeSalvar: "false", filtroEncoded: true },
      { filtroCampo: "PeriodoFolha.odoMesAno", filtroTipo: "=", filtroValor: comp, filtroValor02: "", filtroTipoCampo: "lista", filtroPodeSalvar: "false", filtroEncoded: true },
      { filtroCampo: "filtroIgnoraPrevidencia", filtroTipo: "=", filtroValor: "", filtroValor02: "", filtroTipoCampo: "booleano", filtroPodeSalvar: "true", filtroEncoded: false },
      { filtroCampo: "filtroExibe13", filtroTipo: "=", filtroValor: "", filtroValor02: "", filtroTipoCampo: "booleano", filtroPodeSalvar: "true", filtroEncoded: false },
      { filtroCampo: "somarFeriasBruto", filtroTipo: "=", filtroValor: "on", filtroValor02: "", filtroTipoCampo: "booleano", filtroPodeSalvar: "true", filtroEncoded: false },
      { filtroCampo: "afastamento", filtroTipo: "IN", filtroValor: "", filtroValor02: "", filtroTipoCampo: "lista_multipla", filtroPodeSalvar: "true", filtroEncoded: false },
      { filtroCampo: "uninomerazao", filtroTipo: "C", filtroValor: "", filtroValor02: "", filtroTipoCampo: "texto" },
    ];
    const parametro = { item, grupo, tipo, janelaAutoId: "1", selecionar: false, selecionar_multipla: false, permiteAcaoSelecionar: false,
      __identificadores: [], __filtros_consulta_padrao: fc, __order_consulta_padrao: [{ order: "fcncodigo", orderT: "asc", tipo: 1 }],
      nome_consulta: "consulta_padrao",
      campos_consulta: ["clicodigo", "odomesano", "fcncodigo", "funcontrato", "uninomerazao", "cardescricao", "cncdescricao", "afastamento", "rescisao", "ferias", "decimo", "provento", "desconto", "liquido", "desctetoconstitucional", "PeriodoFolha.odoMesAno", "PeriodoFolha.odoSituacao"],
      dados_agrupador: [] };
    const chave = JSON.stringify({ item, grupo, tipo, janelaAutoId: "1", selecionar: false, selecionar_multipla: false, permiteAcaoSelecionar: false });
    const linhas = []; let pagina = 0, total = null;
    while (pagina < 300) {
      const body = new URLSearchParams({ chave, caller: "null", parametro: JSON.stringify(parametro), autoId: "1", monitor: "0", flush: "0", versaoSistema: "v2", portalTransparencia: "true" });
      const qs = `&registros=500&pagina=${pagina}&selecionar=false&contaRegistros=true&totalizaRegistros=false&nivelArvore=null`;
      const r = await post("processaDados", qs, body);
      if (!r.ok) return { erro: "processaDados " + r.status, comp };
      const j = await r.json();
      total = j.totalRegistros ?? j.total ?? total;
      const pg = (j.dados || []).map((d) => d.valor).filter(Boolean);
      linhas.push(...pg);
      if (!pg.length || (total != null && linhas.length >= total)) break;
      pagina++; await dorme(150);
    }
    return { comp, total, linhas };
  }, { item, grupo, tipo });
}

const HEADLESS = process.env.HEADLESS === "1";
const browser = await chromium.launch({ headless: HEADLESS, args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"] });
let ok = 0, falha = 0, totalGeral = 0;
for (let i = 0; i < alvos.length; i++) {
  const a = alvos[i];
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    const url = `https://${a.slug}.atende.net/transparencia/item/embed/data/${B64}/item/relacao-funcionario-x-salario`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    // espera o Cloudflare limpar + a tela montar (select clicodigo aparece)
    let pronto = false;
    for (let w = 0; w < 25; w++) { await dorme(2000);
      pronto = await page.evaluate(() => { const s = document.querySelector('[name="clicodigo"],#clicodigo'); return !!(s && s.options && s.options.length); }).catch(() => false);
      if (pronto) break;
    }
    if (!pronto) { await marca(a, "erro", "cloudflare/tela nao montou"); falha++; console.log(`  ✖ [${i + 1}/${alvos.length}] ${a.uf} ${a.municipio}: tela não montou`); continue; }
    const res = await coletaInPage(page, "9", "4", "1");
    if (res.erro) { await marca(a, "erro", "cf:" + res.erro, res.comp); falha++; console.log(`  ✖ [${i + 1}/${alvos.length}] ${a.uf} ${a.municipio}: ${res.erro}`); continue; }
    const regs = res.linhas.map((s) => ({
      cod_ibge: a.cod_ibge, municipio: a.municipio, uf: a.uf, entidade: s.clicodigo,
      competencia: s.odomesano, nome: s.uninomerazao, cargo: s.cardescricao, lotacao: s.cncdescricao,
      matricula: s.fcncodigo, contrato: s.funcontrato, afastamento: s.afastamento, rescisao: s.rescisao, ferias: s.ferias,
      provento: num(s.provento), desconto: num(s.desconto), liquido: num(s.liquido),
      _hash: crypto.createHash("md5").update([a.cod_ibge, s.odomesano, s.fcncodigo, s.funcontrato, s.uninomerazao, s.cardescricao, s.provento].join("¦")).digest("hex"),
    }));
    if (!regs.length) { await marca(a, "vazio", "sem servidores", res.comp); console.log(`  · [${i + 1}/${alvos.length}] ${a.uf} ${a.municipio}: vazio`); continue; }
    await grava(regs);
    totalGeral += regs.length; ok++;
    await marca(a, "ok", null, regs[0]?.competencia || res.comp, regs.length);
    console.log(`  ✔ [${i + 1}/${alvos.length}] ${a.uf} ${a.municipio}: ${regs.length} servidores (comp ${regs[0]?.competencia})`);
  } catch (e) {
    falha++; await marca(a, "erro", "cf:" + String(e.message).slice(0, 120));
    console.log(`  ✖ [${i + 1}/${alvos.length}] ${a.uf} ${a.municipio}: ${String(e.message).slice(0, 70)}`);
  } finally { await ctx.close(); }
  await dorme(800);
}
await browser.close();
console.log(`\n[ipm-cf] ${ok} ok · ${falha} falhas · ${totalGeral.toLocaleString("pt-BR")} servidores`);
await db.end();
