// AUDITORIA · CONSOLIDA MARCA — o núcleo, SET-BASED e EXTREMAMENTE LEVE (Heitor: "refaça toda a lógica, leve").
// A marca crua já vive em tabelas PEQUENAS, uma por template/via:
//   · item_marca_${uf}          — template C (COLUNAR), já parseado dos portais
//   · app.item_marca_padrao_${uf} — templates A/B (inline), extraídos do texto (extrai_marca_padrao)
//   · app.item_marca_visao_${uf}  — imagem/OCR (só os ~378 docs sem texto)
// A CONSOLIDAÇÃO (app.item_marca_conferida) é 1 QUERY: une as vias e ANCORA cada marca ao item por VALOR vs a
// homologação ATUAL de itens_sc. Como ancora no estado ATUAL, RECONCILE é automático: des-homologou → o valor
// não casa mais → a marca sai sozinha no rebuild. Sem round-trip por linha, sem varrer os 12GB. Roda em segundos.
//   node scripts/auditoria/consolida_marca.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "sc").toLowerCase();
const ITENS = `itens_${UF}`, COLUNAR = `item_marca_${UF}`;
const PADRAO = `app.item_marca_padrao_${UF}`, VISAO = `app.item_marca_visao_${UF}`, CONF = `app.item_marca_conferida_${UF}`;
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 });
const q = (s) => db.query(s);

await q(`CREATE TABLE IF NOT EXISTS ${PADRAO}(cnpj text,ano int,seq int,marca text,valor numeric,padrao text,atualizado timestamptz DEFAULT now())`);
await q(`CREATE INDEX IF NOT EXISTS ix_marcapadrao_proc ON ${PADRAO}(cnpj,ano,seq)`);

const t = Date.now();
// 1 QUERY: une as vias cruas → ancora ao item por valor (homologação ATUAL) → 1 marca por item (por prioridade de via)
await q(`
  BEGIN;
  DELETE FROM ${CONF};
  INSERT INTO ${CONF}(cnpj,ano,seq,numero,marca,modelo,fornecedor_cnpj,valor,marca_generica,cnpj_ok,valor_ok,portal,fonte_titulo,atualizado)
  SELECT DISTINCT ON (i.cnpj,i.ano,i.seq,i.numero)
    i.cnpj,i.ano,i.seq, i.numero::text, s.marca, nullif(btrim(s.modelo),''), i.cnpj_fornecedor, i.unit_homologado,
    false, false, true, 'consolidado', s.via, now()
  FROM (
    SELECT cnpj,ano,seq, marca, modelo, valor::numeric v, 'C:colunar' via, 1 pri FROM ${COLUNAR}
    UNION ALL
    SELECT cnpj,ano,seq, marca, NULL::text modelo, valor::numeric v, 'AB:'||coalesce(padrao,'?') via, 2 pri FROM ${PADRAO}
    UNION ALL
    SELECT cnpj,ano,seq, marca, modelo,
      (CASE WHEN replace(replace(valor_unitario::text,'.',''),',','.') ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN replace(replace(valor_unitario::text,'.',''),',','.')::numeric END) v, 'V:visao' via, 3 pri FROM ${VISAO}
  ) s
  JOIN ${ITENS} i
    ON i.cnpj=s.cnpj AND i.ano=s.ano AND i.seq=s.seq
   AND i.unit_homologado IS NOT NULL
   AND s.v IS NOT NULL AND abs(s.v - i.unit_homologado) < 0.02
  WHERE s.marca IS NOT NULL AND length(btrim(s.marca))>=2
    AND s.marca !~* '^(servi|material|pe[çc]a|diversos|v[aá]rios|nacional|importad|pr[oó]pri|sem marca|conforme|generic|n/?c|n/?a|fabricante|n[aã]o inform|engenharia|obra)'
  ORDER BY i.cnpj,i.ano,i.seq,i.numero, s.pri, length(s.marca) DESC;
  COMMIT;`);

const r = (await q(`SELECT count(*) itens, count(distinct (cnpj,ano,seq)) procs FROM ${CONF} WHERE portal='consolidado'`)).rows[0];
const via = (await q(`SELECT fonte_titulo via, count(*) n FROM ${CONF} WHERE portal='consolidado' GROUP BY 1 ORDER BY 2 DESC`)).rows;
console.log(`consolidado em ${((Date.now()-t)/1000).toFixed(1)}s (1 query set-based) → ${r.itens} itens · ${r.procs} procs`);
console.table(via);
await db.end();
