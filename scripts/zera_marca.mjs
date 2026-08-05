// ZERA A CONSTRUÇÃO DE MARCA E MODELO, para reconstruir com a extração roteada por portal.
//
// POR QUE. Medido em 05/ago/2026: das 246.720 linhas de item_marca_sc, 36.322 têm UNIDADE DE MEDIDA no campo
// da marca (KG, UNIDADE, UNID, MÊS...) e 2.215 têm VALOR MONETÁRIO — 15,6% de erro comprovável por lista
// fechada, e o erro real é maior. A causa é conhecida: os extratores liam o texto achatado do PDF, onde a
// tabela perdeu as colunas, e recortavam campo por heurística. As "marcas" mais frequentes da base inteira
// eram KG (185 municípios), UNIDADE (166) e DE (163) — o defeito é sistemático, não pontual.
//
// O QUE NÃO SE TOCA: arquivo_texto_sc. São 627 mil documentos com texto extraído — o ativo caro. Toda a
// marca sai deles, então apagar derivada é reversível por reprocessamento; apagar o texto não seria.
//
// OS MARCADORES VÃO JUNTO, e isto é o que mais se esquece: sem zerar `*_feitas` e `parser_versao`, os
// extratores consideram tudo já processado e a base fica vazia para sempre.
//
//   node scripts/zera_marca.mjs             → só mostra o que faria
//   APLICAR=1 node scripts/zera_marca.mjs   → grava o snapshot e apaga
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import pg from "pg";
import { dataBR } from "./hora_br.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const U = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const APLICAR = process.env.APLICAR === "1";
const db = new pg.Pool({ connectionString: U, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 900000 });

// NOMEADAS, uma a uma. Nada de wildcard: o que não está nesta lista não é tocado.
const DADOS = ["item_marca_sc", "app.item_marca_padrao_sc", "app.item_marca_visao_sc",
               "app.item_marca_conferida_sc", "propostas_sc", "lances_sc", "contratacao_disputa_sc"];
const MARCADORES = ["marca_ata_feitas", "app.marca_rota_feitas", "app.marca_padrao_feitas_sc",
                    "app.marca_tpl_feitas", "app.acervo_portais_feitas_sc", "app.pcp_feitas_sc"];

const conta = async (t) => { try { return Number((await db.query(`SELECT count(*) n FROM ${t}`)).rows[0].n); } catch { return null; } };

console.log("=== DADOS a apagar ===");
const antesD = {};
for (const t of DADOS) { antesD[t] = await conta(t); console.log(`  ${t.padEnd(32)} ${antesD[t] === null ? "(não existe)" : antesD[t].toLocaleString("pt-BR")}`); }
console.log("\n=== MARCADORES de 'já feito' a zerar (sem isto nada reprocessa) ===");
const antesM = {};
for (const t of MARCADORES) { antesM[t] = await conta(t); console.log(`  ${t.padEnd(32)} ${antesM[t] === null ? "(não existe)" : antesM[t].toLocaleString("pt-BR")}`); }
const { rows: [pv] } = await db.query(`SELECT count(*) n FROM arquivo_texto_sc WHERE parser_versao IS NOT NULL`);
console.log(`  arquivo_texto_sc.parser_versao   ${Number(pv.n).toLocaleString("pt-BR")} documentos carimbados → volta a NULL`);
console.log("\n=== NÃO SE TOCA ===");
console.log(`  arquivo_texto_sc (o texto dos documentos): ${(await conta("arquivo_texto_sc")).toLocaleString("pt-BR")} linhas`);

if (!APLICAR) { console.log("\n(simulação — rode com APLICAR=1)"); await db.end(); process.exit(0); }

const sufixo = dataBR().replace(/-/g, "");
console.log(`\n— snapshot em _bkp_${sufixo} —`);
for (const t of DADOS) {
  if (antesD[t] == null || antesD[t] === 0) continue;
  const alvo = `bkp_${t.replace(/^app\./, "app_")}_${sufixo}`;
  await db.query(`DROP TABLE IF EXISTS ${alvo}`);
  await db.query(`CREATE TABLE ${alvo} AS SELECT * FROM ${t}`);
  console.log(`  ${alvo} ← ${antesD[t].toLocaleString("pt-BR")} linhas`);
}
console.log("\n— apagando —");
for (const t of DADOS) { if (antesD[t] == null) continue; await db.query(`TRUNCATE TABLE ${t}`); console.log(`  ${t} zerada`); }
for (const t of MARCADORES) { if (antesM[t] == null) continue; await db.query(`TRUNCATE TABLE ${t}`); console.log(`  ${t} zerada`); }
const r = await db.query(`UPDATE arquivo_texto_sc SET parser_versao=NULL WHERE parser_versao IS NOT NULL`);
console.log(`  parser_versao devolvido a NULL em ${r.rowCount.toLocaleString("pt-BR")} documentos`);

console.log("\n— depois —");
for (const t of [...DADOS, ...MARCADORES]) { const n = await conta(t); if (n !== null) console.log(`  ${t.padEnd(32)} ${n}`); }
console.log(`  arquivo_texto_sc (intacto): ${(await conta("arquivo_texto_sc")).toLocaleString("pt-BR")}`);
await db.end();
