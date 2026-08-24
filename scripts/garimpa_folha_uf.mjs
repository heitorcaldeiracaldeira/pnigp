// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// garimpa_folha_uf.mjs — acha a TELA DE FOLHA dentro do portal de cada município, sem adivinhar caminho.
//
// 🚨 POR QUE ELE EXISTE: as varreduras por CAMINHO FIXO (`/servidores`, `/v2/servidores.json`,
//    `/transparencia/folha-pagamento`) só acham quem usa aquele caminho. Funcionaram no PI porque lá o estado
//    inteiro roda 4 CMSs. Em RO **nenhuma** respondeu: 38 municípios, 97 hosts, zero rota conhecida — cada
//    prefeitura tem portal próprio em subdomínio próprio (`athus4.montenegro`, `portalcidadao.corumbiara`…).
//    ⚠️ Quando o estado é pulverizado, adivinhar caminho é inútil: tem de SEGUIR O LINK.
//
// COMO FUNCIONA (busca em largura, 2 níveis, a partir do que já foi lido):
//   nível 0 — os links de transparência/pessoal que `site_municipal_links` já tem do município;
//   nível 1 — dentro de cada um, os links cujo texto fala de folha/servidor/remuneração;
//   a cada página aberta, MEDE: tem <tabela> com linhas? tem nome de gente? tem R$?
//   Para no primeiro achado bom (tabela + dinheiro) — [[pnigp-varredura-colher-tudo-nao-o-primeiro]] vale para
//   COLHER tudo do que a fonte dá; aqui o objetivo é achar a PORTA, e uma porta boa basta.
//
// O que ele NÃO faz: coletar. Ele grava a URL e a evidência em `folha_garimpo_uf` para o coletor certo entrar
// depois — porque o formato de cada portal é diferente e um coletor genérico mentiria.
//
// Uso: UF=RO node scripts/garimpa_folha_uf.mjs   ·   CONC=8   ·   TETO_PAG=30
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";
import { SG_UF as UF } from "./_uf.mjs";

setGlobalDispatcher(new Agent({ connect: { timeout: 20000, rejectUnauthorized: false, family: 4 },
  headersTimeout: 45000, bodyTimeout: 90000 }));

const db = pool(); const q = withRetry(db);
const CONC = Number(process.env.CONC || 8);
const TETO_PAG = Number(process.env.TETO_PAG || 30);   // páginas abertas por município
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/json" };

const RE_PESSOAL = /folha|remunera|servidor|pessoal|vencimento|sal[áa]rio|quadro\s*de\s*pessoal|recursos\s*humanos|contracheque/i;
// ⚠️ o que NÃO é tela de folha: notícia sobre pagamento, login do contracheque, PDF, edital de concurso
const LIXO = /noticia|not[íi]cias|\/blog|\.pdf|\.docx?|\.xlsx?|edital|concurso|processo-seletivo|diario|di[áa]rio|login|sign_in|facebook|instagram|youtube|whatsapp|twitter/i;

await q(`create table if not exists folha_garimpo_uf (
  uf text, cod_ibge text, municipio text, url text, url_pai text, rotulo text, nivel int,
  http int, linhas int, tem_valor boolean, tem_nome boolean, cabecalho text,
  veredito text, em timestamptz default now(), primary key (cod_ibge, url))`);

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (ok) partes.push(`select distinct left(cod_ibge::text,7) c from ${t}`);
}
const alvos = (await q(`
  with col as (${partes.join(" union ")})
  select m.cod_ibge, m.nome municipio,
         (select array_agg(distinct split_part(l,'|',2)) from site_municipal_links s
            cross join lateral jsonb_array_elements_text(s.links) l
           where s.cod_ibge=m.cod_ibge and split_part(l,'|',2) ~ '^https?://'
             and (split_part(l,'|',1) ~* 'transpar|servidor|folha|remunera|pessoal|portal'
               or split_part(l,'|',2) ~* 'transpar|servidor|folha|remunera|pessoal')) sementes
    from municipios_br m left join col c on c.c=m.cod_ibge
   where m.uf=$1 and c.c is null
     and not exists (select 1 from folha_garimpo_uf g where g.cod_ibge=m.cod_ibge and g.veredito='folha')
   order by m.nome`, [UF])).rows;
console.log(`[garimpo/${UF}] ${alvos.length} municípios a garimpar`);

const sem = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function abre(u) {
  try {
    const r = await fetch(u, { headers: H, redirect: "follow", signal: AbortSignal.timeout(30000) });
    const t = await r.text();
    return { http: r.status, html: t, final: r.url };
  } catch (e) { return { http: null, erro: (e.cause?.code || e.name || "").toString().slice(0, 24) }; }
}

// mede se a página É uma tela de folha: tabela + nomes de gente + dinheiro
function mede(html) {
  const ths = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => sem(m[1])).filter(Boolean);
  const divs = [...html.matchAll(/datagrid-text-content[^>]*>([^<]{2,40})</gi)].map((m) => sem(m[1]));
  const cab = [...new Set([...ths, ...divs])];
  const corpo = html.split(/<tbody/i)[1] || "";
  const linhas = (corpo.match(/<tr/gi) || []).length;
  const celulas = [...corpo.matchAll(/<td[^>]*>([\s\S]{0,120}?)<\/td>/gi)].map((m) => sem(m[1]));
  // NOME de gente: célula com 2+ palavras em maiúsculas ou capitalizadas, sem dígitos
  const temNome = celulas.some((c) => /^[A-ZÀ-Ú][A-Za-zÀ-ú'.]+(\s+[A-Za-zÀ-ú'.]+){1,5}$/.test(c) && !/\d/.test(c));
  const temValor = /R\$\s?[\d.]+,\d{2}/.test(corpo) || celulas.some((c) => /^[\d.]{1,12},\d{2}$/.test(c))
    || cab.some((x) => /remuner|l[íi]quid|bruto|sal[áa]rio|vencim|proventos/i.test(x));
  return { linhas, cab: cab.slice(0, 12).join(" | "), temNome, temValor };
}

function linksDe(html, base) {
  const out = [];
  for (const m of html.matchAll(/href="([^"]+)"[^>]*>([\s\S]{0,90}?)<\/a>/gi)) {
    const rot = sem(m[2]);
    if (!RE_PESSOAL.test(rot) && !RE_PESSOAL.test(m[1])) continue;
    if (LIXO.test(m[1]) || LIXO.test(rot)) continue;
    let u; try { u = new URL(m[1], base).href; } catch { continue; }
    if (!/^https?:/.test(u)) continue;
    out.push({ url: u.split("#")[0], rot });
  }
  return out;
}

let i = 0, achados = 0;
async function trab() {
  while (i < alvos.length) {
    const a = alvos[i++];
    const vistos = new Set();
    const fila = (a.sementes || []).slice(0, 12).map((u) => ({ url: u.split("#")[0], rot: "(semente)", nivel: 0, pai: null }));
    let melhor = null, abertas = 0;
    while (fila.length && abertas < TETO_PAG && !melhor) {
      const item = fila.shift();
      if (vistos.has(item.url)) continue;
      vistos.add(item.url); abertas++;
      const d = await abre(item.url);
      if (!d.html) continue;
      const m = mede(d.html);
      const veredito = m.linhas > 1 && m.temValor && m.temNome ? "folha"
        : m.linhas > 1 && m.temNome ? "pessoal_sem_valor"
        : m.linhas > 1 ? "tabela_sem_gente" : "sem_tabela";
      await q(`insert into folha_garimpo_uf (uf,cod_ibge,municipio,url,url_pai,rotulo,nivel,http,linhas,tem_valor,tem_nome,cabecalho,veredito,em)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) on conflict (cod_ibge,url) do update set
        http=excluded.http, linhas=excluded.linhas, tem_valor=excluded.tem_valor, tem_nome=excluded.tem_nome,
        cabecalho=excluded.cabecalho, veredito=excluded.veredito, em=now()`,
        [UF, a.cod_ibge, a.municipio, item.url, item.pai, item.rot.slice(0, 120), item.nivel, d.http,
         m.linhas, m.temValor, m.temNome, m.cab || null, veredito]);
      if (veredito === "folha") { melhor = item.url; achados++;
        console.log(`  ⭐ ${a.municipio}: ${m.linhas} linhas · ${m.cab.slice(0, 62)} → ${item.url.slice(0, 78)}`); break; }
      if (item.nivel === 0) for (const l of linksDe(d.html, d.final).slice(0, 14)) fila.push({ ...l, nivel: 1, pai: item.url });
    }
    if (!melhor && (i % 5 === 0)) console.log(`   ${i}/${alvos.length} · ${achados} com tela de folha`);
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.log("\n── veredito por município (o melhor que se achou em cada um):");
console.table((await q(`select veredito, count(distinct cod_ibge) municipios, count(*) paginas
  from folha_garimpo_uf where uf=$1 group by 1 order by 2 desc`, [UF])).rows);
console.log("── telas de FOLHA achadas:");
console.table((await q(`select municipio, linhas, left(cabecalho,58) cabecalho, left(url,66) url
  from folha_garimpo_uf where uf=$1 and veredito='folha' order by linhas desc`, [UF])).rows);
console.log("── telas de pessoal SEM valor (quadro, não folha):");
console.table((await q(`select municipio, linhas, left(cabecalho,58) cabecalho from folha_garimpo_uf
  where uf=$1 and veredito='pessoal_sem_valor' order by linhas desc limit 12`, [UF])).rows);
await db.end();
