// PORTO ALEGRE — folha nominal com remuneração, do portal da transparência (iframe Struts da Procempa).
//
// Por que um script próprio e não um bloco em ingest_folha_capitais.mjs: aqui a coleta é em DUAS FASES e longa.
//   Fase 1  1.489 páginas de lista (23 por página) → nome, cargo, órgão, referência, matrícula e a CHAVE
//   Fase 2  uma ficha por servidor (~34 mil) → é só nela que aparece o VALOR
//   Fase 3  publica em folha_servidores_capital
// Fila em `folha_poa_fila` para permitir RETOMADA: cada fase só faz o que ainda falta.
//
// ⚖️ POSTURA: o portal recusa acesso automatizado intenso. Este coletor não tenta se disfarçar — vai devagar
// (PAUSA, padrão 1,5 s), com uma sessão só, e RECUA quando o servidor reclama (espera crescente). Se ainda assim
// for recusado, para e registra: a recusa do órgão é resposta legítima, e o caminho passa a ser e-SIC/LAI.
// Ver [[pnigp-capitais-goiania-curitiba-poa]].
import crypto from "node:crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const BASE = "https://portaltransparenciapmpa.procempa.com.br/portalpmpa/fpRemuneracaoPesquisa.do";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const PAUSA = +(process.env.PAUSA || 1500);
const FASE = process.env.FASE || "todas";
const LIMITE = +(process.env.LIMITE || 0);              // 0 = sem limite; útil para ensaiar
const dorme = (ms) => new Promise((s) => setTimeout(s, ms));
const dec = (b) => { let t = new TextDecoder("utf-8").decode(b); if (/�/.test(t.slice(0, 4000))) t = new TextDecoder("iso-8859-1").decode(b); return t; };

await q(`create table if not exists folha_poa_fila (
  chave text primary key, competencia text, nome text, cargo text, orgao text, referencia text, matricula text,
  bruto numeric, irrf numeric, previdencia numeric, liquido numeric, indenizatorias numeric, nivel text,
  situacao text default 'pendente', erro text, em timestamptz default now()
)`);
await q(`create index if not exists ix_poa_fila_sit on folha_poa_fila (situacao)`);

// ── sessão ────────────────────────────────────────────────────────────────────────────────────────────────────
let cookie = "", U = "";
const abreSessao = async () => {
  const r = await fetch(`${BASE}?viaMenu=true`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(120000) });
  const h = await r.text();
  cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  U = new URL((h.match(/action="([^"]+)"/) || [])[1], BASE).href;
  return h;
};

let recuos = 0;
const post = async (extra, tentativas = 4) => {
  for (let i = 1; i <= tentativas; i++) {
    try {
      const r = await fetch(U, { method: "POST", signal: AbortSignal.timeout(180000), redirect: "follow",
        headers: { "user-agent": UA, cookie, "content-type": "application/x-www-form-urlencoded", referer: `${BASE}?viaMenu=true` },
        body: new URLSearchParams({ perform: "view", actionForward: "success", strutsFormName: "fpRemuneracaoPesquisaForm",
          user: "", dominio: "", validate: "true", printPerform: "", pesquisar: "true", chave: "", msgProcempa: "",
          "defaultSearch.pageSize": "23", "defaultSearch.currentPage": "1", "defaultSearch.orderField": "", "defaultSearch.orderDirection": "",
          empresaSelecionada: "0", secretariaSelecionada: "", tipoFolhaSelecionada: "MENSAL",
          criterioNomeServidor: "", ...extra }).toString() });
      if (r.ok) return dec(Buffer.from(await r.arrayBuffer()));
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      return null;
    } catch (e) {
      recuos++;
      const espera = Math.min(60000, 5000 * i * i);      // recuo crescente: o servidor pediu folga, damos folga
      console.log(`    ↩ recuo ${i}/${tentativas} (${String(e.message).slice(0, 40)}) — aguardando ${(espera / 1000).toFixed(0)}s`);
      await dorme(espera);
      if (i === 2) await abreSessao().catch(() => {});   // sessão pode ter expirado
    }
  }
  return null;
};

const nPaginas = (html) => ((html.match(/<select[^>]*id="currentPage"[\s\S]*?<\/select>/i) || [""])[0].match(/<option/g) || []).length;
const limpa = (s) => String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const num = (s) => { const t = String(s ?? "").replace(/[^\d,.-]/g, ""); if (!t) return null;
  const n = +t.replace(/\./g, "").replace(",", "."); return Number.isFinite(n) ? n : null; };

await abreSessao();
console.log(`[poa] sessão aberta · pausa ${PAUSA}ms entre requisições`);

// ── escolhe a competência mais cheia (nº de páginas), como em Manaus e Goiânia ────────────────────────────────
let COMPET = process.env.COMPETENCIA || null;
if (!COMPET && FASE !== "3") {
  const hoje = new Date(); const medidas = [];
  for (let k = 0; k <= 2; k++) {
    const d = new Date(hoje); d.setDate(1); d.setMonth(hoje.getMonth() - k);
    const ref = `01/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    const h = await post({ competenciaSelecionadaAsString: ref });
    if (h) medidas.push({ ref, pag: nPaginas(h), comp: `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}` });
    await dorme(PAUSA);
  }
  medidas.sort((a, b) => b.pag - a.pag);
  if (!medidas.length || !medidas[0].pag) { console.log("[poa] o portal não devolveu nenhuma competência — parando."); await db.end(); process.exit(0); }
  COMPET = medidas[0].ref;
  console.log(`[poa] competência escolhida: ${COMPET} (${medidas.map((m) => `${m.ref.slice(3)}:${m.pag}p`).join(" ")})`);
}
const compBanco = COMPET ? `${COMPET.slice(6)}${COMPET.slice(3, 5)}` : null;

// ── FASE 1: a lista ───────────────────────────────────────────────────────────────────────────────────────────
if (FASE === "todas" || FASE === "1") {
  const h1 = await post({ competenciaSelecionadaAsString: COMPET, "defaultSearch.currentPage": "1" });
  const total = nPaginas(h1 || "");
  console.log(`[poa] fase 1: ${total} páginas`);
  const jaTem = +(await q(`select count(*)::int n from folha_poa_fila where competencia=$1`, [compBanco])).rows[0].n;
  let novos = 0;
  for (let p = 1; p <= total; p++) {
    if (LIMITE && p > LIMITE) { console.log(`[poa] limite de ${LIMITE} páginas atingido`); break; }
    const html = p === 1 ? h1 : await post({ competenciaSelecionadaAsString: COMPET, "defaultSearch.currentPage": String(p) });
    if (!html) { console.log(`[poa] página ${p} não veio — parando a fase 1 aqui (retomável)`); break; }
    const linhas = [...html.matchAll(/<tr id="linha\d+"[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
    const regs = linhas.map((tr) => {
      const chave = (tr.match(/detail\('(\d+)'/) || [])[1];
      const cel = [...tr.matchAll(/<td[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => limpa(m[2]));
      if (!chave || cel.length < 5) return null;
      return { chave, nome: cel[0], cargo: cel[1], orgao: cel[2], referencia: cel[3], matricula: cel[4] };
    }).filter(Boolean);
    if (regs.length) {
      await q(`insert into folha_poa_fila (chave, competencia, nome, cargo, orgao, referencia, matricula)
        select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[])
        on conflict (chave) do nothing`,
        [regs.map((r) => r.chave), regs.map(() => compBanco), regs.map((r) => r.nome), regs.map((r) => r.cargo),
         regs.map((r) => r.orgao), regs.map((r) => r.referencia), regs.map((r) => r.matricula)]);
      novos += regs.length;
    }
    if (p % 25 === 0 || p === total) console.log(`  página ${p}/${total} · ${novos} lidos · ${recuos} recuos`);
    await dorme(PAUSA);
  }
  const agora = +(await q(`select count(*)::int n from folha_poa_fila where competencia=$1`, [compBanco])).rows[0].n;
  console.log(`[poa] fase 1: fila com ${agora} servidores (${agora - jaTem} novos)`);
}

// ── FASE 2: as fichas (é onde está o valor) ───────────────────────────────────────────────────────────────────
if (FASE === "todas" || FASE === "2") {
  const pend = (await q(`select chave from folha_poa_fila where situacao in ('pendente','erro') ${compBanco ? "and competencia=$1" : ""} order by chave`,
    compBanco ? [compBanco] : [])).rows.map((r) => r.chave);
  console.log(`[poa] fase 2: ${pend.length} fichas pendentes`);
  // 🚨 o Struts guarda o contexto da consulta na SESSÃO: sem uma pesquisa antes, a chave da ficha não resolve e o
  // portal devolve a própria tela de busca (foi o que produziu "ficha sem valores" no ensaio).
  const aquece = async () => { await post({ competenciaSelecionadaAsString: COMPET, "defaultSearch.currentPage": "1" }); await dorme(PAUSA); };
  await aquece();
  const leFicha = async (chave) => {
    const html = await post({ perform: "edit", actionForward: "detail", pesquisar: "false", chave,
      competenciaSelecionadaAsString: COMPET || "" });
    if (!html) return null;
    const txt = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
    const pega = (re) => { const m = txt.match(re); return m ? num(m[1]) : null; };
    const basica = pega(/Remunera[çc][ãa]o b[áa]sica bruta\s+(-?[\d.,]+)/i);
    const liq = pega(/Remunera[çc][ãa]o ap[óo]s dedu[çc][õo]es obrigat[óo]rias\s+(-?[\d.,]+)/i);
    if (basica == null && liq == null) return null;
    // o bruto do portal é só a parcela básica; o total de proventos soma as eventuais
    const eventuais = ["Gratifica[çc][ãa]o Natalina", "F[ée]rias", "Outras remunera[çc][õo]es eventuais"]
      .map((r) => pega(new RegExp(`${r}\\s+(-?[\\d.,]+)`, "i")) || 0).reduce((a, b) => a + b, 0);
    return { bruto: basica == null ? null : +(basica + eventuais).toFixed(2), liq,
      irrf: pega(/Imposto de renda retido na fonte\s+(-?[\d.,]+)/i),
      prev: pega(/Previd[êe]ncia oficial\s+(-?[\d.,]+)/i),
      ind: pega(/Demais verbas indenizat[óo]rias\s+(-?[\d.,]+)/i),
      // ⚠️ quando o servidor não tem posto de confiança o campo vem VAZIO e um regex guloso captura "Mês"
      //    (o rótulo seguinte). Exigir formato de código e barrar o rótulo vizinho.
      nivel: (txt.match(/N[íi]vel do Posto de Confian[çc]a:\s*([A-Z][A-Z0-9.\-]{1,19})\s+M[êe]s de Refer/i) || [])[1] || null };
  };
  let ok = 0, falhas = 0, seguidas = 0;
  for (const [i, chave] of pend.entries()) {
    if (LIMITE && i >= LIMITE) { console.log(`[poa] limite de ${LIMITE} fichas atingido`); break; }
    let v = await leFicha(chave);
    if (!v) {                                            // 2ª chance: reaquece a sessão e tenta de novo
      await dorme(PAUSA); await aquece();
      v = await leFicha(chave);
    }
    if (!v) {
      falhas++; seguidas++;
      await q(`update folha_poa_fila set situacao='erro', erro='ficha sem valores após 2 tentativas', em=now() where chave=$1`, [chave]);
      if (seguidas >= 25) { console.log("[poa] 25 falhas seguidas — o portal está recusando; encerrando a fase 2 (retomável)"); break; }
      await dorme(PAUSA * 2); continue;
    }
    seguidas = 0; ok++;
    await q(`update folha_poa_fila set bruto=$2, irrf=$3, previdencia=$4, liquido=$5, indenizatorias=$6, nivel=$7,
      situacao='ok', erro=null, em=now() where chave=$1`, [chave, v.bruto, v.irrf, v.prev, v.liq, v.ind, v.nivel]);
    if ((i + 1) % 100 === 0) console.log(`  ficha ${i + 1}/${pend.length} · ${ok} ok · ${falhas} falhas · ${recuos} recuos`);
    await dorme(PAUSA);
  }
  console.log(`[poa] fase 2: ${ok} fichas lidas · ${falhas} falhas`);
}

// ── FASE 3: publica ───────────────────────────────────────────────────────────────────────────────────────────
if (FASE === "todas" || FASE === "3") {
  const linhas = (await q(`select * from folha_poa_fila where situacao='ok' and (bruto is not null or liquido is not null)`)).rows;
  console.log(`[poa] fase 3: publicando ${linhas.length} servidores`);
  for (let i = 0; i < linhas.length; i += 1000) {
    const p = linhas.slice(i, i + 1000);
    const c = (f) => p.map(f);
    await q(`insert into folha_servidores_capital
      (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,secretaria,lotacao,vinculo,bruto,descontos,liquido,fonte,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::text[],$15::text[])
      on conflict (_hash) do update set bruto=excluded.bruto, liquido=excluded.liquido, descontos=excluded.descontos, _coletado_em=now()`,
      [c(() => "4314902"), c(() => "Porto Alegre"), c(() => "RS"), c((x) => x.competencia), c((x) => x.matricula),
       c((x) => x.nome), c((x) => x.cargo), c((x) => x.orgao), c((x) => x.orgao), c((x) => x.nivel || x.referencia),
       c((x) => x.bruto), c((x) => (x.bruto != null && x.liquido != null ? +(x.bruto - x.liquido).toFixed(2) : null)),
       c((x) => x.liquido), c(() => "portal procempa"),
       c((x) => crypto.createHash("md5").update(["4314902", x.competencia, x.matricula, x.nome, x.cargo, x.bruto].join("¦")).digest("hex"))]);
  }
  const s = (await q(`select count(*)::int n, count(*) filter (where bruto is not null)::int com_valor
    from folha_servidores_capital where cod_ibge='4314902'`)).rows[0];
  console.log(`[poa] publicados: ${s.n} servidores · ${s.com_valor} com remuneração`);
}
const resumo = (await q(`select situacao, count(*)::int n from folha_poa_fila group by 1 order by 2 desc`)).rows;
console.log("[poa] fila:", resumo.map((r) => `${r.situacao}=${r.n}`).join(" · ") || "vazia");
await db.end();
