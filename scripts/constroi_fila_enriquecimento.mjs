// CONSTRÓI a fila materializada do enriquecimento — 1 VARREDURA (não 12). Os shards depois leem fatias LEVES daqui,
// em vez de cada um varrer os 344MB de arquivo_texto_sc. É o ajuste de DBA: materializar o work-list caro UMA vez.
// app.fila_enriquecimento(cnpj,ano,seq,nfases). Reexecutável (TRUNCATE+recarrega). node scripts/constroi_fila_enriquecimento.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const CRIACAO = [10, 7, 5, 6, 8, 4, 9, 3, 1, 2, 20, 16];

export async function constroiFila(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS app.fila_enriquecimento(cnpj text, ano int, seq int, nfases int, PRIMARY KEY(cnpj,ano,seq))`);
  // ═══ AS DUAS DATAS QUE DECIDEM SE O PROCESSO VOLTA (31/ago/2026) ═══
  //   texto_em  = o TEXTO-FONTE mais novo do processo (quando a re-extração mexeu nele)
  //   enriq_em  = a última vez que o ENRIQUECIMENTO gravou esse processo (NULL = inédito)
  // Sem elas o anti-join `NOT EXISTS` nunca revisitava processo já enriquecido, e a `PNIGP - Reextrai
  // Layout` produzia geometria melhor todo dia para um consumidor que não voltava. Medido em 31/ago: 228
  // processos com texto mais novo que o próprio enriquecimento, parados para sempre.
  //
  // ⚠️ POR QUE MATERIALIZAR, e não deixar o shard perguntar. A 1ª versão disto pôs uma subconsulta
  // correlacionada em `item_enriquecimento` dentro do WHERE do shard: **passou de 120 s** — por linha da
  // fila, e ainda vezes 12 shards. É exatamente o que o cabeçalho deste arquivo manda não fazer. Aqui é
  // UMA agregação set-based sobre as 2,2 M de linhas, e o shard vira `enriq_em IS NULL OR texto_em > enriq_em`
  // — comparação de duas colunas numa tabela de 239 k. Ver [[pnigp-dba-performance-neon]].
  await db.query(`ALTER TABLE app.fila_enriquecimento ADD COLUMN IF NOT EXISTS texto_em timestamptz`);
  await db.query(`ALTER TABLE app.fila_enriquecimento ADD COLUMN IF NOT EXISTS enriq_em timestamptz`);
  await db.query(`TRUNCATE app.fila_enriquecimento`);
  const t = Date.now();
  const r = await db.query(`INSERT INTO app.fila_enriquecimento(cnpj,ano,seq,nfases,texto_em)
    SELECT t.cnpj,t.ano,t.seq, count(DISTINCT a.tipo_documento_id), max(t.atualizado)
    FROM arquivo_texto_sc t JOIN arquivos_sc a USING(cnpj,ano,seq,sequencial_documento)
    WHERE t.chars>500 AND t.excluido_em IS NULL AND a.tipo_documento_id = ANY($1)
    GROUP BY t.cnpj,t.ano,t.seq`, [CRIACAO]);
  // carimba enriq_em em UMA agregação (não uma por linha) — ver o comentário das duas datas acima
  const u = await db.query(`UPDATE app.fila_enriquecimento f SET enriq_em = a.m
    FROM (SELECT cnpj, ano, seq, max(atualizado) m FROM app.item_enriquecimento GROUP BY 1,2,3) a
    WHERE a.cnpj=f.cnpj AND a.ano=f.ano AND a.seq=f.seq`);
  await db.query(`CREATE INDEX IF NOT EXISTS ix_fila_nfases ON app.fila_enriquecimento(nfases DESC)`);
  const volta = (await db.query(`SELECT count(*)::int n FROM app.fila_enriquecimento
    WHERE enriq_em IS NOT NULL AND texto_em > enriq_em`)).rows[0].n;
  console.log(`[fila] ${r.rowCount} processos em ${((Date.now() - t) / 1000).toFixed(0)}s (1 varredura)` +
    ` · ${r.rowCount - u.rowCount} inéditos · ${volta} re-extraídos depois de enriquecidos`);
  return r.rowCount;
}

if (process.argv[1] && process.argv[1].includes("constroi_fila_enriquecimento")) {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
  await constroiFila(db); await db.end();
}
