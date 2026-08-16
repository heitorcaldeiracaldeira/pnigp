// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// sonda_folha_municipal.mjs — VISITA cada município da UF e responde, um a um, o que ele publica de folha.
//
// É o método das capitais ([[pnigp-capitais-ckan-e-a-porta]]) aplicado em escala, com uma correção que a
// calibração impôs. A 1ª versão sondava só o HTML da home e devolveu "0 municípios publicam valor" no RS — onde
// 193 municípios JÁ TINHAM salário coletado no banco. Acerto de 0%. As três causas, medidas:
//   1. partia do SITE INSTITUCIONAL, não do portal de transparência que o identificador já tinha achado;
//   2. o link "servidores" da home levava a PDF de tabela de padrões e a legislação (CESPRO), não à folha;
//   3. 🚨 A CAUSA DE FUNDO: em ERP (GovBR, Betha, IPM) o valor NUNCA está no HTML — vem por API JSON. Procurar
//      "R$" na página é a pergunta errada para eles.
//
// ⭐ A LEI QUE SOBROU: a prova de que um município publica é a COLETA, não a página. Por isso a sonda classifica
// em três níveis de evidência e NUNCA diz "não publica" sobre quem já está no banco:
//   A_coletado — já existe em alguma folha_servidores_* com valor > 0. Prova definitiva.
//   B_erp      — ERP identificado com coletor pronto. Não é prova, é ALVO: a coleta decide.
//   C_http     — só aqui vale a sonda de página/CKAN, e mesmo assim SPA é declarado SPA.
// Isto é o mesmo par de provas de [[pnigp-radar-atricon-erp-por-pagina]]: o subdomínio responder não prova nada;
// a folha ter sido colhida, sim.
//
// Uso: UF=RS node scripts/sonda_folha_municipal.mjs   ·   RESONDA=1 refaz quem já foi sondado
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";
import { SG_UF, COD_UF } from "./_uf.mjs";
import { identifica, baixa, UA } from "./_erp_assinaturas.mjs";

const db = pool();
const q = withRetry(db);
const CONC = Number(process.env.CONC || 8);
const RESONDA = process.env.RESONDA === "1";

// ERPs com coletor escrito e provado em produção — é o que separa "alvo" de "pesquisa a fazer".
const COM_COLETOR = new Set(["betha", "govbr", "ipm", "elotech", "equiplano", "portaltp", "epublica", "megasoft",
  "nucleogov", "memory", "smarapd", "publicsoft", "cr2", "rpm", "layout", "aspec", "geosiap", "tenosoft",
  "fiorilli", "cidadesmg", "genexus"]);

await q(`create table if not exists folha_sonda_municipal (
  cod_ibge text primary key, municipio text, uf text,
  url_base text, origem_url text, url_pessoal text, erp text,
  ckan_host text, ckan_datasets int, ckan_exemplo text,
  publica_nominal boolean, publica_valor boolean, spa boolean,
  veredito text, evidencia text, em timestamptz default now()
)`);
for (const col of ["nivel_evidencia text", "servidores_coletados int", "fonte_coleta text"]) {
  await q(`alter table folha_sonda_municipal add column if not exists ${col}`);
}

// ── NÍVEL A: o gabarito. Quem já foi COLETADO, com valor. ──────────────────────────────────────────────────────
// 🚨 As fontes são DESCOBERTAS, não listadas à mão: quando tenosoft e equiplano entraram, uma lista fixa os
// ignorou em silêncio ([[pnigp-coletor-ok-sem-dado-sete-causas]]).
const tabelas = (await q(`select table_name, string_agg(column_name, ',') cols,
    string_agg(column_name, ',') filter (where data_type in ('numeric','integer','bigint','double precision','real')) num_cols
  from information_schema.columns where table_schema='public' and table_name like 'folha_servidores_%'
  group by 1 order by 1`)).rows;

const coletado = new Map();   // ibge6 → { n, comValor, fonte }
for (const t of tabelas) {
  const cols = t.cols.split(",");
  if (!cols.includes("cod_ibge")) continue;
  // 🚨 a coluna de valor tem NOME diferente em cada ERP e só pode ser NUMÉRICA. Procurar por `valor|remunera|
  // bruto|salario` dava zero no IPM, que chama a dela de `provento` — 34 municípios e 47 mil servidores saíram
  // como "coletado sem valor", com cara de coleta quebrada. O erro era do detector, não da coleta.
  const numCols = (t.num_cols || "").split(",").filter(Boolean);
  const colValor = numCols.find((c) => /^(valor_bruto|remuneracao_bruta|provento|proventos|valor|salario|bruto)$/.test(c))
                || numCols.find((c) => /provento|remunera|bruto|salario|vencimento|rendimento/.test(c))
                || numCols.find((c) => /valor|liquido/.test(c));
  try {
    const r = await q(`select left(cod_ibge::text,6) ibge6, count(*) n
      ${colValor ? `, count(*) filter (where (${colValor})::numeric > 0) com_valor` : ", 0 com_valor"}
      from ${t.table_name} where left(cod_ibge::text,2) = $1 group by 1`, [COD_UF]);
    for (const row of r.rows) {
      const ant = coletado.get(row.ibge6);
      const novo = { n: +row.n, comValor: +row.com_valor, fonte: t.table_name.replace("folha_servidores_", "") };
      if (!ant || novo.n > ant.n) coletado.set(row.ibge6, novo);
    }
  } catch { /* tabela sem coluna numérica compatível: entra só pela contagem */ }
}
console.log(`[sonda/${SG_UF}] gabarito: ${coletado.size} municípios já coletados em ${tabelas.length} tabelas de folha`);

// ── SO_GABARITO=1: reavalia o que já foi visitado, SEM gastar rede ─────────────────────────────────────────────
// Serve para quando o erro está na RÉGUA e não na visita: corrigir o detector de coluna ou o regex de valor não
// exige revisitar 497 portais — a evidência medida está gravada.
if (process.env.SO_GABARITO === "1") {
  for (const [ibge6, c] of coletado) {
    await q(`update folha_sonda_municipal set nivel_evidencia='A_coletado',
       veredito = case when $1::int > 0 then 'nominal_com_valor' else 'nominal_sem_valor' end,
       publica_nominal = true, publica_valor = ($1::int > 0),
       servidores_coletados = $2::int, fonte_coleta = $3,
       evidencia = $2::text || ' servidores coletados via ' || $3, em = now()
     where left(cod_ibge,6) = $4 and uf = $5`, [c.comValor, c.n, c.fonte, ibge6, SG_UF]);
  }
  // derruba o "publica valor" que se apoiava em evidência fraca (sem R$ e sem separador de milhar)
  const fracos = await q(`update folha_sonda_municipal set publica_valor = false,
       veredito = case when publica_nominal then 'nominal_sem_valor' else 'sem_sinal' end
     where uf = $1 and nivel_evidencia <> 'A_coletado' and publica_valor
       and evidencia not like '%R$%' and evidencia !~ '[0-9]{1,3}\\.[0-9]{3},[0-9]{2}'
     returning municipio`, [SG_UF]);
  console.log(`[sonda/${SG_UF}] gabarito reaplicado · ${fracos.rowCount} vereditos de "valor" caíram por evidência fraca`);
  console.table((await q(`select nivel_evidencia, veredito, count(*) mun from folha_sonda_municipal
    where uf=$1 group by 1,2 order by 1, 3 desc`, [SG_UF])).rows);
  console.table((await q(`select count(*) municipios, count(*) filter (where publica_nominal) nominal,
    count(*) filter (where publica_valor) valor from folha_sonda_municipal where uf=$1`, [SG_UF])).rows);
  await db.end();
  process.exit(0);
}

// ── alvos, com o ponto de partida na ordem certa ───────────────────────────────────────────────────────────────
// ⭐ url_erp (o portal do ERP, achado pelo identificador) vem ANTES do site institucional — foi por inverter isso
// que a 1ª versão errou 104 municípios.
const alvos = (await q(`
  select m.cod_ibge, m.nome municipio, m.uf,
         coalesce(r.url_erp, p.url_portal_real, r.url_portal, s.url_site) url_base,
         case when r.url_erp is not null then 'erp'
              when p.url_portal_real is not null then 'portal-real'
              when r.url_portal is not null then 'radar'
              when s.url_site is not null then 'site-derivado' end origem_url,
         coalesce(r.erp, s.erp) erp
    from municipios_br m
    left join lateral (select url_portal, url_erp, erp from radar_portal r2
       where r2.cod_ibge = m.cod_ibge and r2.unidade_gestora ilike 'Prefeitura%'
       order by (r2.url_erp is null), (r2.url_portal is null) limit 1) r on true
    left join site_municipal_derivado s on s.cod_ibge = m.cod_ibge
    left join lateral (select url_portal_real from portal_real_descoberto p2
       where p2.cod_ibge = m.cod_ibge and p2.url_portal_real is not null limit 1) p on true
   where m.uf = $1
     ${RESONDA ? "" : "and not exists (select 1 from folha_sonda_municipal f where f.cod_ibge = m.cod_ibge)"}
     ${/* ⚠️ SO_FALTANTES: re-sonda APENAS quem ainda não tem coleta. Re-sondar o estado inteiro sobrescreve
           `url_pessoal` de município já coletado — foi assim que a URL de Sapucaia do Sul perdeu o
           `?entidade=3` e o coletor caiu de 3.932 para 106 registros sem falhar. */ ""}
     ${process.env.SO_FALTANTES === "1"
        ? `and not exists (select 1 from folha_sonda_municipal f
                            where f.cod_ibge = m.cod_ibge and f.nivel_evidencia = 'A_coletado')` : ""}
   order by m.nome`, [SG_UF])).rows;
console.log(`[sonda/${SG_UF}] ${alvos.length} municípios a visitar · ${CONC} em paralelo`);

// ── NÍVEL C: CKAN (a porta das capitais) ───────────────────────────────────────────────────────────────────────
async function sondaCkan(urlBase) {
  if (!urlBase) return null;
  let dominio;
  try { dominio = new URL(urlBase.startsWith("http") ? urlBase : "https://" + urlBase).hostname.replace(/^www\./, ""); }
  catch { return null; }
  for (const host of [`dados.${dominio}`, `dadosabertos.${dominio}`]) {
    try {
      const r = await fetch(`https://${host}/api/3/action/package_search?q=servidor+OR+remuneracao+OR+folha&rows=5`,
        { headers: UA, redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const j = await r.json();
      if (j?.success && j?.result?.count > 0)
        return { host, n: j.result.count, exemplo: (j.result.results?.[0]?.title || "").slice(0, 120) };
    } catch { /* a maioria dos municípios não tem CKAN — silêncio é o esperado aqui */ }
  }
  return null;
}

// ── NÍVEL C: a rota de pessoal DENTRO do portal ────────────────────────────────────────────────────────────────
// 🚨 o que a 1ª versão trouxe de lixo: PDF de tabela de vencimentos e link de legislação (cespro). O texto da
// âncora continua mandando, mas agora com veto explícito.
const RE_PESSOAL = /servidor|pessoal|remunera|folha de pagamento|quadro funcional|gasto com pessoal/i;
const VETO = /\.(pdf|doc|docx|xls|xlsx|zip)$|cespro|leismunicip|diariomunicipal|\/legisla|concurso|\.jpg|\.png/i;
function melhorLink(html, base, re) {
  const ancoras = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,150}?)<\/a>/gi)]
    .map(([, href, txt]) => ({ href, txt: txt.replace(/<[^>]+>/g, " ").trim() }))
    .filter((a) => a.href && !VETO.test(a.href));
  const c = ancoras.find((a) => re.test(a.txt)) || ancoras.find((a) => re.test(a.href));
  if (!c) return null;
  try { return new URL(c.href, base).href; } catch { return null; }
}

// 🚨 régua apertada: aceitar qualquer `N,NN` marcou como "publica valor" páginas cuja única evidência era
// "0,90" ou "1,00" (versão de plugin, percentual, nota). Vale R$ explícito OU valor com separador de milhar.
const RE_VALOR = /R\$\s?\d{1,3}([.\s]\d{3})*,\d{2}|\d{1,3}\.\d{3},\d{2}/;
const RE_VALOR_ROTULO = /remunera[çc][ãa]o|sal[áa]rio|vencimento|proventos|l[íi]quido|bruto/i;
const RE_NOMINAL = /matr[íi]cula|nome do servidor|cargo|lota[çc][ãa]o/i;
const RE_SPA = /<div[^>]+id=["'](root|app|__next)["']|ng-app|<app-root|angular|react/i;

function leituraHttp(html) {
  if (!html) return { veredito: "sem_resposta" };
  const texto = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  const valor = RE_VALOR.test(texto) && RE_VALOR_ROTULO.test(texto);
  const nominal = RE_NOMINAL.test(texto);
  const spa = RE_SPA.test(html) && texto.replace(/\s+/g, "").length < 4000;
  const ev = (texto.match(RE_VALOR)?.[0] || texto.match(RE_NOMINAL)?.[0] || "").slice(0, 60);
  let v;
  // ⚠️ o SPA vem ANTES de qualquer negativa: "HTTP não alcança" ≠ "não publica".
  if (spa && !valor) v = "spa_precisa_navegador";
  else if (nominal && valor) v = "nominal_com_valor";
  else if (nominal) v = "nominal_sem_valor";
  else if (valor) v = "valor_sem_nominal";
  else v = "sem_sinal";
  return { veredito: v, nominal, valor, spa, evidencia: ev };
}

let n = 0, nivelA = 0, nivelB = 0, comCkan = 0;
for (let i = 0; i < alvos.length; i += CONC) {
  const bloco = alvos.slice(i, i + CONC);
  const res = await Promise.all(bloco.map(async (a) => {
    // NÍVEL A — provado pela coleta. Não gasta requisição: o banco já respondeu.
    const col = coletado.get(String(a.cod_ibge).slice(0, 6));
    if (col && col.n > 0) {
      return { a, nivel: "A_coletado", veredito: col.comValor > 0 ? "nominal_com_valor" : "nominal_sem_valor",
               nominal: true, valor: col.comValor > 0, servidores: col.n, fonte: col.fonte,
               evidencia: `${col.n} servidores coletados via ${col.fonte}` };
    }
    // NÍVEL B/C — ainda não coletado: sonda o portal.
    const base = a.url_base ? (a.url_base.startsWith("http") ? a.url_base : "https://" + a.url_base) : null;
    const ckan = await sondaCkan(base);
    const nivel = a.erp && COM_COLETOR.has(a.erp) ? "B_erp" : "C_http";
    if (!base) return { a, ckan, nivel, veredito: ckan ? "so_ckan" : "sem_portal" };

    const home = await baixa(base, 25000);
    if (!home) return { a, ckan, nivel, veredito: ckan ? "so_ckan" : "sem_resposta" };

    // 2 saltos: se a página de partida for o site institucional, passa primeiro pela transparência
    let pagina = home, urlPessoal = null;
    const rotaTransp = /transpar/i.test(base) ? null : melhorLink(home, base, /transpar/i);
    if (rotaTransp) {
      const h2 = await baixa(rotaTransp, 25000);
      if (h2) { pagina = h2; urlPessoal = rotaTransp; }
    }
    const rotaPessoal = melhorLink(pagina, urlPessoal || base, RE_PESSOAL);
    if (rotaPessoal) {
      const h3 = await baixa(rotaPessoal, 25000);
      if (h3) { pagina = h3; urlPessoal = rotaPessoal; }
    }
    const erp = a.erp || identifica(pagina).erp || identifica(home).erp;
    return { a, ckan, urlPessoal, erp, nivel: erp && COM_COLETOR.has(erp) ? "B_erp" : nivel, ...leituraHttp(pagina) };
  }));

  for (const r of res) {
    if (r.nivel === "A_coletado") nivelA++;
    if (r.nivel === "B_erp") nivelB++;
    if (r.ckan) comCkan++;
    await q(`insert into folha_sonda_municipal (cod_ibge,municipio,uf,url_base,origem_url,url_pessoal,erp,
        ckan_host,ckan_datasets,ckan_exemplo,publica_nominal,publica_valor,spa,veredito,evidencia,
        nivel_evidencia,servidores_coletados,fonte_coleta,em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
      on conflict (cod_ibge) do update set url_base=excluded.url_base, origem_url=excluded.origem_url,
        url_pessoal=excluded.url_pessoal, erp=excluded.erp, ckan_host=excluded.ckan_host,
        ckan_datasets=excluded.ckan_datasets, ckan_exemplo=excluded.ckan_exemplo,
        publica_nominal=excluded.publica_nominal, publica_valor=excluded.publica_valor, spa=excluded.spa,
        veredito=excluded.veredito, evidencia=excluded.evidencia, nivel_evidencia=excluded.nivel_evidencia,
        servidores_coletados=excluded.servidores_coletados, fonte_coleta=excluded.fonte_coleta, em=now()`,
      [r.a.cod_ibge, r.a.municipio, r.a.uf, r.a.url_base, r.a.origem_url, r.urlPessoal || null,
       r.erp || r.a.erp || null, r.ckan?.host || null, r.ckan?.n || null, r.ckan?.exemplo || null,
       r.nominal ?? null, r.valor ?? null, r.spa ?? null, r.veredito, r.evidencia || null,
       r.nivel, r.servidores || null, r.fonte || null]);
  }
  n += bloco.length;
  process.stdout.write(`   ${n}/${alvos.length} · A:${nivelA} B:${nivelB} · ${comCkan} CKAN\r`);
}

console.log(`\n[sonda/${SG_UF}] ${n} visitados`);
console.log("\n═══ NÍVEL DE EVIDÊNCIA × VEREDITO ═══");
console.table((await q(`select nivel_evidencia, veredito, count(*) mun from folha_sonda_municipal
  where uf=$1 group by 1,2 order by 1, 3 desc`, [SG_UF])).rows);
console.log("═══ os dois fatos, separados ═══");
console.table((await q(`select count(*) municipios,
  count(*) filter (where publica_nominal) nominal,
  count(*) filter (where publica_valor) valor,
  count(*) filter (where ckan_host is not null) ckan,
  count(*) filter (where spa) spa_precisa_navegador
  from folha_sonda_municipal where uf=$1`, [SG_UF])).rows);
await db.end();
