// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_bsit.mjs — folha nominal do ERP BSIT (Gestão Pública), forte em Goiás.
//
// ⭐ POR QUE VALE: o portal entrega os CINCO campos de [[pnigp-folha-municipal-cinco-campos]] num CSV pronto —
// MATRICULA · NOME · CARGO · **LOCAL_TRABALHO (=secretaria)** · TIPO_FOLHA · TIPO_ADMISSAO · CARGA_HORARIA ·
// SALARIO · DATA_ADMISSAO · DATA_EXONERACAO. Público, sem login e sem captcha.
//
// 🚨 O `sigepnet` é só o CMS do site; o ERP é `gestaopublica.{slug}.bsit-br.com.br`
// ([[pnigp-rotulo-erp-nao-e-o-portal-da-folha]]). E o host da CÂMARA tem `camara.` no meio
// (`gestaopublica.camara.{slug}...`) — derivar sem tirar isso coleta o legislativo achando que é a prefeitura.
//
// 🚨 POR QUE PLAYWRIGHT e não HTTP: o botão "Gerar CSV" é um POST JSF que depende do RESULTADO DA BUSCA guardado
// na sessão. Reproduzi o POST exato (o ViewState é o estático `j_id1`) com cookie de sessão e o servidor devolve
// HTML, não o arquivo: a busca precisa ter sido executada ANTES, na mesma sessão. No navegador é um clique.
//
// Uso: node scripts/ingest_folha_bsit.mjs        ·  SO=Indiara para um município  ·  REF=07/2026 fixa o mês
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SO = process.env.SO || null;
const REF = process.env.REF || null;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

await q(`create table if not exists folha_servidores_bsit (
  cod_ibge text, municipio text, uf text, host text, entidade text, competencia text,
  matricula text, nome text, cargo text, departamento text, tipo_folha text, vinculo text,
  carga_horaria text, salario numeric, data_admissao text, data_exoneracao text,
  _hash text primary key, _coletado_em timestamptz default now())`);
await q(`create index if not exists ix_folha_bsit_mun on folha_servidores_bsit (cod_ibge, competencia)`);
await q(`create table if not exists folha_bsit_coleta (
  cod_ibge text primary key, municipio text, uf text, host text, competencia text,
  linhas int, situacao text, detalhe text, em timestamptz default now())`);

// ── candidatos: quem a descoberta ligou a sigepnet/bsit ────────────────────────────────────────────────────────
const slugDe = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]/g, "");

// Candidatos em duas camadas:
//  (1) quem a descoberta ligou a bsit/sigepnet;
//  (2) ⭐ TODO município de GO/TO ainda SEM FOLHA — porque o alcance do bsit é maior do que a descoberta viu.
//      Orizona provou: o `portal_real` dela aponta para NucleoGov, o `folha.php` do sigepnet é uma casca, e o
//      botão "Tabela Padrão Remuneratório" (`remuneracao.php`) redireciona para
//      `gestaopublica.orizona.bsit-br.com.br`. Sondar o host derivado custa uma requisição e a identidade é
//      confirmada pelo texto da página antes de gravar — sem isso seria [[pnigp-fila-erp-homonimo-contamina-uf]].
const UF_SONDA = (process.env.UF_SONDA || "52,17").split(",");
const candidatos = (await q(`
  with desc_ as (
    select distinct on (cod_ibge) cod_ibge, municipio, uf, url_portal_real
      from portal_real_descoberto where url_portal_real ~* 'bsit-br|sigepnet'
      order by cod_ibge, em desc),
  sem_folha as (
    select m.cod_ibge, m.nome municipio, m.uf, '' url_portal_real
      from municipios_br m
     where left(m.cod_ibge,2) = any($1)
       and not exists (select 1 from vw_folha_municipal_brasil v
                        where v.cod_ibge = m.cod_ibge and v.fonte <> 'rais'))
  select * from desc_
  union select * from sem_folha
  ${SO ? "" : ""} order by municipio`, [UF_SONDA])).rows
  .filter((c) => !SO || new RegExp(SO, "i").test(c.municipio));

const feitos = new Set((await q(`select cod_ibge from folha_bsit_coleta where situacao in ('ok','sem_dado')`)).rows.map((r) => r.cod_ibge));
const fila = candidatos.filter((c) => !feitos.has(c.cod_ibge));
console.log(`[bsit] ${candidatos.length} candidatos · ${fila.length} na fila`);

// hosts a testar: o do próprio link (se já for bsit e NÃO for da câmara) + derivações pelo nome
// ⭐ 3ª via, a que mais rende: quando o link conhecido é do CMS **sigepnet**, o host bsit está LINKADO dentro
// da página do sigepnet. Foi assim que Indiara apareceu. Sem isto, 8 dos 12 saíam como "sem_host" — o slug
// do bsit nem sempre é o nome do município ("Santa Bárbara de Goiás" → outro slug).
async function hostsDe(c) {
  const out = [];
  const m = String(c.url_portal_real).match(/gestaopublica\.(?:camara\.)?([a-z0-9.-]+)\.bsit-br\.com\.br/i);
  if (m) out.push(`gestaopublica.${m[1]}.bsit-br.com.br`);      // ⚠️ sem o `camara.`
  if (/sigepnet/i.test(c.url_portal_real)) {
    try {
      const r = await fetch(c.url_portal_real, { signal: AbortSignal.timeout(25000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" } });
      const html = await r.text();
      for (const g of html.matchAll(/gestaopublica\.(?:camara\.)?([a-z0-9.-]+)\.bsit-br\.com\.br/gi))
        out.push(`gestaopublica.${g[1]}.bsit-br.com.br`);
    } catch { /* CMS fora do ar */ }
  }
  out.push(`gestaopublica.${slugDe(c.municipio)}.bsit-br.com.br`);
  return [...new Set(out)];
}

// 🚨 A CODIFICAÇÃO DO CSV VARIA POR MUNICÍPIO — não dá para assumir uma:
//   Indiara  → bytes UTF-8 rotulados ISO-8859-1 (lê "FÃ©rias"): decodificar utf8 e reparar latin1→utf8;
//   Caturaí  → ISO-8859-1 de verdade (lê "EDUCA��O" se forçar utf8): decodificar latin1 direto.
// Assumir a primeira deixava a SECRETARIA ilegível na metade dos municípios — e secretaria é o campo que
// justifica este ERP. Decide pelo BUFFER: se o utf8 traz caractere de substituição, o arquivo é latin1.
function decodeCSV(buf) {
  const comoUtf8 = buf.toString("utf8");
  if (comoUtf8.includes("�")) return buf.toString("latin1");   // era ISO-8859-1 puro
  return comoUtf8;
}
// repara a dupla codificação linha a linha (só quando o padrão aparece)
const conserta = (s) => {
  if (!s || !/[ÃÂ][-¿]/.test(s)) return s;
  try { return Buffer.from(s, "latin1").toString("utf8"); } catch { return s; }
};
// 🚨 DOIS LAYOUTS DE CSV no mesmo ERP, e o valor vem em formatos diferentes:
//   Indiara → 10 colunas, `SALARIO` = 2478.75 (decimal de ponto, já é o PROVENTO)
//   Caturaí → 13 colunas, `SALARIO` = "R$ 1.687,62" (base) + `VALOR_PROVENTOS` = "R$ 2.700,19" (bruto)
// O parser antigo só entendia decimal de ponto e devolvia NULL para o formatado — 3 municípios entraram
// "coletados, com secretaria e sem salário" e eu quase os classifiquei como "o portal não exporta o valor".
// Era o parser. Aceita os dois: se tem vírgula decimal, ponto é separador de milhar.
const num = (v) => {
  let s = String(v ?? "").replace(/R\$/gi, "").replace(/[\s Â]/g, "").trim();
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");   // pt-BR: 1.687,62
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function parseCSV(txt) {
  const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const cab = linhas[0].split(",").map((h) => h.trim().toUpperCase());
  // 🚨 O NOME DA COLUNA DE VALOR VARIA ENTRE INSTALAÇÕES. Fixar "SALARIO" fazia 3 dos 5 municípios entrarem
  // com salário NULO **em silêncio** — coletado, publicado e inútil, que é o pior desfecho.
  // ⚠️ ORDEM IMPORTA: `VALOR_PROVENTOS` é o BRUTO; `SALARIO`, no layout de 13 colunas, é só o vencimento BASE.
  // Preferir o bruto e NUNCA o `VALOR_LIQUIDO`, que já vem descontado ([[pnigp-view-folha-nao-enxerga-coletores]]).
  const COL_SALARIO = ["VALOR_PROVENTOS", "PROVENTOS", "SALARIO", "SALÁRIO", "REMUNERACAO", "VENCIMENTO"].find((c) => cab.includes(c));
  if (!COL_SALARIO) console.log(`    ⚠ CSV sem coluna de salário reconhecida: ${cab.join("|")}`);
  const idx = (n) => cab.indexOf(n);
  const out = [];
  for (const l of linhas.slice(1)) {
    // campos podem conter vírgula dentro de aspas
    const cols = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((x) => x.replace(/,$/, "").replace(/^"|"$/g, "").trim()) || [];
    if (cols.length < cab.length - 1) continue;
    const g = (n) => conserta(cols[idx(n)] ?? "");
    if (!g("NOME")) continue;
    out.push({
      matricula: g("MATRICULA"), nome: g("NOME"), cargo: g("CARGO"), departamento: g("LOCAL_TRABALHO"),
      tipo_folha: g("TIPO_FOLHA"), vinculo: g("TIPO_ADMISSAO"), carga_horaria: g("CARGA_HORARIA"),
      salario: COL_SALARIO ? num(cols[idx(COL_SALARIO)]) : null, data_admissao: g("DATA_ADMISSAO"), data_exoneracao: g("DATA_EXONERACAO_INATIVACAO"),
    });
  }
  return out;
}

async function grava(p, entidade, comp, regs) {
  const LOTE = 800;
  for (let i = 0; i < regs.length; i += LOTE) {
    const parte = regs.slice(i, i + LOTE);
    const c = (f) => parte.map((x) => x[f]);
    await q(`insert into folha_servidores_bsit
      (cod_ibge,municipio,uf,host,entidade,competencia,matricula,nome,cargo,departamento,tipo_folha,vinculo,
       carga_horaria,salario,data_admissao,data_exoneracao,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::text[],$12::text[],$13::text[],$14::numeric[],$15::text[],$16::text[],$17::text[])
      on conflict (_hash) do nothing`,
      [parte.map(() => p.cod_ibge), parte.map(() => p.municipio), parte.map(() => p.uf), parte.map(() => p.host),
       parte.map(() => entidade), parte.map(() => comp), c("matricula"), c("nome"), c("cargo"), c("departamento"),
       c("tipo_folha"), c("vinculo"), c("carga_horaria"), c("salario"), c("data_admissao"), c("data_exoneracao"),
       parte.map((r) => crypto.createHash("md5")
         .update([p.cod_ibge, entidade, comp, r.matricula, r.nome, r.cargo, r.tipo_folha, r.salario].join("¦")).digest("hex"))]);
  }
}

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let ok = 0, semDado = 0, falhas = 0, total = 0;

for (let i = 0; i < fila.length; i++) {
  const c = fila[i];
  const marca = (situacao, detalhe, host = null, comp = null, linhas = 0) =>
    q(`insert into folha_bsit_coleta (cod_ibge,municipio,uf,host,competencia,linhas,situacao,detalhe,em)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge) do update set
       host=excluded.host, competencia=excluded.competencia, linhas=excluded.linhas,
       situacao=excluded.situacao, detalhe=excluded.detalhe, em=now()`,
      [c.cod_ibge, c.municipio, c.uf, host, comp, linhas, situacao, detalhe]);

  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  try {
    let host = null;
    const hosts = await hostsDe(c);
    for (const h of hosts) {
      try {
        const r = await page.goto(`http://${h}/portal/employee-transparency.jsf`, { waitUntil: "domcontentloaded", timeout: 45000 });
        if (r && r.ok()) { host = h; break; }
      } catch { /* host não existe */ }
    }
    if (!host) { await marca("sem_host", `nenhum host bsit respondeu (${hosts.join(", ")})`); falhas++; continue; }

    // 🚨 CONFIRMAÇÃO DE IDENTIDADE: o host derivado do NOME pode ser de homônimo de outro estado
    // ([[pnigp-fila-erp-homonimo-contamina-uf]]). A página traz o nome da entidade no topo.
    const titulo = (await page.evaluate(() => document.body.innerText.slice(0, 200).replace(/\s+/g, " "))) || "";
    if (!titulo.toUpperCase().includes(slugDe(c.municipio).toUpperCase().slice(0, 6))
        && !slugDe(titulo).includes(slugDe(c.municipio))) {
      await marca("host_de_outro_ente", `a página diz "${titulo.slice(0, 70)}"`, host); falhas++; continue;
    }

    // instituições: pega todas MENOS a câmara (escopo executivo + indireta, decisão do Heitor de 16/ago)
    const insts = await page.evaluate(() => Array.from(
      document.querySelectorAll('select[id$="institutions"] option'))
      .map((o) => ({ v: o.value, t: o.textContent.trim() }))
      .filter((o) => o.v && !/^selecione/i.test(o.t)));
    const alvos = insts.filter((o) => !/c[âa]mara/i.test(o.t));
    if (!alvos.length) { await marca("sem_instituicao", "nenhuma instituição não-câmara na tela", host); falhas++; continue; }

    let comp = null, linhasMun = 0;
    for (const inst of alvos) {
      try {
        await page.selectOption('select[id$="institutions"]', inst.v);
        await dorme(800);
        if (REF) await page.fill('input[id$="reference"]', REF).catch(() => {});
        comp = comp || await page.inputValue('input[id$="reference"]').catch(() => null);
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 90000 }),
          page.getByRole("button", { name: /Gerar CSV/i }).click(),
        ]);
        const stream = await download.createReadStream();
        const buf = await new Promise((res, rej) => { const cs = []; stream.on("data", (d) => cs.push(d)); stream.on("end", () => res(Buffer.concat(cs))); stream.on("error", rej); });
        const regs = parseCSV(decodeCSV(buf));
        if (regs.length) { await grava({ ...c, host }, inst.t, (comp || "").replace("/", "").replace(/^(\d{2})(\d{4})$/, "$2$1"), regs); linhasMun += regs.length; }
      } catch (e) { /* uma instituição sem folha não derruba o município */ }
      await dorme(400);
    }

    if (linhasMun) { await marca("ok", `${alvos.length} instituições`, host, comp, linhasMun); ok++; total += linhasMun;
      console.log(`  [${i + 1}/${fila.length}] ${c.municipio}: ${linhasMun} servidores (${comp}, ${alvos.length} ent.)`); }
    else { await marca("sem_dado", "nenhuma instituição devolveu linhas", host, comp); semDado++;
      console.log(`  ○ [${i + 1}/${fila.length}] ${c.municipio}: sem linhas`); }
  } catch (e) {
    falhas++; await marca("erro", String(e.message).slice(0, 150));
    console.log(`  ✖ [${i + 1}/${fila.length}] ${c.municipio}: ${String(e.message).slice(0, 70)}`);
  } finally { try { await ctx.close(); } catch {} }
}

try { await browser.close(); } catch {}
console.log(`\n[bsit] ${total.toLocaleString("pt-BR")} servidores · ${ok} ok · ${semDado} sem dado · ${falhas} falhas`);
console.table((await q(`select count(distinct cod_ibge)::int municipios, count(*)::int linhas,
  count(*) filter (where departamento is not null and departamento<>'')::int com_secretaria,
  count(*) filter (where salario>0)::int com_salario from folha_servidores_bsit`)).rows);
await db.end();
