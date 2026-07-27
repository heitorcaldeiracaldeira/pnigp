import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const {byAno}=JSON.parse(fs.readFileSync(OUT+"dotacao_por_ano.json","utf8"));
const tr=JSON.parse(fs.readFileSync(OUT+"empenhos_trilha.json","utf8"));
// cadeia licitação->contrato (top por empenhado)
const contratos=Object.entries(tr).map(([k,c])=>{ const m=k.match(/^(.*?)\s*\[(.*?)\]$/); return {contrato:(m?m[1]:k).trim(),licitacao:(m?m[2]:c.licitacao||"").trim(),forn:c.fornecedor,nat:(c.natureza||[]).join(", "),emp:c.emp||0,liq:c.liq||0,pago:c.pago||0,anos:(c.anos||[]).join("/")}; })
  .filter(x=>x.emp>0||x.pago>0).sort((a,b)=>b.emp-a.emp);
const totEmp=contratos.reduce((s,x)=>s+x.emp,0), totLiq=contratos.reduce((s,x)=>s+x.liq,0), totPago=contratos.reduce((s,x)=>s+x.pago,0);
const isMO=n=>/M[ÃA]O.?DE.?OBRA|TERCEIRIZA|PESSOAL/i.test(n);
const moEmp=contratos.filter(x=>isMO(x.nat)).reduce((s,x)=>s+x.emp,0), moPago=contratos.filter(x=>isMO(x.nat)).reduce((s,x)=>s+x.pago,0);
const genEmp=totEmp-moEmp, genPago=totPago-moPago;
const brl=n=>"R$ "+Number(n).toLocaleString("pt-BR",{maximumFractionDigits:0});
const brlm=n=>"R$ "+(n/1e6).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+" mi";
const anos=Object.keys(byAno);
const CSS=`<style>:root{--bg:#f6f8f8;--pan:#fff;--ink:#0f1b22;--mut:#5c6b74;--ln:#e2e9ec;--ac:#0d7a6b;--sf:#e4f4f0;--sh:0 1px 2px rgba(16,32,44,.06),0 4px 16px rgba(16,32,44,.05)}
@media(prefers-color-scheme:dark){:root{--bg:#0b1013;--pan:#131b20;--ink:#e7eef2;--mut:#8a9aa2;--ln:#232e34;--ac:#2dd4bf;--sf:#0f2c29;--sh:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.25)}}
:root[data-theme=dark]{--bg:#0b1013;--pan:#131b20;--ink:#e7eef2;--mut:#8a9aa2;--ln:#232e34;--ac:#2dd4bf;--sf:#0f2c29}
:root[data-theme=light]{--bg:#f6f8f8;--pan:#fff;--ink:#0f1b22;--mut:#5c6b74;--ln:#e2e9ec;--ac:#0d7a6b;--sf:#e4f4f0}
*{box-sizing:border-box}body{margin:0}.wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;padding:clamp(16px,3vw,40px);line-height:1.5}
.c{max-width:1060px;margin:0 auto}.eye{font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--ac);font-weight:700;margin:0 0 6px}
h1{font-size:clamp(22px,3.4vw,31px);margin:0 0 6px;letter-spacing:-.02em;font-weight:760;text-wrap:balance}.sub{color:var(--mut);font-size:15px;margin:0 0 22px;max-width:76ch}.sub b{color:var(--ink)}
.card{background:var(--pan);border:1px solid var(--ln);border-radius:16px;box-shadow:var(--sh);margin-bottom:20px;padding:20px 22px}.card h2{font-size:12.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);margin:0 0 14px;font-weight:700}
.years{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
.yr{border:1px solid var(--ln);border-radius:13px;padding:16px;border-top:4px solid var(--ac)}.yr .a{font-size:20px;font-weight:770;letter-spacing:-.02em}.yr .row{display:flex;justify-content:space-between;font-size:13px;margin-top:7px;font-variant-numeric:tabular-nums}.yr .row span{color:var(--mut)}.yr .row b{font-weight:700}.yr .pago{color:var(--ac)}
table{border-collapse:collapse;width:100%;font-size:12.5px}th{text-align:left;padding:7px 9px;border-bottom:2px solid var(--ln);font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--mut);white-space:nowrap}th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}td{padding:7px 9px;border-bottom:1px solid var(--ln)}tr:last-child td{border-bottom:none}.tot td{border-top:2px solid var(--ln);font-weight:750}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace}.tbl-scroll{overflow-x:auto}
.split{display:flex;gap:14px;flex-wrap:wrap}.sc{flex:1;min-width:180px;border:1px solid var(--ln);border-radius:12px;padding:15px;border-top:4px solid var(--ct)}.sc .v{font-size:21px;font-weight:760;font-variant-numeric:tabular-nums}.sc .l{font-size:12px;color:var(--mut);margin-top:2px}
.foot{color:var(--mut);font-size:12px;line-height:1.6;margin-top:8px}.foot b{color:var(--ink)}
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12.5px;color:var(--mut);margin-bottom:8px}.flow b{color:var(--ink)}.flow .ar{color:var(--ac);font-weight:700}
</style>`;
const BODY=`<div class="wrap"><div class="c">
<p class="eye">Merenda de Florianópolis · contabilidade pública</p>
<h1>Da licitação ao pagamento — a merenda dentro do orçamento</h1>
<p class="sub">A alimentação escolar rastreada como um auditor lê: <b>Licitação → Contrato → Dotação orçamentária → Empenho → Liquidação → Pagamento</b>, fechada por ano. Unidade <b>19001 (Educação)</b>, função 12, subfunção 306 (Alimentação e Nutrição). Fonte: e-Pública (despesa por dotação) + cadeia dos contratos.</p>

<div class="flow"><b>Licitação</b> <span class="ar">→</span> <b>Contrato</b> <span class="ar">→</span> <b>Dotação</b> <span class="mono">1.19001.12.306.…</span> <span class="ar">→</span> <b>Empenho</b> <span class="ar">→</span> <b>Liquidação</b> <span class="ar">→</span> <b>Pagamento</b></div>

<div class="card"><h2>Custo por ano — gêneros de alimentação (por competência do empenho)</h2>
<div class="years">
${anos.map(a=>{const b=byAno[a];return `<div class="yr"><div class="a">${a}${a==="2026"?' <span style="font-size:11px;color:var(--mut)">(até jul)</span>':''}</div>
<div class="row"><span>Empenhado (compromisso do ano)</span><b class="pago">${brlm(b.emp)}</b></div>
<div class="row"><span>Investimento</span><b>R$ 0,00</b></div></div>`;}).join("")}
</div>
<p class="foot"><b>O custo do ano = o empenhado</b> (compromisso assumido naquela competência). <b>Liquidação e pagamento não são somados por ano</b> de propósito: eles atravessam o exercício — um empenho de 2024 pode ser liquidado/pago em 2025 (restos a pagar). Somar "pago por ano" leva a ler, erradamente, "pagou mais que empenhou". A regra é sempre <b>pago ≤ empenhado</b> por empenho e no acumulado. 100% <b>custeio</b> (3.3.90.30.07 — gêneros), zero investimento; <b>CAISAN</b> e conselhos <b>não entram</b>.</p>
</div>

<div class="card"><h2>Execução acumulada (empenho → liquidação → pagamento)</h2>
<div class="flow" style="margin:0"><span>Empenhado <b>${brlm(anos.reduce((s,a)=>s+byAno[a].emp,0))}</b></span> <span class="ar">→</span> <span>Liquidado <b>${brlm(anos.reduce((s,a)=>s+byAno[a].liq,0))}</b></span> <span class="ar">→</span> <span>Pago <b>${brlm(anos.reduce((s,a)=>s+byAno[a].pago,0))}</b></span></div>
<p class="foot">Visão de caixa acumulada 2024–2026 (gêneros). As diferenças entre as colunas são <b>restos a pagar</b> e empenhos de exercícios anteriores pagos na janela — por isso o pago acumulado ainda carrega pagamentos de empenhos pré-2024. Conciliação plena exige a série completa desde o 1º empenho.</p>
</div>

<div class="card"><h2>Custeio da merenda — gêneros × mão de obra (2024–26)</h2>
<div class="split">
<div class="sc" style="--ct:var(--ac)"><div class="v">${brlm(genEmp)}</div><div class="l">Gêneros — Material de Consumo (33.90.30). Empenhado.</div></div>
<div class="sc" style="--ct:#2563eb"><div class="v">${brlm(moEmp)}</div><div class="l">Mão de obra terceirizada — cozinheiras+nutric. (33.90.37). Empenhado. <b>Rubrica separada.</b></div></div>
</div>
<p class="foot">⚠️ A <b>mão de obra</b> (SEPAT) é lançada em natureza 33.90.37, <b>fora</b> da subfunção "Alimentação e Nutrição" — por isso não entra no fechamento por ano acima (que é só gêneros). Somadas, são o custo total da merenda.</p>
</div>

<div class="card"><h2>Cadeia licitação → contrato → pagamento (maiores)</h2>
<div class="tbl-scroll"><table><thead><tr><th>Licitação</th><th>Contrato</th><th>Fornecedor</th><th>Natureza</th><th>Anos</th><th class="num">Empenhado</th><th class="num">Liquidado</th><th class="num">Pago</th></tr></thead><tbody>
${contratos.slice(0,16).map(x=>`<tr><td class="mono">${x.licitacao||"—"}</td><td class="mono">${x.contrato}</td><td>${x.forn}</td><td>${x.nat.replace(/Material de Consumo/,"Gêneros").replace(/Locação de Mão-de-Obra|Outras Despesas de Pessoal.*/,"Mão de obra")}</td><td>${x.anos}</td><td class="num">${brl(x.emp)}</td><td class="num">${brl(x.liq)}</td><td class="num">${brl(x.pago)}</td></tr>`).join("")}
<tr class="tot"><td colspan="5">Total (${contratos.length} contratos)</td><td class="num">${brl(totEmp)}</td><td class="num">${brl(totLiq)}</td><td class="num">${brl(totPago)}</td></tr>
</tbody></table></div>
<p class="foot">Cada linha rastreia: a <b>licitação de origem</b> → o <b>contrato</b> → a natureza da despesa → empenhado/liquidado/pago. Ex.: <span class="mono">PE196/2025 → 537/SME/2025</span> (SEPAT, mão de obra). Registro de Preços: valor empenhado ≠ gasto (usar o pago). Fonte: e-Pública Florianópolis.</p>
</div>
<p class="foot"><b>i10 Gov 360</b> — Instituto I10. Todos os valores auditáveis contra o e-Pública e o PNCP.</p>
</div></div>`;
fs.writeFileSync(OUT+"contabil_merenda.html", CSS+"\n"+BODY);
console.log("HTML",(CSS+BODY).length,"| contratos",contratos.length,"| genEmp",(genEmp/1e6).toFixed(1),"moEmp",(moEmp/1e6).toFixed(1));
