// Jaraguá do Sul — folha das merendeiras (quadro próprio), QUADRO ESCOLAR PURO.
// Uma passada: filtra cargos de alimentação, EXCLUI lotações de Assistência/Proteção
// Social, e devolve as duas lentes consistentes do MESMO conjunto:
//   (1) por FONTE  (lotação → FUNDEB 70% / Próprios / sem lotação)   ← prova "quem paga"
//   (2) por CARGO  (efetivo / REDA / merendeira em extinção)          ← vínculo
// Farol TCE-SC (e-Sfinge) via Qlik JSON-RPC. anoMes=202511 (nov/2025).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const APP = "4da65a01-68df-47e2-b05f-97249d916192";
const URL = `wss://paineistransparencia.tce.sc.gov.br/app/${APP}`;
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL); const pend = new Map(); let id = 0;
    ws.addEventListener("error", () => reject(new Error("WS")));
    ws.addEventListener("open", () => setTimeout(() => resolve({ rpc, ws }), 300));
    ws.addEventListener("message", ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } if (m.id != null && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result); } });
    function rpc(method, handle, params) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ jsonrpc: "2.0", method, handle, params, id: i })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error("t " + method)); } }, 60000); }); }
  });
}
setTimeout(() => { console.error("HARD TIMEOUT"); process.exit(2); }, 220000);
const log = (...a) => console.error("[dbg]", ...a);
log("conectando...");
const { rpc, ws } = await connect();
log("conectado, OpenDoc...");
let appH = null;
try { const g = await rpc("GetActiveDoc", -1, []); if (g?.qReturn?.qHandle >= 0) { appH = g.qReturn.qHandle; log("GetActiveDoc ok", appH); } } catch (e) { log("GetActiveDoc falhou", String(e).slice(0, 60)); }
if (appH == null) for (let a = 1; a <= 6; a++) { try { const o = await rpc("OpenDoc", -1, [APP, "", "", "", false]); appH = o.qReturn.qHandle; break; } catch (e) { log("OpenDoc retry", a, String(e).slice(0, 60)); await new Promise(s => setTimeout(s, 1500)); } }
if (appH == null) { console.log("fail open"); process.exit(1); }
log("appH ok, selecionando...");
async function selVal(f, v) { const g = await rpc("GetField", appH, [f]); return (await rpc("Select", g.qReturn.qHandle, [v, false, 0])).qReturn; }
async function selMany(f, vs) { const g = await rpc("GetField", appH, [f]); return await rpc("SelectValues", g.qReturn.qHandle, [vs.map(v => ({ qText: v })), false, false]); }
async function cube(dims, meas, h = 4000) { const o = await rpc("CreateSessionObject", appH, [{ qInfo: { qType: "tbl" }, qHyperCubeDef: { qDimensions: dims.map(d => ({ qDef: { qFieldDefs: [d] } })), qMeasures: meas.map(m => ({ qDef: { qDef: m } })), qInitialDataFetch: [{ qTop: 0, qLeft: 0, qHeight: h, qWidth: dims.length + meas.length }] } }]); const l = await rpc("GetLayout", o.qReturn.qHandle, []); return (l.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix || []); }
const BRUTO = "Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";
const isAssist = (s) => /assist[êe]ncia|prote[çc][ãa]o social|cras|creas|socioassist/i.test(s);
const isFundeb = (s) => /fundeb/i.test(s);
const isProprio = (s) => /pr[óo]prio/i.test(s);

await selVal("cidade", "Jaraguá do Sul"); await selVal("Poder", "Executivo"); await selVal("anoMes", "202511");
// 1) cargos de alimentação/merenda
log("selecionou cidade/poder/anoMes; buscando cargos...");
const cargos = (await cube(["nomeCargo"], [BRUTO], 800)).map(r => r[0].qText || "").filter(c => /aliment|merend/i.test(c));
log("cargos:", cargos.length, JSON.stringify(cargos));
if (!cargos.length) { console.log("SEM CARGOS de alimentação"); process.exit(3); }
await selMany("nomeCargo", cargos);
log("selecionou cargos; buscando por LOTAÇÃO (1 dim)...");
// GOTCHA memória: hypercube multi-dim vem VAZIO após seleção → 1 dimensão por vez.
// (2) por LOTAÇÃO (=fonte). Uma dimensão só.
const byLot = (await cube(["descricaoLotacao"], ["Count(DISTINCT numeroCPF)", BRUTO], 600))
  .map(r => ({ lot: r[0].qText || "", n: +r[1].qNum || 0, v: +r[2].qNum || 0 }))
  .filter(r => r.n > 0);
const escolar = byLot.filter(r => !isAssist(r.lot));
const assist = byLot.filter(r => isAssist(r.lot));
log("lotações:", byLot.length, "escolar:", escolar.length, "assist:", assist.length);

// --- por FONTE (classifica cada lotação escolar) ---
const fon = { "FUNDEB 70%": { n: 0, v: 0 }, "Recursos Próprios": { n: 0, v: 0 }, "Sem lotação definida": { n: 0, v: 0 } };
for (const r of escolar) {
  const k = isFundeb(r.lot) ? "FUNDEB 70%" : isProprio(r.lot) ? "Recursos Próprios" : "Sem lotação definida";
  fon[k].n += r.n; fon[k].v += r.v;
}

// (3) por CARGO — 1 dimensão + set-analysis excluindo lotações de Assistência/Proteção Social.
log("buscando por CARGO (1 dim, set-analysis exclui assistência)...");
const EXCL = "descricaoLotacao-={\"*ssist*\",\"*rote*o Social*\",\"*CRAS*\",\"*CREAS*\"}";
const carBruto = `Sum({<sinal_val_pagamento={'positivo'}, ${EXCL}>}[val_pagamento])`;
const carN = `Count({<${EXCL}>} DISTINCT numeroCPF)`;
const byCargo = (await cube(["nomeCargo"], [carN, carBruto], 50))
  .map(r => ({ cargo: r[0].qText || "", n: +r[1].qNum || 0, v: +r[2].qNum || 0 }))
  .filter(r => r.n > 0 && /aliment|merend/i.test(r.cargo));
const car = {}; for (const r of byCargo) { if (!car[r.cargo]) car[r.cargo] = { n: 0, v: 0 }; car[r.cargo].n += r.n; car[r.cargo].v += r.v; }

const totN = escolar.reduce((a, r) => a + r.n, 0), totV = escolar.reduce((a, r) => a + r.v, 0);
console.log("cargos alimentação:", JSON.stringify(cargos));
console.log(`\n=== QUADRO ESCOLAR (assistência excluída) — ${totN} servidores · R$ ${Math.round(totV).toLocaleString("pt-BR")}/mês ===`);
console.log("\n-- por FONTE --");
for (const [k, x] of Object.entries(fon)) if (x.n) console.log(`  ${k.padEnd(22)} ${String(x.n).padStart(4)} | R$ ${Math.round(x.v).toLocaleString("pt-BR")}`);
console.log("\n-- por CARGO --");
for (const [k, x] of Object.entries(car).sort((a, b) => b[1].v - a[1].v)) console.log(`  ${k.slice(0, 48).padEnd(48)} ${String(x.n).padStart(4)} | R$ ${Math.round(x.v).toLocaleString("pt-BR")}`);
console.log(`\n-- ASSISTÊNCIA (excluída da merenda escolar) --  ${assist.reduce((a, r) => a + r.n, 0)} serv · R$ ${Math.round(assist.reduce((a, r) => a + r.v, 0)).toLocaleString("pt-BR")}`);
console.log("\nJSON:", JSON.stringify({ totN, totV: Math.round(totV), fontes: fon, cargos: car, assistN: assist.reduce((a, r) => a + r.n, 0), assistV: Math.round(assist.reduce((a, r) => a + r.v, 0)) }));
ws.close();
process.exit(0);
