// ETL — Estatísticas vitais por município (nascidos vivos + óbitos). Fonte: IBGE Registro Civil via SIDRA
// (t2679 v217 nascidos, t2681 v343 óbitos). Substituto limpo do SIM/SINASC (DATASUS é DBC/TabNet difícil).
// Série completa. State-agnostic (UF code env). node scripts/ingest_estatisticas_vitais_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF_COD = process.env.UF_COD || "42"; // SC
const ANOS = (process.env.ANOS || Array.from({ length: 21 }, (_, i) => 2003 + i).join(",")).split(",");
const H = { "user-agent": "Mozilla/5.0" };
// busca ano a ano (p/all num só request estoura o timeout do SIDRA)
const sidra = async (t, v, ano) => { const u = `https://apisidra.ibge.gov.br/values/t/${t}/n6/in%20n3%20${UF_COD}/v/${v}/p/${ano}`; for (let i = 0; i < 4; i++) { try { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(45000) }); if (r.ok) { const j = await r.json(); if (Array.isArray(j)) return j; } } catch (e) {} await new Promise((s) => setTimeout(s, 1500)); } return null; };

async function run() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const M = new Map(); // cod|ano -> {nascidos, obitos}
  const put = (arr, campo) => { for (const r of (arr || []).slice(1)) { const cod = r.D1C, ano = +r.D3N, v = Number(r.V); if (!cod || cod.length !== 7 || !ano || !Number.isFinite(v)) continue; const k = cod + "|" + ano; if (!M.has(k)) M.set(k, { cod, ano, nascidos: null, obitos: null }); M.get(k)[campo] = v; } };
  for (const ano of ANOS) {
    const [na, ob] = await Promise.all([sidra(2679, 217, ano), sidra(2681, 343, ano)]);
    put(na, "nascidos"); put(ob, "obitos");
    process.stdout.write(na || ob ? "." : "x");
  }
  console.log("");
  if (!M.size) { console.error("SIDRA falhou (nada coletado)"); process.exit(1); }

  await db.query(`CREATE TABLE IF NOT EXISTS estatisticas_vitais_sc (cod_ibge TEXT, ano INTEGER, nascidos INTEGER, obitos INTEGER, atualizado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (cod_ibge, ano))`);
  for (const m of M.values()) {
    await db.query(`INSERT INTO estatisticas_vitais_sc (cod_ibge,ano,nascidos,obitos,atualizado) VALUES ($1,$2,$3,$4,now())
      ON CONFLICT (cod_ibge,ano) DO UPDATE SET nascidos=EXCLUDED.nascidos,obitos=EXCLUDED.obitos,atualizado=now()`,
      [m.cod, m.ano, m.nascidos, m.obitos]);
  }
  const chk = (await db.query(`SELECT count(*) l, count(distinct cod_ibge) m, min(ano) mi, max(ano) ma, sum(nascidos) n, sum(obitos) o FROM estatisticas_vitais_sc`)).rows[0];
  console.log(`✔ estatisticas_vitais_sc: ${chk.l} linhas · ${chk.m} munis · ${chk.mi}-${chk.ma} · ${chk.n} nascidos / ${chk.o} óbitos`);
  await db.end();
}
run().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
