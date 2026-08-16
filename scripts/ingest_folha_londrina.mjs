// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_londrina.mjs — folha nominal de LONDRINA/PR (2º maior município do estado, 10.899 vínculos na RAIS).
//
// ⭐ O portal de Londrina é `equiplano.cloud` (SPA Angular) e NÃO tem a tela de servidores do Equiplano clássico:
// o item "PESSOAL → Relação de Servidores Estatutários" é um relatório PERSONALIZADO cujo conteúdo é uma lista de
// LINKS para arquivos no repositório do município — HTML e CSV, um por mês. Ou seja: a folha existe em CSV aberto,
// e nenhuma engenharia de SPA é necessária. O caminho até descobrir isso:
//   api.equiplano.cloud/transparencia/acao/{uuid}/pagina  →  campo `conteudo` (HTML) com os links do repositório.
// 🚨 A API do api.equiplano.cloud exige os headers do app (`x-entity-uuid`, `x-client-uuid`, `x-county-client-uuid`,
//    `x-encryption/permission/is-logged/validate`) — sem eles devolve 500 "Município não encontrado".
//
// CSV: latin1, `;`, colunas Unidade;Matrícula;Nome;Cargo;Função;Local de Trabalho;Situação;Jornada Semanal;
//      Data de Admissão;Data de Saída;Remuneração Bruta;Remuneração Líquida.
//
// Uso: node scripts/ingest_folha_londrina.mjs   (MESES=3 para trazer mais competências)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import crypto from "crypto";
import { pool, withRetry } from "./_cadprev.mjs";

const db = pool();
const q = withRetry(db);
const COD_IBGE = "4113700", MUNICIPIO = "Londrina", UF = "PR";
const MESES = Number(process.env.MESES || 1);
const PAGINA_UUID = process.env.PAGINA_UUID || "37feb01b-ad9b-467c-a81f-9f2ab82c5e1f";
const HDR = {
  accept: "application/json",
  "x-entity-uuid": "4022c7b8-a703-4770-b79c-308557e11355",
  "x-client-uuid": "dc9f79bf-9d0a-4376-a2fb-f5fa2639dc5d",
  "x-county-client-uuid": "bf351779-6b6c-44d0-82f2-2cf228daa7c2",
  "x-encryption": "false", "x-permission": "false", "x-is-logged": "false", "x-validate": "false",
  origin: "https://portal-prefeitura-londrina.equiplano.cloud",
  referer: "https://portal-prefeitura-londrina.equiplano.cloud/",
  "user-agent": "Mozilla/5.0 (compatible; PNIGP/1.0; pesquisa de dados publicos)",
};

await q(`create table if not exists folha_servidores_capital (
  cod_ibge text, municipio text, uf text, competencia text, matricula text, nome text, cargo text,
  secretaria text, lotacao text, vinculo text, bruto numeric, descontos numeric, liquido numeric, fonte text,
  _hash text primary key, _coletado_em timestamptz default now()
)`);
await q(`create table if not exists folha_capital_coleta (
  cod_ibge text, municipio text, uf text, competencia text, linhas int, situacao text, detalhe text,
  em timestamptz default now()
)`);

// 1) a página do relatório personalizado, que lista os arquivos por mês
const j = await (await fetch(`https://api.equiplano.cloud/transparencia/acao/${PAGINA_UUID}/pagina`,
  { headers: HDR, signal: AbortSignal.timeout(60000) })).json();
const html = j?.dados?.conteudo;
if (!html) { console.log("[londrina] página sem conteúdo — o uuid do relatório mudou?"); await db.end(); process.exit(1); }

// 2) os links, na ordem em que aparecem (mais recente primeiro). Cada mês tem HTML e CSV; o CSV é o 2º.
const MES = { janeiro: "01", fevereiro: "02", "março": "03", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12" };
const blocos = [...html.matchAll(/Relação de (?:Servidores )?Estatutários[^<]*?[-–]\s*([A-Za-zç]+)\/(\d{4})([\s\S]{0,600}?)(?=Relação de|$)/gi)];
const alvos = [];
for (const b of blocos) {
  const comp = `${b[2]}${MES[b[1].toLowerCase()] || "00"}`;
  const links = [...b[3].matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  if (links.length) alvos.push({ comp, csv: links[links.length - 1] });   // o último rótulo do bloco é o CSV
  if (alvos.length >= MESES) break;
}
console.log(`[londrina] ${alvos.length} competências: ${alvos.map((a) => a.comp).join(", ")}`);

const money = (s) => { const t = String(s ?? "").replace(/R\$|\s|\./g, "").replace(",", "."); const n = +t; return Number.isFinite(n) ? n : null; };
let totalGeral = 0;
for (const a of alvos) {
  const r = await fetch(a.csv, { redirect: "follow", signal: AbortSignal.timeout(180000) });
  const buf = Buffer.from(await r.arrayBuffer());
  const txt = new TextDecoder("latin1").decode(buf);          // 🚨 o arquivo é ISO-8859-1, não UTF-8
  const linhas = txt.split(/\r?\n/).filter((l) => l.trim());
  const cab = linhas[0].split(";").map((c) => c.trim().toLowerCase());
  const ix = (re) => cab.findIndex((c) => re.test(c));
  const col = { unidade: ix(/unidade/), matricula: ix(/matr/), nome: ix(/nome/), cargo: ix(/cargo/),
    funcao: ix(/fun[çc]/), local: ix(/local/), situacao: ix(/situa/), bruto: ix(/bruta/), liquido: ix(/l[íi]quida/) };
  if (col.nome < 0) { console.log(`  ✖ ${a.comp}: cabeçalho inesperado (${cab.join("|")})`); continue; }
  const regs = [];
  for (const l of linhas.slice(1)) {
    const c = l.split(";");
    const nome = (c[col.nome] || "").trim();
    if (!nome) continue;
    regs.push({
      cod_ibge: COD_IBGE, municipio: MUNICIPIO, uf: UF, competencia: a.comp,
      matricula: (c[col.matricula] || "").trim(), nome, cargo: (c[col.cargo] || "").trim(),
      // ⚠️ "Unidade" é a entidade (ACESF, CMTU, PML…) e "Local de Trabalho" é a lotação de fato — a secretaria útil
      secretaria: (c[col.local] || "").trim() || (c[col.unidade] || "").trim(),
      lotacao: (c[col.unidade] || "").trim(), vinculo: (c[col.situacao] || "").trim(),
      bruto: money(c[col.bruto]), descontos: null, liquido: money(c[col.liquido]), fonte: "londrina-csv",
      _hash: crypto.createHash("md5").update([COD_IBGE, a.comp, c[col.matricula], nome, c[col.cargo]].join("¦")).digest("hex"),
    });
  }
  const m = new Map(); for (const x of regs) m.set(x._hash, x);
  const arr = [...m.values()];
  for (let i = 0; i < arr.length; i += 1000) {
    const p = arr.slice(i, i + 1000); const cc = (f) => p.map((x) => x[f]);
    await q(`insert into folha_servidores_capital
      (cod_ibge,municipio,uf,competencia,matricula,nome,cargo,secretaria,lotacao,vinculo,bruto,descontos,liquido,fonte,_hash)
      select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],
        $9::text[],$10::text[],$11::numeric[],$12::numeric[],$13::numeric[],$14::text[],$15::text[])
      on conflict (_hash) do update set liquido=excluded.liquido, _coletado_em=now()`,
      [cc("cod_ibge"), cc("municipio"), cc("uf"), cc("competencia"), cc("matricula"), cc("nome"), cc("cargo"),
       cc("secretaria"), cc("lotacao"), cc("vinculo"), cc("bruto"), cc("descontos"), cc("liquido"), cc("fonte"), cc("_hash")]);
  }
  await q(`insert into folha_capital_coleta (cod_ibge,municipio,uf,competencia,linhas,situacao,detalhe,em)
    values ($1,$2,$3,$4,$5,'ok','CSV do repositório municipal',now())`, [COD_IBGE, MUNICIPIO, UF, a.comp, arr.length]);
  totalGeral += arr.length;
  console.log(`  ${a.comp}: ${arr.length} servidores`);
}
console.log(`\n[londrina] ${totalGeral.toLocaleString("pt-BR")} servidores`);
await db.end();
