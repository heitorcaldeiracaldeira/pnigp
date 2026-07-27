// AUDITORIA · AO HOMOLOGAR — orquestrador DIRIGIDO POR EVENTO. O PNCP é um LOG ([[pnigp-pncp-e-log-nao-estado]]);
// quando um item HOMOLOGA (ou DES-HOMOLOGA), esta lógica dispara a cadeia inteira para aquele processo:
//   1) detecta o evento por watermark em itens_sc.data_atualizacao (homolog/retificação/des-homolog);
//   2) REABRE o processo (invalida a idempotência) → o extrator RECONCILIA a marca (novo vencedor entra, antigo sai);
//   3) se o doc de resultado NÃO está no acervo, ENFILEIRA o fetch do portal (app.fetch_fila) — baixa uma vez;
//   4) marca o processo p/ RE-ENRIQUECER a descrição;
//   5) avança o watermark.
// O extrator/enriquecedor (tasks autônomas) consomem a fila reaberta. Idempotente. Entra no ciclo de ingestão.
//   node scripts/auditoria/ao_homologar.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "sc").toLowerCase();
const ITENS = `itens_${UF}`, ARQ = `arquivos_${UF}`;
const FEITAS = `app.marca_padrao_feitas_${UF}`, FETCH = `app.fetch_fila_${UF}`;
const WM_KEY = `ao_homologar_${UF}`;
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 590000 });
const q = (s, p) => db.query(s, p);

await q(`CREATE TABLE IF NOT EXISTS app.auditoria_watermark(chave text PRIMARY KEY, ts timestamptz)`);
await q(`CREATE TABLE IF NOT EXISTS ${FETCH}(cnpj text, ano int, seq int, motivo text, criado timestamptz DEFAULT now(),
  status text DEFAULT 'pendente', PRIMARY KEY(cnpj,ano,seq))`);
await q(`CREATE TABLE IF NOT EXISTS ${FEITAS}(cnpj text,ano int,seq int,primary key(cnpj,ano,seq))`);
// doc de resultado é ARP/ata/homologação/adjudicação (regex sobre o título do arquivo)
const RES_REGEX = `(homolog|ata de|adjudica|resultado|vencedor|registro de pre)`;

// DOIS sinais de gatilho (um watermark cada):
//  (a) data_atualizacao — o PNCP mudou o item (retificação/des-homolog). Espelho FIEL, nunca escrito com proxy.
//  (b) item_resultado.atualizado — resultado recém-INGERIDO (homologação nova via drenagem). ESSENCIAL: o cat 5 do
//      consumidor grava unit_homologado mas NÃO bumpa data_atualizacao; sem este sinal ~41% das homologações
//      drenadas ficam SILENCIOSAS (nunca re-enriquecem marca/descrição). Usa o `atualizado` que já existe — sem proxy.
const WM_KEY_R = `ao_homologar_res_${UF}`, RES = `item_resultado_${UF}`, LOTE = `app.ao_homologar_lote_${UF}`;
await q(`CREATE TABLE IF NOT EXISTS ${LOTE}(cnpj text,ano int,seq int,primary key(cnpj,ano,seq))`);
const wm = (await q(`SELECT ts FROM app.auditoria_watermark WHERE chave=$1`, [WM_KEY])).rows[0]?.ts || null;
const wmR = (await q(`SELECT ts FROM app.auditoria_watermark WHERE chave=$1`, [WM_KEY_R])).rows[0]?.ts || null;
console.log(`[ao_homologar UF=${UF}] wm(data_atualizacao)=${wm || "(início)"} · wm(resultado ingerido)=${wmR || "(início)"}`);

// 1) EVENTOS — a UNIÃO dos dois sinais, materializada em um lote (tabela derivada, TRUNCATE ok)
await q(`TRUNCATE ${LOTE}`);
await q(`INSERT INTO ${LOTE}(cnpj,ano,seq)
    SELECT DISTINCT cnpj,ano,seq FROM ${ITENS} WHERE ($1::timestamptz IS NULL OR data_atualizacao > $1)
    UNION
    SELECT DISTINCT cnpj,ano,seq FROM ${RES}   WHERE ($2::timestamptz IS NOT NULL AND atualizado > $2)  -- null = 1ª vez: RES OFF (não reprocessa 1,6M); wmR é semeado abaixo
  ON CONFLICT DO NOTHING`, [wm, wmR]);
const nEv = (await q(`SELECT count(*)::int n FROM ${LOTE}`)).rows[0].n;
console.log(`eventos de homologação/retificação (2 sinais): ${nEv} processos`);

if (nEv) {
  // 2) REABRE (invalida idempotência) → extrator reconcilia a marca
  const rReabre = await q(`DELETE FROM ${FEITAS} f USING ${LOTE} l WHERE f.cnpj=l.cnpj AND f.ano=l.ano AND f.seq=l.seq`);
  // 4) RE-ENRIQUECER: remove do enriquecimento os reabertos (voltam pra fila do enriquecedor)
  const rEnr = await q(`DELETE FROM app.item_enriquecimento e USING ${LOTE} l WHERE e.cnpj=l.cnpj AND e.ano=l.ano AND e.seq=l.seq`);
  // 3) FETCH: homologado SEM doc de resultado no acervo → enfileira p/ baixar do portal
  const rFetch = await q(`
    INSERT INTO ${FETCH}(cnpj,ano,seq,motivo)
    SELECT DISTINCT i.cnpj,i.ano,i.seq, 'homologado sem doc de resultado no acervo'
    FROM ${ITENS} i JOIN ${LOTE} l USING (cnpj,ano,seq)
    WHERE i.unit_homologado IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ${ARQ} a WHERE a.cnpj=i.cnpj AND a.ano=i.ano AND a.seq=i.seq AND a.titulo ~* '${RES_REGEX}')
    ON CONFLICT(cnpj,ano,seq) DO NOTHING`);
  console.log(`  reabertos p/ reconcile de marca: ${rReabre.rowCount}`);
  console.log(`  reabertos p/ re-enriquecer descrição: ${rEnr.rowCount}`);
  console.log(`  enfileirados p/ FETCH do portal (doc fora do acervo): ${rFetch.rowCount}`);
}

// 5) AVANÇA os DOIS watermarks
const novoWm = (await q(`SELECT max(data_atualizacao) m FROM ${ITENS}`)).rows[0].m;
const novoWmR = (await q(`SELECT max(atualizado) m FROM ${RES}`)).rows[0].m;
if (novoWm) await q(`INSERT INTO app.auditoria_watermark(chave,ts) VALUES($1,$2) ON CONFLICT(chave) DO UPDATE SET ts=EXCLUDED.ts`, [WM_KEY, novoWm]);
if (novoWmR) await q(`INSERT INTO app.auditoria_watermark(chave,ts) VALUES($1,$2) ON CONFLICT(chave) DO UPDATE SET ts=EXCLUDED.ts`, [WM_KEY_R, novoWmR]);
console.log(`watermarks avançados: data_atualizacao→${novoWm} · resultado→${novoWmR}. Enriquecedores consomem a fila reaberta.`);
await db.end();
