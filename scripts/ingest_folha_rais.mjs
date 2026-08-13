// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ingest_folha_rais.mjs — a camada NACIONAL do quadro de pessoal municipal: RAIS 2025 (PDET/MTE), 5.570 municípios.
//
// O QUE ELA RESPONDE do pedido: Município ✔ · Cargo (CBO 2002) ✔ · Função/regime (Tipo de Vínculo) ✔ · Salário ✔.
// O QUE ELA NÃO RESPONDE: SECRETARIA — o microdado é anônimo e não traz CNPJ nem nome do estabelecimento, então
// não há como saber em que órgão o vínculo está. Secretaria só existe na folha do Tribunal de Contas (SC hoje).
//
// COMO RODA: um .7z por região. Para cada um: extrai (py7zr) → varre o CSV linha a linha em latin-1 → guarda só
// a administração municipal → grava por COPY (o banco é o gargalo; nunca linha a linha) → apaga o extraído.
// Cada região é uma transação própria e o controle fica em `folha_rais_carga`, então dá para parar e retomar.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "fs";
import path from "path";
import readline from "readline";
import { execFileSync } from "child_process";
import { from as copyFrom } from "pg-copy-streams";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { pool } from "./_cadprev.mjs";
import { NAT_MUNICIPAL, NAT_CONSORCIO, TIPO_VINCULO, ESCOLARIDADE, partirLinha, detectaSep, num } from "./_rais.mjs";

const DIR = process.env.RAIS_DIR || "C:/Users/PC/AppData/Local/Temp/rais2025";
const ANO = Number(process.env.RAIS_ANO || 2025);
const SO = process.env.SO || null;
const REGIOES = ["NI", "NORTE", "CENTRO_OESTE", "NORDESTE", "SUL", "MG_ES_RJ", "SP"];

// tamanho publicado no FTP em 2025 — é o gabarito de integridade do download
const TAMANHOS = {
  NI: 209311, NORTE: 211992734, CENTRO_OESTE: 354015896, NORDESTE: 639823548,
  SUL: 704888712, MG_ES_RJ: 766814132, SP: 1107305918,
};

const db = pool();

await db.query(`create table if not exists folha_rais_municipal (
  id             bigserial primary key,
  ano            int not null,
  regiao_arquivo text,
  cod_ibge6      text,
  cod_ibge6_trab text,
  natureza_cod   text,
  natureza_desc  text,
  esfera_grupo   text,          -- 'municipal' | 'consorcio'
  cbo            text,          -- cargo/ocupação
  tipo_vinculo   text,
  tipo_vinculo_desc text,
  categoria      text,
  ativo_3112     boolean,
  escolaridade   text,
  sexo           text,
  idade          int,
  horas_contrato numeric,
  tempo_emprego  numeric,
  rem_media      numeric,       -- salário: remuneração média nominal do ano
  rem_dezembro   numeric
)`);
await db.query(`create table if not exists folha_rais_carga (
  ano int, regiao text, linhas_lidas bigint, linhas_gravadas bigint, terminado_em timestamptz,
  primary key (ano, regiao)
)`);
await db.query(`create table if not exists folha_rais_natureza (
  ano int, regiao text, natureza_cod text, linhas bigint, primary key (ano, regiao, natureza_cod)
)`);

const IDX = (cols, alvo) => {
  const i = cols.findIndex((c) => c.replace(/\s+/g, " ").toLowerCase() === alvo.toLowerCase());
  if (i < 0) throw new Error(`coluna não encontrada: ${alvo}`);
  return i;
};

for (const regiao of REGIOES) {
  if (SO && regiao !== SO) continue;
  const feito = await db.query(`select 1 from folha_rais_carga where ano=$1 and regiao=$2`, [ANO, regiao]);
  if (feito.rowCount) { console.log(`· ${regiao} já carregado`); continue; }

  const z = path.join(DIR, `RAIS_VINC_PUB_${regiao}.7z`);
  if (!fs.existsSync(z)) { console.log(`· ${regiao} sem arquivo (${z})`); continue; }

  // ⚠️ O ARQUIVO EXISTIR NÃO SIGNIFICA QUE ESTÁ ÍNTEIRO. Um `curl -C -` retomado sobre um download que foi
  // morto no meio produz um .7z MAIOR que o original (o NORTE veio com 12,8 MB a mais) e o erro só aparece
  // lá na frente, como "LZMAError: Corrupt input data". O tamanho do FTP é o gabarito e é conferido ANTES
  // de gastar meia hora extraindo ([[pnigp-cache-que-congela-o-erro]]).
  const esperado = TAMANHOS[regiao];
  const real = fs.statSync(z).size;
  if (esperado && real !== esperado) {
    console.log(`✖ ${regiao} INCOMPLETO/CORROMPIDO: ${real} bytes, esperado ${esperado} — baixar de novo (sem -C -)`);
    continue;
  }

  const destino = path.join(DIR, `x_${regiao}`);
  fs.rmSync(destino, { recursive: true, force: true });
  console.log(`\n[${regiao}] extraindo…`);
  execFileSync("python", ["-c",
    `import py7zr,sys\nwith py7zr.SevenZipFile(sys.argv[1],'r') as f: f.extractall(sys.argv[2])`,
    z, destino], { stdio: "inherit" });
  const csv = fs.readdirSync(destino).map((f) => path.join(destino, f))[0];
  const tam = fs.statSync(csv).size;
  console.log(`[${regiao}] ${path.basename(csv)} · ${(tam / 1e9).toFixed(2)} GB`);

  // varredura
  const rl = readline.createInterface({ input: fs.createReadStream(csv, { encoding: "latin1" }), crlfDelay: Infinity });
  let cols = null, sep = ",", i = {}, lidas = 0, guardadas = 0;
  const porNatureza = new Map();
  const buf = [];
  const escapa = (v) => (v == null ? "\\N" : String(v).replace(/\\/g, "\\\\").replace(/\t/g, " ").replace(/\n/g, " "));

  async function descarrega() {
    if (!buf.length) return;
    const cliente = await db.connect();
    try {
      const fluxo = cliente.query(copyFrom(`copy folha_rais_municipal
        (ano,regiao_arquivo,cod_ibge6,cod_ibge6_trab,natureza_cod,natureza_desc,esfera_grupo,cbo,tipo_vinculo,
         tipo_vinculo_desc,categoria,ativo_3112,escolaridade,sexo,idade,horas_contrato,tempo_emprego,rem_media,rem_dezembro)
        from stdin`));
      await pipeline(Readable.from(buf.splice(0, buf.length)), fluxo);
    } finally { cliente.release(); }
  }

  for await (const linha of rl) {
    if (!cols) {
      sep = detectaSep(linha);
      cols = partirLinha(linha, sep);
      i = {
        mun: IDX(cols, "Município - Código"), munTrab: IDX(cols, "Município Trab - Código"),
        nat: IDX(cols, "Natureza Jurídica - Código"), cbo: IDX(cols, "CBO 2002 Ocupação - Código"),
        tipo: IDX(cols, "Tipo Vínculo - Código"), cat: IDX(cols, "Categoria Trabalhador - Código"),
        ativo: IDX(cols, "Ind Vínculo Ativo 31/12 - Código"), esc: IDX(cols, "Escolaridade Após 2005 - Código"),
        sexo: IDX(cols, "Sexo - Código"), idade: IDX(cols, "Idade"), horas: IDX(cols, "Qtd Hora Contr"),
        tempo: IDX(cols, "Tempo Emprego"), remMed: IDX(cols, "Vl Rem Média Nom"), remDez: IDX(cols, "Vl Rem Dezembro Nom"),
      };
      continue;
    }
    lidas++;
    const c = partirLinha(linha, sep);
    const nat = c[i.nat];
    porNatureza.set(nat, (porNatureza.get(nat) || 0) + 1);
    const grupo = NAT_MUNICIPAL[nat] ? "municipal" : NAT_CONSORCIO[nat] ? "consorcio" : null;
    if (!grupo) continue;
    const tipo = c[i.tipo];
    buf.push([
      ANO, regiao, c[i.mun], c[i.munTrab], nat, NAT_MUNICIPAL[nat] || NAT_CONSORCIO[nat], grupo,
      c[i.cbo], tipo, TIPO_VINCULO[tipo] || null, c[i.cat],
      c[i.ativo] === "1" ? "t" : "f", ESCOLARIDADE[c[i.esc]] || c[i.esc], c[i.sexo],
      num(c[i.idade]), num(c[i.horas]), num(c[i.tempo]), num(c[i.remMed]), num(c[i.remDez]),
    ].map(escapa).join("\t") + "\n");
    guardadas++;
    if (buf.length >= 20000) await descarrega();
    if (lidas % 2_000_000 === 0) process.stdout.write(`   ${(lidas / 1e6).toFixed(0)} mi lidas · ${guardadas.toLocaleString("pt-BR")} municipais\r`);
  }
  await descarrega();

  const natRows = [...porNatureza.entries()];
  for (let k = 0; k < natRows.length; k += 500) {
    const p = natRows.slice(k, k + 500);
    await db.query(`insert into folha_rais_natureza (ano,regiao,natureza_cod,linhas)
      select $1,$2,* from unnest($3::text[],$4::bigint[])
      on conflict (ano,regiao,natureza_cod) do update set linhas=excluded.linhas`,
      [ANO, regiao, p.map((x) => x[0]), p.map((x) => x[1])]);
  }
  await db.query(`insert into folha_rais_carga values ($1,$2,$3,$4,now())
    on conflict (ano,regiao) do update set linhas_lidas=excluded.linhas_lidas,
      linhas_gravadas=excluded.linhas_gravadas, terminado_em=now()`, [ANO, regiao, lidas, guardadas]);
  console.log(`[${regiao}] ${lidas.toLocaleString("pt-BR")} vínculos lidos · ${guardadas.toLocaleString("pt-BR")} municipais gravados`);
  fs.rmSync(destino, { recursive: true, force: true });
}

await db.end();
console.log("\nRAIS concluída.");
