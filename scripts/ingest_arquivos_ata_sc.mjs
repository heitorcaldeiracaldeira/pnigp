// ARQUIVO DA ATA — o 🔴 buraco de docs/coleta-pncp-forma.md: "NUNCA COLETADO — e é onde a marca vive".
// Espelha /orgaos/{cnpj}/compras/{ano}/{seq}/atas/{sequencialAta}/arquivos → tabela arquivos_ata_sc.
// A lista de arquivos é a porta para o PDF da ata; o PDF é o único lugar com marca/modelo (o JSON cru da API
// tem 37 campos e nenhum é marca — provado 15/07). Aqui coletamos a LISTA e o URL; o download+parse do PDF é o passo seguinte.
//
// ═══ AS 4 REGRAS (docs/coleta-pncp-forma.md — cada uma custou horas em 15-16/07) ═══
//  1. NÃO DESCARTA NADA: `raw jsonb` por documento. O mapa tipado é conveniência; o raw é a garantia.
//  2. NENHUM FILTRO NA ENTRADA: todas as 64.184 atas, sem regex de título nem de tipo. Filtro = ponto cego.
//  3. FALHA NUNCA VIRA ZERO: usa getJson/Bloqueado de pncp_http.mjs. 429/WAF ABORTA a rodada — não grava zeros.
//     O único "não tem" legítimo é o que a API AFIRMA (204/404). A ata só é marcada feita se a chamada teve êxito.
//  4. Resumível SEM tabela paralela: o estado mora numa coluna da própria atas_sc (arquivos_em), não num
//     arquivo_ata_feitos — a memória do projeto manda MATAR os *_feitos, não criar mais um. Backfill uma vez.
//
// node scripts/ingest_arquivos_ata_sc.mjs        (CONC=4 DRY=1 LIMIT=n opcionais)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { getJson, Bloqueado } from "./pncp_http.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PNCP = "https://pncp.gov.br/api/pncp/v1";
const CONC = Number(process.env.CONC || 4);
const DRY = process.env.DRY === "1";
const LIMIT = Number(process.env.LIMIT || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// {cnpj}-1-{seq}/{ano}-{sequencialAta}  — validado: 64.184/64.184 casam (0 malformados)
const RE = /^(\d{14})-\d+-(\d+)\/(\d+)-(\d+)$/;

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 120000 });
  db.on("error", () => {});
  const q = async (s, p) => { let u; for (let i = 0; i < 6; i++) { try { return await db.query(s, p); } catch (e) { u = e; if (["22P05", "23502", "42703", "42P10"].includes(e.code)) throw e; await sleep(1200 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };

  await q(`CREATE TABLE IF NOT EXISTS arquivos_ata_sc (
    cnpj TEXT, ano INT, seq INT, sequencial_ata INT, sequencial_documento INT,
    cod_ibge TEXT, numero_controle_ata TEXT,
    tipo_documento_id INT, tipo_documento TEXT, titulo TEXT, url TEXT, data_publicacao TEXT,
    raw jsonb,
    atualizado timestamptz DEFAULT now(),
    PRIMARY KEY (cnpj, ano, seq, sequencial_ata, sequencial_documento))`);
  await q(`CREATE INDEX IF NOT EXISTS ix_arqata_nc ON arquivos_ata_sc (numero_controle_ata)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_arqata_tipo ON arquivos_ata_sc (tipo_documento_id)`);
  await q(`CREATE INDEX IF NOT EXISTS ix_arqata_cod ON arquivos_ata_sc (cod_ibge)`);
  // regra 4: estado na PRÓPRIA entidade, não num arquivo_ata_feitos
  await q(`ALTER TABLE atas_sc ADD COLUMN IF NOT EXISTS arquivos_em timestamptz`);

  const lim = LIMIT ? `LIMIT ${LIMIT}` : "";
  const atas = (await q(`SELECT numero_controle_ata, cod_ibge FROM atas_sc WHERE arquivos_em IS NULL ${lim}`)).rows;
  const total = (await q(`SELECT count(*)::int n FROM atas_sc`)).rows[0].n;
  console.log(`arquivos da ata: ${atas.length.toLocaleString()} pendentes de ${total.toLocaleString()} · conc ${CONC}${DRY ? " · DRY" : ""}`);

  let i = 0, done = 0, comArq = 0, docs = 0, marcas = 0;
  let abortado = null;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < atas.length && !abortado) {
      const a = atas[i++];
      const m = RE.exec(a.numero_controle_ata || "");
      if (!m) { continue; }   // não deveria acontecer (0 malformados), mas não marca feito se acontecer
      const [, cnpj, seqS, anoS, saS] = m;
      const seq = Number(seqS), ano = Number(anoS), sa = Number(saS);
      const url = `${PNCP}/orgaos/${cnpj}/compras/${ano}/${seq}/atas/${sa}/arquivos`;

      let arqs;
      try { arqs = await getJson(url); }                       // 204/404 → []; 429/WAF/5xx esgotado → Bloqueado
      catch (e) { if (e instanceof Bloqueado) { abortado = e.message; break; } continue; }  // RespostaInvalida: pula esta ata, retenta no re-run

      if (DRY) { if (arqs.length) comArq++; docs += arqs.length; if (++done % 200 === 0) process.stdout.write(`  ${done}/${atas.length}\r`); continue; }
      try {
        for (const d of arqs) {
          await q(`INSERT INTO arquivos_ata_sc
            (cnpj,ano,seq,sequencial_ata,sequencial_documento,cod_ibge,numero_controle_ata,tipo_documento_id,tipo_documento,titulo,url,data_publicacao,raw)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            ON CONFLICT (cnpj,ano,seq,sequencial_ata,sequencial_documento) DO UPDATE SET
              tipo_documento_id=EXCLUDED.tipo_documento_id, tipo_documento=EXCLUDED.tipo_documento,
              titulo=EXCLUDED.titulo, url=EXCLUDED.url, data_publicacao=EXCLUDED.data_publicacao,
              raw=EXCLUDED.raw, atualizado=now()`,
            [cnpj, ano, seq, sa, Number(d.sequencialDocumento) || 0, a.cod_ibge, a.numero_controle_ata,
             d.tipoDocumentoId != null ? Number(d.tipoDocumentoId) : null,
             String(d.tipoDocumentoNome || d.tipoDocumentoDescricao || "") || null,
             String(d.titulo || "").slice(0, 400) || null,
             d.url || d.uri || null,
             d.dataPublicacaoPncp ? String(d.dataPublicacaoPncp).slice(0, 19) : null,
             JSON.stringify(d)]);
          docs++;
          if (/marca|modelo/i.test(d.titulo || "")) marcas++;
        }
        // regra 3: só marca feita DEPOIS de gravar com êxito (0 arquivos é legítimo — a API afirmou via lista vazia)
        await q(`UPDATE atas_sc SET arquivos_em=now() WHERE numero_controle_ata=$1`, [a.numero_controle_ata]);
        if (arqs.length) comArq++;
      } catch { /* deixa p/ o próximo run */ }
      if (++done % 100 === 0) process.stdout.write(`  ${done}/${atas.length} · ${comArq} c/arquivo · ${docs} docs\r`);
    }
  }));

  if (abortado) console.log(`\n🔴 ABORTADO (regra 3 — não gravar zeros): ${abortado}`);
  const s = (await q(`SELECT count(*)::int docs, count(DISTINCT numero_controle_ata)::int atas,
    count(*) FILTER (WHERE tipo_documento_id=11)::int arp FROM arquivos_ata_sc`)).rows[0];
  const falta = (await q(`SELECT count(*)::int n FROM atas_sc WHERE arquivos_em IS NULL`)).rows[0].n;
  console.log(`\n✔ arquivos_ata_sc: ${s.docs.toLocaleString()} documentos · ${s.atas.toLocaleString()} atas c/arquivo · ${s.arp.toLocaleString()} "Ata de Registro de Preço" · faltam ${falta.toLocaleString()} atas`);
  await db.end();
  if (abortado) process.exit(1);   // grita: a rodada não completou
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
