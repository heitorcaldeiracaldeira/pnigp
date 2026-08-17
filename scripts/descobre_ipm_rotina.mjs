// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_ipm_rotina.mjs — descobre, por município IPM, o CÓDIGO e a ROTINA de cada item de folha.
//
// 🚨 O QUE ESTAVA ERRADO: o coletor assumia `codigo: 9` e `rot=3344` como constantes do produto. Não são.
// Em Osório o item "Relação Funcionário x Pagamentos" é **código 27 com rot=3525**; o código 9 existe, responde,
// e devolve **zero período** — dando a impressão de que o município não publica. Publica desde 2015.
// A rotina não está no HTML (a tela é montada por JS): só aparece no tráfego. Então descobre-se UMA VEZ com
// navegador e grava-se; a coleta continua por HTTP puro.
//
// Uso: UF=RS node scripts/descobre_ipm_rotina.mjs      (SO=<município> para um só)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "RS";
const SO = process.env.SO || null;
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists ipm_item_rotina (
  cod_ibge text, municipio text, uf text, slug text, nome_item text,
  codigo text, rot text, aca text, tem_valor boolean, achado_em timestamptz default now(),
  primary key (cod_ibge, nome_item)
)`);

// alvos: municípios IPM cuja coleta NÃO fechou 'ok'
const alvos = (await q(`select c.cod_ibge, c.municipio, c.uf, p.slug, c.situacao
  from folha_ipm_coleta c
  join erp_portal_municipal p on p.cod_ibge = c.cod_ibge and p.erp = 'ipm'
 where c.situacao <> 'ok' ${UF ? "and c.uf = $1" : ""}
 ${SO ? `and c.municipio ilike '%'||$${UF ? 2 : 1}||'%'` : ""}
 order by c.municipio`, [UF, SO].filter(Boolean))).rows;
console.log(`[ipm-rotina] ${alvos.length} municípios ${UF} com coleta não-ok`);

const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
for (const a of alvos) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    // 1) quais itens o grupo "pessoal" oferece NESTE município (o nome varia)
    await page.goto(`https://${a.slug}.atende.net/transparencia/grupo/pessoal`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    try { await page.getByRole("button", { name: /^aceitar$/i }).click({ timeout: 4000 }); } catch {}
    await page.waitForTimeout(3000);
    const itens = [...new Set((await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((x) => x.href)))
      .filter((h) => /\/transparencia\/item\//.test(h))
      .map((h) => h.split("/item/")[1].split("#")[0]))];
    // só os que têm cara de folha (pagamento/salário/remuneração), para não abrir 10 telas por município
    const candidatos = itens.filter((i) => /pagamento|salario|salário|remunera|funcionario|servidor|folha/i.test(i));
    console.log(`  ${a.municipio}: ${itens.length} itens · ${candidatos.length} candidatos`);
    for (const nome of candidatos) {
      const capt = [];
      const ouve = (r) => { if (/processo=montaTela/.test(r.url())) capt.push(r.url()); };
      page.on("request", ouve);
      await page.goto(`https://${a.slug}.atende.net/transparencia/item/${nome}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(7000);
      page.off("request", ouve);
      const fr = page.frames().find((f) => /embed\/data/.test(f.url()));
      const b64 = fr ? (fr.url().match(/data\/([^/]+)\//) || [])[1] : null;
      let codigo = null;
      try { codigo = JSON.parse(Buffer.from(b64, "base64").toString()).codigo; } catch {}
      const u = capt.find((x) => /rot=\d+/.test(x));
      const rot = u ? (u.match(/rot=(\d+)/) || [])[1] : null;
      const aca = u ? (u.match(/aca=(\d+)/) || [])[1] : null;
      if (!codigo || !rot) { console.log(`     ${nome}: sem rotina capturada`); continue; }
      // tem coluna de dinheiro?
      const temValor = fr ? /provento|l[íi]quido|sal[áa]rio|remunera/i.test(await fr.content().catch(() => "")) : false;
      await q(`insert into ipm_item_rotina (cod_ibge, municipio, uf, slug, nome_item, codigo, rot, aca, tem_valor)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        on conflict (cod_ibge, nome_item) do update set codigo=excluded.codigo, rot=excluded.rot,
          aca=excluded.aca, tem_valor=excluded.tem_valor, achado_em=now()`,
        [a.cod_ibge, a.municipio, a.uf, a.slug, nome, codigo, rot, aca, temValor]);
      console.log(`     ⭐ ${nome}: código ${codigo} · rot ${rot} · aca ${aca}${temValor ? " · com valor" : ""}`);
    }
  } catch (e) { console.log(`  ✖ ${a.municipio}: ${String(e.message).slice(0, 90)}`); }
  await ctx.close();
}
await browser.close();
console.log(`[ipm-rotina] pronto`);
await db.end();
