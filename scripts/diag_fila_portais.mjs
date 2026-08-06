// DIAGNÓSTICO DA FILA INTEIRA — para cada portal, duas perguntas que levam a caminhos diferentes:
//   1. quantos processos têm ATA no PNCP?          → vale escrever LEITOR (barato, dado já em casa)
//   2. quantos não têm?                            → vale investir no COLETOR que vai ao portal (rede)
// E de quebra o FORMATO da ata, que decide como o leitor é escrito:
//   · "Marca: X Modelo: Y"      → rótulo e valor em linha (BNC). Fácil: o rótulo se declara.
//   · "Marca/ Fabricante"       → quadro com colunas (PCP). Difícil: o texto achatado perdeu as colunas.
//
// UMA passada só sobre o join, com FILTER — e não um SELECT por portal. A versão em laço fazia 70 varreduras
// sobre 627 mil documentos e estourou 10 minutos sem terminar.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 1800000 });

// ATA DE SESSÃO de verdade. "Minuta da ata" é o modelo do contrato; "ata de registro de preços" é o contrato
// da SRP — nenhum dos dois traz resultado de disputa. Excluí-los evita contar documento errado como ata.
const E_ATA = `(d.titulo ~* 'ata|vencedor|resultado|classifica|julgamento|adjudica|homologa'
                AND d.titulo !~* 'minuta|impugna|errata|registro de pre|ataderegistro')`;

const { rows } = await db.query(`
  SELECT p.portal_real portal,
         count(DISTINCT (d.cnpj,d.ano,d.seq)) processos,
         count(DISTINCT (d.cnpj,d.ano,d.seq)) FILTER (WHERE ${E_ATA}) com_ata,
         count(DISTINCT (d.cnpj,d.ano,d.seq)) FILTER (WHERE ${E_ATA} AND d.texto ~* 'Marca\\s*:') fmt_inline,
         count(DISTINCT (d.cnpj,d.ano,d.seq)) FILTER (WHERE ${E_ATA} AND d.texto ~* 'Marca\\s*/\\s*Fabricante') fmt_quadro
    FROM app.processo_portal_real p
    JOIN arquivo_texto_sc d ON d.cnpj=p.cnpj AND d.ano=p.ano AND d.seq=p.seq AND d.chars>300
   WHERE p.portal_real IS NOT NULL
   GROUP BY 1 ORDER BY 2 DESC`);

console.table(rows.map((r) => {
  const proc = Number(r.processos), ata = Number(r.com_ata);
  const inl = Number(r.fmt_inline), qua = Number(r.fmt_quadro);
  return {
    portal: String(r.portal).slice(0, 34),
    processos: proc.toLocaleString("pt-BR"),
    com_ata_no_pncp: ata.toLocaleString("pt-BR"),
    pct: proc ? (100 * ata / proc).toFixed(1) + "%" : "-",
    sem_ata_coletor: (proc - ata).toLocaleString("pt-BR"),
    formato: !ata ? "—" : inl >= qua ? `inline (${inl})` : `quadro (${qua})`,
  };
}));
const t = rows.reduce((a, r) => ({ p: a.p + Number(r.processos), a: a.a + Number(r.com_ata) }), { p: 0, a: 0 });
console.log(`\nTOTAL: ${t.p.toLocaleString("pt-BR")} processos com documento · ${t.a.toLocaleString("pt-BR")} com ata no PNCP (${(100*t.a/t.p).toFixed(1)}%)`);
console.log(`=> ${(t.p - t.a).toLocaleString("pt-BR")} processos dependem do coletor que vai ao portal.`);
await db.end();
