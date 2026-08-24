// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_memory_entidade_derivado.mjs — acha o CÓDIGO DE ENTIDADE do Memory/iLAI quando o Radar não tem
// `url_portal`, DERIVANDO o domínio do município.
//
// Por que existe: `descobre_memory_entidade_js.mjs` (a passada por render JS) exige `radar_portal.url_portal`
// preenchido — e 47 municípios de MG marcados como `memory` estão no Radar SEM url nenhuma, com `situacao`
// `sem_codigo`. Sem o código de entidade o coletor não roda, e são o maior bloco isolado do maior buraco do país.
// Este script não substitui aquele: cobre o caso em que não há url para começar
// ([[pnigp-script-existente-sobrescrito]]).
//
// O código aparece em três formatos de URL, todos injetados por JS (por isso navegador, não fetch):
//   ilai.memory.com.br/#/entidades/login/9DY8SD/1/     · sistemaweb.memory.com.br:81/...?municipio=98P80D
//   lai.memory.com.br/esic/999RZ1
//
// Uso: UF=MG node scripts/descobre_memory_entidade_derivado.mjs      · SO=<município> · SOFALTANTES=0
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { chromium } from "playwright";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "MG";
const SO = process.env.SO || null;
const SO_FALTANTES = process.env.SOFALTANTES !== "0";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const so = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

await q(`create table if not exists memory_entidade (cod_ibge text primary key, municipio text, uf text,
  entidade text, situacao text, em timestamptz default now())`);

// os três formatos do identificador — extrair só o primeiro deixava 25 municípios de fora
const PADROES = [
  /ilai\.memory\.com\.br\/#\/(?:entidades\/login\/)?([0-9A-Z]{5,8})\b/i,
  /[?&]municipio=([0-9A-Z]{5,8})\b/i,
  /lai\.memory\.com\.br\/esic\/([0-9A-Z]{5,8})\b/i,
];
// o código real MISTURA dígito e letra e começa por dígito (9CNNRL, 97U7HT, 98LDKP). Sem essa guarda o regex
// casou com a palavra "PUBLIC" numa URL e gravou dois municípios com entidade inexistente.
const CODIGO_VALIDO = /^\d[0-9A-Z]{4,7}$/;
const achaCode = (html) => {
  for (const re of PADROES) {
    const m = (html || "").match(re);
    if (m && CODIGO_VALIDO.test(m[1].toUpperCase())) return m[1].toUpperCase();
  }
  return null;
};

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const c = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (c) partes.push(`select distinct left(cod_ibge::text,6) i from ${t} where cod_ibge is not null`);
}
const F = partes.join(" union ");

// alvos: municípios que o Radar diz serem Memory e que AINDA não têm código de entidade
const fila = (await q(`
  select distinct m.cod_ibge, m.nome, m.uf
    from radar_portal r
    join municipios_br m on m.cod_ibge = r.cod_ibge
    left join memory_entidade e on e.cod_ibge = m.cod_ibge and e.entidade is not null
   where r.erp = 'memory' and m.uf = $1 and e.cod_ibge is null
     ${SO_FALTANTES ? `and left(m.cod_ibge,6) not in (${F})` : ""}
     ${SO ? "and m.nome ilike '%'||$2||'%'" : ""}
   order by m.nome`, [UF, SO].filter(Boolean))).rows;
console.log(`[memory-derivado] ${fila.length} municípios ${UF} sem código de entidade`);

const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
let ok = 0, sem = 0, semSite = 0;
for (let i = 0; i < fila.length; i++) {
  const a = fila[i];
  const s = so(a.nome);
  const uf = a.uf.toLowerCase();
  // domínios prováveis, do mais comum ao menos — o município às vezes usa `pm{slug}` ou `.com.br`
  const bases = [`https://www.${s}.${uf}.gov.br`, `https://${s}.${uf}.gov.br`,
                 `https://www.pm${s}.${uf}.gov.br`, `https://${s}.com.br`];
  const marca = (situacao, code = null) =>
    q(`insert into memory_entidade (cod_ibge, municipio, uf, entidade, situacao, em)
       values ($1,$2,$3,$4,$5,now()) on conflict (cod_ibge) do update set
       entidade = coalesce(excluded.entidade, memory_entidade.entidade),
       situacao = excluded.situacao, em = now()`, [a.cod_ibge, a.nome, a.uf, code, situacao]);
  const ctx = await browser.newContext({ userAgent: UA, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    let code = null, abriu = false;
    for (const base of bases) {
      if (code) break;
      for (const cam of ["", "/transparencia", "/portal-da-transparencia", "/acesso-a-informacao", "/esic"]) {
        try {
          await page.goto(base + cam, { waitUntil: "domcontentloaded", timeout: 22000 });
          abriu = true;
          await dorme(2000);
          code = achaCode(await page.content());
          if (code) break;
        } catch { /* próximo caminho */ }
      }
    }
    if (code) { await marca("ok", code); ok++; console.log(`  ⭐ [${i + 1}/${fila.length}] ${a.nome} → ${code}`); }
    else if (abriu) { await marca("sem_codigo"); sem++; console.log(`   · [${i + 1}/${fila.length}] ${a.nome}: site abriu, sem código Memory`); }
    else { await marca("sem_site"); semSite++; console.log(`   ✖ [${i + 1}/${fila.length}] ${a.nome}: nenhum domínio abriu`); }
  } catch (e) {
    await marca("erro"); console.log(`   ✖ [${i + 1}/${fila.length}] ${a.nome}: ${String(e.message).split("\n")[0].slice(0, 60)}`);
  }
  await ctx.close().catch(() => {});
}
await browser.close();
console.log(`\n[memory-derivado] ${ok} códigos achados · ${sem} sem código · ${semSite} sem site`);
await db.end();
