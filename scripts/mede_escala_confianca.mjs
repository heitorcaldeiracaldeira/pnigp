// MEDE a escala de confiança do enriquecimento — a afirmação em aberto é que `media` ACERTA MAIS que `alta`,
// o que tornaria o carimbo inútil (ou pior: enganoso para quem filtra por alta).
//
// A MÉTRICA: cobertura = quantas das palavras significativas (>=4 letras, sem stopword) que a API declara
// na descrição do item aparecem no bloco recortado do documento. É a mesma régua do comentário de 08/ago
// em enriquece_item_documento.mjs, para o número ser comparável.
//
// NÃO altera nada. Só lê. AMOSTRA=n por TABLESAMPLE (padrão 4%). node scripts/mede_escala_confianca.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = (process.env.DATABASE_URL ||
  fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1]).trim();
const PCT = Number(process.env.PCT || 4);

const SQL = [
  "WITH amostra AS (",
  "  SELECT confianca, metodo, descricao_api, descricao_documento",
  "  FROM app.item_enriquecimento TABLESAMPLE SYSTEM (" + PCT + ")",
  "  WHERE descricao_documento IS NOT NULL AND descricao_api IS NOT NULL",
  "), cob AS (",
  "  SELECT a.confianca, a.metodo,",
  "    (SELECT count(*) FILTER (WHERE position(w in lower(a.descricao_documento)) > 0)::numeric",
  "            / NULLIF(count(*), 0)",
  "     FROM unnest(string_to_array(",
  "            regexp_replace(lower(a.descricao_api), '[^a-z0-9\u00e0-\u00fa]+', ' ', 'g'), ' ')) w",
  "     WHERE length(w) >= 4",
  "       AND w NOT IN ('para','com','sem','por','das','dos','uma','que','tipo','marca','unidade','item',",
  "                     'material','produto','servico','conforme','anexo','edital','termo','referencia')",
  "    ) cobertura",
  "  FROM amostra a",
  ")",
  "SELECT confianca,",
  "  count(*)::int n,",
  "  round(avg(cobertura) * 100, 1) cobertura_media,",
  "  round((count(*) FILTER (WHERE cobertura >= 0.5))::numeric * 100 / count(*), 1) pct_meia_ou_mais,",
  "  round((count(*) FILTER (WHERE cobertura = 0))::numeric * 100 / count(*), 1) pct_zero",
  "FROM cob WHERE cobertura IS NOT NULL",
  "GROUP BY 1 ORDER BY 1",
].join("\n");

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, statement_timeout: 600000 });
db.on("error", () => {});
const RANK = { alta: 3, media: 2, baixa: 1, ausente: 0 };
const r = (await db.query(SQL)).rows;
console.log("amostra TABLESAMPLE " + PCT + "% · cobertura = palavras do item (>=4 letras) achadas no bloco do documento\n");
console.log("confianca   itens     cobertura   >=50%    zero");
for (const x of r.sort((a, b) => RANK[b.confianca] - RANK[a.confianca]))
  console.log(String(x.confianca).padEnd(11) + String(Number(x.n).toLocaleString()).padStart(7)
    + String(x.cobertura_media + "%").padStart(11) + String(x.pct_meia_ou_mais + "%").padStart(9)
    + String(x.pct_zero + "%").padStart(8));
const ord = r.filter((x) => RANK[x.confianca] > 0).sort((a, b) => RANK[b.confianca] - RANK[a.confianca]);
const invertido = ord.some((x, i) => i > 0 && Number(x.cobertura_media) > Number(ord[i - 1].cobertura_media));
console.log("\nVEREDITO: escala " + (invertido ? "INVERTIDA — confianca maior NAO significa cobertura maior" : "coerente — cobertura cai junto com a confianca"));
await db.end();
