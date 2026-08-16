// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// gera_folha_mtms_html.mjs — a entrega do levantamento da folha de MT e MS: página única, standalone, em C:\Users\PC\.
// Lê TUDO do banco no momento da geração e carimba a data — nada de número escrito à mão.
// Régua idêntica à do RS/PR: competência mais CHEIA por município, servidores distintos, denominador RAIS.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SAIDA = process.env.SAIDA || "C:/Users/PC/folha-municipal-mt-ms.html";
const UFS = [{ sg: "MT", cod: "51", nome: "Mato Grosso" }, { sg: "MS", cod: "50", nome: "Mato Grosso do Sul" }];

const mil = (n) => Number(n || 0).toLocaleString("pt-BR");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : "0.0");

// ── 1. o que está coletado: mesma régua do PR (fontes do catálogo, competência mais cheia) ─────────────────────
const COMP = ["competencia", "referencia", "anomes", "exercicio", "mes_referencia"];
const FONTES = {};
for (const r of (await q(`select table_name t from information_schema.tables
  where table_schema='public' and table_name like 'folha_servidores_%' order by 1`)).rows) {
  const cols = (await q(`select column_name c from information_schema.columns where table_name=$1`, [r.t])).rows.map(x => x.c);
  if (!cols.includes("cod_ibge")) continue;
  const c = COMP.find(x => cols.includes(x));
  if (c) FONTES[r.t.replace("folha_servidores_", "")] = { comp: c, cols };
}
const ident = (f) => {
  const p = ["nome", "matricula", "chapa", "cpf_masc"].filter(c => FONTES[f].cols.includes(c)).map(c => `coalesce(s.${c}::text,'')`);
  return p.length ? p.join(" || '¦' || ") : "s.cod_ibge";
};
// 🚨 a coluna do dinheiro tem NOME DIFERENTE em cada ERP — lista curta faz o município parecer "coletado sem valor"
const qualid = (f) => {
  const has = (c) => FONTES[f].cols.includes(c);
  const sal = ["salario_bruto", "bruto", "remuneracao", "provento", "proventos", "vencimentos_totais",
    "total_vencimentos", "vantagens", "salario_base", "salario", "valor", "liquido"].find(has);
  const car = ["cargo", "descricao_cargo", "funcao"].find(has);
  const sec = ["secretaria", "lotacao", "orgao", "unidade"].find(has);
  return {
    sal: sal ? `count(*) filter (where s.${sal} is not null and s.${sal}::numeric > 0)` : "0",
    car: car ? `count(*) filter (where s.${car} is not null and btrim(s.${car}::text) not in ('','-'))` : "0",
    sec: sec ? `count(*) filter (where s.${sec} is not null and btrim(s.${sec}::text) not in ('','-'))` : "0",
    med: sal ? `percentile_cont(0.5) within group (order by s.${sal}::numeric) filter (where s.${sal}::numeric > 0)` : "null",
  };
};
const partes = Object.keys(FONTES).map(f => {
  const Q = qualid(f);
  return `select '${f}' fonte, s.cod_ibge, coalesce(s.${FONTES[f].comp}::text,'—') comp,
            count(distinct ${ident(f)}) n, ${Q.sal} c_sal, ${Q.car} c_car, ${Q.sec} c_sec, ${Q.med} mediana
       from folha_servidores_${f} s where left(s.cod_ibge,2) in ('50','51') group by 1,2,3`;
}).join("\n union all ");

const col = (await q(`with bruto as (${partes})
  select distinct on (fonte, cod_ibge) * from bruto order by fonte, cod_ibge, n desc`)).rows;

const porMun = new Map();
for (const r of col) {
  const v = { ...r, n: +r.n };
  const cur = porMun.get(r.cod_ibge);
  if (!cur || v.n > cur.n) porMun.set(r.cod_ibge, v);
}

const muns = (await q(`select cod_ibge, nome, uf from municipios_br where uf in ('MT','MS') order by uf, nome`)).rows;
const raisAno = (await q(`select max(ano) a from folha_rais_municipal`)).rows[0].a;
const rais = new Map((await q(`select lpad(cod_ibge6,6,'0') i6, count(*)::int a from folha_rais_municipal
  where ano=$1 and esfera_grupo='municipal' and ativo_3112 and left(lpad(cod_ibge6,6,'0'),2) in ('50','51')
  group by 1`, [raisAno])).rows.map(r => [r.i6, r.a]));

// ── 2. classificação do portal REAL dos faltantes (o host diz o produto) ───────────────────────────────────────
const PRODUTO = [
  [/esaude\.genesiscloud|\/esaude|saude\.betha\.cloud/i, "portal de SAÚDE", "nao_folha"],
  [/^https?:\/\/(www\.)?(portal)?transparencia\.gov\.br/i, "Portal da Transparência FEDERAL", "nao_folha"],
  [/e-nota|nota-eletronica|nfse/i, "NFS-e", "nao_folha"],
  [/frotas\.igtcard/i, "gestão de frotas", "nao_folha"],
  // 🚨 o portal descoberto pode ser o da CÂMARA, não o da prefeitura — coletar de lá dá 50 pessoas num
  // município de 2 mil vínculos e o número parece coleta quebrada ([[pnigp-entidade-espelho-infla-folha]])
  [/\.leg\.br|camara[a-z]*\.|\/camara/i, "portal da CÂMARA (não é a prefeitura)", "nao_folha"],
  [/scpi|:8079|:5656|:8076|:8078|:8443|:5661|rcmsuporte|biosnet|dcfiorilli|fiorilli|fassilcloud|\/transparencia\/Default\.aspx/i, "SCPI / Fiorilli", "coletor"],
  [/oxy\.elotech|elotech/i, "Elotech", "coletor"],
  [/portalcr2|cr2transparencia/i, "CR2", "coletor"],
  [/transparencia\.betha\.cloud|e-gov\.betha|betha/i, "Betha", "coletor"],
  [/atende\.net/i, "IPM Atende.net", "coletor"],
  [/cidadesdoe\.serpro|govbr|cidade360|pronim/i, "GovBR / PRONIM", "coletor"],
  [/megasoft/i, "MegaSoft", "coletor"],
  [/nucleogov/i, "NucleoGov", "coletor"],
  // o coletor GeneXus lê o layout v1 (asp.srv.br, com secretaria); o v2 (gp.srv.br) está mapeado mas o fluxo
  // de export ainda não foi escrito — honestidade de banda: v2 conta como "sem coletor", não como pronto
  [/gp\.srv\.br/i, "GeneXus v2 (gp.srv.br) — fluxo não implementado", "sem_coletor"],
  [/asp\.srv\.br|\.srv\.br\/transparencia/i, "GeneXus v1 (asp.srv.br)", "coletor"],
  [/equiplano/i, "Equiplano", "coletor"],
  [/portaltp/i, "Portal TP", "coletor"],
  [/agilicloud|agiliblue/i, "Agili", "sem_coletor"],
  [/qualitysistemas/i, "Quality Sistemas", "sem_coletor"],
  [/ocmblue/i, "OCM Blue", "sem_coletor"],
  [/consultatransparencia/i, "Consulta Transparência", "sem_coletor"],
  [/i7sgp|tcloud-/i, "i7 SGP", "sem_coletor"],
  [/sistemasbds/i, "BDS", "sem_coletor"],
  [/pentagonosistemas/i, "Pentágono", "sem_coletor"],
  [/forgov/i, "ForGov", "sem_coletor"],
  [/abaco/i, "Ábaco", "sem_coletor"],
  [/publicacoesmunicipais/i, "Publicações Municipais", "sem_coletor"],
  [/instar/i, "Instar (CMS do site, não é ERP de folha)", "nao_folha"],
];
const classifica = (u) => PRODUTO.find(([re]) => re.test(u || "")) || null;

const ctx = new Map((await q(`
  select m.cod_ibge, e.erp erp_ident, e.url url_ident, r.erp erp_radar, r.url_erp, r.url_portal,
         r.nivel_transparencia, p.url_portal_real, d.veredito, d.produto produto_diag, d.url_pessoal
    from municipios_br m
    left join erp_portal_municipal e on e.cod_ibge = m.cod_ibge
    left join lateral (select erp, url_erp, url_portal, nivel_transparencia from radar_portal r2
                        where r2.cod_ibge=m.cod_ibge and r2.unidade_gestora ilike 'Prefeitura%'
                        order by (r2.erp is null) limit 1) r on true
    left join lateral (select url_portal_real from portal_real_descoberto p2
                        where p2.cod_ibge=m.cod_ibge and p2.url_portal_real is not null order by em desc limit 1) p on true
    left join folha_diagnostico_faltante d on d.cod_ibge = m.cod_ibge
   where m.uf in ('MT','MS')`)).rows.map(r => [r.cod_ibge, r]));

const linhas = muns.map(m => {
  const c = porMun.get(m.cod_ibge), x = ctx.get(m.cod_ibge) || {}, r = rais.get(m.cod_ibge.slice(0, 6)) || 0;
  const urls = [x.url_portal_real, x.url_pessoal, x.url_erp, x.url_ident, x.url_portal].filter(Boolean);
  let prod = null;
  for (const u of urls) { const k = classifica(u); if (k) { prod = { nome: k[1], classe: k[2], url: u }; break; } }
  if (!prod && (x.erp_ident || x.erp_radar || x.produto_diag)) {
    const k = classifica(x.erp_ident || x.erp_radar || x.produto_diag);
    prod = k ? { nome: k[1], classe: k[2], url: urls[0] || "" }
             : { nome: x.erp_ident || x.erp_radar || x.produto_diag, classe: "sem_coletor", url: urls[0] || "" };
  }
  return {
    ...m, ...x, rais: r,
    fonte: c?.fonte || null, comp: c?.comp || null, n: c ? +c.n : 0,
    v: c ? +c.c_sal > 0 : false, ca: c ? +c.c_car > 0 : false, se: c ? +c.c_sec > 0 : false,
    razao: c && r ? +(c.n / r).toFixed(2) : null,
    produto: prod?.nome || null, classe: prod?.classe || null, url_real: prod?.url || urls[0] || "",
  };
});

const porUF = UFS.map(u => {
  const l = linhas.filter(x => x.uf === u.sg);
  const com = l.filter(x => x.fonte);
  return {
    ...u, total: l.length, com: com.length, valor: com.filter(x => x.v).length,
    completo: com.filter(x => x.v && x.ca && x.se).length,
    serv: com.reduce((s, x) => s + x.n, 0), rais: l.reduce((s, x) => s + x.rais, 0),
    sub: com.filter(x => x.razao != null && x.razao < 0.5).length,
  };
});
const G = porUF.reduce((a, u) => ({ total: a.total + u.total, com: a.com + u.com, valor: a.valor + u.valor,
  completo: a.completo + u.completo, serv: a.serv + u.serv, rais: a.rais + u.rais, sub: a.sub + u.sub }),
  { total: 0, com: 0, valor: 0, completo: 0, serv: 0, rais: 0, sub: 0 });

// por fonte
const porFonte = {};
for (const l of linhas.filter(x => x.fonte)) {
  const f = porFonte[l.fonte] ??= { mun: 0, serv: 0, val: 0, comp: 0 };
  f.mun++; f.serv += l.n; if (l.v) f.val++; if (l.v && l.ca && l.se) f.comp++;
}
// faltantes por produto
const falt = linhas.filter(x => !x.fonte);
const porProduto = {};
for (const l of falt) {
  const k = l.produto || "— portal não identificado";
  const p = porProduto[k] ??= { mun: 0, rais: 0, classe: l.classe || "desconhecido", ex: [] };
  p.mun++; p.rais += l.rais; if (p.ex.length < 4) p.ex.push(l.nome);
}
const ORD = { coletor: 0, sem_coletor: 1, desconhecido: 2, nao_folha: 3 };
const ROT = { coletor: "coletor pronto", sem_coletor: "sem coletor", desconhecido: "a descobrir", nao_folha: "não é folha" };

const banda = { coletor: 0, sem_coletor: 0, desconhecido: 0, nao_folha: 0 };
const bandaRais = { coletor: 0, sem_coletor: 0, desconhecido: 0, nao_folha: 0 };
for (const l of falt) { const k = l.classe || "desconhecido"; banda[k]++; bandaRais[k] += l.rais; }

// ── 3. a camada dos TRIBUNAIS DE CONTAS ────────────────────────────────────────────────────────────────────
// TCE-MT publica pessoal dos jurisdicionados (Radar Pessoal, Qlik); TCE-MS não — o e-Sfinge de lá é contábil.
const temTcemt = (await q(`select count(*) n from information_schema.tables where table_name='folha_tcemt_radar'`)).rows[0].n > 0;
const tcemt = temTcemt ? (await q(`select count(distinct cod_ibge) municipios, sum(agentes) agentes,
    sum(remuneracao) remuneracao, max(ano_folha) ano from folha_tcemt_radar where esfera ilike '%MUNICIPAL%'`)).rows[0] : null;
const tcemtMun = temTcemt ? new Map((await q(`select cod_ibge, sum(agentes) agentes, sum(remuneracao) remuneracao
    from folha_tcemt_radar where esfera ilike '%MUNICIPAL%' group by 1`)).rows.map(r => [r.cod_ibge, r])) : new Map();
const temSh = (await q(`select count(*) n from information_schema.tables where table_name='tc_ms_software_house'`)).rows[0].n > 0;
const shMs = temSh ? (await q(`select razao_social, count(*) municipios from tc_ms_software_house group by 1 order by 2 desc`)).rows : [];
const shMun = temSh ? new Map((await q(`select cod_ibge, razao_social from tc_ms_software_house`)).rows.map(r => [r.cod_ibge, r.razao_social])) : new Map();
for (const l of linhas) { l.tcemt = tcemtMun.get(l.cod_ibge) || null; l.erp_tce = shMun.get(l.cod_ibge) || null; }
// cobertura combinada: folha própria do município OU camada do tribunal
const combinado = UFS.map(u => {
  const l = linhas.filter(x => x.uf === u.sg);
  return { ...u, total: l.length, n: l.filter(x => x.fonte || (x.tcemt && +x.tcemt.agentes > 0)).length };
});
const GC = combinado.reduce((a, u) => ({ total: a.total + u.total, n: a.n + u.n }), { total: 0, n: 0 });

const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
const barra = (v, max, cor) => `<td class="bar"><span style="width:${pct(v, max)}%;--c:var(--${cor})"></span></td>`;
const maxFonte = Math.max(...Object.values(porFonte).map(f => f.serv), 1);
const maxProd = Math.max(...Object.values(porProduto).map(p => p.rais), 1);

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Folha de pagamento municipal — Mato Grosso e Mato Grosso do Sul</title>
<style>
:root{color-scheme:light;--bg:#faf9f5;--surface:#fff;--line:#e5e3dc;--ink:#141413;--ink2:#4a4844;--ink3:#7a776f;
  --s1:#2f6fd0;--s2:#c4501f;--s3:#158060;--s4:#a86f00;--s5:#b8446e;--s6:#006b00;--s7:#6f63c9;--s8:#c95555;
  --ok:#158060;--crit:#c4501f;--grid:#f0efe9;}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;
  --bg:#141413;--surface:#1a1a19;--line:#33322f;--ink:#fff;--ink2:#c3c2b7;--ink3:#8f8e85;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;
  --ok:#199e70;--crit:#d95926;--grid:#262624;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1060px;margin:0 auto;padding:48px 24px 96px}
h1{font-size:2.1rem;line-height:1.2;margin:0 0 8px;letter-spacing:-.02em}
h2{font-size:1.35rem;margin:56px 0 6px;letter-spacing:-.01em}
h3{font-size:1.02rem;margin:32px 0 4px;color:var(--ink2);font-weight:600}
p{margin:8px 0 0;color:var(--ink2);max-width:68ch}
.sub{color:var(--ink3);font-size:.92rem;margin-top:4px}
.heros{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:28px 0 8px}
.hero{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.hero b{display:block;font-size:1.9rem;line-height:1.15;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.hero span{color:var(--ink3);font-size:.85rem}
.scroll{overflow-x:auto;margin-top:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}
thead th{font-size:.76rem;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);font-weight:600;white-space:nowrap}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
th[scope=row]{font-weight:500;color:var(--ink)}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.bar{width:34%;min-width:120px;padding-right:0}
td.bar span{display:block;height:11px;border-radius:0 4px 4px 0;background:var(--c,var(--s1))}
.tag{display:inline-block;font-size:.72rem;padding:1px 7px;border-radius:99px;border:1px solid var(--line);color:var(--ink2);white-space:nowrap}
.tag.ok{border-color:var(--ok);color:var(--ok)}.tag.no{border-color:var(--crit);color:var(--crit)}
.sim{color:var(--ok);font-weight:600}.nao{color:var(--ink3)}
.nota{border-left:3px solid var(--s2);padding:2px 0 2px 14px;margin:20px 0;color:var(--ink2)}
.nota b{color:var(--ink)}
code{background:var(--grid);padding:1px 5px;border-radius:4px;font-size:.86em}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);color:var(--ink3);font-size:.85rem}
</style></head><body><div class="wrap">

<h1>Folha de pagamento municipal — Mato Grosso e Mato Grosso do Sul</h1>
<p>Levantamento do que existe hoje em dado público sobre os servidores dos <b>${G.total} municípios</b> dos dois
estados: quem já foi coletado, com que qualidade, e o motivo — medido, não estimado — de cada município que falta.</p>

<div class="heros">
  <div class="hero"><b>${G.com}</b><span>de ${G.total} municípios com folha nominal (${pct(G.com, G.total)}%)</span></div>
  <div class="hero"><b>${mil(G.serv)}</b><span>servidores coletados (${pct(G.serv, G.rais)}% da RAIS)</span></div>
  <div class="hero"><b>${G.completo}</b><span>completos: cargo + salário + secretaria</span></div>
  <div class="hero"><b>${GC.n}</b><span>com folha por alguma via, somando o tribunal (${pct(GC.n, GC.total)}%)</span></div>
</div>
<p class="sub">RAIS ${raisAno}: ${mil(G.rais)} vínculos municipais ativos em 31/12 nos dois estados — o denominador.</p>

<div class="nota"><b>A régua.</b> Um município só conta como coletado quando existe folha <b>nominal</b> no banco.
Para cada um, vale a <b>competência mais cheia</b> — não a mais recente, porque o mês corrente vem parcial e
subcontaria o município. O denominador é a <b>RAIS ${raisAno}</b> (vínculos municipais ativos em 31/12), a única base
que cobre os 5.570 municípios do país. Nenhum número aqui é projeção.</div>

<h2>Os dois estados, lado a lado</h2>
<div class="scroll"><table>
<thead><tr><th>Estado</th><th class="num">Municípios</th><th>Cobertura</th><th class="num">Com folha</th>
<th class="num">%</th><th class="num">Completos</th><th class="num">Servidores</th><th class="num">RAIS</th><th class="num">% pessoas</th></tr></thead>
<tbody>${porUF.map(u => `<tr><th scope="row">${u.nome}</th>
  <td class="num">${u.total}</td>
  ${barra(u.com, u.total, "s1")}
  <td class="num">${u.com}</td><td class="num">${pct(u.com, u.total)}%</td>
  <td class="num">${u.completo}</td><td class="num">${mil(u.serv)}</td>
  <td class="num">${mil(u.rais)}</td><td class="num">${pct(u.serv, u.rais)}%</td></tr>`).join("")}
</tbody></table></div>
<p class="sub">"Completo" = os três campos que interessam (cargo, salário e secretaria) existem de fato nas linhas
daquele município. Cobertura em municípios e em servidores não andam juntas: as duas capitais e as maiores cidades
concentram a folha e ainda estão fora.</p>

<h2>A segunda via: os tribunais de contas</h2>
<p>Os dois tribunais foram medidos direto, não pelo catálogo. O resultado é assimétrico e muda o mapa de um dos
estados por completo.</p>
${tcemt ? `
<div class="heros">
  <div class="hero"><b>${tcemt.municipios}</b><span>municípios de MT no Radar Pessoal do TCE-MT</span></div>
  <div class="hero"><b>${mil(tcemt.agentes)}</b><span>agentes públicos municipais (${esc(tcemt.ano)})</span></div>
  <div class="hero"><b>R$ ${(Number(tcemt.remuneracao) / 1e9).toFixed(2)} bi</b><span>remuneração no exercício</span></div>
  <div class="hero"><b>0</b><span>municípios de MS no TCE-MS</span></div>
</div>` : ""}
<div class="nota"><b>TCE-MT — publica, e com o grão mais fino que existe.</b> O <b>Radar Pessoal</b>
(<code>radarpessoal.tce.mt.gov.br</code>, Qlik Sense) traz os agentes públicos dos jurisdicionados com
<b>nome, CPF, cargo, lotação, município, vínculo, situação e valor de cada rubrica</b> — os cinco campos que
nenhuma base nacional entrega juntos. São 269.221 agentes no total do estado; ${tcemt ? mil(tcemt.agentes) : "—"}
na esfera municipal, distribuídos pelos ${tcemt ? tcemt.municipios : "—"} municípios. É a única fonte que cobre
MT inteiro de uma vez.</div>
<div class="nota"><b>TCE-MS — não publica pessoal dos municípios.</b> O portal
<code>transparencia.tce.ms.gov.br</code> é a transparência <b>do próprio tribunal</b> (o item "Pessoal" são os
servidores do TCE). O hub Qlik <code>painel.tce.ms.gov.br</code> é anônimo e tem 10 painéis — e-Sfinge, IEGM,
IEGE, Educação, Banco de Preços, PREVAD —, <b>nenhum de pessoal</b>: os módulos do e-Sfinge são Atos Jurídicos,
Execução Orçamentária, Gestão Fiscal, Planejamento, Registros Contábeis e Tributário. Para MS, o caminho do dado
continua sendo o portal de cada município — ou pedido por LAI.</div>
${shMs.length ? `
<h3>O que o TCE-MS entrega em troca: o cadastro oficial de ERP dos 79 municípios</h3>
<p>O e-Sfinge publica qual empresa processa a remessa contábil de cada prefeitura de MS. Não é o sistema da folha
— mas é o próprio tribunal dizendo qual fornecedor está dentro de cada município, o que substitui adivinhação por
cadastro na hora de escolher qual coletor escrever.</p>
<div class="scroll"><table>
<thead><tr><th>Empresa</th><th>Municípios</th><th class="num">Municípios</th><th>Coletor</th></tr></thead>
<tbody>${shMs.map(s => {
  const temColetor = /FIORILLI|BETHA|MEGASOFT|GOVERNANCA|ELOTECH/i.test(s.razao_social);
  return `<tr><th scope="row">${esc(s.razao_social)}</th>
    ${barra(Number(s.municipios), Math.max(...shMs.map(x => Number(x.municipios))), temColetor ? "s3" : "s4")}
    <td class="num">${s.municipios}</td>
    <td><span class="tag ${temColetor ? "ok" : ""}">${temColetor ? "pronto" : "a escrever"}</span></td></tr>`;
}).join("")}
</tbody></table></div>` : ""}

<h2>Por onde o dado entrou (o ERP do município)</h2>
<div class="scroll"><table>
<thead><tr><th>Fonte</th><th>Servidores</th><th class="num">Servidores</th><th class="num">Municípios</th>
<th class="num">Com salário</th><th class="num">Completos</th></tr></thead>
<tbody>${Object.entries(porFonte).sort((a, b) => b[1].serv - a[1].serv).map(([f, v]) =>
  `<tr><th scope="row">${esc(f)}</th>${barra(v.serv, maxFonte, "s3")}
   <td class="num">${mil(v.serv)}</td><td class="num">${v.mun}</td>
   <td class="num">${v.val}</td><td class="num">${v.comp}</td></tr>`).join("")}
</tbody></table></div>

<h2>Os ${falt.length} municípios que faltam — por que faltam</h2>
<p>Esta é a parte que decide o esforço. O portal de transparência real de cada município foi visitado e o
<b>produto</b> por trás dele identificado pelo host. Onde já existe coletor, falta tempo de máquina; onde não
existe, falta engenharia; e onde o portal não publica pessoal, nenhum código resolve — é pedido por LAI.</p>
<div class="heros">
  <div class="hero"><b>${banda.coletor}</b><span>ERP com coletor pronto · ${mil(bandaRais.coletor)} servidores</span></div>
  <div class="hero"><b>${banda.sem_coletor}</b><span>ERP sem coletor · ${mil(bandaRais.sem_coletor)} servidores</span></div>
  <div class="hero"><b>${banda.desconhecido}</b><span>portal a descobrir · ${mil(bandaRais.desconhecido)} servidores</span></div>
  <div class="hero"><b>${banda.nao_folha}</b><span>portal não é de folha · ${mil(bandaRais.nao_folha)} servidores</span></div>
</div>
<div class="scroll"><table>
<thead><tr><th>Produto do portal</th><th>Situação</th><th>Servidores (RAIS)</th><th class="num">RAIS</th>
<th class="num">Municípios</th><th>Exemplos</th></tr></thead>
<tbody>${Object.entries(porProduto).sort((a, b) => (ORD[a[1].classe] - ORD[b[1].classe]) || b[1].rais - a[1].rais)
  .map(([k, v]) => `<tr><th scope="row">${esc(k)}</th>
   <td><span class="tag ${v.classe === "coletor" ? "ok" : v.classe === "nao_folha" ? "no" : ""}">${ROT[v.classe] || v.classe}</span></td>
   ${barra(v.rais, maxProd, v.classe === "coletor" ? "s3" : v.classe === "nao_folha" ? "s8" : "s4")}
   <td class="num">${mil(v.rais)}</td><td class="num">${v.mun}</td>
   <td class="sub">${esc(v.ex.join(", "))}</td></tr>`).join("")}
</tbody></table></div>
<div class="nota"><b>Cuidado que este levantamento pegou:</b> o rótulo do cadastro não é o portal da folha.
Cinco municípios estavam apontados para um portal de <b>saúde</b>, dois para o <b>Portal da Transparência federal</b>
(que não tem folha municipal) e outros para NFS-e, gestão de frotas ou para o CMS do site institucional. Tratar
esses rótulos como ERP levaria a escrever coletor para algo que não existe.</div>

<h2>Os maiores buracos individuais</h2>
<div class="scroll"><table>
<thead><tr><th>Município</th><th>UF</th><th class="num">Servidores (RAIS)</th><th>Produto do portal</th><th>Portal real</th></tr></thead>
<tbody>${falt.sort((a, b) => b.rais - a.rais).slice(0, 20).map(l => `<tr>
  <th scope="row">${esc(l.nome)}</th><td>${l.uf}</td><td class="num">${mil(l.rais)}</td>
  <td>${l.produto ? esc(l.produto) : '<span class="nao">a descobrir</span>'}</td>
  <td class="sub">${esc((l.url_real || "").slice(0, 54))}</td></tr>`).join("")}
</tbody></table></div>

<h2>Qualidade do que já está coletado</h2>
<p>Coletar não é o fim: o coletor pode terminar com sucesso e trazer só uma fatia do município. A prova real é a
razão contra a RAIS. Abaixo, os municípios cujo total coletado é menor que metade do esperado — quase todos por
competência parcial ou por uma única entidade lida no lugar de todas.</p>
<div class="scroll"><table>
<thead><tr><th>Município</th><th>UF</th><th>Fonte</th><th>Competência</th><th class="num">Coletado</th>
<th class="num">RAIS</th><th class="num">Razão</th></tr></thead>
<tbody>${linhas.filter(l => l.razao != null && l.razao < 0.5).sort((a, b) => b.rais - a.rais).map(l => `<tr>
  <th scope="row">${esc(l.nome)}</th><td>${l.uf}</td><td>${esc(l.fonte)}</td><td>${esc(l.comp)}</td>
  <td class="num">${mil(l.n)}</td><td class="num">${mil(l.rais)}</td><td class="num">${l.razao}</td></tr>`).join("")}
</tbody></table></div>

<h2>Município a município</h2>
<p class="sub">Os ${G.total} municípios dos dois estados. ✓ = o campo existe nas linhas coletadas.</p>
<div class="scroll"><table>
<thead><tr><th>Município</th><th>UF</th><th class="num">Coletado</th><th class="num">TCE-MT</th><th class="num">RAIS</th>
<th>Fonte / produto</th><th>Comp.</th><th>Salário</th><th>Cargo</th><th>Secretaria</th></tr></thead>
<tbody>${linhas.map(l => `<tr>
  <th scope="row">${esc(l.nome)}</th><td>${l.uf}</td>
  <td class="num">${l.n ? mil(l.n) : "—"}</td>
  <td class="num">${l.tcemt ? mil(l.tcemt.agentes) : "—"}</td><td class="num">${mil(l.rais)}</td>
  <td>${l.fonte ? esc(l.fonte) : `<span class="nao">${esc(l.produto || l.erp_tce || "a descobrir")}</span>`}</td>
  <td>${esc(l.comp || "—")}</td>
  <td>${l.v ? '<span class="sim">✓</span>' : '<span class="nao">—</span>'}</td>
  <td>${l.ca ? '<span class="sim">✓</span>' : '<span class="nao">—</span>'}</td>
  <td>${l.se ? '<span class="sim">✓</span>' : '<span class="nao">—</span>'}</td></tr>`).join("")}
</tbody></table></div>

<h2>Fontes e método</h2>
<p><b>Folha nominal:</b> portais de transparência dos próprios municípios, lidos por um coletor específico para cada
ERP (Betha, Fiorilli/SCPI, IPM, Elotech, GovBR/PRONIM, MegaSoft, NucleoGov, CR2 e o portal próprio de Cuiabá).
Cada linha traz o servidor, o cargo, a lotação e a remuneração publicados pela própria prefeitura.<br>
<b>Denominador:</b> RAIS ${raisAno} (PDET/MTE), vínculos da administração municipal ativos em 31/12 — usada só para
medir cobertura, nunca para preencher o que falta.<br>
<b>Cadastro de portais:</b> Radar da Transparência Pública (ATRICON), que dá a URL de cada unidade gestora, mais a
descoberta do portal real município a município.</p>

<footer>Gerado em ${hoje} · PNIGP — Plataforma Nacional de Inteligência da Gestão Pública · Instituto I10.
Todos os números foram lidos do banco no momento da geração.</footer>
</div></body></html>`;

fs.writeFileSync(SAIDA, html, "utf8");
console.log(`→ ${SAIDA} (${(html.length / 1024).toFixed(0)} KB)`);
console.log(`   ${G.com}/${G.total} municípios · ${mil(G.serv)} servidores (${pct(G.serv, G.rais)}% da RAIS) · ${G.completo} completos`);
console.log(`   faltam ${falt.length}: coletor pronto ${banda.coletor} · sem coletor ${banda.sem_coletor} · a descobrir ${banda.desconhecido} · não é folha ${banda.nao_folha}`);
await db.end();
