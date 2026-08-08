// LANÇADOR — usa TODOS OS NÚCLEOS pro enriquecimento. Abre 1 processo por core, cada um numa FATIA disjunta
// (shard por hash do processo) → sem overlap, sem corrida. Cada processo grava só a descrição (EVID off) em LOTE.
// Espera todos terminarem e relança (a task Windows chama isto). node scripts/enriquece_paralelo.mjs
import os from "os"; import { spawn } from "child_process";
import path from "path"; import { fileURLToPath } from "url"; import fs from "fs"; import pg from "pg";
import { constroiFila } from "./constroi_fila_enriquecimento.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══ TRAVA: PARADO ATÉ A RE-EXTRAÇÃO COBRIR OS EDITAIS — ORDEM DO HEITOR, 08/ago ═══
// Medido em 08/ago sobre as 1.749.931 descrições vindas de documento: 1.426.043 (81,5%) começam com
// letra MINÚSCULA, e a consulta de controle — as que começam com maiúscula — voltou VAZIA. Nenhuma.
// Não é estilo: é o recorte cortando no meio da palavra. O que está gravado hoje se parece com isto:
//     BRUNFELSIA UNIFLORA     → "a grandiflora manaca da flor grande 145 r 9 77 r 1 416 65 9"
//     DISJUNTOR BIFÁSICO 10 A → "egundo nbr iec 60898 3 2021 36 un 20 31 38 627 60 disjuntor"
// "egundo" é "segundo" sem o s. E 58% dessas linhas estão rotuladas como confiança ALTA — o rótulo não
// mede o que promete. O lixo contamina o que se deriva dele: preço normalizado e CATMAT.
// A CAUSA é a mesma de tudo em 07/ago: o texto do edital foi extraído SEM GEOMETRIA, num fluxo de linha
// única, então não há fronteira de célula e todo recorte vira janela por proximidade. Rodar de novo com a
// mesma régua só multiplica o dano — foi por isso que a tarefa foi desligada, e não porque falhava.
// ⚠️ ESTA TRAVA VIVE AQUI, e não só no Agendador, porque `roda_tudo.cmd` (a Rodada completa, manual)
// chama este script no passo 3/5 — desligar a tarefa não bastaria.
// PARA RELIGAR: quando a re-extração tiver alcançado os editais, rode
//     node scripts/verifica_noite.mjs        (mostra o avanço da re-extração)
//   e então: DESTRAVA_ENRIQUECIMENTO=1 node scripts/enriquece_paralelo.mjs
//   ou apague este bloco. Antes disso, medir de novo o % que começa em minúscula: é o termômetro.
if (process.env.DESTRAVA_ENRIQUECIMENTO !== "1") {
  console.log([
    "⛔ ENRIQUECIMENTO DA DESCRIÇÃO PARADO por decisão de 08/ago.",
    "   Motivo: 81,5% das descrições vindas de documento começam no MEIO da palavra — o texto do edital",
    "   ainda está sem geometria, e rodar agora só produz mais lixo com a mesma régua.",
    "   Religue com DESTRAVA_ENRIQUECIMENTO=1 quando a re-extração tiver coberto os editais.",
  ].join("\n"));
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
