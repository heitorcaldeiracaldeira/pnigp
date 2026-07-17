// BACKFILL DO RAW EM arquivos_sc — cópia fiel do PNCP (regra 1). Catalogamos os documentos sem guardar o JSON cru;
// aqui re-busca /orgaos/{cnpj}/compras/{ano}/{seq}/arquivos e grava o `raw` por documento, EXATO como a API mandou.
// Resumível por `raw IS NULL` (à medida que preenche, o processo sai da fila). Falha nunca vira zero (pncp_http).
// Se a API trouxer um documento que ainda não temos, INSERE (cópia fiel = ter tudo o que o PNCP tem).
// node scripts/backfill_raw_arquivos_sc.mjs   (CONC=4 LIMIT=n opcionais)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { getJson, Bloqueado } from "./pncp_http.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const CONC = Number(process.env.CONC || 4);
const LIMIT = Number(process.env.LIMIT || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  const FATAL = new Set(["22P05", "23502", "42703", "42P10"]);
  const q = async (s, p) => { let u; for (let i = 0; i < 6; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (FATAL.has(e.code)) throw e; await sleep(1200 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };

  await q(`ALTER TABLE arquivos_sc ADD COLUMN IF NOT EXISTS raw jsonb`);

  const lim = LIMIT ? `LIMIT ${LIMIT}` : "";
  const procs = (await q(`SELECT cnpj, ano, seq, max(cod_ibge) cod_ibge
    FROM arquivos_sc WHERE raw IS NULL GROUP BY cnpj, ano, seq ${lim}`)).rows;
  const falta0 = (await q(`SELECT count(*)::int n FROM arquivos_sc WHERE raw IS NULL`)).rows[0].n;
  console.log(`backfill raw: ${procs.length.toLocaleString()} processos pendentes · ${falta0.toLocaleString()} documentos sem raw · conc ${CONC}`);

  let i = 0, done = 0, gravados = 0, inseridos = 0, abortado = null;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < procs.length && !abortado) {
      const p = procs[i++];
      let arqs;
      try { arqs = await getJson(`${PNCP}/orgaos/${p.cnpj}/compras/${p.ano}/${p.seq}/arquivos`); }
      catch (e) { if (e instanceof Bloqueado) { abortado = e.message; break; } continue; }
      try {
        for (const d of arqs) {
          const sd = Number(d.sequencialDocumento) || 0;
          // grava o RAW no documento existente; se não existir (doc novo), INSERE fiel
          const up = await q(`UPDATE arquivos_sc SET raw=$5, atualizado=now()
            WHERE cnpj=$1 AND ano=$2 AND seq=$3 AND sequencial_documento=$4`,
            [p.cnpj, p.ano, p.seq, sd, JSON.stringify(d)]);
          if (up.rowCount === 0) {
            await q(`INSERT INTO arquivos_sc (cnpj,ano,seq,sequencial_documento,cod_ibge,tipo_documento_id,tipo_documento,titulo,uri,status_ativo,data_publicacao,raw)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
              ON CONFLICT (cnpj,ano,seq,sequencial_documento) DO UPDATE SET raw=EXCLUDED.raw, atualizado=now()`,
              [p.cnpj, p.ano, p.seq, sd, p.cod_ibge, d.tipoDocumentoId != null ? Number(d.tipoDocumentoId) : null,
               String(d.tipoDocumentoNome || d.tipoDocumentoDescricao || "") || null, String(d.titulo || "").slice(0, 300) || null,
               d.uri || d.url || null, d.statusAtivo === true, d.dataPublicacaoPncp ? String(d.dataPublicacaoPncp).slice(0, 19) : null,
               JSON.stringify(d)]);
            inseridos++;
          } else gravados += up.rowCount;
        }
      } catch { /* deixa p/ o próximo run */ }
      if (++done % 100 === 0) process.stdout.write(`  ${done}/${procs.length} · ${gravados} raws · ${inseridos} novos\r`);
    }
  }));

  if (abortado) console.log(`\n🔴 ABORTADO (falha não vira zero): ${abortado}`);
  const s = (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE raw IS NOT NULL)::int com_raw FROM arquivos_sc`)).rows[0];
  console.log(`\n✔ arquivos_sc: ${s.n.toLocaleString()} documentos · ${s.com_raw.toLocaleString()} com raw · faltam ${(s.n - s.com_raw).toLocaleString()}`);
  await db.end();
  if (abortado) process.exit(1);
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
