// Indícios de sobrepreço em MEDICAMENTOS vs o teto legal (CMED/PMVG). Conservador:
// casa por SUBSTÂNCIA + DOSAGEM, compara o preço/comprimido pago ao MAIOR PMVG/comprimido daquela dosagem
// (o teto mais permissivo), e flaga só quando paga > teto × 1,15. SC = PMVG 17%. Framing: INDÍCIO, a verificar.
// node scripts/build_sobrepreco_medicamentos.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const MARGEM = 1.15;
const STOP = new Set(["DE", "DA", "DO", "COM", "SEM", "SOB", "FORMA", "ACETATO", "CLORIDRATO", "SODICO", "SODICA", "MONOIDRATADA", "DICLORIDRATO", "SULFATO", "MALEATO", "BESILATO", "FUMARATO", "POTASSICO", "POTASSIO", "CALCICO", "ASSOCIADA", "ASSOCIADO"]);
const baseSub = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[,(]/)[0].replace(/\b\d+([.,]\d+)?\s*(MG|MCG|G|ML|UI|%).*/, "");
const normSub = (s) => baseSub(s).replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).sort().join(" ");
const dose = (s) => { const m = String(s || "").toUpperCase().replace(/(\d),(\d)/g, "$1.$2").match(/(\d+(?:\.\d+)?)\s*(MG|MCG|G|UI)\b/); return m ? m[1] + m[2] : null; };
const pkg = (a) => { const ms = String(a || "").match(/X\s*(\d+)/gi); if (!ms) return null; const m = ms[ms.length - 1].match(/(\d+)/); return m ? parseInt(m[1], 10) : null; };

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  db.on("error", () => {});
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };

  // 1) teto: subst+dose -> { max(pmvg/comprimido), n }
  const pm = (await q(`SELECT substancia, apresentacao, pmvg_17 FROM cmed_pmvg WHERE pmvg_17 IS NOT NULL AND apresentacao ILIKE '%COM%'`)).rows;
  const teto = new Map();
  for (const r of pm) { const n = pkg(r.apresentacao); const d = dose(r.apresentacao); if (!n || !d) continue; const k = normSub(r.substancia) + "|" + d; const u = Number(r.pmvg_17) / n; const e = teto.get(k) || { max: 0, n: 0 }; if (u > e.max) e.max = u; e.n++; teto.set(k, e); }
  console.log(`PMVG: ${teto.size} chaves substância+dose (comprimido)`);

  await db.query(`CREATE TABLE IF NOT EXISTS sobrepreco_medicamentos_sc (
    id BIGSERIAL PRIMARY KEY, cod_ibge TEXT, descricao TEXT, dose TEXT, paga NUMERIC, teto NUMERIC,
    excesso_pct NUMERIC, quantidade NUMERIC, economia NUMERIC, n_pmvg INT, atualizado timestamptz DEFAULT now())`);
  await db.query(`TRUNCATE sobrepreco_medicamentos_sc`);
  await db.query(`CREATE INDEX IF NOT EXISTS ix_sobremed_cod ON sobrepreco_medicamentos_sc(cod_ibge)`);

  const entes = (await q(`SELECT cod_ibge FROM entes_sc WHERE tipo='M' AND uf='SC'`)).rows;
  let totMun = 0, totFlag = 0;
  for (const e of entes) {
    const it = (await q(`SELECT descricao, unit_homologado, sum(quantidade) qtd FROM itens_sc
      WHERE cod_ibge=$1 AND unidade ILIKE '%comprimido%' AND unit_homologado>0 AND descricao NOT ILIKE '%ACAO JUDICIAL%'
      GROUP BY descricao, unit_homologado`, [e.cod_ibge])).rows;
    const linhas = [];
    for (const r of it) {
      const d = dose(r.descricao); if (!d) continue;
      const t = teto.get(normSub(r.descricao) + "|" + d); if (!t || !t.max) continue;
      const paga = Number(r.unit_homologado);
      if (paga > t.max * MARGEM) {
        const qtd = Number(r.qtd) || 0;
        linhas.push([e.cod_ibge, String(r.descricao).slice(0, 120), d, Math.round(paga * 100) / 100, Math.round(t.max * 100) / 100,
          Math.round((paga / t.max - 1) * 1000) / 10, qtd, Math.round((paga - t.max) * qtd), t.n]);
      }
    }
    if (linhas.length) {
      for (const l of linhas) await q(`INSERT INTO sobrepreco_medicamentos_sc (cod_ibge,descricao,dose,paga,teto,excesso_pct,quantidade,economia,n_pmvg) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, l);
      totMun++; totFlag += linhas.length;
    }
  }
  const tot = await db.query(`SELECT count(*) n, count(distinct cod_ibge) m, round(sum(economia)/1e6,1) mi FROM sobrepreco_medicamentos_sc`);
  console.log(`Concluído: ${totFlag} indícios em ${totMun} municípios · R$ ${tot.rows[0].mi} mi de excesso potencial (acumulado)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
