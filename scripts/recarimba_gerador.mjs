// RE-CARIMBA arquivo_texto_sc.gerador RODANDO OS PARSERS (não por assinatura de texto).
//
// POR QUE: assinatura não prova leitura. Medido em 800 docs COM MARCA: a assinatura dizia "portal" p/ 436, mas o
// parser do Portal só lê 147 — 287 pareciam cobertos e não eram. Depois da troca, o balde 'outro' vira a FILA REAL
// (docs com marca que NENHUM parser lê), em vez de um número bonito que esconde o trabalho.
// Não perde dado: doc que o parser não lê já não gerava linha nenhuma.
//
// Cursor por chave (NÃO OFFSET: paginar por OFFSET enquanto se atualiza o próprio filtro PULA registros — bug que
// cometi antes). Idempotente. node scripts/recarimba_gerador.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { detectaLayout } from "./detecta_layout.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const LOTE = Number(process.env.LOTE || 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 180000 });
db.on("error", () => {});
const q = async (s, p) => { let u; for (let i = 0; i < 12; i++) { try { return await db.query(s, p); } catch (e) { u = e; await sleep(1500 * (i + 1)); } } throw new Error(`db: ${u?.message}`); };

let cur = ["", 0, 0, 0], tot = 0, mud = 0;
const cont = {};
for (;;) {
  const rs = (await q(`SELECT cnpj,ano,seq,sequencial_documento,gerador,texto FROM arquivo_texto_sc
    WHERE chars>300 AND (cnpj,ano,seq,sequencial_documento) > ($1,$2,$3,$4)
    ORDER BY cnpj,ano,seq,sequencial_documento LIMIT ${LOTE}`, cur)).rows;
  if (!rs.length) break;
  const K = { c: [], a: [], s: [], d: [], g: [] };
  const mudaram = [];
  for (const r of rs) {
    const { gerador } = detectaLayout(r.texto);
    cont[gerador] = (cont[gerador] || 0) + 1;
    if (gerador !== r.gerador) { mud++; mudaram.push([r.cnpj, r.ano, r.seq]); }
    K.c.push(r.cnpj); K.a.push(r.ano); K.s.push(r.seq); K.d.push(r.sequencial_documento); K.g.push(gerador);
  }
  await q(`UPDATE arquivo_texto_sc t SET gerador=x.g FROM unnest($1::text[],$2::int[],$3::int[],$4::int[],$5::text[]) AS x(c,a,s,d,g)
    WHERE t.cnpj=x.c AND t.ano=x.a AND t.seq=x.s AND t.sequencial_documento=x.d AND t.gerador IS DISTINCT FROM x.g`,
    [K.c, K.a, K.s, K.d, K.g]);
  // 🔴 QUEM MUDA DE GERADOR TEM QUE SER REPROCESSADO. `marca_ata_feitas` é COMPARTILHADO entre os extratores:
  // se a ata continua marcada "feita" da rodada em que o parser ERRADO leu zero, o extrator NOVO a pula e a
  // reclassificação não serve p/ nada. Medido: 315 atas viraram 'portal_vencedores' e produziram 1 item — todas
  // bloqueadas pelo marcador antigo. Limpar o marcador SÓ de quem mudou (nada é apagado além do controle).
  if (mudaram.length) {
    await q(`DELETE FROM marca_ata_feitas f USING unnest($1::text[],$2::int[],$3::int[]) AS x(c,a,s)
      WHERE f.cnpj=x.c AND f.ano=x.a AND f.seq=x.s`, [mudaram.map((m) => m[0]), mudaram.map((m) => m[1]), mudaram.map((m) => m[2])]);
  }
  const u = rs[rs.length - 1];
  cur = [u.cnpj, u.ano, u.seq, u.sequencial_documento];
  tot += rs.length;
  process.stdout.write(`  ${tot} carimbados · ${mud} mudaram\r`);
}
console.log(`\n✔ ${tot} textos · ${mud} reclassificados\n`);
for (const [k, v] of Object.entries(cont).sort((a, b) => b[1] - a[1])) console.log(`   ${String(k).padEnd(24)} ${v.toLocaleString("pt-BR")}`);
const f = (await q(`SELECT count(*) n FROM arquivo_texto_sc WHERE gerador='outro' AND chars>500
  AND texto ~* 'marca\\s*:\\s*[A-Za-z0-9]|marca\\s*/\\s*fabricante|Nome\\s+Marca\\s+Modelo'`)).rows[0];
console.log(`\n>>> FILA REAL: ${Number(f.n).toLocaleString("pt-BR")} docs COM MARCA que nenhum parser lê`);
await db.end();
