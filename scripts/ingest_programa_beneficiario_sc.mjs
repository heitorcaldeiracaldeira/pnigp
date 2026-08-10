// ETL — ELEGIBILIDADE: quem pode captar cada programa (Transferegov fundoafundo/programa_beneficiario, API viva).
// Responde "quais municípios são elegíveis" — base do casamento oportunidade×necessidade. Para programa ESPECIFICO,
// lista o grupo de beneficiários; para VOLUNTARIO, quem participa. Filtra UF=SC. Idempotente.
// node scripts/ingest_programa_beneficiario_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = process.env.UF || "SC";
import { paginar as clientePaginar } from "./transferegov.mjs";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const num = (v) => { const n = Number(v); return isNaN(n) || v == null ? null : n; };
const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();

async function api(url, headers = {}) {
  for (let t = 0; t < 5; t++) {
    try { const r = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(40000) }); if (r.status >= 500) throw 0; return r; }
    catch { await sleep(2000 * (t + 1)); }
  }
  return null;
}
// ⚠️ MIGRADO PARA O HOST NOVO — o antigo é desligado em 31/08/2026 (Comunicado Transferegov nº 23/2026).
// Era paginação por header `Range`, que o contrato novo não tem, e a resposta virou envelope `{data:[…]}`.
// Traduzir isso em `transferegov.mjs` — e não aqui — foi o que permitiu migrar três ETLs sem reescrever
// nenhuma por dentro. Segue entregando LOTES, que é o que o consumidor abaixo espera.
async function* paginar(recurso, qs = "") {
  const filtros = Object.fromEntries(new URLSearchParams(qs));
  let lote = [];
  for await (const linha of clientePaginar(recurso, filtros, 500)) {
    lote.push(linha);
    if (lote.length >= 1000) { yield lote; lote = []; }
  }
  if (lote.length) yield lote;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS programa_beneficiario_sc (
    id_beneficiario TEXT PRIMARY KEY, id_programa TEXT, cod_ibge TEXT, nome TEXT, uf TEXT, tipo TEXT,
    valor NUMERIC, numero_emenda TEXT, parlamentar TEXT)`);
  const q = async (s, p) => { for (let t = 0; t < 8; t++) { try { return await db.query(s, p); } catch { await sleep(1200 * (t + 1)); } } throw new Error("db"); };

  // mapa nome→cod_ibge (municípios + o próprio estado) p/ resolver o beneficiário ao ente
  const entes = (await db.query(`SELECT cod_ibge, nome, tipo FROM entes_sc`)).rows;
  const mapEnte = new Map(entes.map((e) => [norm(e.nome), e.cod_ibge]));

  console.log(`Coletando programa_beneficiario (UF=${UF})…`);
  let n = 0, resolv = 0;
  for await (const arr of paginar("fundoafundo/programa_beneficiario", `uf_beneficiario_programa=eq.${UF}`)) {
    for (const b of arr) {
      const cod = mapEnte.get(norm(b.nome_beneficiario_programa)) || null;
      if (cod) resolv++;
      await q(`INSERT INTO programa_beneficiario_sc (id_beneficiario,id_programa,cod_ibge,nome,uf,tipo,valor,numero_emenda,parlamentar)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT (id_beneficiario) DO UPDATE SET cod_ibge=EXCLUDED.cod_ibge, tipo=EXCLUDED.tipo, valor=EXCLUDED.valor`,
        [String(b.id_beneficiario_programa), b.id_programa != null ? String(b.id_programa) : null, cod, b.nome_beneficiario_programa || null, b.uf_beneficiario_programa || null, b.tipo_beneficiario_programa || null, num(b.valor_beneficiario_programa), b.numero_emenda_beneficiario_programa || null, b.nome_parlamentar_beneficiario_programa || null]);
      n++;
    }
    console.log(`  ...${n} beneficiários (${resolv} resolvidos a ente)`);
  }
  await db.query(`CREATE INDEX IF NOT EXISTS ix_pbenef_prog ON programa_beneficiario_sc (id_programa)`);
  await db.query(`CREATE INDEX IF NOT EXISTS ix_pbenef_cod ON programa_beneficiario_sc (cod_ibge)`);
  const r = (await db.query(`SELECT count(*) n, count(*) FILTER (WHERE cod_ibge IS NOT NULL) res, count(distinct id_programa) progs, count(distinct cod_ibge) entes, string_agg(distinct tipo, ',') tipos FROM programa_beneficiario_sc`)).rows[0];
  console.log(`programa_beneficiario_sc: ${r.n} linhas · ${r.res} resolvidas · ${r.progs} programas · ${r.entes} entes · tipos: ${r.tipos}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
