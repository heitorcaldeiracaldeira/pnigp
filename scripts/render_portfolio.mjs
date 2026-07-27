import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const D=JSON.parse(fs.readFileSync(OUT+"processos_merenda.json","utf8"));
const CATCOR={"Mão de obra (cozinheiras/nutric.)":"#0d7a6b","Pães":"#b8791f","Gêneros (outros)":"#64748b","Hortifruti (frutas/hortaliças)":"#16a34a","Carnes / proteicos":"#b04a3a","Secos (menos perecíveis)":"#a16207","Lácteos":"#2563eb"};
const cats=Object.entries(D.byCat).map(([c,x])=>({c,...x})).sort((a,b)=>b.emp-a.emp);
const rows=D.rows.slice().sort((a,b)=>b.emp-a.emp);
const brlM=n=>"R$ "+(n/1e6).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+" mi";
const brl0=n=>"R$ "+Number(n).toLocaleString("pt-BR",{maximumFractionDigits:0});
const maxEmp=Math.max(...cats.map(c=>c.emp));
const CSS=`<style>
:root{--bg:#f6f8f8;--panel:#fff;--ink:#0f1b22;--muted:#5c6b74;--line:#e2e9ec;--accent:#0d7a6b;--soft:#e4f4f0;--sh:0 1px 2px rgba(16,32,44,.06),0 4px 16px rgba(16,32,44,.05);}
@media(prefers-color-scheme:dark){:root{--bg:#0b1013;--panel:#131b20;--ink:#e7eef2;--muted:#8a9aa2;--line:#232e34;--accent:#2dd4bf;--soft:#0f2c29;--sh:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.25);}}
:root[data-theme=dark]{--bg:#0b1013;--panel:#131b20;--ink:#e7eef2;--muted:#8a9aa2;--line:#232e34;--accent:#2dd4bf;--soft:#0f2c29;--sh:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.25);}
:root[data-theme=light]{--bg:#f6f8f8;--panel:#fff;--ink:#0f1b22;--muted:#5c6b74;--line:#e2e9ec;--accent:#0d7a6b;--soft:#e4f4f0;--sh:0 1px 2px rgba(16,32,44,.06),0 4px 16px rgba(16,32,44,.05);}
*{box-sizing:border-box}body{margin:0}
.wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;padding:clamp(16px,3vw,40px);line-height:1.5}
.c{max-width:1040px;margin:0 auto}
.eye{font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--accent);font-weight:700;margin:0 0 6px}
h1{font-size:clamp(22px,3.4vw,32px);margin:0 0 6px;letter-spacing:-.02em;text-wrap:balance;font-weight:760}
.sub{color:var(--muted);font-size:15px;margin:0 0 22px;max-width:74ch}.sub b{color:var(--ink)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 16px;box-shadow:var(--sh)}
.kpi .v{font-size:24px;font-weight:760;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.kpi .l{font-size:12.5px;color:var(--muted);margin-top:3px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--sh);margin-bottom:20px;padding:20px 22px}
.card h2{font-size:12.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin:0 0 14px;font-weight:700}
.brow{display:grid;grid-template-columns:210px 1fr auto;gap:12px;align-items:center;margin:9px 0;font-size:13px}
.brow .lab{font-weight:600}.brow .lab small{color:var(--muted);font-weight:400;display:block;font-size:11.5px}
.track{background:var(--soft);border-radius:6px;height:22px;overflow:hidden}
.fill{height:100%;border-radius:6px}
.brow .val{font-variant-numeric:tabular-nums;font-size:12.5px;color:var(--muted);white-space:nowrap;text-align:right}.brow .val b{color:var(--ink)}
table{border-collapse:collapse;width:100%;font-size:13px}
th{text-align:left;padding:8px 10px;border-bottom:2px solid var(--line);font-size:11px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}
td{padding:8px 10px;border-bottom:1px solid var(--line)}tr:last-child td{border-bottom:none}
.dot{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:6px;vertical-align:middle}
.tag{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--soft);color:var(--muted);white-space:nowrap}
.foot{color:var(--muted);font-size:12px;line-height:1.6;margin-top:8px}.foot b{color:var(--ink)}
.tbl-scroll{overflow-x:auto}
</style>`;
const totEmp=D.total.emp, moPct=Math.round(cats.find(c=>/Mão/.test(c.c)).emp/totEmp*100);
const BODY=`<div class="wrap"><div class="c">
<p class="eye">Custo dos programas · merenda de Florianópolis</p>
<h1>O portfólio de processos da merenda — além da mão de obra</h1>
<p class="sub">A alimentação escolar não é um contrato só: são <b>25 processos licitatórios</b> — a <b>mão de obra</b> terceirizada (SEPAT) e os <b>gêneros</b> (hortifruti, pães, carnes, secos, lácteos) comprados de vários fornecedores. Execução empenhada 2024–2026 (e-Pública).</p>
<div class="kpis">
<div class="kpi"><div class="v">25</div><div class="l">processos licitatórios</div></div>
<div class="kpi"><div class="v">${brl0(totEmp)}</div><div class="l">empenhado (2024–26)</div></div>
<div class="kpi"><div class="v">${brl0(D.total.pago)}</div><div class="l">pago a fornecedores</div></div>
<div class="kpi"><div class="v">${moPct}%</div><div class="l">é mão de obra (o resto = gêneros)</div></div>
</div>
<div class="card">
<h2>Empenhado por categoria (2024–2026)</h2>
${cats.map(x=>`<div class="brow"><span class="lab">${x.c.replace(/ \(.*\)/,"")}<small>${x.n} processo${x.n>1?"s":""}</small></span><div class="track"><div class="fill" style="width:${Math.round(x.emp/maxEmp*100)}%;background:${CATCOR[x.c]||"#64748b"}"></div></div><span class="val"><b>${brlM(x.emp)}</b> emp<br>${brlM(x.pago)} pago</span></div>`).join("")}
<p class="foot">A <b>mão de obra (SEPAT)</b> concentra 55% — 3 processos (concorrência antiga + pregão 2025 + dispensa emergencial). Os <b>gêneros</b> são pulverizados em 22 processos e vários fornecedores (SAFI, BRUTHAN, EDIGA, GNB, SATÉLITE, JEFFERSON, cooperativas).</p>
</div>
<div class="card">
<h2>Os processos (maiores primeiro)</h2>
<div class="tbl-scroll"><table><thead><tr><th>Licitação</th><th>Fornecedor</th><th>Categoria</th><th>Origem</th><th class="num">Empenhado</th><th class="num">Pago</th></tr></thead><tbody>
${rows.map(r=>`<tr><td><b>${r.lic}</b></td><td>${r.forn}</td><td><span class="dot" style="background:${CATCOR[r.cat]||"#64748b"}"></span>${r.cat.replace(/ \(.*\)/,"")}</td><td><span class="tag">${r.origem}</span></td><td class="num">${brl0(r.emp)}</td><td class="num">${brl0(r.pago)}</td></tr>`).join("")}
<tr style="border-top:2px solid var(--line);font-weight:750"><td colspan="4">Total — 25 processos</td><td class="num">${brl0(totEmp)}</td><td class="num">${brl0(D.total.pago)}</td></tr>
</tbody></table></div>
<p class="foot">⚠️ Alguns são <b>Registro de Preços</b> (valor é teto, não gasto — usar o pago). "Agricultura familiar (PNAE)" = inexigibilidade/credenciamento de cooperativas (chamada pública, art. 14 Lei 11.947). Todos rodados pela mesma equipe da Secretaria de Licitações (pregoeiro Rodrigo Buenavides + apoio). Fonte: e-Pública Floripa (despesa/empenhos).</p>
</div>
<p class="foot"><b>i10 Gov 360</b> — Instituto I10. Exibição neutra; valores auditáveis contra o e-Pública e o PNCP.</p>
</div></div>`;
fs.writeFileSync(OUT+"portfolio_merenda.html", CSS+"\n"+BODY);
console.log("HTML:",(CSS+BODY).length,"| processos",rows.length,"| mo%",moPct);
