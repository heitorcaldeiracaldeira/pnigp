// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_pjf.mjs — folha de JUIZ DE FORA (26.212 vínculos na RAIS), o maior município de MG sem folha.
//
// 🚨 O Radar classifica JF como "betha", mas o portal Betha dela é `login.betha.cloud` — tela de login. A folha
// pública mora em portal PRÓPRIO: `www.pjf.mg.gov.br/transparencia/servidores/`, com um órgão por vez
// (Administração Direta + 9 autarquias/empresas). Ver [[pnigp-rotulo-erp-nao-e-o-portal-da-folha]].
//
// O caminho (não há API; o POST cru NÃO funciona — a listagem exige a sessão do navegador):
//   pesquisar.php?orgao_pesq={ORGAO}  → select competencia_pesq + secretaria_pesq → botão sub_pesq
//   → resultado.php: tabela de 32 por página (Matrícula·Nome·Cargo·Função·Carga·Admissão·Exoneração·Vínculo·
//     **Lotação**) + link "Próxima >>"
//   → detalhado.php?id=N: **Remuneração Bruta** e **Remuneração Líquida** (o salário NÃO está na listagem)
// O detalhe é buscado por fetch INTERNO da página (mesma sessão) — molde do Memory ([[pnigp-memory-ilai-folha]]).
//
// Uso: node scripts/ingest_folha_pjf.mjs   [ORGAO=PJF] [COMPETENCIA=072026] [SODETALHE=0]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const IBGE = "3136702", MUN = "Juiz de Fora", UF = "MG";
const BASE = "https://www.pjf.mg.gov.br/transparencia/servidores/";
const SO_ORGAO = process.env.ORGAO || null;
const COMPETENCIA = process.env.COMPETENCIA || null;
const SEM_DETALHE = process.env.SODETALHE === "0";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));

await q(`create table if not exists folha_servidores_pjf (
  cod_ibge text, municipio text, uf text, orgao text, competencia text,
  matricula text, nome text, cargo text, funcao text, carga_horaria text,
  data_admissao text, data_exoneracao text, vinculo text, secretaria text,
  bruto numeric, liquido numeric, id_portal text,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_pjf_comp on folha_servidores_pjf (cod_ibge, competencia)`);
await q(`create table if not exists folha_pjf_coleta (
  orgao text, competencia text, linhas int, situacao text, detalhe text, em timestamptz default now(),
  primary key (orgao, competencia))`);

// os 10 órgãos que o portal expõe — vêm do menu SERVIDORES da transparência
const ORGAOS = ["PJF", "CESAMA", "DEMLURB", "EMCASA", "EMPAV", "EMTECJF", "FUNALFA", "JF PREV", "MAPRO", "PROCON"];

const num = (s) => {
  if (!s) return null;
  const m = String(s).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(m);
  return Number.isFinite(v) ? v : null;
};

const LOTE = 500;
async function grava(regs) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += LOTE) {
    const f = arr.slice(i, i + LOTE);
    const col = (k) => f.map((r) => r[k]);
    await q(`insert into folha_servidores_pjf
      (cod_ibge,municipio,uf,orgao,competencia,matricula,nome,cargo,funcao,carga_horaria,
       data_admissao,data_exoneracao,vinculo,secretaria,bruto,liquido,id_portal,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::text[],$15::numeric[],$16::numeric[],
        $17::text[],$18::text[])
      on conflict (_hash) do update set
        bruto = coalesce(excluded.bruto, folha_servidores_pjf.bruto),
        liquido = coalesce(excluded.liquido, folha_servidores_pjf.liquido)`,
      [col("cod_ibge"), col("municipio"), col("uf"), col("orgao"), col("competencia"), col("matricula"),
       col("nome"), col("cargo"), col("funcao"), col("carga_horaria"), col("data_admissao"), col("data_exoneracao"),
       col("vinculo"), col("secretaria"), col("bruto"), col("liquido"), col("id_portal"), col("_hash")]);
  }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" });
const page = await ctx.newPage();
let totalGeral = 0;

for (const orgao of (SO_ORGAO ? [SO_ORGAO] : ORGAOS)) {
  try {
    await page.goto(`${BASE}pesquisar.php?orgao_pesq=${encodeURIComponent(orgao)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);
    const comps = await page.$$eval("select[name=competencia_pesq] option", (os) => os.map((o) => o.value).filter(Boolean));
    if (!comps.length) { console.log(`  ✖ ${orgao}: sem competência no formulário`); continue; }
    const comp = COMPETENCIA && comps.includes(COMPETENCIA) ? COMPETENCIA : comps[0];

    // 🚨 A busca SEM filtro de secretaria não devolve o órgão inteiro: a Administração Direta parou em 651 de
    // ~20 mil. É preciso iterar SECRETARIA a SECRETARIA (o select traz 26 na PJF) e somar.
    const secretarias = await page.$$eval("select[name=secretaria_pesq] option", (os) => os.map((o) => o.value));
    const listaSec = secretarias.filter((s) => s !== "");
    const linhas = [];
    // 🚨 uma secretaria que trava NÃO pode derrubar as outras 24: numa passada o portal demorou no clique de
    // pesquisa e o órgão inteiro saiu com zero, perdendo o que já tinha sido listado. Erro isolado por secretaria.
    for (const sec of (listaSec.length ? listaSec : [""])) {
    try {
    await page.goto(`${BASE}pesquisar.php?orgao_pesq=${encodeURIComponent(orgao)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(600);
    await page.selectOption("select[name=competencia_pesq]", comp).catch(() => {});
    if (sec) await page.selectOption("select[name=secretaria_pesq]", sec).catch(() => {});
    await Promise.all([page.waitForNavigation({ timeout: 90000 }).catch(() => {}),
                       page.click("button[name=sub_pesq]", { timeout: 60000 })]);
    await page.waitForTimeout(1200);

    // ── varre todas as páginas da listagem ─────────────────────────────────────────────────────────────────────
    for (let pag = 1; pag <= 2000; pag++) {
      const bloco = await page.evaluate(() => {
        const t = [...document.querySelectorAll("table")].find((x) => x.rows.length > 3 &&
          /matr[íi]cula/i.test(x.rows[0].innerText));
        if (!t) return { regs: [], temProxima: false };
        const regs = [...t.rows].slice(1).map((r) => {
          const c = [...r.cells].map((x) => x.textContent.trim());
          const a = r.querySelector("a[href*='detalhado.php']");
          return { matricula: c[0], nome: c[1], cargo: c[2], funcao: c[3], carga: c[4], admissao: c[5],
                   exoneracao: c[6], vinculo: c[7], lotacao: c[8],
                   id: a ? (a.href.match(/id=(\d+)/) || [])[1] : null };
        }).filter((r) => r.matricula || r.nome);
        const prox = [...document.querySelectorAll("a")].find((x) => /pr[óo]xima/i.test(x.textContent));
        return { regs, temProxima: !!prox };
      });
      linhas.push(...bloco.regs);
      if (!bloco.temProxima) break;
      // 🚨 clicar por evaluate destrói o contexto no meio da navegação ("Execution context was destroyed").
      // Clicar pelo locator e esperar a navegação junto é o que sobrevive à paginação longa.
      const link = page.locator("a", { hasText: /pr[óo]xima/i }).first();
      if (!(await link.count())) break;
      await Promise.all([page.waitForNavigation({ timeout: 60000 }).catch(() => {}), link.click({ timeout: 30000 }).catch(() => {})]);
      await page.waitForTimeout(500);
      if (pag % 25 === 0) console.log(`    ${orgao}/${sec || "todas"}: ${linhas.length} linhas (pág. ${pag})`);
    }
    // 🚨 O `detalhado.php?id=` só responde com o RESULTADO DA BUSCA VIVO na sessão: buscar a remuneração depois
    // de trocar de secretaria devolve página sem dado, e a folha sai com 2.828 valores em 12.328 pessoas.
    // Por isso o detalhe é lido AQUI, ainda dentro da secretaria que acabou de ser listada.
    if (!SEM_DETALHE) await remuneracao(linhas.filter((l) => l.id && l.bruto === undefined));
    } catch (e) {
      console.log(`    ⚠ ${orgao}/${sec}: ${String(e.message).slice(0, 60)} — segue para a próxima secretaria`);
    }
    }
    console.log(`  ${orgao} ${comp}: ${linhas.length} servidores listados`);
    if (!linhas.length) { await q(`insert into folha_pjf_coleta values ($1,$2,0,'vazio','listagem sem linhas',now())
      on conflict (orgao,competencia) do update set linhas=0, situacao='vazio', em=now()`, [orgao, comp]); continue; }

    // ── remuneração: só existe no detalhe; fetch INTERNO em lotes, na sessão do navegador ──────────────────────
    async function remuneracao(pendentes) {
      const ids = pendentes.filter((l) => l.id).map((l) => l.id);
      if (!ids.length) return;
      const CONC = 6;
      for (let i = 0; i < ids.length; i += CONC * 20) {
        const fatia = ids.slice(i, i + CONC * 20);
        const vals = await page.evaluate(async ({ fatia, CONC, BASE }) => {
          const out = {};
          const trab = async (lista) => { for (const id of lista) {
            try {
              const r = await fetch(`${BASE}detalhado.php?page=1&id=${id}`, { credentials: "include" });
              // 🚨 a página é ISO-8859-1: `r.text()` a lê como UTF-8 e o rótulo chega como
              // "Remunera&ccedil;&atilde;o Bruta" — o regex não casava e TODA a folha saía sem salário.
              // Decodificar os bytes em latin1 e deixar o DOMParser resolver as entidades.
              const html = new TextDecoder("iso-8859-1").decode(await r.arrayBuffer());
              const doc = new DOMParser().parseFromString(html, "text/html");
              const t = (doc.body.textContent || "").replace(/\s+/g, " ");
              // 🚨 O HTML cru NÃO tem os rótulos que a tela mostra ("Remuneração Bruta: R$ x") — esses são
              // montados por JS. No documento estão os rótulos do quadro de impressão: TOTAL BRUTO e
              // REMUNERAÇÃO LÍQUIDA(R$). Confirmado que batem com a tela (15.759,72 / 11.089,96).
              // Usar o TOTAL declarado e nunca somar as rubricas ([[pnigp-portaltp-epublica-folha]]).
              const b = t.match(/TOTAL BRUTO\s*([\d.,]+)/i) || t.match(/Remunera[çc][ãa]o Bruta:?\s*R\$\s*([\d.,]+)/i);
              const l = t.match(/REMUNERA[ÇC][ÃA]O L[ÍI]QUIDA\s*\(R\$\)\s*([\d.,]+)/i) || t.match(/Remunera[çc][ãa]o L[íi]quida:?\s*R\$\s*([\d.,]+)/i);
              out[id] = { b: b ? b[1] : null, l: l ? l[1] : null };
            } catch { out[id] = null; }
          } };
          const partes = Array.from({ length: CONC }, (_, k) => fatia.filter((_, j) => j % CONC === k));
          await Promise.all(partes.map(trab));
          return out;
        }, { fatia, CONC, BASE });
        for (const l of pendentes) if (l.id && vals[l.id]) { l.bruto = vals[l.id].b; l.liquido = vals[l.id].l; }
        console.log(`    ${orgao}: remuneração ${Math.min(i + fatia.length, ids.length)}/${ids.length}`);
      }
    }

    // 🚨 O PORTAL USA `MMAAAA` ("072026") e o coletor gravava o valor CRU. Isso se disfarça de `AAAAMM`: um
    // verificador ingênuo lê ano=0720 e mês=26 sem estranhar o tamanho. Converter na gravação e manter `comp`
    // como veio para alimentar o formulário ([[pnigp-filtro-que-nao-aplica-confira-pelo-dado]]).
    const mmaaaa = String(comp).match(/^(\d{2})(\d{4})$/);
    const competencia = mmaaaa && +mmaaaa[1] >= 1 && +mmaaaa[1] <= 12 ? `${mmaaaa[2]}${mmaaaa[1]}` : String(comp);
    const regs = linhas.map((l) => ({
      cod_ibge: IBGE, municipio: MUN, uf: UF, orgao, competencia,
      matricula: l.matricula || null, nome: l.nome || null, cargo: l.cargo || null, funcao: l.funcao || null,
      carga_horaria: l.carga || null, data_admissao: l.admissao || null, data_exoneracao: l.exoneracao || null,
      vinculo: l.vinculo || null, secretaria: l.lotacao || null,
      bruto: num(l.bruto), liquido: num(l.liquido), id_portal: l.id || null,
      _hash: crypto.createHash("md5").update([IBGE, comp, orgao, l.matricula, l.nome, l.cargo, l.id].join("¦")).digest("hex"),
    }));
    await grava(regs);
    totalGeral += regs.length;
    const comSal = regs.filter((r) => r.bruto != null).length;
    await q(`insert into folha_pjf_coleta values ($1,$2,$3,'ok',$4,now())
      on conflict (orgao,competencia) do update set linhas=excluded.linhas, situacao='ok', detalhe=excluded.detalhe, em=now()`,
      [orgao, comp, regs.length, `${comSal} com remuneração`]);
    console.log(`  ✔ ${orgao} ${comp}: ${regs.length} gravados · ${comSal} com remuneração`);
  } catch (e) {
    console.log(`  ✖ ${orgao}: ${String(e.message).slice(0, 90)}`);
    await q(`insert into folha_pjf_coleta values ($1,$2,0,'erro',$3,now())
      on conflict (orgao,competencia) do update set situacao='erro', detalhe=excluded.detalhe, em=now()`,
      [orgao, COMPETENCIA || "—", String(e.message).slice(0, 180)]);
  }
  await dorme(1500);
}

await browser.close();
console.log(`\n[pjf] ${totalGeral.toLocaleString("pt-BR")} servidores gravados`);
await db.end();
