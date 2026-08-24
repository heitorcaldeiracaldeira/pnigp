// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// identifica_produto_portal.mjs — descobre QUAL PRODUTO roda por trás de um portal em domínio próprio do município.
//
// POR QUÊ: 475 municípios ficaram com "portal próprio" no mapa de blocos, o que parecia 475 sistemas diferentes e
// sem coletor possível. Mas o domínio próprio costuma ser só WHITE-LABEL: `transparencia.altair.sp.gov.br:8079`
// é SCPI, `transparencia.x.mg.gov.br` pode ser Betha, Memory, IPM… A assinatura está no HTML (título, generator,
// caminhos de recurso, cookies, funções JS). Identificado o produto, o município vai para o coletor que já existe.
//
// Uso: node scripts/identifica_produto_portal.mjs   (opcional LIMITE=50)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import https from "https";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const LIMITE = Number(process.env.LIMITE || 0);
const UA = { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" };
const agente = new https.Agent({ rejectUnauthorized: false });   // portais em porta alta usam cert inválido

await q(`create table if not exists portal_produto (
  cod_ibge text primary key, municipio text, uf text, url text, produto text, evidencia text,
  em timestamptz default now()
)`);

// assinatura → produto. A ordem importa: as mais específicas primeiro.
const ASSINATURAS = [
  [/SCPI\s*9|ProcessaDados\(|LnkServidores|dxgvDataRow/i, "scpi"],
  [/portaltp|consultas\/pessoal\/servidores\.aspx/i, "portaltp"],
  [/betha\.cloud|betha\.com\.br|e-gov\.betha/i, "betha"],
  [/eloweb|elotech/i, "elotech"],
  [/pronimtb|cidade360|governancabrasil/i, "govbr"],
  [/ilai|memory\.com\.br|cronapp/i, "memory"],
  [/equiplano|esadmin\/recursos/i, "equiplano"],
  [/atende\.net|ipm sistemas|ipmsistemas/i, "ipm"],
  [/megasoft/i, "megasoft"],
  [/acessoainformacao|megasoft\/servidores/i, "nucleogov"],
  [/portaltransparencia\/publica\/recursosHumanos|cidadesmg/i, "cidadesmg"],
  [/dcfiorilli|fiorilli/i, "fiorilli"],
  [/governotransparente|portalcr2|cr2transparencia/i, "cr2"],
  [/elmartecnologia|publicsoft/i, "publicsoft"],
  [/tenosoft|sai_servidor/i, "tenosoft"],
  [/geosiap|lai_remuneracoes/i, "geosiap"],
  [/scriptcase|nm_gp_submit/i, "scriptcase(?)"],
  [/primefaces|javax\.faces/i, "jsf(?)"],
];

// ⭐ 23/ago/2026 — ALVO=diagnostico aponta o identificador para quem o diagnóstico já PROVOU ter folha nominal
//    e ficou SEM produto: 189 municípios (90 prefeituras + 99 câmaras). É o maior bloco restante e o mais
//    valioso, porque ali a dúvida não é "publica?" — já se sabe que sim — é "com qual sistema".
// ⭐⭐ E usa a URL da TELA DE PESSOAL, não a home: a assinatura do produto aparece muito mais nítida na tela
//    do módulo do que na página institucional ([[pnigp-tela-certa-nao-e-so-ter-tabela]]).
const DIAG = process.env.ALVO === "diagnostico";
const alvos = DIAG
  ? (await q(`select cod_ibge, municipio, uf, url from (
        select cod_ibge, municipio, uf, coalesce(url_pessoal, url_visitada) url
          from folha_diagnostico_faltante
         where veredito = 'tem_dados' and coalesce(produto,'') = ''
           and coalesce(url_pessoal, url_visitada) is not null
        union all
        select cod_ibge, municipio, uf, coalesce(url_pessoal, url_visitada) url
          from folha_diagnostico_camara
         where veredito = 'tem_dados' and coalesce(produto,'') = ''
           and coalesce(url_pessoal, url_visitada) is not null
      ) x order by uf, municipio ${LIMITE ? `limit ${LIMITE}` : ""}`)).rows
  : (await q(`
  select cod_ibge, municipio, uf, url_portal_real url from portal_real_descoberto
   where url_portal_real ~* '\\.gov\\.br'
     and not exists (select 1 from portal_produto p where p.cod_ibge = portal_real_descoberto.cod_ibge)
   order by uf, municipio ${LIMITE ? `limit ${LIMITE}` : ""}`)).rows;
console.log(`[identifica] ${alvos.length} portais · alvo ${DIAG ? "DIAGNÓSTICO (tem folha, falta produto)" : "domínio próprio"}`);

const conta = new Map();
for (let i = 0; i < alvos.length; i++) {
  const a = alvos[i];
  let produto = null, evid = null;
  try {
    const r = await fetch(a.url, { headers: UA, redirect: "follow", agent: agente, signal: AbortSignal.timeout(30000) });
    const txt = new TextDecoder("utf-8").decode(await r.arrayBuffer());
    // a assinatura pode estar no HTML OU na URL final (redirect entrega o fornecedor)
    const alvoTexto = r.url + "\n" + txt.slice(0, 200000);
    for (const [re, nome] of ASSINATURAS) {
      const m = alvoTexto.match(re);
      if (m) { produto = nome; evid = m[0].slice(0, 40); break; }
    }
  } catch (e) { evid = String(e.message).slice(0, 40); }
  await q(`insert into portal_produto (cod_ibge,municipio,uf,url,produto,evidencia,em)
    values ($1,$2,$3,$4,$5,$6,now()) on conflict (cod_ibge) do update set
    produto=excluded.produto, evidencia=excluded.evidencia, em=now()`,
    [a.cod_ibge, a.municipio, a.uf, a.url, produto, evid]);
  conta.set(produto || "(não identificado)", (conta.get(produto || "(não identificado)") || 0) + 1);
  if ((i + 1) % 40 === 0) console.log(`  ${i + 1}/${alvos.length}`);
}
console.log("\nPRODUTOS identificados por trás do domínio próprio:");
for (const [p, n] of [...conta.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${p}`);
await db.end();
