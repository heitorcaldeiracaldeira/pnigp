// SIGTAP — Tabela Unificada de Procedimentos do SUS. A TERCEIRA taxonomia do item municipal.
//   node scripts/ingest_sigtap.mjs
//
// ═══ POR QUE ESTE ARQUIVO EXISTE (01/set/2026) ═══
// **22,3% das linhas de serviço do PNCP carregam o código SIGTAP DENTRO da própria descrição**
// ("02.02.01.047 3 dosagem de glicose"), e o classificador tentava adivinhá-las por trigrama contra o
// CATSER — que não cobre procedimento do SUS. 2.165 chaves, 1.186 códigos distintos, similaridade média
// 0,289. Não é casamento, é **parse**: extrair o código e consultar esta tabela dá rótulo determinístico.
// Ver [[pnigp-sigtap-codigo-na-propria-descricao]].
//
// ═══ FONTE, E A RESSALVA HONESTA ═══
// A oficial é http://sigtap.datasus.gov.br/tabela-unificada/app/download.jsp, mas ela é uma app JSF atrás
// de `j_security_check` (login anônimo + navegação de sessão) e o host de FTP (`ftp2.datasus.gov.br`) não
// resolve daqui. Então usamos o **espelho** github.com/RenatoKR/SIGTAP, que republica os ZIPs oficiais com
// o NOME ORIGINAL (`TabelaUnificada_AAAAMM_vAAMMDDHHMM.zip`) — dá para conferir a competência e a versão
// contra o portal a qualquer momento. É espelho, não origem: está declarado aqui e gravado em `fonte_zip`.
//
// ⚠️ A competência é DESCOBERTA pela API do GitHub, nunca fixada — tabela do SUS muda todo mês.
// ⚠️ Codificação **latin1** (cp1252). Ler como utf8 corrompe todo acento, e "ATENÇÃO" vira lixo silencioso.
// ⚠️ O layout é PUBLICADO junto (`tb_*_layout.txt`, formato `Coluna,Tamanho,Inicio,Fim,Tipo`), então o
//    parse é derivado dele em vez de posições fixas no código — quando o DATASUS mudar uma coluna, isto
//    acompanha em vez de gravar tudo deslocado em silêncio.
import fs from "fs"; import path from "path"; import pg from "pg"; import { execFileSync } from "child_process";

const H = { "User-Agent": "Mozilla/5.0" };
const DIR = "C:/Users/PC/pnigp/tmp_sigtap";
const X = path.join(DIR, "x");
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3, statement_timeout: 600000 });
db.on("error", () => {});

// ── 1. descobre e baixa a competência mais recente ────────────────────────────────────────
fs.mkdirSync(DIR, { recursive: true });
const lista = await (await fetch("https://api.github.com/repos/RenatoKR/SIGTAP/contents/tabelas",
  { headers: { ...H, Accept: "application/vnd.github+json" } })).json();
const zip = lista.filter((x) => /TabelaUnificada_\d{6}_v\d+\.zip$/.test(x.name))
  .sort((a, b) => a.name.localeCompare(b.name)).at(-1);
const COMPETENCIA = zip.name.match(/_(\d{6})_/)[1];
console.log(`competência mais recente: ${COMPETENCIA} · ${zip.name}`);
const zipPath = path.join(DIR, "sigtap.zip");
if (!fs.existsSync(zipPath) || !fs.existsSync(path.join(X, "tb_procedimento.txt"))) {
  fs.writeFileSync(zipPath, Buffer.from(await (await fetch(zip.download_url, { headers: H })).arrayBuffer()));
  // Node não descompacta ZIP sem dependência; o Expand-Archive já está aqui e é ASCII-safe.
  execFileSync("powershell.exe", ["-NoProfile", "-Command",
    `Expand-Archive -Path '${zipPath}' -DestinationPath '${X}' -Force`], { stdio: "ignore" });
}

// ── 2. parse derivado do layout publicado ─────────────────────────────────────────────────
function leTabela(nome) {
  const lay = fs.readFileSync(path.join(X, `${nome}_layout.txt`), "latin1").trim().split(/\r?\n/);
  const cols = lay.slice(1).map((l) => {
    const [coluna, tamanho, inicio, fim, tipo] = l.split(",");
    return { coluna: coluna.trim().toLowerCase(), ini: Number(inicio) - 1, fim: Number(fim), tipo: (tipo || "").trim() };
  }).filter((c) => c.coluna && Number.isFinite(c.ini));
  const linhas = fs.readFileSync(path.join(X, `${nome}.txt`), "latin1").split(/\r?\n/).filter((l) => l.trim());
  return { cols, linhas: linhas.map((l) => cols.map((c) => l.slice(c.ini, c.fim).trim())) };
}

const TABELAS = [
  { arq: "tb_procedimento", tab: "sigtap_procedimento", pk: "co_procedimento" },
  { arq: "tb_grupo", tab: "sigtap_grupo", pk: "co_grupo" },
  { arq: "tb_sub_grupo", tab: "sigtap_sub_grupo", pk: "co_grupo,co_sub_grupo" },
  { arq: "tb_forma_organizacao", tab: "sigtap_forma_organizacao", pk: "co_grupo,co_sub_grupo,co_forma_organizacao" },
  { arq: "tb_financiamento", tab: "sigtap_financiamento", pk: "co_financiamento" },
  { arq: "tb_modalidade", tab: "sigtap_modalidade", pk: "co_modalidade" },
];

for (const t of TABELAS) {
  if (!fs.existsSync(path.join(X, `${t.arq}.txt`))) { console.log(`  ${t.arq}: ausente no ZIP, pulado`); continue; }
  const { cols, linhas } = leTabela(t.arq);
  // TEXT em tudo: o layout marca NUMBER em campos que são CÓDIGO (com zero à esquerda, que número come).
  // Valor monetário do SIGTAP vem em centavos sem ponto — converter aqui seria inventar regra; fica cru.
  const defs = cols.map((c) => `${c.coluna} TEXT`).join(", ");
  await db.query(`DROP TABLE IF EXISTS ${t.tab}`);
  await db.query(`CREATE TABLE ${t.tab} (${defs}, competencia TEXT, fonte_zip TEXT, PRIMARY KEY (${t.pk}))`);
  const nomes = cols.map((c) => c.coluna);
  const CH = 500;
  for (let s = 0; s < linhas.length; s += CH) {
    const chunk = linhas.slice(s, s + CH), vals = [];
    const ph = chunk.map((r, ri) => {
      const b = ri * (nomes.length + 2);
      r.forEach((v) => vals.push(v));
      vals.push(COMPETENCIA, zip.name);
      return `(${Array.from({ length: nomes.length + 2 }, (_, i) => `$${b + i + 1}`).join(",")})`;
    }).join(",");
    await db.query(`INSERT INTO ${t.tab} (${nomes.join(",")}, competencia, fonte_zip) VALUES ${ph}
      ON CONFLICT (${t.pk}) DO NOTHING`, vals);
  }
  console.log(`✔ ${t.tab}: ${linhas.length.toLocaleString()} linhas · ${cols.length} colunas`);
}

await db.query(`CREATE INDEX IF NOT EXISTS ix_sigtap_proc_nome ON sigtap_procedimento (no_procedimento)`);
const n = (await db.query(`SELECT count(*)::int n FROM sigtap_procedimento`)).rows[0].n;
console.log(`\n✔ SIGTAP competência ${COMPETENCIA}: ${n.toLocaleString()} procedimentos`);
console.table((await db.query(`SELECT left(co_procedimento,2) grupo, count(*)::int n FROM sigtap_procedimento GROUP BY 1 ORDER BY 1`)).rows);
await db.end();
