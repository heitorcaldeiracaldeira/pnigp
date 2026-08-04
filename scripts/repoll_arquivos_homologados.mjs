// RE-POLL DOS DOCUMENTOS — re-consulta /arquivos no PNCP para TODO processo homologado e traz o que não temos.
//
// POR QUE PRECISA EXISTIR: `ingest_arquivos_sc.mjs` busca a lista de documentos UMA vez por processo e grava um
// marcador permanente (`arquivos_proc_feitos`); a seleção dele é `WHERE f.numero_controle IS NULL`. Processo já
// visitado nunca mais é re-olhado — mesmo quando homologa depois e o órgão anexa a ata/termo de homologação.
// O PNCP é um LOG ([[pnigp-pncp-e-log-nao-estado]]): a lista de documentos CRESCE ao longo do processo.
//
// O que faz: fila = todos os processos homologados, priorizando quem NÃO tem documento de resultado; re-consulta
// o endpoint; INSERT só do que é novo (ON CONFLICT atualiza título/uri — nunca apaga, espelho fiel, Lei 1).
// Resumível em tabela própria (`app.repoll_arquivos_feitos`) para não mexer no marcador da primeira passada.
// Robusto a 429 (o PNCP rate-limita ~30 req). CONC baixo de propósito.
//   node scripts/repoll_arquivos_homologados.mjs        [CONC=2] [LIMIT=0] [PRIO=1]
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const CONC = Number(process.env.CONC || 2);
const LIMIT = Number(process.env.LIMIT || 0);
const SO_PRIO = process.env.PRIO || null;   // '1' = só quem não tem doc de resultado
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
// tipos onde o RESULTADO vive: 16 Outros Documentos (é onde a ata realmente entra), 11 ARP, 19 minuta ARP
const TIPOS_RESULTADO = "16,11,19";

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
  return null;   // esgotou — NÃO marca feito, volta no próximo run
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 300000 });
  db.on("error", () => {});
  const q = async (s, p) => { for (let i = 0; ; i++) { try { return await db.query(s, p); } catch (e) { if (i >= 2) throw e; await sleep(1200 * (i + 1)); } } };

  await q(`CREATE TABLE IF NOT EXISTS app.repoll_arquivos_feitos(
    numero_controle text PRIMARY KEY, n_antes int, n_depois int, novos int, feito_em timestamptz DEFAULT now())`);

  const t0 = Date.now();
  console.log("montando a fila (processos homologados, prioridade: sem documento de resultado primeiro)…");
  const procs = (await q(`
    with h as (select distinct i.cnpj,i.ano,i.seq from itens_sc i where i.unit_homologado>0)
    select c.cnpj,c.ano,c.seq,c.cod_ibge,c.numero_controle,
      (select count(*) from arquivos_sc a where a.cnpj=c.cnpj and a.ano=c.ano and a.seq=c.seq) n_antes,
      case when not exists(select 1 from arquivos_sc a where a.cnpj=c.cnpj and a.ano=c.ano and a.seq=c.seq
                             and a.tipo_documento_id in (${TIPOS_RESULTADO})) then 1 else 2 end prio
    from h join contratacoes_sc c using(cnpj,ano,seq)
    where not exists(select 1 from app.repoll_arquivos_feitos f where f.numero_controle=c.numero_controle)
    order by prio, c.ano desc ${LIMIT ? `limit ${LIMIT}` : ""}`)).rows;
  const fila = SO_PRIO ? procs.filter((p) => String(p.prio) === SO_PRIO) : procs;
  console.log(`fila: ${fila.length.toLocaleString()} processos homologados a re-consultar · conc ${CONC}`);
  console.log(`  prio 1 (sem doc de resultado): ${fila.filter((p) => p.prio === 1).length.toLocaleString()}`);

  let i = 0, done = 0, novosTot = 0, comNovo = 0, ganhouResultado = 0, falhas = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < fila.length) {
      const e = fila[i++];
      const arqs = await getArq(e.cnpj, e.ano, e.seq);
      if (arqs === null) { falhas++; continue; }
      try {
        let novos = 0, temResultadoNovo = false;
        if (arqs.length) {
          const sd = [], tdi = [], td = [], ti = [], uri = [], sa = [], dp = [];
          for (const a of arqs) {
            sd.push(Number(a.sequencialDocumento) || 0);
            tdi.push(a.tipoDocumentoId != null ? Number(a.tipoDocumentoId) : null);
            td.push(String(a.tipoDocumentoNome || a.tipoDocumentoDescricao || "") || null);
            ti.push(String(a.titulo || "").slice(0, 300) || null);
            uri.push(a.uri || a.url || null);
            sa.push(a.statusAtivo === true);
            dp.push(a.dataPublicacaoPncp ? String(a.dataPublicacaoPncp).slice(0, 19) : null);
          }
          // xmax=0 identifica a linha que foi INSERIDA (documento novo) e não a que só foi atualizada
          const r = await q(`INSERT INTO arquivos_sc (cnpj,ano,seq,cod_ibge,sequencial_documento,tipo_documento_id,tipo_documento,titulo,uri,status_ativo,data_publicacao)
            SELECT $1,$2,$3,$4, t.* FROM unnest($5::int[],$6::int[],$7::text[],$8::text[],$9::text[],$10::bool[],$11::text[])
              AS t(sequencial_documento,tipo_documento_id,tipo_documento,titulo,uri,status_ativo,data_publicacao)
            ON CONFLICT (cnpj,ano,seq,sequencial_documento) DO UPDATE SET tipo_documento=EXCLUDED.tipo_documento,
              titulo=EXCLUDED.titulo, uri=EXCLUDED.uri, status_ativo=EXCLUDED.status_ativo, atualizado=now()
            RETURNING (xmax=0) inserido, tipo_documento_id`, [e.cnpj, e.ano, e.seq, e.cod_ibge, sd, tdi, td, ti, uri, sa, dp]);
          for (const row of r.rows) if (row.inserido) { novos++; if ([16, 11, 19].includes(row.tipo_documento_id)) temResultadoNovo = true; }
        }
        await q(`INSERT INTO app.repoll_arquivos_feitos(numero_controle,n_antes,n_depois,novos) VALUES ($1,$2,$3,$4)
          ON CONFLICT (numero_controle) DO UPDATE SET n_depois=EXCLUDED.n_depois, novos=EXCLUDED.novos, feito_em=now()`,
          [e.numero_controle, e.n_antes, arqs.length, novos]);
        if (novos) { comNovo++; novosTot += novos; }
        if (temResultadoNovo && e.prio === 1) ganhouResultado++;
      } catch { falhas++; }
      if (++done % 50 === 0) {
        const min = (Date.now() - t0) / 60000;
        process.stdout.write(`\r  ${done}/${fila.length} · ${novosTot} docs novos em ${comNovo} procs · ${ganhouResultado} ganharam doc de resultado · ${(done / min).toFixed(0)}/min · falhas ${falhas}`);
      }
    }
  }));
  console.log(`\n\n✔ re-poll: ${done} processos · ${novosTot} documentos novos em ${comNovo} processos · ${ganhouResultado} passaram a ter documento de resultado · ${falhas} falhas (voltam no próximo run)`);
  console.log("\n=== documentos novos por tipo ===");
  console.table((await q(`select a.tipo_documento_id tdi, coalesce(a.tipo_documento,'(null)') tipo, count(*) docs
    from arquivos_sc a where a.atualizado > $1 group by 1,2 order by 3 desc limit 15`, [new Date(t0)])).rows);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
