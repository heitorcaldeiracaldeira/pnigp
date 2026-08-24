// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// _farol.mjs — infraestrutura compartilhada do Farol TCE-SC "Pessoal On-line" (Qlik Engine JSON-RPC via websocket).
//
// POR QUÊ: os scripts de folha (sonda + ingest dos 295 municípios) precisam do MESMO connect com retry, do MESMO
// OpenDoc teimoso (o app é intermitente e falha o primeiro OpenDoc com frequência) e do MESMO hypercube paginado.
// A regra dura registrada em memória — "hypercube multi-dimensão volta vazio depois de selecionar" — vale para
// qInitialDataFetch INLINE; com qInitialDataFetch:[] + GetHyperCubeData página a página o multi-dim funciona
// (precedente: scripts/qlik_folha_full.mjs, 3 dims + 2 medidas na folha de Florianópolis).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export const APP = "4da65a01-68df-47e2-b05f-97249d916192";
const URL = `wss://paineistransparencia.tce.sc.gov.br/app/${APP}`;

// bruto = só as rubricas de sinal 'positivo' (o campo sinal_val_pagamento é TEXTO: multiplicar dá ZERO)
export const BRUTO = "Sum({<sinal_val_pagamento={'positivo'}>}[val_pagamento])";
export const DESC = "Sum({<sinal_val_pagamento={'negativo'}>}[val_pagamento])";

export const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

function conectar(timeoutRpc) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const pend = new Map();
    let id = 0, pronto = false;
    const ok = () => { if (!pronto) { pronto = true; resolve({ rpc, ws }); } };
    ws.addEventListener("error", () => reject(new Error("WS erro")));
    ws.addEventListener("open", () => setTimeout(ok, 300));
    ws.addEventListener("close", () => { for (const { rej } of pend.values()) rej(new Error("WS fechou")); pend.clear(); });
    ws.addEventListener("message", (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.method === "OnConnected") { ok(); return; }
      if (m.id != null && pend.has(m.id)) {
        const { res, rej } = pend.get(m.id); pend.delete(m.id);
        if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result);
      }
    });
    function rpc(method, handle, params) {
      return new Promise((res, rej) => {
        const i = ++id; pend.set(i, { res, rej });
        ws.send(JSON.stringify({ jsonrpc: "2.0", method, handle, params, id: i }));
        setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error("timeout " + method)); } }, timeoutRpc);
      });
    }
  });
}

// abrir() — connect + OpenDoc com retry (o OpenDoc do Farol demora a "esquentar": 2-4 tentativas é normal).
export async function abrir({ tentativas = 6, timeoutRpc = 90000 } = {}) {
  let ultimo;
  for (let t = 0; t < tentativas; t++) {
    try {
      const { rpc, ws } = await conectar(timeoutRpc);
      for (let o = 0; o < 4; o++) {
        try {
          const doc = await rpc("OpenDoc", -1, [APP, "", "", "", false]);
          const appH = doc.qReturn.qHandle;
          return { rpc, ws, appH, fechar: () => ws.close() };
        } catch (e) { ultimo = e; await sleep(2500); }
      }
      ws.close();
    } catch (e) { ultimo = e; await sleep(2500); }
  }
  throw new Error("Farol não abriu: " + ultimo?.message);
}

// selecionar() — Select por valor EXATO no campo (Field API). Mais confiável que SearchListObjectFor.
export async function selecionar(rpc, appH, campo, valores) {
  const gf = await rpc("GetField", appH, [campo]);
  const fh = gf.qReturn.qHandle;
  const lista = Array.isArray(valores) ? valores : [valores];
  let ok = true;
  for (let i = 0; i < lista.length; i++) {
    const r = await rpc("Select", fh, [lista[i], i > 0, 0]); // i>0 = soft/toggle: acumula no mesmo campo
    ok = ok && r.qReturn;
  }
  return ok;
}

// valoresDoCampo() — lista os valores possíveis de um campo (respeitando a seleção corrente).
export async function valoresDoCampo(rpc, appH, campo, n = 5000) {
  const o = await rpc("CreateSessionObject", appH, [{
    qInfo: { qType: "lb" },
    qListObjectDef: { qDef: { qFieldDefs: [campo] }, qInitialDataFetch: [{ qTop: 0, qLeft: 0, qHeight: n, qWidth: 1 }] },
  }]);
  const lay = await rpc("GetLayout", o.qReturn.qHandle, []);
  const m = lay.qLayout.qListObject.qDataPages?.[0]?.qMatrix || [];
  return m.filter((r) => r[0].qState !== "X").map((r) => r[0].qText);
}

// tabela() — hypercube multi-dimensão PAGINADO. qInitialDataFetch VAZIO na criação (é o que evita o cube vazio),
// tamanho lido do qSize e páginas puxadas por GetHyperCubeData. Devolve linhas [{d:[texto...], m:[num...]}].
// ⚠️ TETO DE CÉLULAS: o engine recusa página com qHeight*qWidth > ~10.000 ("Result too large", code 6001).
// Por isso a altura NÃO é livre — ela é derivada da largura. Pedir 5000 linhas de 12 colunas quebra.
const CELULAS_MAX = 9600;
export async function tabela(rpc, appH, dims, medidas, { max = Infinity, aoProgredir } = {}) {
  const altura = Math.max(1, Math.floor(CELULAS_MAX / (dims.length + medidas.length)));
  const o = await rpc("CreateSessionObject", appH, [{
    qInfo: { qType: "tbl" },
    qHyperCubeDef: {
      qDimensions: dims.map((d) => ({ qDef: { qFieldDefs: [d] } })),
      qMeasures: medidas.map((m) => ({ qDef: { qDef: m } })),
      qSuppressZero: false, qSuppressMissing: true,
      qInitialDataFetch: [],
    },
  }]);
  const oh = o.qReturn.qHandle;
  const lay = await rpc("GetLayout", oh, []);
  const total = lay.qLayout.qHyperCube.qSize.qcy;
  const W = dims.length + medidas.length;
  const alvo = Math.min(total, max);
  const linhas = [];
  for (let top = 0; top < alvo; top += altura) {
    const h = Math.min(altura, alvo - top);
    let pag = null, ultimo;
    for (let t = 0; t < 3; t++) {
      try { pag = await rpc("GetHyperCubeData", oh, ["/qHyperCubeDef", [{ qTop: top, qLeft: 0, qHeight: h, qWidth: W }]]); break; }
      catch (e) { ultimo = e; await sleep(1500); }
    }
    if (!pag) throw ultimo;
    for (const r of pag.qDataPages?.[0]?.qMatrix || []) {
      linhas.push({ d: r.slice(0, dims.length).map((c) => c.qText), m: r.slice(dims.length).map((c) => c.qNum) });
    }
    if (aoProgredir) aoProgredir(linhas.length, alvo);
  }
  await rpc("DestroySessionObject", appH, [lay.qLayout.qInfo.qId]).catch(() => {});
  return { total, linhas };
}
