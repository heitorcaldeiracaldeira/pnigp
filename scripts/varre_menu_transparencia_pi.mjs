// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// varre_menu_transparencia_pi.mjs — em vez de ADIVINHAR o caminho da folha, LÊ O MENU do portal e colhe.
//
// 🚨 A LIÇÃO QUE ORIGINOU ESTE SCRIPT: eu vinha testando caminhos fixos (`/servidores`, `/v2/servidores.json`,
//    `/transparencia/folha-pagamento`) e cada varredura achava só quem usava AQUELE caminho — 8 aqui, 13 ali.
//    Em Palmeirais a tela boa apareceu porque abri `/transparencia` e li os links: havia
//    "Relação Nominal de Remuneração → /transparencia/folha-pagamento". O menu sabe o caminho; eu não.
//    ⚠️ Adivinhar caminho é varredura de um caso; ler menu é varredura do estado.
//
// Colhe TODO link cujo texto ou href fale de folha/remuneração/servidor/pessoal, em várias portas de entrada
// (`/transparencia`, `/portal-transparencia`, raiz…), e guarda em `pi_menu_folha`. O coletor decide depois.
//
// Uso: node scripts/varre_menu_transparencia_pi.mjs   ·   CONC=14   ·   UFA=PI   ·   SO_FALTANTES=1
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";

setGlobalDispatcher(new Agent({ connect: { timeout: 25000, rejectUnauthorized: false, family: 4 },
  headersTimeout: 45000, bodyTimeout: 90000 }));

const db = pool(); const q = withRetry(db);
const CONC = Number(process.env.CONC || 14);
const UFA = process.env.UFA || "PI";
const SO_FALTANTES = process.env.SO_FALTANTES !== "0";
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml" };
const RE = /folha|remunera|servidor|pessoal|vencimento|sal[áa]rio|quadro de pessoal|contracheque/i;
// ⚠️ o que NÃO serve: notícia sobre pagamento de servidor, login de contracheque, PDF de lei
const LIXO = /noticia|not[íi]cias|\/blog|login|acesso|\.pdf$|\.doc|edital|concurso|processo-seletivo|diario/i;

await q(`create table if not exists pi_menu_folha (
  cod_ibge text, municipio text, entrada text, rotulo text, url text,
  situacao text, linhas int, tem_valor boolean, em timestamptz default now(),
  primary key (cod_ibge, url))`);

const slug = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/ pi$/, "").replace(/ do piaui$/, "").replace(/[^a-z0-9]/g, "");

// alvos: municípios do PI SEM folha com valor de nenhuma fonte
const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (ok) partes.push(`select distinct left(cod_ibge::text,7) c from ${t} where left(cod_ibge::text,2)='22'`);
}
const alvos = (await q(`
  with col as (${partes.join(" union ")})
  select m.cod_ibge, m.nome municipio,
    (select array_agg(distinct h.host) from pi_host_censo h
      where h.cod_ibge=m.cod_ibge and h.host like '%.gov.br') hosts,
    (select v.url from pi_servidores_visita v where v.cod_ibge=m.cod_ibge and v.url is not null) url_visita
  from municipios_br m left join col c on c.c = m.cod_ibge
  where m.uf=$1 ${SO_FALTANTES ? "and c.c is null" : ""} order by m.nome`, [UFA])).rows;
console.log(`[menu-${UFA}] ${alvos.length} municípios a varrer`);

const sem = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function entradas(a) {
  const s = slug(a.municipio);
  const hs = new Set([...(a.hosts || []), `${s}.pi.gov.br`, `transparencia.${s}.pi.gov.br`, `www.${s}.pi.gov.br`]);
  if (a.url_visita) { try { hs.add(new URL(a.url_visita).hostname); } catch {} }
  const out = [];
  for (const h of hs) out.push(`https://${h}/transparencia`, `https://${h}/${s}/transparencia`, `https://${h}/`);
  return [...new Set(out)];
}

async function pega(u) {
  try {
    const r = await fetch(u, { headers: H, redirect: "follow", signal: AbortSignal.timeout(40000) });
    if (r.status >= 400) return null;
    return { html: await r.text(), final: r.url };
  } catch { return null; }
}

// abre o link colhido e mede: tem linhas? tem dinheiro? — a prova é a tela, não o rótulo do menu
async function mede(u) {
  const d = await pega(u);
  if (!d) return { situacao: "nao_abriu", linhas: 0, valor: false };
  const trs = ((d.html.split(/<tbody/i)[1] || "").match(/<tr/gi) || []).length;
  const valor = /R\$\s?[\d.]+,\d{2}|>\s*[\d.]{3,},\d{2}\s*</.test(d.html);
  return { situacao: trs ? (valor ? "tabela_com_valor" : "tabela_sem_valor") : "sem_tabela", linhas: trs, valor };
}

let i = 0, achados = 0, comValor = 0;
async function trab() {
  while (i < alvos.length) {
    const a = alvos[i++];
    const vistos = new Set();
    for (const e of entradas(a)) {
      const d = await pega(e);
      if (!d) continue;
      const base = new URL(d.final);
      const links = [...d.html.matchAll(/href="([^"]+)"[^>]*>([\s\S]{0,90}?)<\/a>/gi)]
        .map((m) => ({ href: m[1], rot: sem(m[2]) }))
        .filter((x) => (RE.test(x.rot) || RE.test(x.href)) && !LIXO.test(x.href) && !LIXO.test(x.rot));
      for (const l of links.slice(0, 12)) {
        let u; try { u = new URL(l.href, base).href; } catch { continue; }
        if (vistos.has(u) || !/^https?:/.test(u)) continue;
        vistos.add(u);
        const m = await mede(u);
        if (m.linhas) achados++;
        if (m.situacao === "tabela_com_valor") { comValor++; console.log(`  ⭐ ${a.municipio}: ${m.linhas} linhas COM VALOR · ${l.rot.slice(0, 38)} → ${u.slice(0, 78)}`); }
        await q(`insert into pi_menu_folha (cod_ibge,municipio,entrada,rotulo,url,situacao,linhas,tem_valor,em)
          values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (cod_ibge,url) do update set
          situacao=excluded.situacao, linhas=excluded.linhas, tem_valor=excluded.tem_valor, em=now()`,
          [a.cod_ibge, a.municipio, e, l.rot.slice(0, 120), u, m.situacao, m.linhas, m.valor]);
      }
      if (vistos.size) break;   // achei menu com links de pessoal nesta entrada; não preciso das outras
    }
    if (i % 20 === 0) console.log(`   ${i}/${alvos.length} · ${achados} telas com linhas · ${comValor} com valor`);
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.table((await q(`select situacao, count(*) telas, count(distinct cod_ibge) municipios, sum(linhas) linhas
  from pi_menu_folha group by 1 order by 2 desc`)).rows);
console.log("── municípios onde apareceu tela COM VALOR:");
console.table((await q(`select municipio, count(*) telas, max(linhas) maior, min(url) exemplo
  from pi_menu_folha where situacao='tabela_com_valor' group by 1 order by 3 desc limit 30`)).rows);
await db.end();
