// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// mede_links_folha_pi.mjs — abre CADA link de pessoal que já está em `site_municipal_links` e mede o que tem.
//
// 🚨 POR QUE ISTO EM VEZ DE MAIS UMA VARREDURA: eu já tinha varrido o PI quatro vezes por CAMINHO adivinhado
//    (`/servidores`, `/v2/servidores.json`, `/transparencia/folha-pagamento`, menu de `/transparencia`) e cada
//    varredura achava só quem usava aquele caminho. Os links de cada município **já estavam no banco** desde a
//    leitura dos sites — 110 links em 76 municípios sem folha. Medir o que já foi colhido custa 110 requisições;
//    varrer de novo custa milhares. ⚠️ Antes de sair procurando, ver o que já se tem
//    ([[pnigp-varredura-colher-tudo-nao-o-primeiro]]).
//
// A prova é a TELA, não o rótulo: "Pessoal/Servidores" pode ser cadastro sem valor, PDF, ou login.
// Guardo linhas, se tem dinheiro, se tem lotação e o cabeçalho — para o coletor decidir depois.
//
// Uso: node scripts/mede_links_folha_pi.mjs   ·   CONC=12   ·   UFA=PI
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";

setGlobalDispatcher(new Agent({ connect: { timeout: 25000, rejectUnauthorized: false, family: 4 },
  headersTimeout: 45000, bodyTimeout: 120000 }));

const db = pool(); const q = withRetry(db);
const CONC = Number(process.env.CONC || 12);
const UFA = process.env.UFA || "PI";
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml" };

await q(`create table if not exists pi_link_medida (
  cod_ibge text, municipio text, rotulo text, url text, url_final text,
  http int, linhas int, tem_valor boolean, tem_lotacao boolean, cabecalho text,
  situacao text, em timestamptz default now(), primary key (cod_ibge, url))`);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (ok) partes.push(`select distinct left(cod_ibge::text,7) c from ${t} where left(cod_ibge::text,2)='22'`);
}
const alvos = (await q(`
  with col as (${partes.join(" union ")}),
  lk as (select m.cod_ibge, m.nome municipio, split_part(l,'|',1) rotulo, split_part(l,'|',2) url
           from municipios_br m join site_municipal_links s on s.cod_ibge=m.cod_ibge
           cross join lateral jsonb_array_elements_text(s.links) l
           left join col c on c.c=m.cod_ibge
          where m.uf=$1 and c.c is null)
  select distinct cod_ibge, municipio, rotulo, url from lk
   where (rotulo ~* 'folha|remunera|servidor|pessoal|vencimento' or url ~* 'folha|remunera|servidor|pessoal')
     and url !~* 'noticia|login|\\.pdf|edital|concurso|diario|blog'
     and url ~ '^https?://'
   order by municipio`, [UFA])).rows;
console.log(`[medida-${UFA}] ${alvos.length} links a medir`);

const sem = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function mede(u) {
  try {
    const r = await fetch(u, { headers: H, redirect: "follow", signal: AbortSignal.timeout(60000) });
    const t = await r.text();
    if (r.status >= 400) return { http: r.status, situacao: `HTTP ${r.status}`, linhas: 0 };
    const ths = [...t.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => sem(m[1])).filter(Boolean);
    // ⚠️ cabeçalho também pode vir em <div> (DevExpress) — por isso não confio só em <th>
    const divH = [...t.matchAll(/class="[^"]*datagrid-text-content[^"]*"[^>]*>([^<]{2,40})</gi)].map((m) => sem(m[1]));
    const cab = [...new Set([...ths, ...divH])];
    const trs = ((t.split(/<tbody/i)[1] || "").match(/<tr/gi) || []).length
      || (t.match(/<tr[\s\S]*?<\/tr>/gi) || []).length - 1;
    const valor = /R\$\s?[\d.]+,\d{2}/.test(t) || cab.some((x) => /remuner|l[íi]quid|bruto|sal[áa]rio|vencim/i.test(x));
    const lot = cab.some((x) => /lota[çc]|secretaria|setor|[óo]rg[ãa]o|unidade/i.test(x));
    return { http: r.status, url_final: r.url, linhas: Math.max(0, trs), tem_valor: valor, tem_lotacao: lot,
      cab: cab.slice(0, 12).join(" | "),
      situacao: trs > 1 ? (valor ? "tabela_com_valor" : "tabela_sem_valor") : "sem_tabela" };
  } catch (e) { return { http: null, situacao: (e.cause?.code || e.name || e.message).toString().slice(0, 26), linhas: 0 }; }
}

let i = 0, comValor = 0, comTabela = 0;
async function trab() {
  while (i < alvos.length) {
    const a = alvos[i++];
    const m = await mede(a.url);
    if (m.situacao === "tabela_com_valor") { comValor++; console.log(`  ⭐ ${a.municipio}: ${m.linhas} linhas COM VALOR · ${a.rotulo.slice(0, 30)} → ${a.url.slice(0, 82)}`); }
    else if (m.situacao === "tabela_sem_valor") comTabela++;
    await q(`insert into pi_link_medida (cod_ibge,municipio,rotulo,url,url_final,http,linhas,tem_valor,tem_lotacao,cabecalho,situacao,em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) on conflict (cod_ibge,url) do update set
      url_final=excluded.url_final, http=excluded.http, linhas=excluded.linhas, tem_valor=excluded.tem_valor,
      tem_lotacao=excluded.tem_lotacao, cabecalho=excluded.cabecalho, situacao=excluded.situacao, em=now()`,
      [a.cod_ibge, a.municipio, a.rotulo.slice(0, 120), a.url, m.url_final || null, m.http, m.linhas,
       !!m.tem_valor, !!m.tem_lotacao, m.cab || null, m.situacao]);
    if (i % 20 === 0) console.log(`   ${i}/${alvos.length} · ${comValor} com valor · ${comTabela} tabela sem valor`);
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.table((await q(`select situacao, count(*) links, count(distinct cod_ibge) municipios from pi_link_medida
  group by 1 order by 2 desc limit 15`)).rows);
console.log("── telas COM VALOR encontradas:");
console.table((await q(`select municipio, linhas, tem_lotacao, left(cabecalho,60) cabecalho, left(url,70) url
  from pi_link_medida where situacao='tabela_com_valor' order by linhas desc`)).rows);
await db.end();
