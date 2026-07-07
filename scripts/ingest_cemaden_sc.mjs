// CEMADEN — estações pluviométricas de monitoramento de risco por município. Fonte: CEMADEN (WFS GeoServer). State-agnostic (UF env).
import fs from "fs"; import pg from "pg";
const UF = process.env.UF || "SC";
const norm = (s) => (s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const u = `https://gsc.cemaden.gov.br/geoserver/cemaden_dev/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=cemaden_dev:view_pcds_pluviometrica_cemaden&outputFormat=application/json&CQL_FILTER=uf='${UF}'`;
const j = await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } })).json();
const feats = j.features || [];
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const byNome = new Map((await db.query("SELECT cod_ibge, nome FROM entes_sc WHERE tipo='M'")).rows.map(e => [norm(e.nome), e.cod_ibge]));
const agg = new Map(); let semMatch = 0;
for (const f of feats) { const p = f.properties; const cod = byNome.get(norm(p.cidade)); if (!cod) { semMatch++; continue; } if (!agg.has(cod)) agg.set(cod, { total: 0, ativas: 0 }); const o = agg.get(cod); o.total++; if ((+p.tempo_inatividade || 999999) < 1440) o.ativas++; } // <24h = ativa
await db.query(`CREATE TABLE IF NOT EXISTS cemaden_sc (cod_ibge TEXT PRIMARY KEY, estacoes INT, ativas INT, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM cemaden_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
let n = 0;
for (const [cod, o] of agg) { await db.query("INSERT INTO cemaden_sc (cod_ibge,estacoes,ativas) VALUES ($1,$2,$3) ON CONFLICT (cod_ibge) DO UPDATE SET estacoes=EXCLUDED.estacoes,ativas=EXCLUDED.ativas,atualizado=now()", [cod, o.total, o.ativas]); n++; }
const c = (await db.query("SELECT count(*) n, sum(estacoes) e FROM cemaden_sc")).rows[0];
const semEst = (await db.query("SELECT count(*) c FROM entes_sc WHERE tipo='M' AND cod_ibge NOT IN (SELECT cod_ibge FROM cemaden_sc)")).rows[0];
console.log(`✔ cemaden_sc: ${c.n} munis com estação · ${c.e} estações · ${semEst.c} municípios SEM monitoramento (ponto cego) · ${semMatch} sem match`);
await db.end();
