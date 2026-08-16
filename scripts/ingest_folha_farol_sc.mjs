// Folha nominal de município de SC pelo FAROL TCE-SC "Pessoal On-line" (Qlik, anônimo).
//
// ⭐ É a rota SEM CAPTCHA para Florianópolis: o SRH da prefeitura
// (adm.pmf.sc.gov.br/srh/transparencia.list.php) manda TODA consulta para `transparencia_captcha.php`.
// O Farol é fonte oficial (e-Sfinge) e cobre executivo e legislativo de todos os municípios de SC.
//
// 🚨 O campo `cidade` do Farol é a SEDE da unidade gestora, não o município do ente — selecionar "Florianópolis"
//    traz as secretarias ESTADUAIS (que ficam na capital). A seleção correta é por **`nomeUG`**.
// 🚨 Hypercube multi-dimensão volta vazio depois de selecionar: usar 1 dimensão (`nome`) e trazer cargo/lotação
//    como MEDIDA de texto (`Only(...)`).
// 🚨 `sinal_val_pagamento` é TEXTO ('positivo'/'negativo'): bruto = Sum({<sinal…={'positivo'}>}[val_pagamento]).
// ⚠️ Meses recentes vêm parciais e dezembro infla (13º) — escolher o mês mais cheio por nº de CPF distinto.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import crypto from "node:crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const APP = "4da65a01-68df-47e2-b05f-97249d916192";
const MUNICIPIO = process.env.MUNICIPIO || "Florianópolis";
const COD_IBGE = process.env.COD_IBGE || "4205407";
const UF = process.env.UF || "SC";

const conecta = () => new Promise((resolve, reject) => {
  const ws = new WebSocket(`wss://paineistransparencia.tce.sc.gov.br/app/${APP}`);
  const pend = new Map(); let id = 0;
  ws.addEventListener("error", () => reject(new Error("WS erro")));
  ws.addEventListener("open", () => setTimeout(() => resolve({ rpc, ws }), 300));
  ws.addEventListener("message", (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.method === "OnConnected") { resolve({ rpc, ws }); return; }
    if (m.id != null && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result); } });
  function rpc(method, handle, params) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ jsonrpc: "2.0", method, handle, params, id: i }));
    setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error("timeout " + method)); } }, 120000); }); }
});
const { rpc, ws } = await conecta();
let appH = null;
for (let a = 1; a <= 5; a++) { try { const o = await rpc("OpenDoc", -1, [APP, "", "", "", false]); appH = o.qReturn.qHandle; break; }
  catch { await new Promise((s) => setTimeout(s, 2500)); } }
if (appH == null) { console.log("[farol] OpenDoc falhou 5x"); process.exit(1); }
const limpa = () => rpc("ClearAll", appH, [true]).catch(() => {});
const sel = async (campo, valor) => { const gf = await rpc("GetField", appH, [campo]);
  return (await rpc("Select", gf.qReturn.qHandle, [valor, false, 0])).qReturn; };
const busca = async (campo, termo, n = 40) => {
  const o = await rpc("CreateSessionObject", appH, [{ qInfo: { qType: "lb" }, qListObjectDef: { qDef: { qFieldDefs: [campo] },
    qInitialDataFetch: [{ qTop: 0, qLeft: 0, qHeight: n, qWidth: 1 }] } }]);
  const h = o.qReturn.qHandle;
  if (termo) await rpc("SearchListObjectFor", h, ["/qListObjectDef", termo]);
  const lay = await rpc("GetLayout", h, []);
  return (lay.qLayout.qListObject.qDataPages?.[0]?.qMatrix || []).map((r) => r[0].qText);
};
// ⚠️ o Qlik recusa página grande com erro 6001 "Result too large" — o teto prático é ~10 mil CÉLULAS por página
//    (linhas × colunas), então com 6 colunas a página tem de ficar em torno de 1.000 linhas.
const cubo = async (dim, medidas, altura) => {
  const larg = 1 + medidas.length;
  const passo = Math.max(100, Math.floor(9000 / larg));
  const o = await rpc("CreateSessionObject", appH, [{ qInfo: { qType: "tbl" }, qHyperCubeDef: {
    qDimensions: [{ qDef: { qFieldDefs: [dim] } }], qMeasures: medidas.map((m) => ({ qDef: { qDef: m } })),
    qInitialDataFetch: [{ qTop: 0, qLeft: 0, qHeight: Math.min(altura, passo), qWidth: larg }] } }]);
  const h = o.qReturn.qHandle;
  const lay = await rpc("GetLayout", h, []);
  const total = lay.qLayout.qHyperCube.qSize?.qcy || 0;
  let linhas = lay.qLayout.qHyperCube.qDataPages?.[0]?.qMatrix || [];
  for (let top = linhas.length; top < Math.min(total, altura); top += passo) {
    const pg = await rpc("GetHyperCubeData", h, ["/qHyperCubeDef", [{ qTop: top, qLeft: 0, qHeight: passo, qWidth: larg }]])
      .catch(() => null);
    const m = pg?.qDataPages?.[0]?.qMatrix || [];
    if (!m.length) break;
    linhas = linhas.concat(m);
  }
  return { linhas, total };
};

// as UGs do município (do ENTE, não da cidade-sede)
await limpa();
const ugsTodas = await busca("nomeUG", MUNICIPIO, 60);
const ugs = ugsTodas.filter((u) => !/Associação dos Municípios|Consórcio|Secretaria de Estado/i.test(u));
console.log(`[farol] ${MUNICIPIO}: ${ugs.length} unidades gestoras municipais`);
for (const u of ugs) console.log(`   · ${u}`);
if (!ugs.length) { console.log("[farol] nenhuma UG encontrada"); ws.close(); process.exit(0); }

// competência mais cheia (com todas as UGs selecionadas)
await limpa();
for (const u of ugs) await sel("nomeUG", u);
const porMes = await cubo("anoMes", ["Count(DISTINCT numeroCPF)"], 80);
const meses = porMes.linhas.filter((r) => /^\d{6}$/.test(r[0].qText) && r[1].qNum > 0)
  .map((r) => ({ comp: r[0].qText, n: r[1].qNum })).sort((a, b) => b.n - a.n);
if (!meses.length) { console.log("[farol] sem competência com dados"); ws.close(); process.exit(0); }
// dezembro infla por causa do 13º: preferir o maior que NÃO seja dezembro, se houver empate razoável
const semDez = meses.filter((m) => !m.comp.endsWith("12"));
const escolhida = (semDez[0] && semDez[0].n >= meses[0].n * 0.9) ? semDez[0] : meses[0];
console.log(`[farol] competência ${escolhida.comp} (${escolhida.n} servidores) · candidatas: ${meses.slice(0, 5).map((m) => `${m.comp}:${m.n}`).join(" ")}`);

// a folha nominal, UG por UG (dimensão única = nome; cargo/lotação como medida de texto)
const regs = [];
for (const ug of ugs) {
  await limpa();
  await sel("nomeUG", ug);
  await sel("anoMes", escolhida.comp);
  const { linhas } = await cubo("nome", [
    "Only(nomeCargo)", "Only(descricaoLotacao)", "Only(NATUREZA_VINCULO)",
    "Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])",
    "Sum({<sinal_val_pagamento={'negativo'}>}[val_pagamento])",
  ], 20000);
  let n = 0;
  for (const r of linhas) {
    const nome = String(r[0].qText || "").trim();
    if (!nome || nome === "-") continue;
    // 🚨 as rubricas de sinal 'negativo' JÁ vêm com valor negativo: sem o abs, `bruto - desc` SOMA em vez de
    //    subtrair e o líquido sai maior que o bruto (visto: bruto 67.586 → "líquido" 103.189).
    const bruto = +r[4].qNum || null;
    const desc = r[5].qNum != null ? Math.abs(+r[5].qNum) || null : null;
    regs.push({ cod_ibge: COD_IBGE, municipio: MUNICIPIO, uf: UF, competencia: escolhida.comp, matricula: null, nome,
      cargo: r[1].qText && r[1].qText !== "-" ? r[1].qText : null,
      secretaria: r[2].qText && r[2].qText !== "-" ? r[2].qText : null,
      lotacao: r[2].qText && r[2].qText !== "-" ? r[2].qText : null,
      vinculo: [ug, r[3].qText && r[3].qText !== "-" ? r[3].qText : null].filter(Boolean).join(" · "),
      bruto, descontos: desc, liquido: bruto != null && desc != null ? +(bruto - desc).toFixed(2) : bruto,
      fonte: "farol tce-sc",
      _hash: crypto.createHash("md5").update([COD_IBGE, escolhida.comp, ug, nome, r[1].qText].join("¦")).digest("hex") });
    n++;
  }
  console.log(`   ${String(ug).slice(0, 54).padEnd(56)} ${n} servidores`);
}
ws.close();
console.log(`[farol] total: ${regs.length} servidores`);
if (regs.length) {
  const m = new Map(); for (const r of regs) m.set(r._hash, r);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += 1000) {
    const p = arr.slice(i, i + 1000); const c = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_capital
      (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,secretaria,lotacao,vinculo,bruto,descontos,liquido,fonte,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::text[],$15::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido, _coletado_em=now()`,
      [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("matricula"), c("nome"), c("cargo"),
       c("secretaria"), c("lotacao"), c("vinculo"), c("bruto"), c("descontos"), c("liquido"), c("fonte"), c("_hash")]);
  }
  console.log(`[farol] gravados ${arr.length} servidores de ${MUNICIPIO}`);
}
await db.end();
