// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_canoas.mjs — folha nominal de CANOAS/RS (portal GeneXus da Ábaco, `sistemas.canoas.rs.gov.br`).
//
// 🚨 CORRIGE UM ERRO MEU. Eu havia registrado Canoas como "não publica": o menu "Servidores" tem CARGOS E SALÁRIOS
// e QUANTITATIVO DE CARGOS, que são tabela de vencimentos por cargo, sem nome. Só que o item **PESSOAL** — o
// primeiro da barra, o único sem `?N` na URL — traz a folha NOMINAL inteira:
//   Ano · Mês · Pessoa Id · Nome · Cargo · Tipo · Lotação · Admissão · Exoneração · Carga Horária · Função ·
//   Vencimento Básico · Remuneração Bruta · Remuneração Líquida
// Olhar os itens vizinhos e concluir sobre o município é o mesmo erro de [[pnigp-tela-certa-nao-e-so-ter-tabela]].
//
// A MECÂNICA (GeneXus, estado na SESSÃO — não dá para montar URL):
//   select W0045vANOPESQUISA · W0045vMES · W0045vSECRETARIAID · W0045vCARGOTIPO
//   🚨 clicar em #W0045BTNBUSCAR1 ("Buscar") — SEM ISSO O FILTRO NÃO É APLICADO
//   select W0045vNREGISTROSPORPAGINA (1..30)  ⭐ subir para 30 corta as requisições por três
//   select W0045vPAGINA (1..N)                 → cada troca recarrega a grade
//
// 🚨 O DEFEITO QUE ISTO CORRIGE: trocar o `<select>` de mês NÃO refaz a consulta. A grade continua na competência
// default (JANEIRO do ano corrente) e o total de páginas fica idêntico — 430 em 2026-01, 2026-07, 2026-12 e até
// 2025-06. Eu li esse "430 em todas" como "todas as competências têm o mesmo tamanho" e gravei janeiro rotulado
// como julho. O sinal de que o filtro não pegou estava na própria grade, que traz as colunas `Remuneracao Ano` e
// `Remuneracao Mes`: **conferir a competência PELO DADO, não pelo que eu selecionei** — é a mesma lição de
// [[pnigp-sonda-folha-prova-e-a-coleta]], aplicada ao filtro.
//
// Uso: node scripts/ingest_folha_canoas.mjs        · ANO= · MES= · MESES_TESTE=
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const URL_BASE = "http://sistemas.canoas.rs.gov.br/transparencia/servlet/wmservidores";
const MESES_TESTE = Number(process.env.MESES_TESTE || 4);
const POR_PAGINA = String(process.env.POR_PAGINA || 30);

await q(`create table if not exists folha_servidores_canoas (
  cod_ibge text, municipio text, uf text, competencia text,
  pessoa_id text, nome text, cargo text, tipo text, lotacao text, admissao text, exoneracao text,
  carga_horaria text, funcao text, vencimento_basico numeric, bruto numeric, liquido numeric,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_canoas_mun on folha_servidores_canoas (cod_ibge, competencia)`);
await q(`create table if not exists folha_canoas_coleta (
  cod_ibge text primary key, municipio text, uf text, competencia text,
  servidores int, com_valor int, paginas int, situacao text, detalhe text, em timestamptz default now()
)`);

const money = (s) => {
  const t = String(s ?? "").replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};
// 🚨 código IBGE do cadastro, nunca digitado ([[pnigp-nunca-digitar-codigo-ibge]])
const mun = (await q(`select cod_ibge, nome, uf from municipios_br where uf='RS' and nome='Canoas' limit 1`)).rows[0];
if (!mun) throw new Error("Canoas não está em municipios_br");

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();

// a grade é a tabela cujas linhas têm muitas células E dinheiro — o GeneXus não dá um id estável
async function raspa() {
  return page.evaluate(() => {
    const EH_DINHEIRO = /^\d{1,3}(\.\d{3})*,\d{2}$/;
    for (const t of document.querySelectorAll("table")) {
      const trs = [...t.querySelectorAll("tr")];
      const linhas = trs.map((tr) => [...tr.querySelectorAll("td")].map((c) => (c.innerText || "").replace(/\s+/g, " ").trim()))
        .filter((c) => c.length >= 12 && c.some((x) => EH_DINHEIRO.test(x)));
      if (linhas.length) return linhas;
    }
    return [];
  });
}
async function totalPaginas() {
  return page.evaluate(() => document.querySelector("#W0045vPAGINA")?.options.length || 0);
}
// aplica o filtro de fato e devolve a competência que a GRADE declara (colunas 0 e 1)
async function buscaCompetencia(ano, mes) {
  await page.selectOption("#W0045vANOPESQUISA", String(ano));
  await page.waitForTimeout(1200);
  await page.selectOption("#W0045vMES", String(mes));
  await page.waitForTimeout(1200);
  await page.click("#W0045BTNBUSCAR1");
  await page.waitForTimeout(4000);
  const linhas = await raspa();
  const paginas = await totalPaginas();
  const declarada = linhas.length ? `${linhas[0][0]}${String(linhas[0][1]).padStart(2, "0")}` : null;
  return { paginas, declarada, pedida: `${ano}${String(mes).padStart(2, "0")}` };
}
async function vaiPara(pag) {
  await page.selectOption("#W0045vPAGINA", String(pag));
  await page.waitForTimeout(1600);
}

try {
  await page.goto(URL_BASE, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(3500);

  // ⭐ competência MAIS CHEIA entre as recentes ([[pnigp-competencia-mais-cheia-nao-a-recente]]): aqui a tela abre
  // em JANEIRO do ano corrente, que é justamente uma das mais magras
  const hoje = new Date();
  const candidatas = [];
  for (let k = 1; k <= MESES_TESTE; k++) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 1));
    candidatas.push({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 });
  }
  if (process.env.ANO && process.env.MES) candidatas.length = 0, candidatas.push({ ano: +process.env.ANO, mes: +process.env.MES });

  let melhor = null;
  for (const c of candidatas) {
    const r = await buscaCompetencia(c.ano, c.mes);
    const bate = r.declarada === r.pedida;
    console.log(`   ${r.pedida}: ${r.paginas} páginas · a grade declara ${r.declarada}${bate ? "" : "  ⚠️ NÃO É A PEDIDA"}`);
    // 🚨 só conta como candidata a competência que a GRADE confirma ser a pedida
    if (bate && (!melhor || r.paginas > melhor.p)) melhor = { ...c, p: r.paginas };
  }
  if (!melhor?.p) throw new Error("nenhuma competência foi confirmada pela grade — o filtro não está sendo aplicado");
  console.log(`   ⭐ escolhida ${melhor.ano}-${String(melhor.mes).padStart(2, "0")} com ${melhor.p} páginas`);

  const conf = await buscaCompetencia(melhor.ano, melhor.mes);
  if (conf.declarada !== conf.pedida) throw new Error(`a grade voltou em ${conf.declarada}, não em ${conf.pedida}`);
  await page.selectOption("#W0045vNREGISTROSPORPAGINA", POR_PAGINA);
  await page.waitForTimeout(3500);

  const paginas = await totalPaginas();
  const competencia = `${melhor.ano}${String(melhor.mes).padStart(2, "0")}`;
  console.log(`   ${paginas} páginas com ${POR_PAGINA} por página`);

  let gravados = 0, comValor = 0;
  const vistos = new Set();
  for (let p = 1; p <= paginas; p++) {
    if (p > 1) await vaiPara(p);
    let linhas = await raspa();
    // uma releitura quando a grade ainda não trocou (o GeneXus repinta em duas etapas)
    if (!linhas.length) { await page.waitForTimeout(2500); linhas = await raspa(); }
    for (const l of linhas) {
      const [ano, mes, pessoaId, nome, cargo, tipo, lotacao, admissao, exoneracao, carga, funcao, vencimento, bruto, liquido] = l;
      if (!nome) continue;
      // ⭐ a competência gravada é a que a LINHA declara, não a que eu pedi — se o filtro escapar de novo, o dado
      // sai rotulado certo em vez de sair com o mês errado
      const compLinha = /^\d{4}$/.test(String(ano)) && /^\d{1,2}$/.test(String(mes))
        ? `${ano}${String(mes).padStart(2, "0")}` : competencia;
      const _hash = crypto.createHash("sha1")
        .update([mun.cod_ibge, compLinha, pessoaId, nome, cargo, lotacao].join("|")).digest("hex");
      if (vistos.has(_hash)) continue;      // o paginador às vezes devolve a mesma página duas vezes
      vistos.add(_hash);
      const b = money(bruto);
      await q(`insert into folha_servidores_canoas
        (cod_ibge, municipio, uf, competencia, pessoa_id, nome, cargo, tipo, lotacao, admissao, exoneracao,
         carga_horaria, funcao, vencimento_basico, bruto, liquido, _hash)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido,
          vencimento_basico=excluded.vencimento_basico, _coletado_em=now()`,
        [mun.cod_ibge, mun.nome, mun.uf, compLinha, pessoaId, nome, cargo, tipo, lotacao, admissao, exoneracao,
         carga, funcao, money(vencimento), b, money(liquido), _hash]);
      gravados++; if (b > 0) comValor++;
    }
    if (p % 20 === 0 || p === paginas) process.stdout.write(`   página ${p}/${paginas} · ${gravados} gravados\r`);
  }
  console.log(`\n[canoas] ${gravados} servidores · ${comValor} com valor · ${paginas} páginas · ${competencia}`);
  await q(`insert into folha_canoas_coleta
    (cod_ibge, municipio, uf, competencia, servidores, com_valor, paginas, situacao, detalhe, em)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
    on conflict (cod_ibge) do update set competencia=excluded.competencia, servidores=excluded.servidores,
      com_valor=excluded.com_valor, paginas=excluded.paginas, situacao=excluded.situacao,
      detalhe=excluded.detalhe, em=now()`,
    [mun.cod_ibge, mun.nome, mun.uf, competencia, gravados, comValor, paginas,
     gravados ? "ok" : "vazio", `item PESSOAL do portal GeneXus/Ábaco; ${POR_PAGINA} por página`]);
} finally {
  await browser.close();
  await db.end();
}
