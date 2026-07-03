// ETL — Sanções a empresas/pessoas (CEIS + CNEP) via API do Portal da Transparência (CGU).
// CEIS = Empresas Inidôneas e Suspensas · CNEP = Empresas Punidas. Nacional, paginado (15/pág).
// Guarda em sancoes (por NI = CNPJ/CPF) p/ cruzar com fornecedores. node scripts/ingest_sancoes.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = ENV.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const KEY = ENV.match(/^PORTAL_TRANSPARENCIA_KEY=(.+)$/m)[1].trim();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const dig = (s) => String(s || "").replace(/\D/g, "");
const toISO = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "").trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

async function pagina(fonte, p) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(`https://api.portaldatransparencia.gov.br/api-de-dados/${fonte}?pagina=${p}`, { headers: { "chave-api-dados": KEY, "Accept": "application/json" }, signal: AbortSignal.timeout(45000) });
      if (r.status === 429) { await sleep(8000 * (t + 1)); continue; }
      if (!r.ok) { if (r.status >= 500) { await sleep(3000 * (t + 1)); continue; } return null; }
      return await r.json();
    } catch { await sleep(2000 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, keepAlive: true });
  db.on("error", () => {});
  await db.query(`CREATE TABLE IF NOT EXISTS sancoes (
    id TEXT PRIMARY KEY, fonte TEXT, ni TEXT, tipo_pessoa TEXT, nome TEXT,
    tipo_sancao TEXT, orgao TEXT, data_inicio DATE, data_fim DATE, fundamentacao TEXT, atualizado timestamptz DEFAULT now() )`);
  await db.query(`CREATE INDEX IF NOT EXISTS sancoes_ni_idx ON sancoes (ni)`);
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await sleep(1000 * (t + 1)); } } throw new Error("db"); };

  let total = 0;
  for (const fonte of ["ceis", "cnep"]) {
    let p = 1, vazias = 0;
    while (p <= 4000) {
      const lote = await pagina(fonte, p);
      if (lote == null) { console.log(`${fonte} pág ${p}: falha de rede — interrompe`); break; }
      if (!Array.isArray(lote) || lote.length === 0) { vazias++; if (vazias >= 1) break; }
      for (const x of lote) {
        const pe = x.pessoa || {};
        const ni = dig(pe.cnpjFormatado) || dig(pe.cpfFormatado) || dig(pe.numeroInscricaoSocial) || dig(x.sancionado?.codigoFormatado);
        if (!ni) continue;
        await q(`INSERT INTO sancoes (id,fonte,ni,tipo_pessoa,nome,tipo_sancao,orgao,data_inicio,data_fim,fundamentacao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (id) DO UPDATE SET data_fim=EXCLUDED.data_fim, tipo_sancao=EXCLUDED.tipo_sancao, atualizado=now()`,
          [`${fonte}-${x.id}`, fonte.toUpperCase(), ni, pe.tipo || (dig(pe.cnpjFormatado) ? "PJ" : "PF"), pe.razaoSocialReceita || pe.nome || x.sancionado?.nome || "", x.tipoSancao?.descricaoResumida || "", x.orgaoSancionador?.nome || "", toISO(x.dataInicioSancao), toISO(x.dataFimSancao), (x.fundamentacao || []).map((f) => f.descricao).filter(Boolean).join("; ").slice(0, 400)]);
        total++;
      }
      if (p % 50 === 0) console.log(`  ${fonte}: pág ${p} · ${total} sanções gravadas`);
      p++;
      await sleep(220); // ~270 req/min, dentro do limite com token
    }
    console.log(`${fonte}: concluído na pág ${p}`);
  }
  const c = await db.query(`SELECT fonte, count(*) n, count(*) FILTER(WHERE length(ni)=14) pj, count(*) FILTER(WHERE data_fim>=current_date) ativas FROM sancoes GROUP BY 1`);
  console.log(`Sanções concluído: ${total} · ${JSON.stringify(c.rows)}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
