// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// descobre_prefeitura_de_camara.mjs — quando a descoberta mapeou o portal da CÂMARA, deriva o da PREFEITURA.
//
// POR QUÊ: em TO e GO, `descobre_portal_real` seguiu o link de "transparência" e caiu no portal do LEGISLATIVO —
// 75 dos 139 municípios do TO e 86 de GO. Coletar dali atribuiria a folha da câmara à prefeitura (e câmara está
// fora do escopo). É a mesma família de [[pnigp-fila-erp-homonimo-contamina-uf]]: alvo plausível e errado.
// Precedente no MS, com outra regra (`/transparenciacm/` → `/transparencia/`): `_ms_cm_para_prefeitura.mjs`.
//
// AS REGRAS DE DERIVAÇÃO (por host, do mais forte para o mais fraco):
//   {slug}.to.leg.br            → {slug}.to.gov.br · transparencia.{slug}.to.gov.br
//   camara{x}.dominio           → {x}.dominio · pm{x}.dominio · prefeitura{x}.dominio
//   cm{x}.dominio               → pm{x}.dominio · {x}.dominio
//   .../transparenciacm/...     → .../transparencia/...
//
// 🚨 O 200 NÃO BASTA: o candidato só é aceito se o CORPO falar de prefeitura/município E NÃO for outra câmara
// ([[pnigp-sonda-soft404-falso-positivo]]). Grava em `prefeitura_de_camara`, sem tocar no que já existe.
//
// Uso: UF=TO node scripts/descobre_prefeitura_de_camara.mjs   (UF pela SIGLA; sem UF, roda TO e GO)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const NOME = { TO: "Tocantins", GO: "Goiás", BA: "Bahia", MS: "Mato Grosso do Sul", MG: "Minas Gerais" };
const UFS = (process.env.UF ? [process.env.UF.toUpperCase()] : ["TO", "GO"]).map((s) => NOME[s] || s);
const CONC = Number(process.env.CONC || 6);

await q(`create table if not exists prefeitura_de_camara (
  cod_ibge text primary key, municipio text, uf text,
  url_camara text, url_prefeitura text, regra text, evidencia text, em timestamptz default now())`);

// alvos: portal mapeado é de câmara E o município ainda não tem folha em nenhuma fonte
const alvos = (await q(`
  with cam as (
    select distinct on (cod_ibge) cod_ibge, municipio, uf, url_portal_real
      from portal_real_descoberto
     where uf = any($1) and url_portal_real ~* '\\.leg\\.br|camara|/cm[a-z]|//cm[a-z]'
     order by cod_ibge, em desc),
  col as (select distinct cod_ibge from folha_servidores_megasoft
          union select distinct cod_ibge from folha_servidores_nucleogov
          union select distinct cod_ibge from folha_servidores_capital
          union select distinct cod_ibge from folha_servidores_govbr
          union select distinct cod_ibge from folha_servidores_scpi)
  select cam.* from cam left join col on col.cod_ibge = cam.cod_ibge
   where col.cod_ibge is null
     and not exists (select 1 from prefeitura_de_camara p where p.cod_ibge = cam.cod_ibge)
   order by cam.uf, cam.municipio`, [UFS])).rows;

console.log(`[cm→pm] ${alvos.length} municípios com portal de câmara e sem folha · ${UFS.join(", ")}`);

function candidatos(url) {
  const out = [];
  let u; try { u = new URL(url.startsWith("http") ? url : "https://" + url); } catch { return out; }
  const h = u.hostname;
  const legbr = h.match(/^(?:transparencia\.|acessoainformacao\.)?([a-z0-9-]+)\.([a-z]{2})\.leg\.br$/i);
  if (legbr) {
    const [, slug, uf] = legbr;
    out.push([`https://${slug}.${uf}.gov.br/`, "leg.br→gov.br"]);
    out.push([`https://transparencia.${slug}.${uf}.gov.br/`, "leg.br→transparencia.gov.br"]);
    out.push([`https://www.${slug}.${uf}.gov.br/`, "leg.br→www.gov.br"]);
  }
  const cam = h.match(/^camara([a-z0-9-]+)\.(.+)$/i);
  if (cam) for (const p of ["", "pm", "prefeitura"]) out.push([`https://${p}${cam[1]}.${cam[2]}/`, `camara→${p || "raiz"}`]);
  const cm = h.match(/^cm([a-z0-9-]+)\.(.+)$/i);
  if (cm) for (const p of ["pm", ""]) out.push([`https://${p}${cm[1]}.${cm[2]}/`, `cm→${p || "raiz"}`]);
  if (/transparenciacm/i.test(u.href)) out.push([u.href.replace(/transparenciacm/ig, "transparencia"), "path cm→transparencia"]);
  return out;
}

async function baixa(url) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return (await r.text()).slice(0, 400000);
  } catch { return null; }
}

let achados = 0, testados = 0;
for (let i = 0; i < alvos.length; i += CONC) {
  await Promise.all(alvos.slice(i, i + CONC).map(async (a) => {
    for (const [url, regra] of candidatos(a.url_portal_real)) {
      const html = await baixa(url);
      if (!html) continue;
      // ⚠️ confirmação de conteúdo: tem de falar de prefeitura/município e NÃO ser outra câmara
      const ehPref = /prefeitura|munic[íi]pio|poder executivo/i.test(html);
      const ehCam = /c[âa]mara\s+municipal|poder legislativo|vereador/i.test(html);
      if (!ehPref || (ehCam && !/prefeitura/i.test(html.slice(0, 4000)))) continue;
      await q(`insert into prefeitura_de_camara (cod_ibge,municipio,uf,url_camara,url_prefeitura,regra,evidencia)
               values ($1,$2,$3,$4,$5,$6,$7) on conflict (cod_ibge) do nothing`,
        [a.cod_ibge, a.municipio, a.uf, a.url_portal_real, url, regra, `prefeitura=${ehPref} camara=${ehCam}`]);
      achados++;
      console.log(`  ✔ ${a.municipio.padEnd(24)} ${regra.padEnd(28)} ${url}`);
      return;
    }
  }));
  testados += Math.min(CONC, alvos.length - i);
  process.stdout.write(`   ${testados}/${alvos.length} · ${achados} prefeituras achadas\r`);
}
console.log(`\n[cm→pm] ${achados} de ${alvos.length} convertidos`);
console.table((await q(`select uf, count(*)::int n from prefeitura_de_camara group by 1 order by 2 desc`)).rows);
await db.end();
