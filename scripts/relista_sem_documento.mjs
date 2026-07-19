// RE-LISTAGEM FOCADA — re-busca /arquivos SÓ de processos que ficaram SEM nenhum documento no espelho.
// Ignora a flag arquivos_proc_feitos (que já os marcou "listados") e vai direto ao PNCP: o que voltar com documento
// era GAP de listagem (falha transitória marcada como feita); o que voltar vazio de novo é REAL (sem doc publicado).
// Fecha o buraco sem re-varrer os 240 mil que já têm documento.
//   MODALIDADES=4,5,6,7 node scripts/relista_sem_documento.mjs     (default: competitivas — licitação EXIGE edital)
//   MODALIDADES=8,9      node scripts/relista_sem_documento.mjs     (dispensa/inexigibilidade)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const CONC = Number(process.env.CONC || 2);
const MODALIDADES = process.env.MODALIDADES || "4,5,6,7";   // competitivas por padrão
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
  return null;   // esgotou — não conclui, retenta no re-run
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  const q = async (s, p) => { for (let i = 0; ; i++) { try { return await db.query(s, p); } catch (e) { if (i >= 2) throw e; await sleep(1200 * (i + 1)); } } };

  const procs = (await q(`SELECT c.cnpj, c.ano, c.seq, c.cod_ibge, c.numero_controle, c.modalidade
    FROM contratacoes_sc c
    WHERE c.modalidade_id IN (${MODALIDADES})
      AND NOT EXISTS (SELECT 1 FROM arquivos_sc a WHERE a.cnpj=c.cnpj AND a.ano=c.ano AND a.seq=c.seq)`)).rows;
  console.log(`re-listando ${procs.length.toLocaleString()} processos SEM documento (modalidades ${MODALIDADES}) · conc ${CONC}\n`);

  let recuperados = 0, aindaVazios = 0, falhas = 0, docs = 0, i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < procs.length) {
      const e = procs[i++];
      const arqs = await getArq(e.cnpj, e.ano, e.seq);
      if (arqs === null) { falhas++; continue; }
      try {
        for (const a of arqs) {
          await q(`INSERT INTO arquivos_sc (cnpj,ano,seq,sequencial_documento,cod_ibge,tipo_documento_id,tipo_documento,titulo,uri,status_ativo,data_publicacao)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (cnpj,ano,seq,sequencial_documento) DO UPDATE SET tipo_documento=EXCLUDED.tipo_documento, titulo=EXCLUDED.titulo, uri=EXCLUDED.uri, status_ativo=EXCLUDED.status_ativo, atualizado=now()`,
            [e.cnpj, e.ano, e.seq, Number(a.sequencialDocumento) || 0, e.cod_ibge, a.tipoDocumentoId != null ? Number(a.tipoDocumentoId) : null,
             String(a.tipoDocumentoNome || a.tipoDocumentoDescricao || "") || null, String(a.titulo || "").slice(0, 300) || null,
             a.uri || a.url || null, a.statusAtivo === true, a.dataPublicacaoPncp ? String(a.dataPublicacaoPncp).slice(0, 19) : null]);
        }
        await q(`INSERT INTO arquivos_proc_feitos (numero_controle,n) VALUES ($1,$2) ON CONFLICT (numero_controle) DO UPDATE SET n=EXCLUDED.n, feito_em=now()`, [e.numero_controle, arqs.length]);
        if (arqs.length) { recuperados++; docs += arqs.length; } else aindaVazios++;
      } catch { falhas++; }
      if ((recuperados + aindaVazios + falhas) % 50 === 0) process.stdout.write(`  ${recuperados + aindaVazios + falhas}/${procs.length} · ${recuperados} recuperados\r`);
    }
  }));
  console.log(`\n✔ re-listagem concluída (modalidades ${MODALIDADES}):`);
  console.log(`  ${recuperados} RECUPERADOS (era gap de listagem) · ${docs} documentos novos`);
  console.log(`  ${aindaVazios} ainda vazios (sem doc publicado no PNCP — real) · ${falhas} falhas de rede (retentar)`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
