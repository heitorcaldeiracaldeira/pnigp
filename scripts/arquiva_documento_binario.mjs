// CAMADA DE ARQUIVO DO BINÁRIO — guarda o PDF EM SI (não só o texto), com hash de integridade e índice em
// arquivo_binario_sc. É a cópia à prova de exclusão do PNCP: quando o PNCP apaga/substitui um documento, o arquivo
// original continua NOSSO. Prioriza os que o PNCP mais troca: ATAS e EDITAIS.
//
// Backend do binário: _storage.mjs (plugável). Hoje `local` (disco); em servidor potente, `s3` (AWS) = solução completa.
// O ÍNDICE (arquivo_binario_sc) fica sempre no Neon, apontando storage+chave+hash — independe de onde o binário vive.
//
// Resumível (no índice = feito) · idempotente · robusto a 429.
//   node scripts/arquiva_documento_binario.mjs
//   LIMIT=100 · CONC=3 · MAXMB=50 · ARQUIVO_STORAGE=local|s3 · ARQUIVO_DIR=<dir> (local) · PRIORIDADE=atas|editais|todos
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { putObject, objectExists, sha256, STORAGE } from "./_storage.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CONC = Number(process.env.CONC || 3);
const LIMIT = Number(process.env.LIMIT || 0);
const MAXMB = Number(process.env.MAXMB || 50);            // pula PDFs gigantes (raros) p/ não engasgar
const PRIORIDADE = (process.env.PRIORIDADE || "todos").toLowerCase();  // ordem: atas → editais → resto
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// chave do objeto — estável e igual em local/S3. Achata o numero_controle (tem "/") p/ chave plana.
const chaveDe = (nc, sdoc) => `pdf/${String(nc).replace(/\//g, "_")}__${sdoc}.pdf`;

async function baixa(uri) {
  for (let t = 0; t < 6; t++) {
    try {
      const r = await fetch(uri, { signal: AbortSignal.timeout(60000) });
      if (r.status === 429) { await sleep(4000 + t * 4000); continue; }
      if (!r.ok) return { skip: `HTTP ${r.status}` };
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.byteLength > MAXMB * 1024 * 1024) return { skip: `>${MAXMB}MB` };
      const ct = r.headers.get("content-type") || "application/pdf";
      return { buf: Buffer.from(buf), contentType: ct };
    } catch { await sleep(1500 * (t + 1)); }
  }
  return null;   // esgotou fetch → NÃO indexa: retenta no próximo run
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  const q = async (s, p) => { for (let i = 0; ; i++) { try { return await db.query(s, p); } catch (e) { if (i >= 3) throw e; await sleep(1200 * (i + 1)); } } };

  // ÍNDICE do arquivo binário — aponta onde o PDF vive (storage+chave), com hash e tamanho p/ integridade.
  await q(`CREATE TABLE IF NOT EXISTS arquivo_binario_sc (
    cnpj TEXT, ano INT, seq INT, sequencial_documento INT, cod_ibge TEXT, numero_controle TEXT,
    tipo_documento TEXT, storage TEXT, chave TEXT, ref TEXT, content_type TEXT,
    tamanho_bytes BIGINT, sha256 TEXT, arquivado_em timestamptz DEFAULT now(),
    PRIMARY KEY (cnpj, ano, seq, sequencial_documento))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_arqbin_nc ON arquivo_binario_sc (numero_controle)`);

  const ordem = `CASE
      WHEN a.tipo_documento_id = 16 OR a.tipo_documento ~* 'ata' THEN 1
      WHEN a.tipo_documento ~* 'edital|aviso' THEN 2 ELSE 3 END`;
  const filtro = PRIORIDADE === "atas" ? `AND (a.tipo_documento_id = 16 OR a.tipo_documento ~* 'ata')`
    : PRIORIDADE === "editais" ? `AND a.tipo_documento ~* 'edital|aviso'` : ``;
  const docs = (await q(`SELECT a.cnpj,a.ano,a.seq,a.sequencial_documento,a.cod_ibge,a.numero_controle,a.tipo_documento,a.uri
    FROM arquivos_sc a
    WHERE a.uri IS NOT NULL ${filtro}
      AND NOT EXISTS (SELECT 1 FROM arquivo_binario_sc b WHERE b.cnpj=a.cnpj AND b.ano=a.ano AND b.seq=a.seq AND b.sequencial_documento=a.sequencial_documento)
    ORDER BY ${ordem}, a.data_publicacao DESC NULLS LAST
    ${LIMIT ? "LIMIT " + LIMIT : ""}`)).rows;
  console.log(`arquivando ${docs.length.toLocaleString()} documentos (prioridade ${PRIORIDADE}) · storage=${STORAGE} · conc ${CONC}\n`);

  let ok = 0, pulados = 0, falhas = 0, bytes = 0, i = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < docs.length) {
      const e = docs[i++];
      const r = await baixa(e.uri);
      if (r === null) { falhas++; continue; }          // fetch esgotou → retenta depois
      if (r.skip) { pulados++;                          // indisponível/gigante → registra como "sem binário" p/ não re-tentar à toa
        await q(`INSERT INTO arquivo_binario_sc (cnpj,ano,seq,sequencial_documento,cod_ibge,numero_controle,tipo_documento,storage,chave,ref,content_type,tamanho_bytes,sha256)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,NULL,NULL,0,NULL) ON CONFLICT DO NOTHING`,
          [e.cnpj,e.ano,e.seq,Number(e.sequencial_documento)||0,e.cod_ibge,e.numero_controle,e.tipo_documento,`skip:${r.skip}`]).catch(()=>{});
        continue;
      }
      try {
        const chave = chaveDe(e.numero_controle, Number(e.sequencial_documento) || 0);
        const put = await putObject(chave, r.buf, r.contentType);
        await q(`INSERT INTO arquivo_binario_sc (cnpj,ano,seq,sequencial_documento,cod_ibge,numero_controle,tipo_documento,storage,chave,ref,content_type,tamanho_bytes,sha256)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (cnpj,ano,seq,sequencial_documento) DO UPDATE SET storage=EXCLUDED.storage, chave=EXCLUDED.chave, ref=EXCLUDED.ref, tamanho_bytes=EXCLUDED.tamanho_bytes, sha256=EXCLUDED.sha256, arquivado_em=now()`,
          [e.cnpj,e.ano,e.seq,Number(e.sequencial_documento)||0,e.cod_ibge,e.numero_controle,e.tipo_documento,put.storage,chave,put.ref,r.contentType,r.buf.byteLength,sha256(r.buf)]);
        ok++; bytes += r.buf.byteLength;
      } catch (err) { if (++falhas <= 10) console.log(`\n  ⚠ ${e.ano}/${e.seq}#${e.sequencial_documento}: ${err.message.slice(0,80)}`); }
      if (++done % 50 === 0) process.stdout.write(`  ${done}/${docs.length} · ${ok} arquivados · ${(bytes/1e6).toFixed(0)} MB · ${pulados} pulados\r`);
    }
  }));
  const s = (await q(`SELECT count(*) n, count(*) FILTER (WHERE chave IS NOT NULL) com, pg_size_pretty(sum(tamanho_bytes)) tam FROM arquivo_binario_sc`)).rows[0];
  console.log(`\n✔ arquivo_binario_sc: ${Number(s.n).toLocaleString()} indexados · ${Number(s.com).toLocaleString()} com binário · ${s.tam || "0"} (storage=${STORAGE})`);
  console.log(`  esta rodada: ${ok} arquivados (${(bytes/1e6).toFixed(1)} MB) · ${pulados} sem binário · ${falhas} falhas (retentar)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
