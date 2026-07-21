// AUDITORIA · ESTUDA TEMPLATES — o alicerce (Heitor: "precisávamos ver os templates de todos os documentos de
// todos os portais"). Cada portal GERA o doc num template próprio; a extração de marca depende de conhecer o layout.
// Para cada `gerador`, amostra os docs de RESULTADO e mostra a ASSINATURA do template (como Item/Valor/Marca/Modelo
// aparecem) + a taxa de hit dos padrões A/B. Saída = catálogo que dirige o extrator. node scripts/auditoria/estuda_templates.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const UF = (process.env.UF || "sc").toLowerCase();
const TEXTO = `arquivo_texto_${UF}`;
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 });
const q = async (s, p) => (await db.query(s, p)).rows;
const RES = `titulo ~* '(homolog|ata de|adjudica|resultado|vencedor|registro de pre)'`;

// assinatura do template = trecho ao redor da 1ª ocorrência de "marca"
function assinatura(txt) {
  const i = txt.toLowerCase().indexOf("marca");
  if (i < 0) return "(sem 'marca' no texto)";
  return txt.slice(Math.max(0, i - 90), i + 90).replace(/\s+/g, " ").trim();
}

const geradores = await q(`SELECT gerador, count(*) docs, count(distinct (cnpj,ano,seq)) procs
  FROM ${TEXTO} WHERE ${RES} AND chars>500 GROUP BY 1 ORDER BY 2 DESC`);
console.log("== CATÁLOGO DE TEMPLATES por gerador (docs de resultado) ==\n");
for (const g of geradores) {
  const nome = g.gerador || "(nulo)";
  // taxa dos padrões A/B nesse gerador
  const hit = (await q(`SELECT
      count(*) filter(where texto ~* 'marca/fabricante') a,
      count(*) filter(where texto ~* 'marca\\s*:.{0,40}modelo') b,
      count(*) filter(where texto ~* 'marca' and texto !~* 'marca/fabricante' and texto !~* 'marca\\s*:.{0,40}modelo') outro,
      count(*) filter(where texto !~* 'marca') sem
    FROM ${TEXTO} WHERE ${RES} AND chars>500 AND coalesce(gerador,'(nulo)')=$1`, [nome]))[0];
  const amostra = (await q(`SELECT texto FROM ${TEXTO} WHERE ${RES} AND chars>500 AND coalesce(gerador,'(nulo)')=$1 AND texto ~* 'marca' LIMIT 1`, [nome]))[0];
  console.log(`■ ${nome}  (${g.docs} docs / ${g.procs} procs)  → A:${hit.a} B:${hit.b} outro-fmt:${hit.outro} sem-marca:${hit.sem}`);
  console.log(`   template: ${amostra ? assinatura(amostra.texto) : "(sem amostra c/ marca)"}\n`);
}
await db.end();
