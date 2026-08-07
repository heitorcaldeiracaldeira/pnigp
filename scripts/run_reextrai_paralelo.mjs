// SUPERVISOR da re-extração com geometria — N processos em fatias DISJUNTAS por hash.
// Cada shard é uma thread de JS própria: o parse de PDF é síncrono e travaria numa thread só.
// Mesmo desenho do run_extrai_texto_paralelo.mjs, que já provou o formato.
//   NSHARD=4 CONC=3 node scripts/run_reextrai_paralelo.mjs
import { spawn } from "child_process"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const N = Number(process.env.NSHARD || 4);
const CONC = process.env.CONC || "3";
const TIPOS = process.env.TIPOS || "editais";
console.log(`supervisor re-extração: ${N} shards · CONC ${CONC} cada · tipos=${TIPOS}`);
const filhos = Array.from({ length: N }, (_, i) => {
  const c = spawn(process.execPath, [path.join(__dirname, "reextrai_layout.mjs")], {
    env: { ...process.env, NSHARD: String(N), SHARD: String(i), CONC, TIPOS }, stdio: "ignore",
  });
  return new Promise((res) => c.on("exit", (code) => { console.log(`  shard ${i}/${N} saiu (code ${code})`); res(code); }));
});
await Promise.all(filhos);
console.log("supervisor: todos os shards concluíram.");
