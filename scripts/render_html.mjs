import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const D=JSON.parse(fs.readFileSync(OUT+"tabela_final.json","utf8"));
const ROTA_COR={"NORTE 1":0,"NORTE 2":1,"NORTE 3":2,"NORTE 4":3,"OESTE":4,"LESTE":5,"CENTRO/SUL":6,"CENTRO 1":7,"CENTRO 2":8,"CENTRO 3":9,"SUL 1":10,"SUL 2":11,"CONTINENTE 1":12,"CONTINENTE 2":13};

const CSS = `<style>
:root{
  --bg:#f7f9fa; --panel:#ffffff; --ink:#0f1b2d; --muted:#5b6b7f; --line:#e3e9ef;
  --accent:#0d7a6b; --accent-soft:#e2f4f0; --good:#0d7a6b; --bad:#b04a3a; --warn:#b8791f;
  --onaccent:#ffffff; --bar:#0d7a6b; --bar2:#8bb;
  --shadow:0 1px 2px rgba(16,32,54,.06),0 4px 16px rgba(16,32,54,.05);
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0c1116; --panel:#131a22; --ink:#e6eef6; --muted:#8b9bad; --line:#232e39;
  --accent:#2dd4bf; --accent-soft:#0f2d2a; --good:#2dd4bf; --bad:#f0876f; --warn:#e0b060;
  --onaccent:#08221e; --bar:#2dd4bf;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.25);
}}
:root[data-theme="dark"]{--bg:#0c1116;--panel:#131a22;--ink:#e6eef6;--muted:#8b9bad;--line:#232e39;--accent:#2dd4bf;--accent-soft:#0f2d2a;--good:#2dd4bf;--bad:#f0876f;--warn:#e0b060;--onaccent:#08221e;--bar:#2dd4bf;--shadow:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.25);}
:root[data-theme="light"]{--bg:#f7f9fa;--panel:#ffffff;--ink:#0f1b2d;--muted:#5b6b7f;--line:#e3e9ef;--accent:#0d7a6b;--accent-soft:#e2f4f0;--good:#0d7a6b;--bad:#b04a3a;--warn:#b8791f;--onaccent:#ffffff;--bar:#0d7a6b;--shadow:0 1px 2px rgba(16,32,54,.06),0 4px 16px rgba(16,32,54,.05);}
*{box-sizing:border-box}
body{margin:0}
.wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;padding:clamp(16px,3vw,40px);line-height:1.45}
.container{max-width:1180px;margin:0 auto}
.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);font-weight:700;margin:0 0 6px}
h1{font-size:clamp(22px,3.4vw,32px);margin:0 0 4px;letter-spacing:-.02em;text-wrap:balance;font-weight:750}
.sub{color:var(--muted);font-size:15px;margin:0 0 22px;max-width:74ch}
.sub b{color:var(--ink);font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow)}
.kpi .v{font-size:26px;font-weight:750;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.kpi .l{font-size:12.5px;color:var(--muted);margin-top:2px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
@media(max-width:820px){.grid2{grid-template-columns:1fr}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);margin-bottom:20px;overflow:hidden}
.card h2{font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin:0;padding:16px 18px 2px;font-weight:700}
.card .body{padding:12px 18px 18px}
.bar-row{display:grid;grid-template-columns:130px 1fr auto;gap:10px;align-items:center;margin:8px 0;font-size:13px}
.bar-row .lab{color:var(--ink);font-weight:600}
.track{background:var(--accent-soft);border-radius:6px;height:20px;overflow:hidden}
.fill{height:100%;background:var(--bar);border-radius:6px}
.bar-row .val{font-variant-numeric:tabular-nums;color:var(--muted);font-size:12.5px;white-space:nowrap}
.bar-row .val b{color:var(--ink)}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:14px 18px}
.chip{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:999px;padding:5px 12px;font-size:12.5px;cursor:pointer;font-weight:600;transition:.12s}
.chip:hover{border-color:var(--accent);color:var(--accent)}
.chip.on{background:var(--accent);border-color:var(--accent);color:var(--onaccent)}
input,select{font:inherit;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:7px 11px;font-size:13.5px}
input:focus,select:focus,.chip:focus-visible,th:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
input{min-width:180px;flex:1}
.tbl-scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:13.5px}
thead th{position:sticky;top:0;background:var(--panel);text-align:left;padding:10px 12px;border-bottom:2px solid var(--line);font-size:11.5px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);cursor:pointer;white-space:nowrap;user-select:none}
thead th.num{text-align:right}
thead th:hover{color:var(--accent)}
tbody td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
tbody tr:hover{background:var(--accent-soft)}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.esc{font-weight:600}
.rota-tag{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;white-space:nowrap;letter-spacing:.02em}
.tipo{font-size:12px;color:var(--muted)}
.yes{color:var(--good);font-weight:700}
.no{color:var(--bad);opacity:.7}
.ratio-hi{color:var(--warn);font-weight:700}
.dim{color:var(--muted)}
.foot{color:var(--muted);font-size:12.5px;line-height:1.65;margin-top:8px}
.foot b{color:var(--ink)}
.note{background:var(--accent-soft);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:10px;padding:13px 16px;font-size:13.5px;margin-bottom:20px;line-height:1.6}
.note b{color:var(--ink)}
.rota-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:10px;padding:6px 18px 18px}
.rc{border:1px solid var(--line);border-radius:11px;padding:11px 13px;border-left:4px solid var(--rc)}
.rc .rn{font-weight:750;font-size:13px}
.rc .rd{font-size:11.5px;color:var(--muted);margin-top:3px;font-variant-numeric:tabular-nums;line-height:1.5}
.count{color:var(--muted);font-size:12.5px;padding:0 18px 12px}
.nt{font-size:13.5px;line-height:1.7}
.nt h3{font-size:12.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--accent);margin:16px 0 4px;font-weight:700}
.nt h3:first-child{margin-top:0}
.nt p{margin:0 0 8px}
.nt b{color:var(--ink)}
.nt ul{margin:4px 0 8px;padding-left:20px}
.nt li{margin:3px 0}
details summary{cursor:pointer;font-weight:700;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding:16px 18px;list-style:none}
details summary::-webkit-details-marker{display:none}
details summary::before{content:"▸ ";color:var(--accent)}
details[open] summary::before{content:"▾ "}
@media(max-width:640px){.sub{font-size:14px}.kpi .v{font-size:22px}.bar-row{grid-template-columns:110px 1fr}.bar-row .val{grid-column:1/-1;text-align:right}}
</style>`;

const BODY = `<div class="wrap"><div class="container">
<p class="eyebrow">Merenda escolar &middot; Florian&oacute;polis &middot; custo ao cidad&atilde;o</p>
<h1>Alimenta&ccedil;&atilde;o escolar por escola &mdash; rede municipal</h1>
<p class="sub">Universo das <b>130 escolas municipais</b> (Censo Escolar INEP 2024), com a m&atilde;o de obra de <b>cozinheiras</b> e <b>nutricionistas</b> contratada pelo Termo de Refer&ecirc;ncia (PNCP 82892282000143-1-000096/2025). Cada nutricionista cobre uma <b>rota regional</b>; as cozinheiras s&atilde;o lotadas por escola.</p>
<div class="kpis" id="kpis"></div>

<div class="note">&#128667; <b>Deslocamento da nutricionista (TR, item 22):</b> como cada nutricionista atende uma <b>rota</b> de ~9 escolas espalhadas por uma regi&atilde;o, o transporte &eacute; por <b>ve&iacute;culo individual (n&atilde;o coletivo)</b> &mdash; carro ou moto &mdash;, da <b>contratada ou da pr&oacute;pria nutricionista</b>, com custo <b>100% da contratada</b> (embutido no pre&ccedil;o do contrato, n&atilde;o reembolsado &agrave; parte pela Prefeitura). Jornada 8h/dia.</div>

<div class="grid2">
<div class="card"><h2>Distribui&ccedil;&atilde;o dos alunos por tipo de escola</h2><div class="body" id="disttipo"></div></div>
<div class="card"><h2>Distribui&ccedil;&atilde;o por tamanho da escola</h2><div class="body" id="disttam"></div></div>
</div>

<div class="card">
<h2>As 14 rotas das nutricionistas</h2>
<div class="rota-grid" id="rotagrid"></div>
</div>

<div class="card">
<div class="bar">
  <div id="chips" style="display:flex;flex-wrap:wrap;gap:8px;flex:1 1 100%"></div>
  <select id="tipo" aria-label="Filtrar por tipo"><option value="">Todos os tipos</option><option>Creche/Infantil</option><option>Fundamental</option><option>EJA</option><option>Contraturno</option></select>
  <input id="q" placeholder="Buscar escola&hellip;" aria-label="Buscar escola"/>
</div>
<div class="count" id="count"></div>
<div class="tbl-scroll"><table>
<thead><tr>
<th data-k="escola">Escola</th>
<th data-k="rota">Rota</th>
<th data-k="tipo">Tipo</th>
<th class="num" data-k="alunos">Alunos</th>
<th class="num" data-k="h30">Coz 30h</th>
<th class="num" data-k="h40">Coz 40h</th>
<th class="num" data-k="coz">Cozinheiras (TR)</th>
<th class="num" data-k="qtprof">Prof. alim. (censo)</th>
<th class="num" data-k="ratio">Alunos/coz</th>
<th data-k="cozinha">Cozinha</th>
<th data-k="refeitorio">Refeit&oacute;rio</th>
</tr></thead>
<tbody id="tb"></tbody>
</table></div>
</div>

<div class="card"><details><summary>Nota T&eacute;cnica &mdash; como ler estes dados</summary><div class="body nt">
<h3>De onde vem cada n&uacute;mero</h3>
<ul>
<li><b>Alunos, cozinha, refeit&oacute;rio, prof. de alimenta&ccedil;&atilde;o</b> &rarr; <b>Censo Escolar INEP 2024</b> (microdados da educa&ccedil;&atilde;o b&aacute;sica, munic&iacute;pio 4205407, rede municipal). &Eacute; o registro oficial e canal &uacute;nico de todas as escolas.</li>
<li><b>Cozinheiras (30h/40h) e rotas</b> &rarr; <b>Termo de Refer&ecirc;ncia</b> do contrato de m&atilde;o de obra (PNCP, processo PMF I 00148716/2024): quadro de vagas (item 5.5.1) e tabela de rotas das nutricionistas (item 5.1.4).</li>
</ul>
<h3>Como as duas fontes se validam</h3>
<p>O censo registra <b id="nt_prof"></b> profissionais de alimenta&ccedil;&atilde;o presentes nas escolas; o TR contrata <b>533 cozinheiras</b> (170 de 40h + 363 de 30h) mais reserva t&eacute;cnica. Os n&uacute;meros s&atilde;o consistentes &mdash; o observado pelo censo fica entre o alocado por escola e o total contratado. A coluna <b>Prof. alim. (censo)</b> mostra o quadro observado; onde a linha do TR n&atilde;o casou por varia&ccedil;&atilde;o de nome, o censo confirma que a escola &eacute; atendida.</p>
<h3>Defini&ccedil;&otilde;es</h3>
<ul>
<li><b>Rota</b>: circuito regional de escolas sob uma nutricionista. S&atilde;o 14 rotas + 1 coordenadora = 15 nutricionistas (mais 2 de reserva t&eacute;cnica = <b>17</b>).</li>
<li><b>Alunos/coz</b>: matr&iacute;culas &divide; cozinheiras da escola &mdash; indicador de carga, n&atilde;o de meta legal. Valores acima de 90 aparecem destacados.</li>
<li><b>Creche/Infantil (NEIM)</b>: exige mais refei&ccedil;&otilde;es por dia (integral) &rarr; mais cozinheiras por aluno. <b>Fundamental (EBM)</b>: quadro mais enxuto por aluno.</li>
</ul>
<h3>Ressalvas (para auditoria)</h3>
<ul>
<li>Os <b>alunos somam exatamente 37.481</b> (total da rede municipal no censo), sem dupla contagem: cada escola entra uma vez, por <b>c&oacute;digo INEP</b>. Unidades de EJA co-localizadas (ex.: EBM + EJA no mesmo pr&eacute;dio) contam sob a escola-m&atilde;e.</li>
<li>A <b>EJA</b> aparece agregada no censo (Coord. de Jovens e Adultos, 897 alunos); no TR ela est&aacute; distribu&iacute;da por v&aacute;rias unidades dentro das rotas.</li>
<li>Os <b>4 CCFV</b> (contraturno, matr&iacute;cula 0 no censo) s&atilde;o atendidos pela rota, sem cozinheira dedicada.</li>
<li>2 unidades &ldquo;CEC&rdquo; do TR n&atilde;o t&ecirc;m correspond&ecirc;ncia direta no censo (pr&eacute;dios de apoio).</li>
</ul>
<h3>Fonte de recurso (tri-ente)</h3>
<p>Os <b>g&ecirc;neros aliment&iacute;cios</b> s&atilde;o custeados pelo <b>PNAE (Uni&atilde;o/FNDE)</b> somado a Sal&aacute;rio-Educa&ccedil;&atilde;o e recursos pr&oacute;prios; a <b>m&atilde;o de obra</b> (cozinheiras e nutricionistas) &eacute; <b>100% recurso pr&oacute;prio do munic&iacute;pio</b> (Impostos-Educa&ccedil;&atilde;o, natureza 33.90.37).</p>
</div></details></div>

<p class="foot"><b>Fontes:</b> Censo Escolar INEP 2024 (microdados ed_b&aacute;sica) &middot; Termo de Refer&ecirc;ncia PNCP 82892282000143-1-000096/2025 (processo PMF I 00148716/2024). Elabora&ccedil;&atilde;o: i10 Gov 360.</p>
</div></div>`;

const SCRIPT = `<script>
const DATA=${JSON.stringify(D.rows)};
const KPI=${JSON.stringify(D.kpi)};
const ROTAS=${JSON.stringify(D.rotas)};
const BYTIPO=${JSON.stringify(D.byTipo)};
const SIZE=${JSON.stringify(D.sizeDist)};
const COR=${JSON.stringify(ROTA_COR)};
const PAL=["#e11d48","#ea580c","#d97706","#ca8a04","#65a30d","#16a34a","#0d9488","#0891b2","#2563eb","#4f46e5","#7c3aed","#9333ea","#c026d3","#db2777"];
const rotaColor=r=>PAL[COR[r]!=null?COR[r]:0]||"#64748b";
const brl=n=>n==null?"—":Number(n).toLocaleString("pt-BR");
document.getElementById("kpis").innerHTML=[
  [KPI.escolas,"escolas municipais"],
  [brl(KPI.alunos),"alunos (censo INEP)"],
  [KPI.coz,"cozinheiras ("+KPI.h30+" 30h · "+KPI.h40+" 40h)"],
  [KPI.nutri,"nutricionistas · "+KPI.rotas+" rotas"],
  [KPI.comCozinha+"/"+KPI.escolas,"escolas com cozinha"],
  [KPI.ratioMed,"alunos por cozinheira (méd.)"]
].map(function(a){return '<div class="kpi"><div class="v">'+a[0]+'</div><div class="l">'+a[1]+'</div></div>';}).join("");

const totProf=DATA.reduce(function(s,x){return s+(x.qtprof||0);},0);
var ntp=document.getElementById("nt_prof"); if(ntp) ntp.textContent=totProf;

// distribuição por tipo (barra por alunos)
(function(){var mx=Math.max.apply(null,BYTIPO.map(function(t){return t.al;}));
document.getElementById("disttipo").innerHTML=BYTIPO.map(function(t){var w=Math.round(t.al/mx*100);
  return '<div class="bar-row"><span class="lab">'+t.tipo+'</span><div class="track"><div class="fill" style="width:'+w+'%"></div></div><span class="val"><b>'+brl(t.al)+'</b> al · '+t.n+' esc · '+t.coz+' coz</span></div>';}).join("");})();
// distribuição por tamanho (barra por nº de escolas)
(function(){var mx=Math.max.apply(null,SIZE.map(function(t){return t.n;}));
document.getElementById("disttam").innerHTML=SIZE.map(function(t){var w=Math.round(t.n/mx*100);
  return '<div class="bar-row"><span class="lab">'+t.l+'</span><div class="track"><div class="fill" style="width:'+w+'%"></div></div><span class="val"><b>'+t.n+'</b> esc · '+brl(t.al)+' al</span></div>';}).join("");})();

document.getElementById("rotagrid").innerHTML=ROTAS.map(function(r){return '<div class="rc" style="--rc:'+rotaColor(r.rota)+'"><div class="rn">'+r.rota+'</div><div class="rd">'+r.esc+' escolas · '+r.coz+' cozinheiras<br>'+brl(r.al)+' alunos</div></div>';}).join("");
const ORD=ROTAS.map(function(r){return r.rota;});
let fRota="",fTipo="",fQ="",sortK="rota",sortDir=1;
const chips=document.getElementById("chips");
chips.innerHTML='<button class="chip on" data-r="">Todas as rotas</button>'+ORD.map(function(r){return '<button class="chip" data-r="'+r+'">'+r+'</button>';}).join("");
chips.onclick=function(e){var b=e.target.closest(".chip");if(!b)return;fRota=b.dataset.r;Array.prototype.forEach.call(chips.children,function(c){c.classList.toggle("on",c===b);});render();};
document.getElementById("tipo").onchange=function(e){fTipo=e.target.value;render();};
document.getElementById("q").oninput=function(e){fQ=e.target.value.toLowerCase();render();};
document.querySelectorAll("thead th").forEach(function(th){th.onclick=function(){var k=th.dataset.k;if(sortK===k)sortDir*=-1;else{sortK=k;sortDir=1;}render();};});
function render(){
  var rows=DATA.filter(function(r){return (!fRota||r.rota===fRota)&&(!fTipo||r.tipo===fTipo)&&(!fQ||r.escola.toLowerCase().indexOf(fQ)>=0);});
  rows.sort(function(a,b){var x=a[sortK],y=b[sortK];if(sortK==="rota"){x=ORD.indexOf(a.rota);y=ORD.indexOf(b.rota);if(x<0)x=99;if(y<0)y=99;if(x===y)return (b.alunos||0)-(a.alunos||0);}if(typeof x==="string")return sortDir*x.localeCompare(y);return sortDir*((x||0)-(y||0));});
  document.getElementById("count").textContent=rows.length+" escolas"+(fRota?" · rota "+fRota:"");
  document.getElementById("tb").innerHTML=rows.map(function(r){return '<tr>'+
    '<td class="esc">'+r.escola+'</td>'+
    '<td>'+(r.rota==="—"?'<span class="dim">—</span>':'<span class="rota-tag" style="background:'+rotaColor(r.rota)+'22;color:'+rotaColor(r.rota)+'">'+r.rota+'</span>')+'</td>'+
    '<td class="tipo">'+r.tipo+'</td>'+
    '<td class="num">'+brl(r.alunos)+'</td>'+
    '<td class="num">'+(r.h30||"")+'</td>'+
    '<td class="num">'+(r.h40||"")+'</td>'+
    '<td class="num">'+(r.coz?('<b>'+r.coz+'</b>'):'<span class="dim">—</span>')+'</td>'+
    '<td class="num '+(r.coz===0&&r.qtprof>0?"":"dim")+'">'+(r.qtprof!=null?r.qtprof:"—")+'</td>'+
    '<td class="num '+(r.ratio>90?"ratio-hi":"")+'">'+(r.ratio!=null?r.ratio:"—")+'</td>'+
    '<td>'+(r.cozinha?'<span class="yes">✓</span>':'<span class="no">—</span>')+'</td>'+
    '<td>'+(r.refeitorio?'<span class="yes">✓</span>':'<span class="no">—</span>')+'</td>'+
  '</tr>';}).join("");
}
render();
</script>`;

fs.writeFileSync(OUT+"escolas_merenda.html", CSS+"\n"+BODY+"\n"+SCRIPT);
console.log("HTML escrito:", (CSS+BODY+SCRIPT).length, "bytes | rows", D.rows.length, "| alunos", D.kpi.alunos);
