// ESTADO DE EXTRAÇÃO POR DOCUMENTO, COM VERSÃO DO PARSER.
//
// POR QUE (bug real, 2026-07-15): o estado vivia em `marca_ata_feitas`, por PROCESSO e COMPARTILHADO entre os
// extratores. Quando o layout era reclassificado, a ata seguia "feita" da rodada do parser errado e o extrator novo
// a pulava — 315 atas marcadas feitas, 1 item extraído. Pior: melhorar um parser NÃO reprocessava nada.
//
// Agora: estado no PRÓPRIO documento + PARSER_VERSAO. Sobe a versão quando qualquer parser muda → todo documento
// fica elegível de novo, sozinho. Sem marcador para esquecer de limpar.
//   parser_versao  = versão que leu este documento (NULL = nunca lido)
//   n_registros    = quantos registros o parser tirou (0 = lido e não tem nada; é RESPOSTA, não pendência)
//   lido_em        = quando
// Idempotente. node scripts/migra_estado_parser.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
await db.connect();

await db.query(`ALTER TABLE arquivo_texto_sc
  ADD COLUMN IF NOT EXISTS parser_versao int,
  ADD COLUMN IF NOT EXISTS n_registros int,
  ADD COLUMN IF NOT EXISTS lido_em timestamptz`);
console.log("✔ arquivo_texto_sc: parser_versao, n_registros, lido_em");

// fila de leitura: quem nunca foi lido na versão corrente, do mais promissor p/ o menos
await db.query(`CREATE INDEX IF NOT EXISTS ix_arqtexto_fila ON arquivo_texto_sc (parser_versao) WHERE chars > 500`);
await db.query(`CREATE INDEX IF NOT EXISTS ix_arqtexto_gerador ON arquivo_texto_sc (gerador)`);
console.log("✔ índices da fila");

// fila de DOWNLOAD: universo pelo TIPO OFICIAL do PNCP (16/11/19), não por título.
await db.query(`CREATE INDEX IF NOT EXISTS ix_arquivos_tipo ON arquivos_sc (tipo_documento_id)`);
console.log("✔ índice de tipo no catálogo");

const s = await db.query(`SELECT count(*) t, count(*) FILTER (WHERE parser_versao IS NULL AND chars>500) fila FROM arquivo_texto_sc`);
console.log(`\n  ${Number(s.rows[0].t).toLocaleString("pt-BR")} documentos · ${Number(s.rows[0].fila).toLocaleString("pt-BR")} a ler na versão corrente`);
await db.end();
