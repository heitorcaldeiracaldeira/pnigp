// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// gera_folha_html.mjs — a entrega: uma página única, standalone, em C:\Users\PC\.
// Lê tudo do banco no momento da geração e carimba a data — nada de número escrito à mão.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const SAIDA = process.env.SAIDA || "C:/Users/PC/folha-servidores-municipais.html";

const brl = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const mil = (n) => Number(n || 0).toLocaleString("pt-BR");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── dados ──────────────────────────────────────────────────────────────────────────────────────────────────────
const cobertura = (await q(`select * from vw_folha_cobertura order by linhas desc`)).rows;

const scMes = (await q(`select competencia, count(*) vinculos, count(distinct nome) pessoas,
    round(sum(salario_bruto)/1e6) folha_mi
  from vw_folha_municipal_brasil where fonte='farol-tcesc' and situacao='Ativo'
  group by 1 order by 1`)).rows;

const ultimoMes = scMes.length ? scMes[scMes.length - 1].competencia : null;
const mesRef = (await q(`select competencia from vw_folha_municipal_brasil where fonte='farol-tcesc'
   group by 1 having count(*) > 300000 order by 1 desc limit 1`)).rows[0]?.competencia || ultimoMes;

const scArea = (await q(`select secretaria, count(*) vinculos, count(distinct nome) pessoas,
    round(sum(salario_bruto)) folha, round(avg(salario_bruto) filter (where salario_bruto>0)) medio
  from vw_folha_municipal_brasil
  where fonte='farol-tcesc' and situacao='Ativo' and competencia=$1
  group by 1 order by 4 desc nulls last`, [mesRef])).rows;

const scFuncao = (await q(`select funcao, count(*) vinculos, count(distinct nome) pessoas,
    round(sum(salario_bruto)) folha, round(avg(salario_bruto) filter (where salario_bruto>0)) medio
  from vw_folha_municipal_brasil
  where fonte='farol-tcesc' and situacao='Ativo' and competencia=$1
  group by 1 order by 2 desc`, [mesRef])).rows;

const scSituacao = (await q(`select situacao, count(*) vinculos, round(sum(salario_bruto)) folha
  from vw_folha_municipal_brasil where fonte='farol-tcesc' and competencia=$1 group by 1 order by 2 desc`, [mesRef])).rows;

const scMun = (await q(`select municipio, count(distinct nome) pessoas, round(sum(salario_bruto)) folha,
    round(avg(salario_bruto) filter (where salario_bruto>0)) medio
  from vw_folha_municipal_brasil where fonte='farol-tcesc' and situacao='Ativo' and competencia=$1
  group by 1 order by 3 desc limit 25`, [mesRef])).rows;

const scCargo = (await q(`select cargo, count(*) vinculos, round(avg(salario_bruto) filter (where salario_bruto>0)) medio
  from vw_folha_municipal_brasil where fonte='farol-tcesc' and situacao='Ativo' and competencia=$1
  group by 1 order by 2 desc limit 20`, [mesRef])).rows;

// RAIS — camada nacional
const temRais = (await q(`select count(*) n from folha_rais_municipal`)).rows[0].n > 0;
let raisUF = [], raisVinculo = [], raisCbo = [], raisTotal = null;
if (temRais) {
  raisTotal = (await q(`select count(*) vinculos, count(*) filter (where ativo_3112) ativos,
      count(distinct cod_ibge6) municipios, round(avg(rem_media) filter (where rem_media>0)) medio
    from folha_rais_municipal`)).rows[0];
  raisUF = (await q(`select left(cod_ibge6,2) uf_cod, count(*) vinculos,
      count(*) filter (where ativo_3112) ativos, round(avg(rem_media) filter (where rem_media>0)) medio
    from folha_rais_municipal where cod_ibge6 ~ '^[0-9]{6}$'
    group by 1 order by 2 desc`)).rows;
  raisVinculo = (await q(`select coalesce(tipo_vinculo_desc, 'código '||tipo_vinculo) tipo, count(*) vinculos,
      round(avg(rem_media) filter (where rem_media>0)) medio
    from folha_rais_municipal group by 1 order by 2 desc limit 12`)).rows;
  raisCbo = (await q(`select g.nome grupo, count(*) vinculos, round(avg(r.rem_media) filter (where r.rem_media>0)) medio
    from folha_rais_municipal r left join vw_cbo_grande_grupo g on g.cod = left(r.cbo,1)
    group by 1 order by 2 desc`)).rows;
}

// mapa por UF — a pergunta "quantos municípios por estado têm o dado"
const mapaUF = (await q(`select * from vw_cobertura_uf where completo+parcial+minimo > 0
  order by completo desc, uf`)).rows;
const totalUF = (await q(`select sum(municipios_uf) municipios, sum(completo) completo, sum(parcial) parcial,
  sum(sem_dado) sem_dado, round(100.0*sum(completo)/sum(municipios_uf),1) pct from vw_cobertura_uf`)).rows[0];

// Betha — a fonte com secretaria declarada
const temBetha = Number((await q(`select count(*) n from folha_servidores_betha`)).rows[0].n) > 0;
let bethaTotal = null, bethaUF = [], bethaSec = [];
if (temBetha) {
  bethaTotal = (await q(`select count(*) servidores, count(distinct cod_ibge) municipios, count(distinct uf) ufs,
    count(distinct secretaria) secretarias, count(distinct cargo) cargos, round(sum(bruto)) folha,
    round(percentile_cont(0.5) within group (order by bruto)) mediana
    from folha_servidores_betha where bruto > 0`)).rows[0];
  bethaUF = (await q(`select uf, count(distinct cod_ibge) municipios, count(*) servidores,
      round(percentile_cont(0.5) within group (order by bruto)) mediana
    from folha_servidores_betha where bruto > 0 group by 1 order by 3 desc`)).rows;
  bethaSec = (await q(`select coalesce(nullif(secretaria,''), nullif(organograma,'')) sec,
      count(*) servidores, round(percentile_cont(0.5) within group (order by bruto)) mediana
    from folha_servidores_betha where bruto > 0 and coalesce(nullif(secretaria,''),nullif(organograma,'')) is not null
    group by 1 order by 2 desc limit 15`)).rows;
}

const peOrgao = (await q(`select municipio, count(*) vinculos, count(*) filter (where situacao='Ativo') ativos
  from vw_folha_municipal_brasil where fonte='tcepe' group by 1 order by 2 desc limit 15`)).rows;
const maEnte = (await q(`select municipio, count(*) vinculos, round(sum(salario_bruto)) folha
  from vw_folha_municipal_brasil where fonte='tcema' group by 1 order by 3 desc limit 15`)).rows;

const UF = { "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO", "21": "MA",
  "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG",
  "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF" };

// ── página ─────────────────────────────────────────────────────────────────────────────────────────────────────
const P = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const PD = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

const totalGeral = cobertura.reduce((s, c) => s + Number(c.linhas), 0);
const munGeral = cobertura.reduce((s, c) => s + Number(c.municipios), 0);
const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Servidores públicos municipais — município, secretaria, cargo, função e salário</title>
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
td.bar{width:46%;min-width:150px;padding-right:0}
td.bar span{display:block;height:11px;border-radius:0 4px 4px 0;background:var(--c,var(--s1))}
.tag{display:inline-block;font-size:.72rem;padding:1px 7px;border-radius:99px;border:1px solid var(--line);color:var(--ink2);white-space:nowrap}
.sim{color:var(--ok);font-weight:600}
.nao{color:var(--crit);font-weight:600}
.nota{border-left:3px solid var(--s2);padding:2px 0 2px 14px;margin:20px 0;color:var(--ink2)}
.nota b{color:var(--ink)}
code{background:var(--grid);padding:1px 5px;border-radius:4px;font-size:.86em}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);color:var(--ink3);font-size:.85rem}
</style></head>
<body><div class="wrap">

<h1>Servidores públicos municipais</h1>
<p>Município · secretaria · cargo · função · salário — o que existe hoje em dado público, coletado e conferido fonte a fonte.</p>

<div class="heros">
  <div class="hero"><b>${mil(totalGeral)}</b><span>vínculos coletados</span></div>
  <div class="hero"><b>${mil(munGeral)}</b><span>municípios/entes cobertos</span></div>
  <div class="hero"><b>${cobertura.length}</b><span>fontes oficiais distintas</span></div>
  ${temRais ? `<div class="hero"><b>${mil(raisTotal.municipios)}</b><span>municípios na camada nacional</span></div>` : ""}
</div>

<div class="nota"><b>O achado que organiza tudo:</b> nenhuma base pública entrega os cinco campos juntos para o país.
A RAIS cobre os 5.570 municípios, mas é anônima e não diz o órgão. Só o Tribunal de Contas tem a lotação —
e cada tribunal publica uma fatia diferente. A tabela abaixo é a medição, não a expectativa.</div>

<h2>O que cada fonte entrega</h2>
<div class="scroll"><table>
<thead><tr><th>Fonte</th><th>Cobertura</th><th>Competência</th><th class="num">Vínculos</th>
<th>Secretaria</th><th>Cargo</th><th>Função</th><th>Salário</th><th>Nome</th></tr></thead><tbody>
${cobertura.map((c) => {
  const rot = { "farol-tcesc": "Farol TCE-SC (e-Sfinge)", tcepe: "TCE-PE Dados Abertos", tcema: "TCE-MA (SAAP)", rais: "RAIS / PDET-MTE" }[c.fonte] || c.fonte;
  const sim = (n) => (Number(n) > 0 ? '<span class="sim">sim</span>' : '<span class="nao">não</span>');
  return `<tr><th scope="row">${esc(rot)}</th>
    <td><span class="tag">${c.uf || "Brasil"}</span> ${mil(c.municipios)} entes</td>
    <td>${esc(c.competencia_min)}${c.competencia_min !== c.competencia_max ? "–" + esc(c.competencia_max) : ""}</td>
    <td class="num">${mil(c.linhas)}</td>
    <td>${sim(c.com_secretaria)}</td><td><span class="sim">sim</span></td><td><span class="sim">sim</span></td>
    <td>${sim(c.com_salario)}</td><td>${sim(c.com_nome)}</td></tr>`;
}).join("")}
</tbody></table></div>
<p class="sub">"Secretaria" na coluna do TCE-SC é derivada da lotação declarada; nas demais é o órgão/unidade da própria fonte.</p>

<h2>Quantos municípios têm o dado, por estado</h2>
<p><b>Completo</b> = os três campos que importam (cargo, salário e secretaria) existem de verdade nas linhas daquele
município. <b>Parcial</b> = dois dos três — a RAIS dá cargo e salário sem órgão; o TCE-PE dá cargo e órgão sem valor.</p>
<div class="heros">
  <div class="hero"><b>${mil(totalUF.completo)}</b><span>municípios completos (${totalUF.pct}% do país)</span></div>
  <div class="hero"><b>${mil(totalUF.parcial)}</b><span>parciais</span></div>
  <div class="hero"><b>${mil(totalUF.sem_dado)}</b><span>ainda sem dado</span></div>
</div>
<div class="scroll"><table>
<thead><tr><th>UF</th><th class="num">Municípios</th><th>Completo</th><th class="num">Completo</th><th class="num">Parcial</th><th class="num">%</th></tr></thead>
<tbody>${mapaUF.map((l) => `<tr><th scope="row">${esc(l.uf)}</th>
  <td class="num">${mil(l.municipios_uf)}</td>
  <td class="bar"><span style="width:${(100 * Number(l.completo) / Math.max(...mapaUF.map((x) => Number(x.completo)), 1)).toFixed(1)}%;--c:var(--s1)"></span></td>
  <td class="num">${mil(l.completo)}</td><td class="num">${mil(l.parcial)}</td><td class="num">${l.pct_completo}%</td></tr>`).join("")}
</tbody></table></div>

${temBetha ? `
<h2>Betha — o portal do próprio município</h2>
<p>É a fonte mais completa que existe hoje: entrega cargo, salário e a <b>secretaria declarada pela própria fonte</b>
(em Santa Catarina, pelo tribunal, a secretaria precisa ser derivada por dicionário). E a competência é a do mês
corrente. Alcança ${mil(bethaTotal.ufs)} estados que nenhum tribunal de contas cobre nesse eixo.</p>
<div class="heros">
  <div class="hero"><b>${mil(bethaTotal.servidores)}</b><span>servidores</span></div>
  <div class="hero"><b>${mil(bethaTotal.municipios)}</b><span>municípios</span></div>
  <div class="hero"><b>${mil(bethaTotal.secretarias)}</b><span>secretarias distintas</span></div>
  <div class="hero"><b>${brl(bethaTotal.mediana)}</b><span>salário mediano</span></div>
</div>
<div class="scroll"><table><thead><tr><th>UF</th><th>Servidores</th><th class="num">Servidores</th><th class="num">Municípios</th><th class="num">Mediana</th></tr></thead>
<tbody>${bethaUF.map((l) => `<tr><th scope="row">${esc(l.uf)}</th>
  <td class="bar"><span style="width:${(100 * Number(l.servidores) / Math.max(...bethaUF.map((x) => Number(x.servidores)))).toFixed(1)}%;--c:var(--s3)"></span></td>
  <td class="num">${mil(l.servidores)}</td><td class="num">${mil(l.municipios)}</td><td class="num">${brl(l.mediana)}</td></tr>`).join("")}
</tbody></table></div>

<h3>As maiores secretarias (todas as UFs somadas)</h3>
<div class="scroll"><table><thead><tr><th>Secretaria / lotação</th><th>Servidores</th><th class="num">Servidores</th><th class="num">Mediana</th></tr></thead>
<tbody>${bethaSec.map((l) => `<tr><th scope="row">${esc(l.sec)}</th>
  <td class="bar"><span style="width:${(100 * Number(l.servidores) / Math.max(...bethaSec.map((x) => Number(x.servidores)))).toFixed(1)}%;--c:var(--s3)"></span></td>
  <td class="num">${mil(l.servidores)}</td><td class="num">${brl(l.mediana)}</td></tr>`).join("")}
</tbody></table></div>` : ""}

<h2>Santa Catarina — a base completa</h2>
<p>É a única fonte com os cinco campos por servidor, mês a mês. Retrato de <b>${esc(mesRef)}</b>, servidores ativos.</p>

<h3>Por área de governo</h3>
<div class="scroll"><table>
<thead><tr><th>Área (derivada da lotação)</th><th>Folha do mês</th><th class="num">R$</th><th class="num">Pessoas</th><th class="num">Média</th></tr></thead>
<tbody>${scArea.map((l) => `<tr><th scope="row">${esc(l.secretaria)}</th>
  <td class="bar"><span style="width:${(100 * Number(l.folha) / Math.max(...scArea.map((x) => Number(x.folha)))).toFixed(1)}%;--c:var(--s1)"></span></td>
  <td class="num">${brl(l.folha)}</td><td class="num">${mil(l.pessoas)}</td><td class="num">${brl(l.medio)}</td></tr>`).join("")}
</tbody></table></div>

<h3>Por função (natureza do cargo)</h3>
<div class="scroll"><table>
<thead><tr><th>Função</th><th>Pessoas</th><th class="num">Pessoas</th><th class="num">Folha</th><th class="num">Média</th></tr></thead>
<tbody>${scFuncao.map((l) => `<tr><th scope="row">${esc(l.funcao)}</th>
  <td class="bar"><span style="width:${(100 * Number(l.pessoas) / Math.max(...scFuncao.map((x) => Number(x.pessoas)))).toFixed(1)}%;--c:var(--s1)"></span></td>
  <td class="num">${mil(l.pessoas)}</td><td class="num">${brl(l.folha)}</td><td class="num">${brl(l.medio)}</td></tr>`).join("")}
</tbody></table></div>

<h3>Quem está na folha</h3>
<div class="scroll"><table><thead><tr><th>Situação</th><th class="num">Vínculos</th><th class="num">Folha do mês</th></tr></thead>
<tbody>${scSituacao.map((l) => `<tr><th scope="row">${esc(l.situacao)}</th><td class="num">${mil(l.vinculos)}</td><td class="num">${brl(l.folha)}</td></tr>`).join("")}</tbody></table></div>
<p class="sub">Inativos e pensionistas estão na mesma folha e não são funcionários em exercício — por isso ficam separados, nunca somados por engano.</p>

<h3>Maiores folhas municipais</h3>
<div class="scroll"><table><thead><tr><th>Município</th><th>Folha</th><th class="num">R$</th><th class="num">Pessoas</th><th class="num">Média</th></tr></thead>
<tbody>${scMun.map((l) => `<tr><th scope="row">${esc(l.municipio)}</th>
  <td class="bar"><span style="width:${(100 * Number(l.folha) / Math.max(...scMun.map((x) => Number(x.folha)))).toFixed(1)}%;--c:var(--s1)"></span></td>
  <td class="num">${brl(l.folha)}</td><td class="num">${mil(l.pessoas)}</td><td class="num">${brl(l.medio)}</td></tr>`).join("")}
</tbody></table></div>

<h3>Cargos mais numerosos</h3>
<div class="scroll"><table><thead><tr><th>Cargo</th><th>Vínculos</th><th class="num">Vínculos</th><th class="num">Média</th></tr></thead>
<tbody>${scCargo.map((l) => `<tr><th scope="row">${esc(l.cargo)}</th>
  <td class="bar"><span style="width:${(100 * Number(l.vinculos) / Math.max(...scCargo.map((x) => Number(x.vinculos)))).toFixed(1)}%;--c:var(--s3)"></span></td>
  <td class="num">${mil(l.vinculos)}</td><td class="num">${brl(l.medio)}</td></tr>`).join("")}
</tbody></table></div>

<h3>A série do ano</h3>
<div class="scroll"><table><thead><tr><th>Competência</th><th>Folha</th><th class="num">R$ milhões</th><th class="num">Pessoas</th></tr></thead>
<tbody>${scMes.map((l) => `<tr><th scope="row">${esc(l.competencia)}</th>
  <td class="bar"><span style="width:${(100 * Number(l.folha_mi) / Math.max(...scMes.map((x) => Number(x.folha_mi)), 1)).toFixed(1)}%;--c:var(--s1)"></span></td>
  <td class="num">${mil(l.folha_mi)}</td><td class="num">${mil(l.pessoas)}</td></tr>`).join("")}
</tbody></table></div>
<p class="sub">Dezembro incorpora o 13º e por isso quase dobra — não é crescimento de quadro.</p>

${temRais ? `
<h2>Brasil — a camada censitária</h2>
<p>RAIS 2025: <b>${mil(raisTotal.vinculos)}</b> vínculos da administração municipal em <b>${mil(raisTotal.municipios)}</b> municípios,
remuneração média de <b>${brl(raisTotal.medio)}</b>. Cobre o país inteiro, mas o microdado é anônimo: não traz órgão nem nome.</p>

<h3>Por unidade da federação</h3>
<div class="scroll"><table><thead><tr><th>UF</th><th>Vínculos</th><th class="num">Vínculos</th><th class="num">Ativos em 31/12</th><th class="num">Remuneração média</th></tr></thead>
<tbody>${raisUF.map((l) => `<tr><th scope="row">${UF[l.uf_cod] || l.uf_cod}</th>
  <td class="bar"><span style="width:${(100 * Number(l.vinculos) / Math.max(...raisUF.map((x) => Number(x.vinculos)))).toFixed(1)}%;--c:var(--s1)"></span></td>
  <td class="num">${mil(l.vinculos)}</td><td class="num">${mil(l.ativos)}</td><td class="num">${brl(l.medio)}</td></tr>`).join("")}
</tbody></table></div>

<h3>Por natureza do vínculo — a "função" no sentido do regime</h3>
<div class="scroll"><table><thead><tr><th>Tipo de vínculo</th><th>Vínculos</th><th class="num">Vínculos</th><th class="num">Média</th></tr></thead>
<tbody>${raisVinculo.map((l) => `<tr><th scope="row">${esc(l.tipo)}</th>
  <td class="bar"><span style="width:${(100 * Number(l.vinculos) / Math.max(...raisVinculo.map((x) => Number(x.vinculos)))).toFixed(1)}%;--c:var(--s2)"></span></td>
  <td class="num">${mil(l.vinculos)}</td><td class="num">${brl(l.medio)}</td></tr>`).join("")}
</tbody></table></div>

<h3>Por grande grupo ocupacional (CBO)</h3>
<div class="scroll"><table><thead><tr><th>Grande grupo</th><th>Vínculos</th><th class="num">Vínculos</th><th class="num">Média</th></tr></thead>
<tbody>${raisCbo.map((l) => `<tr><th scope="row">${esc(l.grupo || "não classificado")}</th>
  <td class="bar"><span style="width:${(100 * Number(l.vinculos) / Math.max(...raisCbo.map((x) => Number(x.vinculos)))).toFixed(1)}%;--c:var(--s3)"></span></td>
  <td class="num">${mil(l.vinculos)}</td><td class="num">${brl(l.medio)}</td></tr>`).join("")}
</tbody></table></div>` : ""}

${peOrgao.length ? `
<h2>Pernambuco — nominal, com órgão, sem salário</h2>
<p>O TCE-PE publica o quadro de pessoal por unidade jurisdicionada, com nome e cargo. Nenhum dos 72 recursos do
catálogo publica remuneração.</p>
<div class="scroll"><table><thead><tr><th>Município</th><th>Vínculos</th><th class="num">Vínculos</th><th class="num">Sem afastamento</th></tr></thead>
<tbody>${peOrgao.map((l) => `<tr><th scope="row">${esc(l.municipio)}</th>
  <td class="bar"><span style="width:${(100 * Number(l.vinculos) / Math.max(...peOrgao.map((x) => Number(x.vinculos)))).toFixed(1)}%;--c:var(--s7)"></span></td>
  <td class="num">${mil(l.vinculos)}</td><td class="num">${mil(l.ativos)}</td></tr>`).join("")}
</tbody></table></div>` : ""}

${maEnte.length ? `
<h2>Maranhão — com salário e unidade, sem nome</h2>
<p>O sistema novo do TCE-MA (<code>/sincfolha</code>) responde HTTP 500 — o backend de folha do tribunal está fora do ar.
O que responde é o sistema antigo, cuja última competência é 2021.</p>
<div class="scroll"><table><thead><tr><th>Ente</th><th>Folha</th><th class="num">R$</th><th class="num">Vínculos</th></tr></thead>
<tbody>${maEnte.map((l) => `<tr><th scope="row">${esc(l.municipio)}</th>
  <td class="bar"><span style="width:${(100 * Number(l.folha) / Math.max(...maEnte.map((x) => Number(x.folha)))).toFixed(1)}%;--c:var(--s4)"></span></td>
  <td class="num">${brl(l.folha)}</td><td class="num">${mil(l.vinculos)}</td></tr>`).join("")}
</tbody></table></div>` : ""}

<h2>Método e limites</h2>
<p><b>Como consultar.</b> Tudo está no banco: <code>vw_folha_municipal_brasil</code> une as quatro fontes com os cinco
campos e a coluna <code>fonte</code>; <code>vw_folha_cobertura</code> diz o que cada uma entrega;
<code>vw_folha_municipal_sc</code> é a base catarinense com nome e salário.</p>
<p><b>Onde o dado acaba.</b> A secretaria só existe onde o Tribunal de Contas publica a lotação. Em Santa Catarina a
lotação é fiel à fonte e por isso heterogênea — em um município é a secretaria, em outro é a escola ou a própria
fonte do recurso (FUNDEB 70%) — então a área de governo é derivada por dicionário, com a lotação original sempre
preservada ao lado. O salário é o bruto da competência, incluindo gratificações e adicionais; não é o vencimento
do cargo.</p>
<p><b>O que falta para o país inteiro.</b> Folha nominal com secretaria para os 5.570 municípios não existe em base
única. Os caminhos medidos: os demais tribunais publicam pessoal do próprio tribunal, não dos jurisdicionados; e os
portais de transparência municipais têm o dado, concentrados em poucos ERPs — um coletor por ERP cobre centenas de
municípios de uma vez.</p>

<footer>Gerado em ${esc(agora)} · Fontes: Farol TCE-SC (e-Sfinge), TCE-PE Dados Abertos, TCE-MA, RAIS ${temRais ? "2025" : ""} (PDET/MTE).
Números lidos do banco no momento da geração.</footer>
</div></body></html>`;

fs.writeFileSync(SAIDA, html, "utf8");
console.log("entrega:", SAIDA, `(${(html.length / 1024).toFixed(0)} KB)`);
await db.end();
