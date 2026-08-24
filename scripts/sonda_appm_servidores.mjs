// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// sonda_appm_servidores.mjs — `transparencia.appm.org.br/{slug}/servidores` é o MESMO CMS do estado, só que
// hospedado no domínio da Associação Piauiense de Municípios (STS Informática).
//
// 🚨 POR QUE ISTO IMPORTA: 114 municípios do PI ficaram como "sem_portal" no coletor de quadro de pessoal
//    porque eu só procurava o portal no domínio DO MUNICÍPIO (`{slug}.pi.gov.br`, `transparencia.{slug}…`).
//    Quem não tem domínio próprio publica no da associação — o portal existe, o meu mapa é que não sabia.
//    ⚠️ "Não achei no domínio dele" ≠ "não publica".
//
// Descobre também o SLUG usado lá, que não é o mesmo do domínio próprio: "assuncaodopiaui" (nome inteiro,
// sem espaço) e não "assuncao". Testo as duas formas.
//
// Uso: node scripts/sonda_appm_servidores.mjs   ·   CONC=10
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { Agent, setGlobalDispatcher } from "undici";
import { pool, withRetry } from "./_cadprev.mjs";

setGlobalDispatcher(new Agent({ connect: { timeout: 25000, rejectUnauthorized: false, family: 4 },
  headersTimeout: 60000, bodyTimeout: 180000 }));

const db = pool(); const q = withRetry(db);
const CONC = Number(process.env.CONC || 10);
const ANO_MAX = Number(process.env.ANO_MAX || new Date().getUTCFullYear());
const H = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };
const HOST = "http://transparencia.appm.org.br";

await q(`create table if not exists pi_appm_sonda (
  cod_ibge text primary key, municipio text, slug text, url text, competencia text,
  linhas int, cabecalho text, tem_valor boolean, situacao text, detalhe text, em timestamptz default now())`);

const semAcento = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const slugs = (nome) => {
  const s = semAcento(nome);
  return [...new Set([
    s.replace(/[^a-z0-9]/g, ""),                               // assuncaodopiaui
    s.replace(/\s+pi$/, "").replace(/[^a-z0-9]/g, ""),         // sem sufixo de UF
    s.replace(/\s+do\s+piaui$/, "").replace(/[^a-z0-9]/g, ""), // assuncao
  ])];
};

const tabs = (await q(`select table_name t from information_schema.tables where table_schema='public'
  and table_name like 'folha_servidores_%'`)).rows.map((r) => r.t);
const partes = [];
for (const t of tabs) {
  const ok = (await q(`select 1 from information_schema.columns where table_name=$1 and column_name='cod_ibge'`, [t])).rowCount;
  if (ok) partes.push(`select distinct left(cod_ibge::text,7) c from ${t} where left(cod_ibge::text,2)='22'`);
}
const alvos = (await q(`
  with col as (${partes.join(" union ")})
  select m.cod_ibge, m.nome municipio from municipios_br m left join col c on c.c=m.cod_ibge
   where m.uf='PI' and c.c is null
     and not exists (select 1 from quadro_pessoal_pi z where z.cod_ibge=m.cod_ibge)
   order by m.nome`)).rows;
console.log(`[appm] ${alvos.length} municípios sem nada, testando no domínio da associação`);

const qs = (ano, mes, off) => `offset=${off}&ano=${ano}&tipo_form=busca&mes=${String(mes).padStart(2, "0")}` +
  `&nome_servidor=&situacao_status=A&cargo=Todos&lotacao=Todos&tipo_vinculo=Todos&fonte_recurso=&page=1`;
const sem = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const linhasDe = (t) => ((t.split(/<tbody/i)[1] || "").match(/<tr/gi) || []).length;

async function pega(u, tent = 2) {
  for (let k = 0; k < tent; k++) {
    try {
      const r = await fetch(u, { headers: H, redirect: "follow", signal: AbortSignal.timeout(60000) });
      if (r.status >= 400) return null;
      return await r.text();
    } catch { if (k === tent - 1) return null; }
  }
  return null;
}

let i = 0, achados = 0, comLinha = 0;
async function trab() {
  while (i < alvos.length) {
    const a = alvos[i++];
    let res = null;
    for (const s of slugs(a.municipio)) {
      const base = `${HOST}/${s}/servidores/`;
      const t0 = await pega(base + "?" + qs(ANO_MAX, 12, 15), 1);
      if (!t0 || !/tipo_form=busca|<th/i.test(t0)) continue;
      const ths = [...t0.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((x) => sem(x[1])).filter(Boolean);
      // a tela existe; agora ando pelos meses procurando uma competência COM linha
      let comp = null, n = 0, valor = false;
      for (const ano of [ANO_MAX, ANO_MAX - 1]) {
        for (let mes = 12; mes >= 1 && !comp; mes--) {
          const t = await pega(base + "?" + qs(ano, mes, 15), 1);
          if (t && linhasDe(t)) { comp = `${ano}${String(mes).padStart(2, "0")}`; n = linhasDe(t); valor = /R\$\s?[\d.]+,\d{2}/.test(t); }
        }
        if (comp) break;
      }
      res = { slug: s, url: base, cab: ths.slice(0, 10).join(" | "), comp, n, valor,
        situacao: comp ? "tem_dados" : "tela_vazia" };
      break;
    }
    if (res) { achados++; if (res.comp) { comLinha++; console.log(`  ✔ ${a.municipio} [${res.slug}]: ${res.n} linhas em ${res.comp}${res.valor ? " COM VALOR" : ""}`); } }
    await q(`insert into pi_appm_sonda (cod_ibge,municipio,slug,url,competencia,linhas,cabecalho,tem_valor,situacao,em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (cod_ibge) do update set slug=excluded.slug,
      url=excluded.url, competencia=excluded.competencia, linhas=excluded.linhas, cabecalho=excluded.cabecalho,
      tem_valor=excluded.tem_valor, situacao=excluded.situacao, em=now()`,
      [a.cod_ibge, a.municipio, res?.slug || null, res?.url || null, res?.comp || null, res?.n || 0,
       res?.cab || null, !!res?.valor, res?.situacao || "sem_tela"]);
    if (i % 20 === 0) console.log(`   ${i}/${alvos.length} · ${achados} com tela · ${comLinha} com linhas`);
  }
}
await Promise.all(Array.from({ length: CONC }, trab));

console.table((await q(`select situacao, count(*) n, count(*) filter (where tem_valor) com_valor, sum(linhas) linhas
  from pi_appm_sonda group by 1 order by 2 desc`)).rows);
console.table((await q(`select competencia, count(*) n from pi_appm_sonda where competencia is not null
  group by 1 order by 1 desc limit 12`)).rows);
await db.end();
