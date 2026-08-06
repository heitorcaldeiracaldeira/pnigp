// TODOS os documentos que um portal leva ao PNCP, agrupados por título NORMALIZADO.
//
// Aprendido na BNC (05/ago/2026): contar por título exato ESCONDE a ata. Os documentos de resultado da BNC
// se chamam "VencedoresProcessoAdjudicacao_41b2024041" e "VencedoresProcessoFinal15120250818145512" — o nome
// carrega id e carimbo de data, então cada um é único, aparece uma vez e nunca sobe no ranking. O EDITAL, que
// tem sempre o mesmo nome, ocupa o topo e dá a impressão de que só há edital. Tirando dígito e carimbo, a
// família aparece.
//
//   PORTAL="BNC" node scripts/diag_portal_docs.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const PORTAL = process.env.PORTAL;
if (!PORTAL) { console.error('uso: PORTAL="BNC" node scripts/diag_portal_docs.mjs'); process.exit(2); }
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 });

// tira dígitos, extensão e separadores: "VencedoresProcessoFinal15120250818145512" -> "vencedoresprocessofinal"
const FAMILIA = `lower(regexp_replace(regexp_replace(coalesce(d.titulo,'(sem titulo)'), '\\.(pdf|docx?|xlsx?|txt)$', '', 'i'), '[0-9_\\-\\.\\s]+', '', 'g'))`;

console.log(`\n════ ${PORTAL} — todos os documentos levados ao PNCP ════`);
console.table((await db.query(`
  SELECT ${FAMILIA} familia,
         count(*) documentos,
         count(DISTINCT (d.cnpj,d.ano,d.seq)) processos,
         round(avg(d.chars)) chars_medio,
         count(*) FILTER (WHERE d.texto ~* '\\mmarca\\M') citam_marca
    FROM app.processo_portal_real p
    JOIN arquivo_texto_sc d ON d.cnpj=p.cnpj AND d.ano=p.ano AND d.seq=p.seq AND d.chars>300
   WHERE p.portal_real=$1
   GROUP BY 1 HAVING count(*) >= 5 ORDER BY 5 DESC, 2 DESC LIMIT 30`, [PORTAL])).rows);
await db.end();
