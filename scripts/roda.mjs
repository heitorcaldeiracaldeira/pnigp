// RUNNER ÚNICO DAS CADEIAS — um motor só, para todas.
//
//   node scripts/roda.mjs <cadeia>            executa
//   node scripts/roda.mjs <cadeia> --plano    só mostra o que faria, sem executar e sem travar
//   node scripts/roda.mjs --lista             lista as cadeias declaradas
//
// O QUE ELE CENTRALIZA, e que antes era decidido por acaso em cada .cmd:
//   · TRAVA — pega antes do primeiro passo e segura até o fim, com batida viva; quem chega depois sai com 0,
//     porque "já tem alguém fazendo isso" não é falha.
//   · AMBIENTE — cada passo recebe o env montado da DECLARAÇÃO. Nada do passo anterior sobrevive.
//   · CÓDIGO DE SAÍDA — sai 1 se algum passo falhou, 0 se todos passaram. Nunca mais "sempre 0 porque o
//     arquivo terminava num echo".
//   · LOG — uma linha, um formato, carimbo com fuso declarado. Um arquivo por cadeia.
//   · TIMEOUT por passo — opcional, mata a árvore do processo e conta como falha.
//
// FORMATO DA LINHA (o painel e qualquer leitor precisam de um só):
//   <AAAA-MM-DD hh:mm:ss -03> <NIVEL> <cadeia> <EVENTO> <alvo> | <mensagem>
// EVENTO ∈ INICIO · ETAPA_INICIO · ETAPA_FIM · FALHA · PULADA · RESUMO · FIM
// O que os passos escrevem em stdout vai para o mesmo arquivo, sem prefixo — quem lê trata como RAW.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { spawn, execSync } from "child_process"; import pg from "pg";
import { CADEIAS, nomes } from "./cadeias.mjs";
import { pegaTrava } from "./trava_processo.mjs";
import { carimboBR } from "./hora_br.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(process.env.LOCALAPPDATA || process.env.TEMP || ROOT, "Temp");
const args = process.argv.slice(2);
const PLANO = args.includes("--plano");
const alvoCadeia = args.find((a) => !a.startsWith("--"));

if (args.includes("--lista") || !alvoCadeia) {
  console.log("cadeias declaradas:");
  for (const n of nomes()) console.log(`  ${n.padEnd(16)} ${CADEIAS[n].titulo}`);
  process.exit(alvoCadeia ? 0 : 2);
}
const cad = CADEIAS[alvoCadeia];
if (!cad) { console.error(`cadeia desconhecida: ${alvoCadeia}. Use --lista.`); process.exit(2); }

// ---- log ----------------------------------------------------------------------------------------
const ARQ = path.join(TMP, cad.log);
const escreve = (t) => { try { fs.appendFileSync(ARQ, t); } catch {} process.stdout.write(t); };
const linha = (nivel, evento, alvo, msg = "") =>
  escreve(`${carimboBR()} ${nivel} ${alvoCadeia} ${evento} ${alvo || "-"} | ${msg}\n`);

// ---- execução de um passo -----------------------------------------------------------------------
const mataArvore = (pid) => { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" }); } catch {} };

function executa(passo) {
  // passo que é outra cadeia vira uma chamada ao PRÓPRIO runner: uma porta só, inclusive aqui dentro
  const argv = passo.cadeia ? [path.join(ROOT, "scripts", "roda.mjs"), passo.cadeia] : [path.join(ROOT, passo.script)];
  // o ambiente vem da declaração, nunca do passo anterior
  const env = { ...process.env, ...(cad.env || {}), ...(passo.env || {}) };
  return new Promise((res) => {
    const t0 = Date.now();
    const filho = spawn(process.execPath, argv, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    const anexa = (fluxo) => fluxo.on("data", (b) => escreve(b.toString()));
    anexa(filho.stdout); anexa(filho.stderr);
    let porTempo = false, timer = null;
    if (passo.timeoutMin) timer = setTimeout(() => { porTempo = true; mataArvore(filho.pid); }, passo.timeoutMin * 60000);
    const fim = (code) => {
      if (timer) clearTimeout(timer);
      res({ code, seg: Math.round((Date.now() - t0) / 1000), porTempo });
    };
    filho.on("exit", (code) => fim(code ?? -1));
    filho.on("error", () => fim(-1));
  });
}

// ---- plano (não executa, não trava) --------------------------------------------------------------
if (PLANO) {
  console.log(`\n${cad.titulo}`);
  console.log(`  log ......... ${ARQ}`);
  console.log(`  trava ....... ${cad.trava ? `${cad.trava.nome} (tolerância ${cad.trava.toleranciaMin} min)` : "nenhuma — o próprio script se tranca"}`);
  console.log(`  ao falhar ... ${cad.aoFalhar === "parar" ? "PARA (o passo seguinte consome o anterior)" : "SEGUE (passos independentes)"}`);
  console.log(`  env base .... ${JSON.stringify(cad.env || {})}`);
  console.log(`  passos ...... ${cad.passos.length}`);
  cad.passos.forEach((p, i) => {
    const que = p.cadeia ? `cadeia:${p.cadeia}` : p.script;
    const env = { ...(cad.env || {}), ...(p.env || {}) };
    console.log(`    ${String(i + 1).padStart(2)}/${cad.passos.length}  ${p.rotulo}`);
    console.log(`         ${que}${p.timeoutMin ? `  [timeout ${p.timeoutMin} min]` : ""}`);
    console.log(`         env ${JSON.stringify(env)}`);
  });
  process.exit(0);
}

// ---- execução -----------------------------------------------------------------------------------
const U = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
// ⏱️ connectionTimeoutMillis EXISTE porque sem ele o runner FICA PENDURADO. Em 02/set a cadeia do
// enriquecimento disparou 04:13 e só morreu 05:00:48 — 47 min pendurada na conexão, com a janela da noite
// inteira jogada fora. `query_timeout` não cobre isso: ele limita a QUERY, não o handshake.
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2,
  query_timeout: 30000, connectionTimeoutMillis: 20000 });
db.on("error", () => {});

let trava = null;
const solta = async () => { try { await trava?.solta(); } catch {} };
for (const s of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(s, async () => { await solta(); process.exit(130); });

// ═══ RETENTATIVA NO ARRANQUE — a 1ª batida no banco não pode derrubar a noite (02/set/2026) ═══
// `pegaTrava` é a PRIMEIRA coisa que toca o banco, e qualquer exceção ali caía direto no catch fatal, sem
// uma única retentativa: a cadeia morria antes de escrever o INICIO. Aconteceu em 02/set às 04:13 com
// `permission denied for schema pg_catalog` — erro do Neon durante o cold start do compute, não do nosso
// código (o usuário é neondb_owner e às 01:00 a mesma credencial tinha funcionado).
// Compute serverless SUSPENDE: a 1ª conexão da madrugada acorda o banco, e acordar leva ~15 s aqui. Tratar
// isso como falha definitiva é transformar latência de infraestrutura em noite perdida.
// A espera cresce (10s, 20s, 40s, 80s) porque cold start não melhora com insistência imediata.
async function pegaTravaComRetentativa() {
  const esperas = [10000, 20000, 40000, 80000];
  for (let t = 0; ; t++) {
    try { return await pegaTrava(db, cad.trava.nome, { toleranciaMin: cad.trava.toleranciaMin }); }
    catch (e) {
      if (t >= esperas.length) throw e;
      linha("INFO", "RETENTATIVA", "-", `banco indisponível no arranque (${String(e?.message).slice(0, 80)}) — tentativa ${t + 2}/${esperas.length + 1} em ${esperas[t] / 1000}s`);
      await new Promise((r) => setTimeout(r, esperas[t]));
    }
  }
}

async function main() {
  if (cad.trava) {
    trava = await pegaTravaComRetentativa();
    if (!trava.ok) {
      // sair com 0: não é falha, é "tem alguém fazendo isso agora". Sair com erro faria quem chamou
      // reportar quebra onde não houve — e numa cadeia que sai calada isso vira noite perdida em silêncio.
      linha("INFO", "PULADA", "-", `trava ${cad.trava.nome} está com ${trava.donoAtual} há ${trava.minRodando} min`);
      await db.end(); process.exit(0);
    }
  }

  const t0 = Date.now();
  linha("INFO", "INICIO", "-", `${cad.titulo} · ${cad.passos.length} passo(s) · ao falhar: ${cad.aoFalhar}`);

  const saidas = [];
  for (let i = 0; i < cad.passos.length; i++) {
    const p = cad.passos[i], alvo = `${i + 1}/${cad.passos.length}`;
    if (saidas.some((s) => s.code !== 0) && cad.aoFalhar === "parar") {
      linha("WARN", "PULADA", alvo, `${p.rotulo} — não roda porque um passo anterior falhou`);
      saidas.push({ rotulo: p.rotulo, code: null, seg: 0 });
      continue;
    }
    linha("INFO", "ETAPA_INICIO", alvo, p.rotulo);
    const r = await executa(p);
    saidas.push({ rotulo: p.rotulo, code: r.code, seg: r.seg });
    if (r.code === 0) linha("INFO", "ETAPA_FIM", alvo, `${p.rotulo} · ok · dur=${r.seg}s`);
    else linha("ERRO", "FALHA", alvo, `${p.rotulo} · exit=${r.code}${r.porTempo ? " (morto por timeout)" : ""} · dur=${r.seg}s`);
  }

  const falhas = saidas.filter((s) => s.code !== 0 && s.code !== null).length;
  const pulados = saidas.filter((s) => s.code === null).length;
  linha("INFO", "RESUMO", "-", saidas.map((s, i) => `${i + 1}=${s.code === null ? "pulado" : s.code}`).join(" "));
  const dur = Math.round((Date.now() - t0) / 1000);
  linha(falhas ? "ERRO" : "INFO", "FIM", "-", `falhas=${falhas} pulados=${pulados} dur=${dur}s`);

  await solta();
  await db.end();
  process.exit(falhas ? 1 : 0);   // código honesto: quem chamou precisa saber
}

main().catch(async (e) => {
  linha("ERRO", "FIM", "-", `ERRO FATAL no runner: ${e?.message || e}`);
  await solta(); try { await db.end(); } catch {}
  process.exit(1);
});
