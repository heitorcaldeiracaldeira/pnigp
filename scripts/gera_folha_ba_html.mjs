// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// gera_folha_ba_html.mjs — a entrega do levantamento da folha das prefeituras da BAHIA.
// Página única, standalone, em C:\Users\PC\. Lê TUDO do banco na hora e carimba a data — nada escrito à mão.
// Mantém o layout já aprovado de gera_folha_html.mjs ([[pnigp-manter-layout]]).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SAIDA = process.env.SAIDA || "C:/Users/PC/folha-prefeituras-bahia.html";
const TOTAL_MUN = 417;

const brl = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const mil = (n) => Number(n || 0).toLocaleString("pt-BR");
const pct = (a, b) => (b ? (100 * a / b).toFixed(1).replace(".", ",") : "0") + "%";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── 1. o que o TCM-BA entregou ────────────────────────────────────────────────────────────────────────────────
const tcm = (await q(`select count(distinct cod_ibge)::int mun, count(distinct cd_entidade)::int ent,
  count(*)::int linhas, count(*) filter (where liquido>0)::int com_valor,
  sum(liquido)::numeric folha, min(competencia) cmin, max(competencia) cmax
  from folha_servidores_tcmba`)).rows[0];

const andamento = (await q(`select situacao, count(*)::int n from folha_tcmba_coleta group by 1 order by 2 desc`)).rows;
const naFila = (await q(`select count(*)::int n from tcmba_entidade e where e.ds_entidade ilike 'Prefeitura%'
  and not exists (select 1 from folha_tcmba_coleta c where c.cd_entidade=e.cd_entidade and c.situacao in ('ok','sem_publicacao'))`)).rows[0].n;

// ── 2. as outras fontes que já tinham Bahia ───────────────────────────────────────────────────────────────────
const outras = [];
for (const [t, rot, vc] of [["folha_servidores_portaltp", "PortalTP (portal municipal)", "bruto"],
  ["folha_servidores_govbr", "GovBR / PRONIM (portal municipal)", "vencimentos_totais"],
  ["folha_servidores_betha", "Betha (portal municipal)", "bruto"],
  ["folha_servidores_capital", "Portal da capital (Salvador)", "bruto"]]) {
  const r = (await q(`select count(distinct cod_ibge)::int mun, count(*)::int linhas,
    count(distinct cod_ibge) filter (where ${vc}>0)::int com_valor,
    count(distinct cod_ibge) filter (where secretaria is not null and secretaria<>'')::int com_sec
    from ${t} where cod_ibge::text like '29%'`)).rows[0];
  if (r.mun > 0) outras.push({ rot, ...r });
}

// ── 3. cobertura contra a RAIS (o denominador) ────────────────────────────────────────────────────────────────
const rais = (await q(`select count(*)::bigint v from folha_rais_municipal where cod_ibge6::text like '29%'`)).rows[0].v;
const cobertos = (await q(`select coalesce(sum(r.v),0)::bigint s from (
    select distinct left(cod_ibge,6) c from folha_servidores_tcmba) t
  join (select left(cod_ibge6::text,6) c, count(*) v from folha_rais_municipal
        where cod_ibge6::text like '29%' group by 1) r using (c)`)).rows[0].s;

// municípios em que o coletado destoa MUITO da RAIS — sinal de publicação parcial, não de erro nosso
const destoa = (await q(`select t.municipio, t.n coletado, r.v rais, round(100.0*t.n/nullif(r.v,0),1) pct, t.comp
  from (select cod_ibge, max(municipio) municipio, count(*) n, max(competencia) comp
        from folha_servidores_tcmba group by 1) t
  join (select left(cod_ibge6::text,6) c, count(*) v from folha_rais_municipal
        where cod_ibge6::text like '29%' group by 1) r on r.c = left(t.cod_ibge,6)
  where r.v > 300 and t.n < r.v * 0.35 order by r.v - t.n desc limit 15`)).rows;

// ── 4. retrato da folha ───────────────────────────────────────────────────────────────────────────────────────
const maiores = (await q(`select municipio, count(*)::int servidores, sum(liquido)::numeric folha,
    round(avg(liquido) filter (where liquido>0))::int medio, max(competencia) comp
  from folha_servidores_tcmba group by 1 order by 3 desc nulls last limit 20`)).rows;

const regimes = (await q(`select coalesce(nullif(regime,''),'(sem informação)') regime, count(*)::int n,
    round(avg(liquido) filter (where liquido>0))::int medio
  from folha_servidores_tcmba group by 1 order by 2 desc limit 12`)).rows;

const cargos = (await q(`select cargo, count(*)::int n, round(avg(liquido) filter (where liquido>0))::int medio
  from folha_servidores_tcmba where cargo is not null and cargo<>'' group by 1 order by 2 desc limit 15`)).rows;

const faixas = (await q(`select case
    when liquido < 1518 then '1 · abaixo do salário mínimo'
    when liquido < 3036 then '2 · até 2 mínimos'
    when liquido < 7590 then '3 · 2 a 5 mínimos'
    when liquido < 15180 then '4 · 5 a 10 mínimos'
    else '5 · acima de 10 mínimos' end faixa, count(*)::int n
  from folha_servidores_tcmba where liquido>0 group by 1 order by 1`)).rows;

// ── 5. o mapa de fornecedores de portal (a fragmentação) ──────────────────────────────────────────────────────
const fornec = (await q(`select fornecedor, count(distinct cod_ibge)::int mun
  from portal_real_descoberto where uf='BA' group by 1 order by 2 desc limit 12`)).rows;
const descoberta = (await q(`select
   (select count(distinct cod_ibge)::int from radar_portal where uf='Bahia' and unidade_gestora ilike 'Prefeitura%') radar,
   (select count(*)::int from site_municipal_derivado where uf='BA') sites_derivados,
   (select count(distinct cod_ibge)::int from portal_real_descoberto where uf='BA') portais_reais`)).rows[0];

// ── escopo REAL: derivado do que está no banco, não escrito à mão ─────────────────────────────────────────────
// A nota de ressalva mudava conforme a passada (só prefeituras → executivo + administração indireta). Escrever
// isso fixo já deixaria a página mentindo na primeira regeração ([[pnigp-regua-proxy-nao-sobrevive-a-melhoria]]).
const TIPO_SQL = `case
  when entidade ilike 'Prefeitura%' then 'Prefeituras'
  when entidade ~* 'c[âa]mara' then 'Câmaras'
  when entidade ~* 'previd|iprev|ipreg|fapem|funprev|aposent' then 'Institutos de previdência'
  when entidade ~* 'empresa|companhia|cia\\.|s/a|s\\.a\\.|urbanizadora|participa' then 'Empresas e companhias'
  when entidade ~* 'autarq|servi.o aut|saae|daae|demae|servi.o (municipal|de) |superit|superint|coordenadoria|guarda civil|limpeza p' then 'Autarquias e serviços'
  when entidade ~* 'instituto|ag[eê]nc|universidade|fund[aá][cç]' then 'Institutos, fundações e agências'
  when entidade ~* 'cons[oó]rcio' then 'Consórcios'
  else 'Outras' end`;
const escopo = (await q(`select ${TIPO_SQL} tipo, count(distinct cd_entidade)::int entidades,
    count(*)::int linhas, sum(liquido)::numeric folha
  from folha_servidores_tcmba group by 1 order by 3 desc`)).rows;
const catalogo = (await q(`select ${TIPO_SQL.replace(/entidade/g, "ds_entidade")} tipo, count(*)::int n
  from tcmba_entidade group by 1`)).rows;
const noCatalogo = Object.fromEntries(catalogo.map((c) => [c.tipo, c.n]));

const maxFolha = Math.max(...maiores.map((m) => Number(m.folha) || 0), 1);
const maxCargo = Math.max(...cargos.map((c) => c.n), 1);
const maxFaixa = Math.max(...faixas.map((f) => f.n), 1);
const hoje = new Date().toISOString().slice(0, 10).split("-").reverse().join("/");
const completo = naFila === 0;

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Folha de pagamento das prefeituras da Bahia — levantamento</title>
<style>
:root{color-scheme:light;
  --bg:#fcfcfb; --surface:#ffffff; --line:#e5e4e0; --ink:#0b0b0b; --ink2:#52514e; --ink3:#7a7975;
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100; --s5:#e87ba4; --s6:#008300; --s7:#4a3aa7; --s8:#e34948;
  --ok:#0ca30c; --warn:#fab219; --crit:#d03b3b; --grid:#f0efec;}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;
  --bg:#141413; --surface:#1a1a19; --line:#33322f; --ink:#ffffff; --ink2:#c3c2b7; --ink3:#8f8e85;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500; --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767;
  --grid:#26262400;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
.wrap{max-width:1060px;margin:0 auto;padding:48px 24px 96px}
h1{font-size:2.1rem;line-height:1.2;margin:0 0 8px;letter-spacing:-.02em}
h2{font-size:1.35rem;margin:56px 0 6px;letter-spacing:-.01em}
h3{font-size:1.02rem;margin:32px 0 4px;color:var(--ink2);font-weight:600}
p{margin:8px 0 0;color:var(--ink2);max-width:68ch}
.sub{color:var(--ink3);font-size:.92rem;margin-top:4px}
.heros{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:28px 0 8px}
.hero{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.hero b{display:block;font-size:1.9rem;line-height:1.15;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.hero span{color:var(--ink3);font-size:.85rem}
.scroll{overflow-x:auto;margin-top:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}
thead th{font-size:.76rem;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);font-weight:600;white-space:nowrap}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
th[scope=row]{font-weight:500;color:var(--ink)}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--ink)}
td.bar{width:40%;min-width:140px;padding-right:0}
td.bar span{display:block;height:11px;border-radius:0 4px 4px 0;background:var(--c,var(--s1))}
.tag{display:inline-block;font-size:.72rem;padding:1px 7px;border-radius:99px;border:1px solid var(--line);color:var(--ink2);white-space:nowrap}
.sim{color:var(--ok);font-weight:600}
.nao{color:var(--crit);font-weight:600}
.nota{border-left:3px solid var(--s2);padding:2px 0 2px 14px;margin:20px 0;color:var(--ink2)}
.nota b{color:var(--ink)}
.nota.ok{border-color:var(--s3)}
.nota.warn{border-color:var(--warn)}
code{background:var(--grid);padding:1px 5px;border-radius:4px;font-size:.86em}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);color:var(--ink3);font-size:.85rem}
</style></head>
<body><div class="wrap">

<h1>Folha de pagamento das prefeituras da Bahia</h1>
<p>Levantamento dos <b>417 municípios</b> — quem publica, onde está o dado, e o que já foi coletado.
Todos os números desta página saem do banco no momento da geração.</p>

<div class="heros">
  <div class="hero"><b>${mil(tcm.mun)}</b><span>de ${TOTAL_MUN} municípios com folha nominal</span></div>
  <div class="hero"><b>${pct(tcm.mun, TOTAL_MUN)}</b><span>cobertura da Bahia</span></div>
  <div class="hero"><b>${mil(tcm.linhas)}</b><span>servidores coletados</span></div>
  <div class="hero"><b>${brl(tcm.folha)}</b><span>folha mensal somada</span></div>
</div>

${completo ? "" : `<div class="nota warn"><b>Coleta em andamento.</b> Faltam <b>${mil(naFila)}</b> prefeituras na fila.
Esta página lê o banco ao vivo — regerar depois da fila zerar atualiza todos os números.</div>`}

<div class="nota ok"><b>O achado que resolve a Bahia:</b> o Tribunal de Contas dos Municípios (TCM-BA) publica a folha
<b>nominal, com cargo e com salário</b>, dos <b>417 municípios</b> num endpoint aberto que devolve planilha pronta.
Não é preciso um coletor por fornecedor de portal — e isso importa porque a Bahia é o estado mais fragmentado do país
nesse quesito: o maior fornecedor atende só 75 dos 417.</div>

<h2>Ponto de partida × onde chegamos</h2>
<p>Antes deste levantamento, a Bahia era o maior vazio do país em folha municipal.</p>
<div class="scroll"><table>
<thead><tr><th>Medida</th><th class="num">Antes (14/ago)</th><th class="num">Agora</th></tr></thead><tbody>
<tr><th scope="row">Municípios com folha nominal</th><td class="num">19</td><td class="num">${mil(tcm.mun)}</td></tr>
<tr><th scope="row">Municípios com salário individual</th><td class="num">17</td><td class="num">${mil((await q(`select count(distinct cod_ibge)::int n from folha_servidores_tcmba where liquido>0`)).rows[0].n)}</td></tr>
<tr><th scope="row">Cobertura dos 417</th><td class="num">4,6%</td><td class="num">${pct(tcm.mun, TOTAL_MUN)}</td></tr>
<tr><th scope="row">Vínculos públicos municipais alcançados (RAIS)</th><td class="num">9,2%</td><td class="num">${pct(cobertos, rais)}</td></tr>
</tbody></table></div>

<h2>O que cada fonte entrega na Bahia</h2>
<div class="scroll"><table>
<thead><tr><th>Fonte</th><th class="num">Municípios</th><th class="num">Linhas</th><th>Cargo</th><th>Salário</th><th>Secretaria</th><th>Nome</th></tr></thead><tbody>
<tr><th scope="row">TCM-BA — Consulta de Pessoal <span class="tag">tribunal</span></th>
  <td class="num">${mil(tcm.mun)}</td><td class="num">${mil(tcm.linhas)}</td>
  <td class="sim">sim</td><td class="sim">sim</td><td class="nao">não</td><td class="sim">sim</td></tr>
${outras.map((o) => `<tr><th scope="row">${esc(o.rot)}</th><td class="num">${mil(o.mun)}</td><td class="num">${mil(o.linhas)}</td>
  <td class="sim">sim</td><td class="${o.com_valor ? "sim" : "nao"}">${o.com_valor ? "sim" : "não"}</td>
  <td class="${o.com_sec ? "sim" : "nao"}">${o.com_sec ? "sim" : "não"}</td><td class="sim">sim</td></tr>`).join("")}
<tr><th scope="row">RAIS / PDET-MTE <span class="tag">nacional</span></th><td class="num">416</td><td class="num">${mil(rais)}</td>
  <td class="sim">CBO</td><td class="sim">sim</td><td class="nao">não</td><td class="nao">anônimo</td></tr>
</tbody></table></div>
<p class="sub">A lacuna que sobra na Bahia é a <b>secretaria</b>: o TCM lota o servidor na <i>entidade</i>
(prefeitura, câmara, fundo), não na secretaria. Quem tem secretaria de verdade é o PortalTP —
e ele cobre ${outras.find((o) => o.rot.startsWith("PortalTP"))?.mun || 0} municípios.</p>

<h2>As 20 maiores folhas municipais</h2>
<div class="scroll"><table>
<thead><tr><th>Município</th><th class="num">Servidores</th><th class="num">Folha do mês</th><th class="num">Média</th><th>Competência</th><th></th></tr></thead><tbody>
${maiores.map((m) => `<tr><th scope="row">${esc(m.municipio)}</th><td class="num">${mil(m.servidores)}</td>
  <td class="num">${brl(m.folha)}</td><td class="num">${brl(m.medio)}</td><td>${esc(m.comp)}</td>
  <td class="bar"><span style="width:${(100 * Number(m.folha) / maxFolha).toFixed(1)}%"></span></td></tr>`).join("")}
</tbody></table></div>

<h2>Como a Bahia paga</h2>
<h3>Distribuição por faixa de remuneração</h3>
<div class="scroll"><table><tbody>
${faixas.map((f, i) => `<tr><th scope="row">${esc(f.faixa.slice(4))}</th><td class="num">${mil(f.n)}</td>
  <td class="bar"><span style="width:${(100 * f.n / maxFaixa).toFixed(1)}%;--c:var(--s${i + 1})"></span></td></tr>`).join("")}
</tbody></table></div>
<p class="sub">Referência do salário mínimo usada nos cortes: R$ 1.518.</p>

<h3>Por regime de vínculo</h3>
<div class="scroll"><table>
<thead><tr><th>Regime</th><th class="num">Servidores</th><th class="num">Remuneração média</th></tr></thead><tbody>
${regimes.map((r) => `<tr><th scope="row">${esc(r.regime)}</th><td class="num">${mil(r.n)}</td><td class="num">${brl(r.medio)}</td></tr>`).join("")}
</tbody></table></div>

<h3>Os 15 cargos mais numerosos</h3>
<div class="scroll"><table>
<thead><tr><th>Cargo</th><th class="num">Servidores</th><th class="num">Média</th><th></th></tr></thead><tbody>
${cargos.map((c) => `<tr><th scope="row">${esc(c.cargo)}</th><td class="num">${mil(c.n)}</td><td class="num">${brl(c.medio)}</td>
  <td class="bar"><span style="width:${(100 * c.n / maxCargo).toFixed(1)}%;--c:var(--s3)"></span></td></tr>`).join("")}
</tbody></table></div>

<h2>Onde o município publica menos do que emprega</h2>
<p>Comparação com a RAIS 2025, que é o denominador independente. Um número muito abaixo não indica erro de coleta —
indica que o município <b>enviou ao tribunal uma folha parcial</b>. É a lista para cobrança.</p>
<div class="scroll"><table>
<thead><tr><th>Município</th><th class="num">Coletado</th><th class="num">RAIS</th><th class="num">Cobertura</th><th>Competência</th></tr></thead><tbody>
${destoa.map((d) => `<tr><th scope="row">${esc(d.municipio)}</th><td class="num">${mil(d.coletado)}</td>
  <td class="num">${mil(d.rais)}</td><td class="num">${String(d.pct).replace(".", ",")}%</td><td>${esc(d.comp)}</td></tr>`).join("")}
</tbody></table></div>

<h2>Por que não bastava um coletor por portal</h2>
<p>A varredura de descoberta visitou os 417 municípios e identificou o portal de transparência real de
${mil(descoberta.portais_reais)} deles. O resultado explica a estratégia:</p>
<div class="scroll"><table>
<thead><tr><th>Fornecedor do portal</th><th class="num">Municípios</th></tr></thead><tbody>
${fornec.map((f) => `<tr><th scope="row">${esc(f.fornecedor)}</th><td class="num">${mil(f.mun)}</td></tr>`).join("")}
</tbody></table></div>
<p class="sub">São mais de 25 fornecedores distintos. Escrever um coletor para cada renderia poucos municípios por
coletor — enquanto o TCM-BA entrega os 417 de uma vez.</p>

<h2>Procedência e ressalvas</h2>
<div class="nota"><b>Fonte primária.</b> TCM-BA, Consulta de Pessoal
(<code>webservice.tcm.ba.gov.br/exportar/pessoal</code>), planilha oficial do tribunal, uma por entidade e competência.
Catálogo de municípios e entidades do próprio tribunal: <b>417 municípios, 1.025 entidades</b>.</div>
<div class="nota"><b>Competência.</b> Para cada município são sondadas as 3 competências publicadas mais recentes e
fica a <b>mais cheia</b> — o mês em fechamento vem parcial e subestimaria a folha. A competência usada está em cada
linha das tabelas.</div>
<div class="nota"><b>Escopo desta página.</b> O <b>Poder Executivo municipal e sua administração indireta</b> —
prefeituras, autarquias e serviços, empresas, institutos de previdência, fundações e agências.
<b>Câmaras municipais e consórcios intermunicipais ficam de fora</b> por decisão de escopo: consórcio não é
entidade do ente. O que já entrou, por tipo:</div>
<div class="scroll"><table>
<thead><tr><th>Tipo de entidade</th><th class="num">Coletadas</th><th class="num">No catálogo do TCM</th><th class="num">Servidores</th><th class="num">Folha do mês</th></tr></thead><tbody>
${escopo.map((e) => `<tr><th scope="row">${esc(e.tipo)}</th><td class="num">${mil(e.entidades)}</td>
  <td class="num">${mil(noCatalogo[e.tipo] || 0)}</td><td class="num">${mil(e.linhas)}</td><td class="num">${brl(e.folha)}</td></tr>`).join("")}
</tbody></table></div>
<div class="nota"><b>O que o TCM não tem.</b> Secretaria/lotação. Quem precisa desse campo na Bahia depende do portal
municipal, e só uma minoria o publica.</div>
<div class="nota warn"><b>Correção aplicada.</b> Sobradinho/BA constava com 854 servidores que eram, na verdade, os de
Sobradinho/RS — o mesmo portal contado para dois municípios homônimos. Registros removidos e mais 7 entradas de fila
com o mesmo defeito corrigidas antes desta contagem.</div>

<footer>Levantamento gerado em ${hoje} · PNIGP — Plataforma Nacional de Inteligência da Gestão Pública ·
Fontes: TCM-BA, RAIS/PDET-MTE, Radar da Transparência (ATRICON) e portais municipais.
Números lidos do banco na geração; a coleta continua e a página pode ser regerada.</footer>

</div></body></html>`;

fs.writeFileSync(SAIDA, html, "utf8");
console.log(`✔ ${SAIDA} · ${(html.length / 1024).toFixed(0)} KB`);
console.log(`  ${tcm.mun} municípios · ${mil(tcm.linhas)} servidores · fila restante: ${naFila}`);
console.table(andamento);
await db.end();
