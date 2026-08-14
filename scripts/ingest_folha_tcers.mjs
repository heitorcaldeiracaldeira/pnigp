// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_tcers.mjs — despesa de PESSOAL dos 497 municípios do RIO GRANDE DO SUL, pelo empenho (TCE-RS CKAN).
//
// POR QUE PELO EMPENHO: o TCE-RS não publica folha de pessoal — o acervo tem 16 grupos e nenhum é Pessoal, e os
// 351 datasets que casam com "servidor" são balancetes dos INSTITUTOS DE PREVIDÊNCIA dos servidores, não quadro
// funcional. O que existe é a despesa orçamentária empenho a empenho, e ela traz o campo que quase ninguém dá
// pronto: `nome_orgao_orcamentario` — A SECRETARIA, já normalizada pelo próprio tribunal.
//
// ⚠️ E O NOMINAL É UMA FATIA PEQUENA, não a folha. Parece muito à primeira vista — 21,3% dos empenhos de
// vencimentos são pessoa física com CPF — mas depois de exigir valor mensal plausível sobram ~12 mil pessoas
// (2026 parcial), longe dos ~400 mil servidores do estado. Serve para amostra e para conferir um caso, NUNCA
// como quadro de pessoal. O que este coletor entrega de verdade e completo é a FOLHA POR SECRETARIA.
//
// GRÃO: agrega as operações do mesmo empenho (E/L/P vêm em linhas separadas) por
// município × secretaria × unidade × elemento × rubrica × credor × mês. Sem isso são dezenas de milhões de linhas
// para a mesma informação. Grava por COPY ([[feedback-banco-e-o-gargalo]]).
//
// O QUE ENTREGA do pedido: Município ✔ · Secretaria ✔ (declarada pela fonte, já normalizada) · Salário ✔ como
// DESPESA DA SECRETARIA · Nome ~ (fatia nominal) · Cargo ✖ e Função ✖ — o empenho não tem cargo, e a rubrica só
// diz o tipo da despesa (vencimentos, proventos, gratificação), não o posto de quem recebe.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import zlib from "zlib";
import readline from "readline";
import { from as copyFrom } from "pg-copy-streams";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { pool } from "./_cadprev.mjs";

const DIR = process.env.RS_DIR || "C:/Users/PC/AppData/Local/Temp/rais2025";
const ANO = process.env.ANO || "2025";
const ARQ = `${DIR}/rs_emp${ANO}.zip`;
// categoria econômica 3.1 = Pessoal e Encargos Sociais. É o filtro que separa folha de todo o resto do orçamento.
const PREFIXO = process.env.ELEMENTO || "3.1";

const db = pool();

await db.query(`create table if not exists folha_empenho_rs (
  ano            text,
  mes            int,
  ente           text,      -- "PM DE AGUDO" / câmara / autarquia
  secretaria     text,      -- nome_orgao_orcamentario, declarado pela fonte
  unidade        text,
  elemento       text,
  rubrica        text,
  credor         text,
  cpf_cnpj       text,
  tp_pessoa      text,
  nominal        boolean,   -- pessoa física com nome de servidor × folha em bloco
  vl_empenho     numeric,
  vl_liquidacao  numeric,
  vl_pagamento   numeric,
  linhas_origem  int,
  primary key (ano, mes, ente, secretaria, unidade, elemento, rubrica, credor, cpf_cnpj)
)`);
await db.query(`create index if not exists ix_folha_rs_ente on folha_empenho_rs (ente, ano)`);
await db.query(`create index if not exists ix_folha_rs_nom on folha_empenho_rs (nominal) where nominal`);

if (!fs.existsSync(ARQ)) { console.log(`sem arquivo: ${ARQ}`); process.exit(1); }
const tam = fs.statSync(ARQ).size;
console.log(`[RS ${ANO}] ${(tam / 1e9).toFixed(2)} GB`);

// O .zip tem um único CSV; lê-se o cabeçalho local e descomprime em fluxo (deflate cru), sem extrair para disco.
const cabecalho = Buffer.alloc(30);
const fd = fs.openSync(ARQ, "r");
fs.readSync(fd, cabecalho, 0, 30, 0);
const nomeLen = cabecalho.readUInt16LE(26), extraLen = cabecalho.readUInt16LE(28);
fs.closeSync(fd);
const inicio = 30 + nomeLen + extraLen;

const fluxo = fs.createReadStream(ARQ, { start: inicio }).pipe(zlib.createInflateRaw());
const rl = readline.createInterface({ input: fluxo, crlfDelay: Infinity });

// CSV com vírgula e aspas — os campos de histórico têm vírgula dentro
function partir(linha) {
  const out = []; let campo = "", dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { dentro = !dentro; continue; }
    if (c === "," && !dentro) { out.push(campo); campo = ""; continue; }
    campo += c;
  }
  out.push(campo);
  return out;
}
const num = (v) => { const n = parseFloat(String(v || "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

// Nome de servidor × rótulo de folha coletiva. O tribunal não marca isso: PF com CPF é a prova positiva, e os
// rótulos coletivos aparecem como PJ sem CNPJ ("FOLHA DE PAGAMENTO", "DIVERSOS FUNCIONARIOS").
const COLETIVO = /FOLHA|DIVERSOS|SERVIDORES|PESSOAL|FUNCIONARIOS|MUNICIPIO DE|PREFEITURA|C[ÂA]MARA|SECRETARIA|RPPS|PREVID|INSS|PROVENTOS|APOSENT|PENSION|ESTAGI[ÁA]RIOS|VEREADORES/i;

// ⚠️ SER PESSOA FÍSICA NÃO PROVA QUE O VALOR É O SALÁRIO DAQUELA PESSOA. Boa parte dos municípios emite o
// empenho GLOBAL da folha em nome de um servidor — o responsável, não o beneficiário. Medido em 2026:
// 477 linhas acima de R$ 80 mil/mês concentram R$ 263 milhões em 113 "pessoas" (uma delas com R$ 41 mi numa
// secretaria de educação), enquanto as 20.460 linhas na faixa de salário somam R$ 104 mi com mediana R$ 2.174.
// Por isso a marcação exige TAMBÉM valor mensal plausível — sem isso, qualquer soma "por servidor" fica errada.
const SALARIO_MIN = 300, SALARIO_MAX = 80000;

let I = null, lidas = 0, pegas = 0;
const agg = new Map();

for await (const linha of rl) {
  if (!I) {
    const cab = partir(linha.replace(/^\ufeff/, ""));
    I = Object.fromEntries(cab.map((c, i) => [c.trim(), i]));
    continue;
  }
  lidas++;
  if (lidas % 2_000_000 === 0) process.stdout.write(`   ${(lidas / 1e6).toFixed(0)} mi lidas · ${agg.size.toLocaleString("pt-BR")} chaves\r`);
  const c = partir(linha);
  if (c.length < 40) continue;
  const elemento = c[I["cd_elemento"]] || "";
  if (!elemento.startsWith(PREFIXO)) continue;
  pegas++;

  // ⚠️ NÃO usar `mes_recebimento`/`ano_recebimento`: é quando o TRIBUNAL recebeu a remessa, não quando o fato
  // aconteceu — no arquivo de 2025 ele vale "12" em TODAS as 2,4 milhões de linhas. Quem data o fato é
  // `dt_operacao` (o evento: empenho, liquidação ou pagamento), que distribui certinho pelos 12 meses.
  // Isso não é detalhe de rótulo: com tudo caindo num mês só, a soma por linha virava o ANO inteiro e o teste de
  // "salário plausível" descartava como folha global quem ganha mais de ~R$ 6,7 mil/mês.
  const dataOp = c[I["dt_operacao"]] || c[I["dt_empenho"]] || "";
  const anoOp = dataOp.slice(0, 4) || ANO;
  const mes = parseInt(dataOp.slice(5, 7), 10) || 0;
  const ente = c[I["nome_orgao"]] || "";
  const secretaria = c[I["nome_orgao_orcamentario"]] || "";
  const unidade = c[I["nome_unidade_orcamentaria"]] || "";
  const rubrica = c[I["ds_rubrica"]] || "";
  const credor = (c[I["nm_credor"]] || "").trim();
  const cpf = (c[I["cnpj_cpf"]] || "").trim();
  const tp = (c[I["tp_pessoa"]] || "").trim();
  const pf = tp === "PF" && !!cpf && !COLETIVO.test(credor);

  // o arquivo de um exercicio carrega operacoes de nov/dez do ano anterior - o ano vem do FATO
  const k = [anoOp, mes, ente, secretaria, unidade, elemento, rubrica, credor, cpf].join("\u0001");
  const a = agg.get(k);
  if (a) {
    a.e += num(c[I["vl_empenho"]]); a.l += num(c[I["vl_liquidacao"]]); a.p += num(c[I["vl_pagamento"]]); a.n++;
  } else {
    agg.set(k, { ano: anoOp, mes, ente, secretaria, unidade, elemento, rubrica, credor, cpf, tp, pf,
      e: num(c[I["vl_empenho"]]), l: num(c[I["vl_liquidacao"]]), p: num(c[I["vl_pagamento"]]), n: 1 });
  }
}
console.log(`\n[RS ${ANO}] ${lidas.toLocaleString("pt-BR")} linhas lidas · ${pegas.toLocaleString("pt-BR")} de pessoal (${PREFIXO}) · ${agg.size.toLocaleString("pt-BR")} chaves agregadas`);

const escapa = (v) => (v == null ? "\\N" : String(v).replace(/\\/g, "\\\\").replace(/\t/g, " ").replace(/\r?\n/g, " "));
const linhas = [];
let nominais = 0, globaisEmNome = 0;
for (const a of agg.values()) {
  // o valor do MÊS já está fechado aqui — só agora dá para separar salário de folha global emitida em nome de alguém
  const valor = a.p || a.e;
  const nominal = a.pf && valor >= SALARIO_MIN && valor <= SALARIO_MAX;
  if (nominal) nominais++; else if (a.pf && valor > SALARIO_MAX) globaisEmNome++;
  linhas.push([a.ano, a.mes, a.ente, a.secretaria, a.unidade, a.elemento, a.rubrica, a.credor, a.cpf, a.tp,
    nominal ? "t" : "f", a.e, a.l, a.p, a.n].map(escapa).join("\t") + "\n");
}
console.log(`   nominais (salário plausível): ${nominais.toLocaleString("pt-BR")} · PF com valor de folha global (descartados do nominal): ${globaisEmNome.toLocaleString("pt-BR")}`);

// COPY para tabela temporária e upsert de lá — a PK é composta e o COPY direto não resolve conflito
await db.query(`drop table if exists _rs_stage`);
await db.query(`create unlogged table _rs_stage (like folha_empenho_rs including defaults)`);
const cliente = await db.connect();
try {
  for (let i = 0; i < linhas.length; i += 200000) {
    const fatia = linhas.slice(i, i + 200000);
    const fl = cliente.query(copyFrom(`copy _rs_stage (ano,mes,ente,secretaria,unidade,elemento,rubrica,credor,
      cpf_cnpj,tp_pessoa,nominal,vl_empenho,vl_liquidacao,vl_pagamento,linhas_origem) from stdin`));
    await pipeline(Readable.from(fatia), fl);
    process.stdout.write(`   gravadas ${Math.min(i + 200000, linhas.length).toLocaleString("pt-BR")}/${linhas.length.toLocaleString("pt-BR")}\r`);
  }
} finally { cliente.release(); }

await db.query(`insert into folha_empenho_rs select * from _rs_stage
  on conflict (ano,mes,ente,secretaria,unidade,elemento,rubrica,credor,cpf_cnpj) do update set
    vl_empenho=excluded.vl_empenho, vl_liquidacao=excluded.vl_liquidacao,
    vl_pagamento=excluded.vl_pagamento, linhas_origem=excluded.linhas_origem`);
await db.query(`drop table _rs_stage`);

const r = await db.query(`select count(*) linhas, count(distinct ente) entes, count(distinct secretaria) secretarias,
    count(*) filter (where nominal) nominais, count(distinct credor) filter (where nominal) pessoas,
    round(sum(vl_pagamento)/1e6) pago_mi from folha_empenho_rs where ano=$1`, [ANO]);
console.log(`\n[RS ${ANO}]`, r.rows[0]);
await db.end();
