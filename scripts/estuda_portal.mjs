// ESTUDA UM PORTAL — a PREMISSA padrão (Heitor): ao achar um portal novo, rode ISTO.
// Dá, por PORTAL × MODALIDADE (presencial/eletrônico já no modalidade_id) × TÍTULO do documento:
//   1) cobertura do DOCUMENTO DE RESULTADO no PNCP (onde a marca do vencedor pode estar)
//   2) os TÍTULOS reais dos modelos de resultado que o portal gera (o doc a mirar no parser)
//   3) cobertura de FORNECEDOR+preço (sempre ~100%, da API) — a lente do serviço
//
//   node scripts/estuda_portal.mjs "Betha Sistemas"     # um portal (aceita prefixo/ILIKE)
//   node scripts/estuda_portal.mjs                       # todos os portais com >=100 processos
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const ALVO = process.argv[2] || null;   // nome (ou prefixo) da plataforma; vazio = todos
const MOD = { 1: "Leilao-elet", 2: "Dialogo", 3: "Concurso", 4: "Concorr-ELET", 5: "Concorr-PRES", 6: "Pregao-ELET", 7: "Pregao-PRES", 8: "Dispensa", 9: "Inexig", 10: "ManifInt", 11: "PreQualif", 12: "Credenc", 13: "Leilao-pres" };
// modelo de RESULTADO reconhecido pelo TÍTULO do doc (vencedor/homologação/adjudicação/ata/resultado…)
const RES = `a.titulo ~* '(vencedor|homolog|resultado|adjudica|ata de realiz|ata de sess|ata final|mapa de lance|classific|relacao de propost|relacao de vencedor|termo de julg|quadro comparativo)'`;

async function main() {
  const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
  const q = (s, p) => db.query(s, p);
  const filtro = ALVO ? `WHERE c.plataforma ILIKE $1` : "";
  const par = ALVO ? [ALVO.includes("%") ? ALVO : ALVO + "%"] : [];

  // 1) PORTAL × MODALIDADE → cobertura do doc de resultado
  const r = (await q(`SELECT c.plataforma, c.modalidade_id mod,
      count(DISTINCT (c.cnpj,c.ano,c.seq)) procs,
      count(DISTINCT (c.cnpj,c.ano,c.seq)) FILTER (WHERE ${RES}) procs_res
    FROM contratacoes_sc c JOIN arquivos_sc a ON a.cnpj=c.cnpj AND a.ano=c.ano AND a.seq=c.seq
    ${filtro}
    GROUP BY c.plataforma, c.modalidade_id
    HAVING count(DISTINCT (c.cnpj,c.ano,c.seq)) >= ${ALVO ? 10 : 100}
    ORDER BY c.plataforma, procs DESC`, par)).rows;
  console.log(`\n=== PORTAL × MODALIDADE → cobertura de DOC DE RESULTADO (onde a marca pode estar) ===`);
  let cur = null;
  for (const x of r) {
    if (x.plataforma !== cur) { cur = x.plataforma; console.log(`\n[${(x.plataforma || "?").slice(0, 48)}]`); }
    const pc = x.procs ? (100 * x.procs_res / x.procs).toFixed(0) : "0";
    console.log(`   ${(MOD[x.mod] || ("mod" + x.mod)).padEnd(14)} procs=${Number(x.procs).toLocaleString().padStart(7)}  c/ doc resultado=${Number(x.procs_res).toLocaleString().padStart(7)} (${(pc + "%").padStart(4)})`);
  }

  // 2) TÍTULOS de resultado mais comuns (o modelo a mirar no parser)
  const t = (await q(`SELECT c.plataforma, a.titulo, count(*) n
    FROM contratacoes_sc c JOIN arquivos_sc a ON a.cnpj=c.cnpj AND a.ano=c.ano AND a.seq=c.seq
    WHERE ${RES} ${ALVO ? "AND c.plataforma ILIKE $1" : ""}
    GROUP BY c.plataforma, a.titulo HAVING count(*) >= ${ALVO ? 5 : 40} ORDER BY c.plataforma, n DESC`, par)).rows;
  console.log(`\n=== TÍTULOS do documento de resultado (o "modelo" que carrega a marca) ===`);
  cur = null;
  for (const x of t) {
    if (x.plataforma !== cur) { cur = x.plataforma; console.log(`\n[${(x.plataforma || "?").slice(0, 48)}]`); }
    console.log(`   ${Number(x.n).toLocaleString().padStart(6)}  ${(x.titulo || "?").slice(0, 60)}`);
  }
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
