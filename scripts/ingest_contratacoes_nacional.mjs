// COLETA NACIONAL dos processos do PNCP — roda o `ingest_contratacoes_sc.mjs` (que já é state-agnostic) para
// as 27 UFs, em ordem de tamanho, com retomada. node scripts/ingest_contratacoes_nacional.mjs
//
// ═══ POR QUE UM RUNNER, E NÃO UMA CHAMADA ═══
// A consulta do PNCP (`/consulta/v1/contratacoes/publicacao`) EXIGE `uf` na prática: sem o parâmetro ela
// devolve 504 sempre (medido em 02/set/2026). Não existe "puxar o Brasil de uma vez" — o país é a soma de
// 27 coletas, e é isso que este arquivo faz.
//
// ⚠️ A API de CONSULTA cai com frequência, e cai de um jeito que se parece com sucesso: 504 e timeout já
// foram lidos como "mês vazio" no passado, e a janela ficava marcada como feita para sempre. O ingest de
// baixo já trata isso (janela com erro não é marcada). Aqui o cuidado é outro: uma UF que falhou INTEIRA
// não pode encerrar a corrida — ela volta para o fim da fila e o runner tenta de novo, até o teto de voltas.
//
// RETOMADA: `_raiox_janela` tem PK (uf,mod,ano,mes), então cada janela já coletada é pulada. Rodar duas
// vezes não recoleta nada — pode-se interromper e retomar à vontade.
//
// ⚠️ NÃO coleta ITENS. Este passo só descobre os PROCESSOS. Os itens (descrição, quantidade, unitário
// homologado) vêm de `ingest_itens_sc.mjs`, que lê direto de `contratacoes_sc` e portanto pega sozinho tudo
// o que este runner acrescentar. É lá que mora o custo de verdade: ~1 GET por item.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import { spawn } from "child_process";
import pg from "pg";
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, "..");
const DATABASE_URL = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();

// Ordem por tamanho da máquina pública de cada UF (nº de municípios): quem tem mais município publica mais
// processo, e é onde o banco de preços ganha profundidade mais rápido. SC sai da fila — já está coletada.
const ORDEM = ["SP","MG","RS","BA","PR","GO","PI","PB","MA","PE","CE","RN","PA","MT","TO","AL","RJ","MS","ES","SE","AM","RO","AC","AP","RR","DF"];
const ANO_INI = process.env.ANO_INI || "2024";
const ANO_FIM = process.env.ANO_FIM || "2026";
const VOLTAS = Number(process.env.VOLTAS || 3);
const SO_UF = (process.env.SO_UF || "").toUpperCase().split(",").filter(Boolean);

const db = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 20000 });
const conta = async (uf) => {
  const r = await db.query(`SELECT count(*)::int janelas, coalesce(sum(n),0)::int proc FROM _raiox_janela WHERE uf=$1`, [uf]).catch(() => null);
  return r ? r.rows[0] : { janelas: 0, proc: 0 };
};
const rodaUF = (uf) => new Promise((resolve) => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [path.join(__dirname, "ingest_contratacoes_sc.mjs")], {
    cwd: ROOT, env: { ...process.env, UF: uf, ANO_INI, ANO_FIM }, stdio: ["ignore", "pipe", "pipe"],
  });
  let ultimas = [];
  const guarda = (b) => { const s = String(b).trim(); if (s) { ultimas.push(s); if (ultimas.length > 4) ultimas.shift(); } };
  p.stdout.on("data", guarda); p.stderr.on("data", guarda);
  p.on("close", (code) => resolve({ code, min: ((Date.now() - t0) / 60000).toFixed(1), cauda: ultimas.join(" | ").slice(0, 300) }));
});

let fila = SO_UF.length ? SO_UF : ORDEM;
const falhas = [];
for (let volta = 1; volta <= VOLTAS && fila.length; volta++) {
  console.log(`\n═══ VOLTA ${volta}/${VOLTAS} — ${fila.length} UF(s): ${fila.join(" ")}`);
  const proxima = [];
  for (const uf of fila) {
    const antes = await conta(uf);
    process.stdout.write(`\n▶ ${uf} (tinha ${antes.janelas} janelas / ${antes.proc.toLocaleString("pt-BR")} processos)… `);
    const r = await rodaUF(uf);
    const depois = await conta(uf);
    const ganho = depois.proc - antes.proc;
    if (r.code === 0) {
      console.log(`✔ ${r.min} min · +${ganho.toLocaleString("pt-BR")} processos · ${depois.janelas} janelas`);
    } else {
      console.log(`✖ saiu ${r.code} em ${r.min} min · +${ganho.toLocaleString("pt-BR")} processos · volta para a fila`);
      console.log(`   ${r.cauda}`);
      proxima.push(uf);
    }
  }
  fila = proxima;
  if (fila.length) falhas.splice(0, falhas.length, ...fila);
}

const tot = await db.query(`SELECT count(DISTINCT uf) ufs, count(*) janelas, coalesce(sum(n),0)::bigint proc FROM _raiox_janela`).catch(() => null);
if (tot) {
  const t = tot.rows[0];
  console.log(`\n✔ PNCP: ${t.ufs} UF(s) com janelas coletadas · ${(+t.janelas).toLocaleString("pt-BR")} janelas · ${(+t.proc).toLocaleString("pt-BR")} processos`);
}
const base = await db.query(`SELECT count(*) n, count(DISTINCT left(cod_ibge,2)) ufs FROM contratacoes_sc`).catch(() => null);
if (base) console.log(`  contratacoes_sc: ${(+base.rows[0].n).toLocaleString("pt-BR")} processos em ${base.rows[0].ufs} UF(s)`);
if (falhas.length) {
  console.error(`\n🚨 ${falhas.length} UF(s) não fecharam depois de ${VOLTAS} voltas: ${falhas.join(" ")}`);
  console.error(`   Isto é "não consegui perguntar", não "não há processo". Rode de novo — a retomada pula o que já veio.`);
}
await db.end();
process.exit(falhas.length ? 1 : 0);
