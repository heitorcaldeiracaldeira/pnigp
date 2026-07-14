// ARQUIVOS — entidade do PNCP (documentos de cada contratação: edital, TR, ATA, termo de homologação…). Espelha fiel o
// endpoint /orgaos/{cnpj}/compras/{ano}/{seq}/arquivos → tabela arquivos_sc, ligada por numero_controle à contratacoes_sc.
// É o passo 3 de docs/arquitetura-pncp.md: a lista de documentos é a porta para a ATA — a fonte de marca/modelo/lances/
// participantes (que o PNCP não dá em campo estruturado; está no documento). RESUMÍVEL (arquivos_proc_feitos) + 429
// robusto + idempotente. TODAS as modalidades: todo processo tem documento com marca/modelo (dispensa inclusive).
// node scripts/ingest_arquivos_sc.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const CONC = Number(process.env.CONC || 2);
const MODALIDADES = process.env.MODALIDADES || "";   // "" = TODAS as modalidades (todo processo tem documento com marca/modelo, dispensa inclusive)
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function getArq(cnpj, ano, seq) {
  const url = `${PNCP}/orgaos/${cnpj}/compras/${ano}/${seq}/arquivos`;
  for (let t = 0; t < 8; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.status === 204) return [];
      if (r.status === 429) { await sleep(4000 + t * 4000); continue; }
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch { await sleep(1000 * (t + 1)); }
  }
  return null;   // esgotou — NÃO marca feito
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  const q = async (s, p) => { for (let i = 0; ; i++) { try { return await db.query(s, p); } catch (e) { if (i >= 2) throw e; await sleep(1200 * (i + 1)); } } };
  await q(`CREATE TABLE IF NOT EXISTS arquivos_sc (
    cnpj TEXT, ano INT, seq INT, sequencial_documento INT, cod_ibge TEXT,
    tipo_documento_id INT, tipo_documento TEXT, titulo TEXT, uri TEXT, status_ativo BOOLEAN, data_publicacao TEXT,
    numero_controle TEXT GENERATED ALWAYS AS (cnpj || '-1-' || lpad(seq::text, 6, '0') || '/' || ano) STORED,
    atualizado timestamptz DEFAULT now(), PRIMARY KEY (cnpj, ano, seq, sequencial_documento))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_arq_nc ON arquivos_sc (numero_controle)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_arq_tipo ON arquivos_sc (tipo_documento_id)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_arq_cod ON arquivos_sc (cod_ibge)`);
  await q(`CREATE TABLE IF NOT EXISTS arquivos_proc_feitos (numero_controle TEXT PRIMARY KEY, n INT, feito_em timestamptz DEFAULT now())`);

  const modFiltro = MODALIDADES ? `AND c.modalidade_id IN (${MODALIDADES})` : "";
  const procs = (await q(`SELECT c.cnpj, c.ano, c.seq, c.cod_ibge, c.numero_controle
    FROM contratacoes_sc c LEFT JOIN arquivos_proc_feitos f ON f.numero_controle=c.numero_controle
    WHERE f.numero_controle IS NULL ${modFiltro}`)).rows;
  console.log(`arquivos: ${procs.length.toLocaleString()} contratações pendentes (modalidades ${MODALIDADES || "todas"}) · conc ${CONC}`);

  let comArq = 0, i = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < procs.length) {
      const e = procs[i++];
      const arqs = await getArq(e.cnpj, e.ano, e.seq);
      if (arqs === null) continue;   // falha de fetch → não marca, retenta no re-run
      try {
        for (const a of arqs) {
          await q(`INSERT INTO arquivos_sc (cnpj,ano,seq,sequencial_documento,cod_ibge,tipo_documento_id,tipo_documento,titulo,uri,status_ativo,data_publicacao)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (cnpj,ano,seq,sequencial_documento) DO UPDATE SET tipo_documento=EXCLUDED.tipo_documento, titulo=EXCLUDED.titulo, uri=EXCLUDED.uri, status_ativo=EXCLUDED.status_ativo, atualizado=now()`,
            [e.cnpj, e.ano, e.seq, Number(a.sequencialDocumento) || 0, e.cod_ibge, a.tipoDocumentoId != null ? Number(a.tipoDocumentoId) : null,
             String(a.tipoDocumentoNome || a.tipoDocumentoDescricao || "") || null, String(a.titulo || "").slice(0, 300) || null,
             a.uri || a.url || null, a.statusAtivo === true, a.dataPublicacaoPncp ? String(a.dataPublicacaoPncp).slice(0, 19) : null]);
        }
        // marca feito (uma contratação pode legitimamente ter 0 arquivos? raro; mas registramos n p/ visibilidade)
        await q(`INSERT INTO arquivos_proc_feitos (numero_controle,n) VALUES ($1,$2) ON CONFLICT (numero_controle) DO UPDATE SET n=EXCLUDED.n, feito_em=now()`, [e.numero_controle, arqs.length]);
        if (arqs.length) comArq++;
      } catch { /* deixa p/ o próximo run */ }
      if (++done % 100 === 0) process.stdout.write(`  ${done}/${procs.length} · ${comArq} c/arquivo\r`);
    }
  }));
  const s = (await q(`SELECT count(*) docs, count(DISTINCT numero_controle) proc, count(*) FILTER (WHERE tipo_documento ~* 'ata') atas FROM arquivos_sc`)).rows[0];
  console.log(`\n✔ arquivos_sc: ${Number(s.docs).toLocaleString()} documentos · ${Number(s.proc).toLocaleString()} contratações · ${Number(s.atas).toLocaleString()} atas`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
