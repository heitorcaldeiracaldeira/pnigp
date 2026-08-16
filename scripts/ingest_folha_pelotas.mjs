// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_pelotas.mjs — folha nominal de PELOTAS (11.165 vínculos na RAIS, o maior município do RS ainda
// sem coleta depois das capitais).
//
// ⭐ O ATALHO: o portal tem tela de consulta com filtros, mas o dado inteiro está num CSV anual público:
//   https://storage01.pelotas.com.br/transparencia/downloads/servidores{ANO}.csv     (~134 MB em 2026)
// É a mesma lição das capitais ([[pnigp-capitais-ckan-e-a-porta]]): antes de raspar tela, procurar o arquivo.
// Achei o link no rodapé da própria página de salários, entre os "downloads".
//
// 🚨 134 MB NÃO CABEM EM MEMÓRIA: `await r.arrayBuffer()` mata o processo. Ler em FLUXO, linha a linha, como o
// CSV de 1,35 GB do TCE-RS ([[pnigp-tc-recebe-folha-e-nao-publica]]).
//
// 🚨 O CSV é RUBRICA A RUBRICA (uma linha por lançamento), não uma linha por servidor — daí o tamanho. Somar
// tudo dá número errado; o que salva é a coluna `TIPO_PAGAMENTO` (Vencimento/Desconto), que permite agregar
// certo. Mesma armadilha do Portal TP, onde a lista de rubricas incluía os próprios totais
// ([[pnigp-portaltp-epublica-folha]]).
//
// Colunas: ID_CONTRATO_RH · MATRICULA · NOME · CARGO · VALOR · REGIME_JURIDICO · LOTACAO · ANO · MES ·
//          DT_ADMISSAO · RUBRICA · SECRETARIA · TIPO_PAGAMENTO · PLANO · ID_SIMULACAO · DESCR_SIMULACAO
// Separador `;`, decimal vírgula, texto entre aspas.
//
// Uso: node scripts/ingest_folha_pelotas.mjs            (ANO/MES para fixar a competência)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const COD_IBGE = "4314407";           // Pelotas
const ANO = Number(process.env.ANO || new Date().getUTCFullYear());
const MES = process.env.MES ? Number(process.env.MES) : null;   // null = a competência mais cheia do arquivo

await q(`create table if not exists folha_servidores_pelotas (
  cod_ibge text, municipio text, uf text, competencia text,
  matricula text, nome text, cargo text, regime text, lotacao text, secretaria text, plano text,
  admissao text, bruto numeric, descontos numeric, liquido numeric, rubricas int,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create index if not exists ix_folha_pelotas_comp on folha_servidores_pelotas (competencia)`);
await q(`create table if not exists folha_pelotas_coleta (
  ano int, competencia text, servidores int, linhas_csv int, situacao text, detalhe text,
  em timestamptz default now(), primary key (ano, competencia)
)`);

const money = (s) => {
  const t = String(s ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
};
// parser de linha CSV com aspas (o texto vem entre "), separador ;
function campos(linha) {
  const out = []; let cur = "", dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { dentro = !dentro; continue; }
    if (c === ";" && !dentro) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

const url = `https://storage01.pelotas.com.br/transparencia/downloads/servidores${ANO}.csv`;
console.log(`[pelotas] lendo em fluxo ${url}`);
// ⚠️ 134 MB no storage do município levam mais de 10 min: com timeout de 600 s a coleta morria no meio da
// leitura, depois de já ter processado 57 MB. O timeout tem de cobrir o ARQUIVO INTEIRO, não a média.
const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)" },
  signal: AbortSignal.timeout(Number(process.env.TIMEOUT_MS || 2700000)) });
if (!r.ok) { console.error(`HTTP ${r.status}`); process.exit(1); }

const reader = r.body.getReader();
// 🚨 O ENCODING SE DECIDE NO PRIMEIRO CHUNK, e o cabeçalho NÃO ajuda: `MATRICULA;NOME;CARGO` não tem acento
// nenhum. Forcei latin-1 e gravei "MÃ©dico"/"SaÃºde"/"EducaÃ§Ã£o" em 11.972 registros. O teste certo é
// decodificar como UTF-8 e procurar o caractere de substituição — se aparecer, aí sim é latin-1.
let dec = null;
const escolheEncoding = (chunk) => {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(chunk);
  return utf8.includes("�") ? new TextDecoder("iso-8859-1") : new TextDecoder("utf-8");
};
let resto = "", cab = null, iCol = {}, nLinhas = 0, nBytes = 0;
const porComp = new Map();      // "AAAAMM" → Map(chave → registro agregado)
const contComp = new Map();     // "AAAAMM" → nº de linhas

const processa = (linha) => {
  if (!linha.trim()) return;
  if (!cab) {
    cab = campos(linha).map((x) => x.trim().toUpperCase());
    cab.forEach((c, i) => { iCol[c] = i; });
    return;
  }
  const f = campos(linha);
  const ano = f[iCol.ANO], mes = f[iCol.MES];
  if (!ano || !mes) return;
  const comp = `${ano}${String(mes).padStart(2, "0")}`;
  contComp.set(comp, (contComp.get(comp) || 0) + 1);
  if (MES && Number(mes) !== MES) return;      // com MES fixo, só agrega a competência pedida
  let m = porComp.get(comp);
  if (!m) { m = new Map(); porComp.set(comp, m); }
  const chave = f[iCol.ID_CONTRATO_RH] || `${f[iCol.MATRICULA]}|${f[iCol.NOME]}`;
  let reg = m.get(chave);
  if (!reg) {
    reg = { matricula: f[iCol.MATRICULA], nome: (f[iCol.NOME] || "").trim(), cargo: (f[iCol.CARGO] || "").trim(),
            regime: (f[iCol.REGIME_JURIDICO] || "").trim(), lotacao: (f[iCol.LOTACAO] || "").trim(),
            secretaria: (f[iCol.SECRETARIA] || "").trim(), plano: (f[iCol.PLANO] || "").trim(),
            admissao: (f[iCol.DT_ADMISSAO] || "").slice(0, 10), bruto: 0, descontos: 0, rubricas: 0 };
    m.set(chave, reg);
  }
  // ⭐ a coluna TIPO_PAGAMENTO é o que permite agregar sem somar desconto como se fosse ganho
  const tipo = (f[iCol.TIPO_PAGAMENTO] || "").toLowerCase();
  const v = money(f[iCol.VALOR]);
  if (tipo.startsWith("desc")) reg.descontos += v; else reg.bruto += v;
  reg.rubricas++;
};

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  nBytes += value.length;
  if (!dec) { dec = escolheEncoding(value); console.log(`   encoding detectado: ${dec.encoding}`); }
  const txt = resto + dec.decode(value, { stream: true });
  const linhas = txt.split(/\r?\n/);
  resto = linhas.pop();
  for (const l of linhas) { processa(l); nLinhas++; }
  if (nLinhas % 200000 < 5000) process.stdout.write(`   ${(nBytes / 1048576).toFixed(0)} MB · ${nLinhas.toLocaleString("pt-BR")} linhas\r`);
}
if (resto) { processa(resto); nLinhas++; }
console.log(`\n[pelotas] ${nLinhas.toLocaleString("pt-BR")} linhas lidas · ${(nBytes / 1048576).toFixed(0)} MB`);

// a competência MAIS CHEIA ([[pnigp-competencia-mais-cheia-nao-a-recente]])
const ranking = [...contComp.entries()].sort((a, b) => b[1] - a[1]);
console.log("competências no arquivo (top 5):", ranking.slice(0, 5).map(([c, n]) => `${c}:${n.toLocaleString("pt-BR")}`).join(" · "));
const alvo = MES ? `${ANO}${String(MES).padStart(2, "0")}` : ranking[0][0];
const dados = porComp.get(alvo);
if (!dados || !dados.size) { console.error(`sem dados para ${alvo}`); process.exit(1); }

const regs = [...dados.values()].map((x) => ({
  ...x, cod_ibge: COD_IBGE, municipio: "Pelotas", uf: "RS", competencia: alvo,
  liquido: +(x.bruto - x.descontos).toFixed(2),
  bruto: +x.bruto.toFixed(2), descontos: +x.descontos.toFixed(2),
  _hash: crypto.createHash("md5").update([COD_IBGE, alvo, x.matricula, x.nome, x.cargo].join("|")).digest("hex"),
})).filter((x) => x.nome);

await q(`delete from folha_servidores_pelotas where competencia = $1`, [alvo]);
const LOTE = 1000;
for (let i = 0; i < regs.length; i += LOTE) {
  const p = regs.slice(i, i + LOTE);
  const c = (f) => p.map((x) => x[f]);
  await q(`insert into folha_servidores_pelotas
    (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,regime,lotacao,secretaria,plano,admissao,
     bruto,descontos,liquido,rubricas,_hash)
    select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
      $9::text[],$10::text[],$11::text[],$12::text[],$13::numeric[],$14::numeric[],$15::numeric[],$16::int[],$17::text[])
    on conflict (_hash) do update set bruto=excluded.bruto, descontos=excluded.descontos, _coletado_em=now()`,
    [c("cod_ibge"), c("municipio"), c("uf"), c("competencia"), c("matricula"), c("nome"), c("cargo"), c("regime"),
     c("lotacao"), c("secretaria"), c("plano"), c("admissao"), c("bruto"), c("descontos"), c("liquido"),
     c("rubricas"), c("_hash")]);
}
await q(`insert into folha_pelotas_coleta (ano,competencia,servidores,linhas_csv,situacao,detalhe,em)
  values ($1,$2,$3,$4,'ok',$5,now())
  on conflict (ano,competencia) do update set servidores=excluded.servidores, linhas_csv=excluded.linhas_csv,
    situacao='ok', detalhe=excluded.detalhe, em=now()`,
  [ANO, alvo, regs.length, nLinhas, `CSV ${(nBytes / 1048576).toFixed(0)} MB · agregado por TIPO_PAGAMENTO`]);
console.log(`[pelotas] ${regs.length.toLocaleString("pt-BR")} servidores na competência ${alvo}`);
await db.end();
