// AUDITORIA · view do livro-razão — app.item_auditoria_${uf}. UNE as fontes timestampadas para que CADA campo
// da conciliação tenha proveniência no tempo: "campo ← ação ← fonte ← data/hora". Sem materializar (VIEW leve
// por processo). Responde "de onde veio o enriquecimento + dados da API + marca/modelo, e quando".
//   node scripts/auditoria/cria_view_auditoria.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "sc").toLowerCase();
const ITENS = `itens_${UF}`, ARQ = `arquivos_${UF}`, ENR = `app.item_enriquecimento`, CONF = `app.item_marca_conferida_${UF}`;
const VIEW = `app.item_auditoria_${UF}`;
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, statement_timeout: 120000 });

await db.query(`CREATE OR REPLACE VIEW ${VIEW} AS
  -- (1) API PNCP — inclusão do item: descrição curta + unidade
  SELECT cnpj,ano,seq, numero::text numero, data_inclusao::timestamptz ts, 'inclusao_item' acao,
         'descricao_api' campo, descricao valor, 'PNCP API /itens' fonte, NULL::text ref
  FROM ${ITENS}
  UNION ALL
  -- (1b) API PNCP — VALOR DE REFERÊNCIA (estimativa art. 23, da pesquisa de preços/ETP): é contra ele que se mede sobrepreço
  SELECT cnpj,ano,seq, numero::text, data_inclusao::timestamptz, 'valor_referencia',
         'unit_estimado', unit_estimado::text, 'PNCP API /itens (estimativa art.23)', NULL::text
  FROM ${ITENS} WHERE unit_estimado IS NOT NULL
  UNION ALL
  -- (2) API PNCP — homologação: preço + vencedor (é aqui que a marca passa a existir)
  SELECT cnpj,ano,seq, numero::text, data_atualizacao::timestamptz, 'homologacao',
         'unit_homologado+vencedor', unit_homologado::text||' | '||coalesce(cnpj_fornecedor,''), 'PNCP API /resultados', cnpj_fornecedor
  FROM ${ITENS} WHERE unit_homologado IS NOT NULL
  UNION ALL
  -- (3) Documento publicado no processo (edital/TR/ETP/ata…)
  SELECT cnpj,ano,seq, NULL, data_publicacao::timestamptz, 'doc_publicado',
         'documento', tipo_documento, 'PNCP arquivo', tipo_documento_id::text
  FROM ${ARQ}
  UNION ALL
  -- (4) Enriquecimento — a SPEC completa vinda do documento (não a descrição truncada da API)
  SELECT cnpj,ano,seq, numero::text, atualizado::timestamptz, 'descricao_enriquecida',
         'descricao_documento', left(descricao_documento,200), 'documento: '||coalesce(fonte_documento,'?'), fonte_tipo_id::text
  FROM ${ENR} WHERE descricao_documento IS NOT NULL
  UNION ALL
  -- (5) Marca + modelo — extraída do doc de resultado, ancorada por item+valor (reconcile)
  SELECT cnpj,ano,seq, numero::text, atualizado::timestamptz, 'marca_extraida',
         'marca+modelo', marca||coalesce(' / '||modelo,''), coalesce(portal,'')||' '||coalesce(fonte_titulo,''), fornecedor_cnpj
  FROM ${CONF}`);
console.log(`view ${VIEW} criada — livro-razão de ações por item (campo ← ação ← fonte ← ts).`);

// amostra: a linha do tempo de UM processo que tem marca (prova de proveniência)
const ex = (await db.query(`SELECT cnpj,ano,seq FROM ${CONF} LIMIT 1`)).rows[0];
if (ex) {
  console.log(`\n== linha do tempo — processo ${ex.cnpj}/${ex.ano}/${ex.seq} ==`);
  const r = (await db.query(`SELECT to_char(ts,'YYYY-MM-DD HH24:MI') quando, numero, acao, campo, left(valor,48) valor, fonte
    FROM ${VIEW} WHERE cnpj=$1 AND ano=$2 AND seq=$3 ORDER BY ts NULLS LAST, numero LIMIT 20`, [ex.cnpj, ex.ano, ex.seq])).rows;
  console.table(r);
}
await db.end();
