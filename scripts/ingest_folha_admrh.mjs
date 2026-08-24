// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_admrh.mjs — folha do portal **ADMRH** (`{host}/rhsysportaltransp/`), usado por municípios grandes
// do RS. Primeiro alvo: RIO GRANDE (5.498 servidores).
//
// A CADEIA (API REST, mas com SESSÃO):
//   GET /rhsysportaltransp/api/lov/referencia            → competências disponíveis (`codigo` = ISO com [UTC])
//   GET /rhsysportaltransp/api/relacaoservidores?page=N&referencia=…
//        → {count, dados:[{matricula, nmfuncionario, nmcargo, nmorgao(SECRETARIA), nmvinculo, admissao,
//                          hrmensais, padrao, inativo, pensionista}]}   — 25 por página, SEM valor
//   GET /rhsysportaltransp/api/relacaoservidores/folha?matricula=&referencia=
//        → os VALORES daquele servidor (`detalhesValorColuna`: rendimentos, deduções, líquido)
//
// 🚨 A API EXIGE SESSÃO: chamada direta por HTTP devolve **HTTP 440 (login time-out)**. A saída é chamar de
// DENTRO da página com Playwright (`page.evaluate` + fetch relativo), herdando os cookies — mais barato que
// tentar reproduzir o handshake.
//
// ⚠️ O valor sai POR SERVIDOR (1 requisição cada): com COM_VALOR=1 são `count` requisições. Sem ele, coleta só o
// nominal (nome+cargo+secretaria+vínculo) e marca `ok_sem_valor_individual`, como o Digifred.
//
// Uso: HOST=transparencia.riogrande.rs.gov.br IBGE=4315602 MUN="Rio Grande" COM_VALOR=1 node scripts/ingest_folha_admrh.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const HOST = process.env.HOST || "transparencia.riogrande.rs.gov.br";
const MUN = process.env.MUN || "Rio Grande";
const UF = process.env.UF_SIGLA || "RS";
// 🚨 O CÓDIGO IBGE NUNCA VEM DIGITADO. Eu já errei três vezes nesta campanha teclando código de memória —
// 4312955 é NOVA BOA VISTA, e a folha de Não-Me-Toque foi gravada no vizinho. O cadastro é a única fonte:
// passa-se o NOME, o script resolve o código. Só cai no valor de IBGE= se o nome não existir no cadastro.
const IBGE = await (async () => {
  const r = (await q(`select cod_ibge from municipios_br where uf=$1 and lower(nome)=lower($2) limit 1`, [UF, MUN])).rows[0];
  if (r) return r.cod_ibge;
  if (process.env.IBGE) { console.log(`⚠️  "${MUN}" não está no cadastro de ${UF}; usando IBGE=${process.env.IBGE} informado à mão`); return process.env.IBGE; }
  throw new Error(`município "${MUN}" não encontrado em municipios_br (${UF}) e nenhum IBGE informado`);
})();
const COM_VALOR = process.env.COM_VALOR === "1";
const MAX_FICHAS = Number(process.env.MAX_FICHAS || 99999);

await q(`create table if not exists folha_servidores_admrh (
  cod_ibge text, municipio text, uf text, competencia text,
  matricula text, nome text, cargo text, secretaria text, vinculo text, admissao text,
  padrao text, horas_mensais numeric, inativo boolean, pensionista boolean,
  bruto numeric, deducoes numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_admrh_mun on folha_servidores_admrh (cod_ibge, competencia)`);
await q(`create table if not exists folha_admrh_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  servidores int, com_valor int, declarado int, situacao text, detalhe text, em timestamptz default now()
)`);

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" })).newPage();
const marca = (situacao, detalhe, competencia = null, servidores = 0, comValor = 0, declarado = 0) =>
  q(`insert into folha_admrh_coleta (cod_ibge,municipio,uf,host,competencia,servidores,com_valor,declarado,situacao,detalhe,em)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     on conflict (cod_ibge) do update set host=excluded.host, competencia=excluded.competencia,
       servidores=excluded.servidores, com_valor=excluded.com_valor, declarado=excluded.declarado,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
    [IBGE, MUN, UF, HOST, competencia, servidores, comValor, declarado, situacao, detalhe]);

try {
  // ⚠️ nem todo portal ADMRH tem TLS: `rh.imbe.rs.gov.br` só responde em http e o https devolvia a página de erro
  // do servidor — que o coletor lia como "não é JSON". ESQUEMA configurável, default https.
  const ESQ = process.env.ESQUEMA || "https";
  await page.goto(`${ESQ}://${HOST}/rhsysportaltransp/#!/relacaoservidoresmes`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(6000);

  // competência MAIS CHEIA entre as 3 mais recentes ([[pnigp-competencia-mais-cheia-nao-a-recente]])
  const comps = await page.evaluate(async () => {
    const r = await fetch("/rhsysportaltransp/api/lov/referencia?busca=&page=1");
    const j = await r.json();
    return (j.dados || []).slice(0, 3).map((x) => ({ codigo: x.codigo, descricao: x.descricao }));
  });
  if (!comps.length) { await marca("erro", "API de referência vazia"); throw new Error("sem competências"); }
  let melhor = null;
  for (const c of comps) {
    const n = await page.evaluate(async (cod) => {
      const r = await fetch(`/rhsysportaltransp/api/relacaoservidores?page=1&referencia=${encodeURIComponent(cod)}`);
      const j = await r.json();
      return j.count || 0;
    }, c.codigo);
    if (n && (!melhor || n > melhor.n)) melhor = { ...c, n };
  }
  if (!melhor) { await marca("vazio", "nenhuma competência com servidores"); throw new Error("vazio"); }
  const competencia = melhor.descricao.replace(/(\d{2})\/(\d{4})/, "$2$1");
  console.log(`[admrh] ${MUN}: ${melhor.n} servidores em ${melhor.descricao}`);

  // pagina a relação inteira
  const todos = await page.evaluate(async ({ cod, total }) => {
    const out = [];
    const paginas = Math.ceil(total / 25);
    for (let p = 1; p <= paginas; p++) {
      const r = await fetch(`/rhsysportaltransp/api/relacaoservidores?page=${p}&referencia=${encodeURIComponent(cod)}`);
      const j = await r.json();
      for (const d of j.dados || []) out.push(d);
    }
    return out;
  }, { cod: melhor.codigo, total: melhor.n });
  console.log(`[admrh] ${todos.length} servidores lidos`);

  // valores por servidor (1 requisição cada) — opcional
  const valores = new Map();
  if (COM_VALOR) {
    const mats = todos.slice(0, MAX_FICHAS).map((x) => x.matricula);
    const LOTE = 200;
    for (let i = 0; i < mats.length; i += LOTE) {
      const parte = mats.slice(i, i + LOTE);
      const res = await page.evaluate(async ({ cod, ms }) => {
        const out = {};
        for (const m of ms) {
          try {
            const r = await fetch(`/rhsysportaltransp/api/relacaoservidores/folha?matricula=${m}&referencia=${encodeURIComponent(cod)}`);
            const j = await r.json();
            const cols = j?.dados?.detalhesValorColuna || [];
            let bruto = 0, ded = 0, liq = null;
            for (const c of cols) {
              const nome = (c.colunaMviewRemuneracao || "").toLowerCase();
              if (nome.includes("liquido")) liq = c.valor;
              else if (c.sinal === "-" || nome.includes("deducoes") || nome.includes("desconto")) ded += c.valor || 0;
              else bruto += c.valor || 0;
            }
            out[m] = { bruto, ded, liq };
          } catch { /* servidor sem ficha */ }
        }
        return out;
      }, { cod: melhor.codigo, ms: parte });
      for (const [m, v] of Object.entries(res)) valores.set(String(m), v);
      process.stdout.write(`   valores: ${valores.size}/${mats.length}\r`);
    }
    console.log("");
  }

  const regs = todos.map((s) => {
    const v = valores.get(String(s.matricula)) || {};
    return {
      cod_ibge: IBGE, municipio: MUN, uf: UF, competencia,
      matricula: String(s.matricula ?? ""), nome: (s.nmfuncionario || "").trim(),
      cargo: (s.nmcargo || "").trim(), secretaria: (s.nmorgao || "").trim(), vinculo: (s.nmvinculo || "").trim(),
      admissao: s.admissao ?? null, padrao: s.padrao ?? null, horas_mensais: s.hrmensais ?? null,
      inativo: !!s.inativo, pensionista: !!s.pensionista,
      bruto: v.bruto ?? null, deducoes: v.ded ?? null, liquido: v.liq ?? null,
      _hash: crypto.createHash("md5").update([IBGE, competencia, s.matricula, s.nmfuncionario].join("|")).digest("hex"),
    };
  }).filter((x) => x.nome);

  const p = [...new Map(regs.map((x) => [x._hash, x])).values()];
  await q(`delete from folha_servidores_admrh where cod_ibge=$1 and competencia=$2`, [IBGE, competencia]);
  const LOTE = 1000;
  for (let i = 0; i < p.length; i += LOTE) {
    const parte = p.slice(i, i + LOTE);
    const c = (f) => parte.map((x) => x[f]);
    await q(`insert into folha_servidores_admrh
      (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,secretaria,vinculo,admissao,padrao,horas_mensais,
       inativo,pensionista,bruto,deducoes,liquido,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::numeric[],$13::boolean[],$14::boolean[],$15::numeric[],
        $16::numeric[],$17::numeric[],$18::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("matricula"), c("nome"), c("cargo"),
       c("secretaria"), c("vinculo"), c("admissao"), c("padrao"), c("horas_mensais"), c("inativo"),
       c("pensionista"), c("bruto"), c("deducoes"), c("liquido"), c("_hash")]);
  }
  const comValor = p.filter((x) => (x.bruto ?? 0) > 0).length;
  await marca(comValor ? "ok" : "ok_sem_valor_individual",
    `coletado ${p.length} · declarado ${melhor.n}` + (comValor ? ` · ${comValor} com valor` : " · valor exige 1 requisição por servidor"),
    competencia, p.length, comValor, melhor.n);
  console.log(`[admrh] ${MUN}: ${p.length} gravados · ${comValor} com valor · declarado ${melhor.n}`);
} catch (e) {
  await marca("erro", String(e.message).slice(0, 150));
  console.error("[admrh] erro:", e.message.slice(0, 120));
} finally { await browser.close(); await db.end(); }
