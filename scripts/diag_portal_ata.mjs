// O PORTAL ENTREGA ATA AO PNCP? — teste barato, a rodar ANTES de escrever qualquer leitor.
//
// Aprendido no e-lic (05/ago/2026): gastei tempo procurando quadro de vencedores num portal que não publica
// ata nenhuma no PNCP. São 11.072 processos, ZERO documentos do tipo 16, e os títulos que pareciam resultado
// eram "Ato que Autoriza a Contratação Direta", "Minuta da Ata" (que é o modelo do contrato, não a ata da
// sessão) e "Errata". O que o e-lic publica é planejamento: ETP, TR, DOD, DFD. A ata fica no portal.
//
// A regra que fica: para cada portal, primeiro perguntar SE existe ata; só depois COMO lê-la. Onde não há,
// o caminho é o coletor que vai ao portal — trabalho de coleta, não de parsing.
//
//   PORTAL="BNC" node scripts/diag_portal_ata.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PORTAL = process.env.PORTAL;
if (!PORTAL) { console.error('uso: PORTAL="BNC" node scripts/diag_portal_ata.mjs'); process.exit(2); }
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 });

const BASE = `app.processo_portal_real p
  JOIN arquivo_texto_sc d ON d.cnpj=p.cnpj AND d.ano=p.ano AND d.seq=p.seq AND d.chars>300
 WHERE p.portal_real=$1`;
// título de ATA DE SESSÃO de verdade; "minuta" é o modelo do contrato e NÃO conta
const E_ATA = `(d.titulo ~* 'ata|resultado|julgamento|vencedor|classifica' AND d.titulo !~* 'minuta|impugna|errata|registro de pre')`;

const { rows: [r] } = await db.query(`
  SELECT count(DISTINCT (d.cnpj,d.ano,d.seq)) processos_com_doc,
         count(*) FILTER (WHERE d.tipo_documento = '16') docs_tipo16,
         count(DISTINCT (d.cnpj,d.ano,d.seq)) FILTER (WHERE ${E_ATA}) proc_com_ata_no_titulo,
         count(DISTINCT (d.cnpj,d.ano,d.seq)) FILTER (WHERE d.texto ~* '\\mmarca\\M') proc_que_citam_marca
    FROM ${BASE}`, [PORTAL]);
console.log(`\n════ ${PORTAL} ════`);
console.table([r]);

console.log("títulos mais comuns:");
console.table((await db.query(`SELECT left(coalesce(d.titulo,'(sem titulo)'),44) titulo, count(*) n,
  round(avg(d.chars)) chars FROM ${BASE} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [PORTAL])).rows);

if (Number(r.proc_com_ata_no_titulo) > 0) {
  console.log("títulos que parecem ATA DE SESSÃO:");
  console.table((await db.query(`SELECT left(d.titulo,44) titulo, count(*) n FROM ${BASE} AND ${E_ATA}
    GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [PORTAL])).rows);
  const { rows: am } = await db.query(`SELECT d.ano,d.seq,d.titulo,
      regexp_replace(substr(d.texto, greatest(1, position('arca' in d.texto) - 160), 460),'\\s+',' ','g') trecho
     FROM ${BASE} AND ${E_ATA} AND d.texto ~* '\\mmarca\\M' ORDER BY random() LIMIT 2`, [PORTAL]);
  for (const a of am) { console.log(`\n-- ${a.ano}/${a.seq} · ${String(a.titulo).slice(0,40)} --`); console.log("   " + String(a.trecho || "").slice(0, 420)); }
} else {
  console.log(">>> NÃO HÁ ATA DE SESSÃO NO PNCP para este portal. Caminho = coletor que vai ao portal.");
}
await db.end();
