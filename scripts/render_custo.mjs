import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";

// dados consolidados
const CONTRATO={ mensal:2638888.38, sem6:15833330.28, ano:31666660.56, postos:550,
 salario:899070, encargos:1042165, resto:697653 }; // resto = reposição+insumos+estrutura+BDI+tributos+lucro
const POSTOS=[
 {n:"Cozinheira 40h",q:170,sal:1752.40,tot:5195.94},
 {n:"Cozinheira 30h",q:363,sal:1433.78,tot:4382.34},
 {n:"Nutricionista 40h",q:17,sal:4747.05,tot:9693.48},
];
const DEPAE=[
 {n:"Carla Cristina Britto",p:"Coordenadora",c:"Professor",v:17827.23},
 {n:"Lidiamara Dornelles de Souza",p:"Nutric. (RT)",c:"Nutricionista",v:9479.46},
 {n:"Renata Brodbeck Faust",p:"Nutricionista",c:"Nutricionista",v:8300.41},
 {n:"Raquel Erdmann",p:"Nutricionista",c:"Nutricionista",v:6385.04},
 {n:"Gisele Liliam D'Avila",p:"Nutricionista",c:"Nutricionista",v:6000,obs:"normalizado (jun teve retroativo de R$25.855)"},
 {n:"Graziela Ladwig de Souza",p:"Administrativo",c:"Auxiliar de Sala",v:4624.37},
 {n:"Daniele Hack Alves Coelho",p:"Administrativo",c:"Auxiliar de Sala",v:4571.44},
 {n:"Heloisa Helena Braga de Oliveira",p:"Administrativo",c:"Auxiliar de Sala",v:4450.66},
];
const DEPAE_TOT=DEPAE.reduce((s,x)=>s+x.v,0);
const PROCESSO=[
 {n:"Katherine Schreiner",p:"Ordenadora / Sec. Licitações",c:"Secretário Municipal",v:23544.23},
 {n:"Thiago M. P. da Silveira",p:"Demandante / gestor do contrato",c:"Secretário Municipal",v:23544.23},
 {n:"Rodrigo Buenavides Rodrigues",p:"Pregoeiro",c:"Administrador",v:18325.25},
 {n:"Jauna Medianeira Argenta",p:"Equipe de apoio",c:"Administrador",v:18297.77},
 {n:"Sidnei Silva",p:"Equipe de apoio",c:"Contínuo",v:13851.89},
 {n:"Edgard Pinto Junior",p:"Parecer jurídico",c:"Assessor Técnico",v:7876.88},
 {n:"Alexandre Farias Luz",p:"Jurídico",c:"Assessor Técnico",v:6358.88},
 {n:"Marcia C. de Araujo Gomes",p:"Chefia (assinou TR/ETP)",c:"Auxiliar de Sala",v:5397.71},
];
const TRIENTE=[
 {nome:"Município — Impostos-Educação (MDE)",ente:"Município",pct:64,cor:"#0d7a6b"},
 {nome:"União — Salário-Educação",ente:"União",pct:24,cor:"#2563eb"},
 {nome:"União — PNAE/FNDE (merenda)",ente:"União",pct:12,cor:"#7c3aed"},
];
fs.writeFileSync(OUT+"custo_consolidado.json",JSON.stringify({CONTRATO,POSTOS,DEPAE,DEPAE_TOT,PROCESSO,TRIENTE},null,1));

const brl=n=>"R$ "+Number(n).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const brl0=n=>"R$ "+Number(n).toLocaleString("pt-BR",{maximumFractionDigits:0});

const CSS=`<style>
:root{--bg:#f6f8f8;--panel:#fff;--ink:#0f1b22;--muted:#5c6b74;--line:#e2e9ec;--accent:#0d7a6b;--soft:#e4f4f0;--blue:#2563eb;--purple:#7c3aed;--amber:#b8791f;--sal:#0d7a6b;--enc:#e0a53a;--rest:#9aa7ad;--onacc:#fff;--sh:0 1px 2px rgba(16,32,44,.06),0 4px 16px rgba(16,32,44,.05);}
@media(prefers-color-scheme:dark){:root{--bg:#0b1013;--panel:#131b20;--ink:#e7eef2;--muted:#8a9aa2;--line:#232e34;--accent:#2dd4bf;--soft:#0f2c29;--blue:#60a5fa;--purple:#a78bfa;--amber:#e0b060;--sal:#2dd4bf;--enc:#e0b060;--rest:#5c6b72;--onacc:#08221e;--sh:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.25);}}
:root[data-theme=dark]{--bg:#0b1013;--panel:#131b20;--ink:#e7eef2;--muted:#8a9aa2;--line:#232e34;--accent:#2dd4bf;--soft:#0f2c29;--blue:#60a5fa;--purple:#a78bfa;--amber:#e0b060;--sal:#2dd4bf;--enc:#e0b060;--rest:#5c6b72;--onacc:#08221e;--sh:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.25);}
:root[data-theme=light]{--bg:#f6f8f8;--panel:#fff;--ink:#0f1b22;--muted:#5c6b74;--line:#e2e9ec;--accent:#0d7a6b;--soft:#e4f4f0;--blue:#2563eb;--purple:#7c3aed;--amber:#b8791f;--sal:#0d7a6b;--enc:#e0a53a;--rest:#9aa7ad;--onacc:#fff;--sh:0 1px 2px rgba(16,32,44,.06),0 4px 16px rgba(16,32,44,.05);}
*{box-sizing:border-box}body{margin:0}
.wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;padding:clamp(16px,3vw,40px);line-height:1.5}
.c{max-width:1080px;margin:0 auto}
.eye{font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--accent);font-weight:700;margin:0 0 6px}
h1{font-size:clamp(23px,3.6vw,34px);margin:0 0 6px;letter-spacing:-.02em;text-wrap:balance;font-weight:760}
.sub{color:var(--muted);font-size:15px;margin:0 0 24px;max-width:75ch}.sub b{color:var(--ink)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 16px;box-shadow:var(--sh)}
.kpi .v{font-size:24px;font-weight:760;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.kpi .l{font-size:12.5px;color:var(--muted);margin-top:3px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--sh);margin-bottom:20px;padding:20px 22px}
.card h2{font-size:12.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin:0 0 4px;font-weight:700}
.card .big{font-size:19px;font-weight:730;letter-spacing:-.01em;margin:0 0 16px}
.stack{display:flex;height:46px;border-radius:9px;overflow:hidden;border:1px solid var(--line)}
.seg{display:flex;align-items:center;justify-content:center;color:#fff;font-size:12.5px;font-weight:700;min-width:0}
.leg{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;font-size:13px}
.leg span{display:inline-flex;align-items:center;gap:6px;color:var(--muted)}
.dot{width:11px;height:11px;border-radius:3px;display:inline-block}
.leg b{color:var(--ink);font-variant-numeric:tabular-nums}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th{text-align:left;padding:8px 10px;border-bottom:2px solid var(--line);font-size:11px;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}
td{padding:8px 10px;border-bottom:1px solid var(--line)}
tr:last-child td{border-bottom:none}
.tot td{border-top:2px solid var(--line);font-weight:750}
.tag{font-size:11px;color:var(--muted)}
.minibar{height:7px;border-radius:4px;background:var(--sal);display:inline-block;vertical-align:middle}
.camadas{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.cam{border:1px solid var(--line);border-radius:13px;padding:16px;border-top:4px solid var(--ct)}
.cam .t{font-weight:750;font-size:14px}.cam .n{font-size:23px;font-weight:760;font-variant-numeric:tabular-nums;margin:6px 0 2px;letter-spacing:-.02em}
.cam .d{font-size:12.5px;color:var(--muted);line-height:1.5}
.cam .pill{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;margin-top:8px}
.note{background:var(--soft);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:10px;padding:14px 16px;font-size:13.5px;line-height:1.6;margin-bottom:20px}
.note b{color:var(--ink)}
.obs{font-size:11px;color:var(--amber)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}@media(max-width:800px){.grid2{grid-template-columns:1fr}}
.foot{color:var(--muted);font-size:12px;line-height:1.6;margin-top:6px}.foot b{color:var(--ink)}
details summary{cursor:pointer;font-weight:700;font-size:12.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);list-style:none}
details summary::before{content:"▸ ";color:var(--accent)}details[open] summary::before{content:"▾ "}
.nt{font-size:13px;line-height:1.7;margin-top:12px}.nt b{color:var(--ink)}.nt li{margin:4px 0}
</style>`;

const pct=(v,t)=>Math.round(v/t*100);
const segS=pct(CONTRATO.salario,CONTRATO.mensal), segE=pct(CONTRATO.encargos,CONTRATO.mensal), segR=100-segS-segE;

const BODY=`<div class="wrap"><div class="c">
<p class="eye">Custo dos programas ao cidadão · i10 Gov 360</p>
<h1>Quanto custa a merenda de Florianópolis — e quem banca</h1>
<p class="sub">Anatomia auditável do custo da alimentação escolar municipal: o <b>contrato de mão de obra terceirizada</b> (decomposto salário por salário), a <b>gestão pública</b> que planeja e fiscaliza, e o <b>custo de transação</b> da licitação.</p>

<div class="kpis">
<div class="kpi"><div class="v">${brl0(CONTRATO.ano)}</div><div class="l">contrato de mão de obra / ano</div></div>
<div class="kpi"><div class="v">550</div><div class="l">postos terceirizados (533 coz. + 17 nutric.)</div></div>
<div class="kpi"><div class="v">37.481</div><div class="l">alunos atendidos (130 escolas)</div></div>
<div class="kpi"><div class="v">8</div><div class="l">servidores do DEPAE (gestão, 100% merenda)</div></div>
</div>

<div class="card">
<h2>De cada R$ 1,00 do contrato terceirizado</h2>
<div class="big">Só <b>34 centavos</b> viram salário na mão da trabalhadora. O resto são encargos, benefícios, estrutura, impostos e lucro da empresa.</div>
<div class="stack">
<div class="seg" style="background:var(--sal);width:${segS}%">${segS}%</div>
<div class="seg" style="background:var(--enc);width:${segE}%">${segE}%</div>
<div class="seg" style="background:var(--rest);width:${segR}%">${segR}%</div>
</div>
<div class="leg">
<span><i class="dot" style="background:var(--sal)"></i>Salário (o que a trabalhadora recebe) — <b>${brl0(CONTRATO.salario)}/mês</b></span>
<span><i class="dot" style="background:var(--enc)"></i>Encargos sociais + benefícios — <b>${brl0(CONTRATO.encargos)}/mês</b></span>
<span><i class="dot" style="background:var(--rest)"></i>Estrutura + deslocamento + BDI + tributos + lucro — <b>${brl0(CONTRATO.resto)}/mês</b></span>
</div>
</div>

<div class="card">
<h2>Custo por posto (mensal) — salário × custo total ao município</h2>
<table><thead><tr><th>Posto</th><th class="num">Qtd</th><th class="num">Salário</th><th class="num">Custo total/posto</th><th class="num">Fator</th><th class="num">Total mensal</th></tr></thead><tbody>
${POSTOS.map(p=>`<tr><td>${p.n}</td><td class="num">${p.q}</td><td class="num">${brl(p.sal)}</td><td class="num"><b>${brl(p.tot)}</b></td><td class="num">${(p.tot/p.sal).toFixed(2)}×</td><td class="num">${brl0(p.q*p.tot)}</td></tr>`).join("")}
<tr class="tot"><td>Total</td><td class="num">550</td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num">${brl0(CONTRATO.mensal)}</td></tr>
</tbody></table>
<p class="foot">Deslocamento das nutricionistas (veículo individual, custo da contratada): <b>R$ 20.045,89/mês</b> — embutido no preço, não reembolsado à parte. Fonte: Planilha de Custos da proposta vencedora (PE 196/2025, SEPAT).</p>
</div>

<div class="card">
<h2>As três camadas de custo — e como cada uma entra no estudo</h2>
<div class="camadas">
<div class="cam" style="--ct:var(--accent)"><div class="t">1. Execução (terceirizada)</div><div class="n">${brl0(CONTRATO.mensal)}<span style="font-size:13px;color:var(--muted)">/mês</span></div><div class="d">550 postos de cozinheiras e nutricionistas. É o grosso do custo.</div><span class="pill" style="background:var(--soft);color:var(--accent)">entra INTEGRAL</span></div>
<div class="cam" style="--ct:var(--blue)"><div class="t">2. Gestão pública (DEPAE)</div><div class="n">${brl0(DEPAE_TOT)}<span style="font-size:13px;color:var(--muted)">/mês</span></div><div class="d">8 servidores estatutários que planejam o cardápio e fiscalizam. 100% dedicados à merenda.</div><span class="pill" style="background:var(--soft);color:var(--blue)">entra INTEGRAL</span></div>
<div class="cam" style="--ct:var(--amber)"><div class="t">3. Transação (licitação)</div><div class="n">~R$ 7,2 mil<span style="font-size:13px;color:var(--muted)">/processo</span></div><div class="d">Pregoeiro, jurídico, ordenadora. Equipe COMPARTILHADA com toda a compra da cidade (~R$570 mi/ano).</div><span class="pill" style="background:var(--soft);color:var(--amber)">só a FRAÇÃO-hora</span></div>
</div>
<div class="note" style="margin:16px 0 0">⚖️ <b>Por que a licitação entra só pela fração:</b> a Secretaria de Licitações roda toda a compra do município. Somar a folha inteira dela (ou o salário de um servidor específico) ao custo da merenda distorce o estudo. Pelo método do <b>Banco Mundial / TCU</b>, entra o <b>custo de transação por processo</b> (horas × cargo × vencimento ≈ R$7,2 mil), não o salário cheio. Assim nenhum outlier de folha contamina o número da merenda.</div>
</div>

<div class="grid2">
<div class="card">
<h2>Gestão — DEPAE (100% merenda)</h2>
<table><thead><tr><th>Servidor</th><th>Papel</th><th class="num">Bruto/mês</th></tr></thead><tbody>
${DEPAE.map(d=>`<tr><td>${d.n}${d.obs?`<br><span class="obs">${d.obs}</span>`:""}</td><td class="tag">${d.p}</td><td class="num">${brl(d.v)}</td></tr>`).join("")}
<tr class="tot"><td colspan="2">Total (8 servidores)</td><td class="num">${brl0(DEPAE_TOT)}</td></tr>
</tbody></table>
<p class="foot">Regime <b>estatutário</b> (RPPS/IPREF). Cargos de concurso (Professor, Nutricionista, Auxiliar de Sala) cedidos à Coordenadoria de Alimentação Escolar. Fonte: Farol TCE-SC (e-Sfinge), jun/2025.</p>
</div>
<div class="card">
<h2>Transação — servidores do processo (base da fração-hora)</h2>
<table><thead><tr><th>Servidor</th><th class="num">Bruto/mês</th></tr></thead><tbody>
${PROCESSO.map(d=>`<tr><td>${d.n}<br><span class="tag">${d.p} · ${d.c}</span></td><td class="num">${brl(d.v)}</td></tr>`).join("")}
</tbody></table>
<p class="foot">⚠️ <b>NÃO somado ao custo da merenda</b> — servem toda a compra da cidade. Listados para calcular a fração de horas dedicada aos processos de merenda.</p>
</div>
</div>

<div class="card"><details><summary>Nota técnica & fontes</summary><div class="nt">
<ul>
<li><b>Contrato / decomposição de custo:</b> Planilha de Custos e Formação de Preços da proposta vencedora (PE 196/2025, SEPAT Multi Service, CNPJ 03.750.757/0001-90). Módulos 1–6 da IN de terceirização.</li>
<li><b>Salários dos servidores:</b> Farol TCE-SC — Pessoal On-line (e-Sfinge), competência jun/2025; remuneração bruta (proventos). Regime estatutário.</li>
<li><b>Alunos e escolas:</b> Censo Escolar INEP 2024 (rede municipal, 130 escolas / 37.481 matrículas).</li>
<li><b>Custo de transação:</b> parâmetro Banco Mundial "Um Ajuste Justo" (2017) / TCU — ~R$7,2 mil por processo licitatório.</li>
<li><b>Tratamento de outliers:</b> valores atípicos de folha (ex.: gratificações de função, retroativos) não distorcem o custo da merenda porque a camada de licitação entra por fração-hora, não por salário cheio; e a gestão (DEPAE) usa valores normalizados.</li>
</ul>
</div></details></div>

<p class="foot"><b>i10 Gov 360</b> — Instituto I10. Exibição neutra e didática; números auditáveis contra as fontes citadas.</p>
</div></div>`;

fs.writeFileSync(OUT+"custo_merenda_consolidado.html", CSS+"\n"+BODY);
console.log("HTML:", (CSS+BODY).length, "bytes | DEPAE total", DEPAE_TOT, "| stack", segS,segE,segR);
