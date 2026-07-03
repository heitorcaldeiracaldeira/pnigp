// ETL — Foto, partido, página, e-mail e telefone dos deputados estaduais (ALESC), p/ os cards da aba Estaduais.
// Fonte: ALESC admin-ajax (post_type=post_team) — HTML dos cards. Casa por nome com bancada_estadual_sc.
// node scripts/ingest_alesc_contatos_sc.mjs
import fs from "fs"; import pg from "pg";
const DATABASE_URL = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const SRC = process.env.SRC || "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC/ba9cc77b-9f1b-4cbc-90a2-e9a04839ff68/scratchpad/alesc.html";
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const STOP = new Set(["DE", "DA", "DO", "DOS", "DAS", "E"]);
const toks = (s) => norm(s).split(" ").filter((t) => t.length > 2 && !STOP.has(t));

function parse(html) {
  const cards = html.split("lab-card-team").slice(1);
  const out = [];
  for (const c of cards) {
    const nome = (c.match(/lab-title-news[^>]*>([^<]+)/) || [])[1]?.trim();
    if (!nome) continue;
    const pagina = (c.match(/href=\\?"(https:\/\/www\.alesc\.sc\.gov\.br\/deputado\/[a-z0-9-]+\/)/) || [])[1];
    const foto = (c.match(/(https:\/\/www\.alesc\.sc\.gov\.br\/wp-content\/uploads\/[^"'\s\\]+?\.(?:jpe?g|png|webp))/i) || [])[1];
    const partido = (c.match(/lab-button[^>]*>([A-ZÇÃ]{2,20})</) || [])[1];
    const email = (c.match(/mailto:([^"\\ ]+)/) || [])[1] || (c.match(/([a-z0-9.]+@alesc\.sc\.gov\.br)/) || [])[1] || null;
    const tel = (c.match(/(\(48\)\s*[0-9]{4}-[0-9]{4})/) || [])[1] || null;
    out.push({ nome, partido, foto, pagina, email, tel });
  }
  return out;
}

async function main() {
  let html = fs.readFileSync(SRC, "utf8");
  if (html.trimStart().startsWith('"')) html = JSON.parse(html); // desfaz JSON-encode
  const deps = parse(html);
  console.log(`ALESC: ${deps.length} deputados parseados`);

  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  db.on("error", () => {});
  for (const col of ["foto_url TEXT", "pagina_url TEXT", "email TEXT", "telefone TEXT"])
    await db.query(`ALTER TABLE bancada_estadual_sc ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
  const q = async (s, p) => { for (let t = 0; t < 6; t++) { try { return await db.query(s, p); } catch { await new Promise((r) => setTimeout(r, 800 * (t + 1))); } } throw new Error("db"); };
  const banc = (await db.query(`SELECT id, nome FROM bancada_estadual_sc`)).rows;

  let ok = 0; const semMatch = [];
  for (const d of deps) {
    const bt = toks(d.nome);
    const m = banc.find((b) => norm(b.nome) === norm(d.nome)) || banc.find((b) => { const tb = toks(b.nome); return tb.length && bt.length && (tb.every((t) => bt.includes(t)) || bt.every((t) => tb.includes(t))); });
    if (!m) { semMatch.push(d.nome); continue; }
    await q(`UPDATE bancada_estadual_sc SET foto_url=$1, pagina_url=$2, email=$3, telefone=$4 WHERE id=$5`, [d.foto || null, d.pagina || null, d.email || null, d.tel || null, m.id]);
    ok++;
  }
  console.log(`casados e atualizados: ${ok}/${banc.length}${semMatch.length ? ` · sem match ALESC→bancada: ${semMatch.slice(0, 8).join(", ")}` : ""}`);
  const comFoto = (await db.query(`SELECT count(*) n FROM bancada_estadual_sc WHERE foto_url IS NOT NULL`)).rows[0].n;
  console.log(`com foto: ${comFoto}/40`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
