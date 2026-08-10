// LANÇADOR — usa TODOS OS NÚCLEOS pro enriquecimento. Abre 1 processo por core, cada um numa FATIA disjunta
// (shard por hash do processo) → sem overlap, sem corrida. Cada processo grava só a descrição (EVID off) em LOTE.
// Espera todos terminarem e relança (a task Windows chama isto). node scripts/enriquece_paralelo.mjs
import os from "os"; import { spawn } from "child_process";
import path from "path"; import { fileURLToPath } from "url"; import fs from "fs"; import pg from "pg";
import { constroiFila } from "./constroi_fila_enriquecimento.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══ TRAVA LEVANTADA EM 10/ago — ORDEM DO HEITOR. HISTÓRICO ABAIXO, PORQUE O MOTIVO ESTAVA MEIO ERRADO ═══
// A tarefa foi desligada em 08/ago e a justificativa escrita aqui era: "81,5% das descrições vindas de
// documento começam com letra MINÚSCULA, e a consulta de controle — as que começam com maiúscula — voltou
// VAZIA". ESSA MEDIDA NÃO VALIA NADA: o `norm()` do pipeline faz `.toLowerCase()`, então 100% começam em
// minúscula POR CONSTRUÇÃO, e o "controle" só podia voltar vazio. Medi uma propriedade do meu próprio
// código e li como propriedade do dado. Fica registrado para ninguém reusar esse termômetro.
//
// O MOTIVO DE VERDADE era outro e continuava de pé: o texto do edital fora extraído SEM GEOMETRIA, num
// fluxo de linha única — sem fronteira de célula, todo recorte degenera em janela por proximidade, e o
// resultado saía cortado no meio da palavra ("egundo" por "segundo"). Isso contamina o que se deriva:
// preço normalizado e CATMAT. Rodar com a mesma régua multiplicaria o dano.
//
// O CRITÉRIO CERTO PARA RELIGAR — e o que foi de fato medido em 10/ago por
// `scripts/analise_religar_enriquecimento.mjs`:
//   1. o método novo (roteador) tem de vencer o antigo: 70,8% × 49,0% de recorte começando certo  ✓
//   2. o trabalho inédito tem de ter GEOMETRIA: 532 de 660 processos (80,6%)                      ✓
//   com a re-extração em 235.493 documentos com geometria contra 44.300 ainda achatados.
// O item 2 é o que importa: enquanto o inédito for majoritariamente achatado, religar só gera lixo novo.
//
// ⚠️ A TRAVA VIVIA AQUI, e não só no Agendador, porque `roda_tudo.cmd` (a Rodada completa, manual) chama
// este script no passo 3/5 — desligar a tarefa não bastaria. Se for preciso parar de novo, o lugar é este.
// Para parar: PARA_ENRIQUECIMENTO=1 (ou reponha o bloco), e escreva o motivo COM A MEDIDA que o sustenta.
if (process.env.PARA_ENRIQUECIMENTO === "1") {
  console.log("⛔ ENRIQUECIMENTO DA DESCRIÇÃO PARADO por PARA_ENRIQUECIMENTO=1.");
  process.exit(0);   // sai LIMPO: não é falha, é decisão — não deve poluir o log de erro da rodada
}
const N = Math.max(1, (Number(process.env.NCORE) || os.cpus().length));  // todos os núcleos
// 1× REFAZ A FILA (varredura única), DEPOIS abre os shards (que só leem fatias leves da fila)
const DATABASE_URL = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const _db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 590000 });
await constroiFila(_db); await _db.end();
console.log(`enriquecimento PARALELO: ${N} processos (1 por núcleo), fatias disjuntas por hash`);

const filhos = [];
for (let i = 0; i < N; i++) {
  const f = spawn(process.execPath, [path.join(__dirname, "enriquece_item_documento.mjs")], {
    env: { ...process.env, NSHARD: String(N), SHARD: String(i), CONC: "2" },  // CONC baixo: cada core é 1 processo
    stdio: ["ignore", "inherit", "inherit"],
  });
  filhos.push(new Promise((res) => f.on("exit", (code) => { console.log(`[shard ${i}] saiu (${code})`); res(code); })));
}
await Promise.all(filhos);
console.log("todos os shards terminaram.");
