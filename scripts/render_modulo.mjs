import fs from "fs";
const OUT="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/f8ac14f0-90b3-46cb-a8f8-80231f89cb80/scratchpad/";
const rd=f=>JSON.parse(fs.readFileSync(OUT+f,"utf8"));
const CC=rd("custo_contrato_merenda.json");
const CS=rd("custo_consolidado.json");
const PR=rd("processos_merenda.json");
const {byAno}=rd("dotacao_por_ano.json");
const tr=rd("empenhos_trilha.json");
const TAB=rd("tabela_final.json");
const brl=n=>"R$ "+Number(n).toLocaleString("pt-BR",{maximumFractionDigits:0});
const brlm=n=>"R$ "+(n/1e6).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+" mi";
const brl2=n=>"R$ "+Number(n).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const anos=Object.keys(byAno);
// contrato "de cada R$1"
const segS=Math.round(CC.postos&&899070/CC.total_mensal*100)||34, segE=Math.round(1042165/CC.total_mensal*100)||39, segR=100-segS-segE;
// contratos chain
const cont=Object.entries(tr).map(([k,c])=>{const m=k.match(/^(.*?)\s*\[(.*?)\]$/);return{contrato:(m?m[1]:k).trim(),lic:(m?m[2]:c.licitacao||"").trim(),forn:c.fornecedor,nat:(c.natureza||[]).join(", "),emp:c.emp||0,pago:c.pago||0,anos:(c.anos||[]).join("/")};}).filter(x=>x.emp>0).sort((a,b)=>b.emp-a.emp);
const totEmpC=cont.reduce((s,x)=>s+x.emp,0),totPagoC=cont.reduce((s,x)=>s+x.pago,0);
const cats=Object.entries(PR.byCat).map(([c,x])=>({c,...x})).sort((a,b)=>b.emp-a.emp);
const maxCat=Math.max(...cats.map(c=>c.emp));
const empAno=anos.reduce((s,a)=>s+byAno[a].emp,0);
const alunos=TAB.kpi.alunos;
const custoAluno=Math.round((empAno+107100000)/(alunos*3)); // gêneros+mão de obra / 3 anos aprox
// esc kpis
const K=TAB.kpi;
const CSS=`<style>:root{--bg:#f6f8f8;--pan:#fff;--ink:#0f1b22;--mut:#5c6b74;--ln:#e2e9ec;--ac:#0d7a6b;--sf:#e4f4f0;--sal:#0d7a6b;--enc:#e0a53a;--rest:#9aa7ad;--onac:#fff;--sh:0 1px 2px rgba(16,32,44,.06),0 4px 16px rgba(16,32,44,.05)}
@media(prefers-color-scheme:dark){:root{--bg:#0b1013;--pan:#131b20;--ink:#e7eef2;--mut:#8a9aa2;--ln:#232e34;--ac:#2dd4bf;--sf:#0f2c29;--sal:#2dd4bf;--enc:#e0b060;--rest:#5c6b72;--onac:#08221e;--sh:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.25)}}
:root[data-theme=dark]{--bg:#0b1013;--pan:#131b20;--ink:#e7eef2;--mut:#8a9aa2;--ln:#232e34;--ac:#2dd4bf;--sf:#0f2c29;--sal:#2dd4bf;--enc:#e0b060;--rest:#5c6b72;--onac:#08221e}
:root[data-theme=light]{--bg:#f6f8f8;--pan:#fff;--ink:#0f1b22;--mut:#5c6b74;--ln:#e2e9ec;--ac:#0d7a6b;--sf:#e4f4f0;--sal:#0d7a6b;--enc:#e0a53a;--rest:#9aa7ad;--onac:#fff}
*{box-sizing:border-box}body{margin:0}.wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;padding:clamp(14px,3vw,36px);line-height:1.5}
.c{max-width:1060px;margin:0 auto}.eye{font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--ac);font-weight:700;margin:0 0 6px}
h1{font-size:clamp(22px,3.4vw,32px);margin:0 0 6px;letter-spacing:-.02em;font-weight:770;text-wrap:balance}.sub{color:var(--mut);font-size:15px;margin:0 0 18px;max-width:76ch}.sub b{color:var(--ink)}
.nav{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:6px;padding:10px 0;background:var(--bg);border-bottom:1px solid var(--ln);margin-bottom:20px}
.nav button{border:1px solid var(--ln);background:var(--pan);color:var(--mut);border-radius:999px;padding:7px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.nav button.on{background:var(--ac);border-color:var(--ac);color:var(--onac)}
.sec{display:none}.sec.on{display:block}
.card{background:var(--pan);border:1px solid var(--ln);border-radius:16px;box-shadow:var(--sh);margin-bottom:18px;padding:20px 22px}.card h2{font-size:12.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);margin:0 0 12px;font-weight:700}.card .big{font-size:18px;font-weight:730;margin:0 0 14px;letter-spacing:-.01em}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}.kpi{background:var(--pan);border:1px solid var(--ln);border-radius:14px;padding:14px 16px;box-shadow:var(--sh)}.kpi .v{font-size:23px;font-weight:760;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.kpi .l{font-size:12.5px;color:var(--mut);margin-top:3px}
.stack{display:flex;height:44px;border-radius:9px;overflow:hidden;border:1px solid var(--ln)}.seg{display:flex;align-items:center;justify-content:center;color:#fff;font-size:12.5px;font-weight:700}
.leg{display:flex;flex-wrap:wrap;gap:14px;margin-top:11px;font-size:13px}.leg span{display:inline-flex;align-items:center;gap:6px;color:var(--mut)}.dot{width:11px;height:11px;border-radius:3px}.leg b{color:var(--ink)}
table{border-collapse:collapse;width:100%;font-size:13px}th{text-align:left;padding:7px 9px;border-bottom:2px solid var(--ln);font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--mut);white-space:nowrap}th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}td{padding:7px 9px;border-bottom:1px solid var(--ln)}tr:last-child td{border-bottom:none}.tot td{border-top:2px solid var(--ln);font-weight:750}
.brow{display:grid;grid-template-columns:180px 1fr auto;gap:10px;align-items:center;margin:8px 0;font-size:13px}.brow .lab{font-weight:600}.brow .lab small{color:var(--mut);font-weight:400;display:block;font-size:11px}.track{background:var(--sf);border-radius:6px;height:20px;overflow:hidden}.fill{height:100%;border-radius:6px}.brow .val{font-variant-numeric:tabular-nums;font-size:12px;color:var(--mut);text-align:right}.brow .val b{color:var(--ink)}
.years{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.yr{border:1px solid var(--ln);border-radius:13px;padding:15px;border-top:4px solid var(--ac)}.yr .a{font-size:19px;font-weight:770}.yr .row{display:flex;justify-content:space-between;font-size:13px;margin-top:6px;font-variant-numeric:tabular-nums}.yr .row span{color:var(--mut)}
.cam{border:1px solid var(--ln);border-radius:13px;padding:15px;border-top:4px solid var(--ct)}.cam .t{font-weight:750;font-size:14px}.cam .n{font-size:22px;font-weight:760;font-variant-numeric:tabular-nums;margin:5px 0 2px}.cam .d{font-size:12.5px;color:var(--mut)}.cam .pill{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;margin-top:8px;background:var(--sf);color:var(--ac)}
.g3{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.mono{font-family:ui-monospace,Menlo,Consolas,monospace}.tbl-scroll{overflow-x:auto}.foot{color:var(--mut);font-size:12px;line-height:1.6;margin-top:8px}.foot b{color:var(--ink)}.dim{color:var(--mut)}.yes{color:var(--ac);font-weight:700}
.note{background:var(--sf);border:1px solid var(--ln);border-left:3px solid var(--ac);border-radius:10px;padding:13px 15px;font-size:13px;line-height:1.6}.note b{color:var(--ink)}
</style>`;
const secContrato=`<div class="card"><h2>De cada R$ 1,00 do contrato terceirizado</h2><div class="big">Só <b>${segS} centavos</b> viram salário. O resto é encargo, benefício, estrutura, imposto e lucro.</div>
<div class="stack"><div class="seg" style="background:var(--sal);width:${segS}%">${segS}%</div><div class="seg" style="background:var(--enc);width:${segE}%">${segE}%</div><div class="seg" style="background:var(--rest);width:${segR}%">${segR}%</div></div>
<div class="leg"><span><i class="dot" style="background:var(--sal)"></i>Salário</span><span><i class="dot" style="background:var(--enc)"></i>Encargos+benefícios</span><span><i class="dot" style="background:var(--rest)"></i>Estrutura+deslocamento+BDI+tributos+lucro</span></div></div>
<div class="card"><h2>Custo por posto (mensal)</h2><table><thead><tr><th>Posto</th><th class="num">Qtd</th><th class="num">Salário</th><th class="num">Custo total/posto</th><th class="num">Fator</th></tr></thead><tbody>
${Object.values(CC.postos).map(p=>`<tr><td>${p.qtd===170?"Cozinheira 40h":p.qtd===363?"Cozinheira 30h":"Nutricionista 40h"}</td><td class="num">${p.qtd}</td><td class="num">${brl2(p.salario_m1)}</td><td class="num"><b>${brl2(p.valor_unitario_mes)}</b></td><td class="num">${(p.valor_unitario_mes/p.salario_m1).toFixed(2)}×</td></tr>`).join("")}
<tr class="tot"><td>Total mensal</td><td class="num">${CC.total_postos}</td><td class="num" colspan="3" style="text-align:right">${brl2(CC.total_mensal)}</td></tr></tbody></table>
<p class="foot">Deslocamento das nutricionistas (veículo individual, custo da contratada): <b>${brl2(CC.estrutura_indireta_mensal.itens.deslocamento_nutricionistas)}/mês</b>. Fonte: Planilha de Custos PE 196/2025 (SEPAT).</p></div>`;
const secCamadas=`<div class="card"><h2>As três camadas de custo</h2><div class="g3">
<div class="cam" style="--ct:var(--ac)"><div class="t">1. Execução (terceirizada)</div><div class="n">${brl(CC.total_mensal)}<span style="font-size:12px;color:var(--mut)">/mês</span></div><div class="d">550 postos.</div><span class="pill">entra INTEGRAL</span></div>
<div class="cam" style="--ct:#2563eb"><div class="t">2. Gestão (DEPAE)</div><div class="n">${brl(CS.DEPAE_TOT)}<span style="font-size:12px;color:var(--mut)">/mês</span></div><div class="d">8 servidores estatutários, 100% merenda.</div><span class="pill">entra INTEGRAL</span></div>
<div class="cam" style="--ct:#b8791f"><div class="t">3. Transação (licitação)</div><div class="n">~R$ 7,2 mil<span style="font-size:12px;color:var(--mut)">/proc</span></div><div class="d">Pregoeiro, jurídico, ordenadora — compartilhado com toda a cidade.</div><span class="pill">só a FRAÇÃO-hora</span></div></div>
<div class="note" style="margin-top:14px">⚖️ A equipe de Licitações roda toda a compra do município (~R$570mi/ano). Somar a folha inteira ao custo da merenda distorce. Pelo método Banco Mundial/TCU entra o <b>custo de transação por processo</b>, não o salário cheio — assim nenhum outlier contamina.</div></div>`;
const secPort=`<div class="card"><h2>Portfólio — empenhado por categoria (2024–26)</h2>
${cats.map(x=>`<div class="brow"><span class="lab">${x.c.replace(/ \(.*\)/,"")}<small>${x.n} proc</small></span><div class="track"><div class="fill" style="width:${Math.round(x.emp/maxCat*100)}%;background:var(--ac)"></div></div><span class="val"><b>${brlm(x.emp)}</b></span></div>`).join("")}
<p class="foot">Mão de obra (SEPAT) concentra 55%; os gêneros (frutas, pães, carnes, secos, lácteos) são 45% pulverizados em 22 processos. <b>Não há vale-alimentação</b> — a merenda é refeição preparada na escola.</p></div>`;
const secContab=`<div class="card"><h2>Custo por ano — gêneros (competência do empenho)</h2><div class="years">
${anos.map(a=>`<div class="yr"><div class="a">${a}${a==="2026"?' <span style="font-size:11px;color:var(--mut)">(até jul)</span>':''}</div><div class="row"><span>Empenhado</span><b>${brlm(byAno[a].emp)}</b></div><div class="row"><span>Investimento</span><b>R$ 0,00</b></div></div>`).join("")}</div>
<p class="foot"><b>Custo do ano = empenhado</b> (competência). Liquidação/pagamento atravessam exercícios (restos a pagar) — não somados por ano. <b>pago ≤ empenhado</b> sempre. 100% custeio (33.90.30.07), zero investimento. CAISAN fora.</p></div>
<div class="card"><h2>Cadeia licitação → contrato → pagamento</h2><div class="tbl-scroll"><table><thead><tr><th>Licitação</th><th>Contrato</th><th>Fornecedor</th><th>Natureza</th><th class="num">Empenhado</th><th class="num">Pago</th></tr></thead><tbody>
${cont.slice(0,14).map(x=>`<tr><td class="mono">${x.lic||"—"}</td><td class="mono">${x.contrato}</td><td>${x.forn}</td><td>${x.nat.replace(/Material de Consumo/,"Gêneros").replace(/Locação de Mão-de-Obra|Outras Despesas de Pessoal.*/,"Mão de obra")}</td><td class="num">${brl(x.emp)}</td><td class="num">${brl(x.pago)}</td></tr>`).join("")}
<tr class="tot"><td colspan="4">Total (${cont.length} contratos)</td><td class="num">${brl(totEmpC)}</td><td class="num">${brl(totPagoC)}</td></tr></tbody></table></div>
<div class="note" style="margin-top:14px"><b>Nota técnica — contratos anteriores a 2024 na janela.</b> Alguns rótulos mostram a licitação-mãe de anos anteriores (ex.: <span class="mono">CC899/2018 → contrato 598/SME/2019</span>), mas <b>entram corretamente</b>: a execução (empenho e pagamento) ocorreu em <b>2024–2025</b>. A mão de obra da merenda rodou sob o contrato de terceirização <b>598/SME/2019</b> — renovado e ativo até <b>out/2025</b>, quando o <b>PE 196/2025 (537/SME/2025)</b> assumiu. Por isso a SEPAT aparece em 3 instrumentos contínuos: <b>598/SME/2019</b> (antigo) → <b>400/2025</b> (dispensa emergencial) → <b>537/SME/2025</b> (novo). A natureza <b>"Despesas de Exercícios Anteriores"</b> indica que parte são restos de anos anteriores quitados na janela. Não é gasto de 2018/2019 se infiltrando — é a execução de 2024–2025 de contratos assinados antes.</div></div>`;
const secEsc=`<div class="kpis"><div class="kpi"><div class="v">${K.escolas}</div><div class="l">escolas municipais</div></div><div class="kpi"><div class="v">${alunos.toLocaleString("pt-BR")}</div><div class="l">alunos (censo INEP)</div></div><div class="kpi"><div class="v">${K.comCozinha}/${K.escolas}</div><div class="l">com cozinha</div></div><div class="kpi"><div class="v">${K.nutri}</div><div class="l">nutricionistas · ${K.rotas} rotas</div></div></div>
<div class="card"><h2>Escolas por rota (nutricionistas)</h2><div class="tbl-scroll"><table><thead><tr><th>Rota</th><th class="num">Escolas</th><th class="num">Cozinheiras</th><th class="num">Alunos</th></tr></thead><tbody>
${TAB.rotas.map(r=>`<tr><td>${r.rota}</td><td class="num">${r.esc}</td><td class="num">${r.coz}</td><td class="num">${r.al.toLocaleString("pt-BR")}</td></tr>`).join("")}</tbody></table></div>
<p class="foot">Cada nutricionista cobre uma rota regional de ~9 escolas. Censo confirma cozinha em 100% das ${K.escolas} escolas. Tabela por escola completa no estudo detalhado.</p></div>
<div class="card"><h2>🍽️ Quantas refeições por dia — cálculo com tempo integral REAL (INEP)</h2>
<div class="big">≈ <b>73 mil refeições por dia</b> na rede — cerca de <b>138 por cozinheira</b>.</div>
<div class="tbl-scroll"><table><thead><tr><th>Segmento (turno real do INEP)</th><th class="num">Matrículas</th><th class="num">Refeições/aluno/dia</th><th class="num">Refeições/dia</th></tr></thead><tbody>
<tr><td>Tempo integral — creche+pré+fund</td><td class="num">10.466</td><td class="num">4</td><td class="num">41.864</td></tr>
<tr><td>Creche parcial</td><td class="num">4.409</td><td class="num">2</td><td class="num">8.818</td></tr>
<tr><td>Pré-escola parcial</td><td class="num">4.453</td><td class="num">1</td><td class="num">4.453</td></tr>
<tr><td>Fundamental parcial</td><td class="num">17.256</td><td class="num">1</td><td class="num">17.256</td></tr>
<tr><td>EJA</td><td class="num">897</td><td class="num">1</td><td class="num">897</td></tr>
<tr class="tot"><td>Total</td><td class="num">37.481</td><td class="num"></td><td class="num">≈ 73.288</td></tr>
<tr><td class="dim">÷ 533 cozinheiras</td><td class="num dim"></td><td class="num dim"></td><td class="num dim">≈ 138/cozinheira/dia</td></tr>
</tbody></table></div>
<p class="foot"><b>Agora com dado real, não estimado:</b> o <b>tempo integral por etapa vem do Censo INEP 2024</b> (campos QT_MAT_INF_CRE_INT / QT_MAT_INF_PRE_INT / QT_MAT_FUND_INT) — creche 49% integral, pré 41%, fundamental 16%. As <b>refeições por segmento</b> seguem o PNAE: integral (≥7h) = 4 refeições/dia; creche parcial = 2; pré/fundamental parcial e EJA = 1. As <b>533 cozinheiras</b> vêm do TR. <b>Cálculo:</b> (10.466×4)+(4.409×2)+(4.453×1)+(17.256×1)+(897×1) = 73.288 ÷ 533 = 138. A estimativa anterior (95 mil) supunha creche/infantil toda integral; com o turno real do INEP, o número cai para ~73 mil. O único parâmetro ainda "de tabela" é o nº de refeições por segmento (padrão PNAE) — o exato está no cardápio do DEPAE.</p></div>`;
const RF=[["2024",7.93,13.55,57.92,79.40,73],["2025",10.23,17.42,49.07,76.72,64],["2026 (até jul)",3.95,9.44,33.26,46.65,71]];
const secPan=`<div class="kpis"><div class="kpi"><div class="v">${brlm(202.78e6)}</div><div class="l">empenhado na merenda 2024–26</div></div><div class="kpi"><div class="v">69%</div><div class="l">bancado com recurso próprio</div></div><div class="kpi"><div class="v">${alunos.toLocaleString("pt-BR")}</div><div class="l">alunos atendidos</div></div><div class="kpi"><div class="v">550</div><div class="l">postos terceirizados</div></div></div>
<div class="card"><h2>De onde vem o recurso — por ano (empenhado)</h2>
<div class="tbl-scroll"><table><thead><tr><th>Ano</th><th class="num">PNAE (fed, carimbado)</th><th class="num">Salário-Educação (fed)</th><th class="num">Impostos-Educação (próprio)</th><th class="num">Total</th><th class="num">% próprio</th></tr></thead><tbody>
${RF.map(r=>`<tr><td><b>${r[0]}</b></td><td class="num">R$ ${r[1].toFixed(2).replace(".",",")} mi</td><td class="num">R$ ${r[2].toFixed(2).replace(".",",")} mi</td><td class="num">R$ ${r[3].toFixed(2).replace(".",",")} mi</td><td class="num"><b>R$ ${r[4].toFixed(2).replace(".",",")} mi</b></td><td class="num">${r[5]}%</td></tr>`).join("")}
<tr class="tot"><td>Total</td><td class="num">R$ 22,11 mi</td><td class="num">R$ 40,41 mi</td><td class="num">R$ 140,26 mi</td><td class="num">R$ 202,78 mi</td><td class="num">69%</td></tr>
<tr><td class="dim">Participação</td><td class="num dim">11%</td><td class="num dim">20%</td><td class="num dim">69%</td><td class="num"></td><td class="num"></td></tr>
</tbody></table></div>
<div class="note" style="margin-top:12px"><b>Só 11% da merenda vem de recurso federal carimbado (PNAE)</b> — o único que a lei destina à alimentação escolar (Lei 11.947/2009). O <b>Salário-Educação (20%)</b> é federal mas juridicamente destinado ao <b>ensino</b>, não à merenda (art. 212 §5º CF) — ponto de atenção. Os <b>69% de impostos próprios</b> são gasto do bolso do município e <b>não contam no piso de 25% do MDE</b> — o art. 71, V da LDB exclui a alimentação escolar do MDE. O município banca ~R$140 mi em 3 anos; o PNAE cobre pouco mais de 1/10.</div></div>
<div class="card"><h2>🇧🇷 Os pesos do PNAE por grupo de estudante (2026)</h2>
<div class="big">O FNDE paga por refeição/dia: <b>alunos × 200 dias letivos × peso do grupo</b>.</div>
<div class="tbl-scroll"><table><thead><tr><th>Grupo</th><th class="num">Peso (R$/aluno/dia)</th></tr></thead><tbody>
<tr><td>Creche e tempo integral</td><td class="num"><b>R$ 1,57</b></td></tr>
<tr><td>Escolas indígenas / quilombolas</td><td class="num">R$ 0,98</td></tr>
<tr><td>Pré-escola</td><td class="num">R$ 0,82</td></tr>
<tr><td>Ensino Fundamental, Médio e EJA</td><td class="num">R$ 0,57</td></tr>
</tbody></table></div>
<div class="note" style="margin-top:12px"><b>O modelo federal não bate com o custo real do município.</b> O PNAE paga por uma lógica de <b>refeição por dia letivo</b> (peso × 200 dias). Aplicando os pesos ao Censo de Floripa, o repasse dá <b>~R$ 7–8 mi/ano</b> (2024 = R$7,93mi, confere). Mas o <b>custo é anual e fixo</b>: a <b>folha de 550 postos roda 12 meses</b> e os <b>contratos de gêneros</b> são fixos por vigência. O peso federal cobre a comida do dia letivo — <b>não cobre a estrutura fixa (folha + contratos)</b> que roda o ano todo. Fonte: Resolução CD/FNDE nº 1, de 18/02/2026.</div></div>
<div class="card"><h2>🍽️ Custo por aluno — o que o federal cobre vs o real</h2>
<div class="big">O município gasta <b>~R$ 10,50 por aluno/dia</b>. O peso do PNAE do fundamental é <b>R$ 0,57</b>.</div>
<div class="tbl-scroll"><table><thead><tr><th>Ano</th><th class="num">Custo/aluno/ano</th><th class="num">Custo/aluno/dia (200d)</th><th class="num">PNAE recebido/aluno/dia</th><th class="num">Município/aluno/dia</th></tr></thead><tbody>
<tr><td><b>2024</b></td><td class="num">R$ 2.118</td><td class="num"><b>R$ 10,59</b></td><td class="num">R$ 1,06</td><td class="num">R$ 9,53</td></tr>
<tr><td><b>2025</b></td><td class="num">R$ 2.047</td><td class="num"><b>R$ 10,24</b></td><td class="num">R$ 1,36</td><td class="num">R$ 8,88</td></tr>
</tbody></table></div>
<div class="note" style="margin-top:12px"><b>O federal cobre ~10% do custo real por aluno.</b> O peso do PNAE paga a <b>comida do dia letivo</b> (R$0,57 fundamental a R$1,57 creche). Mas o custo real por aluno/dia (~R$10,50) inclui a <b>folha fixa de 550 postos rodando 12 meses</b> + gêneros + gestão. Por isso ~90% sai do município. Base: 37.481 alunos (Censo INEP), empenhado da merenda ÷ alunos ÷ 200 dias.</div></div>
<div class="card"><h2>⏱️ Um descompasso interessante — recebe em 10, gasta em 12</h2><div class="big">O PNAE é repassado em <b>10 parcelas</b> (fev–nov), mas a merenda roda <b>12 meses</b>.</div>
<div class="foot" style="font-size:13px">O FNDE calcula o PNAE sobre <b>200 dias letivos</b> e transfere em <b>10 parcelas mensais (fevereiro a novembro)</b> — nada em dezembro e janeiro. Mas o principal custo da merenda — a <b>mão de obra terceirizada</b> (cozinheiras/nutricionistas) — é pago nos <b>12 meses</b>: os postos são mantidos no recesso (o trabalhador não é demitido), e a fatura mensal corre o ano todo. Resultado: o já pequeno PNAE (11%) chega <b>concentrado em 10 meses</b>, enquanto a folha do contrato se espalha por 12 — nos meses <b>sem parcela federal (dez/jan)</b> o <b>município banca 100% com recurso próprio</b>. É mais um fator que empurra o esforço para o caixa municipal. <i>(Obs.: o calendário da rede — inclusive NEIMs — tem recesso dez–fev; o descompasso vem do contrato de mão de obra ser mensal, não de a creche ficar aberta.)</i></div></div>
<div class="note">Este módulo decompõe o custo da <b>alimentação escolar de Florianópolis</b> — do contrato terceirizado (salário por salário) à gestão pública, ao portfólio de processos e à contabilidade orçamentária (licitação→contrato→dotação→empenho→pagamento). Navegue pelas abas. Fontes: e-Pública, PNCP, Censo INEP, Farol TCE-SC, Planilha de Custos da vencedora.</div>`;
const GESTAO=[
 ["Carla Cristina Britto","Coordenadora do DEPAE","Professor",17827.23,"assinou TR + ETP"],
 ["Lidiamara Dornelles de Souza","Nutricionista — Resp. Técnica","Nutricionista",9479.46,"assinou TR + ETP"],
 ["Renata Brodbeck Faust","Nutricionista","Nutricionista",8300.41,"assinou TR + ETP"],
 ["Raquel Erdmann","Nutricionista","Nutricionista",6385.04,""],
 ["Gisele Liliam D'Avila","Nutricionista","Nutricionista",5688.07,""],
 ["Daniele Hack Alves Coelho","Administrativo","Auxiliar de Sala",4571.44,""],
 ["Graziela Ladwig de Souza","Administrativo","Auxiliar de Sala",4624.37,""],
 ["Heloisa Helena Braga de Oliveira","Administrativo","Auxiliar de Sala",4450.66,""],
];
const LICIT=[
 ["Thiago M. P. da Silveira","Secretário de Educação — demandante / gestor","Secretário Municipal",23544.23,"assinou DFD"],
 ["Katherine Schreiner","Ordenadora de despesa — Sec. de Licitações","Secretário Municipal",23544.23,"homologou"],
 ["Rodrigo Buenavides Rodrigues","Pregoeiro","Administrador",18325.25,"conduziu a disputa"],
 ["Jauna Medianeira Argenta","Equipe de apoio","Administrador",18297.77,""],
 ["Sidnei Silva","Equipe de apoio","Contínuo",13851.89,""],
 ["Edgard Pinto Junior","Parecer jurídico","Assessor Técnico",7876.88,""],
 ["Alexandre Farias Luz","Responsável jurídico","Assessor Técnico",6358.88,""],
 ["Marcia C. de Araujo Gomes","Chefia","Auxiliar de Sala",5397.71,"assinou TR + ETP"],
];
const rowP=r=>`<tr><td><b>${r[0]}</b>${r[4]?`<br><span class="tag" style="font-size:10.5px;color:var(--ac)">${r[4]}</span>`:""}</td><td class="tag">${r[1]}</td><td class="tag">${r[2]}</td><td class="num">${brl2(r[3])}</td></tr>`;
const totG=GESTAO.reduce((s,r)=>s+r[3],0), totL=LICIT.reduce((s,r)=>s+r[3],0);
const LE=rd("folha_licitacao_equipe.json").servidores;
const LOTord=["GERENCIA DO SISTEMA DE COMPRAS","DIRETORIA DE LICITACOES","DIR DO SISTEMA DE LICITACOES E CONTRATOS","SUBSECR DE LICIT CONTRATOS E CONCESSOES","SUPERINTENDEN DE LICITACOES E CONTRATOS","ASSESSORIA DE COMPRAS","DIRETORIA DE CONTRATOS","GERENCIA DO SISTEMA DE CONTRATOS"];
const leByLot={}; LE.forEach(x=>{(leByLot[x.lotacao]??=[]).push(x);});
const totLE=LE.reduce((s,x)=>s+x.bruto,0);
const secEquipe=`<div class="card"><h2>🍎 Gestão do programa — DEPAE (Coordenadoria de Alimentação Escolar)</h2>
<div class="big">8 servidores estatutários <b>100% dedicados à merenda</b> — e é justamente por isso que atuam em <b>TODAS as ~25 licitações</b> do programa, não em uma.</div>
<div class="tbl-scroll"><table><thead><tr><th>Servidor</th><th>Papel</th><th>Cargo de concurso</th><th class="num">Bruto/mês</th></tr></thead><tbody>
${GESTAO.map(rowP).join("")}<tr class="tot"><td colspan="3">Total (8 servidores)</td><td class="num">${brl2(totG)}</td></tr></tbody></table></div>
<p class="foot">Ninguém tem cargo "coordenador de alimentação": são efetivos (Professor/Nutricionista/Auxiliar de Sala) cedidos à função. <b>Por exigência do PNAE (Lei 11.947/2009 + Resolução CFN), a nutricionista RT do DEPAE elabora o cardápio, a pesquisa de preço e o Termo de Referência de CADA processo de merenda</b> — a mão de obra (SEPAT) <b>e</b> os gêneros (pães, carnes, hortifruti, secos, lácteos, cooperativas). Confirmado nas assinaturas do TR do processo SEPAT (Carla, Renata, Lidiamara). Ou seja: a mesma equipe assina dezenas de TRs/ETPs por ano e fiscaliza a execução de todos os contratos — o "100% merenda" significa <b>todo o portfólio</b> (ver aba Portfólio: 25 processos), não um contrato só. Fonte: Farol TCE-SC + assinaturas PNCP.</p></div>
<div class="card"><h2>📄 Documentos e condução da licitação (equipe compartilhada com a cidade)</h2>
<div class="tbl-scroll"><table><thead><tr><th>Servidor</th><th>Papel no processo</th><th>Cargo</th><th class="num">Bruto/mês</th></tr></thead><tbody>
${LICIT.map(rowP).join("")}<tr class="tot"><td colspan="3">Total (8 servidores)</td><td class="num">${brl2(totL)}</td></tr></tbody></table></div>
<p class="foot">⚠️ Esta equipe roda <b>toda a compra da cidade (~R$570mi/ano)</b> — não é custo exclusivo da merenda. Entra no estudo apenas a <b>fração de horas</b> dedicada aos processos de merenda (custo de transação ~R$7,2 mil/processo). O subsídio de Secretário é fixo (Thiago = Katherine = R$23.544). Fontes: Farol TCE-SC + Ata do pregão (WBC) + assinaturas digitais do PNCP.</p></div>
<div class="card"><h2>🏛️ Secretaria de Licitações (SMLCP) — estrutura completa</h2>
<div class="big">${LE.length} servidores rodam <b>todos os processos da cidade</b> (~R$570 mi/ano) — folha de ${brl2(totLE)}/mês.</div>
<div class="tbl-scroll"><table><thead><tr><th>Lotação</th><th>Servidor</th><th>Cargo</th><th class="num">Bruto/mês</th></tr></thead><tbody>
${LOTord.filter(l=>leByLot[l]).map(l=>leByLot[l].sort((a,b)=>b.bruto-a.bruto).map((x,i)=>`<tr><td class="tag">${i===0?l.replace(/DIR /,"DIR. ").replace(/SUBSECR/,"SUBSEC.").replace(/SUPERINTENDEN/,"SUPERINTEND."):""}</td><td>${x.nome.split(" ").map(w=>w[0]+w.slice(1).toLowerCase()).join(" ")}</td><td class="tag">${x.cargo.split(" ").map(w=>w[0]+w.slice(1).toLowerCase()).join(" ")}</td><td class="num">${brl2(x.bruto)}${x.bruto>50000?' ⚠️':''}</td></tr>`).join("")).join("")}
<tr class="tot"><td colspan="3">Total (${LE.length} servidores)</td><td class="num">${brl2(totLE)}</td></tr></tbody></table></div>
<p class="foot">Pregoeiro do processo da merenda: <b>Rodrigo Buenavides</b> (Ger. Sistema de Compras). ⚠️ Carolina Burigo (Subsecretária, arquiteta) tem R$73k/mês por gratificação de função (Lei 6069/02) — valor real e estável, mas destoa da equipe. Como o custo da merenda usa só a <b>fração-hora</b>, esse tipo de outlier não distorce o estudo. Fonte: Farol TCE-SC (jun/2025).</p></div>
${(()=>{const H=[["Katherine Schreiner","Ordenação de despesa / controle de legalidade",23544.23,12],["Rodrigo Buenavides Rodrigues","Condução do pregão (sessão + análise)",18325.25,30],["Jauna Medianeira Argenta","Apoio ao pregão",18297.77,15],["Sidnei Silva","Apoio ao pregão",13851.89,15],["Alexandre Farias Luz","Análise jurídica",6358.88,10],["Edgard Pinto Junior","Parecer jurídico",7876.88,8]];
const HM=200; let th=0,tc=0,tbase=0,tret=0; const rows=H.map(r=>{const ret=r[3]*0.1; const h=r[3]+ret; const rh=r[2]/HM; const c=rh*h; th+=h; tbase+=r[3]; tret+=ret; tc+=c; return `<tr><td>${r[0]}</td><td class="tag">${r[1]}</td><td class="num">${r[3]}h</td><td class="num">${ret.toFixed(1)}h</td><td class="num"><b>${h.toFixed(1)}h</b></td><td class="num">${brl2(rh)}</td><td class="num">${brl2(c)}</td></tr>`;}).join("");
const enc=tc*0.4; const tot=tc+enc;
return `<div class="card"><h2>⏱️ Estimativa de horas no processo — custo de transação (método Banco Mundial/TCU)</h2>
<div class="big">A equipe pública dedicou ~<b>${th.toFixed(0)}h</b> a este processo (${tbase}h + ${tret.toFixed(0)}h de retrabalho). Custo estimado: <b>${brl2(tot)}</b>.</div>
<div class="tbl-scroll"><table><thead><tr><th>Servidor</th><th>Atividade</th><th class="num">Horas base</th><th class="num">Retrabalho +10%</th><th class="num">Horas total</th><th class="num">R$/hora</th><th class="num">Custo</th></tr></thead><tbody>
${rows}<tr class="tot"><td colspan="2">Subtotal (salário)</td><td class="num">${tbase}h</td><td class="num">${tret.toFixed(0)}h</td><td class="num">${th.toFixed(0)}h</td><td class="num"></td><td class="num">${brl2(tc)}</td></tr>
<tr><td colspan="6" class="dim">+ Encargos patronais (RPPS + 13º + férias, ~40%)</td><td class="num">${brl2(enc)}</td></tr>
<tr class="tot"><td colspan="6"><b>Custo de transação do processo</b></td><td class="num"><b>${brl2(tot)}</b></td></tr>
</tbody></table></div>
<p class="foot"><b>Só a equipe de LICITAÇÕES entra por horas</b> — ela é compartilhada com toda a compra da cidade (~R$570mi/ano), então imputa-se à merenda apenas a fração dedicada a este processo. Já a <b>equipe da Secretaria de Educação (DEPAE) é 100% merenda → entra INTEGRAL</b> (os R$61,6k/mês da tabela de gestão acima, incluindo as horas em que as nutricionistas escreveram o TR — que já é o trabalho delas). <b>Método:</b> horas × valor-hora (bruto ÷ ${HM}h/mês) + 10% de retrabalho + encargos patronais (~40%). Horas são estimativas pela complexidade (mão de obra, R$15,8mi, 16 licitantes, com recurso). Referência: Banco Mundial "Um Ajuste Justo" (2017). O custo de transação (${brl2(tot)}) equivale a <b>~${(tot/15833330*100).toFixed(2)}% do contrato</b> (R$15,8mi).</p></div>`;})()}`;
const FONTES=[
 ["Licitação, objeto, valor homologado, modalidade","PNCP","Cadastramento da contratação"],
 ["TR · ETP · DFD (documentos de planejamento)","PNCP","Anexos do processo"],
 ["Assinaturas digitais — quem elaborou o TR/ETP/DFD","PNCP","Bloco de assinatura dos documentos"],
 ["Empenho → Liquidação → Pagamento (cadeia)","e-Pública","Execução orçamentária"],
 ["Dotação orçamentária + fonte de recurso + natureza","e-Pública","Classificação da despesa"],
 ["Contrato, favorecido, gestor, vigência","e-Pública","Módulo de contratos"],
 ["Pregoeiro, equipe de apoio (Ata da sessão)","WBC / Paradigma","Plataforma da disputa"],
 ["Salários nominais dos servidores","Farol TCE-SC (e-Sfinge)","Folha de pessoal municipal"],
 ["Decomposição de custo por posto (salário/encargos/BDI)","Planilha de Custos da proposta","Formação de preços da vencedora"],
 ["Escolas, alunos, cozinha, matrículas","Censo Escolar INEP","Rede física municipal"],
 ["Pesos do PNAE por grupo","FNDE (Resolução CD/FNDE)","Parâmetro de repasse federal"],
 ["Tramitação interna — despachos, pareceres internos, datas do fluxo","ERP interno (gated)","⛔ NÃO entrou — exige login"],
];
const badge=f=>{const c=f==="PNCP"?"#2563eb":f==="e-Pública"?"#0d7a6b":/gated/i.test(f)?"#b04a3a":"#8a9aa2";return `<span style="display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:${c}22;color:${c};white-space:nowrap">${f}</span>`;};
const secFontes=`<div class="g3">
<div class="cam" style="--ct:#2563eb"><div class="t">🗂️ PNCP — cadastramento</div><div class="d" style="margin-top:6px">O <b>planejamento</b> da contratação: edital, TR, ETP, DFD, objeto, valor homologado, modalidade e as <b>assinaturas</b> de quem elaborou os documentos. <br><span class="mono" style="font-size:11px">nº controle 82892282000143-1-000096/2025</span></div></div>
<div class="cam" style="--ct:#0d7a6b"><div class="t">🏛️ e-Pública — sistema interno da Prefeitura</div><div class="d" style="margin-top:6px">A <b>execução</b>: empenho → liquidação → pagamento, dotação orçamentária, fonte de recurso, natureza, contrato e favorecido — o que o PNCP não traz. <br><span class="mono" style="font-size:11px">processo interno PMF I 00148716/2024</span></div></div>
</div>
<div class="note"><b>Duas camadas do "interno" — o que entrou e o que é gated:</b><br>✅ <b>Execução interna (entrou):</b> todo o dinheiro — empenho, liquidação, pagamento, dotação, fonte de recurso e contrato — vem do <b>e-Pública</b>, o sistema interno público da Prefeitura. É a espinha dorsal das abas Panorama, Contabilidade e Portfólio.<br>⛔ <b>Tramitação interna (gated):</b> o <b>fluxo de despachos e pareceres internos</b> do processo (quem despachou o quê, em que data) fica no <b>ERP interno com login</b> — não é público. Por isso os nomes da equipe vieram do PNCP (assinaturas), da Ata do WBC (pregoeiro) e do Farol TCE (salários), e não do log de tramitação. Com acesso logado, essa camada fecha 100%.</div>
<div class="card"><h2>Procedência de cada dado do estudo</h2>
<div class="tbl-scroll"><table><thead><tr><th>Dado</th><th>Fonte / sistema</th><th>O que fornece</th></tr></thead><tbody>
${FONTES.map(f=>`<tr><td>${f[0]}</td><td>${badge(f[1])}</td><td class="tag">${f[2]}</td></tr>`).join("")}
</tbody></table></div>
<p class="foot"><b>A regra do estudo:</b> o <b>PNCP guarda o planejamento</b> (o que se pretende comprar e quem escreveu), mas <b>não tem a execução</b> — pagamentos, dotação e fonte de recurso só existem no <b>sistema interno da Prefeitura (e-Pública)</b>. Por isso o estudo cruza os dois: o PNCP dá o "o quê e quem", o e-Pública dá o "quanto e de onde saiu o dinheiro". A folha nominal vem do <b>Farol TCE-SC</b> (o portal municipal só publica a Câmara). Tudo público e auditável.</p></div>`;
const SECS=[["Panorama",secPan],["Contrato",secContrato],["Camadas",secCamadas],["Portfólio",secPort],["Contabilidade",secContab],["Escolas",secEsc],["Equipe",secEquipe],["Fontes",secFontes]];
const BODY=`<div class="wrap"><div class="c">
<p class="eye">Estudo · Custo dos programas ao cidadão</p>
<h1>Custo da Merenda Escolar — Florianópolis</h1>
<p class="sub">Módulo de estudo: quanto custa a alimentação escolar municipal, com quem, e como está lançado no orçamento público.</p>
<div class="nav">${SECS.map((s,i)=>`<button data-i="${i}"${i===0?' class="on"':''}>${s[0]}</button>`).join("")}</div>
${SECS.map((s,i)=>`<div class="sec${i===0?' on':''}" data-s="${i}">${s[1]}</div>`).join("")}
<p class="foot" style="margin-top:20px"><b>i10 Gov 360</b> — Instituto I10. Exibição neutra e didática; valores auditáveis. Piloto replicável a outros programas e municípios.</p>
</div></div>
<script>document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{const i=b.dataset.i;document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('on',x===b));document.querySelectorAll('.sec').forEach(s=>s.classList.toggle('on',s.dataset.s===i));window.scrollTo(0,0);});</script>`;
fs.writeFileSync(OUT+"estudo_merenda_modulo.html", CSS+"\n"+BODY);
console.log("HTML",(CSS+BODY).length,"| secs",SECS.length,"| empAno",(empAno/1e6).toFixed(1),"| contratos",cont.length);
