// Número de TURMAS por escola e por etapa (creche/pré/fund AI/AF/médio/EJA/especial) + rede. Fonte: INEP Censo Escolar (microdados escola). State-agnostic.
import fs from "fs"; import pg from "pg"; import readline from "readline";
const UFC = { SC: "42", SP: "35" }[process.env.UF || "SC"] || "42";
// ⚠️ ESTE SCRIPT SÓ FUNCIONAVA COM O CAMINHO PASSADO À MÃO
// `process.argv[2]` sem argumento é `undefined`, e era isso que chegava no createReadStream: o
// `ERR_INVALID_ARG_TYPE` que aparecia no catálogo desde julho não era arquivo corrompido nem fonte fora do
// ar — era a ausência de qualquer download. A tabela nunca teve uma linha. Agora, sem argumento, ele busca
// da fonte compartilhada do Censo Escolar (o mesmo zip que outras quatro ETLs usam).
//
// ═══ E O LAYOUT DA FONTE MUDOU DEBAIXO DELE ═══
// O script foi escrito contra o antigo arquivo largo `microdados_ed_basica`, com as colunas fixadas por
// POSIÇÃO (`{ ent: 18, nome: 17, cre: 384, … }`). Esse arquivo não existe mais: o Censo 2025 vem como
// `microdados_censo_escolar_2025_v2` e é dividido em Tabela_Escola / Tabela_Turma / Tabela_Matricula /
// Tabela_Docente. A contagem de turmas mora em Tabela_Turma — que já vem AGREGADA por escola
// (QT_TUR_BAS, QT_TUR_INF_CRE, QT_TUR_FUND_AI…), 218 colunas.
// Índice fixo é a pior forma de ler CSV público: quando a fonte insere uma coluna, o script não quebra —
// ele lê o número errado calado. Aqui as colunas passam a ser achadas PELO NOME, no cabeçalho.
const { zipCensoEscolar, extraiDoCenso } = await import("./fonte_censo_escolar.mjs");
let ANO_CENSO = Number(process.env.ANO || 0);
const CSV = process.argv[2] || (() => {
  const c = zipCensoEscolar();
  ANO_CENSO = ANO_CENSO || c.ano;
  return extraiDoCenso(c.zip, /Tabela_Turma.*\.csv$/i, `${process.env.TEMP || "/tmp"}/censo_turmas_${c.ano}`);
})();
const nI = (x) => { const n = parseInt(String(x || "").trim()); return isNaN(n) ? 0 : n; };
const DEP = { 1: "Federal", 2: "Estadual", 3: "Municipal", 4: "Privada" };
const U = fs.readFileSync("C:/Users/PC/pnigp/.env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 3 }); db.on("error", () => {});
const by7 = new Set((await db.query("SELECT cod_ibge FROM entes_sc WHERE tipo='M'")).rows.map(e => e.cod_ibge));
await db.query(`CREATE TABLE IF NOT EXISTS escola_turmas_sc (co_entidade TEXT PRIMARY KEY, cod_ibge TEXT, ano INT, nome TEXT, rede TEXT, tur_total INT, tur_creche INT, tur_pre INT, tur_fund_ai INT, tur_fund_af INT, tur_medio INT, tur_eja INT, tur_esp INT, atualizado TIMESTAMPTZ DEFAULT now())`);
await db.query(`CREATE INDEX IF NOT EXISTS idx_escturmas_mun ON escola_turmas_sc(cod_ibge)`);
await db.query(`DELETE FROM escola_turmas_sc WHERE cod_ibge LIKE '${UFC}%'`);
// nome da coluna no Censo → campo nosso. Se a fonte renomear, o script PARA com a lista do que faltou,
// em vez de gravar zero em silêncio.
const COL = { ent: "CO_ENTIDADE", nome: "NO_ENTIDADE", mun: "CO_MUNICIPIO", dep: "TP_DEPENDENCIA",
  tot: "QT_TUR_BAS", cre: "QT_TUR_INF_CRE", pre: "QT_TUR_INF_PRE", fai: "QT_TUR_FUND_AI",
  faf: "QT_TUR_FUND_AF", med: "QT_TUR_MED", eja: "QT_TUR_EJA", esp: "QT_TUR_ESP" };
let I = null;
const rl = readline.createInterface({ input: fs.createReadStream(CSV, { encoding: "latin1" }) });
let i = 0, n = 0, batch = [];
const flush = async () => { if (!batch.length) return; const ph = [], vals = []; batch.forEach((r, k) => { const b = k * 13; ph.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13})`); vals.push(...r); }); await db.query(`INSERT INTO escola_turmas_sc (co_entidade,cod_ibge,ano,nome,rede,tur_total,tur_creche,tur_pre,tur_fund_ai,tur_fund_af,tur_medio,tur_eja,tur_esp) VALUES ${ph.join(",")} ON CONFLICT (co_entidade) DO UPDATE SET tur_total=EXCLUDED.tur_total,rede=EXCLUDED.rede`, vals); batch = []; };
for await (const l of rl) {
  const c = l.split(";");
  if (i++ === 0) {
    const h = c.map((x) => x.replace(/^"|"$/g, "").trim().toUpperCase());
    I = Object.fromEntries(Object.entries(COL).map(([k, nome]) => [k, h.indexOf(nome)]));
    const faltam = Object.entries(I).filter(([, v]) => v < 0).map(([k]) => COL[k]);
    if (faltam.length) throw new Error(`Censo Escolar: o layout mudou — colunas ausentes em ${CSV.split(/[\\/]/).pop()}: ${faltam.join(", ")}`);
    continue;
  }
  const mun = c[I.mun]; if (!mun || mun.slice(0, 2) !== UFC || !by7.has(mun)) continue;
  // o ano vem do arquivo (ANO= força), não mais do "2023" que estava cravado aqui
  batch.push([c[I.ent], mun, ANO_CENSO, c[I.nome], DEP[nI(c[I.dep])] || "?", nI(c[I.tot]), nI(c[I.cre]), nI(c[I.pre]), nI(c[I.fai]), nI(c[I.faf]), nI(c[I.med]), nI(c[I.eja]), nI(c[I.esp])]);
  n++; if (batch.length >= 500) await flush();
}
await flush();
const cc = (await db.query(`SELECT count(*) esc, sum(tur_total) tur FROM escola_turmas_sc WHERE cod_ibge LIKE '${UFC}%'`)).rows[0];
console.log(`✔ escola_turmas_sc: ${cc.esc} escolas · ${cc.tur} turmas no total (${UFC})`);
await db.end();
