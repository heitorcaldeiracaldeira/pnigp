// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// sonda_receitas_folha.mjs — bate TODAS as receitas de API que já dominamos contra os hosts dos municípios que
// ainda não têm folha. É a lei de retorno nº 1 ([[pnigp-ordem-retorno-resondar-corrigir-criar]]) na sua forma
// mais forte: a sonda original rodou quando conhecíamos 6 receitas; hoje conhecemos mais de uma dúzia.
//
// Cada receita é um teste BARATO e conclusivo (um GET/POST que só o produto certo responde). Quem acender vai
// direto para a fila do coletor correspondente — sem engenharia nova.
//
// Uso: UF=MG node scripts/sonda_receitas_folha.mjs [CONC=12]
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const UF = process.env.UF || "MG";
const CONC = Number(process.env.CONC || 12);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

await q(`create table if not exists folha_receita_achada (
  cod_ibge text, municipio text, uf text, host text, receita text, evidencia text,
  em timestamptz default now(), primary key (cod_ibge, receita))`);

const get = async (url, ms = 15000) => {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json, text/html" }, signal: AbortSignal.timeout(ms), redirect: "follow" });
  return { ok: r.ok, status: r.status, texto: await r.text() };
};

// cada receita: caminho a testar + prova de que é o produto (não basta 200 — ver [[pnigp-sonda-soft404-falso-positivo]])
const RECEITAS = [
  { nome: "spapublico", path: "/publico/versao", prova: (t) => /^v\d/.test(t.trim()) },
  { nome: "contass", path: "/folhadepagamentos/getcompetenciaatual", prova: (t) => /"ano"\s*:\s*\d{4}/.test(t) },
  { nome: "siplanweb", path: "/pessoal/gestao-pessoal", prova: (t) => /grid-pessoal|gestao-pessoal/i.test(t) },
  { nome: "portaltp", path: "/api/dadosabertos.aspx", prova: (t) => /transparencia\.asmx|json_servidores/i.test(t) },
  { nome: "epublica", path: "/epublica-portal/rest/", prova: (t) => /epublica|gestaoDePessoal/i.test(t) },
  { nome: "gwtransparencia", path: "/folha-pagamento", prova: (t) => /SicomFolhaPagamento/i.test(t) },
  { nome: "cidadesmg", path: "/publica/recursosHumanos/", prova: (t) => /recursosHumanos|primefaces/i.test(t) },
  { nome: "scpi", path: "/transparencia/", prova: (t) => /SCPI|LnkServidores|gridPessoal/i.test(t) },
  { nome: "govbr", path: "/pronimtb/index.asp?acao=10&item=8", prova: (t) => /pronim|cmbTipoEsportacaoDados/i.test(t) },
  { nome: "elotech", path: "/transparencia/api/servidores", prova: (t) => /\[|content/.test(t) && t.length > 50 },
  { nome: "publicsoft", path: "/transparencia/servidores", prova: (t) => /publicsoft|servidores/i.test(t) && t.length > 500 },
];

// hosts a testar: tudo que conhecemos do município que ainda não tem folha
const alvos = (await q(`
  with sem as (
    select m.cod_ibge, m.nome municipio, m.uf
      from municipios_br m
      left join (select distinct cod_ibge from mv_folha_mg) f on f.cod_ibge = m.cod_ibge
     where m.uf = $1 and f.cod_ibge is null),
  hosts as (
    select s.cod_ibge, s.municipio, s.uf,
           split_part(regexp_replace(u,'^https?://',''),'/',1) host,
           case when u ~* '^http://' then 'http' else 'https' end proto
      from sem s
      cross join lateral (
        select unnest(array[
          (select p.url_portal_real from portal_real_descoberto p where p.cod_ibge = s.cod_ibge and p.url_portal_real is not null order by p.em desc limit 1),
          (select coalesce(d.url_pessoal, d.url_visitada) from folha_diagnostico_faltante d where d.cod_ibge = s.cod_ibge limit 1),
          (select r.url_portal from radar_portal r where r.cod_ibge = s.cod_ibge and r.unidade_gestora ilike 'Prefeitura%' and coalesce(r.url_portal,'') not in ('','-') limit 1)
        ]) u) x
     where u is not null and u <> '')
  select distinct cod_ibge, municipio, uf, host, proto from hosts where host <> ''`, [UF])).rows;

console.log(`[sonda-receitas] ${alvos.length} hosts de ${new Set(alvos.map((a) => a.cod_ibge)).size} municípios sem folha em ${UF}`);
console.log(`[sonda-receitas] ${RECEITAS.length} receitas × ${alvos.length} hosts`);

let achados = 0, testados = 0;
const porReceita = {};
async function testa(a) {
  for (const rec of RECEITAS) {
    try {
      const r = await get(`${a.proto}://${a.host}${rec.path}`);
      if (r.ok && rec.prova(r.texto)) {
        achados++; porReceita[rec.nome] = (porReceita[rec.nome] || 0) + 1;
        await q(`insert into folha_receita_achada (cod_ibge,municipio,uf,host,receita,evidencia,em)
                 values ($1,$2,$3,$4,$5,$6,now()) on conflict (cod_ibge,receita) do update set host=excluded.host, em=now()`,
          [a.cod_ibge, a.municipio, a.uf, a.host, rec.nome, r.texto.slice(0, 120).replace(/\s+/g, " ")]);
        console.log(`  ⭐ ${a.municipio} → ${rec.nome} (${a.host})`);
        return;   // uma receita basta
      }
    } catch { /* host fora / rota inexistente: é o esperado na maioria */ }
  }
}
for (let i = 0; i < alvos.length; i += CONC) {
  await Promise.all(alvos.slice(i, i + CONC).map(testa));
  testados += Math.min(CONC, alvos.length - i);
  if (i % (CONC * 10) === 0) console.log(`  ${testados}/${alvos.length} hosts · ${achados} achados`);
}
console.log(`\n[sonda-receitas] ${achados} municípios acenderam alguma receita`);
console.table(Object.entries(porReceita).map(([receita, n]) => ({ receita, municipios: n })));
await db.end();
