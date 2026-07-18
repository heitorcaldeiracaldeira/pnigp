// ENRIQUECEDOR — consome o corpus JÁ GUARDADO (arquivo_texto_sc + itens_sc), roda o casador de conjunto e grava
// por item: CÓDIGO DE CATÁLOGO (do texto do doc), CONFIANÇA e nº de documentos que corroboram. NÃO toca no PNCP
// (lê o que a extração já baixou) e NÃO toca no motor do CATMAT — é insumo, a montante. Resumível, idempotente.
// node scripts/enriquece_item_documento.mjs   (LIMIT=n CONC=… opcionais; LIMIT limita processos por rodada)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { casa } from "./casa_itens.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LIMIT = Number(process.env.LIMIT || 0);
const CONC = Number(process.env.CONC || 4);
const RANK = { alta: 3, media: 2, baixa: 1 };
const CRIACAO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 16, 20];
const PRIO_CAT = [4, 2, 6, 7];   // p/ o código de catálogo: TR, Edital, PB, ETP primeiro
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function catalogo(docNorm, off) {
  if (off == null) return null;
  const jan = docNorm.slice(Math.max(0, off - 45), off + 5);
  const nums = [...jan.matchAll(/\b\d{5,9}\b/g)].map((m) => m[0]);
  return nums.length ? nums[nums.length - 1] : null;
}
const consolida = (n, base) => (n === 0 ? "ausente" : n >= 3 ? "alta" : (n >= 2 && RANK[base] >= 2) ? "alta" : base);

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4, statement_timeout: 120000 });
  db.on("error", () => {});
  const q = async (s, p) => { let u; for (let i = 0; i < 5; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (["22P05", "23502", "42703", "42P10"].includes(e.code)) throw e; await sleep(1000 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };

  await q(`CREATE SCHEMA IF NOT EXISTS app`);   // ANDAR 2 (derivadas) — Lei 1: fora do espelho do PNCP (public)
  await q(`CREATE TABLE IF NOT EXISTS app.item_enriquecimento (
    cnpj TEXT, ano INT, seq INT, numero INT, cod_ibge TEXT,
    material_servico TEXT, catalogo_codigo TEXT, confianca TEXT, n_docs INT, docs TEXT,
    atualizado timestamptz DEFAULT now(), PRIMARY KEY (cnpj, ano, seq, numero))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_ienr_cod ON app.item_enriquecimento (cod_ibge)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_ienr_cat ON app.item_enriquecimento (catalogo_codigo)`);

  // processos com ≥1 documento de criação COM TEXTO e ainda NÃO enriquecidos
  const lim = LIMIT ? `LIMIT ${LIMIT}` : "";
  const procs = (await q(`
    SELECT t.cnpj, t.ano, t.seq FROM arquivo_texto_sc t
    JOIN arquivos_sc a USING (cnpj, ano, seq, sequencial_documento)
    WHERE t.chars > 500 AND t.excluido_em IS NULL AND a.tipo_documento_id = ANY($1)
      AND NOT EXISTS (SELECT 1 FROM app.item_enriquecimento e WHERE e.cnpj=t.cnpj AND e.ano=t.ano AND e.seq=t.seq)
    GROUP BY t.cnpj, t.ano, t.seq ${lim}`, [CRIACAO])).rows;
  console.log(`enriquecer: ${procs.length.toLocaleString()} processos com documento extraído · conc ${CONC}`);

  let i = 0, done = 0, itensOk = 0, comCat = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < procs.length) {
      const p = procs[i++];
      try {
        const itens = (await q(`SELECT numero, descricao, material_ou_servico FROM itens_sc WHERE cnpj=$1 AND ano=$2 AND seq=$3 ORDER BY numero`, [p.cnpj, p.ano, p.seq]))
          .rows.map((r) => ({ numeroItem: r.numero, descricao: r.descricao, material_ou_servico: r.material_ou_servico }));
        if (!itens.length) continue;
        const docs = (await q(`SELECT a.tipo_documento_id tid, t.texto, t.cod_ibge FROM arquivo_texto_sc t
          JOIN arquivos_sc a USING (cnpj, ano, seq, sequencial_documento)
          WHERE t.cnpj=$1 AND t.ano=$2 AND t.seq=$3 AND t.chars>500 AND t.excluido_em IS NULL AND a.tipo_documento_id = ANY($4)`, [p.cnpj, p.ano, p.seq, CRIACAO])).rows;
        if (!docs.length) continue;
        const cod_ibge = docs[0].cod_ibge;
        // roda o casador contra cada doc
        const porDoc = docs.map((d) => ({ tid: d.tid, ...casa(itens, d.texto) }));
        // consolida por item
        for (let k = 0; k < itens.length; k++) {
          const hits = porDoc.map((D) => ({ tid: D.tid, r: D.res[k], docNorm: D.docNorm })).filter((h) => h.r && h.r.off != null);
          hits.sort((a, b) => RANK[b.r.conf] - RANK[a.r.conf] || (b.r.score || 0) - (a.r.score || 0));
          const conf = consolida(hits.length, hits[0] ? hits[0].r.conf : "baixa");
          let cat = null;
          for (const h of [...hits].sort((a, b) => (PRIO_CAT.indexOf(a.tid) + 99) % 99 - (PRIO_CAT.indexOf(b.tid) + 99) % 99)) { cat = catalogo(h.docNorm, h.r.off); if (cat) break; }
          await q(`INSERT INTO app.item_enriquecimento (cnpj,ano,seq,numero,cod_ibge,material_servico,catalogo_codigo,confianca,n_docs,docs)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (cnpj,ano,seq,numero) DO UPDATE SET catalogo_codigo=EXCLUDED.catalogo_codigo, confianca=EXCLUDED.confianca, n_docs=EXCLUDED.n_docs, docs=EXCLUDED.docs, atualizado=now()`,
            [p.cnpj, p.ano, p.seq, itens[k].numeroItem, cod_ibge, itens[k].material_ou_servico, cat, conf, hits.length, hits.map((h) => h.tid).join(",")]);
          itensOk++; if (cat) comCat++;
        }
      } catch { /* deixa p/ o próximo run */ }
      if (++done % 50 === 0) process.stdout.write(`  ${done}/${procs.length} · ${itensOk} itens · ${comCat} c/catálogo\r`);
    }
  }));

  const s = (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE catalogo_codigo IS NOT NULL)::int cat,
    count(*) FILTER (WHERE confianca='alta')::int alta FROM app.item_enriquecimento`)).rows[0];
  console.log(`\n✔ app.item_enriquecimento: ${s.n.toLocaleString()} itens · ${s.cat.toLocaleString()} com código de catálogo · ${s.alta.toLocaleString()} confiança alta`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
