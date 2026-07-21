// AUDITORIA · pipeline — REFRESH do flag por evento → extração/reconcile da marca. Idempotente e LEVE.
// Entra no ciclo de ingestão: a cada nova leva do PNCP, roda isto → processos que homolog/des-homolog voltam
// sozinhos e a marca se re-transforma. Não toca o espelho. node scripts/auditoria/pipeline.mjs
import { spawn } from "child_process"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(__dirname, "..");
const UF = (process.env.UF || "sc").toLowerCase();

function run(script, env = {}) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [path.join(SCRIPTS, script)], { env: { ...process.env, UF, ...env }, stdio: "inherit" });
    p.on("exit", (c) => (c === 0 ? res() : rej(new Error(`${script} saiu ${c}`))));
  });
}

console.log(`== AUDITORIA pipeline (UF=${UF}) ==`);
// 0) EVENTO: detecta homologação/des-homologação (watermark) → reabre processos + enfileira fetch do que falta
await run("auditoria/ao_homologar.mjs");
// 1) REFRESH incremental do flag: reabre por doc novo OU item homolog/des-homolog (une com o passo 0)
await run("constroi_doc_tem_marca.mjs", { REFRESH: "1" });
// 2) extração/reconcile: apaga a marca antiga do processo reaberto e grava a atual (vencedor novo entra, antigo sai)
await run("extrai_marca_padrao.mjs", { LIMIT: "0" });
console.log("== auditoria: eventos processados + flag reconciliado + marca re-transformada ==");
console.log("   (fetch dos docs fora do acervo fica em app.fetch_fila_* p/ o coletor de portal)");
