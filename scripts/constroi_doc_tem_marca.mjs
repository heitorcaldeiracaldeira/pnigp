// CONSTRÓI/ATUALIZA o flag app.doc_tem_marca — marca cada doc com padrão de marca (A=Marca/Fabricante, B=Item…Marca:Modelo:).
// O extrator lê fatias LEVES daqui em vez de varrer `texto ~* 'marca…'` nos 12GB. [[feedback-banco-e-o-gargalo]].
//
// ⭐ PNCP É UM LOG ([[pnigp-pncp-e-log-nao-estado]]): a MARCA só aparece QUANDO O ITEM HOMOLOGA (a ata/homologação
//    chega depois). Logo o flag NÃO é retrato congelado — ele se ATUALIZA por evento:
//    · BOOTSTRAP (default): varredura única, semeia a tabela.
//    · REFRESH=1: incremental — só docs cujo arquivos_sc.atualizado é novo (ata/homologação recém-chegada) →
//      re-flagga E INVALIDA marca_padrao_feitas desses processos, pra o extrator RE-TRANSFORMAR (re-extrair a marca
//      agora que o resultado existe). Assim um processo re-homologado/retificado volta pra fila de marca sozinho.
//   node scripts/constroi_doc_tem_marca.mjs           # bootstrap
//   REFRESH=1 node scripts/constroi_doc_tem_marca.mjs # incremental (no ciclo de eventos)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "sc").toLowerCase();
const T_TEXTO = `arquivo_texto_${UF}`, T_ARQ = `arquivos_${UF}`, T_ITENS = `itens_${UF}`, T_MARCA = `item_marca_${UF}`;
const T_FLAG = UF === "sc" ? "app.doc_tem_marca" : `app.doc_tem_marca_${UF}`;
const T_FEITAS = `app.marca_padrao_feitas_${UF}`;
const REFRESH = process.env.REFRESH === "1";
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
const q = (s, p) => db.query(s, p);

// padrão de marca no doc (o join com arquivos traz o atualizado = "quando esse doc mudou/chegou")
const CLASSIFICA = `CASE WHEN t.texto ~* 'marca/fabricante' THEN 'A'
                         WHEN t.texto ~* 'marca\\s*:.{0,40}modelo' THEN 'B' END`;
const FILTRO = `t.chars>500 AND t.excluido_em IS NULL AND (t.texto ~* 'marca/fabricante' OR t.texto ~* 'marca\\s*:.{0,40}modelo')`;

await q(`CREATE TABLE IF NOT EXISTS ${T_FLAG}(
  cnpj text, ano int, seq int, sequencial_documento int, padrao text, atualizado timestamptz,
  PRIMARY KEY(cnpj,ano,seq,sequencial_documento))`);
await q(`ALTER TABLE ${T_FLAG} ADD COLUMN IF NOT EXISTS atualizado timestamptz`);
await q(`CREATE INDEX IF NOT EXISTS ix_doctemmarca_proc ON ${T_FLAG}(cnpj,ano,seq)`);
await q(`CREATE TABLE IF NOT EXISTS ${T_FEITAS}(cnpj text,ano int,seq int,primary key(cnpj,ano,seq))`);
// índice de apoio p/ o REFRESH por evento de item (homologação/des-homologação) ficar LEVE
await q(`CREATE INDEX IF NOT EXISTS ix_itens_atualiz_${UF} ON ${T_ITENS}(data_atualizacao)`);

const t0 = Date.now();
if (!REFRESH) {
  // BOOTSTRAP — varredura única
  await q(`TRUNCATE ${T_FLAG}`);
  const r = await q(`INSERT INTO ${T_FLAG}(cnpj,ano,seq,sequencial_documento,padrao,atualizado)
    SELECT t.cnpj,t.ano,t.seq,t.sequencial_documento, ${CLASSIFICA}, a.atualizado
    FROM ${T_TEXTO} t JOIN ${T_ARQ} a USING(cnpj,ano,seq,sequencial_documento)
    WHERE ${FILTRO}`);
  console.log(`[bootstrap] ${r.rowCount} docs com padrão em ${((Date.now() - t0) / 1000).toFixed(0)}s (1 varredura)`);
} else {
  // INCREMENTAL — só o que mudou desde o último flag (ata/homologação nova). Invalida os processos afetados.
  const desde = (await q(`SELECT max(atualizado) m FROM ${T_FLAG}`)).rows[0].m;
  const novos = await q(`
    WITH chg AS (
      SELECT t.cnpj,t.ano,t.seq,t.sequencial_documento, ${CLASSIFICA} padrao, a.atualizado
      FROM ${T_TEXTO} t JOIN ${T_ARQ} a USING(cnpj,ano,seq,sequencial_documento)
      WHERE ${FILTRO} AND ($1::timestamptz IS NULL OR a.atualizado > $1)
    ), up AS (
      INSERT INTO ${T_FLAG}(cnpj,ano,seq,sequencial_documento,padrao,atualizado)
      SELECT cnpj,ano,seq,sequencial_documento,padrao,atualizado FROM chg
      ON CONFLICT(cnpj,ano,seq,sequencial_documento) DO UPDATE SET padrao=EXCLUDED.padrao, atualizado=EXCLUDED.atualizado
      RETURNING cnpj,ano,seq
    )
    SELECT DISTINCT cnpj,ano,seq FROM up`, [desde]);
  // INVALIDA a idempotência do extrator (reabre p/ RE-TRANSFORMAR) por DOIS eventos:
  //  (a) doc de resultado novo/atualizado (ata/homologação recém-chegada);
  //  (b) ITEM mudou — homologação OU DES-HOMOLOGAÇÃO (unit_homologado/situacao) sem doc novo. Heitor: vencedor
  //      des-homologado + um novo entra → a marca antiga tem que SAIR; o reconcile do extrator faz isso ao reabrir.
  const rDoc = await q(`DELETE FROM ${T_FEITAS} f USING (
      SELECT DISTINCT cnpj,ano,seq FROM ${T_FLAG} WHERE atualizado > $1) x
      WHERE f.cnpj=x.cnpj AND f.ano=x.ano AND f.seq=x.seq`, [desde]);
  const rItem = await q(`DELETE FROM ${T_FEITAS} f USING (
      SELECT DISTINCT cnpj,ano,seq FROM ${T_ITENS} WHERE data_atualizacao > $1) x
      WHERE f.cnpj=x.cnpj AND f.ano=x.ano AND f.seq=x.seq`, [desde]);
  console.log(`[refresh] ${novos.rows.length} docs novos/atualizados; reabertos p/ re-extração: ${rDoc.rowCount} (doc) + ${rItem.rowCount} (item homolog/des-homolog) em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
const proc = (await q(`SELECT count(DISTINCT (cnpj,ano,seq)) n FROM ${T_FLAG}`)).rows[0].n;
console.log(`${T_FLAG}: ${proc} processos com padrão de marca`);
await db.end();
