// PROVA DE COMPLETUDE (FONTE→BASE) — Emendas federais EXECUÇÃO (Portal da Transparência).
// Risco: o coletor só captura localidadeDoGasto no padrão "Cidade - SC"; emendas de SC com localidade
// "Santa Catarina" (estado) ou outro formato somem em silêncio. Aqui sondamos a fonte e medimos o gap.
// node scripts/prova_completude_emendas_fed.mjs        (amostra anos padrão)
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
const KEY = env.match(/^PORTAL_TRANSPARENCIA_KEY=(.+)$/m)[1].trim().replace(/['"]/g, "");
const ANOS = (process.env.ANOS || "2023,2024,2025,2026").split(",").map(Number);
const MAXPAG = +(process.env.MAXPAG || 400); // teto de páginas por ano
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const nossoFiltro = (loc) => /-\s*SC\s*$/i.test(String(loc || "")); // regex idêntica ao coletor
const ehSC = (loc) => /(-\s*SC\s*$)|santa\s*catarina|\bSC\b/i.test(String(loc || "")); // qualquer sinal de SC

async function api(ano, pagina) {
  const url = `https://api.portaldatransparencia.gov.br/api-de-dados/emendas?ano=${ano}&pagina=${pagina}`;
  for (let t = 0; t < 6; t++) {
    try { const r = await fetch(url, { headers: { "chave-api-dados": KEY, Accept: "application/json" }, signal: AbortSignal.timeout(40000) });
      if (r.status === 429) { await sleep(8000); continue; }
      if (!r.ok) throw new Error("http " + r.status);
      return await r.json();
    } catch { await sleep(2500 * (t + 1)); }
  }
  return null;
}

async function main() {
  const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 }); db.on("error", () => {});
  console.log("=== PROVA DE COMPLETUDE · Execução federal · FONTE(Portal) → BASE ===\n");
  // anos coletados na base
  const chk = (await db.query(`SELECT ano, n FROM emendas_check ORDER BY ano`)).rows;
  console.log("anos na base (emendas_check):", chk.map((r) => `${r.ano}:${r.n}`).join("  "));
  const suspeitos = []; // emendas com sinal de SC que o nosso filtro NÃO pega
  for (const ano of ANOS) {
    let pag = 1, nac = 0, nosso = 0, scReal = 0, perdidas = 0;
    while (pag <= MAXPAG) {
      const arr = await api(ano, pag); await sleep(650);
      if (!arr || !arr.length) break;
      nac += arr.length;
      for (const e of arr) {
        const loc = String(e.localidadeDoGasto || "");
        const nosso_ok = nossoFiltro(loc), sc = ehSC(loc);
        if (nosso_ok) nosso++;
        if (sc) scReal++;
        if (sc && !nosso_ok) { perdidas++; if (suspeitos.length < 20) suspeitos.push(`${ano} · "${loc}" · ${e.tipoEmenda || ""} · pago ${e.valorPago || 0}`); }
      }
      if (arr.length < 15) break;
      pag++;
    }
    const baseAno = chk.find((r) => +r.ano === ano)?.n ?? "—";
    console.log(`\n${ano}: nacionais vistas ${nac} (até pág ${pag}) · nosso filtro ${nosso} · SC real (qualquer formato) ${scReal} · PERDIDAS ${perdidas}  · base guardou ${baseAno}`);
  }
  if (suspeitos.length) { console.log(`\n⚠️ EMENDAS DE SC QUE O FILTRO PERDE (amostra):`); suspeitos.forEach((s) => console.log("  • " + s)); }
  else console.log(`\n✓ Nenhuma emenda de SC fora do padrão "Cidade - SC" nas páginas amostradas — filtro não vaza (no escopo testado).`);
  await db.end();
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
