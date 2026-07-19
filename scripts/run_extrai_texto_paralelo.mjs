// SUPERVISOR da extração de texto — sobe N processos SHARD-ados em paralelo (cada um numa thread de JS própria →
// paraleliza o parse de PDF, que é síncrono e travaria numa thread só). Cada shard pega uma fatia DISJUNTA (por hash),
// então NÃO há re-download/sobreposição. Qualidade idêntica: é o MESMO ingest_arquivo_texto_sc.mjs por documento.
// A tarefa PNIGP-Extrai-Texto roda este supervisor. NSHARD/CONC por env. node scripts/run_extrai_texto_paralelo.mjs
import { spawn } from "child_process"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const N = Number(process.env.NSHARD || 4);      // 4 threads de parse — perto do teto de download (~9k/h) sem estourar
const CONC = process.env.CONC || "3";           // downloads por shard; 4×3 = 12 conexões, folga p/ o 429

console.log(`supervisor: ${N} shards · CONC ${CONC} cada · universo=todos`);
const filhos = Array.from({ length: N }, (_, i) => {
  const c = spawn(process.execPath, [path.join(__dirname, "ingest_arquivo_texto_sc.mjs")], {
    env: { ...process.env, UNIVERSO: "todos", NSHARD: String(N), SHARD: String(i), CONC }, stdio: "ignore",
  });
  return new Promise((res) => c.on("exit", (code) => { console.log(`  shard ${i}/${N} saiu (code ${code})`); res(code); }));
});
await Promise.all(filhos);
console.log("supervisor: todos os shards concluíram.");
