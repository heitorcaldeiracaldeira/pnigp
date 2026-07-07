// IBGE Censo 2022 — população por FAIXA ETÁRIA (pirâmide) por município + indicadores (idosos, dependência, envelhecimento). Fonte: IBGE tabela 9514. State-agnostic.
import fs from "fs"; import pg from "pg";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
const num = (v) => { const n = parseInt(String(v).replace(/\D/g, "")); return isNaN(n) ? 0 : n; };
const FAIXAS = [["93070", "0-4"], ["93084", "5-9"], ["93085", "10-14"], ["93086", "15-19"], ["93087", "20-24"], ["93088", "25-29"], ["93089", "30-34"], ["93090", "35-39"], ["93091", "40-44"], ["93092", "45-49"], ["93093", "50-54"], ["93094", "55-59"], ["93095", "60-64"], ["93096", "65-69"], ["93097", "70-74"], ["93098", "75-79"], ["49108", "80-84"], ["49109", "85-89"], ["60040", "90-94"], ["60041", "95-99"], ["6653", "100+"]];
const idadeIds = FAIXAS.map(f => f[0]).join(",");
const u = `https://servicodados.ibge.gov.br/api/v3/agregados/9514/periodos/2022/variaveis/93?localidades=N6[N3[${UFC}]]&classificacao=287[${idadeIds}]|2[6794]|286[113635]`;
const j = await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } })).json();
// mapeia catId -> {cod6 -> valor}
const catNome = Object.fromEntries(FAIXAS);
const dados = {}; // cod6 -> {faixa -> valor}
for (const res of (j[0]?.resultados || [])) { const catId = Object.keys(res.classificacoes.find(c => String(c.id) === "287").categoria)[0]; const fx = catNome[catId]; if (!fx) continue; for (const s of res.series) { const c6 = s.localidade.id.slice(0, 6); (dados[c6] ||= {})[fx] = num(Object.values(s.serie)[0]); } }
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by6 = new Map((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => [e.cod_ibge.slice(0, 6), e.cod_ibge]));
await db.query(`CREATE TABLE IF NOT EXISTS populacao_faixa_sc (cod_ibge TEXT PRIMARY KEY, total INT, pop_0_14 INT, pop_15_59 INT, pop_60 INT, pop_80 INT, pct_idosos NUMERIC, razao_dependencia NUMERIC, indice_envelhecimento NUMERIC, faixas JSONB, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query("DELETE FROM populacao_faixa_sc WHERE cod_ibge IN (SELECT cod_ibge FROM entes_sc WHERE tipo='M')");
const soma = (o, list) => list.reduce((s, k) => s + (o[k] || 0), 0);
let n = 0;
for (const [c6, cod] of by6) { const o = dados[c6]; if (!o) continue; const total = soma(o, FAIXAS.map(f => f[1])); if (!total) continue;
  const p014 = soma(o, ["0-4", "5-9", "10-14"]);
  const p1559 = soma(o, ["15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59"]);
  const p60 = soma(o, ["60-64", "65-69", "70-74", "75-79", "80-84", "85-89", "90-94", "95-99", "100+"]);
  const p80 = soma(o, ["80-84", "85-89", "90-94", "95-99", "100+"]);
  const dep = p1559 > 0 ? Math.round(((p014 + p60) / p1559) * 1000) / 10 : 0;
  const env = p014 > 0 ? Math.round((p60 / p014) * 1000) / 10 : 0;
  await db.query("INSERT INTO populacao_faixa_sc (cod_ibge,total,pop_0_14,pop_15_59,pop_60,pop_80,pct_idosos,razao_dependencia,indice_envelhecimento,faixas) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (cod_ibge) DO UPDATE SET total=EXCLUDED.total,pop_0_14=EXCLUDED.pop_0_14,pop_15_59=EXCLUDED.pop_15_59,pop_60=EXCLUDED.pop_60,pop_80=EXCLUDED.pop_80,pct_idosos=EXCLUDED.pct_idosos,razao_dependencia=EXCLUDED.razao_dependencia,indice_envelhecimento=EXCLUDED.indice_envelhecimento,faixas=EXCLUDED.faixas,atualizado=now()", [cod, total, p014, p1559, p60, p80, Math.round((p60 / total) * 1000) / 10, dep, env, JSON.stringify(o)]); n++; }
const c = (await db.query("SELECT count(*) n, round(100.0*sum(pop_60)/sum(total),1) idosos, round(100.0*sum(pop_0_14)/sum(total),1) criancas FROM populacao_faixa_sc")).rows[0];
console.log(`✔ populacao_faixa_sc: ${n} munis · SC ${c.idosos}% idosos (60+) · ${c.criancas}% crianças (0-14)`);
await db.end();
