// RERANKER-LLM (estágio 2 do retrieve-then-rerank). O retriever trigrama dá top-k candidatos (recall@3=100% no gabarito
// de SC → o certo está lá); o LLM escolhe o correto usando TODO o contexto, desambiguando a polissemia que a heurística
// não resolvia ("joelho pvc esgoto" → conexão, não prótese). Testa no gabarito coloquial de SC e compara ao trigrama.
//
// AUTENTICAÇÃO (qualquer uma):
//   • Vercel AI Gateway (OIDC): `vercel env pull .env.ai --environment=development` (traz VERCEL_OIDC_TOKEN, ~12h).
//     Requer cartão no time da Vercel p/ liberar (créditos grátis). Modelo via slug "anthropic/claude-haiku-4.5".
//   • Ou AI_GATEWAY_API_KEY no .env.ai.  • Ou ANTHROPIC_API_KEY (chave sk-ant-…) — troque o provider p/ @ai-sdk/anthropic.
//
//   MODE=eval  (default) testa nos 90 rótulos de SC · MODE=apply classifica a cauda de baixa-sim do item_catmat_map
//   RERANK_MODEL=anthropic/claude-haiku-4.5 (default; barato p/ classificação) · CONC=5
//   node scripts/rerank_llm.mjs
import fs from "fs";
import { z } from "zod";
import { generateObject } from "ai";

const SC = "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/2adabc17-0913-484a-9ca7-576bee797555/scratchpad";
const CONC = Number(process.env.CONC || 5);
const CACHE_FILE = "C:/Users/PC/pnigp/scripts/_rerank_llm_cache.json";

// carrega credencial de .env.ai e depois .env.local (não sobrescreve o que já está no ambiente)
for (const f of ["C:/Users/PC/pnigp/.env.ai", "C:/Users/PC/pnigp/.env.local"])
  try { for (const l of fs.readFileSync(f, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); } } catch {}

// resolve o modelo pela credencial disponível. PERMANENTE (produção): AI_GATEWAY_API_KEY ou ANTHROPIC_API_KEY.
// EFÊMERO (só teste, ~12h): VERCEL_OIDC_TOKEN. O reranker é componente fixo; a credencial de produção também deve ser fixa.
async function resolveModel() {
  if (process.env.ANTHROPIC_API_KEY) {                          // chave sk-ant- tem prioridade (fixa, sem gateway)
    const { anthropic } = await import("@ai-sdk/anthropic");
    MODEL_LABEL = process.env.RERANK_MODEL_ANTHROPIC || "claude-haiku-4-5";   // API Anthropic usa TRAÇOS
    return anthropic(MODEL_LABEL);
  }
  MODEL_LABEL = process.env.RERANK_MODEL || "anthropic/claude-haiku-4.5";     // AI Gateway usa PONTO
  return MODEL_LABEL;
}
let MODEL_LABEL = "";
const MODEL = await resolveModel();
const CRED = process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY (fixa)" : process.env.AI_GATEWAY_API_KEY ? "AI_GATEWAY_API_KEY (fixa)" : process.env.VERCEL_OIDC_TOKEN ? "VERCEL_OIDC_TOKEN (efêmera)" : "NENHUMA";
console.log("credencial:", CRED, "· modelo:", MODEL_LABEL);

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const load = (p) => { const [h, ...ls] = fs.readFileSync(p, "utf8").replace(/\r/g, "").trim().split("\n"); const cols = h.split("\t"); return ls.map((l) => { const v = l.split("\t"); return Object.fromEntries(cols.map((c, i) => [c, v[i]])); }); };
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};
const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));

const Schema = z.object({
  escolha: z.number().int().describe("número do candidato correto (1..N), ou 0 se for serviço/genérico ou nenhum se encaixa"),
  confianca: z.number().min(0).max(1).describe("confiança de 0 a 1"),
});
const SYSTEM = `Você classifica itens de compra pública municipal no catálogo CATMAT do governo brasileiro.
Recebe a DESCRIÇÃO de um item e uma lista numerada de CANDIDATOS (nomes de PDM do catálogo).
Escolha o número do candidato que designa o MESMO produto da descrição, usando todo o contexto (atributos, unidade, material).
Regras rígidas:
- Escolha SOMENTE entre os candidatos listados; nunca invente.
- Se o item for SERVIÇO, obra, locação, ou um termo genérico/placeholder sem produto claro, ou se NENHUM candidato corresponde, responda escolha=0.
- Desambigue pela função real: "joelho ... pvc esgoto" é conexão hidráulica, não prótese de joelho.`;

function parseCands(row) {
  const out = [], seen = new Set();
  for (const col of ["cand_trgm", "cand_svm"]) for (const tok of (row[col] || "").split(" | ")) {
    const i = tok.indexOf(":"); if (i < 0) continue;
    const code = tok.slice(0, i).trim(); if (seen.has(code)) continue; seen.add(code);
    out.push({ code, name: tok.slice(i + 1).trim() });
  }
  return out.slice(0, 8);
}

async function classify(chave, cands) {
  const key = norm(chave);
  if (cache[key]) return cache[key];
  const lista = cands.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
  const { object } = await generateObject({
    model: MODEL, schema: Schema, temperature: 0,
    system: SYSTEM,
    prompt: `DESCRIÇÃO: ${chave}\n\nCANDIDATOS:\n${lista}\n\nQual candidato corresponde ao produto?`,
  });
  const chosen = object.escolha >= 1 && object.escolha <= cands.length ? cands[object.escolha - 1] : null;
  const res = { code: chosen ? chosen.code : "0", name: chosen ? chosen.name : null, conf: object.confianca };
  cache[key] = res; return res;
}

async function pool(items, fn) {
  const out = new Array(items.length); let idx = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < items.length) { const i = idx++; try { out[i] = await fn(items[i], i); } catch (e) { out[i] = { _err: e.message }; }
      if (++done % 10 === 0) { saveCache(); process.stdout.write(`  ${done}/${items.length}\r`); } }
  }));
  saveCache(); return out;
}

// ---------- MODE=apply: leva o ganho do reranker à produção (item_catmat_map), só na cauda incerta ----------
// Envelope "não-piora": mantém o trigrama e só age quando o LLM DIVERGE com confiança >= APPLY_TH.
//   • LLM escolhe outro PDM (conf>=TH) → adota (metodo='rerank').
//   • LLM diz 0 = serviço/genérico/nenhum (conf>=TH) → abstém (aceito=false, metodo='rerank_abstain'), sobe a precisão.
//   • senão → intocado (trigrama). APPLY_MAX limita a cauda (default sim<0.7); APPLY_LIMIT p/ teste.
async function applyMode() {
  const fsx = await import("fs"); const { default: pg } = await import("pg");
  const DB = fsx.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
  const APPLY_MAX = Number(process.env.APPLY_MAX || 0.7);
  const APPLY_TH  = Number(process.env.APPLY_TH  || 0.8);
  const APPLY_LIMIT = Number(process.env.APPLY_LIMIT || 0);   // 0 = tudo
  const MIN_SIM   = Number(process.env.MIN_SIM || 0.5);
  const K = 8, BATCH = 2000;
  const db = new pg.Pool({ connectionString: DB, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 1800000 });
  db.on("error", () => {});   // conexão ociosa derrubada pela Neon nos gaps de LLM → o pool a descarta; NÃO seguramos cliente dedicado
  // helper de query pelo POOL com 1 retry: cada chamada pega/solta conexão na hora, então drops entre queries são transparentes;
  // o retry cobre o caso raro de a conexão morrer DURANTE a query. (Antes: cliente dedicado emitia 'error' sem handler → crash.)
  const transitorio = (e) => !e?.message || /terminated|ECONNRESET|ETIMEDOUT|EPIPE|Connection|timeout|socket|reset/i.test(e.message)
    || ["ECONNRESET", "ETIMEDOUT", "EPIPE", "57P01", "08006", "08003", "XX000"].includes(e?.code);
  const q = async (sql, params) => {                    // POOL + até 3 tentativas em erro de conexão (inclui msg vazia = hangup)
    for (let i = 0; ; i++) {
      try { return await db.query(sql, params); }
      catch (e) { if (i >= 2 || !transitorio(e)) throw e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
    }
  };
  await q(`ALTER TABLE item_catmat_map ADD COLUMN IF NOT EXISTS conf NUMERIC`);
  // staging REAL (não TEMP): sobrevive a reconnects (a TEMP some no PgBouncer transaction-pooling da Neon). RETOMÁVEL: se já
  // existe cheia e não for FORCE_STAGE=1, reaproveita (cache do LLM torna o reprocessamento barato). DROP só quando reconstrói.
  const existe = (await q(`SELECT to_regclass('public._catmat_tail') r`)).rows[0].r;
  const nStage = existe ? Number((await q(`SELECT count(*) n FROM _catmat_tail`)).rows[0].n) : 0;
  if (!existe || nStage === 0 || process.env.FORCE_STAGE === "1") {
    await q(`DROP TABLE IF EXISTS _catmat_tail`);
    await q(`CREATE TABLE _catmat_tail AS
      SELECT row_number() OVER (ORDER BY n_itens DESC) id, chave, codigo_pdm cur_code, sim, n_itens
      FROM item_catmat_map WHERE sim < ${APPLY_MAX} ${APPLY_LIMIT ? `ORDER BY n_itens DESC LIMIT ${APPLY_LIMIT}` : ""}`);
    await q(`CREATE INDEX ON _catmat_tail (id)`);
  } else console.log(`(retomando · staging _catmat_tail já tem ${nStage.toLocaleString()} linhas)`);
  const total = Number((await q(`SELECT count(*) n FROM _catmat_tail`)).rows[0].n);
  console.log(`MODE=apply · cauda sim<${APPLY_MAX}: ${total.toLocaleString()} chaves · adota LLM com conf>=${APPLY_TH} · lotes ${BATCH}`);

  const upd = { adot: 0, abst: 0, mant: 0, itens_adot: 0 };
  const t0 = Date.now();
  for (let off = 0; off < total; off += BATCH) {
    const rows = (await q(`
      SELECT t.id, t.chave, t.cur_code, t.n_itens,
        (SELECT json_agg(json_build_object('code', x.codigo_pdm, 'name', x.nome_pdm, 'classe', x.nome_classe))
         FROM (SELECT codigo_pdm, nome_pdm, nome_classe FROM catmat_pdm
               ORDER BY lower(nome_pdm) <-> t.chave LIMIT ${K}) x) cands
      FROM _catmat_tail t WHERE t.id > ${off} AND t.id <= ${off + BATCH} ORDER BY t.id`)).rows;

    const reranked = await pool(rows, async (r) => {
      const cands = (r.cands || []).map((x) => ({ code: String(x.code), name: x.name, classe: x.classe }));
      if (!cands.length) return { ...r, act: "mant" };
      const llm = await classify(r.chave, cands);
      const chosen = cands.find((x) => x.code === llm.code);
      if (llm.code === "0" && (llm.conf ?? 0) >= APPLY_TH) return { ...r, act: "abst", conf: llm.conf };
      if (chosen && Number(chosen.code) !== Number(r.cur_code) && (llm.conf ?? 0) >= APPLY_TH)
        return { ...r, act: "adot", code: chosen.code, name: chosen.name, classe: chosen.classe, conf: llm.conf };
      return { ...r, act: "mant" };
    });

    // flush em bloco (unnest)
    const A = { chave: [], code: [], name: [], classe: [], conf: [], metodo: [], aceito: [] };
    for (const r of reranked) {
      if (!r || r._err) continue;
      if (r.act === "adot") { upd.adot++; upd.itens_adot += Number(r.n_itens) || 0;
        A.chave.push(r.chave); A.code.push(Number(r.code)); A.name.push(r.name); A.classe.push(r.classe);
        A.conf.push(r.conf); A.metodo.push("rerank"); A.aceito.push(true); }
      else if (r.act === "abst") { upd.abst++;
        A.chave.push(r.chave); A.code.push(Number(r.cur_code)); A.name.push(null); A.classe.push(null);
        A.conf.push(r.conf); A.metodo.push("rerank_abstain"); A.aceito.push(false); }
      else upd.mant++;
    }
    if (A.chave.length) await q(
      `UPDATE item_catmat_map m SET codigo_pdm=v.code,
         nome_pdm=COALESCE(v.name, m.nome_pdm), nome_classe=COALESCE(v.classe, m.nome_classe),
         conf=v.conf, metodo=v.metodo, aceito=v.aceito, atualizado=now()
       FROM (SELECT * FROM unnest($1::text[],$2::int[],$3::text[],$4::text[],$5::numeric[],$6::text[],$7::bool[])
             AS t(chave,code,name,classe,conf,metodo,aceito)) v
       WHERE m.chave=v.chave`,
      [A.chave, A.code, A.name, A.classe, A.conf, A.metodo, A.aceito]);
    const done = Math.min(off + BATCH, total);
    console.log(`  ${done.toLocaleString()}/${total.toLocaleString()} · adotadas ${upd.adot.toLocaleString()} · abstenções ${upd.abst.toLocaleString()} · ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  await q(`DROP TABLE IF EXISTS _catmat_tail`);
  const s = (await q(`SELECT count(*) n, count(*) FILTER (WHERE aceito) ok,
    count(*) FILTER (WHERE metodo='rerank') rk, count(*) FILTER (WHERE metodo='rerank_abstain') ab FROM item_catmat_map`)).rows[0];
  console.log(`\n✔ apply concluído · ${upd.adot.toLocaleString()} chaves reclassificadas pelo LLM (${upd.itens_adot.toLocaleString()} itens-linha) · ${upd.abst.toLocaleString()} abstenções`);
  console.log(`  item_catmat_map: ${Number(s.n).toLocaleString()} chaves · ${Number(s.ok).toLocaleString()} aceitas · rerank ${Number(s.rk).toLocaleString()} · rerank_abstain ${Number(s.ab).toLocaleString()}`);
  await db.end();
}

// ---------- MODE=eval: testa nos 90 rótulos de SC ----------
const GOLD = {0:13546,1:19789,2:19772,3:19036,4:19773,5:30040,6:823,7:5778,8:6250,9:4550,10:20,11:18071,12:8618,13:3868,14:1501,15:19715,16:19705,17:12820,18:862,19:1505,20:911,21:0,22:19716,23:1415,24:5648,25:17297,26:30022,27:1080,28:11676,29:8203,30:1265,31:0,32:8974,33:615,34:6661,35:436,36:14584,37:12501,38:19771,39:12810,40:388,41:13634,42:4964,43:0,44:8414,45:13772,46:0,47:7059,48:8513,49:18258,50:0,51:17368,52:175,53:7868,54:30084,55:5200,56:0,57:0,58:3965,59:8719,60:18153,61:0,62:5017,63:1627,64:6537,65:14559,66:-1,67:578,68:696,69:5056,70:1076,71:8254,72:7595,73:3817,74:10422,75:-1,76:-1,77:5978,78:4010,79:-1,80:19769,81:8200,82:10383,83:7819,84:863,85:397,86:1139,87:0,88:14969,89:-1};

async function evalMode() {
  const allname = Object.fromEntries(load(SC + "/pdm_names.tsv").map((n) => [n.codigo_pdm, n.nome_pdm]));
  const ws = Object.fromEntries(load(SC + "/sc_strat_ws.tsv").map((r) => [Number(r.i), r]));
  const test = Object.keys(GOLD).map(Number).filter((i) => GOLD[i] > 0 && ws[i]);
  console.log(`reranker-LLM (${MODEL_LABEL}) em ${test.length} itens do gabarito de SC…`);
  const res = await pool(test, async (i) => {
    const r = ws[i]; const cands = parseCands(r);
    const llm = await classify(r.chave, cands);
    return { i, band: r.band, gn: norm(allname[String(GOLD[i])] || ""),
             trig: norm((r.cand_trgm || "").split(" | ")[0].split(":").slice(1).join(":")),
             llm: norm(llm.name || ""), conf: llm.conf ?? 0, err: llm._err };
  });
  const err = res.find((r) => r._err || r.err); if (err) { console.log("\nERRO:", err._err || err.err); return; }
  const BANDS = ["A_200+","B_50-199","C_20-49","D_5-19","E_2-4"];
  // "não-piora": mantém o trigrama e só adota o LLM quando ele diverge E tem confiança >= th
  const THS = [1.01, 0.95, 0.9, 0.8, 0.0];   // 1.01 = nunca adota (=trigrama puro); 0.0 = LLM puro
  const accAt = (th) => { const g = {}; for (const r of res) { const a = (g[r.band] ||= { n: 0, ok: 0 }); a.n++;
      const pred = (r.llm && r.llm !== r.trig && r.conf >= th) ? r.llm : r.trig; if (pred === r.gn) a.ok++; } return g; };
  const per = Object.fromEntries(THS.map((t) => [t, accAt(t)]));
  console.log(`\n${"banda".padEnd(10)} ${"n".padStart(3)} | ` + THS.map((t) => (t > 1 ? "trig" : "c≥" + t).padStart(6)).join(" | "));
  const tot = Object.fromEntries(THS.map((t) => [t, { n: 0, ok: 0 }]));
  for (const b of BANDS) { const n = per[THS[0]][b]?.n; if (!n) continue;
    console.log(`${b.padEnd(10)} ${String(n).padStart(3)} | ` + THS.map((t) => (100*per[t][b].ok/n).toFixed(1).padStart(6)).join(" | "));
    for (const t of THS) { tot[t].n += n; tot[t].ok += per[t][b].ok; } }
  console.log(`${"TOTAL".padEnd(10)} ${String(tot[THS[0]].n).padStart(3)} | ` + THS.map((t) => (100*tot[t].ok/tot[t].n).toFixed(1).padStart(6)).join(" | "));
  console.log("\ntrig = trigrama puro (baseline); c≥X = adota LLM só com confiança >= X. Melhor coluna = ganho real do reranker-LLM.");
}

const MODE = (process.env.MODE || "eval").toLowerCase();
(MODE === "apply" ? applyMode() : evalMode()).catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
