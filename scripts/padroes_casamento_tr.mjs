// PADRÕES do casamento API×TR — lê logs/analise_casamento_tr.jsonl e procura COMPORTAMENTOS:
// por plataforma, por tamanho, distribuição de cobertura/posição, ambiguidade. node scripts/padroes_casamento_tr.mjs
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rows = fs.readFileSync(path.join(__dirname, "..", "logs", "analise_casamento_tr.jsonl"), "utf8")
  .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ok = rows.filter((r) => !r.erro && r.tr_ok);
const med = (a, f) => a.length ? +(a.reduce((s, x) => s + f(x), 0) / a.length).toFixed(2) : null;
const pct = (a, f) => a.length ? Math.round(100 * a.filter(f).length / a.length) : 0;

console.log(`═══ ${rows.length} pregões · TR com texto: ${ok.length} · sem texto: ${rows.filter(r=>!r.erro&&!r.tr_ok).length} · erro: ${rows.filter(r=>r.erro).length} ═══\n`);

console.log("── POR PLATAFORMA (≥4 processos) ──");
const byPlat = {};
for (const r of ok) (byPlat[r.plataforma || "?"] ||= []).push(r);
const plats = Object.entries(byPlat).filter(([, a]) => a.length >= 4).sort((a, b) => b[1].length - a[1].length);
console.log("plataforma".padEnd(34), "n", " cob", "pos_conc", "pos≥.9", "dup>0", "med_it");
for (const [p, a] of plats) {
  const comPos = a.filter((r) => r.pos_conc != null);
  console.log(
    p.slice(0, 33).padEnd(34),
    String(a.length).padStart(2),
    String(med(a, (r) => r.cobertura)).padStart(5),
    String(med(comPos, (r) => r.pos_conc) ?? "—").padStart(7),
    (pct(comPos, (r) => r.pos_conc >= 0.9) + "%").padStart(6),
    (pct(a, (r) => r.dup_desc > 0) + "%").padStart(6),
    String(med(a, (r) => r.n_itens)).padStart(5));
}

console.log("\n── COBERTURA (item localizado no TR) ──");
for (const [lo, hi] of [[0, .5], [.5, .8], [.8, .95], [.95, 1.01]])
  console.log(`  ${lo}–${hi < 1 ? hi : "1.0"}: ${ok.filter((r) => r.cobertura >= lo && r.cobertura < hi).length}`);

console.log("\n── POSIÇÃO (concordância de ordem) ──");
const cp = ok.filter((r) => r.pos_conc != null);
console.log(`  mensurável em ${cp.length}/${ok.length}`);
console.log(`  SEGURA (≥0.95): ${cp.filter((r) => r.pos_conc >= 0.95).length} · BOA (0.9–0.95): ${cp.filter((r) => r.pos_conc >= 0.9 && r.pos_conc < 0.95).length} · QUEBRA (<0.9): ${cp.filter((r) => r.pos_conc < 0.9).length}`);

console.log("\n── AMBIGUIDADE DE CONTEÚDO (descrições repetidas) ──");
console.log(`  com dup>0: ${ok.filter((r) => r.dup_desc > 0).length}/${ok.length} (${pct(ok, (r) => r.dup_desc > 0)}%)`);
console.log(`  por-lote: ${ok.filter((r) => r.por_lote).length}`);
const amb = ok.filter((r) => r.dup_desc > 0), lim = ok.filter((r) => r.dup_desc === 0);
console.log(`  posição QUEBRA — c/ ambiguidade: ${pct(amb.filter(r=>r.pos_conc!=null), (r) => r.pos_conc < 0.9)}% · sem ambiguidade: ${pct(lim.filter(r=>r.pos_conc!=null), (r) => r.pos_conc < 0.9)}%`);

console.log("\n── CÓDIGO DE CATÁLOGO NO ITEM ──");
console.log(`  processos com algum: ${rows.filter((r) => r.catalogo_cov > 0).length}/${rows.length}`);
