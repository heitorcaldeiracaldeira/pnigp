// RE-DERIVA A FATIA — fecha o ciclo evento→espelho→derivada. Terceiro consumidor de pncp_evento.
//
// O consumidor de DADO (consome_evento_dado.mjs) atualiza o ESPELHO da fatia (contratacoes_sc/itens_sc/…) e carimba
// `consumido_dado`. Aqui pego os entes que tiveram evento consumido e re-derivo SÓ ELES — compras_sc e
// andamento_compras_sc (+ tabelas de outliers) — em vez de reconstruir os 295 municípios. Carimbo `consumido_derivado`.
//
// Fila de flags no MESMO evento, cada uma no seu tempo:  consumido_dado → consumido_derivado (→ consumido_notif).
// node scripts/rederiva_fatia.mjs        (DRY=1 opcional)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { deriveCompras, deriveAndamento } from "./_derivadas_compras.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const U = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const DRY = process.env.DRY === "1";
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 300000 });
db.on("error", () => {});

async function main() {
  await db.query(`ALTER TABLE pncp_evento ADD COLUMN IF NOT EXISTS consumido_derivado timestamptz`);
  await db.query(`CREATE INDEX IF NOT EXISTS ix_evento_deriv ON pncp_evento (cod_ibge) WHERE consumido_dado IS NOT NULL AND consumido_derivado IS NULL`);

  // t0 = corte seguro: só carimbo o que JÁ vi consumido; evento consumido depois disso fica p/ o próximo ciclo.
  // ::text preserva os MICROSSEGUNDOS — Date do JS trunca p/ ms e o `<= t0` perderia o próprio evento do corte.
  const geral = (await db.query(`SELECT max(consumido_dado)::text t0, count(*) n
    FROM pncp_evento WHERE consumido_dado IS NOT NULL AND consumido_derivado IS NULL`)).rows[0];
  if (!Number(geral.n)) { console.log("nada a re-derivar (nenhum evento consumido pendente)."); await db.end(); return; }
  const t0 = geral.t0;

  // SÓ eventos de CONTEÚDO re-derivam: cat 1=Contratação, 4=Item, 5=Resultado (mexem em contratacoes_sc/itens_sc).
  // cat 6=Documento e Exclusão tocam arquivo_texto_sc, que NENHUMA derivada de compras usa → "nada a derivar",
  // só limpo da fila. Assim não re-derivo um ente que só trocou um PDF.
  const entes = (await db.query(`SELECT DISTINCT cod_ibge FROM pncp_evento
    WHERE consumido_dado IS NOT NULL AND consumido_derivado IS NULL AND consumido_dado <= $1::timestamptz
      AND categoria IN (1,4,5) AND cod_ibge IS NOT NULL AND length(cod_ibge)=7`, [t0])).rows.map((r) => r.cod_ibge);
  console.log(`${Number(geral.n)} evento(s) consumido(s) a processar · ${entes.length} ente(s) de conteúdo p/ re-derivar${DRY ? " · DRY-RUN" : ""}`);
  if (entes.length) console.log("  " + entes.slice(0, 12).join(", ") + (entes.length > 12 ? ` …+${entes.length - 12}` : ""));
  if (DRY) { console.log("(DRY: não re-derivo nem marco)"); await db.end(); return; }

  const cx = await db.connect();
  try {
    await cx.query("BEGIN");
    if (entes.length) {
      await deriveCompras(cx, entes);      // compras_sc + app.compra_processo_implausivel_sc (só esses entes)
      await deriveAndamento(cx, entes);    // app.andamento_compras_sc + app.compra_valor_implausivel_sc (só esses entes)
    }
    // marca TODOS os consumidos até t0 — os de conteúdo foram re-derivados; documento/exclusão = nada a derivar.
    const upd = await cx.query(`UPDATE pncp_evento SET consumido_derivado = now()
      WHERE consumido_derivado IS NULL AND consumido_dado IS NOT NULL AND consumido_dado <= $1::timestamptz`, [t0]);
    await cx.query("COMMIT");
    console.log(`\n✔ ${entes.length} fatias re-derivadas · ${upd.rowCount} eventos marcados consumido_derivado`);
  } catch (e) { await cx.query("ROLLBACK"); throw e; } finally { cx.release(); }

  // conferência: as linhas dessas fatias
  if (entes.length) {
    const chk = (await db.query(`SELECT count(*) linhas, count(DISTINCT cod_ibge) entes, round(sum(valor_homologado))::bigint v
      FROM compras_sc WHERE cod_ibge = ANY($1)`, [entes])).rows[0];
    console.log(`  compras_sc dessas fatias: ${chk.linhas} linhas · ${chk.entes} entes · R$ ${(Number(chk.v)/1e6).toFixed(1)} mi`);
  }
  const p = (await db.query(`SELECT count(*) FILTER (WHERE consumido_derivado IS NULL AND consumido_dado IS NOT NULL) pend FROM pncp_evento`)).rows[0];
  console.log(`  fila de re-derivação restante: ${p.pend}`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
